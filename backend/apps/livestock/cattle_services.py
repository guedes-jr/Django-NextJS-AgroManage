"""Cattle operations which must commit together."""

from django.db import transaction
from django.db.models import F
from rest_framework.exceptions import ValidationError

from .models import (
    Animal,
    AnimalBatch,
    Birth,
    CattleAnimalProfile,
    CattleGrazing,
    CattleManagement,
    CattleMilkRecord,
    CattlePasture,
    HealthRecord,
    HistoricoEvento,
    Pregnancy,
    WeightRecord,
)


def cattle_profile(animal):
    return CattleAnimalProfile.objects.get_or_create(
        animal=animal,
        defaults={
            "is_lactating": animal.gender == "F"
            and animal.reproductive_status == "lactante"
        },
    )[0]


def save_cattle_weight(animal, day, weight, notes=""):
    record = WeightRecord.objects.create(
        farm=animal.farm,
        species=animal.species,
        animal=animal,
        weighing_date=day,
        weight_kg=weight,
        notes=notes,
    )
    latest = animal.weights.order_by("-weighing_date", "-created_at").first()
    Animal.objects.filter(pk=animal.pk).update(current_weight_kg=latest.weight_kg)
    return record


@transaction.atomic
def confirm_cattle_management(management, user):
    from django.utils import timezone

    management = CattleManagement.objects.select_for_update().get(pk=management.pk)
    if management.status == "confirmed":
        return management  # A retried confirmation must never duplicate effects.
    if management.status != "draft":
        raise ValidationError("Este manejo não pode ser confirmado.")
    entries = list(management.entries.select_related("animal").order_by("animal_id"))
    if not entries:
        raise ValidationError("Inclua pelo menos um animal no manejo.")
    animals = {
        animal.pk: animal
        for animal in Animal.objects.select_for_update()
        .filter(pk__in=[entry.animal_id for entry in entries])
        .select_related("farm", "species")
        .order_by("pk")
    }
    from .cattle_stock_management import consume_management_stock
    consume_management_stock(management, user, len(entries))
    for entry in entries:
        animal = animals[entry.animal_id]
        if (
            animal.farm_id != management.farm_id
            or animal.species.code != "bovinos"
            or animal.status != "active"
            or (animal.entry_date and management.date < animal.entry_date)
        ):
            raise ValidationError(
                f"Revise o animal {animal.identifier}: fazenda, situação ou data incompatível."
            )
        if management.kind == "weighing":
            if not entry.weight_kg or entry.weight_kg <= 0:
                raise ValidationError(f"Informe o peso de {animal.identifier}.")
            save_cattle_weight(
                animal, management.date, entry.weight_kg, management.description
            )
        elif management.kind == "sanitary":
            if (
                management.milk_withdrawal_until
                and CattleMilkRecord.objects.filter(
                    animal=animal,
                    date__gte=management.date,
                    date__lte=management.milk_withdrawal_until,
                    discarded_liters__lt=F("liters"),
                ).exists()
            ):
                raise ValidationError(
                    f"Corrija as ordenhas aproveitadas de {animal.identifier} no período de carência antes de confirmar."
                )
            HealthRecord.objects.create(
                cattle_management=management,
                farm=animal.farm,
                animal=animal,
                application_date=management.date,
                treatment_type=management.treatment_type,
                description=management.description,
                veterinary=management.responsible,
                cost=management.cost_per_animal,
                notes=management.notes,
            )
        elif management.kind == "castration":
            record_cattle_event(
                animal,
                {
                    "kind": "castration",
                    "date": management.date,
                    "notes": management.description,
                },
            )
    management.status = "confirmed"
    management.confirmed_by = user
    management.confirmed_at = timezone.now()
    management.save(
        update_fields=["status", "confirmed_by", "confirmed_at", "updated_at"]
    )
    return management


