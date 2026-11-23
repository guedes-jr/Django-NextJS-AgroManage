"""Reviewed mobile swine reproduction and lot operations."""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import exceptions, serializers

from .mobile_swine_birth import _scope
from .mobile_vaccination import Strict
from .models import Animal, AnimalBatch, Birth, HistoricoEvento, Litter, Pregnancy
from .services import batch_start_date, close_batch_balance, record_batch_mortality, register_batch_sale, transfer_batch_phase, wean_birth

NEXT_PHASE = {"creche": "crescimento", "crescimento": "engorda"}
LOT_OPERATIONS = ("transfer", "mortality", "sale", "close")


class Conflict(exceptions.APIException):
    status_code = 409
    default_detail = "O registro mudou. Atualize e revise a operação."
    default_code = "swine_reproduction_conflict"


class Input(Strict):
    request_key = serializers.UUIDField()
    expected_farm = serializers.UUIDField()
    version = serializers.CharField(max_length=250)
    date = serializers.DateField()


class LossInput(Input):
    reason = serializers.ChoiceField(choices=("ABORTO", "RETORNO_CIO", "REABSORCAO"))
    notes = serializers.CharField(allow_blank=True, max_length=1000)


class WeaningInput(Input):
    quantity = serializers.IntegerField(min_value=1)
    weight = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=Decimal("0.01"), allow_null=True,
    )


class LitterWeaningInput(WeaningInput):
    weaning_type = serializers.ChoiceField(choices=("total", "parcial"), default="total")
    batch_code = serializers.CharField(max_length=50, allow_blank=True, default="")


class TransferInput(WeaningInput):
    destination = serializers.ChoiceField(choices=tuple(NEXT_PHASE.values()))


class CloseInput(Input):
    quantity = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(max_length=300, allow_blank=True)


class MortalityInput(Input):
    quantity = serializers.IntegerField(min_value=1)
    cause = serializers.CharField(max_length=150)
    notes = serializers.CharField(max_length=1000, allow_blank=True)


class SaleInput(Input):
    quantity = serializers.IntegerField(min_value=1)
    weight_kg = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    price_per_kg = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    buyer = serializers.CharField(max_length=200)
    due_date = serializers.DateField()
    notes = serializers.CharField(max_length=1000, allow_blank=True)


def _target(user, pk, kind, lock):
    if kind in LOT_OPERATIONS:
        if kind in ("transfer", "sale", "close") and user.role not in ("admin", "manager"):
            raise exceptions.PermissionDenied()
        query = AnimalBatch.objects.filter(pk=pk, farm__organization_id=user.organization_id, species__code="suinos")
        batch = (query.select_for_update(of=("self",)) if lock else query).first()
        if batch is None:
            raise exceptions.NotFound()
        return batch

    model = Pregnancy if kind == "loss" else Birth
    query = model.objects.filter(
        pk=pk, female__farm__organization_id=user.organization_id, female__species__code="suinos",
    )
    target = (query.select_for_update(of=("self",)) if lock else query).first()
    if target is None:
        raise exceptions.NotFound()
    return target


