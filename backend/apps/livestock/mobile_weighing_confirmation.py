"""Signed whole-management weighing review through the existing atomic service."""
from django.core import signing
from django.db import transaction
from django.db.models import OuterRef, Subquery
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import exceptions
from .models import Animal, CattleManagement, WeightRecord
from .mobile_weighing import scope
from .mobile_grazing_entry import writable
from .mobile_vaccination import fingerprint
from .cattle_services import confirm_cattle_management

SALT='livestock.mobile-weighing-confirmation.v1'


class Conflict(exceptions.APIException):
    status_code=409
    default_detail='O manejo, os participantes ou as pesagens mudaram. Confira a ficha e revise novamente.'


def evaluate(user, management_id, params, lock=False):
    farm,query=scope(user,params)
    qs=CattleManagement.objects.filter(pk=management_id,farm=farm).only('id','farm_id','kind','date','description',
        'responsible','notes','status','updated_at','inventory_lot_id','inventory_movement_id','inventory_quantity_per_animal')
    record=get_object_or_404(qs.select_for_update() if lock else qs)
    if record.kind!='weighing' or record.status!='draft' or record.inventory_lot_id or record.inventory_movement_id or record.inventory_quantity_per_animal is not None or record.date>timezone.localdate():
        raise Conflict()
    entries=list(record.entries.only('id','animal_id','management_id','weight_kg','updated_at').order_by('animal_id')[:1001])
    if not 1<=len(entries)<=1000:
        raise Conflict()
    latest=WeightRecord.objects.filter(animal_id=OuterRef('pk')).order_by('-weighing_date','-created_at')
    animal_scope=Animal.objects.filter(pk__in=[entry.animal_id for entry in entries],farm=farm,species__code='bovinos',status='active')
    if lock:
        # Read weight snapshots only after the animal locks have been acquired.
        locked=list(animal_scope.select_for_update(of=('self',)).only('id').order_by('pk'))
        if len(locked)!=len(entries): raise Conflict()
    animals=animal_scope.annotate(
        latest_weight_id=Subquery(latest.values('id')[:1]),latest_weight_date=Subquery(latest.values('weighing_date')[:1]),
        latest_weight_kg=Subquery(latest.values('weight_kg')[:1]),latest_weight_created=Subquery(latest.values('created_at')[:1]),
    ).only('id','identifier','farm_id','cattle_purpose','entry_date','updated_at').order_by('pk')
    animals=list(animals)
    if len(animals)!=len(entries) or not any(animal.cattle_purpose in [query['production'],'dual'] for animal in animals):
        raise Conflict()
    indexed={animal.pk:animal for animal in animals}; public_entries=[]; versions=[]
    for entry in entries:
        animal=indexed[entry.animal_id]
        if not entry.weight_kg or entry.weight_kg<=0 or animal.entry_date and record.date<animal.entry_date:
            raise Conflict()
        public_entries.append({'animal':str(animal.pk),'identifier':animal.identifier,'cattle_purpose':animal.cattle_purpose,
            'weight_kg':str(entry.weight_kg),'latest_weight_date':str(animal.latest_weight_date) if animal.latest_weight_date else None,
            'latest_weight_kg':str(animal.latest_weight_kg) if animal.latest_weight_kg is not None else None,
            'updates_current':animal.latest_weight_date is None or record.date>=animal.latest_weight_date})
        versions.append([str(entry.pk),entry.updated_at.isoformat(),animal.updated_at.isoformat(),
            str(animal.entry_date),str(animal.latest_weight_id),str(animal.latest_weight_created)])
    public={'id':str(record.pk),'farm':str(farm.pk),'farm_name':farm.name,'production':query['production'],
        'description':record.description,'responsible':record.responsible,'notes':record.notes,'date':str(record.date),
        'participant_count':len(entries),'entries':public_entries}
    digest=fingerprint({'public':public,'versions':versions,'management_version':record.updated_at.isoformat(),'today':str(timezone.localdate())})
    return public,digest,record


def preview(user,management_id,params):
    public,digest,_=evaluate(user,management_id,params)
    return {**public,'preview_token':signing.dumps({'user':str(user.pk),'org':str(user.organization_id),
        'id':str(management_id),'farm':public['farm'],'production':public['production'],'digest':digest},salt=SALT,compress=True)}


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
    record=confirm_cattle_management(record,user,weighing_only=True)
    return {'id':str(record.pk),'farm':public['farm'],'status':record.status,'participant_count':public['participant_count'],
        'confirmed_at':record.confirmed_at.isoformat()}
