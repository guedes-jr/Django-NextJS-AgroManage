"""Reviewed protocol execution linked to an existing mating, optional semen stock."""
from decimal import Decimal
from django.core import signing
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.http import Http404
from rest_framework import serializers, exceptions
from apps.inventory.models import ItemEstoque, LoteEstoque
from .models import Mating
from . import mobile_protocol_execution as execution
from .mobile_vaccination import Strict, fingerprint
from .mobile_weighing import Conflict
from .cattle_improvements import execute_protocol_step
SALT='livestock.mobile-protocol-mating-semen.v1'

class Input(Strict):
    farm=serializers.UUIDField()
    production=serializers.ChoiceField(choices=['beef','dairy'])
    step=serializers.UUIDField()
    date=serializers.DateField()
    notes=serializers.CharField(max_length=1000,allow_blank=True)
    mating=serializers.UUIDField()
    inventory_lot=serializers.UUIDField(allow_null=True)
    inventory_quantity=serializers.DecimalField(max_digits=10,decimal_places=2,min_value=Decimal('.01'),allow_null=True)
    acknowledged=serializers.BooleanField()
    def validate(self,v):
        if not v['acknowledged']:raise serializers.ValidationError({'acknowledged':'Confirme o vínculo e os efeitos no estoque.'})
        if (v['inventory_lot'] is None)!=(v['inventory_quantity'] is None):raise serializers.ValidationError({'inventory_quantity':'Informe lote e quantidade juntos.'})
        return v

def date_context(user,params):
    step,public,digest=execution.context(user,params)
    date=serializers.DateField().run_validation(params.get('date'))
    if not public['earliest_date']<=str(date)<=public['today']:raise serializers.ValidationError({'date':'Use data entre o início do protocolo e hoje.'})
    return step,public,digest,date

def matings(user,params):
    step,_,_,date=date_context(user,params)
    return Mating.objects.filter(female_id=step.run.animal_id,mating_date=date).only('id','mating_date','mating_type','updated_at').order_by('id')

def mating_data(row):return {'id':str(row.pk),'date':str(row.mating_date),'kind':row.mating_type,'version':row.updated_at.isoformat()}

def lots(user,params):
    _,_,_,date=date_context(user,params)
    search=serializers.CharField(max_length=100,allow_blank=True).run_validation(params.get('search',''))
    qs=LoteEstoque.objects.filter(item__organization=user.organization,item__categoria='semen',item__especie_animal__in=['bovino','multiplo',''],
        item__ativo=True,ativo=True,quantidade_atual__gt=0,data_entrada__lte=date).filter(Q(data_validade__isnull=True)|Q(data_validade__gte=date))
    if search:qs=qs.filter(Q(numero_lote__icontains=search)|Q(item__nome__icontains=search))
    return qs.select_related('item').only('id','numero_lote','quantidade_atual','data_validade','updated_at','item__id','item__nome','item__unidade_medida').order_by('data_validade','id')

def lot_data(row):return {'id':str(row.pk),'item':str(row.item_id),'name':row.item.nome,'number':row.numero_lote,'unit':row.item.unidade_medida,'balance':str(row.quantidade_atual),'expiry':str(row.data_validade) if row.data_validade else None,'version':row.updated_at.isoformat()}

def evaluate(user,v,lock=False):
    step,public,step_digest=execution.context(user,v,lock=lock)
    if not public['earliest_date']<=str(v['date'])<=public['today']:raise serializers.ValidationError({'date':'Data fora do intervalo permitido.'})
    qs=Mating.objects.filter(female_id=step.run.animal_id,mating_date=v['date'])
    if lock:qs=qs.select_for_update()
    mating=get_object_or_404(qs.only('id','mating_date','mating_type','updated_at'),pk=v['mating'])
    lot=None;stock=None;versions={}
    if v['inventory_lot']:
        raw=get_object_or_404(LoteEstoque.objects.filter(item__organization=user.organization).only('item_id'),pk=v['inventory_lot'])
        items=ItemEstoque.objects.filter(pk=raw.item_id,organization=user.organization)
        if lock:items=items.select_for_update()
        item=get_object_or_404(items.only('id','nome','unidade_medida','categoria','especie_animal','ativo','updated_at'))
        rows=LoteEstoque.objects.filter(item=item)
        if lock:rows=rows.select_for_update()
        lot=get_object_or_404(rows.only('id','item_id','numero_lote','quantidade_atual','data_entrada','data_validade','ativo','updated_at'),pk=raw.pk)
        if not item.ativo or not lot.ativo or item.categoria!='semen' or item.especie_animal not in ['bovino','multiplo',''] or lot.data_entrada>v['date'] or lot.data_validade and lot.data_validade<v['date']:
            raise serializers.ValidationError({'inventory_lot':'Lote de sêmen inelegível na data da execução.'})
        if v['inventory_quantity']>lot.quantidade_atual:raise serializers.ValidationError({'inventory_quantity':'Quantidade superior ao saldo disponível.'})
        stock={'lot':str(lot.pk),'item':str(item.pk),'name':item.nome,'number':lot.numero_lote,'unit':item.unidade_medida,'quantity':str(v['inventory_quantity']),
            'before':str(lot.quantidade_atual),'after':str(lot.quantidade_atual-v['inventory_quantity']),'expiry':str(lot.data_validade) if lot.data_validade else None}
        versions={'item':str(item.updated_at),'lot':str(lot.updated_at)}
    review={**public,'mating':mating_data(mating),'stock':stock}
    digest=fingerprint({'review':review,'step_digest':step_digest,'versions':versions})
    return step,mating,lot,review,digest

def preview(user,v):
    *_,public,digest=evaluate(user,v)
    command=Input(v).data
    return {**public,'command':command,'preview_token':signing.dumps({'user':str(user.pk),'org':str(user.organization_id),'command':command,'digest':digest},salt=SALT,compress=True)}

@transaction.atomic
def confirm(user,token):
    execution.writable(user)
    try:intent=signing.loads(token,salt=SALT,max_age=900)
    except signing.BadSignature:raise serializers.ValidationError({'preview_token':'Revisão inválida ou expirada.'})
    if intent['user']!=str(user.pk) or intent['org']!=str(user.organization_id):raise exceptions.PermissionDenied()
    values=Input(data=intent['command']);values.is_valid(raise_exception=True);v=values.validated_data
    try:step,mating,lot,public,digest=evaluate(user,v,lock=True)
    except (Http404,serializers.ValidationError) as error:raise Conflict() from error
    if digest!=intent['digest']:raise Conflict()
    row=execute_protocol_step(user,step,v['date'],v['notes'],inventory_lot=lot,inventory_quantity=v['inventory_quantity'],mating=mating)
    return {'id':str(row.pk),'run':str(row.run_id),'farm':str(v['farm']),'executed_date':str(row.executed_date),'notes':row.notes,
        'mating':str(mating.pk),'stock':public['stock'],'status':'done'}
