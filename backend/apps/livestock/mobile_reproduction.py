"""Cost-free cattle reproduction reads using the established server groups."""
from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers, exceptions
from .models import Animal
from .mobile_clinic import authorize
from .cattle_selectors import cattle_reproduction_groups, with_cattle_reproduction
from .cattle_improvements import filter_purpose


class Query(serializers.Serializer):
    production = serializers.ChoiceField(choices=['beef', 'dairy'])
    farm = serializers.UUIDField(required=False)
    group = serializers.ChoiceField(choices=['all', *cattle_reproduction_groups()], default='all')
    search = serializers.CharField(max_length=100, allow_blank=True, default='')


def rows(user, query):
    authorize(user)
    if user.role == 'operator' and not user.allowed_livestock.filter(code='bovinos').exists():
        raise exceptions.PermissionDenied()
    qs = Animal.objects.filter(farm__organization_id=user.organization_id, species__code='bovinos', status='active')
    qs = with_cattle_reproduction(filter_purpose(qs, query['production']))
    if query.get('farm'):
        qs = qs.filter(farm_id=query['farm'])
    if query.get('search'):
        qs = qs.filter(Q(identifier__icontains=query['search']) | Q(cattle_profile__name__icontains=query['search']))
    return qs.select_related('farm', 'cattle_profile').only(
        'id', 'identifier', 'farm__id', 'farm__name', 'cattle_purpose', 'gender', 'category',
        'reproductive_status', 'birth_date', 'entry_date', 'notes', 'cattle_profile__is_lactating'
    ).order_by('identifier', 'id')


def metadata(qs):
    groups = cattle_reproduction_groups()
    return {'today': str(timezone.localdate()), 'timezone': settings.TIME_ZONE, 'groups': list(groups),
            'summary': qs.aggregate(females=Count('pk', filter=Q(gender='F')),
                **{key: Count('pk', filter=query) for key, query in groups.items()})}


def data(animal, detail=False):
    profile = getattr(animal, 'cattle_profile', None)
    result = {'id': str(animal.pk), 'identifier': animal.identifier, 'farm': str(animal.farm_id),
        'farm_name': animal.farm.name, 'cattle_purpose': animal.cattle_purpose, 'gender': animal.gender,
        'category': animal.category, 'reproductive_status': animal.reproductive_status,
        'is_lactating': profile.is_lactating if profile else animal.reproductive_status == 'lactante',
        'last_mating_date': str(animal.last_mating_date) if animal.last_mating_date else None,
        'pregnancy_start_date': str(animal.pregnancy_start_date) if animal.pregnancy_start_date else None,
        'expected_birth_date': str(animal.expected_birth_date) if animal.expected_birth_date else None}
    if detail:
        result.update(notes=animal.notes, birth_date=str(animal.birth_date) if animal.birth_date else None,
                      entry_date=str(animal.entry_date) if animal.entry_date else None)
    return result
