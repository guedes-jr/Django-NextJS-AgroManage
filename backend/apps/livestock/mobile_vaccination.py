"""Reviewed native vaccination, preserving dose-per-animal inventory semantics."""
import hashlib
import json
import re
from decimal import Decimal
from django.core import signing
from django.db import transaction
from django.db.models import Q, F
from django.utils import timezone
from rest_framework import serializers, exceptions
from common.operator_access import remember_operator_record
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque
from apps.inventory.selectors import vaccine_category_q
from .models import Animal, AnimalBatch, VaccinationRecord, HistoricoEvento
from .mobile_clinic import authorize, species
from .services import vaccination_inventory_quantity

SALT='livestock.mobile-vaccination.v1'
SPECIES={'bovinos':'bovino','suinos':'suino','aves':'ave','ovinos':'ovino','caprinos':'caprino','equinos':'equino'}
CENT=Decimal('.01')

class Conflict(exceptions.APIException):
    status_code=409
    default_detail='Os dados mudaram ou a revisão expirou. Revise a vacinação novamente.'

class Strict(serializers.Serializer):
    def to_internal_value(self,value):
        if not isinstance(value,dict) or set(value)-set(self.fields):
            raise serializers.ValidationError({'non_field_errors':['Campos não reconhecidos.']})
        return super().to_internal_value(value)

class Query(serializers.Serializer):
    kind=serializers.ChoiceField(choices=['animal','batch'],default='animal')
    target=serializers.UUIDField(required=False)
    farm=serializers.UUIDField(required=False)
    species=serializers.CharField(max_length=30,required=False)
    search=serializers.CharField(max_length=100,allow_blank=True,default='')

class Input(Strict):
    target_kind=serializers.ChoiceField(choices=['animal','batch'])
    target=serializers.UUIDField()
    expected_farm=serializers.UUIDField()
    vaccine_item=serializers.UUIDField()
    dosage_ml=serializers.DecimalField(max_digits=6,decimal_places=2,min_value=CENT)
    application_date=serializers.DateField()
    next_dose_date=serializers.DateField(required=False,allow_null=True,default=None)
    dose_type=serializers.ChoiceField(choices=VaccinationRecord.DoseType.choices)
    applicator=serializers.CharField(max_length=100,allow_blank=True,default='')
    notes=serializers.CharField(max_length=2000,allow_blank=True,default='')

class ConfirmInput(Strict):
    preview_token=serializers.CharField(max_length=60000)


def writable(user):
    authorize(user)
    if user.role=='operator' and user.operator_read_only:
        raise exceptions.PermissionDenied()


def targets(user,params,lock=False):
    authorize(user)
    model=Animal if params['kind']=='animal' else AnimalBatch
    qs=model.objects.filter(farm__organization_id=user.organization_id,status='active')
    if model==AnimalBatch:
        qs=qs.filter(quantity__gt=0)
    # Avoid DISTINCT on the locked outer query in PostgreSQL.
    if user.role=='operator':
        qs=qs.filter(species__in=species(user))
    if params.get('target'):
        qs=qs.filter(pk=params['target'])
    if params.get('farm'):
        qs=qs.filter(farm_id=params['farm'])
    if params.get('species'):
        if not species(user).filter(code=params['species']).exists():
            raise exceptions.PermissionDenied()
        qs=qs.filter(species__code=params['species'])
    identity='identifier' if model==Animal else 'batch_code'
    qs=qs.filter(**{identity+'__icontains':params.get('search','')}).select_related('farm','species')
    fields=['id','farm__id','farm__name','species__id','species__code','entry_date','birth_date','updated_at',identity]
    if model==AnimalBatch:
        fields.append('quantity')
    qs=qs.only(*fields).order_by(identity,'id')
    return qs.select_for_update(of=('self',)) if lock else qs


def target_data(target,kind):
    return {'id':str(target.pk),'kind':kind,'label':target.identifier if kind=='animal' else target.batch_code,
            'farm':str(target.farm_id),'farm_name':target.farm.name,'species':target.species.code,
            'head_count':1 if kind=='animal' else target.quantity}


