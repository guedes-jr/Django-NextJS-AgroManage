"""Atomic native-to-web dairy worksheet, built on the existing milk/feed ledgers."""

import hashlib
import json
from decimal import Decimal
from uuid import uuid4

from common.operator_access import remember_operator_record
from django.db import transaction
from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import APIException, PermissionDenied

from apps.farms.models import Farm
from apps.inventory.models import ConsumoRacao, ItemEstoque, LoteEstoque

from .cattle_milk import milk_cow_row, milk_cows, milk_totals_covering
from .cattle_serializers import CattleFeedSerializer, CattleMilkSerializer, past_date
from .cattle_services import record_cattle_feed
from .models import Animal, CattleMilkRecord, DairyWorksheetCommand, DairyWorksheetState

ZERO = Decimal(0)
SLOTS = ("concentrate", "silage", "mineral")
SESSIONS = ("morning", "afternoon", "evening")


class WorksheetConflict(APIException):
    status_code = 409
    default_detail = (
        "O lançamento mudou. Atualize a consulta e confira os valores antes de salvar."
    )


class VerifiedAnimalField(serializers.PrimaryKeyRelatedField):
    def to_internal_value(self, value):
        try:
            return self.context["verified_animals"][str(value)]
        except KeyError:
            raise serializers.ValidationError(
                "Animal indisponível no contexto atual."
            ) from None


class WorksheetFeedSerializer(CattleFeedSerializer):
    animais = VerifiedAnimalField(
        many=True, queryset=Animal.objects.none(), required=False
    )


class WorksheetMilkSerializer(CattleMilkSerializer):
    animal = VerifiedAnimalField(queryset=Animal.objects.none())


class FeedInput(serializers.Serializer):
    slot = serializers.ChoiceField(choices=SLOTS)
    item = serializers.UUIDField()
    quantity_kg = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal(".01")
    )


class RowInput(serializers.Serializer):
    animal = serializers.UUIDField()
    expected_version = serializers.CharField(max_length=64)
    morning = serializers.DecimalField(max_digits=9, decimal_places=2, min_value=ZERO)
    afternoon = serializers.DecimalField(max_digits=9, decimal_places=2, min_value=ZERO)
    evening = serializers.DecimalField(max_digits=9, decimal_places=2, min_value=ZERO)
    discarded_liters = serializers.DecimalField(
        max_digits=9, decimal_places=2, min_value=ZERO
    )
    discard_reason = serializers.CharField(max_length=200, allow_blank=True, default="")
    notes = serializers.CharField(max_length=2000, allow_blank=True, default="")
    oxytocin_ml = serializers.DecimalField(
        max_digits=9, decimal_places=2, min_value=ZERO
    )
    feeds = FeedInput(many=True, max_length=3)
    remove = serializers.BooleanField(default=False)

    def validate(self, values):
        if len({feed["slot"] for feed in values["feeds"]}) != len(values["feeds"]):
            raise serializers.ValidationError(
                "Informe apenas um produto por tipo de alimentação."
            )
        total = sum(values[session] for session in SESSIONS)
        if values["discarded_liters"] > total:
            raise serializers.ValidationError(
                {"discarded_liters": "O descarte não pode superar a produção."}
            )
        if values["discarded_liters"] and not values["discard_reason"].strip():
            raise serializers.ValidationError(
                {"discard_reason": "Informe o motivo do descarte."}
            )
        if (
            not values["remove"]
            and total == 0
            and not values["feeds"]
            and values["oxytocin_ml"] == 0
        ):
            raise serializers.ValidationError("Informe produção ou alimentação.")
        return values


class TotalInput(serializers.Serializer):
    id = serializers.UUIDField(required=False, allow_null=True)
    expected_version = serializers.CharField(
        max_length=64, allow_blank=True, default=""
    )
    period_start = serializers.DateField(validators=[past_date])
    liters = serializers.DecimalField(
        max_digits=11, decimal_places=2, min_value=Decimal(".01")
    )
    discarded_liters = serializers.DecimalField(
        max_digits=11, decimal_places=2, min_value=ZERO
    )
    discard_reason = serializers.CharField(max_length=200, allow_blank=True, default="")
    notes = serializers.CharField(max_length=2000, allow_blank=True, default="")
    oxytocin_ml = serializers.DecimalField(
        max_digits=9, decimal_places=2, min_value=ZERO
    )
    batch = serializers.UUIDField(required=False, allow_null=True)
    feeds = FeedInput(many=True, max_length=3)
    remove = serializers.BooleanField(default=False)

    def validate_feeds(self, feeds):
        if len({feed["slot"] for feed in feeds}) != len(feeds):
            raise serializers.ValidationError("Não repita tipos de alimentação.")
        return feeds


