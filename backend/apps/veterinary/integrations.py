"""
What happens after a procedure is saved, according to Configurações › Recursos dos segmentos.

- Integração com o rebanho (``herd_integration``): when the client is linked to a farm of the
  organization, the procedure is also written to that farm's herd (matings, pregnancy diagnosis
  and reproductive status). Animals created this way carry ``data["source"] = "veterinary"``.
- Preço por cliente (``client_pricing``): client price table, IATF package and quantity discount.
- Financeiro (``finance``): each charged procedure mirrors a revenue transaction ``VETPROC-<id>``
  (paid → Recebido; unpaid → Contas a receber, due in ``payment_days``).
- Insumos (always on): stock used in the procedure leaves the lot and becomes the area's cost.

``finalize`` is idempotent: running it twice for the same procedure changes nothing.
"""
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as translate_message
from rest_framework.exceptions import ValidationError

from apps.organizations import segment_features as features

from . import selectors
from .models import (
    Category,
    VeterinaryClientPrice,
    VeterinaryProcedure,
    VeterinaryProcedureInput,
    VeterinarySettings,
    VeterinaryTeamMember,
)

Kind = VeterinaryProcedure.Kind
Result = VeterinaryProcedure.Result
FINANCE_PREFIX = "VETPROC-"
FINANCE_CATEGORY = "Atendimentos veterinários"
INPUT_CATEGORIES = {"semen", "medicamento", "vacina", "medicamento_vacina", "material", "outro"}
CENT = Decimal("0.01")


def on(organization, feature):
    return features.enabled(organization, features.VETERINARY, feature)


def fail(message, field="detail"):
    raise ValidationError({field: translate_message(message)})


# ---- Team (logins) -----------------------------------------------------------------------

def team_users(organization):
    """Users who may be chosen as responsible: the area team, or every admin/manager/vet."""
    from apps.accounts.models import User

    from .access import veterinary_members_q

    return User.objects.filter(veterinary_members_q(), organization=organization, is_active=True).order_by("full_name", "email")


def responsible_for(organization, user_id):
    if not user_id:
        return None
    user = team_users(organization).filter(pk=user_id).first()
    if user is None:
        fail("Escolha um responsável da equipe.", "responsible_user")
    return user


def display_name(user):
    return (user.full_name or user.email).strip() if user else ""


def commission_percent(organization, user_id):
    if not user_id:
        return Decimal("0")
    member = VeterinaryTeamMember.objects.filter(organization=organization, user_id=user_id, active=True).first()
    return member.commission_percent if member else Decimal("0")


# ---- Client pricing ----------------------------------------------------------------------

def base_price(config, client, kind):
    override = VeterinaryClientPrice.objects.filter(client=client, kind=kind).first() if client else None
    return override.price if override else config.price(kind)


def apply_pricing(procedure):
    """Client price, IATF package and quantity discount (only for procedures with a price)."""
    organization = procedure.organization
    if not on(organization, features.CLIENT_PRICING) or procedure.not_done or "pricing" in procedure.data:
        return
    config = VeterinarySettings.objects.get(organization=organization)
    if procedure.value <= 0:
        return
    rule = "client"
    value = base_price(config, procedure.client, procedure.kind)
    if procedure.kind == Kind.INSEMINATION and procedure.step == "insemination" and config.price_iatf_package is not None:
        value, rule = config.price_iatf_package, "iatf_package"
    procedure.value = value
    procedure.data["pricing"] = {"rule": rule, "base": str(value)}
    procedure.save(update_fields=["value", "data", "updated_at"])
    apply_quantity_discount(procedure)


def apply_quantity_discount(procedure):
    """Once a visit (client + day) reaches the minimum of animals, every unpaid charged
    procedure of that visit gets the discount, including the ones saved before."""
    organization = procedure.organization
    config = VeterinarySettings.objects.get(organization=organization)
    if not config.discount_min_animals or config.discount_percent <= 0:
        return
    visit = VeterinaryProcedure.objects.filter(
        organization=organization, client=procedure.client, date=procedure.date, not_done=False, value__gt=0,
    )
    if visit.values("animal").distinct().count() < config.discount_min_animals:
        return
    factor = (Decimal("100") - config.discount_percent) / Decimal("100")
    for item in visit.filter(paid=False):
        pricing = item.data.get("pricing") or {}
        if pricing.get("discount"):
            continue
        base = Decimal(pricing.get("base") or item.value)
        item.value = (base * factor).quantize(CENT, rounding=ROUND_HALF_UP)
        item.data["pricing"] = {**pricing, "base": str(base), "discount": str(config.discount_percent)}
        item.save(update_fields=["value", "data", "updated_at"])
        sync_finance(item)


