"""Reviewed documentary stage execution. No mating or inventory effects."""
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.http import Http404
from django.utils import timezone
from rest_framework import serializers, exceptions
from .models import CattleProtocolStep
from . import mobile_protocols as reads
from .mobile_cattle_occurrence import writable
from .mobile_vaccination import Strict, fingerprint
from .mobile_weighing import Conflict
from .cattle_improvements import execute_protocol_step
SALT='livestock.mobile-protocol-documentary-execution.v1'

class Scope(serializers.Serializer):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])
    step=serializers.UUIDField()

class Input(Strict):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])
    step=serializers.UUIDField()
    date=serializers.DateField()
    notes=serializers.CharField(max_length=1000,allow_blank=True)
    documentary=serializers.BooleanField()
    def validate_documentary(self,value):
        if value is not True:raise serializers.ValidationError('Confirme o registro sem cobertura e sem consumo de estoque.')
        return value

def context(user,params,lock=False):
    writable(user)
    values=Scope(data=params);values.is_valid(raise_exception=True);v=values.validated_data
    runs=reads.rows(user,'protocol-runs',v)
    qs=CattleProtocolStep.objects.filter(run_id__in=runs.values('pk'))
    qs=qs.select_related('task','run','run__animal').only('id','number','updated_at','executed_at','executed_date',
        'task__id','task__status','task__due_date','task__assigned_to_id','task__updated_at',
        'run__id','run__start_date','run__created_by_id','run__updated_at','run__steps_snapshot',
        'run__animal__id','run__animal__identifier','run__animal__farm_id','run__animal__updated_at')
    if lock:qs=qs.select_for_update()
    step=get_object_or_404(qs,pk=v['step'])
    if user.role=='operator' and step.task.assigned_to_id!=user.pk and step.run.created_by_id!=user.pk:raise exceptions.PermissionDenied()
    if step.executed_at or step.task.status not in ['open','in_progress']:raise Conflict()
    if step.run.executions.filter(number__lt=step.number,executed_at__isnull=True).exists():raise serializers.ValidationError({'step':'Conclua as etapas anteriores.'})
    if not 0<=step.number<len(step.run.steps_snapshot):raise Conflict()
    if CattleProtocolStep.objects.filter(pk=step.pk).exclude(inventory_lot__isnull=True,inventory_quantity__isnull=True,inventory_movement__isnull=True,mating__isnull=True).exists():raise Conflict()
    public={'step':str(step.pk),'run':str(step.run_id),'farm':str(step.run.animal.farm_id),'production':v['production'],
        'animal':{'id':str(step.run.animal_id),'identifier':step.run.animal.identifier},'name':step.run.steps_snapshot[step.number]['name'],
        'number':step.number,'due_date':str(step.task.due_date),'earliest_date':str(step.run.start_date),'today':str(timezone.localdate()),'timezone':settings.TIME_ZONE}
    digest=fingerprint({'public':public,'step_version':str(step.updated_at),'task_version':str(step.task.updated_at),'run_version':str(step.run.updated_at),
        'animal_version':str(step.run.animal.updated_at),'task_status':step.task.status,'assignee':str(step.task.assigned_to_id),'creator':str(step.run.created_by_id),
        'previous':[{key:str(value) for key,value in row.items()} for row in step.run.executions.filter(number__lt=step.number).order_by('number').values('id','updated_at','executed_at')]})
    return step,public,digest

def options(user,params):return context(user,params)[1]

def preview(user,v):
    _,public,digest=context(user,v)
    if not public['earliest_date']<=str(v['date'])<=public['today']:raise serializers.ValidationError({'date':'Use data entre o início do protocolo e hoje.'})
    command=Input(v).data
    return {**public,'command':command,'preview_token':signing.dumps({'user':str(user.pk),'org':str(user.organization_id),'command':command,'digest':digest},salt=SALT,compress=True)}

@transaction.atomic
def confirm(user,token):
    writable(user)
    try:intent=signing.loads(token,salt=SALT,max_age=900)
    except signing.BadSignature:raise serializers.ValidationError({'preview_token':'Revisão inválida ou expirada.'})
    if intent['user']!=str(user.pk) or intent['org']!=str(user.organization_id):raise exceptions.PermissionDenied()
    values=Input(data=intent['command']);values.is_valid(raise_exception=True);v=values.validated_data
    try:step,public,digest=context(user,v,lock=True)
    except (Http404,serializers.ValidationError) as error:raise Conflict() from error
    if digest!=intent['digest']:raise Conflict()
    row=execute_protocol_step(user,step,v['date'],v['notes'],documentary=True)
    return {'id':str(row.pk),'run':str(row.run_id),'farm':v['farm'],'executed_date':str(row.executed_date),'notes':row.notes,'documentary':True,'status':'done'}
