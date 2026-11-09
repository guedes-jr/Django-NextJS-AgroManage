"""Creation of scoped collective weighing drafts; never applies animal weights."""
from datetime import timezone as utc
from decimal import Decimal
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, exceptions
from apps.farms.models import Farm
from .models import Animal, CattleManagement, CattleManagementEntry
from .cattle_improvements import filter_purpose
from .mobile_grazing_entry import writable
from .mobile_vaccination import Strict


class Conflict(exceptions.APIException):
    status_code=409
    default_detail='Um participante ou o contexto mudou. Confira os manejos e reabra o formulário.'


class Scope(serializers.Serializer):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])
    search=serializers.CharField(max_length=100,allow_blank=True,default='')


class Entry(Strict):
    animal=serializers.UUIDField()
    animal_version=serializers.DateTimeField()
    weight_kg=serializers.DecimalField(max_digits=8,decimal_places=2,min_value=Decimal('.01'))


class Input(Strict):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])
    date=serializers.DateField()
    description=serializers.CharField(max_length=200)
    responsible=serializers.CharField(max_length=100,allow_blank=True)
    notes=serializers.CharField(allow_blank=True)
    entries=Entry(many=True,allow_empty=False,max_length=1000)

    def validate_entries(self, entries):
        if len({row['animal'] for row in entries})!=len(entries):
            raise serializers.ValidationError('Um animal não pode ser repetido no manejo.')
        return entries


def scope(user,params):
    writable(user)
    values=Scope(data=params); values.is_valid(raise_exception=True)
    query=values.validated_data
    farm=get_object_or_404(Farm.objects.only('id','name'),pk=query['farm'],organization_id=user.organization_id)
    return farm,query


def options(user,params):
    farm,query=scope(user,params)
    return {'farm':{'id':str(farm.pk),'name':farm.name},'production':query['production'],
        'today':str(timezone.localdate()),'timezone':settings.TIME_ZONE,'max_participants':1000}


def animals(user,params):
    farm,query=scope(user,params)
    qs=filter_purpose(Animal.objects.filter(farm=farm,species__code='bovinos',status='active'),query['production'])
    if query['search']:
        qs=qs.filter(Q(identifier__icontains=query['search'])|Q(cattle_profile__name__icontains=query['search']))
    return qs.only('id','identifier','farm_id','cattle_purpose','entry_date','updated_at','status').order_by('identifier','id')


def animal_data(row):
    return {'id':str(row.pk),'identifier':row.identifier,'farm':str(row.farm_id),'cattle_purpose':row.cattle_purpose,
        'entry_date':str(row.entry_date) if row.entry_date else None,'status':row.status,'version':row.updated_at.astimezone(utc.utc).isoformat()}


@transaction.atomic
def create(user,values):
    farm,query=scope(user,values)
    if values['date']>timezone.localdate():
        raise serializers.ValidationError({'date':'Não use data futura.'})
    ids=[row['animal'] for row in values['entries']]
    selected=list(filter_purpose(Animal.objects.filter(pk__in=ids,farm=farm,
        species__code='bovinos',status='active'),query['production']).select_for_update(of=('self',)).only(
        'id','entry_date','updated_at').order_by('id'))
    if len(selected)!=len(ids):
        raise Conflict()
    indexed={row.pk:row for row in selected}
    for entry in values['entries']:
        row=indexed[entry['animal']]
        if row.updated_at!=entry['animal_version']:
            raise Conflict()
        if row.entry_date and values['date']<row.entry_date:
            raise serializers.ValidationError({'date':'A data do manejo não pode anteceder a entrada dos participantes.'})
    record=CattleManagement.objects.create(farm=farm,kind='weighing',date=values['date'],description=values['description'],
        responsible=values['responsible'],notes=values['notes'],created_by=user)
    CattleManagementEntry.objects.bulk_create([CattleManagementEntry(management=record,
        animal_id=entry['animal'],weight_kg=entry['weight_kg']) for entry in values['entries']])
    return {'id':str(record.pk),'farm':str(farm.pk),'kind':record.kind,'status':record.status,
        'date':str(record.date),'participant_count':len(ids)}


