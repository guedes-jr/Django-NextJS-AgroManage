"""Manager-only native segment cost report, separate operational and cash bases."""
from datetime import timedelta
from decimal import Decimal
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, exceptions
from apps.farms.models import Farm
from .models import AnimalBatch
from .mobile_clinic import authorize
from .cattle_analytics import cattle_cost_report

class Scope(serializers.Serializer):
    production=serializers.ChoiceField(choices=['beef','dairy'])
    farm=serializers.UUIDField()

class Query(Scope):
    start=serializers.DateField()
    end=serializers.DateField()
    batch=serializers.UUIDField(required=False)
    tab=serializers.ChoiceField(choices=['operations','expenses'],default='operations')
    page=serializers.IntegerField(min_value=1,max_value=100000,default=1)
    def validate(self,v):
        if v['start']>v['end'] or v['end']>timezone.localdate() or (v['end']-v['start']).days>366:raise serializers.ValidationError({'period':'Use período válido sem futuro, de até 366 dias.'})
        return v

def scope(user,params,query=False):
    authorize(user)
    if user.role not in ['admin','manager']:raise exceptions.PermissionDenied()
    values=(Query if query else Scope)(data=params);values.is_valid(raise_exception=True);v=values.validated_data
    farm=get_object_or_404(Farm.objects.only('id','name'),pk=v['farm'],organization=user.organization)
    return farm,v

def options(user,params):
    farm,v=scope(user,params);today=timezone.localdate()
    return {'farm':{'id':str(farm.pk),'name':farm.name},'production':v['production'],'today':str(today),'timezone':settings.TIME_ZONE,'start':str(today-timedelta(days=29)),'end':str(today)}

def batches(user,params):
    farm,v=scope(user,params)
    search=serializers.CharField(max_length=100,allow_blank=True).run_validation(params.get('search',''))
    rows=AnimalBatch.objects.filter(farm=farm,species__code='bovinos',cattle_purpose__in=[v['production'],'dual'])
    if search:rows=rows.filter(batch_code__icontains=search)
    return rows.only('id','batch_code','farm_id','cattle_purpose').order_by('batch_code','id')

def batch_data(row):return {'id':str(row.pk),'identifier':row.batch_code,'farm':str(row.farm_id),'purpose':row.cattle_purpose}

def report(user,params):
    farm,v=scope(user,params,True);batch=None
    if v.get('batch'):batch=get_object_or_404(AnimalBatch.objects.only('id','batch_code','farm_id','cattle_purpose'),pk=v['batch'],farm=farm,species__code='bovinos',cattle_purpose__in=[v['production'],'dual'])
    raw=cattle_cost_report(user.organization,start=v['start'],end=v['end'],farm=farm.pk,batch=batch.pk if batch else None,purpose=v['production'],native=True)
    money=lambda value:format(Decimal(value),'.2f')
    entries=[{**r,'amount':money(r['amount']) if r['amount'] is not None else None} for r in raw['entries']]
    expenses=[{**r,'amount':money(r['amount'])} for r in raw['expenses']]
    rows=entries if v['tab']=='operations' else expenses;offset=(v['page']-1)*20
    if v['page']>1 and offset>=len(rows):raise exceptions.NotFound('Página inexistente.')
    return {'farm':{'id':str(farm.pk),'name':farm.name},'production':v['production'],'batch':batch_data(batch) if batch else None,
        'start':str(v['start']),'end':str(v['end']),'today':str(timezone.localdate()),'timezone':settings.TIME_ZONE,'tab':v['tab'],'page':v['page'],'page_size':20,
        'operational_total':money(raw['operational_total']),'expenses_by_due_date':money(raw['expenses_by_due_date']),'missing_cost_count':raw['missing_cost_count'],
        'currency':'BRL','totals':{source:money(raw['totals'].get(source,0)) for source in ['feed','sanitary','health','vaccine','semen']},
        'missing_by_source':{source:sum(row['amount'] is None and row['source']==source for row in entries) for source in ['feed','sanitary','health','vaccine','semen']},'operation_count':len(entries),'expense_count':len(expenses),
        'count':len(rows),'next':offset+20<len(rows),'previous':v['page']>1,'results':rows[offset:offset+20]}
