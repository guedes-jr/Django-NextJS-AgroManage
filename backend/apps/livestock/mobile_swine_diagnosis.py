"""Mobile diagnosis tied to the current pending swine mating."""
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import exceptions, serializers

from .mobile_clinic import authorize
from .mobile_vaccination import Strict
from .models import Animal, HistoricoEvento, Mating, Pregnancy


class Conflict(exceptions.APIException):
    status_code = 409
    default_detail = "A matriz ou a cobertura mudou. Atualize antes de registrar o diagnóstico."


class Input(Strict):
    expected_farm = serializers.UUIDField()
    expected_mating = serializers.UUIDField()
    animal_version = serializers.DateTimeField()
    mating_version = serializers.DateTimeField()
    diagnosis_date = serializers.DateField()
    result = serializers.ChoiceField(choices=("positive", "negative"))


def context(user, animal_id, params, lock=False, command=None):
    authorize(user)
    if user.role == "operator" and not user.allowed_livestock.filter(code="suinos").exists():
        raise exceptions.PermissionDenied()
    if command and user.role == "operator" and user.operator_read_only:
        raise exceptions.PermissionDenied()
    if params.get("species") != "suinos":
        raise exceptions.NotFound()

    animals = Animal.objects.filter(
        pk=animal_id,
        farm__organization_id=user.organization_id,
        species__code="suinos",
        status="active",
        gender=Animal.Gender.FEMALE,
        category__in=("Marrã", "Matriz"),
    ).select_related("farm").only(
        "id", "identifier", "farm__id", "farm__name", "gender", "category",
        "reproductive_status", "previous_phase", "updated_at",
    )
    animal = animals.select_for_update(of=("self",)).first() if lock else animals.first()
    if animal is None:
        raise exceptions.NotFound()
    if animal.reproductive_status != Animal.ReproductiveStatus.COBERTA:
        raise Conflict()

    matings = Mating.objects.filter(female=animal).order_by("-mating_date", "-created_at", "-id")
    if lock:
        matings = matings.select_for_update()
    mating = matings.first()
    if not mating or mating.status != Mating.Status.PENDING_DG:
        raise Conflict()
    if (
        matings.filter(mating_date=mating.mating_date).count() != 1
        or Pregnancy.objects.filter(female=animal, status=Pregnancy.Status.ONGOING).exists()
        or Pregnancy.objects.filter(mating=mating).exists()
    ):
        raise Conflict()

    allowed_results = (
        ("positive", "negative")
        if mating.expected_birth_date and mating.expected_birth_date >= mating.mating_date
        else ("negative",)
    )
    if command:
        if (
            animal.farm_id != command["expected_farm"]
            or mating.pk != command["expected_mating"]
            or animal.updated_at != command["animal_version"]
            or mating.updated_at != command["mating_version"]
        ):
            raise Conflict()
        if not mating.mating_date <= command["diagnosis_date"] <= timezone.localdate():
            raise serializers.ValidationError({"diagnosis_date": "Use uma data entre a cobertura e hoje."})
        if command["result"] not in allowed_results:
            raise serializers.ValidationError({
                "result": "A cobertura não possui previsão válida para confirmar gestação. Revise o registro no web."
            })

    return animal, mating, {
        "today": str(timezone.localdate()),
        "timezone": settings.TIME_ZONE,
        "animal": {
            "id": str(animal.pk),
            "identifier": animal.identifier,
            "farm": str(animal.farm_id),
            "farm_name": animal.farm.name,
            "version": animal.updated_at.isoformat(),
        },
        "mating": {
            "id": str(mating.pk),
            "date": str(mating.mating_date),
            "version": mating.updated_at.isoformat(),
            "expected_birth_date": str(mating.expected_birth_date) if mating.expected_birth_date else None,
        },
        "allowed_results": list(allowed_results),
    }


@transaction.atomic
def record(user, animal_id, params, command):
    animal, mating, _ = context(user, animal_id, params, lock=True, command=command)
    result = command["result"]
    day = command["diagnosis_date"]
    metadata = {
        "resultado": result,
        "data_diagnostico": str(day),
        "mating_id": str(mating.pk),
        "responsible_id": str(user.pk),
    }
    if result == "positive":
        animal.reproductive_status = Animal.ReproductiveStatus.GESTANTE
        animal.save(update_fields=["reproductive_status", "updated_at"])
        Pregnancy.objects.create(
            female=animal,
            mating=mating,
            start_date=mating.mating_date,
            expected_birth_date=mating.expected_birth_date,
            status=Pregnancy.Status.ONGOING,
        )
        description = "Resultado: POSITIVO — Gestação confirmada."
        mating.status = Mating.Status.CONFIRMED
    else:
        previous = animal.previous_phase or Animal.ReproductiveStatus.VAZIA
        animal.reproductive_status = previous
        animal.previous_phase = ""
        animal.save(update_fields=["reproductive_status", "previous_phase", "updated_at"])
        metadata["previous_phase"] = previous
        description = f"Resultado: NEGATIVO — Retorno para {previous}."
        mating.status = Mating.Status.FAILED

    HistoricoEvento.objects.create(
        farm=animal.farm,
        tipo_evento="Diagnóstico de Gestação",
        descricao=description,
        data_evento=day,
        matriz=animal,
        metadata=metadata,
    )
    mating.save(update_fields=["status", "updated_at"])
    return {
        "animal": str(animal.pk),
        "mating": str(mating.pk),
        "result": result,
        "status": animal.reproductive_status,
    }
