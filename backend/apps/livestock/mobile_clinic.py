"""Cost-free mobile reads of health (exams/treatments) and vaccination records.

The web clinic, its consultations, diseases and sanitary alerts were removed; this
module also keeps the authorization and animal helpers shared by the mobile APIs.
"""
from datetime import timedelta
from django.db.models import Q, F
from django.utils import timezone
from django.conf import settings
from rest_framework import serializers, exceptions
from common.operator_access import scoped_queryset
from .models import HealthRecord, VaccinationRecord, Animal, AnimalBatch, Species

KINDS = {'health': HealthRecord, 'vaccinations': VaccinationRecord}
DATES = {'health':'application_date','vaccinations':'application_date'}


def authorize(user):
    if not user.organization_id or user.force_password_change or user.role not in ('admin','manager','operator'):
        raise exceptions.PermissionDenied()
    if user.role == 'operator' and not user.allowed_livestock.exists():
        raise exceptions.PermissionDenied()


class Query(serializers.Serializer):
    kind = serializers.ChoiceField(choices=list(KINDS), default='health')
    farm = serializers.UUIDField(required=False)
    animal = serializers.UUIDField(required=False)
    batch = serializers.UUIDField(required=False)
    species = serializers.CharField(max_length=30, required=False)
    search = serializers.CharField(max_length=100, allow_blank=True, default='')
    start = serializers.DateField(required=False)
    end = serializers.DateField(required=False)

    def validate(self, data):
        if bool(data.get('start')) != bool(data.get('end')) or data.get('start') and not (data['start'] <= data['end'] <= data['start']+timedelta(days=365)):
            raise serializers.ValidationError({'start':'Informe um período válido de até 366 dias.'})
        if data.get('batch') and data['kind'] == 'health':
            raise serializers.ValidationError({'batch':'Exames/tratamentos exigem animal identificado.'})
        return data


def species(user):
    return user.allowed_livestock.all() if user.role == 'operator' else Species.objects.all()


def rows(user, query):
    authorize(user)
    kind = query['kind']
    qs = scoped_queryset(KINDS[kind].objects.filter(farm__organization_id=user.organization_id), user)
    # Legacy links must not expose another tenant or an unauthorized secondary species.
    foreign_animals=Animal.objects.exclude(farm__organization_id=user.organization_id).values('pk')
    foreign_batches=AnimalBatch.objects.exclude(farm__organization_id=user.organization_id).values('pk')
    qs=qs.exclude(animal__in=foreign_animals)
    if kind == 'vaccinations':
        qs=qs.exclude(batch__in=foreign_batches)
        if user.role == 'operator':
            codes=user.allowed_livestock.values_list('code',flat=True)
            qs=qs.exclude(animal__in=Animal.objects.exclude(species__code__in=codes)).exclude(batch__in=AnimalBatch.objects.exclude(species__code__in=codes))
    if kind == 'health':
        qs = qs.filter(Q(cattle_management__isnull=True) | Q(cattle_management__farm_id=F('farm_id'))).filter(
            Q(cattle_management__inventory_lot__isnull=True) | Q(cattle_management__inventory_lot__item__organization_id=user.organization_id)
        )
    qs = qs.select_related('farm', 'animal__species')
    if kind == 'vaccinations':
        qs = qs.select_related('batch__species', 'species')
    else:
        qs = qs.select_related('cattle_management__inventory_lot__item')
    own_fields={
        'health':['treatment_type','application_date','description','veterinary','notes','cattle_management__id','cattle_management__status','cattle_management__inventory_quantity_per_animal','cattle_management__milk_withdrawal_until','cattle_management__meat_withdrawal_until','cattle_management__inventory_lot__id','cattle_management__inventory_lot__numero_lote','cattle_management__inventory_lot__item__id','cattle_management__inventory_lot__item__nome','cattle_management__inventory_lot__item__unidade_medida'],
        'vaccinations':['vaccine_name','application_date','next_dose_date','dose_type','dosage_ml','batch_number','applicator','notes','species__code'],
    }[kind]
    selected=['id','farm__id','farm__name',*own_fields,'animal__id','animal__identifier','animal__species__code']
    if kind == 'vaccinations':
        selected.extend(['batch__id','batch__batch_code','batch__species__code'])
    qs=qs.only(*selected)
    if query.get('farm'):
        qs = qs.filter(farm_id=query['farm'])
    if query.get('animal'):
        qs = qs.filter(animal_id=query['animal'])
    if query.get('batch'):
        qs = qs.filter(batch_id=query['batch'])
    if query.get('species'):
        code = query['species']
        if not species(user).filter(code=code).exists():
            raise exceptions.PermissionDenied()
        if kind == 'health':
            qs = qs.filter(animal__species__code=code)
        else:
            qs = qs.filter(species__code=code)
    if query.get('start'):
        qs = qs.filter(**{f'{DATES[kind]}__range':(query['start'],query['end'])})
    search = query.get('search','')
    if search:
        if kind == 'health':
            qs = qs.filter(Q(animal__identifier__icontains=search)|Q(description__icontains=search))
        else:
            qs = qs.filter(Q(animal__identifier__icontains=search)|Q(batch__batch_code__icontains=search)|Q(vaccine_name__icontains=search)|Q(notes__icontains=search))
    return qs.distinct().order_by('-'+DATES[kind],'-created_at','-id')


