from decimal import Decimal
"""Whole-draft stock-linked medication review; existing domain effects remain atomic."""
from django.core import signing
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import exceptions
from .models import Animal, CattleManagement, CattleMilkRecord
from apps.inventory.models import LoteEstoque
from .mobile_collective_medication import stock_review
from .mobile_health import validate_date
from rest_framework import serializers
from django.db.models import F
from .mobile_weighing import scope
from .mobile_grazing_entry import writable
from .mobile_vaccination import fingerprint
from .cattle_services import confirm_cattle_management

SALT='livestock.mobile-collective-medication-confirmation.v1'


class Conflict(exceptions.APIException):
    status_code=409
    default_detail='O manejo, os participantes ou o estado sanitário mudaram. Confira a ficha e revise novamente.'


def evaluate(user,management_id,params,lock=False):
    farm,query=scope(user,params)
    qs=CattleManagement.objects.filter(pk=management_id,farm=farm,cost_per_animal=0).only('id','farm_id','kind','status','date','description',
        'responsible','notes','treatment_type','next_procedure_date','milk_withdrawal_until','meat_withdrawal_until','updated_at','inventory_lot_id','inventory_movement_id','inventory_quantity_per_animal')
    record=get_object_or_404(qs.select_for_update() if lock else qs)
    if record.kind!='sanitary' or record.status!='draft' or not record.inventory_lot_id or record.inventory_movement_id or not record.inventory_quantity_per_animal or record.inventory_quantity_per_animal<=0 or record.date>timezone.localdate() or record.treatment_type!='medication': raise Conflict()
    for field in ['next_procedure_date','milk_withdrawal_until','meat_withdrawal_until']:
        value=getattr(record,field)
        if value and value<record.date: raise Conflict()
    entries=list(record.entries.only('id','animal_id','management_id','weight_kg','updated_at').order_by('animal_id')[:1001])
    if not 1<=len(entries)<=1000 or any(entry.weight_kg is not None for entry in entries): raise Conflict()
    ids=[entry.animal_id for entry in entries]
    base=Animal.objects.filter(pk__in=ids,farm=farm,species__code='bovinos',status='active')
    if lock:
        if len(list(base.select_for_update(of=('self',)).only('id').order_by('id')))!=len(entries): raise Conflict()
    # New statement after locks: include animal changes committed while waiting.
    animals=list(base.only('id','identifier','cattle_purpose','farm_id','entry_date','birth_date','updated_at').order_by('id'))
    if len(animals)!=len(entries) or not any(animal.cattle_purpose in [query['production'],'dual'] for animal in animals): raise Conflict()
    if record.milk_withdrawal_until and CattleMilkRecord.objects.filter(animal_id__in=ids,date__gte=record.date,date__lte=record.milk_withdrawal_until,discarded_liters__lt=F('liters')).exists():
        raise Conflict()
    indexed={animal.pk:animal for animal in animals}; public_entries=[]; versions=[]
    for entry in entries:
        animal=indexed[entry.animal_id]
        validate_date(animal,record.date)
        public_entries.append({'animal':str(animal.pk),'identifier':animal.identifier,'cattle_purpose':animal.cattle_purpose})
        versions.append([str(entry.pk),entry.updated_at.isoformat(),animal.updated_at.isoformat(),str(animal.entry_date),str(animal.birth_date)])
    public={'id':str(record.pk),'farm':str(farm.pk),'farm_name':farm.name,'production':query['production'],'date':str(record.date),
        'description':record.description,'responsible':record.responsible,'notes':record.notes,'participant_count':len(entries),'entries':public_entries,'treatment_type':record.treatment_type,
        **{field:str(getattr(record,field)) if getattr(record,field) else None for field in ['next_procedure_date','milk_withdrawal_until','meat_withdrawal_until']}}
    unit=LoteEstoque.objects.filter(pk=record.inventory_lot_id).values_list('item__unidade_medida',flat=True).first()
    values={key:getattr(record,key) for key in ['date','description','responsible','notes','milk_withdrawal_until','meat_withdrawal_until']}
    values.update(inventory_lot=record.inventory_lot_id,expected_unit=unit,quantity=record.inventory_quantity_per_animal)
    stock,internal,_,total=stock_review(user,values,animals,lock=lock)
    public.update(lot=stock['lot'],quantity=str(record.inventory_quantity_per_animal),total_quantity=str(total),
        remaining=str(Decimal(stock['lot']['balance'])-total),minimum_withdrawal=stock['minimum_withdrawal'])
    return public,fingerprint({'public':public,'stock':internal,'versions':versions,'management_version':record.updated_at.isoformat(),'today':str(timezone.localdate())}),record



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
    except (exceptions.NotFound,serializers.ValidationError) as error: raise Conflict() from error
    if digest!=intent['digest']: raise Conflict()
    record=confirm_cattle_management(record,user,medication_only=True)
    return {'id':str(record.pk),'farm':public['farm'],'status':record.status,'participant_count':public['participant_count'],'confirmed_at':record.confirmed_at.isoformat()}