class CommandInput(serializers.Serializer):
    mode = serializers.ChoiceField(
        choices=["individual", "total"], default="individual"
    )
    farm = serializers.UUIDField()
    date = serializers.DateField(validators=[past_date])
    request_key = serializers.UUIDField()
    tank = serializers.UUIDField(required=False, allow_null=True)
    rows = RowInput(many=True, min_length=1, max_length=100, required=False)
    total = TotalInput(required=False)

    def validate(self, values):
        key = "total" if values["mode"] == "total" else "rows"
        if key not in values:
            raise serializers.ValidationError({key: "Informe os lançamentos."})
        if (
            values["mode"] == "total"
            and values["total"]["period_start"] > values["date"]
        ):
            raise serializers.ValidationError(
                {"period_start": "A data inicial não pode ser posterior à final."}
            )
        return values

    def validate_rows(self, rows):
        if len({row["animal"] for row in rows}) != len(rows):
            raise serializers.ValidationError("Não repita animais no mesmo envio.")
        return rows


def feed_products(organization):
    return ItemEstoque.objects.filter(
        organization=organization,
        ativo=True,
        categoria__in=["racao", "suplemento", "nucleo"],
        unidade_medida="kg",
        especie_animal__in=["", "bovino", "multiplo"],
    ).order_by("nome", "id")


def version(records, state):
    data = [
        (str(row.pk), row.updated_at.isoformat())
        for row in sorted(records, key=lambda row: getattr(row, "session", "total"))
    ]
    data.append((str(state.pk), state.updated_at.isoformat()) if state else None)
    return hashlib.sha256(json.dumps(data).encode()).hexdigest()


def state_feeds(state):
    return (
        [
            {
                "slot": value["slot"],
                "item": value["item"],
                "name": value["name"],
                "quantity_kg": value["quantity_kg"],
            }
            for value in state.feed_allocations
        ]
        if state
        else []
    )


def serialize_row(animal, records, state):
    sessions = {row.session: row for row in records}
    return {
        **milk_cow_row(animal),
        "batch": str(animal.batch_id) if animal.batch_id else None,
        "batch_code": animal.batch.batch_code if animal.batch_id else "",
        "expected_version": version(records, state),
        **{
            session: str(sessions[session].liters) if session in sessions else "0.00"
            for session in SESSIONS
        },
        "discarded_liters": str(sum((row.discarded_liters for row in records), ZERO)),
        "discard_reason": next(
            (row.discard_reason for row in records if row.discard_reason), ""
        ),
        "notes": next((row.notes for row in records if row.notes), ""),
        "oxytocin_ml": str(state.oxytocin_ml) if state else "0.00",
        "feeds": state_feeds(state),
        "recorded": bool(records or state),
    }


def worksheet_rows(organization, day, farm):
    # A feed-only entry stays visible even if the cow was subsequently dried off.
    supplemental = DairyWorksheetState.objects.filter(
        animal__farm__organization=organization, date=day
    )
    cows = milk_cows(organization, day, farm)
    # milk_cows intentionally keeps historical records outside today's lactating herd.
    extra_ids = supplemental.values("animal_id")
    from .cattle_improvements import filter_purpose

    extra = filter_purpose(
        Animal.objects.filter(pk__in=extra_ids, farm_id=farm), "dairy"
    )
    return (
        Animal.objects.filter(
            Q(pk__in=cows.values("pk")) | Q(pk__in=extra.values("pk"))
        )
        .select_related("farm", "breed", "cattle_profile", "batch")
        .prefetch_related(
            Prefetch(
                "milk_records",
                queryset=CattleMilkRecord.objects.filter(date=day).order_by("session"),
                to_attr="worksheet_milk",
            ),
            Prefetch(
                "dairy_worksheets", queryset=supplemental, to_attr="worksheet_states"
            ),
        )
        .order_by("identifier", "id")
    )


def row_data(animal):
    records = animal.worksheet_milk
    animal.day_liters = sum((row.liters for row in records), ZERO) if records else None
    animal.has_milk = bool(records)
    animal.has_daily_total = False
    state = animal.worksheet_states[0] if animal.worksheet_states else None
    return serialize_row(animal, records, state)


