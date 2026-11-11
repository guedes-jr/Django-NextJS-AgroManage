"""Native read-only milk trends, preserving historical production and aggregate bases."""
from datetime import timedelta
from decimal import Decimal
from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, exceptions
from apps.farms.models import Farm
from .models import Animal
from .mobile_clinic import authorize
from .cattle_analytics import milk_trends

class Scope(serializers.Serializer):
    production=serializers.ChoiceField(choices=['dairy'])
    farm=serializers.UUIDField(required=False)

class Query(Scope):
    start=serializers.DateField()
    end=serializers.DateField()
    animal=serializers.UUIDField(required=False)
    drop_percent=serializers.DecimalField(max_digits=5,decimal_places=2,min_value=1,max_value=100,default=20)
    def validate(self,v):
        if v['start']>v['end'] or (v['end']-v['start']).days>366 or v['end']>timezone.localdate():raise serializers.ValidationError({'period':'Use período sem datas futuras e intervalo de até 366 dias.'})
        return v

def scope(user,params,query=False):
    authorize(user)
    if user.role=='operator' and not user.allowed_livestock.filter(code='bovinos').exists():raise exceptions.PermissionDenied()
    values=(Query if query else Scope)(data=params);values.is_valid(raise_exception=True);v=values.validated_data
    farm=get_object_or_404(Farm.objects.only('id','name'),pk=v['farm'],organization=user.organization) if v.get('farm') else None
    return farm,v

def options(user,params):
    farm,_=scope(user,params);today=timezone.localdate()
    return {'production':'dairy','farm':{'id':str(farm.pk),'name':farm.name} if farm else None,'today':str(today),'timezone':settings.TIME_ZONE,'start':str(today-timedelta(days=29)),'end':str(today),'drop_percent':'20.00'}

def animals(user,params):
    farm,v=scope(user,params,True)
    search=serializers.CharField(max_length=100,allow_blank=True).run_validation(params.get('search',''))
    rows=Animal.objects.filter(farm__organization=user.organization,species__code='bovinos',milk_records__date__range=(v['start'],v['end']))
    if farm:rows=rows.filter(farm=farm)
    if search:rows=rows.filter(Q(identifier__icontains=search)|Q(cattle_profile__name__icontains=search))
    return rows.only('id','identifier','farm_id','cattle_purpose').distinct().order_by('identifier','id')

def animal_data(row):return {'id':str(row.pk),'identifier':row.identifier,'farm':str(row.farm_id),'purpose':row.cattle_purpose}

def report(user,params):
    farm,v=scope(user,params,True)
    animal=None
    if v.get('animal'):
        rows=Animal.objects.filter(farm__organization=user.organization,species__code='bovinos')
        if farm:rows=rows.filter(farm=farm)
        animal=get_object_or_404(rows.only('id','identifier','farm_id','cattle_purpose'),pk=v['animal'])
    data=milk_trends(user.organization,start=v['start'],end=v['end'],farm=farm.pk if farm else None,animal=animal.pk if animal else None,drop_percent=v['drop_percent'])
    amount=lambda value:format(Decimal(value),'.2f')
    series=[{**row,**{key:amount(row[key]) for key in ['produced','discarded','usable']}} for row in data['series']]
    discarded=sum((row['discarded'] for row in data['series']),Decimal(0))
    alert=data['drop_alert']
    return {'production':'dairy','farm':{'id':str(farm.pk),'name':farm.name} if farm else None,'animal':animal_data(animal) if animal else None,
        'start':str(v['start']),'end':str(v['end']),'today':str(timezone.localdate()),'timezone':settings.TIME_ZONE,'drop_threshold':amount(v['drop_percent']),
        'scope':data['scope'],'produced':amount(data['produced']),'discarded':amount(discarded),'usable':amount(data['produced']-discarded),
        'days_with_records':data['days_with_records'],'series':series,'sessions':[{**r,'liters':amount(r['liters'])} for r in data['sessions']],
        'drop_alert':{key:amount(value) if key in ['drop_percent','threshold'] else value for key,value in alert.items() if key!='text'} if alert else None}