def _options(target, kind, lock=False):
    if kind in LOT_OPERATIONS:
        phases = NEXT_PHASE if kind == "transfer" else ("creche", "crescimento", "engorda")
        if target.phase not in phases or target.status != AnimalBatch.Status.ACTIVE or target.quantity < 1:
            raise Conflict()
        return {
            "id": str(target.pk), "kind": kind, "animal": target.batch_code,
            "farm": str(target.farm_id), "farm_name": target.farm.name,
            "version": f"{target.updated_at.isoformat()}|{target.phase}|{target.entry_date}|{target.quantity}|{target.avg_weight_kg}",
            "since": (batch_start_date(target) if kind == "close" else target.entry_date).isoformat(), "today": timezone.localdate().isoformat(),
            "quantity": target.quantity,
            **({"source": target.phase, "destination": NEXT_PHASE[target.phase]} if kind == "transfer" else {}),
        }

    animals = Animal.objects.select_related("farm").filter(pk=target.female_id)
    animal = (animals.select_for_update(of=("self",)) if lock else animals).get()
    if animal.status != "active":
        raise Conflict()
    version = [target.updated_at.isoformat(), animal.updated_at.isoformat()]
    quantity = None
    if kind == "loss":
        if (
            target.status != Pregnancy.Status.ONGOING
            or animal.reproductive_status != Animal.ReproductiveStatus.GESTANTE
            or Birth.objects.filter(pregnancy=target).exists()
        ):
            raise Conflict()
        since = target.start_date
    else:
        if animal.reproductive_status != Animal.ReproductiveStatus.LACTANTE:
            raise Conflict()
        last_weaning = Litter.objects.filter(birth=target).values_list("weaning_date", flat=True).first()
        since = max(target.birth_date, last_weaning or target.birth_date)
        if target.batch_id:
            batches = AnimalBatch.objects.filter(pk=target.batch_id, farm_id=animal.farm_id, species_id=animal.species_id)
            batch = (batches.select_for_update() if lock else batches).first()
            if not batch or batch.status != AnimalBatch.Status.ACTIVE or batch.phase != AnimalBatch.Phase.GESTACAO_MATERNIDADE:
                raise Conflict()
            since = max(since, batch.entry_date)
            quantity = batch.quantity
            version.extend((str(batch.pk), batch.updated_at.isoformat(), str(quantity)))
        else:
            quantity = target.live_born - target.mortality
            version.append(str(quantity))
        if quantity < 1:
            raise Conflict()

    return {
        "id": str(target.pk),
        "kind": kind,
        "animal": animal.identifier,
        "farm": str(animal.farm_id),
        "farm_name": animal.farm.name,
        "version": "|".join(version),
        "since": since.isoformat(),
        "today": timezone.localdate().isoformat(),
        "quantity": quantity,
    }


def options(user, pk, params, kind):
    _scope(user, params)
    return _options(_target(user, pk, kind, False), kind)


