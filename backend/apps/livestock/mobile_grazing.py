"""Tenant-bound, cost-free pasture occupation consultation for the native app."""
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers, exceptions
from .models import CattlePasture, CattleGrazing
from .mobile_clinic import authorize


class Query(serializers.Serializer):
    farm = serializers.UUIDField()
    pasture = serializers.UUIDField()
    state = serializers.ChoiceField(choices=['all', 'open', 'closed'], default='all')
    search = serializers.CharField(max_length=100, allow_blank=True, default='')


def rows(user, params):
    authorize(user)
    if user.role == 'operator' and not user.allowed_livestock.filter(code='bovinos').exists():
        raise exceptions.PermissionDenied()
    values = Query(data=params)
    values.is_valid(raise_exception=True)
    query = values.validated_data
    pasture = get_object_or_404(CattlePasture.objects.only('id'), pk=query['pasture'],
        farm_id=query['farm'], farm__organization_id=user.organization_id)
    qs = CattleGrazing.objects.filter(pasture=pasture, batch__farm_id=query['farm'],
        batch__farm__organization_id=user.organization_id, batch__species__code='bovinos')
    if query['state'] != 'all':
        qs = qs.filter(exit_date__isnull=query['state'] == 'open')
    if query['search']:
        qs = qs.filter(Q(batch__batch_code__icontains=query['search']) | Q(batch__name__icontains=query['search']))
    return qs.select_related('pasture__farm', 'batch').only(
        'id', 'entry_date', 'exit_date', 'notes', 'updated_at', 'pasture__id', 'pasture__name', 'pasture__updated_at',
        'pasture__farm__id', 'pasture__farm__name', 'batch__id', 'batch__batch_code',
        'batch__cattle_purpose', 'batch__status', 'batch__quantity', 'batch__updated_at').order_by('-entry_date', '-created_at', '-id')


def data(row):
    return {'id': str(row.pk), 'farm': str(row.pasture.farm_id), 'farm_name': row.pasture.farm.name,
        'pasture': str(row.pasture_id), 'pasture_name': row.pasture.name,
        'batch': str(row.batch_id), 'batch_code': row.batch.batch_code,
        'batch_purpose': row.batch.cattle_purpose, 'batch_status': row.batch.status,
        'current_quantity': row.batch.quantity, 'entry_date': str(row.entry_date),
        'exit_date': str(row.exit_date) if row.exit_date else None, 'notes': row.notes}