class EditInput(Input):
    expected_version=serializers.DateTimeField()


class CancelInput(Strict):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])
    expected_version=serializers.DateTimeField()
    reason=serializers.CharField(max_length=300)


def draft(user, management_id, params, lock=False, *, kind="weighing"):
    farm,query=scope(user,params)
    qs=CattleManagement.objects.filter(pk=management_id,farm=farm).only('id','farm_id','kind','status','date','description',
        'responsible','notes','updated_at','inventory_lot_id','inventory_movement_id','inventory_quantity_per_animal')
    record=get_object_or_404(qs.select_for_update() if lock else qs)
    if record.kind!=kind or record.status!='draft' or record.inventory_lot_id or record.inventory_movement_id or record.inventory_quantity_per_animal is not None:
        raise Conflict()
    entries=record.entries.all()
    valid=entries.filter(animal__farm=farm,animal__species__code='bovinos')
    if entries.count()!=valid.count() or not valid.filter(animal__cattle_purpose__in=[query['production'],'dual']).exists():
        raise Conflict()
    return record,farm,query


def edit_options(user, management_id, params):
    record,farm,query=draft(user,management_id,params)
    entries=list(record.entries.select_related('animal').only('id','management_id','weight_kg','animal__id',
        'animal__identifier','animal__farm_id','animal__cattle_purpose','animal__entry_date','animal__updated_at','animal__status').order_by('animal__identifier','id')[:1001])
    if not 1<=len(entries)<=1000: raise Conflict()
    return {'farm':{'id':str(farm.pk),'name':farm.name},'production':query['production'],'today':str(timezone.localdate()),
        'timezone':settings.TIME_ZONE,'max_participants':1000,'id':str(record.pk),'version':record.updated_at.astimezone(utc.utc).isoformat(),
        'values':{'date':str(record.date),'description':record.description,'responsible':record.responsible,'notes':record.notes,
            'entries':[{'animal':animal_data(entry.animal),'weight_kg':str(entry.weight_kg) if entry.weight_kg is not None else ''} for entry in entries]}}


@transaction.atomic
def update(user, management_id, values):
    record,farm,query=draft(user,management_id,values,lock=True)
    if record.updated_at!=values['expected_version']: raise Conflict()
    if values['date']>timezone.localdate(): raise serializers.ValidationError({'date':'Não use data futura.'})
    ids=[entry['animal'] for entry in values['entries']]
    selected=list(Animal.objects.filter(pk__in=ids,farm=farm,species__code='bovinos',status='active').select_for_update(of=('self',)).only(
        'id','entry_date','updated_at','cattle_purpose').order_by('id'))
    if len(selected)!=len(ids) or not any(row.cattle_purpose in [query['production'],'dual'] for row in selected): raise Conflict()
    indexed={row.pk:row for row in selected}
    for entry in values['entries']:
        animal=indexed[entry['animal']]
        if animal.updated_at!=entry['animal_version']: raise Conflict()
        if animal.entry_date and values['date']<animal.entry_date:
            raise serializers.ValidationError({'date':'A data do manejo não pode anteceder a entrada dos participantes.'})
    for key in ['date','description','responsible','notes']: setattr(record,key,values[key])
    record.save(update_fields=['date','description','responsible','notes','updated_at'])
    record.entries.all().delete()
    CattleManagementEntry.objects.bulk_create([CattleManagementEntry(management=record,animal_id=entry['animal'],weight_kg=entry['weight_kg']) for entry in values['entries']])
    return {'id':str(record.pk),'farm':str(farm.pk),'kind':record.kind,'status':record.status,'date':str(record.date),
        'participant_count':len(ids)}


@transaction.atomic
def cancel(user, management_id, values, *, kind="weighing"):
    record,farm,_=draft(user,management_id,values,lock=True,kind=kind)
    if record.updated_at!=values['expected_version']: raise Conflict()
    record.status='cancelled'; record.cancellation_reason=values['reason']
    record.save(update_fields=['status','cancellation_reason','updated_at'])
    return {'id':str(record.pk),'farm':str(farm.pk),'status':record.status,'cancellation_reason':record.cancellation_reason}