# ---- Inputs (stock) ----------------------------------------------------------------------

def available_lots(organization):
    from apps.inventory.models import LoteEstoque

    today = timezone.localdate()
    lots = LoteEstoque.objects.filter(
        item__organization=organization, item__ativo=True, ativo=True, quantidade_atual__gt=0, data_entrada__lte=today,
    ).select_related("item").order_by("item__nome", "data_validade")
    return [lot for lot in lots if {lot.item.categoria, *(lot.item.categorias or [])} & INPUT_CATEGORIES
            and not (lot.data_validade and lot.data_validade < today)]


@transaction.atomic
def consume_inputs(procedure, user, inputs):
    """inputs = [{"lot": uuid, "quantity": Decimal}]: one stock exit per lot."""
    from apps.inventory.choices import TipoMovimentacao
    from apps.inventory.models import LoteEstoque, MovimentacaoEstoque
    from apps.inventory.services import registrar_movimentacao

    created = []
    for row in inputs or []:
        quantity = Decimal(str(row.get("quantity") or 0))
        if quantity <= 0:
            fail("Informe a quantidade usada de cada insumo.", "inputs")
        lot = LoteEstoque.objects.select_for_update().select_related("item").filter(
            pk=row.get("lot"), item__organization=procedure.organization,
        ).first()
        if lot is None or not lot.ativo:
            fail("Lote de insumo não encontrado.", "inputs")
        if quantity > lot.quantidade_atual:
            fail(f"Saldo insuficiente no lote de {lot.item.nome}.", "inputs")
        marker = f"Área do veterinário {procedure.pk} · {lot.pk}"
        registrar_movimentacao(
            lot.item, lote=lot, tipo=TipoMovimentacao.CONSUMO, quantidade=quantity, responsavel=user,
            observacao=marker, destino="Área do veterinário", farm=procedure.client.farm,
        )
        movement = MovimentacaoEstoque.objects.filter(item=lot.item, lote=lot, observacao=marker).order_by("-created_at").first()
        unit = lot.custo_unitario
        created.append(VeterinaryProcedureInput.objects.create(
            organization=procedure.organization, procedure=procedure, lot=lot, item=lot.item, quantity=quantity,
            unit_cost=unit, total_cost=(quantity * unit).quantize(CENT) if unit is not None else Decimal("0"), movement=movement,
        ))
    return created


# ---- Finance -----------------------------------------------------------------------------

def sync_finance(procedure):
    """Create, update or remove the revenue mirror of one procedure. Mirrors the user
    cancelled in Financeiro are left untouched."""
    from apps.finance.models import FinancialCategory, Transaction

    organization = procedure.organization
    if not on(organization, features.FINANCE):
        return "skipped"
    reference = f"{FINANCE_PREFIX}{procedure.pk}"
    current = Transaction.objects.filter(organization=organization, reference=reference).first()
    if current and current.status == Transaction.Status.CANCELLED:
        return "skipped"
    if procedure.not_done or procedure.value <= 0:
        if current:
            current.delete()
            return "removed"
        return "unchanged"
    config = VeterinarySettings.objects.get(organization=organization)
    category, _ = FinancialCategory.objects.get_or_create(organization=organization, name=FINANCE_CATEGORY, category_type="revenue")
    paid = procedure.paid
    values = {
        "category": category, "amount": procedure.value, "farm": procedure.client.farm,
        "description": f"{procedure.get_kind_display()} · {procedure.animal.identifier} · {procedure.client.name}"[:500],
        "due_date": procedure.date if paid else procedure.date + timedelta(days=config.payment_days),
        "status": Transaction.Status.PAID if paid else Transaction.Status.PENDING,
        "payment_date": (current.payment_date if current and current.payment_date else timezone.localdate()) if paid else None,
    }
    if current is None:
        Transaction.objects.create(organization=organization, reference=reference, created_by=procedure.created_by, **values)
        return "created"
    changed = [name for name, value in values.items() if getattr(current, name if name != "category" else "category_id") != (value.pk if name == "category" else value)]
    if changed:
        for name, value in values.items():
            setattr(current, name, value)
        current.save()
        return "updated"
    return "unchanged"