def _release_feed(request, animal, allocation):
    """Return exactly the original lot allocations, preserving signed stock history."""
    from apps.inventory.services import registrar_movimentacao

    consumption = get_object_or_404(
        ConsumoRacao.objects.select_for_update(),
        pk=allocation["consumption"],
        organization=request.user.organization,
    )
    if (
        consumption.quantidade != Decimal(allocation["quantity_kg"])
        or str(consumption.item_estoque_id) != allocation["item"]
    ):
        raise WorksheetConflict(
            "O consumo foi alterado fora da planilha. Confira o estoque antes de corrigir."
        )
    for part in allocation["lots"]:
        lot = get_object_or_404(
            LoteEstoque.objects.select_for_update(),
            pk=part["lot"],
            item_id=allocation["item"],
            item__organization=request.user.organization,
        )
        registrar_movimentacao(
            item=lot.item,
            lote=lot,
            tipo="entrada",
            quantidade=Decimal(part["quantity"]),
            responsavel=request.user,
            farm=animal.farm,
            destino="Bovinos",
            observacao=f"Estorno de alimentação leiteira · {consumption.pk} · {animal.identifier}",
        )
    # The stock movements and command before-snapshot retain the correction audit;
    # only the current consumption contributes to operational/cost reports.
    consumption.delete()


def _save_feed(request, animal, day, feed, *, start=None, targets=None, batch=None):
    from .cattle_feeding import eligible_feed_lots

    item = get_object_or_404(feed_products(request.user.organization), pk=feed["item"])
    destination = (
        {"lote_animal": str(batch.pk)}
        if batch
        else {"animais": [str(target.pk) for target in (targets or [animal])]}
    )
    serializer = WorksheetFeedSerializer(
        data={
            "item_estoque": str(item.pk),
            **destination,
            "data_inicio": str(start or day),
            "data_fim": str(day),
            "quantidade": str(feed["quantity_kg"]),
            "tipo_registro": "total_periodo",
            "observacao": f"Alimentação leiteira · {animal.identifier} · {feed['slot']}",
        },
        context={
            "request": request,
            "verified_animals": {
                str(target.pk): target
                for target in (targets or ([animal] if not batch else []))
            },
        },
    )
    serializer.is_valid(raise_exception=True)
    lots = list(eligible_feed_lots(item, day, start))
    before = {str(lot.pk): lot.quantidade_atual for lot in lots}
    consumption = record_cattle_feed(serializer, request.user)
    remember_operator_record(request.user, consumption)
    parts = []
    for lot in LoteEstoque.objects.filter(pk__in=before):
        used = before[str(lot.pk)] - lot.quantidade_atual
        if used:
            parts.append({"lot": str(lot.pk), "quantity": str(used)})
    return {
        "slot": feed["slot"],
        "item": str(item.pk),
        "name": item.nome,
        "quantity_kg": str(feed["quantity_kg"]),
        "consumption": str(consumption.pk),
        "lots": parts,
        "cost_total": str(consumption.custo_total),
        "cost_unit": str(consumption.custo_unitario),
        "animals": destination.get("animais", []),
        "batch": destination.get("lote_animal"),
        "period_start": str(start or day),
        "date": str(day),
    }


def _save_row(request, animal, day, values, records, state):
    remove = values["remove"]
    old = {row.session: row for row in records}
    remaining = ZERO if remove else values["discarded_liters"]
    for session in SESSIONS:
        liters = ZERO if remove else values[session]
        discarded = min(remaining, liters)
        remaining -= discarded
        record = old.get(session)
        if liters > 0:
            data = {
                "animal": str(animal.pk),
                "date": str(day),
                "session": session,
                "liters": str(liters),
                "discarded_liters": str(discarded),
                "discard_reason": values["discard_reason"] if discarded else "",
                "notes": values["notes"],
            }
            serializer = WorksheetMilkSerializer(
                record,
                data=data,
                context={
                    "request": request,
                    "defer_milk_tank_check": True,
                    "verified_animals": {str(animal.pk): animal},
                },
            )
            serializer.is_valid(raise_exception=True)
            instance = serializer.save()
            remember_operator_record(request.user, instance)
        elif record:
            record.delete()
    previous = {feed["slot"]: feed for feed in state.feed_allocations} if state else {}
    desired = {} if remove else {feed["slot"]: feed for feed in values["feeds"]}
    allocations = []
    for slot in SLOTS:
        before, after = previous.get(slot), desired.get(slot)
        if (
            before
            and after
            and before["item"] == str(after["item"])
            and Decimal(before["quantity_kg"]) == after["quantity_kg"]
        ):
            allocations.append(before)
            continue
        if before:
            _release_feed(request, animal, before)
        if after:
            allocations.append(_save_feed(request, animal, day, after))
    if remove:
        if state:
            state.delete()
    else:
        DairyWorksheetState.objects.update_or_create(
            animal=animal,
            date=day,
            defaults={
                "farm": animal.farm,
                "oxytocin_ml": values["oxytocin_ml"],
                "feed_allocations": allocations,
                "recorded_by": request.user,
            },
        )


