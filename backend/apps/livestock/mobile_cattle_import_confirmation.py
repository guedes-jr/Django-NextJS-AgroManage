"""Signed CSV confirmation; farm serialization and read-only reconciliation."""
import hashlib
from django.core import signing
from django.db import transaction, IntegrityError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, exceptions
from apps.farms.models import Farm
from .models import Animal
from . import mobile_cattle_import as reads
from .mobile_vaccination import Strict, fingerprint
from .mobile_weighing import Conflict
from .cattle_improvements import import_animals
SALT='livestock.mobile-cattle-import.v1'

def authorize(user):
    from .mobile_cattle_occurrence import writable
    writable(user)
    if user.role not in ['admin','manager']:raise exceptions.PermissionDenied()

def csv_hash(content):return hashlib.sha256(content.encode('utf-8')).hexdigest()

def review(user,v):
    public=reads.preview(user,v)
    if public['invalid']:raise serializers.ValidationError({'csv':'Corrija todas as linhas e valide novamente antes de confirmar.'})
    digest=fingerprint({'preview':public,'today':str(timezone.localdate())})
    token=signing.dumps({'user':str(user.pk),'org':str(user.organization_id),'farm':str(v['farm']),'production':v['production'],'csv_hash':csv_hash(v['csv']),'digest':digest},salt=SALT,compress=True)
    return {**public,'preview_token':token}

class CheckInput(Strict):
    csv=serializers.CharField(max_length=200000,trim_whitespace=False)
    preview_token=serializers.CharField(max_length=60000)

class ConfirmInput(CheckInput):
    accepted=serializers.BooleanField()
    def validate_accepted(self,value):
        if value is not True:raise serializers.ValidationError('Confirme os efeitos da importação.')
        return value

def intent(user,v,max_age):
    authorize(user)
    try:data=signing.loads(v['preview_token'],salt=SALT,max_age=max_age)
    except signing.BadSignature:raise serializers.ValidationError({'preview_token':'Revisão inválida ou expirada.'})
    if data['user']!=str(user.pk) or data['org']!=str(user.organization_id):raise exceptions.PermissionDenied()
    if csv_hash(v['csv'])!=data['csv_hash']:raise Conflict()
    return data

@transaction.atomic
def confirm(user,v):
    data=intent(user,v,900)
    farm=get_object_or_404(Farm.objects.filter(organization=user.organization).select_for_update().only('id','name','organization_id'),pk=data['farm'])
    command={'farm':farm.pk,'production':data['production'],'csv':v['csv']}
    public=reads.preview(user,command)
    if public['invalid'] or fingerprint({'preview':public,'today':str(timezone.localdate())})!=data['digest']:raise Conflict()
    prepared=[{'data':{**row['data'],'farm_id':str(farm.pk)},'valid':True,'errors':{}} for row in public['rows']]
    try:ids=import_animals(user,farm,[row['data'] for row in public['rows']],validated_preview=prepared)
    except (IntegrityError,serializers.ValidationError) as error:raise Conflict() from error
    return {'farm':str(farm.pk),'production':data['production'],'count':len(ids),
        'animals':[{'id':pk,'identifier':row['data']['identifier'],'purpose':row['data']['cattle_purpose']} for pk,row in zip(ids,public['rows'])]}

def check(user,v):
    data=intent(user,v,86400)
    farm=get_object_or_404(Farm.objects.only('id','name'),pk=data['farm'],organization=user.organization)
    _,rows=reads.parse(v['csv'])
    records={row.identifier:row for row in Animal.objects.filter(farm=farm,identifier__in=[r.get('identifier','') for _,r in rows]).select_related('species').only('id','identifier','cattle_purpose','species__id','species__code')}
    result=[]
    for line,row in rows:
        identifier=row.get('identifier','');record=records.get(identifier)
        result.append({'line':line,'identifier':identifier,'found':record is not None,'id':str(record.pk) if record else None,'purpose':record.cattle_purpose if record else None,'species':record.species.code if record else None})
    found=sum(row['found'] for row in result)
    return {'farm':{'id':str(farm.pk),'name':farm.name},'production':data['production'],'total':len(result),'found':found,'missing':len(result)-found,'rows':result,'read_only':True,'proves_import':False}