def divisor(item):
    if item.unidade_medida=='ml':
        return Decimal('1')
    if item.unidade_medida=='l':
        return Decimal('1000')
    if item.unidade_medida not in ('dose','unidade'):
        raise serializers.ValidationError({'vaccine_item':'Unidade de vacina não suportada neste fluxo.'})
    match=re.fullmatch(r'\s*(\d+(?:[.,]\d+)?)\s*(?:ml)?\s*',item.volume_por_dose or '',re.IGNORECASE)
    value=Decimal(match.group(1).replace(',','.')) if match else Decimal('0')
    if value<=0:
        raise serializers.ValidationError({'vaccine_item':'Configure o volume por dose em mL antes de aplicar.'})
    if item.unidade_medida=='unidade':
        if not item.doses_por_embalagem or item.doses_por_embalagem<=0:
            raise serializers.ValidationError({'vaccine_item':'Configure as doses por embalagem antes de aplicar.'})
        value*=item.doses_por_embalagem
    return value


def catalog(user,params):
    authorize(user)
    if not params.get('species') or not species(user).filter(code=params['species']).exists():
        raise exceptions.PermissionDenied()
    code=SPECIES.get(params['species'])
    return ItemEstoque.objects.filter(vaccine_category_q(),organization_id=user.organization_id,ativo=True,
        unidade_medida__in=['ml','l','dose','unidade'],especie_animal__in=['','multiplo',*([code] if code else [])],nome__icontains=params.get('search','')).only(
        'id','nome','unidade_medida','volume_por_dose','doses_por_embalagem').order_by('nome','id')


def vaccine_data(item):
    try:
        divisor(item);configured=True
    except serializers.ValidationError:
        configured=False
    return {'id':str(item.pk),'name':item.nome,'unit':item.unidade_medida,'volume_per_dose':item.volume_por_dose or '',
            'doses_per_package':item.doses_por_embalagem,'configured':configured}


def evaluate(user,command,lock=False):
    writable(user)
    kind=command['target_kind']
    patient=targets(user,{'kind':kind,'target':command['target']},lock).first()
    if not patient:
        raise exceptions.NotFound()
    if patient.farm_id!=command['expected_farm']:
        raise serializers.ValidationError({'expected_farm':'O animal/lote mudou de fazenda. Atualize a seleção.'})
    day=command['application_date'];today=timezone.localdate()
    if day>today or kind=='batch' and day!=today:
        raise serializers.ValidationError({'application_date':'Lotes usam o efetivo de hoje; animais não aceitam data futura.'})
    if patient.entry_date and day<patient.entry_date or patient.birth_date and day<patient.birth_date:
        raise serializers.ValidationError({'application_date':'A aplicação antecede a entrada ou nascimento do animal/lote.'})
    if command['next_dose_date'] and command['next_dose_date']<day:
        raise serializers.ValidationError({'next_dose_date':'A próxima dose não pode anteceder a aplicação.'})
    qs=ItemEstoque.objects.filter(vaccine_category_q(),organization_id=user.organization_id,ativo=True,pk=command['vaccine_item'])
    if lock:
        qs=qs.select_for_update()
    item=qs.first()
    if not item:
        raise serializers.ValidationError({'vaccine_item':'Selecione uma vacina ativa da organização.'})
    code=SPECIES.get(patient.species.code)
    if item.especie_animal not in ('','multiplo',code):
        raise serializers.ValidationError({'vaccine_item':'A vacina não corresponde à espécie selecionada.'})
    raw=command['dosage_ml']/divisor(item)
    per_head=vaccination_inventory_quantity(item,command['dosage_ml'])
    if raw!=per_head or per_head<=0:
        raise serializers.ValidationError({'dosage_ml':'A conversão perde precisão no estoque. Utilize uma unidade que represente a aplicação exatamente (por exemplo, mL).'})
    heads=1 if kind=='animal' else patient.quantity
    quantity=per_head*heads
    if quantity>Decimal('99999999.99'):
        raise serializers.ValidationError({'dosage_ml':'A quantidade excede o limite do estoque.'})
    qs=LoteEstoque.objects.filter(Q(data_validade__isnull=True)|Q(data_validade__gte=day),item=item,ativo=True,quantidade_atual__gt=0,data_entrada__lte=day).order_by(F('data_validade').asc(nulls_last=True),'data_entrada','id')
    if lock:
        qs=qs.select_for_update()
    lots=list(qs)
    available=sum((lot.quantidade_atual for lot in lots),Decimal('0'))
    if available<quantity:
        raise serializers.ValidationError({'dosage_ml':f'Estoque elegível insuficiente. Necessário {quantity} {item.unidade_medida}; disponível {available}.'})
    taken=[];remaining=quantity;cost=Decimal('0')
    for lot in lots:
        if remaining<=0:
            break
        amount=min(remaining,lot.quantidade_atual);remaining-=amount
        cost+=amount*(lot.custo_unitario or Decimal('0'))
        taken.append((lot,amount))
    cost=cost.quantize(CENT)
    if cost>Decimal('99999999.99'):
        raise serializers.ValidationError({'dosage_ml':'O custo da aplicação excede o limite do registro.'})
    public={'target':target_data(patient,kind),'vaccine':vaccine_data(item),'dosage_ml':str(command['dosage_ml']),
            'quantity_per_head':str(per_head),'inventory_quantity':str(quantity),'available':str(available),'remaining':str(available-quantity),
            'lots':[{'id':str(lot.pk),'number':lot.numero_lote,'quantity':str(amount),'expiry':str(lot.data_validade) if lot.data_validade else None} for lot,amount in taken]}
    internal={'public':public,'patient_version':patient.updated_at.isoformat(),'item_version':item.updated_at.isoformat(),
              'cost':str(cost),'today':str(today),'lots':[{'id':str(lot.pk),'version':lot.updated_at.isoformat(),'balance':str(lot.quantidade_atual),'cost':str(lot.custo_unitario)} for lot,_ in taken]}
    return public,internal,patient,item,taken,cost


