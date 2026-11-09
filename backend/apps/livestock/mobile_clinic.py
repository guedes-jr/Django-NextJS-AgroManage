"""Cost-free clinical mobile reads and essential, individual clinical recording."""
from datetime import timedelta
from django.db import transaction
from django.db.models import Q, Count, F
from django.utils import timezone
from django.conf import settings
from rest_framework import serializers, exceptions
from common.operator_access import scoped_queryset
from .models import ClinicalRecord, HealthRecord, VaccinationRecord, SanitaryAlert, Animal, AnimalBatch, Species

KINDS = {'clinical': ClinicalRecord, 'health': HealthRecord, 'vaccinations': VaccinationRecord, 'alerts': SanitaryAlert}
DATES = {'clinical':'record_date','health':'application_date','vaccinations':'application_date','alerts':'created_date'}


def authorize(user):
    if not user.organization_id or user.force_password_change or user.role not in ('admin','manager','operator'):
        raise exceptions.PermissionDenied()
    if user.role == 'operator' and not user.allowed_livestock.exists():
        raise exceptions.PermissionDenied()


class Query(serializers.Serializer):
    kind = serializers.ChoiceField(choices=list(KINDS), default='clinical')
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
    if kind == 'alerts':
        qs=qs.exclude(affected_animals__in=foreign_animals).exclude(affected_batches__in=foreign_batches)
    else:
        qs=qs.exclude(animal__in=foreign_animals)
        if kind in ('clinical','vaccinations'):
            qs=qs.exclude(batch__in=foreign_batches)
    if user.role == 'operator' and kind in ('clinical','vaccinations'):
        codes=user.allowed_livestock.values_list('code',flat=True)
        qs=qs.exclude(animal__in=Animal.objects.exclude(species__code__in=codes)).exclude(batch__in=AnimalBatch.objects.exclude(species__code__in=codes))
    if kind == 'health':
        qs = qs.filter(Q(cattle_management__isnull=True) | Q(cattle_management__farm_id=F('farm_id'))).filter(
            Q(cattle_management__inventory_lot__isnull=True) | Q(cattle_management__inventory_lot__item__organization_id=user.organization_id)
        )
    qs = qs.select_related('farm')
    if kind != 'alerts':
        qs = qs.select_related('animal__species')
    if kind in ('clinical','vaccinations'):
        qs = qs.select_related('batch__species')
    if kind == 'health':
        qs = qs.select_related('cattle_management__inventory_lot__item')
    if kind == 'clinical':
        qs = qs.select_related('disease')
    if kind == 'vaccinations':
        qs = qs.select_related('species')
    own_fields={
        'clinical':['record_type','record_date','record_time','clinical_notes','severity','outcome','veterinarian','notes','disease__name'],
        'health':['treatment_type','application_date','description','veterinary','notes','cattle_management__id','cattle_management__status','cattle_management__inventory_quantity_per_animal','cattle_management__milk_withdrawal_until','cattle_management__meat_withdrawal_until','cattle_management__inventory_lot__id','cattle_management__inventory_lot__numero_lote','cattle_management__inventory_lot__item__id','cattle_management__inventory_lot__item__nome','cattle_management__inventory_lot__item__unidade_medida'],
        'vaccinations':['vaccine_name','application_date','next_dose_date','dose_type','dosage_ml','batch_number','applicator','notes','species__code'],
        'alerts':['title','alert_type','severity','description','status','created_date','notes'],
    }[kind]
    selected=['id','farm__id','farm__name',*own_fields]
    if kind != 'alerts':
        selected.extend(['animal__id','animal__identifier','animal__species__code'])
    if kind in ('clinical','vaccinations'):
        selected.extend(['batch__id','batch__batch_code','batch__species__code'])
    qs=qs.only(*selected)
    if kind == 'alerts':
        qs = qs.annotate(animal_count=Count('affected_animals',distinct=True),batch_count=Count('affected_batches',distinct=True))
    if query.get('farm'):
        qs = qs.filter(farm_id=query['farm'])
    if query.get('animal'):
        qs = qs.filter(**{('affected_animals__id' if kind == 'alerts' else 'animal_id'):query['animal']})
    if query.get('batch'):
        qs = qs.filter(**{('affected_batches__id' if kind == 'alerts' else 'batch_id'):query['batch']})
    if query.get('species'):
        code = query['species']
        if not species(user).filter(code=code).exists():
            raise exceptions.PermissionDenied()
        if kind == 'alerts':
            qs = qs.filter(Q(affected_animals__species__code=code)|Q(affected_batches__species__code=code))
        elif kind == 'health':
            qs = qs.filter(animal__species__code=code)
        elif kind == 'clinical':
            qs = qs.filter(Q(animal__species__code=code)|Q(batch__species__code=code))
        else:
            qs = qs.filter(species__code=code)
    if query.get('start'):
        qs = qs.filter(**{f'{DATES[kind]}__range':(query['start'],query['end'])})
    search = query.get('search','')
    if search:
        if kind == 'alerts':
            qs = qs.filter(Q(title__icontains=search)|Q(description__icontains=search)|Q(affected_animals__identifier__icontains=search)|Q(affected_batches__batch_code__icontains=search))
        elif kind == 'health':
            qs = qs.filter(Q(animal__identifier__icontains=search)|Q(description__icontains=search))
        elif kind == 'clinical':
            qs = qs.filter(Q(animal__identifier__icontains=search)|Q(clinical_notes__icontains=search))
        else:
            qs = qs.filter(Q(animal__identifier__icontains=search)|Q(batch__batch_code__icontains=search)|Q(vaccine_name__icontains=search)|Q(notes__icontains=search))
    order=['-'+DATES[kind],'-created_at','-id']
    if kind == 'clinical':
        order.insert(1,F('record_time').desc(nulls_last=True))
    return qs.distinct().order_by(*order)


