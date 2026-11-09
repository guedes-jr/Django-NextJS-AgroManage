"""Essential individual health documentation; no dispensing or financial effects."""
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import exceptions, serializers

from .mobile_clinic import authorize, animals, species
from .models import Animal, HealthRecord


def writable(user):
    authorize(user)
    if user.role == 'operator' and user.operator_read_only:
        raise exceptions.PermissionDenied()


def options(user):
    authorize(user)
    return {
        'today': str(timezone.localdate()),
        'timezone': settings.TIME_ZONE,
        'treatment_types': [
            {'value': value, 'label': label}
            for value, label in HealthRecord.TreatmentType.choices
        ],
    }


def validate_date(target, day):
    if day > timezone.localdate():
        raise serializers.ValidationError({'application_date': 'A data não pode estar no futuro.'})
    if (target.entry_date and day < target.entry_date) or (target.birth_date and day < target.birth_date):
        raise serializers.ValidationError({'application_date': 'A data antecede a entrada ou nascimento do animal.'})


class HealthInput(serializers.ModelSerializer):
    animal = serializers.UUIDField()
    expected_farm = serializers.UUIDField(write_only=True)
    description = serializers.CharField(max_length=8000)
    notes = serializers.CharField(max_length=8000, allow_blank=True, default='')

    class Meta:
        model = HealthRecord
        fields = ['animal', 'expected_farm', 'treatment_type', 'application_date', 'description', 'veterinary', 'notes']
        extra_kwargs = {'treatment_type': {'required': True}}

    def to_internal_value(self, value):
        if not isinstance(value, dict) or set(value) - set(self.fields):
            raise serializers.ValidationError({'non_field_errors': ['Campos não reconhecidos.']})
        return super().to_internal_value(value)

    def validate(self, attrs):
        user = self.context['request'].user
        writable(user)
        target = animals(user, {'animal': attrs['animal']}).only(
            'id', 'identifier', 'farm__id', 'farm__name', 'species__code', 'entry_date', 'birth_date'
        ).first()
        if not target:
            raise exceptions.NotFound()
        if target.farm_id != attrs['expected_farm']:
            raise serializers.ValidationError({'expected_farm': 'O animal mudou de fazenda. Atualize a seleção.'})
        validate_date(target, attrs['application_date'])
        attrs['animal'] = target
        attrs['farm'] = target.farm
        return attrs

    @transaction.atomic
    def create(self, validated):
        user = self.context['request'].user
        writable(user)
        expected = validated.pop('expected_farm')
        # Explicit outer queryset: PostgreSQL must not lock a DISTINCT query or joined farm.
        qs = Animal.objects.filter(
            pk=validated['animal'].pk, status='active', farm__organization_id=user.organization_id
        ).select_related('farm').only(
            'id', 'farm__id', 'farm__organization_id', 'species_id', 'entry_date', 'birth_date'
        ).select_for_update(of=('self',))
        if user.role == 'operator':
            qs = qs.filter(species__in=species(user))
        target = qs.first()
        if not target or target.farm_id != expected:
            raise serializers.ValidationError({'animal': 'O animal mudou. Atualize antes de registrar.'})
        validate_date(target, validated['application_date'])
        validated['animal'] = target
        validated['farm'] = target.farm
        return HealthRecord.objects.create(**validated)