def remove_finance(organization, procedure_ids):
    from apps.finance.models import Transaction

    Transaction.objects.filter(
        organization=organization, reference__in=[f"{FINANCE_PREFIX}{pk}" for pk in procedure_ids],
    ).exclude(status=Transaction.Status.CANCELLED).delete()


def resync_finance(organization):
    """Mirrors every procedure (old ones included). Used when the admin turns Financeiro on."""
    report = {"created": 0, "updated": 0, "unchanged": 0, "removed": 0, "skipped": 0}
    if not on(organization, features.FINANCE):
        return report
    for procedure in VeterinaryProcedure.objects.filter(organization=organization).select_related("client", "animal"):
        report[sync_finance(procedure)] += 1
    return report


# ---- Herd integration --------------------------------------------------------------------

HERD_CATEGORY = {Category.HEIFER: "Novilha", Category.OPEN_COW: "Vaca", Category.LACTATING_COW: "Vaca"}


def herd_animal(vet_animal, farm, user):
    """The herd animal of a vet animal: linked one, same tag on the farm, or a new one."""
    from apps.livestock.models import Animal, Species

    linked = vet_animal.data.get("herd_animal_id")
    animal = Animal.objects.filter(pk=linked, farm__organization=vet_animal.organization).first() if linked else None
    if animal is None:
        animal = Animal.objects.filter(farm=farm, identifier__iexact=vet_animal.identifier).first()
        if animal is not None:
            animal.data = {**animal.data, "veterinary": {"animal_id": str(vet_animal.pk), "linked_at": timezone.now().isoformat()}}
            animal.save(update_fields=["data", "updated_at"])
    if animal is None:
        species = Species.objects.filter(code="bovinos").first()
        if species is None:
            return None
        animal = Animal.objects.create(
            farm=farm, species=species, identifier=vet_animal.identifier, gender=Animal.Gender.FEMALE,
            category=HERD_CATEGORY.get(vet_animal.category, "Vaca"), cattle_purpose=vet_animal.client.data.get("herd_purpose", "unknown"),
            reproductive_status=Animal.ReproductiveStatus.VAZIA, entry_date=timezone.localdate(),
            notes=translate_message("Cadastrado pela Área do veterinário."),
            data={
                "source": "veterinary", "veterinary_animal_id": str(vet_animal.pk),
                "veterinary_client_id": str(vet_animal.client_id), "created_by": str(user.pk) if user else None,
                "created_at": timezone.now().isoformat(),
            },
        )
    if vet_animal.data.get("herd_animal_id") != str(animal.pk):
        vet_animal.data = {**vet_animal.data, "herd_animal_id": str(animal.pk)}
        vet_animal.save(update_fields=["data", "updated_at"])
    return animal