def data(obj, kind, detail=False):
    animal = getattr(obj,'animal',None)
    batch = getattr(obj,'batch',None)
    code = getattr(obj,'species',None) if kind == 'vaccinations' else animal.species if animal else batch.species if batch else None
    title = obj.vaccine_name if kind == 'vaccinations' else obj.get_treatment_type_display()
    notes = obj.description if kind == 'health' else obj.notes
    result = {'id':str(obj.pk),'kind':kind,'title':title,'date':str(getattr(obj,DATES[kind])),
        'farm':str(obj.farm_id),'farm_name':obj.farm.name,'animal':str(animal.pk) if animal else None,'animal_identifier':animal.identifier if animal else '',
        'batch':str(batch.pk) if batch else None,'batch_code':batch.batch_code if batch else '', 'species':code.code if code else '',
        'subtype':obj.treatment_type if kind == 'health' else obj.dose_type,
        'severity':'', 'status':'',
        'preview':notes[:200]}
    if detail:
        result['notes']=notes
        result['extra_notes']=obj.notes if kind == 'health' else ''
        result['professional']=obj.veterinary if kind == 'health' else obj.applicator
        result['record_time']=None
        result['disease']=''
        result['next_dose_date']=str(obj.next_dose_date) if kind == 'vaccinations' and obj.next_dose_date else None
        result['dosage_ml']=str(obj.dosage_ml) if kind == 'vaccinations' and obj.dosage_ml is not None else None
        result['vaccine_batch']=obj.batch_number if kind == 'vaccinations' else ''
        result['application'] = None
        if kind == 'health' and obj.cattle_management_id and obj.cattle_management.inventory_lot_id and obj.cattle_management.inventory_quantity_per_animal is not None:
            management = obj.cattle_management
            lot = management.inventory_lot
            result['application'] = {'management': str(management.pk), 'status': management.status,
                'product': lot.item.nome, 'lot': lot.numero_lote, 'unit': lot.item.unidade_medida,
                'quantity': str(management.inventory_quantity_per_animal),
                'milk_until': str(management.milk_withdrawal_until) if management.milk_withdrawal_until else None,
                'meat_until': str(management.meat_withdrawal_until) if management.meat_withdrawal_until else None}
        result['affected_animals']=0
        result['affected_batches']=0
    return result


def options(user):
    authorize(user)
    return {'today':str(timezone.localdate()),'timezone':settings.TIME_ZONE,
            'species':[{'value':row.code,'label':row.name} for row in species(user).order_by('name','id')],
            # Consultations were removed with the web clinic; kept empty for app compatibility.
            'record_types':[],'severities':[],'outcomes':[]}


def animals(user, query):
    authorize(user)
    qs=scoped_queryset(Animal.objects.filter(farm__organization_id=user.organization_id,status='active'),user).select_related('farm','species').only('id','identifier','farm__id','farm__name','species__code')
    if query.get('farm'):
        qs=qs.filter(farm_id=query['farm'])
    if query.get('animal'):
        qs=qs.filter(pk=query['animal'])
    if query.get('species'):
        if not species(user).filter(code=query['species']).exists():
            raise exceptions.PermissionDenied()
        qs=qs.filter(species__code=query['species'])
    search=query.get('search','')
    return qs.filter(identifier__icontains=search).order_by('identifier','id')


def animal_data(obj):
    return {'id':str(obj.pk),'identifier':obj.identifier,'farm':str(obj.farm_id),'farm_name':obj.farm.name,'species':obj.species.code}
