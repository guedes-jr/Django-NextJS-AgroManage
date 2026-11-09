"""Native operational occurrences and Agenda tasks, without clinical/stock effects."""
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, exceptions
from apps.accounts.models import User
from apps.farms.models import Farm
from apps.tasks.models import Task
from .models import Animal, AnimalBatch
from . import mobile_cattle_operations as reads
from .cattle_improvements import create_occurrence, resolve_occurrence, filter_purpose
from .mobile_vaccination import Strict, fingerprint
from .mobile_weighing import Conflict

SALT='livestock.mobile-cattle-occurrence-resolution.v1'


def writable(user):
    reads.authorize(user)
    if user.role=='operator' and (user.operator_read_only or not user.allowed_livestock.filter(code='bovinos').exists()): raise exceptions.PermissionDenied()


class Scope(serializers.Serializer):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])


def scope(user,params):
    writable(user)
    values=Scope(data=params);values.is_valid(raise_exception=True)
    q=values.validated_data
    return get_object_or_404(Farm.objects.only('id','name'),pk=q['farm'],organization=user.organization),q


def options(user,params):
    farm,q=scope(user,params)
    return {'farm':{'id':str(farm.pk),'name':farm.name},'production':q['production'],'today':str(timezone.localdate()),
        'timezone':settings.TIME_ZONE,'actor':{'id':str(user.pk),'full_name':user.full_name}}


def members(user,params):
    scope(user,params)
    search=serializers.CharField(max_length=100,allow_blank=True).run_validation(params.get('search',''))
    qs=User.objects.filter(organization=user.organization,is_active=True)
    if user.role=='operator':qs=qs.filter(pk=user.pk)
    if search:qs=qs.filter(full_name__icontains=search)
    return qs.only('id','full_name').order_by('full_name','id')


def targets(user,params):
    farm,q=scope(user,params)
    kind=serializers.ChoiceField(choices=['animals','batches']).run_validation(params.get('target_kind'))
    search=serializers.CharField(max_length=100,allow_blank=True).run_validation(params.get('search',''))
    model,identifier=(Animal,'identifier') if kind=='animals' else (AnimalBatch,'batch_code')
    qs=filter_purpose(model.objects.filter(farm=farm,species__code='bovinos'),q['production'])
    if search:qs=qs.filter(**{f'{identifier}__icontains':search})
    return qs.only('id',identifier,'farm_id','cattle_purpose','status','updated_at').order_by(identifier,'id'),kind


def target_data(row,kind):
    return {'id':str(row.pk),'kind':kind,'identifier':row.identifier if kind=='animals' else row.batch_code,
        'farm':str(row.farm_id),'purpose':row.cattle_purpose,'status':row.status,'version':row.updated_at.isoformat()}


class Input(Strict):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])
    kind=serializers.ChoiceField(choices=['animal','water','fence','pasture','other'])
    date=serializers.DateField()
    due_date=serializers.DateField()
    description=serializers.CharField(max_length=1000)
    assigned_to=serializers.UUIDField()
    target_kind=serializers.ChoiceField(choices=['farm','animals','batches'])
    target=serializers.UUIDField(allow_null=True)
    target_version=serializers.DateTimeField(allow_null=True)
    def validate(self,v):
        if v['date']>timezone.localdate() or v['due_date']<v['date']:
            raise serializers.ValidationError({'date':'Use data até hoje e prazo igual ou posterior à ocorrência.'})
        if (v['target_kind']=='farm')!=(v['target'] is None and v['target_version'] is None) or v['target_kind']!='farm' and (not v['target'] or not v['target_version']):
            raise serializers.ValidationError({'target':'Selecione apenas um animal/lote ou a área da fazenda.'})
        return v


@transaction.atomic
def create(user,v):
    farm,q=scope(user,v)
    if user.role=='operator' and v['assigned_to']!=user.pk:raise exceptions.PermissionDenied()
    assignee=get_object_or_404(User.objects.filter(organization=user.organization,is_active=True).select_for_update(of=('self',),no_key=True).only('id'),pk=v['assigned_to'])
    target=None
    if v['target_kind']!='farm':
        model=Animal if v['target_kind']=='animals' else AnimalBatch
        qs=filter_purpose(model.objects.filter(farm=farm,species__code='bovinos'),q['production'])
        target=get_object_or_404(qs.select_for_update(of=('self',)).only('id','updated_at'),pk=v['target'])
        if target.updated_at!=v['target_version']:raise Conflict()
    data={'farm':farm,'assigned_to':assignee,**{key:v[key] for key in ['date','due_date','kind','description']}}
    if target:data['animal' if v['target_kind']=='animals' else 'batch']=target
    record=create_occurrence(user,data)
    return {'id':str(record.pk),'task':str(record.task_id),'farm':str(farm.pk)}


class ResolveInput(Strict):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])
    context_token=serializers.CharField(max_length=60000)
    resolution=serializers.CharField(max_length=1000)


def resolution_context(user,pk,params,lock=False):
    writable(user)
    scope(user,params)
    qs=reads.rows(user,'occurrences',params).only('id','date','kind','description','resolution','resolved_at','updated_at','farm__id','farm__name',
        'created_by__id','created_by__full_name','animal__id','animal__identifier','animal__cattle_purpose','batch__id','batch__batch_code','batch__cattle_purpose',
        'task__id','task__updated_at','task__assigned_to__id','task__assigned_to__full_name','task__due_date','task__status','task__farm_id','task__organization_id')
    row=get_object_or_404(qs.select_for_update(of=('self',)) if lock else qs,pk=pk)
    if lock:
        Task.objects.filter(pk=row.task_id).select_for_update().only('id').get()
        row=get_object_or_404(qs,pk=pk)
    if user.role=='operator' and row.created_by_id!=user.pk and row.task.assigned_to_id!=user.pk:raise exceptions.PermissionDenied()
    if row.resolved_at:raise Conflict()
    public=reads.data(row,'occurrences',user)
    digest=fingerprint({'record':public,'version':row.updated_at.isoformat(),'task_version':row.task.updated_at.isoformat(),
        'assignee':str(row.task.assigned_to_id),'task_farm':str(row.task.farm_id),'task_org':str(row.task.organization_id)})
    return public,digest,row


def resolve_options(user,pk,params):
    public,digest,row=resolution_context(user,pk,params)
    return {'record':public,'task':str(row.task_id),'context_token':signing.dumps({'user':str(user.pk),'org':str(user.organization_id),'id':str(pk),
        'farm':public['farm'],'production':params.get('production'),'digest':digest},salt=SALT,compress=True)}


@transaction.atomic
def resolve(user,pk,v):
    writable(user)
    try:intent=signing.loads(v['context_token'],salt=SALT,max_age=900)
    except signing.BadSignature as error:raise Conflict() from error
    if intent['user']!=str(user.pk) or intent['org']!=str(user.organization_id):raise exceptions.PermissionDenied()
    if intent['id']!=str(pk) or intent['farm']!=str(v['farm']) or intent['production']!=v['production']:raise Conflict()
    try:_,digest,row=resolution_context(user,pk,v,lock=True)
    except exceptions.NotFound as error:raise Conflict() from error
    if digest!=intent['digest']:raise Conflict()
    row=resolve_occurrence(user,row,v['resolution'])
    return {'id':str(row.pk),'farm':str(row.farm_id),'task':str(row.task_id),'resolved_at':row.resolved_at.isoformat(),'resolution':row.resolution,'status':'done'}