@transaction.atomic
def record(user, pk, params, kind, command):
    _scope(user, params, command=True)
    target = _target(user, pk, kind, True)
    event_type = {
        "loss": "Perda Gestacional", "weaning": "Desmame",
        "transfer": "Transferência de Fase", "mortality": "Mortalidade de Lote", "sale": "Venda de Animais", "close": "Encerramento de Saldo",
    }[kind]
    key = str(command["request_key"])
    snapshot = {name: str(value) if value is not None else None for name, value in command.items()}
    events = HistoricoEvento.objects.filter(
        farm__organization_id=user.organization_id, tipo_evento=event_type,
    )
    if kind == "sale":
        events = events.filter(metadata__mobile_sale__request_key=key)
    else:
        events = events.filter(metadata__mobile_target=str(target.pk), metadata__request_key=key)
    previous = (events.filter(lote_id=target.pk) if kind in LOT_OPERATIONS else events.filter(matriz_id=target.female_id)).first()
    if previous:
        audit = previous.metadata["mobile_sale"] if kind == "sale" else previous.metadata
        recorded = audit["command"]
        if kind == "weaning":
            recorded = {"weaning_type": "total", "batch_code": "", **recorded}
        if recorded != snapshot:
            raise Conflict()
        return audit["receipt"], False

    current = _options(target, kind, lock=True)
    date = command["date"]
    if current["farm"] != str(command["expected_farm"]) or current["version"] != command["version"]:
        raise Conflict()
    if not current["since"] <= date.isoformat() <= current["today"]:
        raise serializers.ValidationError({"date": "Informe uma data entre o início da fase e hoje."})

    if kind == "sale":
        if command["due_date"] < date:
            raise serializers.ValidationError({"due_date": "O vencimento deve ser igual ou posterior à venda."})
        from .serializers import BatchSaleSerializer
        values = BatchSaleSerializer(data={
            "mode": "partial",
            **{field: command[field] for field in ("quantity", "weight_kg", "price_per_kg", "buyer", "date", "due_date", "notes")},
        }, context={"batch": target})
        values.is_valid(raise_exception=True)
        sale = register_batch_sale(target, values.validated_data)
        event = target.historicos.get(tipo_evento=event_type, metadata__transaction_reference=sale["transaction_reference"])
        receipt = {
            "id": str(target.pk), "kind": kind, "request_key": key, "date": date.isoformat(),
            "batch": str(target.pk), "quantity": sale["quantity"], "reason": None,
            "remaining": target.quantity - sale["quantity"], "amount": sale["amount"],
            "reference": sale["transaction_reference"], "due_date": command["due_date"].isoformat(),
        }
        event.metadata["mobile_sale"] = {"request_key": key, "command": snapshot, "receipt": receipt, "responsible_id": str(user.pk)}
        event.save(update_fields=["metadata"])
        return receipt, True

    if kind == "close":
        if command["quantity"] != current["quantity"]:
            raise Conflict()
        closed = close_batch_balance(target, date, command["reason"])
        receipt = {
            "id": str(target.pk), "kind": kind, "request_key": key, "date": date.isoformat(),
            "batch": closed["batch"], "quantity": closed["closed_quantity"], "reason": None,
            "remaining": 0, "status": closed["status"],
        }
        event = target.historicos.filter(tipo_evento=event_type).order_by("-created_at").first()
        event.metadata.update(mobile_target=str(target.pk), request_key=key, command=snapshot, receipt=receipt)
        event.save(update_fields=["metadata"])
        return receipt, True

    if kind == "mortality":
        quantity = command["quantity"]
        if quantity > target.quantity:
            raise serializers.ValidationError({"quantity": "A quantidade excede o saldo disponível."})
        receipt = {
            "id": str(target.pk), "kind": kind, "request_key": key, "date": date.isoformat(),
            "batch": str(target.pk), "quantity": quantity, "reason": None, "remaining": target.quantity - quantity,
        }
        record_batch_mortality(target, quantity, date, command["cause"], command["notes"], audit={
            "mobile_target": str(target.pk), "request_key": key, "command": snapshot,
            "receipt": receipt, "responsible_id": str(user.pk),
        })
        return receipt, True

    animal = None if kind == "transfer" else target.female
    batch = None
    if kind == "transfer":
        if command["quantity"] != current["quantity"] or command["destination"] != current["destination"]:
            raise Conflict()
        batch = transfer_batch_phase(
            target, command["destination"], date,
            exit_quantity=command["quantity"], exit_weight_kg=command["weight"],
        )
        event = batch.historicos.filter(tipo_evento=event_type).order_by("-created_at").first()
    elif kind == "loss":
        reason = command["reason"]
        target.status = Pregnancy.Status.LOST
        target.save(update_fields=["status", "updated_at"])
        animal.reproductive_status = (
            Animal.ReproductiveStatus.AGUARDANDO_COBERTURA
            if reason in ("RETORNO_CIO", "REABSORCAO") else Animal.ReproductiveStatus.VAZIA
        )
        animal.save(update_fields=["reproductive_status", "updated_at"])
        description = f"Tipo: {reason} | Obs: {command['notes']}"
        metadata = {"tipo_perda": reason}
    else:
        partial = command["weaning_type"] == "parcial"
        available = current["quantity"]
        if (partial and command["quantity"] >= available) or (not partial and command["quantity"] != available):
            raise Conflict()
        try:
            _, batch = wean_birth(
                target, weaning_date=date, weaned_quantity=command["quantity"],
                avg_weaning_weight_kg=command["weight"], weaning_type=command["weaning_type"],
                batch_code=command["batch_code"],
            )
        except ValueError as error:
            raise serializers.ValidationError({"batch_code": str(error)}) from error
        description = f"Desmame {command['weaning_type']}: {batch.quantity} leitões transferidos para a creche."
        metadata = {"batch_id": str(batch.pk), "weaning_type": command["weaning_type"]}

    receipt = {
        "id": str(target.pk), "kind": kind, "request_key": key, "date": date.isoformat(),
        "batch": str(batch.pk) if batch else None, "quantity": batch.quantity if batch else None,
        "reason": command.get("reason"),
    }
    if kind == "weaning":
        receipt["remaining"] = available - batch.quantity
    audit = {
        "mobile_target": str(target.pk), "request_key": key, "command": snapshot,
        "receipt": receipt, "responsible_id": str(user.pk),
    }
    if kind == "transfer":
        receipt["destination"] = batch.phase
        event.metadata = {**event.metadata, **audit}
        event.save(update_fields=["metadata"])
    else:
        HistoricoEvento.objects.create(
            farm=animal.farm, matriz=animal, lote=batch, tipo_evento=event_type, descricao=description,
            data_evento=date, metadata={**metadata, **audit},
        )
    return receipt, True
