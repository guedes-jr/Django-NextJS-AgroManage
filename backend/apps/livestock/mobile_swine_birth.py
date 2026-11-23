"""Mobile farrowing (parto) tied to the current ongoing swine pregnancy (P11.07)."""
import datetime
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import exceptions, serializers

from common.operator_access import remember_operator_record
from .mobile_clinic import authorize
from .mobile_vaccination import Strict
from .models import Animal, Birth, HistoricoEvento, Pregnancy
from .services import ensure_birth_batch

MAX_PIGLETS = 40


class Conflict(exceptions.APIException):
    status_code = 409
    default_detail = "A gestação ou a matriz mudou. Atualize antes de registrar o parto."
    default_code = "swine_birth_conflict"


class Input(Strict):
    request_key = serializers.UUIDField()
    expected_farm = serializers.UUIDField()
    expected_pregnancy = serializers.UUIDField()
    animal_version = serializers.DateTimeField()
    pregnancy_version = serializers.DateTimeField()
    birth_date = serializers.DateField()
    live_born = serializers.IntegerField(min_value=0, max_value=MAX_PIGLETS)
    stillborn = serializers.IntegerField(min_value=0, max_value=MAX_PIGLETS)
    mummified = serializers.IntegerField(min_value=0, max_value=MAX_PIGLETS)
    avg_weight_kg = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=Decimal("0.01"), max_value=Decimal("10"), required=False, allow_null=True,
    )
    expected_weaning_days = serializers.IntegerField(min_value=1, max_value=90)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)

    def validate(self, attrs):
        if attrs["live_born"] + attrs["stillborn"] + attrs["mummified"] < 1:
            raise serializers.ValidationError({"live_born": "Informe ao menos um leitão nascido."})
        if attrs["live_born"] + attrs["stillborn"] + attrs["mummified"] > MAX_PIGLETS:
            raise serializers.ValidationError({"live_born": f"O total de nascidos não pode passar de {MAX_PIGLETS}."})
        return attrs


def _scope(user, params, command=False):
    authorize(user)
    if user.role == "operator" and not user.allowed_livestock.filter(code="suinos").exists():
        raise exceptions.PermissionDenied()
    if command and user.role == "operator" and user.operator_read_only:
        raise exceptions.PermissionDenied()
    if params.get("species") != "suinos":
        raise exceptions.NotFound()


def _pregnancies(user):
    return Pregnancy.objects.filter(
        female__farm__organization_id=user.organization_id,
        female__species__code="suinos",
    )


def context(user, pregnancy_id, params, lock=False, command=None):
    _scope(user, params, command=bool(command))
    pregnancies = _pregnancies(user).filter(pk=pregnancy_id).select_related("female__farm")
    pregnancy = pregnancies.select_for_update(of=("self",)).first() if lock else pregnancies.first()
    if pregnancy is None:
        raise exceptions.NotFound()
    animals = Animal.objects.filter(pk=pregnancy.female_id).select_related("farm")
    animal = animals.select_for_update(of=("self",)).first() if lock else animals.first()
    if (
        pregnancy.status != Pregnancy.Status.ONGOING
        or animal.status != "active"
        or animal.gender != Animal.Gender.FEMALE
        or animal.category not in ("Marrã", "Matriz")
        or animal.reproductive_status != Animal.ReproductiveStatus.GESTANTE
        or Birth.objects.filter(pregnancy=pregnancy).exists()
    ):
        raise Conflict()

    if command:
        if (
            animal.farm_id != command["expected_farm"]
            or pregnancy.pk != command["expected_pregnancy"]
            or animal.updated_at != command["animal_version"]
            or pregnancy.updated_at != command["pregnancy_version"]
        ):
            raise Conflict()
        if not pregnancy.start_date <= command["birth_date"] <= timezone.localdate():
            raise serializers.ValidationError({"birth_date": "Use uma data entre o início da gestação e hoje."})

    return pregnancy, animal, {
        "today": str(timezone.localdate()),
        "timezone": settings.TIME_ZONE,
        "animal": {
            "id": str(animal.pk),
            "identifier": animal.identifier,
            "category": animal.category,
            "farm": str(animal.farm_id),
            "farm_name": animal.farm.name,
            "version": animal.updated_at.isoformat(),
        },
        "pregnancy": {
            "id": str(pregnancy.pk),
            "start_date": str(pregnancy.start_date),
            "expected_birth_date": str(pregnancy.expected_birth_date) if pregnancy.expected_birth_date else None,
            "version": pregnancy.updated_at.isoformat(),
        },
        "birth_order": animal.birth_count + 1,
        "default_weaning_days": Birth._meta.get_field("expected_weaning_days").default,
        "max_piglets": MAX_PIGLETS,
    }