def fingerprint(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()


def canonical(command):
    return {key:str(value) if value is not None else None for key,value in command.items()}


def preview(user,command):
    public,internal,*_=evaluate(user,command)
    intent=canonical(command)
    token=signing.dumps({'user':str(user.pk),'org':str(user.organization_id),'command':intent,'digest':fingerprint(internal)},salt=SALT,compress=True)
    return {**public,'command':intent,'preview_token':token}


@transaction.atomic
def confirm(user,token):
    writable(user)
    try:
        intent=signing.loads(token,salt=SALT,max_age=900)
    except signing.BadSignature as error:
        raise Conflict() from error
    if intent['user']!=str(user.pk) or intent['org']!=str(user.organization_id):
        raise exceptions.PermissionDenied()
    value=Input(data=intent['command']);value.is_valid(raise_exception=True)
    command=value.validated_data
    try:
        public,internal,patient,item,taken,cost=evaluate(user,command,lock=True)
    except (serializers.ValidationError,exceptions.NotFound) as error:
        raise Conflict() from error
    if fingerprint(internal)!=intent['digest']:
        raise Conflict()
    record=VaccinationRecord.objects.create(farm=patient.farm,species=patient.species,animal=patient if command['target_kind']=='animal' else None,
        batch=patient if command['target_kind']=='batch' else None,vaccine_name=item.nome[:100],vaccine_item=item,
        application_date=command['application_date'],next_dose_date=command['next_dose_date'],dose_type=command['dose_type'],dosage_ml=command['dosage_ml'],
        batch_number=taken[0][0].numero_lote if len(taken)==1 and len(taken[0][0].numero_lote)<=50 else '',applicator=command['applicator'],notes=command['notes'],inventory_cost_snapshot=cost)
    movements=[]
    for lot,amount in taken:
        movement=MovimentacaoEstoque.objects.create(item=item,lote=lot,tipo='consumo',quantidade=amount,responsavel=user,farm=patient.farm,
            destino='Vacinação',observacao=f'Vacinação {record.pk}: {public["target"]["label"]}')
        movements.append(str(movement.pk));lot.quantidade_atual-=amount
        lot.save(update_fields=['quantidade_atual','updated_at'])
    remember_operator_record(user,record)
    HistoricoEvento.objects.create(farm=patient.farm,matriz=patient if command['target_kind']=='animal' else None,lote=patient if command['target_kind']=='batch' else None,
        tipo_evento='Vacinação' if command['target_kind']=='animal' else 'Vacinação de Lote',data_evento=command['application_date'],
        descricao=f'{item.nome}: {public["target"]["label"]}',metadata={'vaccination_record_id':str(record.pk),'vaccine_item_id':str(item.pk),
            'responsible_id':str(user.pk),'animal_count':public['target']['head_count'],'dosage_ml':public['dosage_ml'],
            'inventory_quantity':public['inventory_quantity'],'inventory_unit':item.unidade_medida,'lots':public['lots'],'movements':movements})
    return {'id':str(record.pk),'inventory_quantity':public['inventory_quantity'],'inventory_unit':item.unidade_medida}
