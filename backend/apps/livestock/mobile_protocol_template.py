"""Reviewed append-only protocol templates; organization lock shares legacy order."""
from django.core import signing
from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from django.http import Http404
from rest_framework import serializers, exceptions
from apps.organizations.models import Organization
from .models import CattleProtocol
from .mobile_cattle_occurrence import writable
from .mobile_vaccination import Strict, fingerprint
from .mobile_weighing import Conflict
from .cattle_improvements import create_protocol
SALT='livestock.mobile-protocol-template.v1'

class Stage(Strict):
    name=serializers.CharField(max_length=150)
    day=serializers.IntegerField(min_value=0,max_value=365)

class Input(Strict):
    name=serializers.CharField(max_length=100)
    source=serializers.UUIDField(allow_null=True)
    steps=Stage(many=True,min_length=1,max_length=30)
    def validate_steps(self,value):
        if [s['day'] for s in value]!=sorted(s['day'] for s in value):raise serializers.ValidationError('Ordene as etapas por dia relativo.')
        return value

def context(user,v,lock=False):
    writable(user)
    if user.role not in ['admin','manager']:raise exceptions.PermissionDenied()
    if lock:get_object_or_404(Organization.objects.select_for_update().only('id'),pk=user.organization_id)
    source=None
    if v['source']:
        source=get_object_or_404(CattleProtocol.objects.only('id','name','version','updated_at'),pk=v['source'],organization=user.organization)
        if source.name!=v['name']:raise serializers.ValidationError({'name':'Preserve o nome ao criar nova versão.'})
    latest=CattleProtocol.objects.filter(organization=user.organization,name=v['name']).aggregate(value=Max('version'))['value'] or 0
    public={'name':v['name'],'previous_version':latest,'version':latest+1,'steps':v['steps'],'source':str(source.pk) if source else None}
    return public,fingerprint({'review':public,'source_version':str(source.updated_at) if source else None})

def preview(user,v):
    public,digest=context(user,v)
    return {**public,'command':Input(v).data,'preview_token':signing.dumps({'user':str(user.pk),'org':str(user.organization_id),'command':Input(v).data,'digest':digest},salt=SALT,compress=True)}

@transaction.atomic
def confirm(user,token):
    writable(user)
    if user.role not in ['admin','manager']:raise exceptions.PermissionDenied()
    try:intent=signing.loads(token,salt=SALT,max_age=900)
    except signing.BadSignature:raise serializers.ValidationError({'preview_token':'Revisão inválida ou expirada.'})
    if intent['user']!=str(user.pk) or intent['org']!=str(user.organization_id):raise exceptions.PermissionDenied()
    values=Input(data=intent['command']);values.is_valid(raise_exception=True);v=values.validated_data
    try:public,digest=context(user,v,lock=True)
    except (Http404,serializers.ValidationError) as error:raise Conflict() from error
    if digest!=intent['digest']:raise Conflict()
    row=create_protocol(user,v['name'],v['steps'])
    return {'id':str(row.pk),'name':row.name,'version':row.version,'steps':row.steps}