def sync_herd(procedure, user):
    from apps.livestock.models import Animal, HistoricoEvento, Mating, Pregnancy

    client = procedure.client
    if not on(procedure.organization, features.HERD) or not client.farm_id or "herd" in procedure.data or procedure.not_done:
        return None
    if procedure.kind not in (Kind.INSEMINATION, Kind.ULTRASOUND):
        return None
    animal = herd_animal(procedure.animal, client.farm, user)
    if animal is None:
        return None
    meta = {"source": "veterinary", "procedure_id": str(procedure.pk), "responsible_id": str(user.pk) if user else None}
    record = {"animal": str(animal.pk)}
    if procedure.kind == Kind.INSEMINATION:
        mating = Mating.objects.create(
            female=animal, sire_info=procedure.semen[:100], mating_date=procedure.date,
            mating_type=Mating.MatingType.IATF if procedure.step == "insemination" else Mating.MatingType.AI,
            expected_diagnosis_date=procedure.date + timedelta(days=30),
            expected_birth_date=procedure.date + timedelta(days=selectors.GESTATION_DAYS),
            notes=translate_message("Lançado pela Área do veterinário."),
        )
        animal.previous_phase = animal.reproductive_status
        animal.reproductive_status = Animal.ReproductiveStatus.COBERTA
        animal.save(update_fields=["previous_phase", "reproductive_status", "updated_at"])
        HistoricoEvento.objects.create(farm=animal.farm, matriz=animal, tipo_evento="Cobertura", data_evento=procedure.date,
            descricao=f"Tipo: {mating.get_mating_type_display()} | Reprodutor: {procedure.semen or '—'} | Área do veterinário",
            metadata={**meta, "mating_id": str(mating.pk)})
        record["mating"] = str(mating.pk)
    elif procedure.result == Result.PREGNANT:
        mating = animal.matings_as_female.filter(status=Mating.Status.PENDING_DG).order_by("-mating_date").first()
        if mating is None:
            natural = procedure.coverage_method == VeterinaryProcedure.CoverageMethod.NATURAL
            mating = Mating.objects.create(
                female=animal, sire_info=procedure.bull[:100], mating_date=procedure.coverage_date or procedure.date,
                mating_type=Mating.MatingType.NATURAL if natural else Mating.MatingType.IATF if procedure.origin_kind == "protocol" else Mating.MatingType.AI,
                notes=translate_message("Lançado pela Área do veterinário."),
            )
        mating.status = Mating.Status.CONFIRMED
        mating.expected_birth_date = procedure.calving_date or mating.expected_birth_date
        mating.save(update_fields=["status", "expected_birth_date", "updated_at"])
        if not Pregnancy.objects.filter(mating=mating).exists():
            Pregnancy.objects.create(female=animal, mating=mating, start_date=mating.mating_date,
                expected_birth_date=mating.expected_birth_date or procedure.date + timedelta(days=selectors.GESTATION_DAYS), status="ongoing")
        animal.reproductive_status = Animal.ReproductiveStatus.GESTANTE
        animal.save(update_fields=["reproductive_status", "updated_at"])
        HistoricoEvento.objects.create(farm=animal.farm, matriz=animal, tipo_evento="Diagnóstico de Gestação", data_evento=procedure.date,
            descricao="Resultado: POSITIVO — Gestação confirmada (Área do veterinário).", metadata={**meta, "mating_id": str(mating.pk), "resultado": "positive"})
        record["mating"] = str(mating.pk)
    else:
        failed = list(animal.matings_as_female.filter(status=Mating.Status.PENDING_DG).values_list("pk", flat=True))
        Mating.objects.filter(pk__in=failed).update(status=Mating.Status.FAILED, updated_at=timezone.now())
        protocol = procedure.conduct == VeterinaryProcedure.Conduct.IATF_PROTOCOL
        animal.reproductive_status = Animal.ReproductiveStatus.EM_PREPARO if protocol else Animal.ReproductiveStatus.VAZIA
        animal.previous_phase = ""
        animal.save(update_fields=["reproductive_status", "previous_phase", "updated_at"])
        HistoricoEvento.objects.create(farm=animal.farm, matriz=animal, tipo_evento="Diagnóstico de Gestação", data_evento=procedure.date,
            descricao="Resultado: NEGATIVO — vazia (Área do veterinário).", metadata={**meta, "resultado": "negative", "matings_failed": [str(pk) for pk in failed]})
        record["matings_failed"] = [str(pk) for pk in failed]
    procedure.data = {**procedure.data, "herd": record}
    procedure.save(update_fields=["data", "updated_at"])
    return record


# ---- Entry point -------------------------------------------------------------------------

@transaction.atomic
def finalize(procedure, user, *, inputs=None, responsible_user=None):
    if responsible_user is not None and procedure.responsible_user_id != responsible_user.pk:
        procedure.responsible_user = responsible_user
        procedure.responsible = procedure.responsible or display_name(responsible_user)
        procedure.save(update_fields=["responsible_user", "responsible", "updated_at"])
    if inputs:
        consume_inputs(procedure, user, inputs)
    apply_pricing(procedure)
    sync_herd(procedure, user)
    sync_finance(procedure)
    return procedure
