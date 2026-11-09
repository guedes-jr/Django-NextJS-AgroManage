"""Reviewed, atomic whole-batch transfer between pastures on the same farm."""
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import Count, Max
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, exceptions
from .models import AnimalBatch, CattlePasture, CattleGrazing
from . import mobile_grazing_exit as exit, mobile_grazing_entry as entry
from .mobile_vaccination import Strict, fingerprint
from .mobile_mating import canonical
from .cattle_services import close_cattle_pasture, enter_cattle_pasture

SALT='livestock.mobile-grazing-transfer.v1'
Conflict=exit.Conflict


class Input(Strict):
    farm=serializers.UUIDField()
    pasture=serializers.UUIDField()
    grazing_version=serializers.DateTimeField()
    batch_version=serializers.DateTimeField()
    destination=serializers.UUIDField()
    destination_version=serializers.DateTimeField()
    date=serializers.DateField()
    notes=serializers.CharField(max_length=2000,allow_blank=True)
    def validate(self,values):
        if values['pasture']==values['destination']:
            raise serializers.ValidationError({'destination':'Escolha um pasto diferente da origem.'})
        return values


def options(user,pk,params):
    row=exit.context(user,pk,{key:params.get(key) for key in ['farm','pasture']})
    if row.batch.status!='active' or row.batch.quantity<1: raise Conflict()
    return {'occupation':exit.row_data(row),'batch_version':row.batch.updated_at.isoformat(),
        'today':str(timezone.localdate()),'timezone':settings.TIME_ZONE}


def destinations(user,pk,params):
    row=exit.context(user,pk,{key:params.get(key) for key in ['farm','pasture']})
    if row.batch.status!='active' or row.batch.quantity<1: raise Conflict()
    search=serializers.CharField(max_length=100,allow_blank=True).run_validation(params.get('search',''))
    qs=CattlePasture.objects.filter(farm=row.pasture.farm_id,availability__in=['unknown','available']).exclude(pk=row.pasture_id)
    if search: qs=qs.filter(name__icontains=search)
    return qs.select_related('farm').only('id','name','farm__id','farm__name','availability','updated_at').order_by('name','id')


def evaluate(user,pk,command,lock=False):
    row=exit.context(user,pk,command)
    # Same batch-first order as pasture entry; two pastures locked in UUID order
    # prevents opposite-direction transfers of different batches from deadlocking.
    batch_qs=AnimalBatch.objects.filter(pk=row.batch_id,farm_id=command['farm'],farm__organization=user.organization,
        species__code='bovinos',status='active',quantity__gt=0).only('id','entry_date','updated_at')
    batch=get_object_or_404(batch_qs.select_for_update(of=('self',)) if lock else batch_qs)
    if lock:
        list(CattlePasture.objects.filter(pk__in=[row.pasture_id,command['destination']],farm_id=command['farm'],
            farm__organization=user.organization).order_by('pk').select_for_update(of=('self',)).values_list('pk',flat=True))
        # Re-read after waiting for batch/pasture locks and lock the source itself.
        row=exit.context(user,pk,command,lock=True)
    target,_=entry.pasture(user,{'farm':command['farm'],'pasture':command['destination']})
    if target.pk==row.pasture_id or row.updated_at!=command['grazing_version'] or batch.updated_at!=command['batch_version'] or target.updated_at!=command['destination_version']: raise Conflict()
    history=CattleGrazing.objects.filter(batch_id=row.batch_id)
    latest=history.order_by('-entry_date','-created_at','-id').first()
    if not latest or latest.pk!=row.pk or history.exclude(pk=row.pk).filter(exit_date__isnull=True).exists(): raise Conflict()
    last_exit=history.exclude(pk=row.pk).aggregate(day=Max('exit_date'))['day']
    earliest=max(day for day in [row.entry_date,batch.entry_date,last_exit] if day)
    if not earliest<=command['date']<=timezone.localdate():
        raise serializers.ValidationError({'date':'Respeite a entrada da ocupação/lote, o histórico e o dia atual.'})
    public={'occupation':exit.row_data(row),'destination':entry.pasture_data(target),'batch_version':batch.updated_at.isoformat(),'earliest_date':str(earliest)}
    digest=fingerprint({'public':public,'today':str(timezone.localdate()),'source_pasture_version':row.pasture.updated_at.isoformat(),
        'history':canonical(history.aggregate(count=Count('id'),updated=Max('updated_at'),created=Max('created_at'),last_exit=Max('exit_date')))})
    return public,digest,row,batch,target


def preview(user,pk,command):
    public,digest,*_=evaluate(user,pk,command)
    return {**public,'command':canonical(command),'preview_token':signing.dumps({'user':str(user.pk),'org':str(user.organization_id),
        'grazing':str(pk),'command':canonical(command),'digest':digest},salt=SALT,compress=True)}


@transaction.atomic
def confirm(user,pk,token):
    entry.writable(user)
    try: intent=signing.loads(token,salt=SALT,max_age=900)
    except signing.BadSignature as error: raise Conflict() from error
    if intent['user']!=str(user.pk) or intent['org']!=str(user.organization_id): raise exceptions.PermissionDenied()
    if intent['grazing']!=str(pk): raise Conflict()
    values=Input(data=intent['command']);values.is_valid(raise_exception=True)
    try: public,digest,row,batch,target=evaluate(user,pk,values.validated_data,lock=True)
    except (exceptions.NotFound,serializers.ValidationError) as error: raise Conflict() from error
    if digest!=intent['digest']: raise Conflict()
    command=values.validated_data
    close_cattle_pasture(row,command['date'])
    destination=enter_cattle_pasture({'pasture':target,'batch':batch,'entry_date':command['date'],'notes':command['notes']})
    return {'id':str(destination.pk),'source':str(row.pk),'farm':str(target.farm_id),'pasture':str(target.pk),
        'batch':str(batch.pk),'entry_date':str(destination.entry_date),'exit_date':str(command['date'])}