def data(obj, kind, detail=False):
    animal = getattr(obj,'animal',None)
    batch = getattr(obj,'batch',None)
    code = getattr(obj,'species',None) if kind == 'vaccinations' else animal.species if animal else batch.species if batch else None
    title = obj.title if kind == 'alerts' else obj.vaccine_name if kind == 'vaccinations' else obj.get_record_type_display() if kind == 'clinical' else obj.get_treatment_type_display()
    notes = obj.clinical_notes if kind == 'clinical' else obj.description if kind in ('health','alerts') else obj.notes
    result = {'id':str(obj.pk),'kind':kind,'title':title,'date':str(getattr(obj,DATES[kind])),
        'farm':str(obj.farm_id),'farm_name':obj.farm.name,'animal':str(animal.pk) if animal else None,'animal_identifier':animal.identifier if animal else '',
        'batch':str(batch.pk) if batch else None,'batch_code':batch.batch_code if batch else '', 'species':code.code if code else '',
        'subtype':obj.record_type if kind == 'clinical' else obj.treatment_type if kind == 'health' else obj.alert_type if kind == 'alerts' else obj.dose_type,
        'severity':getattr(obj,'severity',''), 'status':obj.outcome if kind == 'clinical' else obj.status if kind == 'alerts' else '',
        'preview':notes[:200]}
    if detail:
        result['notes']=notes
        result['extra_notes']=getattr(obj,'notes','') if kind in ('health','clinical','alerts') else ''
        result['professional']=obj.veterinarian if kind == 'clinical' else obj.veterinary if kind == 'health' else obj.applicator if kind == 'vaccinations' else ''
        result['record_time']=str(obj.record_time) if kind == 'clinical' and obj.record_time else None
        result['disease']=obj.disease.name if kind == 'clinical' and obj.disease_id else ''
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
        result['affected_animals']=obj.animal_count if kind == 'alerts' else 0
        result['affected_batches']=obj.batch_count if kind == 'alerts' else 0
    return result


def options(user):
    authorize(user)
    def choices(values):
        return [{'value':str(value),'label':str(label)} for value,label in values]
    return {'today':str(timezone.localdate()),'timezone':settings.TIME_ZONE,
            'species':[{'value':row.code,'label':row.name} for row in species(user).order_by('name','id')],
            'record_types':choices(ClinicalRecord.RECORD_TYPES),'severities':choices(ClinicalRecord.SEVERITY_CHOICES),'outcomes':choices(ClinicalRecord.OUTCOME_CHOICES)}


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


class ClinicalInput(serializers.ModelSerializer):
    expected_farm = serializers.UUIDField(write_only=True)
    animal = serializers.UUIDField()
    clinical_notes = serializers.CharField(max_length=8000)
    class Meta:
        model=ClinicalRecord
        fields=['animal','expected_farm','record_type','record_date','record_time','clinical_notes','severity','outcome','veterinarian']

    def to_internal_value(self, value):
        if not isinstance(value,dict) or set(value)-set(self.fields):
            raise serializers.ValidationError({'non_field_errors':['Campos não reconhecidos.']})
        return super().to_internal_value(value)

    def validate(self, attrs):
        user=self.context['request'].user
        authorize(user)
        if attrs['record_date']>timezone.localdate():
            raise serializers.ValidationError({'record_date':'A data não pode estar no futuro.'})
        target=animals(user,{'animal':attrs['animal']}).first()
        if not target:
            raise exceptions.NotFound()
        if target.farm_id != attrs['expected_farm']:
            raise serializers.ValidationError({'expected_farm':'O animal mudou de fazenda. Atualize a seleção.'})
        attrs['animal']=target
        attrs['farm']=target.farm
        return attrs

    @transaction.atomic
    def create(self, validated):
        user=self.context['request'].user
        expected=validated.pop('expected_farm')
        qs=Animal.objects.filter(pk=validated['animal'].pk,status='active',farm__organization_id=user.organization_id).select_related('farm').only('id','farm__id','farm__organization_id','species_id','status').select_for_update(of=('self',))
        if user.role == 'operator':
            qs=qs.filter(species__in=species(user))
        target=qs.first()
        if not target or target.farm_id != expected:
            raise serializers.ValidationError({'animal':'O animal mudou. Atualize antes de registrar.'})
        validated['animal']=target
        validated['farm']=target.farm
        return ClinicalRecord.objects.create(**validated)