def _same_command(metadata, command):
    weight = command.get("avg_weight_kg")
    return (
        metadata.get("pregnancy_id") == str(command["expected_pregnancy"])
        and metadata.get("birth_date") == command["birth_date"].isoformat()
        and metadata.get("live_born") == command["live_born"]
        and metadata.get("stillborn") == command["stillborn"]
        and metadata.get("mummified") == command["mummified"]
        and metadata.get("avg_weight_kg") == (str(weight) if weight is not None else None)
        and metadata.get("expected_weaning_days") == command["expected_weaning_days"]
        and metadata.get("notes", "") == command.get("notes", "")
    )


def _receipt(birth, request_key):
    female = birth.female
    return {
        "id": str(birth.pk),
        "pregnancy": str(birth.pregnancy_id),
        "animal": str(female.pk),
        "request_key": request_key,
        "birth_date": birth.birth_date.isoformat(),
        "birth_order": birth.birth_order,
        "live_born": birth.live_born,
        "stillborn": birth.stillborn,
        "mummified": birth.mummified,
        "batch": str(birth.batch_id) if birth.batch_id else None,
        "expected_weaning_date": (birth.birth_date + datetime.timedelta(days=birth.expected_weaning_days)).isoformat(),
        "status": female.reproductive_status,
    }


@transaction.atomic
def record(user, pregnancy_id, params, command):
    _scope(user, params, command=True)
    request_key = str(command["request_key"])
    existing = HistoricoEvento.objects.filter(
        tipo_evento="Parto",
        matriz__farm__organization_id=user.organization_id,
        metadata__request_key=request_key,
    ).first()
    if existing:
        metadata = existing.metadata or {}
        if not _same_command(metadata, command):
            raise Conflict()
        birth = Birth.objects.filter(pk=metadata.get("birth_id"), pregnancy_id=pregnancy_id).select_related("female").first()
        if birth is None:
            raise exceptions.APIException("Não foi possível confirmar o parto já registrado.")
        return _receipt(birth, request_key), False

    pregnancy, animal, _ = context(user, pregnancy_id, params, lock=True, command=command)
    notes = command.get("notes", "")
    birth = Birth.objects.create(
        pregnancy=pregnancy,
        female=animal,
        birth_date=command["birth_date"],
        live_born=command["live_born"],
        stillborn=command["stillborn"],
        mummified=command["mummified"],
        avg_weight_kg=command.get("avg_weight_kg"),
        expected_weaning_days=command["expected_weaning_days"],
        notes=notes,
    )
    ensure_birth_batch(birth)
    remember_operator_record(user, birth)
    weight = command.get("avg_weight_kg")
    HistoricoEvento.objects.create(
        farm=animal.farm,
        tipo_evento="Parto",
        descricao=f"Nascidos: {birth.total_born} (Vivos: {birth.live_born}, Natimortos: {birth.stillborn}, Mumificados: {birth.mummified})",
        data_evento=birth.birth_date,
        matriz=animal,
        metadata={
            "birth_id": str(birth.pk),
            "pregnancy_id": str(pregnancy.pk),
            "birth_date": birth.birth_date.isoformat(),
            "live_born": birth.live_born,
            "stillborn": birth.stillborn,
            "mummified": birth.mummified,
            "total_born": birth.total_born,
            "avg_weight_kg": str(weight) if weight is not None else None,
            "expected_weaning_days": birth.expected_weaning_days,
            "expected_weaning_date": str(birth.birth_date + datetime.timedelta(days=birth.expected_weaning_days)),
            "notes": notes,
            "request_key": request_key,
            "responsible_id": str(user.pk),
        },
    )
    birth.refresh_from_db()
    return _receipt(birth, request_key), True
