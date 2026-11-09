"""Manager-only, reviewed single-animal/whole-batch purpose classification."""
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, exceptions
from apps.farms.models import Farm
from .models import Animal, AnimalBatch
from .cattle_improvements import classify
from .mobile_grazing_entry import writable
from .mobile_vaccination import Strict, fingerprint
from .mobile_mating import canonical
from .mobile_weighing import Conflict

PURPOSES=['unknown','beef','dairy','dual']
SALT='livestock.mobile-classification.v1'


class Scope(serializers.Serializer):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])


def scope(user,params,lock=False):
    writable(user)
    values=Scope(data=params);values.is_valid(raise_exception=True);query=values.validated_data
    qs=Farm.objects.filter(pk=query['farm'],organization=user.organization).only('id','name')
    return get_object_or_404(qs.select_for_update(no_key=True) if lock else qs),query


def options(user,params):
    farm,q=scope(user,params)
    return {'farm':{'id':str(farm.pk),'name':farm.name},'production':q['production'],'today':str(timezone.localdate()),'timezone':settings.TIME_ZONE,'purposes':PURPOSES}


def targets(user,params):
    farm,q=scope(user,params)
    kind=serializers.ChoiceField(choices=['animals','batches']).run_validation(params.get('target_kind'))
    search=serializers.CharField(max_length=100,allow_blank=True).run_validation(params.get('search',''))
    model,identifier=(Animal,'identifier') if kind=='animals' else (AnimalBatch,'batch_code')
    qs=model.objects.filter(farm=farm,species__code='bovinos',cattle_purpose__in=[q['production'],'dual','unknown'])
    if search:qs=qs.filter(**{f'{identifier}__icontains':search})
    return qs.only('id',identifier,'farm_id','cattle_purpose','status','updated_at').order_by(identifier,'id'),kind


def target_data(row,kind):
    return {'id':str(row.pk),'kind':kind,'identifier':row.identifier if kind=='animals' else row.batch_code,
        'farm':str(row.farm_id),'purpose':row.cattle_purpose,'status':row.status,'version':row.updated_at.isoformat()}


class Input(Strict):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])
    target_kind=serializers.ChoiceField(choices=['animals','batches'])
    target=serializers.UUIDField()
    target_version=serializers.DateTimeField()
    purpose=serializers.ChoiceField(choices=PURPOSES)


def evaluate(user,v,lock=False):
    farm,q=scope(user,v,lock)
    kind=v['target_kind'];model,identifier=(Animal,'identifier') if kind=='animals' else (AnimalBatch,'batch_code')
    fields=['id',identifier,'farm_id','cattle_purpose','status','updated_at',*(['batch_id'] if kind=='animals' else ['quantity'])]
    qs=model.objects.filter(pk=v['target'],farm=farm,species__code='bovinos',cattle_purpose__in=[q['production'],'dual','unknown']).only(*fields)
    target=get_object_or_404(qs.select_for_update(of=('self',)) if lock else qs)
    if target.updated_at!=v['target_version']:raise Conflict()
    if target.cattle_purpose==v['purpose']:raise serializers.ValidationError({'purpose':'Escolha uma finalidade diferente da atual.'})
    linked=None;versions=[]
    if kind=='animals':
        if target.batch_id:
            batch_qs=AnimalBatch.objects.filter(pk=target.batch_id,farm=farm,species__code='bovinos').only('id','batch_code','cattle_purpose','updated_at')
            batch=get_object_or_404(batch_qs.select_for_update(of=('self',)) if lock else batch_qs)
            if batch.cattle_purpose!=v['purpose']:raise serializers.ValidationError({'purpose':'Classifique o lote ou transfira o animal para um lote compatível antes de alterar sua finalidade individual.'})
            linked={'id':str(batch.pk),'identifier':batch.batch_code,'purpose':batch.cattle_purpose}
            versions.append(['batch',str(batch.pk),batch.updated_at.isoformat()])
        participants=[target]
    else:
        active=Animal.objects.filter(batch=target,status='active')
        if active.exclude(farm=farm,species__code='bovinos').exists():raise Conflict()
        qs=active.only('id','identifier','cattle_purpose','updated_at').order_by('pk')
        participants=list((qs.select_for_update(of=('self',)) if lock else qs)[:1001])
        # New read after locks includes changes committed while waiting.
        if lock:participants=list(qs[:1001])
        if len(participants)>1000:raise serializers.ValidationError('A revisão móvel permite até 1.000 animais ativos vinculados.')
    entries=[{'id':str(row.pk),'identifier':row.identifier,'previous':row.cattle_purpose,'will_change':row.cattle_purpose!=v['purpose']} for row in participants]
    versions.extend([str(row.pk),row.updated_at.isoformat()] for row in participants)
    history_production=v['purpose'] if v['purpose'] in ['beef','dairy'] else target.cattle_purpose if target.cattle_purpose in ['beef','dairy'] else q['production']
    public={'target':target_data(target,kind),'purpose':v['purpose'],'production':q['production'],'farm_name':farm.name,
        'date':str(timezone.localdate()),'entries':entries,'linked_batch':linked,'current_quantity':target.quantity if kind=='batches' else None,
        'history_production':history_production,'changed_animals':sum(row['will_change'] for row in entries),'changed_batches':1 if kind=='batches' else 0}
    return public,fingerprint({'public':public,'versions':versions}),target


def preview(user,v):
    public,digest,_=evaluate(user,v)
    return {**public,'command':canonical(v),'preview_token':signing.dumps({'user':str(user.pk),'org':str(user.organization_id),
        'command':canonical(v),'digest':digest},salt=SALT,compress=True)}


@transaction.atomic
def confirm(user,token):
    writable(user)
    try:intent=signing.loads(token,salt=SALT,max_age=900)
    except signing.BadSignature as error:raise Conflict() from error
    if intent['user']!=str(user.pk) or intent['org']!=str(user.organization_id):raise exceptions.PermissionDenied()
    values=Input(data=intent['command']);values.is_valid(raise_exception=True);v=values.validated_data
    try:public,digest,target=evaluate(user,v,lock=True)
    except (exceptions.NotFound,serializers.ValidationError) as error:raise Conflict() from error
    if digest!=intent['digest']:raise Conflict()
    classify(user,animals=[target.pk] if v['target_kind']=='animals' else [],batches=[target.pk] if v['target_kind']=='batches' else [],purpose=v['purpose'],operational=True)
    return {'id':str(target.pk),'kind':v['target_kind'],'farm':str(target.farm_id),'purpose':v['purpose'],
        'changed_animals':public['changed_animals'],'changed_batches':public['changed_batches'],'date':public['date']}
