"""Scoped castration draft creation; no animal/profile/history effects before confirmation."""
from datetime import timezone as utc
from django.conf import settings
from django.db import transaction
from django.db.models import Q, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers
from .models import Animal, CattleManagement, CattleManagementEntry
from .mobile_weighing import scope, options, Conflict, CancelInput
from .mobile_vaccination import Strict
from .cattle_improvements import filter_purpose


class Entry(Strict):
    animal=serializers.UUIDField()
    animal_version=serializers.DateTimeField()


class Input(Strict):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])
    date=serializers.DateField()
    description=serializers.CharField(max_length=200)
    responsible=serializers.CharField(max_length=100,allow_blank=True)
    notes=serializers.CharField(allow_blank=True)
    entries=Entry(many=True,allow_empty=False,max_length=1000)
    def validate_entries(self,entries):
        if len({row['animal'] for row in entries})!=len(entries):
            raise serializers.ValidationError('Um animal não pode ser repetido no manejo.')
        return entries


def eligible(farm,production):
    return filter_purpose(Animal.objects.filter(farm=farm,species__code='bovinos',status='active',gender='M'),production).annotate(
        mobile_is_castrated=Coalesce('cattle_profile__is_castrated',Value(False))).filter(mobile_is_castrated=False)


def animals(user,params):
    farm,query=scope(user,params)
    qs=eligible(farm,query['production'])
    if query['search']: qs=qs.filter(Q(identifier__icontains=query['search'])|Q(cattle_profile__name__icontains=query['search']))
    return qs.only('id','identifier','farm_id','cattle_purpose','entry_date','updated_at','status','gender').order_by('identifier','id')


def animal_data(row):
    from .mobile_weighing import animal_data as base
    return {**base(row),'gender':row.gender,'is_castrated':row.mobile_is_castrated}


@transaction.atomic
def create(user,values):
    farm,query=scope(user,values)
    if values['date']>timezone.localdate(): raise serializers.ValidationError({'date':'Não use data futura.'})
    ids=[entry['animal'] for entry in values['entries']]
    selected=list(eligible(farm,query['production']).filter(pk__in=ids).select_for_update(of=('self',)).only(
        'id','entry_date','updated_at').order_by('id'))
    if len(selected)!=len(ids): raise Conflict()
    # Re-read eligibility after waiting for locks held by an existing castration/animal update.
    selected=list(eligible(farm,query['production']).filter(pk__in=ids).only('id','entry_date','updated_at').order_by('id'))
    if len(selected)!=len(ids): raise Conflict()
    indexed={animal.pk:animal for animal in selected}
    for entry in values['entries']:
        animal=indexed[entry['animal']]
        if animal.updated_at!=entry['animal_version']: raise Conflict()
        if animal.entry_date and values['date']<animal.entry_date:
            raise serializers.ValidationError({'date':'A data do manejo não pode anteceder a entrada dos participantes.'})
    record=CattleManagement.objects.create(farm=farm,kind='castration',date=values['date'],description=values['description'],
        responsible=values['responsible'],notes=values['notes'],created_by=user)
    CattleManagementEntry.objects.bulk_create([CattleManagementEntry(management=record,animal_id=entry['animal']) for entry in values['entries']])
    return {'id':str(record.pk),'farm':str(farm.pk),'kind':record.kind,'status':record.status,'date':str(record.date),
        'participant_count':len(ids)}


class EditInput(Input):
    expected_version=serializers.DateTimeField()



def edit_options(user,management_id,params):
    from .mobile_weighing import draft
    record,farm,query=draft(user,management_id,params,kind='castration')
    rows=list(record.entries.select_related('animal','animal__cattle_profile').only('id','management_id','weight_kg','animal__id',
        'animal__identifier','animal__farm_id','animal__cattle_purpose','animal__entry_date','animal__updated_at','animal__status','animal__gender',
        'animal__cattle_profile__id','animal__cattle_profile__is_castrated').order_by('animal__identifier','id')[:1001])
    if not 1<=len(rows)<=1000 or any(row.weight_kg is not None for row in rows): raise Conflict()
    from .mobile_weighing import animal_data as base
    entries=[]
    for row in rows:
        animal=row.animal; profile=getattr(animal,'cattle_profile',None)
        entries.append({**base(animal),'gender':animal.gender,'is_castrated':profile.is_castrated if profile else False})
    return {**options(user,params),'id':str(record.pk),'version':record.updated_at.astimezone(utc.utc).isoformat(),
        'values':{'date':str(record.date),'description':record.description,'responsible':record.responsible,'notes':record.notes},'entries':entries}


@transaction.atomic
def update(user,management_id,values):
    from .mobile_weighing import draft
    record,farm,query=draft(user,management_id,values,lock=True,kind='castration')
    if record.updated_at!=values['expected_version']: raise Conflict()
    if values['date']>timezone.localdate(): raise serializers.ValidationError({'date':'Não use data futura.'})
    ids=[entry['animal'] for entry in values['entries']]
    locked=list(eligible(farm,None).filter(pk__in=ids).select_for_update(of=('self',)).only('id').order_by('id'))
    if len(locked)!=len(ids): raise Conflict()
    selected=list(eligible(farm,None).filter(pk__in=ids).only('id','entry_date','updated_at','cattle_purpose').order_by('id'))
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
    CattleManagementEntry.objects.bulk_create([CattleManagementEntry(management=record,animal_id=entry['animal']) for entry in values['entries']])
    return {'id':str(record.pk),'farm':str(farm.pk),'kind':record.kind,'status':record.status,'date':str(record.date),'participant_count':len(ids)}


def cancel(user,management_id,values):
    from .mobile_weighing import cancel as cancel_draft
    return cancel_draft(user,management_id,values,kind='castration')
