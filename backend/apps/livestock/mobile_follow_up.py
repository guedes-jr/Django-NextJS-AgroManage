"""Versioned sanitary follow-up resolution; never repeats clinical/stock effects."""
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from . import mobile_management
from .models import CattleManagement
from .mobile_weighing import Conflict
from .mobile_vaccination import Strict
from .cattle_planning import resolve_follow_up


class Scope(Strict):
    farm = serializers.UUIDField()
    production = serializers.ChoiceField(choices=['beef', 'dairy'])


class Input(Scope):
    expected_version = serializers.DateTimeField()
    status = serializers.ChoiceField(choices=['done', 'cancelled'])
    note = serializers.CharField(max_length=500)
    execution = serializers.UUIDField(allow_null=True)

    def validate(self, attrs):
        if (attrs['status'] == 'done') != bool(attrs['execution']):
            raise serializers.ValidationError({'execution': 'Vincule uma execução apenas ao concluir o retorno.'})
        return attrs


def source(user, pk, params):
    values = Scope(data={key: params.get(key) for key in ['farm', 'production']})
    values.is_valid(raise_exception=True)
    query = values.validated_data
    row = get_object_or_404(mobile_management.rows(user, query), pk=pk)
    if row.kind != 'sanitary' or row.status != 'confirmed' or not row.next_procedure_date or row.follow_up_status != 'pending':
        raise Conflict()
    return row, query


def options(user, pk, params):
    row, query = source(user, pk, params)
    return {'record': mobile_management.data(row, detail=True), 'version': row.updated_at.isoformat(), 'production': query['production']}


def candidates(user, pk, params):
    row, query = source(user, pk, params)
    search = serializers.CharField(max_length=100, allow_blank=True).run_validation(params.get('search', ''))
    original = row.entries.values_list('animal_id', flat=True)
    return mobile_management.rows(user, {**query, 'kind': 'sanitary', 'status': 'confirmed', 'search': search}).exclude(pk=row.pk).filter(
        date__gte=row.date).annotate(covered=Count('entries', filter=Q(entries__animal_id__in=original), distinct=True)).filter(covered=row.participant_count)


@transaction.atomic
def resolve(user, pk, values):
    # Authorize before acquiring locks. Lock both records in stable order, including
    # when two pending follow-ups refer to one another as their execution.
    row, query = source(user, pk, values)
    ids = [row.pk] + ([values['execution']] if values['execution'] else [])
    list(CattleManagement.objects.filter(pk__in=ids, farm__organization=user.organization).order_by('pk').select_for_update().values_list('pk', flat=True))
    row, query = source(user, pk, values)
    if row.updated_at != values['expected_version']:
        raise Conflict()
    execution = None
    if values['execution']:
        execution = get_object_or_404(candidates(user, pk, query), pk=values['execution'])
    resolved = resolve_follow_up(row, user, status=values['status'], note=values['note'], execution=execution)
    return {'id': str(resolved.pk), 'farm': str(resolved.farm_id), 'follow_up_status': resolved.follow_up_status,
            'follow_up_note': resolved.follow_up_note, 'execution': str(resolved.follow_up_execution_id) if resolved.follow_up_execution_id else None}
