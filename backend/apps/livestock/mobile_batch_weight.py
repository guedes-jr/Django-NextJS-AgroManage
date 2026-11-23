from decimal import Decimal

from django.utils import timezone
from django.utils.translation import gettext as translate_message
from rest_framework import exceptions, serializers

from common.operator_access import remember_operator_record
from .models import AnimalBatch, HistoricoEvento, WeightRecord


SWINE_WEIGHT_PHASES = ("creche", "crescimento", "engorda")


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, dict):
            unknown = set(data) - set(self.fields)
            if unknown:
                raise serializers.ValidationError({"detail": translate_message("O envio contém campos não suportados.")})
        return super().to_internal_value(data)


class SwineBatchWeightSerializer(StrictSerializer):
    request_key = serializers.UUIDField()
    phase = serializers.ChoiceField(choices=SWINE_WEIGHT_PHASES)
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=3, min_value=Decimal("0.001"))
    weighing_date = serializers.DateField()
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)


class SwineBatchWeightConflict(exceptions.APIException):
    status_code = 409
    default_detail = translate_message("O lote ou a pesagem mudou. Atualize os dados antes de tentar novamente.")
    default_code = "swine_batch_weight_conflict"


def register_swine_batch_weight(user, batch, values):
    if batch.species.code not in {"suino", "suinos"}:
        raise SwineBatchWeightConflict()

    request_key = str(values["request_key"])
    weighing_date = values["weighing_date"]
    weight = values["weight_kg"]
    notes = values.get("notes", "")
    existing = batch.historicos.filter(
        tipo_evento="Pesagem de Lote",
        metadata__request_key=request_key,
    ).first()
    if existing:
        metadata = existing.metadata or {}
        if (
            metadata.get("phase") != values["phase"]
            or metadata.get("weight_kg") != str(weight)
            or metadata.get("weighing_date") != weighing_date.isoformat()
            or metadata.get("notes", "") != notes
        ):
            raise SwineBatchWeightConflict()
        record = WeightRecord.objects.filter(
            pk=metadata.get("weight_record_id"),
            batch=batch,
        ).first()
        if record is None:
            raise exceptions.APIException(translate_message("Não foi possível confirmar a pesagem já registrada."))
        if record.weight_kg != weight or record.weighing_date != weighing_date or record.notes != notes:
            raise SwineBatchWeightConflict()
        return _swine_batch_weight_receipt(batch, record, request_key, values["phase"]), False

    if (
        batch.status != AnimalBatch.Status.ACTIVE
        or batch.quantity < 1
        or batch.phase not in SWINE_WEIGHT_PHASES
        or batch.phase != values["phase"]
    ):
        raise SwineBatchWeightConflict()
    if weighing_date > timezone.localdate():
        raise serializers.ValidationError({"weighing_date": translate_message("A data da pesagem não pode estar no futuro.")})
    if batch.entry_date and weighing_date < batch.entry_date:
        raise serializers.ValidationError({"weighing_date": translate_message("A data da pesagem não pode ser anterior à entrada do lote na fase atual.")})

    record = WeightRecord.objects.create(
        farm=batch.farm,
        species=batch.species,
        batch=batch,
        weight_kg=weight,
        weighing_date=weighing_date,
        notes=notes,
    )
    remember_operator_record(user, record)
    HistoricoEvento.objects.create(
        farm=batch.farm,
        tipo_evento="Pesagem de Lote",
        descricao=f"Peso médio do lote: {weight} kg",
        data_evento=weighing_date,
        lote=batch,
        metadata={
            "phase": batch.phase,
            "weight_kg": str(weight),
            "weight_record_id": str(record.pk),
            "weighing_date": weighing_date.isoformat(),
            "notes": notes,
            "request_key": request_key,
        },
    )
    return _swine_batch_weight_receipt(batch, record, request_key, batch.phase), True


def _swine_batch_weight_receipt(batch, record, request_key, phase):
    return {
        "id": str(record.pk),
        "batch_id": str(batch.pk),
        "phase": phase,
        "request_key": request_key,
        "weight_kg": str(record.weight_kg),
        "weighing_date": record.weighing_date.isoformat(),
    }
