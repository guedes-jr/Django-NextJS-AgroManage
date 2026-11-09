"""Reviewed native protocol start; execution/stock remain separate commands."""
from datetime import timedelta
from django.core import signing
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.http import Http404
from rest_framework import serializers, exceptions
from apps.accounts.models import User
from apps.farms.models import Farm
from .models import Animal, CattleProtocol, CattleProtocolRun
from .mobile_cattle_occurrence import writable, scope, options
from .mobile_vaccination import Strict, fingerprint
from .mobile_weighing import Conflict
from .cattle_improvements import start_protocol

SALT='livestock.mobile-protocol-start.v1'

def animals(user,params):
    farm,q=scope(user,params)
    search=serializers.CharField(max_length=100,allow_blank=True).run_validation(params.get('search',''))
    rows=Animal.objects.filter(farm=farm,species__code='bovinos',gender='F',status='active',cattle_purpose__in=[q['production'],'dual'])
    if search:rows=rows.filter(identifier__icontains=search)
    return rows.only('id','identifier','farm_id','cattle_purpose','entry_date','updated_at').order_by('identifier','id')

def animal_data(row):
    return {'id':str(row.pk),'identifier':row.identifier,'farm':str(row.farm_id),'purpose':row.cattle_purpose,'entry_date':str(row.entry_date) if row.entry_date else None,'version':row.updated_at.isoformat()}

class Input(Strict):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])
    animal=serializers.UUIDField()
    animal_version=serializers.DateTimeField()
    protocol=serializers.UUIDField()
    protocol_version=serializers.IntegerField(min_value=1)
    start_date=serializers.DateField()
    assigned_to=serializers.UUIDField()
    request_key=serializers.UUIDField()

def context(user,v,lock=False):
    writable(user)
    farms=Farm.objects.filter(organization=user.organization)
    if lock:farms=farms.select_for_update(no_key=True)
    farm=get_object_or_404(farms.only('id','name'),pk=v['farm'])
    if user.role=='operator' and v['assigned_to']!=user.pk:raise exceptions.PermissionDenied()
    people=User.objects.filter(organization=user.organization,is_active=True)
    if lock:people=people.select_for_update(no_key=True)
    person=get_object_or_404(people.only('id','full_name','updated_at'),pk=v['assigned_to'])
    qs=Animal.objects.filter(farm=farm,species__code='bovinos',gender='F',status='active',cattle_purpose__in=[v['production'],'dual'])
    if lock:qs=qs.select_for_update(of=('self',))
    animal=get_object_or_404(qs.only('id','identifier','farm_id','cattle_purpose','entry_date','updated_at'),pk=v['animal'])
    protocols=CattleProtocol.objects.filter(organization=user.organization)
    if lock:protocols=protocols.select_for_update()
    protocol=get_object_or_404(protocols.only('id','name','version','steps','updated_at'),pk=v['protocol'])
    if animal.updated_at!=v['animal_version'] or protocol.version!=v['protocol_version']:raise Conflict()
    if animal.entry_date and v['start_date']<animal.entry_date:raise serializers.ValidationError({'start_date':'O início não pode anteceder a entrada da matriz.'})
    if not isinstance(protocol.steps,list) or not 1<=len(protocol.steps)<=30:raise serializers.ValidationError({'protocol':'Modelo sem etapas válidas.'})
    stages=[]
    for i,step in enumerate(protocol.steps):
        if not isinstance(step,dict):raise serializers.ValidationError({'protocol':'Etapa inválida.'})
        name=serializers.CharField(max_length=150).run_validation(step.get('name'))
        day=serializers.IntegerField(min_value=0,max_value=365).run_validation(step.get('day'))
        try:due=v['start_date']+timedelta(days=day)
        except OverflowError:raise serializers.ValidationError({'start_date':'Data fora do intervalo suportado.'})
        stages.append({'number':i,'name':name,'day':day,'due_date':str(due)})
    if [s['day'] for s in stages]!=sorted(s['day'] for s in stages):raise serializers.ValidationError({'protocol':'Etapas fora de ordem.'})
    public={'farm':{'id':str(farm.pk),'name':farm.name},'production':v['production'],'animal':animal_data(animal),
        'protocol':{'id':str(protocol.pk),'name':protocol.name,'version':protocol.version},'assigned_to':{'id':str(person.pk),'full_name':person.full_name},'start_date':str(v['start_date']),'steps':stages}
    return public,fingerprint({'review':public,'protocol_version':str(protocol.updated_at),'assignee_version':str(person.updated_at)}),animal,protocol,person

def preview(user,v):
    public,digest,*_=context(user,v)
    command=Input(v).data
    token=signing.dumps({'user':str(user.pk),'org':str(user.organization_id),'command':command,'digest':digest},salt=SALT,compress=True)
    return {**public,'command':command,'preview_token':token}

@transaction.atomic
def confirm(user,token):
    writable(user)
    try:intent=signing.loads(token,salt=SALT,max_age=900)
    except signing.BadSignature:raise serializers.ValidationError({'preview_token':'Revisão inválida ou expirada.'})
    if intent['user']!=str(user.pk) or intent['org']!=str(user.organization_id):raise exceptions.PermissionDenied()
    values=Input(data=intent['command']);values.is_valid(raise_exception=True);v=values.validated_data
    try:public,digest,animal,protocol,person=context(user,v,lock=True)
    except (Http404,serializers.ValidationError) as error:raise Conflict() from error
    if digest!=intent['digest']:raise Conflict()
    existing=CattleProtocolRun.objects.filter(animal=animal,request_key=v['request_key']).first()
    if existing and (existing.protocol_id!=protocol.pk or existing.start_date!=v['start_date'] or existing.created_by_id!=user.pk or existing.steps_snapshot!=protocol.steps or existing.executions.exclude(task__assigned_to=person,task__organization=user.organization,task__farm_id=v['farm']).exists()):raise Conflict()
    run=start_protocol(user,animal=animal,protocol=protocol,start_date=v['start_date'],request_key=v['request_key'],assigned_to=person,operational=True)
    return {'id':str(run.pk),'farm':str(animal.farm_id),'animal':str(animal.pk),'protocol':str(protocol.pk),'start_date':str(run.start_date),'steps':len(run.steps_snapshot),'request_key':str(v['request_key'])}
