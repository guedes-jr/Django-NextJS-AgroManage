"""Native pasture forms: scoped metadata and versioned writes through existing validation."""
from datetime import timezone as utc
from decimal import Decimal
from django.db import transaction, IntegrityError
from django.shortcuts import get_object_or_404
from rest_framework import serializers, exceptions
from apps.farms.models import Farm
from .models import CattlePasture
from .mobile_grazing_entry import writable
from .mobile_vaccination import Strict


class Conflict(exceptions.APIException):
    status_code = 409
    default_detail = 'O pasto mudou ou o nome já foi utilizado. Confira os dados atuais.'


class Scope(serializers.Serializer):
    farm = serializers.UUIDField()


class Input(Strict):
    farm = serializers.UUIDField()
    name = serializers.CharField(max_length=100)
    area_ha = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))
    max_stocking_ua_ha = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=Decimal('0.01'), allow_null=True)
    availability = serializers.ChoiceField(choices=['unknown','available','resting','blocked'])
    availability_reason = serializers.CharField(max_length=255, allow_blank=True)
    notes = serializers.CharField(allow_blank=True)


class EditInput(Input):
    expected_version = serializers.DateTimeField()


def farm(user, params):
    writable(user)
    values = Scope(data=params); values.is_valid(raise_exception=True)
    return get_object_or_404(Farm.objects.only('id','name'), pk=values.validated_data['farm'], organization_id=user.organization_id)


def options(user, params):
    row = farm(user, params)
    return {'farm': {'id':str(row.pk), 'name':row.name}}


def data(row):
    return {'id':str(row.pk), 'farm':str(row.farm_id), 'farm_name':row.farm.name,
        'version':row.updated_at.astimezone(utc.utc).isoformat(), 'name':row.name,
        'area_ha':str(row.area_ha), 'max_stocking_ua_ha':str(row.max_stocking_ua_ha) if row.max_stocking_ua_ha is not None else None,
        'availability':row.availability, 'availability_reason':row.availability_reason, 'notes':row.notes}


def record(user, pasture_id, params, lock=False):
    owner = farm(user, params)
    qs = CattlePasture.objects.filter(pk=pasture_id, farm=owner).select_related('farm')
    return get_object_or_404(qs.select_for_update(of=('self',)) if lock else qs)


@transaction.atomic
def save(request, values, pasture_id=None):
    from .cattle_serializers import CattlePastureSerializer
    owner = farm(request.user, values)
    instance = record(request.user, pasture_id, {'farm':owner.pk}, lock=True) if pasture_id else None
    if instance and instance.updated_at != values['expected_version']:
        raise Conflict()
    payload = {key:value for key,value in values.items() if key != 'expected_version'}
    # Preserve serializer rules, including immutable farm and occupied-pasture restrictions.
    serializer = CattlePastureSerializer(instance, data=payload, context={'request':request})
    serializer.is_valid(raise_exception=True)
    try:
        with transaction.atomic():
            row = serializer.save()
    except IntegrityError as error:
        if CattlePasture.objects.filter(farm=owner, name=values['name']).exclude(pk=instance.pk if instance else None).exists():
            raise Conflict() from error
        raise
    return {'id':str(row.pk), 'farm':str(row.farm_id), 'version':row.updated_at.astimezone(utc.utc).isoformat()}
