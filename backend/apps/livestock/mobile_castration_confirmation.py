"""Whole-draft castration review; existing domain effects remain atomic."""
from django.core import signing
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import exceptions
from .models import Animal, CattleAnimalProfile, CattleManagement
from .mobile_weighing import scope
from .mobile_grazing_entry import writable
from .mobile_vaccination import fingerprint
from .cattle_services import confirm_cattle_management

SALT='livestock.mobile-castration-confirmation.v1'


class Conflict(exceptions.APIException):
    status_code=409
    default_detail='O manejo, os participantes ou o estado de castração mudaram. Confira a ficha e revise novamente.'


def evaluate(user,management_id,params,lock=False):
    farm,query=scope(user,params)
    qs=CattleManagement.objects.filter(pk=management_id,farm=farm).only('id','farm_id','kind','status','date','description',
        'responsible','notes','updated_at','inventory_lot_id','inventory_movement_id','inventory_quantity_per_animal')
    record=get_object_or_404(qs.select_for_update() if lock else qs)
    if record.kind!='castration' or record.status!='draft' or record.inventory_lot_id or record.inventory_movement_id or record.inventory_quantity_per_animal is not None or record.date>timezone.localdate(): raise Conflict()
    entries=list(record.entries.only('id','animal_id','management_id','weight_kg','updated_at').order_by('animal_id')[:1001])
    if not 1<=len(entries)<=1000 or any(entry.weight_kg is not None for entry in entries): raise Conflict()
    ids=[entry.animal_id for entry in entries]
    base=Animal.objects.filter(pk__in=ids,farm=farm,species__code='bovinos',status='active',gender='M')
    if lock:
        if len(list(base.select_for_update(of=('self',)).only('id').order_by('id')))!=len(entries): raise Conflict()
        list(CattleAnimalProfile.objects.filter(animal_id__in=ids).select_for_update().only('id').order_by('animal_id'))
    # New statement after locks: include profile changes committed while waiting.
    animals=list(base.select_related('cattle_profile').only('id','identifier','cattle_purpose','entry_date','updated_at',
        'cattle_profile__id','cattle_profile__is_castrated','cattle_profile__updated_at').order_by('id'))
    if len(animals)!=len(entries) or not any(animal.cattle_purpose in [query['production'],'dual'] for animal in animals): raise Conflict()
    indexed={animal.pk:animal for animal in animals}; public_entries=[]; versions=[]
    for entry in entries:
        animal=indexed[entry.animal_id]; profile=getattr(animal,'cattle_profile',None)
        if profile and profile.is_castrated or animal.entry_date and record.date<animal.entry_date: raise Conflict()
        public_entries.append({'animal':str(animal.pk),'identifier':animal.identifier,'cattle_purpose':animal.cattle_purpose,'gender':'M','is_castrated':False})
        versions.append([str(entry.pk),entry.updated_at.isoformat(),animal.updated_at.isoformat(),str(animal.entry_date),
            str(profile.pk) if profile else None,profile.updated_at.isoformat() if profile else None])
    public={'id':str(record.pk),'farm':str(farm.pk),'farm_name':farm.name,'production':query['production'],'date':str(record.date),
        'description':record.description,'responsible':record.responsible,'notes':record.notes,'participant_count':len(entries),'entries':public_entries}
    return public,fingerprint({'public':public,'versions':versions,'management_version':record.updated_at.isoformat(),'today':str(timezone.localdate())}),record


def preview(user,management_id,params):
    public,digest,_=evaluate(user,management_id,params)
    return {**public,'preview_token':signing.dumps({'user':str(user.pk),'org':str(user.organization_id),'id':str(management_id),
        'farm':public['farm'],'production':public['production'],'digest':digest},salt=SALT,compress=True)}


@transaction.atomic
def confirm(user,management_id,token):
    writable(user)
    try: intent=signing.loads(token,salt=SALT,max_age=900)
    except signing.BadSignature as error: raise Conflict() from error
    if intent['user']!=str(user.pk) or intent['org']!=str(user.organization_id): raise exceptions.PermissionDenied()
    if intent['id']!=str(management_id): raise Conflict()
    try: public,digest,record=evaluate(user,management_id,{'farm':intent['farm'],'production':intent['production']},lock=True)
    except exceptions.NotFound as error: raise Conflict() from error
    if digest!=intent['digest']: raise Conflict()
    record=confirm_cattle_management(record,user,castration_only=True)
    return {'id':str(record.pk),'farm':public['farm'],'status':record.status,'participant_count':public['participant_count'],'confirmed_at':record.confirmed_at.isoformat()}