def serialize_total(total):
    if not total:
        return None
    state = getattr(total, "worksheet", None)
    batch = None
    if state and state.feed_allocations:
        batch = (
            ConsumoRacao.objects.filter(pk=state.feed_allocations[0]["consumption"])
            .values_list("lote_animal_id", flat=True)
            .first()
        )
    return {
        "id": str(total.pk),
        "expected_version": version([total], state),
        "period_start": str(total.period_start or total.date),
        "date": str(total.date),
        "liters": str(total.liters),
        "discarded_liters": str(total.discarded_liters),
        "discard_reason": total.discard_reason,
        "notes": total.notes,
        "oxytocin_ml": str(state.oxytocin_ml) if state else "0.00",
        "feeds": state_feeds(state),
        "batch": str(batch) if batch else None,
    }


def _save_total(request, farm, values):
    from types import SimpleNamespace

    from .cattle_serializers import CattleMilkDailyTotalSerializer
    from .milk_tanks import delete_milk, move_milk
    from .models import AnimalBatch, CattleMilkDailyTotal, MilkTank

    user, day, data = request.user, values["date"], values["total"]
    record = (
        get_object_or_404(
            CattleMilkDailyTotal.objects.select_for_update(),
            pk=data["id"],
            farm=farm,
            date=day,
        )
        if data.get("id")
        else None
    )
    state = (
        DairyWorksheetState.objects.select_for_update().filter(total=record).first()
        if record
        else None
    )
    if record and data["expected_version"] != version([record], state):
        raise WorksheetConflict()
    if user.role == "operator" and (record or data["remove"]):
        raise PermissionDenied(
            "A correção da produção total exige gerente ou administrador."
        )
    before = [
        {
            "total": serialize_total(record),
            "feed_allocations": state.feed_allocations if state else [],
        }
    ]
    target = SimpleNamespace(farm=farm, identifier="Total do período")
    batch = None
    if data.get("batch"):
        batch = get_object_or_404(
            AnimalBatch,
            pk=data["batch"],
            farm=farm,
            species__code="bovinos",
            cattle_purpose__in=["dairy", "dual"],
            status="active",
        )
        if not batch.quantity or batch.entry_date > data["period_start"]:
            raise serializers.ValidationError(
                {
                    "batch": "Selecione um lote com animais e entrada anterior ao período."
                }
            )
    previous = {feed["slot"]: feed for feed in state.feed_allocations} if state else {}
    items = {feed["item"] for feed in previous.values()} | {
        feed["item"] for feed in data["feeds"]
    }
    list(
        ItemEstoque.objects.select_for_update()
        .filter(organization=user.organization, pk__in=items)
        .order_by("id")
    )
    old_usable = record.liters - record.discarded_liters if record else ZERO
    if data["remove"]:
        if not record:
            raise serializers.ValidationError(
                {"id": "Selecione um lançamento confirmado."}
            )
        for feed in previous.values():
            _release_feed(request, target, feed)
        delete_milk(record, worksheet=True)
        return before, ZERO
    serializer = CattleMilkDailyTotalSerializer(
        record,
        data={
            "farm": str(farm.pk),
            "date": str(day),
            "period_start": str(data["period_start"]),
            "liters": str(data["liters"]),
            "discarded_liters": str(data["discarded_liters"]),
            "discard_reason": data["discard_reason"],
            "notes": data["notes"],
        },
        context={"request": request, "dairy_worksheet": True},
    )
    serializer.is_valid(raise_exception=True)
    record = serializer.save()
    remember_operator_record(user, record)
    desired = {feed["slot"]: feed for feed in data["feeds"]}
    targets = (
        list(
            Animal.objects.filter(
                farm=farm,
                species__code="bovinos",
                cattle_purpose__in=["dairy", "dual"],
                gender="F",
                category__in=["Vaca", "Matriz"],
                status="active",
                entry_date__lte=data["period_start"],
            )
            .select_related("farm", "species")
            .order_by("id")
        )
        if desired and not batch
        else []
    )
    if desired and not batch and not targets:
        raise serializers.ValidationError(
            {"feeds": "Selecione um lote elegível ou cadastre as vacas da fazenda."}
        )
    allocations = []
    for slot in SLOTS:
        before_feed, after_feed = previous.get(slot), desired.get(slot)
        if (
            before_feed
            and after_feed
            and before_feed["item"] == str(after_feed["item"])
            and Decimal(before_feed["quantity_kg"]) == after_feed["quantity_kg"]
            and state
            and record.period_start == data["period_start"]
        ):
            # Keep the original target and dates only when the consumption context matches.
            consumption = ConsumoRacao.objects.get(pk=before_feed["consumption"])
            if consumption.data_inicio == data[
                "period_start"
            ] and consumption.lote_animal_id == (batch.pk if batch else None):
                allocations.append(before_feed)
                continue
        if before_feed:
            _release_feed(request, target, before_feed)
        if after_feed:
            allocations.append(
                _save_feed(
                    request,
                    target,
                    day,
                    after_feed,
                    start=data["period_start"],
                    targets=targets,
                    batch=batch,
                )
            )
    DairyWorksheetState.objects.update_or_create(
        total=record,
        defaults={
            "farm": farm,
            "date": day,
            "oxytocin_ml": data["oxytocin_ml"],
            "feed_allocations": allocations,
            "recorded_by": user,
        },
    )
    received = ZERO
    if values.get("tank"):
        tank = get_object_or_404(MilkTank, pk=values["tank"], farm=farm, is_active=True)
        received = max(ZERO, record.liters - record.discarded_liters - old_usable)
        if received:
            move_milk(
                user,
                {
                    "tank": tank,
                    "kind": "production",
                    "date": day,
                    "liters": received,
                    "request_key": uuid4(),
                    "notes": "Recebimento automático · total do período leiteiro",
                },
            )
    return before, received