@transaction.atomic
def record_cattle_birth(animal, data):
    animal = Animal.objects.select_for_update().get(pk=animal.pk)
    if (
        animal.gender != "F"
        or animal.status != "active"
        or animal.reproductive_status != "gestante"
    ):
        raise ValidationError(
            {"animal": "Selecione uma fêmea ativa com gestação confirmada."}
        )
    pregnancy = (
        Pregnancy.objects.filter(female=animal, status="ongoing")
        .order_by("-start_date")
        .first()
    )
    if not pregnancy or data["date"] < pregnancy.start_date:
        raise ValidationError({"date": "Não há gestação válida para esta data."})
    birth = Birth.objects.create(
        pregnancy=pregnancy,
        female=animal,
        birth_date=data["date"],
        live_born=1 if data["outcome"] == "alive" else 0,
        stillborn=1 if data["outcome"] == "stillborn" else 0,
        avg_weight_kg=data.get("weight_kg"),
        expected_weaning_days=180,
        notes=data.get("notes", ""),
    )
    profile = cattle_profile(animal)
    profile.is_lactating = True
    profile.save(update_fields=["is_lactating", "updated_at"])
    calf = None
    if data["outcome"] == "alive":
        identifier = data.get("calf_identifier", "").strip()
        if (
            not identifier
            or Animal.objects.filter(farm=animal.farm, identifier=identifier).exists()
        ):
            raise ValidationError(
                {"calf_identifier": "Informe um brinco novo e único nesta fazenda."}
            )
        calf = Animal.objects.create(
            farm=animal.farm,
            species=animal.species,
            breed=animal.breed,
            identifier=identifier,
            gender=data["calf_gender"],
            category="Bezerro",
            birth_date=data["date"],
            entry_date=data["date"],
            dam_ref=animal,
            sire_ref=pregnancy.mating.sire,
            sire_name=pregnancy.mating.sire_info,
            initial_weight_kg=data.get("weight_kg"),
            current_weight_kg=data.get("weight_kg"),
            reproductive_status="em_preparo",
            notes=data.get("notes", ""),
        )
    if calf and data.get("weight_kg"):
        WeightRecord.objects.create(
            farm=calf.farm,
            species=calf.species,
            animal=calf,
            weight_kg=data["weight_kg"],
            weighing_date=data["date"],
            notes="Peso ao nascer.",
        )
    HistoricoEvento.objects.create(
        farm=animal.farm,
        matriz=animal,
        tipo_evento="Parto bovino",
        data_evento=data["date"],
        descricao=f"{'Nascimento: ' + calf.identifier if calf else 'Natimorto'}",
        metadata={"birth_id": str(birth.pk)},
    )
    return birth, calf


@transaction.atomic
def enter_cattle_pasture(data):
    batch = AnimalBatch.objects.select_for_update().get(pk=data["batch"].pk)
    pasture = CattlePasture.objects.select_for_update().get(pk=data["pasture"].pk)
    if pasture.availability in ["resting", "blocked"]:
        raise ValidationError({"pasture": "Libere o pasto antes de registrar uma entrada."})
    latest = CattleGrazing.objects.filter(batch=batch).order_by("-entry_date").first()
    if latest and (latest.exit_date is None or data["entry_date"] < latest.exit_date):
        raise ValidationError(
            {"batch": "Finalize a ocupação anterior e respeite a data de saída."}
        )
    if data["entry_date"] < batch.entry_date:
        raise ValidationError(
            {"entry_date": "A entrada no pasto não pode anteceder a entrada do lote."}
        )
    return CattleGrazing.objects.create(**data)


