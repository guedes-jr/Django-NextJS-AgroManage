import datetime

from django.utils import timezone
from django.utils.translation import gettext as translate_message
from rest_framework import exceptions, serializers

from common.operator_access import remember_operator_record
from .models import Animal, AnimalBatch, HistoricoEvento, Mating, Pregnancy


SWINE_COVERAGE_STATUSES = (
    Animal.ReproductiveStatus.VAZIA,
    Animal.ReproductiveStatus.PRONTA,
    Animal.ReproductiveStatus.AGUARDANDO_COBERTURA,
)


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, dict):
            unknown = set(data) - set(self.fields)
            if unknown:
                raise serializers.ValidationError({"detail": translate_message("O envio contém campos não suportados.")})
        return super().to_internal_value(data)


class SwineMatingSerializer(StrictSerializer):
    request_key = serializers.UUIDField()
    expected_status = serializers.ChoiceField(choices=SWINE_COVERAGE_STATUSES)
    mating_date = serializers.DateField()
    mating_type = serializers.ChoiceField(choices=Mating.MatingType.choices)
    sire_info = serializers.CharField(required=False, allow_blank=True, max_length=100)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)


class SwineMatingConflict(exceptions.APIException):
    status_code = 409
    default_detail = translate_message("A matriz ou a sequência reprodutiva mudou. Atualize os dados antes de tentar novamente.")
    default_code = "swine_mating_conflict"


def register_swine_mating(user, animal, values):
    request_key = str(values["request_key"])
    mating_date = values["mating_date"]
    mating_type = values["mating_type"]
    sire_info = values.get("sire_info", "")
    notes = values.get("notes", "")
    existing = HistoricoEvento.objects.filter(
        matriz=animal,
        tipo_evento="Cobertura",
        metadata__request_key=request_key,
    ).first()
    if existing:
        metadata = existing.metadata or {}
        if (
            metadata.get("expected_status") != values["expected_status"]
            or metadata.get("mating_date") != mating_date.isoformat()
            or metadata.get("mating_type") != mating_type
            or metadata.get("sire_info", "") != sire_info
            or metadata.get("notes", "") != notes
        ):
            raise SwineMatingConflict()
        mating = Mating.objects.filter(
            pk=metadata.get("mating_id"),
            female=animal,
        ).first()
        if mating is None:
            raise exceptions.APIException(translate_message("Não foi possível confirmar a cobertura já registrada."))
        if (
            mating.mating_date != mating_date
            or mating.mating_type != mating_type
            or mating.sire_info != sire_info
            or mating.notes != notes
        ):
            raise SwineMatingConflict()
        return _swine_mating_receipt(animal, mating, request_key), False

    if (
        animal.species.code != "suinos"
        or animal.gender != Animal.Gender.FEMALE
        or animal.category not in {"Marrã", "Matriz"}
        or animal.status != AnimalBatch.Status.ACTIVE
        or animal.reproductive_status != values["expected_status"]
        or animal.reproductive_status not in SWINE_COVERAGE_STATUSES
        or Mating.objects.filter(female=animal, status=Mating.Status.PENDING_DG).exists()
        or Pregnancy.objects.filter(female=animal, status=Pregnancy.Status.ONGOING).exists()
    ):
        raise SwineMatingConflict()

    today = timezone.localdate()
    if mating_date > today:
        raise serializers.ValidationError({"mating_date": translate_message("A data da cobertura não pode estar no futuro.")})
    earliest_date = max(
        (value for value in (animal.birth_date, animal.entry_date) if value is not None),
        default=None,
    )
    if earliest_date and mating_date < earliest_date:
        raise serializers.ValidationError({"mating_date": translate_message("A data da cobertura não pode anteceder o nascimento ou a entrada da matriz.")})

    expected_birth_date = mating_date + datetime.timedelta(days=114)
    mating = Mating.objects.create(
        female=animal,
        mating_date=mating_date,
        mating_type=mating_type,
        sire_info=sire_info,
        expected_birth_date=expected_birth_date,
        notes=notes,
    )
    remember_operator_record(user, mating)
    animal.previous_phase = animal.reproductive_status
    animal.reproductive_status = Animal.ReproductiveStatus.COBERTA
    animal.save(update_fields=["previous_phase", "reproductive_status"])
    HistoricoEvento.objects.create(
        farm=animal.farm,
        tipo_evento="Cobertura",
        descricao=f"Tipo: {mating.get_mating_type_display()} | Reprodutor: {sire_info or 'N/A'}",
        data_evento=mating_date,
        matriz=animal,
        metadata={
            "expected_status": values["expected_status"],
            "mating_id": str(mating.pk),
            "mating_type": mating_type,
            "mating_date": mating_date.isoformat(),
            "sire_info": sire_info,
            "notes": notes,
            "expected_birth_date": expected_birth_date.isoformat(),
            "request_key": request_key,
        },
    )
    return _swine_mating_receipt(animal, mating, request_key), True


def _swine_mating_receipt(animal, mating, request_key):
    return {
        "id": str(mating.pk),
        "female_id": str(animal.pk),
        "request_key": request_key,
        "mating_date": mating.mating_date.isoformat(),
        "mating_type": mating.mating_type,
        "sire_info": mating.sire_info,
        "expected_birth_date": mating.expected_birth_date.isoformat() if mating.expected_birth_date else None,
        "status": mating.status,
    }