@transaction.atomic
def save_worksheet(request, values):
    user = request.user
    if user.role not in {"admin", "manager", "operator"} or (
        user.role == "operator" and user.operator_read_only
    ):
        raise PermissionDenied()
    farm = get_object_or_404(
        Farm.objects.select_for_update(),
        pk=values["farm"],
        organization=user.organization,
    )
    fingerprint = hashlib.sha256(
        json.dumps(values, default=str, sort_keys=True).encode()
    ).hexdigest()
    previous = DairyWorksheetCommand.objects.filter(
        farm=farm, request_key=values["request_key"]
    ).first()
    if previous:
        if previous.recorded_by_id != user.pk or previous.fingerprint != fingerprint:
            raise WorksheetConflict("Esta identificação já foi usada em outro envio.")
        return previous.receipt
    day = values["date"]
    if values["mode"] == "total":
        before, received = _save_total(request, farm, values)
        receipt = {
            "request_key": str(values["request_key"]),
            "farm": str(farm.pk),
            "date": str(day),
            "animals": 0,
            "received_liters": str(received),
            "saved": True,
        }
        DairyWorksheetCommand.objects.create(
            farm=farm,
            recorded_by=user,
            request_key=values["request_key"],
            fingerprint=fingerprint,
            before=before,
            receipt=receipt,
        )
        return receipt
    from .models import CattleMilkDailyTotal, MilkTank

    if milk_totals_covering(
        CattleMilkDailyTotal.objects.filter(farm=farm), day
    ).exists():
        raise WorksheetConflict(
            "Já existe produção total nesta fazenda e data. Corrija o total antes de lançar por animal."
        )
    ids = [row["animal"] for row in values["rows"]]
    animals = {
        animal.pk: animal
        for animal in Animal.objects.select_for_update(of=("self",))
        .filter(farm=farm, species__code="bovinos", pk__in=ids)
        .select_related("farm", "species", "batch")
        .order_by("id")
    }
    if len(animals) != len(ids):
        raise serializers.ValidationError(
            {"rows": "Selecione apenas animais da fazenda e organização atuais."}
        )
    states = {
        row.animal_id: row
        for row in DairyWorksheetState.objects.select_for_update().filter(
            animal_id__in=ids, date=day
        )
    }
    records = list(
        CattleMilkRecord.objects.select_for_update().filter(animal_id__in=ids, date=day)
    )
    before = []
    items = {feed["item"] for row in values["rows"] for feed in row["feeds"]}
    items.update(
        feed["item"] for state in states.values() for feed in state.feed_allocations
    )
    # Stable item order also serializes simultaneous consumption from other farms.
    list(
        ItemEstoque.objects.select_for_update()
        .filter(organization=user.organization, pk__in=items)
        .order_by("id")
    )
    usable_before = ZERO
    for row in values["rows"]:
        animal = animals[row["animal"]]
        existing = [record for record in records if record.animal_id == animal.pk]
        state = states.get(animal.pk)
        if version(existing, state) != row["expected_version"]:
            raise WorksheetConflict()
        if not row["remove"] and (
            animal.status != "active"
            or animal.gender != "F"
            or animal.category not in ["Vaca", "Matriz"]
            or (animal.cattle_purpose not in ["dairy", "dual"] and not existing)
        ):
            raise serializers.ValidationError(
                {"animal": "Selecione vacas leiteiras ativas."}
            )
        if (animal.entry_date and day < animal.entry_date) or (
            animal.birth_date and day < animal.birth_date
        ):
            raise serializers.ValidationError(
                {"date": "O lançamento não pode anteceder a entrada ou o nascimento."}
            )
        # Operators retain the same correction boundary as their existing records.
        if user.role == "operator":
            from apps.accounts.models import OperatorRecordOwnership

            owned = set(
                OperatorRecordOwnership.objects.filter(
                    user=user,
                    organization=user.organization,
                    model_label="livestock.cattlemilkrecord",
                    object_id__in=[record.pk for record in existing],
                ).values_list("object_id", flat=True)
            )
            if (
                row["remove"]
                or any(record.pk not in owned for record in existing)
                or (state and state.recorded_by_id != user.pk)
            ):
                raise PermissionDenied(
                    "A correção deste lançamento exige gerente ou administrador."
                )
            old_feeds = state_feeds(state)
            old_quantities = {
                (feed["slot"], feed["item"], Decimal(feed["quantity_kg"]))
                for feed in old_feeds
            }
            new_quantities = {
                (feed["slot"], str(feed["item"]), feed["quantity_kg"])
                for feed in row["feeds"]
            }
            if old_quantities and old_quantities != new_quantities:
                raise PermissionDenied(
                    "Correções de alimentação e estoque exigem gerente ou administrador."
                )
        usable_before += sum(
            (record.liters - record.discarded_liters for record in existing), ZERO
        )
        before.append(
            {
                "animal": str(animal.pk),
                "records": [
                    {
                        "id": str(record.pk),
                        "session": record.session,
                        "liters": str(record.liters),
                        "discarded_liters": str(record.discarded_liters),
                        "notes": record.notes,
                    }
                    for record in existing
                ],
                "oxytocin_ml": str(state.oxytocin_ml) if state else "0",
                "feed_allocations": state.feed_allocations if state else [],
            }
        )
    for row in values["rows"]:
        animal = animals[row["animal"]]
        _save_row(
            request,
            animal,
            day,
            row,
            [record for record in records if record.animal_id == animal.pk],
            states.get(animal.pk),
        )
    from .milk_tanks import protect_production

    protect_production(farm, day)
    received = ZERO
    if values.get("tank"):
        from .milk_tanks import move_milk

        tank = get_object_or_404(MilkTank, pk=values["tank"], farm=farm, is_active=True)
        usable_after = sum(
            (
                sum(row[session] for session in SESSIONS) - row["discarded_liters"]
                for row in values["rows"]
                if not row["remove"]
            ),
            ZERO,
        )
        received = max(ZERO, usable_after - usable_before)
        if received > 0:
            move_milk(
                user,
                {
                    "tank": tank,
                    "kind": "production",
                    "date": day,
                    "liters": received,
                    "request_key": uuid4(),
                    "notes": "Recebimento automático · planilha leiteira",
                },
            )
    receipt = {
        "request_key": str(values["request_key"]),
        "farm": str(farm.pk),
        "date": str(day),
        "animals": len(ids),
        "received_liters": str(received),
        "saved": True,
    }
    DairyWorksheetCommand.objects.create(
        farm=farm,
        recorded_by=user,
        request_key=values["request_key"],
        fingerprint=fingerprint,
        before=before,
        receipt=receipt,
    )
    return receipt