@transaction.atomic
def record_cattle_feed(serializer, user):
    from decimal import Decimal

    from apps.inventory.models import ItemEstoque
    from apps.inventory.services import registrar_movimentacao

    values = serializer.validated_data
    item = ItemEstoque.objects.select_for_update().get(pk=values["item_estoque"].pk)
    from .cattle_feeding import eligible_feed_lots
    if not item.ativo:
        raise ValidationError({"item_estoque": "Selecione um produto ativo."})
    lots = list(eligible_feed_lots(item, values["data_fim"], values["data_inicio"]))
    remaining = values["quantidade"]
    if sum((lot.quantidade_atual for lot in lots), Decimal(0)) < remaining:
        raise ValidationError({"quantidade": "Estoque elegível insuficiente. Produtos vencidos, inativos ou recebidos após o início do período não podem ser fornecidos."})
    target = values.get("lote_animal") or values["animais"][0]
    total = Decimal(0)
    for lot in lots:
        amount = min(lot.quantidade_atual, remaining)
        if amount <= 0:
            break
        total += amount * (lot.custo_unitario or item.custo_medio or Decimal(0))
        registrar_movimentacao(
            item=item,
            lote=lot,
            tipo="consumo",
            quantidade=amount,
            responsavel=user,
            destino="Bovinos",
            farm=target.farm,
            observacao=values.get("observacao", "Consumo bovino"),
        )
        remaining -= amount
    target = values.get("lote_animal") or values["animais"][0]
    return serializer.save(
        organization=user.organization,
        farm=target.farm,
        usuario=user,
        custo_total=total,
        custo_unitario=total / values["quantidade"],
    )


@transaction.atomic
def record_cattle_event(animal, values):
    animal = Animal.objects.select_for_update().get(pk=animal.pk)
    if animal.status != "active" or (
        animal.entry_date and values["date"] < animal.entry_date
    ):
        raise ValidationError(
            "Selecione um animal ativo e uma data posterior à entrada."
        )
    kind = values["kind"]
    profile = cattle_profile(animal)
    if kind == "castration" and animal.gender != "M":
        raise ValidationError("Castração disponível apenas para machos.")
    if kind == "castration" and profile.is_castrated:
        raise ValidationError("A castração deste animal já foi registrada.")
    if kind == "dry_off" and (animal.gender != "F" or not profile.is_lactating):
        raise ValidationError("A secagem exige uma fêmea em lactação.")
    if kind == "abortion":
        if animal.gender != "F" or animal.reproductive_status != "gestante":
            raise ValidationError(
                "O registro de perda exige uma gestação em andamento."
            )
        Pregnancy.objects.filter(female=animal, status="ongoing").update(status="lost")
        animal.reproductive_status = "vazia"
    elif kind == "death":
        animal.status = "dead"
        profile.is_lactating = False
        Pregnancy.objects.filter(female=animal, status="ongoing").update(status="lost")
    elif kind == "dry_off":
        profile.is_lactating = False
        if animal.reproductive_status == "lactante":
            animal.reproductive_status = "descanso"
    elif kind == "start_lactation":
        if (
            animal.gender != "F"
            or animal.category not in ["Vaca", "Matriz"]
            or profile.is_lactating
        ):
            raise ValidationError(
                "Selecione uma vaca ou matriz que não esteja em lactação."
            )
        profile.is_lactating = True
    elif kind == "weaning":
        if animal.category != "Bezerro":
            raise ValidationError("O desmame exige um bezerro.")
        animal.category = "Novilha" if animal.gender == "F" else "Garrote"
        profile.weaning_date = values["date"]
        profile.management_group = values.get("destination_group", "")
        if values.get("weight_kg"):
            save_cattle_weight(
                animal, values["date"], values["weight_kg"], "Peso ao desmame."
            )
        # Weaning a calf must not end its dam's lactation or pregnancy.
    elif kind == "castration":
        profile.is_castrated = True
    if kind != "weaning" and (
        values.get("weight_kg") or values.get("destination_group")
    ):
        raise ValidationError("Peso e grupo de destino pertencem ao manejo de desmame.")
    profile.save()
    animal.save()
    names = {
        "abortion": "Perda gestacional",
        "death": "Morte",
        "dry_off": "Secagem",
        "weaning": "Desmame",
        "castration": "Castração",
        "start_lactation": "Início de lactação",
    }
    HistoricoEvento.objects.create(
        farm=animal.farm,
        matriz=animal,
        tipo_evento=names[kind],
        data_evento=values["date"],
        descricao=values.get("notes", ""),
        metadata={
            "weight_kg": str(values["weight_kg"]) if values.get("weight_kg") else None,
            "destination_group": values.get("destination_group", ""),
            "dam_id": str(animal.dam_ref_id) if animal.dam_ref_id else None,
        },
    )
