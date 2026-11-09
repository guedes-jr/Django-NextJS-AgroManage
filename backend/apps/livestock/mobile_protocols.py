"""Read-only, tenant scoped bovine protocol projections without cost snapshots."""
from django.conf import settings
from django.db.models import Count, Q, F, Exists, OuterRef
from django.utils import timezone
from rest_framework import serializers, exceptions
from .mobile_clinic import authorize
from .models import CattleProtocol, CattleProtocolRun, CattleProtocolStep

KINDS = ['protocols', 'protocol-runs']

class Query(serializers.Serializer):
    production = serializers.ChoiceField(choices=['beef', 'dairy'])
    farm = serializers.UUIDField(required=False)
    search = serializers.CharField(max_length=100, allow_blank=True, default='')

def rows(user, kind, params):
    authorize(user)
    if user.role == 'operator' and not user.allowed_livestock.filter(code='bovinos').exists():
        raise exceptions.PermissionDenied()
    kind = serializers.ChoiceField(choices=KINDS).run_validation(kind)
    query = Query(data=params); query.is_valid(raise_exception=True); q = query.validated_data
    if kind == 'protocols':
        result = CattleProtocol.objects.filter(organization=user.organization).only('id', 'name', 'version', 'steps')
        if q['search']: result = result.filter(name__icontains=q['search'])
        return result.order_by('name', '-version', 'id')
    invalid = CattleProtocolStep.objects.filter(run_id=OuterRef('pk')).exclude(
        Q(task__organization=user.organization) & (Q(task__farm_id=F('run__animal__farm_id')) | Q(task__farm__isnull=True)) &
        (Q(task__assigned_to__isnull=True) | Q(task__assigned_to__organization=user.organization)) &
        (Q(executed_by__isnull=True) | Q(executed_by__organization=user.organization)))
    result = CattleProtocolRun.objects.filter(animal__farm__organization=user.organization, protocol__organization=user.organization,
        animal__species__code='bovinos', animal__cattle_purpose__in=[q['production'], 'dual']).alias(invalid=Exists(invalid)).filter(invalid=False)
    if q.get('farm'): result = result.filter(animal__farm_id=q['farm'])
    if q['search']: result = result.filter(Q(animal__identifier__icontains=q['search']) | Q(protocol__name__icontains=q['search']))
    return result.select_related('animal__farm', 'protocol').only('id', 'start_date', 'steps_snapshot', 'created_by_id', 'animal__id', 'animal__identifier',
        'animal__cattle_purpose', 'animal__farm__id', 'animal__farm__name', 'protocol__id', 'protocol__name', 'protocol__version').annotate(
        total=Count('executions'), completed=Count('executions', filter=Q(executions__executed_at__isnull=False))).order_by('-start_date', '-created_at', '-id')

def data(row, kind):
    if kind == 'protocols': return {'id': str(row.pk), 'name': row.name, 'version': row.version, 'steps': row.steps}
    return {'id': str(row.pk), 'farm': str(row.animal.farm_id), 'farm_name': row.animal.farm.name,
        'animal': {'id': str(row.animal_id), 'identifier': row.animal.identifier, 'purpose': row.animal.cattle_purpose},
        'protocol': {'id': str(row.protocol_id), 'name': row.protocol.name, 'version': row.protocol.version},
        'start_date': str(row.start_date), 'total': row.total, 'completed': row.completed}

def detail(row, kind, user=None):
    result = data(row, kind)
    if kind == 'protocols': return result
    steps = row.executions.select_related('task__assigned_to', 'executed_by').only('id', 'number', 'run_id', 'executed_at', 'executed_date', 'notes',
        'task__id', 'task__due_date', 'task__status', 'task__assigned_to__id', 'task__assigned_to__full_name', 'executed_by__id', 'executed_by__full_name').order_by('number')
    preceding_done=True
    capability={}
    for step in steps:
        capability[step.pk]=bool(user and (user.role in ['admin','manager'] or user.role=='operator' and not user.operator_read_only and (step.task.assigned_to_id==user.pk or row.created_by_id==user.pk)) and row.start_date<=timezone.localdate() and preceding_done and not step.executed_at and step.task.status in ['open','in_progress'])
        preceding_done=preceding_done and bool(step.executed_at)
    result.update(timezone=settings.TIME_ZONE, steps=[{'id': str(step.pk), 'number': step.number,
        'can_execute_documentary':capability[step.pk], 'name': row.steps_snapshot[step.number]['name'], 'day': row.steps_snapshot[step.number]['day'],
        'due_date': str(step.task.due_date), 'executed_date': str(step.executed_date) if step.executed_date else None,
        'status': 'done' if step.executed_at else 'cancelled' if step.task.status == 'cancelled' else 'overdue' if step.task.due_date < timezone.localdate() else 'pending',
        'assigned_to': step.task.assigned_to.full_name if step.task.assigned_to_id else '',
        'executed_by': step.executed_by.full_name if step.executed_by_id else '', 'notes': step.notes} for step in steps])
    return result
