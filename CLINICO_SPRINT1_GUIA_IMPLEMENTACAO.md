# 🛠️ Guia de Implementação - Sprint 1

## Objetivo
Estabelecer a fundação sólida para o módulo Clínico com dados estruturados.

## Timeline
**Duração:** 7 dias  
**Equipe:** 1 Backend Senior + 1 Frontend Mid  
**Início:** Segunda-feira (Semana 1)

---

## DIA 1: Setup e Design

### Morning (2h)
- [ ] Team meeting de kickoff
- [ ] Review do plano detalhado
- [ ] Alocação de tasks
- [ ] Setup de branches git

**Branch Strategy:**
```bash
main
├── feature/clinical-backend
│   ├── feature/clinical-models
│   ├── feature/clinical-views
│   └── feature/clinical-serializers
└── feature/clinical-frontend
    ├── feature/clinical-dashboard
    ├── feature/clinical-form
    └── feature/clinical-ui-components
```

### Afternoon (4h)

**Backend:**
- [ ] Criar arquivo `backend/apps/livestock/models_clinical.py` (novo)
- [ ] Documentar schema em Notion/Confluence
- [ ] Review com arquiteto

**Frontend:**
- [ ] Criar pasta `frontend/src/app/home/clinico/components/clinical/`
- [ ] Setup de serviços: `frontend/src/services/clinicalService.ts`
- [ ] Documentar tipos TypeScript

### Entregáveis do Dia 1
- ✅ Documento de schema de dados
- ✅ Branches criadas
- ✅ Structure de pastas
- ✅ Stubs de arquivos

---

## DIA 2: Modelos Backend

### Morning (4h)

**Tarefa:** Implementar modelos Django

```python
# backend/apps/livestock/models.py (adicionar)

class Symptom(BaseModel):
    """Sintoma padrão"""
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    species = models.ManyToManyField(Species)
    urgency_level = models.CharField(
        max_length=20,
        choices=[
            ('low', 'Baixa'),
            ('medium', 'Média'),
            ('high', 'Alta'),
            ('critical', 'Crítica'),
        ],
        default='medium'
    )
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return self.name


class Disease(BaseModel):
    """Doença/Patologia"""
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    species = models.ForeignKey(
        Species,
        on_delete=models.CASCADE,
        related_name='diseases'
    )
    description = models.TextField()
    
    # Sintomas e manifestação
    symptoms = models.ManyToManyField(Symptom)
    typical_symptoms = models.JSONField(
        default=list,
        help_text='Sintomas típicos dessa doença'
    )
    
    # Tratamento
    recommended_treatment = models.TextField()
    typical_duration_days = models.IntegerField(null=True, blank=True)
    
    # Epidemiologia
    incubation_period_days = models.IntegerField(null=True, blank=True)
    transmission_route = models.CharField(
        max_length=50,
        choices=[
            ('direct', 'Contato direto'),
            ('indirect', 'Contato indireto'),
            ('respiratory', 'Via respiratória'),
            ('alimentar', 'Via alimentar'),
            ('unknown', 'Desconhecida'),
        ]
    )
    is_infectious = models.BooleanField(default=False)
    is_reportable = models.BooleanField(default=False)
    
    # Estatísticas
    mortality_rate = models.FloatField(null=True, blank=True)
    recovery_rate = models.FloatField(null=True, blank=True)
    
    # Metadata
    prevention_measures = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['species', 'name']
        verbose_name_plural = "Diseases"
    
    def __str__(self):
        return f"{self.name} ({self.species.code})"


class ClinicalRecord(BaseModel):
    """Registro Clínico do Animal"""
    
    RECORD_TYPES = [
        ('consultation', 'Consulta'),
        ('diagnosis', 'Diagnóstico'),
        ('treatment', 'Tratamento'),
        ('follow_up', 'Acompanhamento'),
        ('recovery', 'Recuperação'),
    ]
    
    SEVERITY_CHOICES = [
        ('mild', 'Leve'),
        ('moderate', 'Moderado'),
        ('severe', 'Grave'),
        ('critical', 'Crítico'),
    ]
    
    IMPROVEMENT_STATUS = [
        ('no_improvement', 'Sem melhora'),
        ('stable', 'Estável'),
        ('improving', 'Melhorando'),
        ('recovered', 'Curado'),
    ]
    
    OUTCOME_CHOICES = [
        ('cured', 'Curado'),
        ('death', 'Morte'),
        ('chronic', 'Crônico'),
        ('unknown', 'Desconhecido'),
        ('pending', 'Pendente'),
    ]
    
    # Identificação
    farm = models.ForeignKey(
        'farms.Farm',
        on_delete=models.CASCADE,
        related_name='clinical_records'
    )
    animal = models.ForeignKey(
        Animal,
        on_delete=models.CASCADE,
        related_name='clinical_records'
    )
    batch = models.ForeignKey(
        AnimalBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    
    # Tipo e Data
    record_type = models.CharField(
        max_length=20,
        choices=RECORD_TYPES,
        default='consultation'
    )
    record_date = models.DateField()
    record_time = models.TimeField(null=True, blank=True)
    
    # Sintomas Observados
    symptoms_observed = models.JSONField(default=list)
    clinical_notes = models.TextField()
    body_temperature = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True
    )
    
    # Diagnóstico
    disease = models.ForeignKey(
        Disease,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='clinical_records'
    )
    severity = models.CharField(
        max_length=20,
        choices=SEVERITY_CHOICES,
        default='moderate'
    )
    
    # Prescrição
    prescribed_medications = models.JSONField(
        default=list,
        help_text='Lista de medicamentos prescritos'
    )
    
    # Evolução
    followup_date = models.DateField(null=True, blank=True)
    improvement_status = models.CharField(
        max_length=20,
        choices=IMPROVEMENT_STATUS,
        null=True,
        blank=True
    )
    
    # Resultado
    outcome = models.CharField(
        max_length=20,
        choices=OUTCOME_CHOICES,
        default='pending'
    )
    outcome_date = models.DateField(null=True, blank=True)
    
    # Custo
    treatment_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Veterinário
    veterinarian = models.CharField(max_length=100, blank=True)
    
    # Notas
    notes = models.TextField(blank=True)
    is_critical = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-record_date', '-record_time']
        indexes = [
            models.Index(fields=['farm', '-record_date']),
            models.Index(fields=['animal', '-record_date']),
            models.Index(fields=['disease', '-record_date']),
        ]
        verbose_name = "Clinical Record"
        verbose_name_plural = "Clinical Records"
    
    def __str__(self):
        return f"{self.animal.identifier} - {self.record_date} ({self.disease})"


class MedicationInventory(BaseModel):
    """Inventário de Medicamentos"""
    
    farm = models.ForeignKey('farms.Farm', on_delete=models.CASCADE)
    
    # Informações
    medication_name = models.CharField(max_length=150)
    active_ingredient = models.CharField(max_length=150, blank=True)
    dosage = models.CharField(max_length=50)
    concentration = models.CharField(max_length=50, blank=True)
    unit = models.CharField(
        max_length=20,
        choices=[
            ('mg', 'Miligrama'),
            ('ml', 'Mililitro'),
            ('g', 'Grama'),
            ('unit', 'Unidade'),
        ]
    )
    
    # Lote
    batch_number = models.CharField(max_length=50)
    manufacturing_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField()
    
    # Quantidade
    quantity_available = models.DecimalField(max_digits=10, decimal_places=3)
    reorder_level = models.DecimalField(max_digits=10, decimal_places=3)
    
    # Financeiro
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)
    supplier = models.CharField(max_length=100)
    
    # Uso
    species_indicated = models.ManyToManyField(Species)
    therapeutic_class = models.CharField(max_length=100, blank=True)
    
    # Metadata
    storage_conditions = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)
    is_available = models.BooleanField(default=True)
    
    class Meta:
        unique_together = [['farm', 'medication_name', 'batch_number']]
        ordering = ['-expiry_date']
        verbose_name_plural = "Medication Inventories"
    
    def __str__(self):
        return f"{self.medication_name} ({self.batch_number})"
    
    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now().date() > self.expiry_date
    
    @property
    def days_to_expiry(self):
        from django.utils import timezone
        return (self.expiry_date - timezone.now().date()).days


class SanitaryAlert(BaseModel):
    """Alerta Sanitário"""
    
    ALERT_TYPES = [
        ('disease_outbreak', 'Surto de Doença'),
        ('medication_expired', 'Medicamento Vencido'),
        ('vaccine_expired', 'Vacina Vencida'),
        ('high_mortality', 'Mortalidade Elevada'),
        ('other', 'Outro'),
    ]
    
    SEVERITY_LEVELS = [
        ('low', 'Baixa'),
        ('medium', 'Média'),
        ('high', 'Alta'),
        ('critical', 'Crítica'),
    ]
    
    STATUS_CHOICES = [
        ('active', 'Ativo'),
        ('acknowledged', 'Reconhecido'),
        ('resolved', 'Resolvido'),
    ]
    
    farm = models.ForeignKey('farms.Farm', on_delete=models.CASCADE)
    
    alert_type = models.CharField(max_length=30, choices=ALERT_TYPES)
    severity = models.CharField(max_length=20, choices=SEVERITY_LEVELS)
    
    title = models.CharField(max_length=200)
    description = models.TextField()
    recommended_actions = models.TextField()
    
    # Escopo
    affected_animals = models.ManyToManyField(Animal, blank=True)
    affected_batches = models.ManyToManyField(AnimalBatch, blank=True)
    disease = models.ForeignKey(
        Disease,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active'
    )
    
    # Timeline
    created_date = models.DateField(auto_now_add=True)
    acknowledged_date = models.DateField(null=True, blank=True)
    resolved_date = models.DateField(null=True, blank=True)
    
    # Metadata
    generated_by = models.CharField(max_length=50, default='system')
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-created_date']
        verbose_name_plural = "Sanitary Alerts"
    
    def __str__(self):
        return f"{self.title} ({self.severity})"
```

### Afternoon (3h)

**Tarefas:**
- [ ] Revisar código com colega
- [ ] Testes unitários básicos dos modelos
- [ ] Documentar campos em docstrings

### Entregáveis do Dia 2
- ✅ Modelos Django funcionais
- ✅ Testes de modelos (básicos)
- ✅ Documentação em código

---

## DIA 3: Migrações e Seed Data

### Morning (3h)

**Tarefa:** Criar e aplicar migrações

```bash
# Terminal
cd backend
python manage.py makemigrations livestock

# Revisar arquivo de migração gerado
git show HEAD:backend/apps/livestock/migrations/000X_*.py

# Testar migração
python manage.py migrate
```

**Checklist:**
- [ ] Migração criada sem erros
- [ ] Verificar arquivo de migração
- [ ] Aplicar em BD de dev
- [ ] Sem conflitos com migrações existentes

### Afternoon (3h)

**Tarefa:** Criar seed data

```python
# backend/apps/livestock/management/commands/seed_clinical_data.py

from django.core.management.base import BaseCommand
from livestock.models import Species, Symptom, Disease

class Command(BaseCommand):
    help = 'Seed clinical data'
    
    def handle(self, *args, **kwargs):
        # Criar sintomas
        symptoms_data = [
            ('febre', 'Fever', 'high'),
            ('apatia', 'Lethargy', 'high'),
            ('diareia', 'Diarrhea', 'high'),
            ('tosse', 'Cough', 'medium'),
            ('espirro', 'Sneezing', 'low'),
            ('descarga nasal', 'Nasal discharge', 'medium'),
            ('perda apetite', 'Loss of appetite', 'high'),
            ('edema', 'Swelling', 'high'),
        ]
        
        for code, name, urgency in symptoms_data:
            Symptom.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'urgency_level': urgency
                }
            )
        
        # Criar doenças comuns
        species = Species.objects.filter(code__in=['suino', 'bovino']).first()
        
        diseases_data = [
            {
                'code': 'ASF',
                'name': 'Peste Suína Africana',
                'description': 'Doença viral grave em suínos',
                'transmission': 'direct',
                'mortality': 90.0,
                'infectious': True,
                'reportable': True,
            },
            # ... mais doenças
        ]
        
        for disease_data in diseases_data:
            Disease.objects.get_or_create(
                code=disease_data['code'],
                species=species,
                defaults={...}
            )
        
        self.stdout.write('Seed data criado com sucesso')
```

```bash
# Executar
python manage.py seed_clinical_data
```

### Entregáveis do Dia 3
- ✅ Migrações aplicadas
- ✅ Seed data carregado
- ✅ BD funcionando com novos dados

---

## DIA 4: ViewSets Backend

### Morning (4h)

**Tarefa:** Criar serializers e ViewSets

```python
# backend/apps/livestock/serializers.py (adicionar)

from rest_framework import serializers
from .models import (
    ClinicalRecord, Disease, MedicationInventory, 
    SanitaryAlert, Symptom
)

class SymptomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Symptom
        fields = ['id', 'name', 'code', 'urgency_level']

class DiseaseSerializer(serializers.ModelSerializer):
    symptoms = SymptomSerializer(many=True, read_only=True)
    
    class Meta:
        model = Disease
        fields = [
            'id', 'name', 'code', 'description',
            'symptoms', 'recommended_treatment',
            'incubation_period_days', 'mortality_rate',
            'is_infectious', 'is_reportable'
        ]

class ClinicalRecordSerializer(serializers.ModelSerializer):
    animal_identifier = serializers.CharField(
        source='animal.identifier',
        read_only=True
    )
    disease_name = serializers.CharField(
        source='disease.name',
        read_only=True
    )
    
    class Meta:
        model = ClinicalRecord
        fields = [
            'id', 'farm', 'animal', 'animal_identifier',
            'record_type', 'record_date', 'record_time',
            'symptoms_observed', 'clinical_notes',
            'disease', 'disease_name', 'severity',
            'prescribed_medications', 'outcome',
            'veterinarian', 'created_at'
        ]
        read_only_fields = ['created_at']

class MedicationSerializer(serializers.ModelSerializer):
    days_to_expiry = serializers.SerializerMethodField()
    
    class Meta:
        model = MedicationInventory
        fields = [
            'id', 'medication_name', 'dosage',
            'quantity_available', 'expiry_date',
            'unit_cost', 'supplier', 'is_available',
            'days_to_expiry'
        ]
    
    def get_days_to_expiry(self, obj):
        return obj.days_to_expiry

class AlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = SanitaryAlert
        fields = [
            'id', 'alert_type', 'severity', 'title',
            'description', 'status', 'created_date'
        ]
```

### Afternoon (3h)

```python
# backend/apps/livestock/views.py (adicionar)

from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import (
    ClinicalRecord, Disease, MedicationInventory,
    SanitaryAlert, Symptom
)
from .serializers import (
    ClinicalRecordSerializer, DiseaseSerializer,
    MedicationSerializer, AlertSerializer, SymptomSerializer
)

class ClinicalRecordViewSet(viewsets.ModelViewSet):
    queryset = ClinicalRecord.objects.all()
    serializer_class = ClinicalRecordSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['farm', 'animal', 'disease', 'severity', 'record_type']
    search_fields = ['animal__identifier', 'clinical_notes']
    ordering_fields = ['record_date']
    ordering = ['-record_date']
    
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Histórico clínico do animal"""
        record = self.get_object()
        animal_records = ClinicalRecord.objects.filter(
            animal=record.animal
        ).order_by('-record_date')
        serializer = self.get_serializer(animal_records, many=True)
        return Response(serializer.data)

class DiseaseViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Disease.objects.all()
    serializer_class = DiseaseSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['species']
    search_fields = ['name', 'code']

class MedicationViewSet(viewsets.ModelViewSet):
    queryset = MedicationInventory.objects.all()
    serializer_class = MedicationSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['farm', 'is_available']
    
    @action(detail=False, methods=['get'])
    def expiring_soon(self, request):
        """Medicamentos vencendo em 30 dias"""
        from datetime import timedelta
        from django.utils import timezone
        today = timezone.now().date()
        expiring = MedicationInventory.objects.filter(
            expiry_date__lte=today + timedelta(days=30),
            expiry_date__gte=today
        )
        serializer = self.get_serializer(expiring, many=True)
        return Response(serializer.data)

class AlertViewSet(viewsets.ModelViewSet):
    queryset = SanitaryAlert.objects.all()
    serializer_class = AlertSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['farm', 'status', 'severity']
    ordering = ['-created_date']

class SymptomViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Symptom.objects.all()
    serializer_class = SymptomSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'code']
```

### Entregáveis do Dia 4
- ✅ Serializers implementados
- ✅ ViewSets funcionando
- ✅ Endpoints testados com Postman/curl

---

## DIA 5: URLs e Testes

### Morning (3h)

**Tarefa:** Registrar URLs

```python
# backend/config/urls.py (adicionar)

from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.livestock.views import (
    ClinicalRecordViewSet, DiseaseViewSet,
    MedicationViewSet, AlertViewSet, SymptomViewSet
)

router = DefaultRouter()
router.register(r'clinical/records', ClinicalRecordViewSet)
router.register(r'diseases', DiseaseViewSet)
router.register(r'medications', MedicationViewSet)
router.register(r'alerts', AlertViewSet)
router.register(r'symptoms', SymptomViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
]
```

### Afternoon (3h)

**Tarefa:** Testes unitários

```python
# backend/apps/livestock/tests/test_clinical.py

from django.test import TestCase
from apps.livestock.models import (
    Species, Disease, ClinicalRecord, Animal, AnimalBatch
)
from apps.farms.models import Farm, Organization

class ClinicalRecordTestCase(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Farm")
        self.farm = Farm.objects.create(
            organization=self.org,
            name="Test Farm"
        )
        self.species = Species.objects.create(
            name="Suino",
            code="suino"
        )
        self.animal = Animal.objects.create(
            farm=self.farm,
            species=self.species,
            identifier="A001"
        )
        self.disease = Disease.objects.create(
            name="Gripe Suína",
            code="GS",
            species=self.species
        )
    
    def test_create_clinical_record(self):
        record = ClinicalRecord.objects.create(
            farm=self.farm,
            animal=self.animal,
            record_type='consultation',
            record_date='2026-05-22',
            disease=self.disease,
            severity='moderate',
            clinical_notes="Teste"
        )
        self.assertEqual(record.animal.identifier, "A001")
        self.assertEqual(record.severity, "moderate")
    
    def test_clinical_record_is_critical(self):
        record = ClinicalRecord.objects.create(
            farm=self.farm,
            animal=self.animal,
            record_type='diagnosis',
            record_date='2026-05-22',
            disease=self.disease,
            severity='critical',
            clinical_notes="Crítico",
            is_critical=True
        )
        self.assertTrue(record.is_critical)
```

```bash
# Executar testes
python manage.py test apps.livestock.tests.test_clinical
```

### Entregáveis do Dia 5
- ✅ URLs registradas
- ✅ Testes passando
- ✅ API testada manualmente

---

## DIA 6: Frontend - Dashboard e Formulário

### Morning (4h)

**Tarefas:**

1. **Criar ClinicalService**

```typescript
// frontend/src/services/clinicalService.ts

import { apiClient } from './api';

export interface ClinicalRecord {
  id: number;
  animal_identifier: string;
  disease_name: string;
  record_type: string;
  record_date: string;
  severity: string;
  clinical_notes: string;
  outcome: string;
  veterinarian: string;
}

export const clinicalService = {
  // Registros
  getClinicalRecords: (filters: any = {}) =>
    apiClient.get('/api/clinical/records/', { params: filters }),
  
  createClinicalRecord: (data: any) =>
    apiClient.post('/api/clinical/records/', data),
  
  getClinicalRecord: (id: number) =>
    apiClient.get(`/api/clinical/records/${id}/`),
  
  updateClinicalRecord: (id: number, data: any) =>
    apiClient.patch(`/api/clinical/records/${id}/`, data),
  
  // Doenças
  getDiseases: (speciesId?: string) => {
    const params = speciesId ? { species: speciesId } : {};
    return apiClient.get('/api/diseases/', { params });
  },
  
  // Medicamentos
  getMedications: (filters: any = {}) =>
    apiClient.get('/api/medications/', { params: filters }),
  
  getMedicationsExpiringSoon: () =>
    apiClient.get('/api/medications/expiring_soon/'),
  
  // Alertas
  getAlerts: (filters: any = {}) =>
    apiClient.get('/api/alerts/', { params: filters }),
  
  // Sintomas
  getSymptoms: (search?: string) => {
    const params = search ? { search } : {};
    return apiClient.get('/api/symptoms/', { params });
  },
};
```

2. **Criar componente de Formulário**

```typescript
// frontend/src/app/home/clinico/components/ClinicalRecordForm.tsx

'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface ClinicalRecordFormProps {
  animalId: string;
  onSubmit: (data: any) => Promise<void>;
  isLoading?: boolean;
}

export function ClinicalRecordForm({
  animalId,
  onSubmit,
  isLoading = false,
}: ClinicalRecordFormProps) {
  const [formData, setFormData] = useState({
    record_type: 'consultation',
    record_date: new Date().toISOString().split('T')[0],
    disease: '',
    severity: 'moderate',
    symptoms_observed: [],
    clinical_notes: '',
    veterinarian: '',
    prescribed_medications: [],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      ...formData,
      animal: animalId,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded">
      {/* Tipo de registro */}
      <div className="mb-4">
        <label className="block font-semibold mb-2">Tipo de Registro</label>
        <select
          value={formData.record_type}
          onChange={(e) =>
            setFormData({ ...formData, record_type: e.target.value })
          }
          className="w-full p-2 border rounded"
        >
          <option value="consultation">Consulta</option>
          <option value="diagnosis">Diagnóstico</option>
          <option value="treatment">Tratamento</option>
          <option value="follow_up">Acompanhamento</option>
        </select>
      </div>

      {/* Data */}
      <div className="mb-4">
        <label className="block font-semibold mb-2">Data</label>
        <input
          type="date"
          value={formData.record_date}
          onChange={(e) =>
            setFormData({ ...formData, record_date: e.target.value })
          }
          className="w-full p-2 border rounded"
          required
        />
      </div>

      {/* Notas clínicas */}
      <div className="mb-4">
        <label className="block font-semibold mb-2">Notas Clínicas</label>
        <textarea
          value={formData.clinical_notes}
          onChange={(e) =>
            setFormData({ ...formData, clinical_notes: e.target.value })
          }
          className="w-full p-2 border rounded"
          rows={4}
          required
        />
      </div>

      {/* Botão submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isLoading ? 'Salvando...' : 'Salvar Registro'}
      </button>
    </form>
  );
}
```

### Afternoon (3h)

**Tarefa:** Criar componentes de Dashboard básicos

```typescript
// frontend/src/app/home/clinico/page.tsx (atualizar)

'use client';

import { useState, useEffect } from 'react';
import { clinicalService } from '@/services/clinicalService';
import { ClinicalRecordForm } from './components/ClinicalRecordForm';

export default function ClinicoPage() {
  const [records, setRecords] = useState([]);
  const [kpis, setKpis] = useState({
    total_in_treatment: 0,
    mortality_rate: 0,
    avg_cost: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await clinicalService.getClinicalRecords({
        status: 'active',
      });
      setRecords(response.data);
      // Calcular KPIs
      setKpis({
        total_in_treatment: response.data.length,
        mortality_rate: 0, // TODO: calcular
        avg_cost: 0, // TODO: calcular
      });
    } catch (error) {
      console.error('Erro ao buscar registros:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Clínica Veterinária</h1>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-2xl font-bold">{kpis.total_in_treatment}</div>
          <div className="text-gray-600">Animais em Tratamento</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-2xl font-bold">{kpis.mortality_rate.toFixed(1)}%</div>
          <div className="text-gray-600">Taxa de Mortalidade</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-2xl font-bold">R$ {kpis.avg_cost.toFixed(2)}</div>
          <div className="text-gray-600">Custo Médio</div>
        </div>
      </div>

      {/* Registros */}
      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-xl font-bold mb-4">Últimos Registros</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Animal</th>
              <th className="text-left p-2">Doença</th>
              <th className="text-left p-2">Data</th>
              <th className="text-left p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-b hover:bg-gray-50">
                <td className="p-2">{record.animal_identifier}</td>
                <td className="p-2">{record.disease_name}</td>
                <td className="p-2">{record.record_date}</td>
                <td className="p-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      record.outcome === 'cured'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {record.outcome}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Entregáveis do Dia 6
- ✅ ClinicalService implementado
- ✅ Componentes base criados
- ✅ Dashboard mostrando dados

---

## DIA 7: Review, Testes E2E e Documentação

### Morning (3h)

**Tarefas:**

1. **Teste E2E**

```typescript
// frontend/e2e/clinical.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Clinical Module', () => {
  test('should display dashboard', async ({ page }) => {
    await page.goto('/home/clinico');
    
    const heading = page.locator('h1');
    await expect(heading).toContainText('Clínica Veterinária');
    
    const kpiCards = page.locator('[data-testid="kpi-card"]');
    await expect(kpiCards).toHaveCount(3);
  });

  test('should create clinical record', async ({ page }) => {
    await page.goto('/home/clinico');
    
    // Click "New Record"
    await page.click('button:has-text("Novo Registro")');
    
    // Fill form
    await page.fill('input[name="record_date"]', '2026-05-22');
    await page.fill('textarea[name="clinical_notes"]', 'Test note');
    
    // Submit
    await page.click('button:has-text("Salvar Registro")');
    
    // Check success message
    await expect(page.locator('text=Registro salvo com sucesso')).toBeVisible();
  });
});
```

2. **Teste de API**

```bash
# Verificar endpoints com curl
curl http://localhost:8000/api/clinical/records/ \
  -H "Authorization: Bearer YOUR_TOKEN"

curl http://localhost:8000/api/diseases/ \
  -H "Authorization: Bearer YOUR_TOKEN"

curl http://localhost:8000/api/medications/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Afternoon (4h)

**Tarefas:**

1. **Documentação** (`CLINICO_SPRINT1_SUMMARY.md`)

```markdown
# Sprint 1 - Sumário de Implementação

## O que foi feito

### Backend
- [x] Modelos Django para Clinical, Disease, Medication, Alert
- [x] ViewSets REST completos
- [x] Serializers com validação
- [x] Seed data para testes
- [x] Testes unitários (80%+ coverage)

### Frontend
- [x] ClinicalService para API calls
- [x] Dashboard com KPIs
- [x] Formulário de novo registro
- [x] Tabela de registros

### Testes
- [x] Testes unitários backend
- [x] Testes E2E frontend
- [x] Verificação manual de endpoints

## Métricas

- API Response time: <200ms
- Build time: <30s
- Test coverage: 83%

## Próximos passos

- [ ] Alert system
- [ ] Relatórios
- [ ] Ficha clínica individual
```

2. **Code Review com colega**
   - [ ] Passar por toda implementação
   - [ ] Verificar padrões de código
   - [ ] Documentação

3. **Preparar para deploy**
   - [ ] Backup de BD
   - [ ] Criar PR para main
   - [ ] Documentar deployment steps

### Entregáveis do Dia 7
- ✅ Testes E2E passando
- ✅ Documentação atualizada
- ✅ Code review completo
- ✅ Pronto para Sprint 2

---

## Checklist Final Sprint 1

### Funcionalidade
- [ ] Criar Clinical Record
- [ ] Listar registros com filtros
- [ ] Ver detalhes do registro
- [ ] Editar registro existente
- [ ] Dashboard com KPIs reais
- [ ] Listar doenças
- [ ] Listar medicamentos
- [ ] Visualizar medicamentos vencendo

### Qualidade
- [ ] 80%+ tests coverage
- [ ] Zero críticos de segurança
- [ ] Sem console errors
- [ ] API documented

### Performance
- [ ] API <200ms response
- [ ] Dashboard <2s load
- [ ] Build <30s

### Documentação
- [ ] README de setup
- [ ] API docs (Swagger)
- [ ] Commit messages descritivos
- [ ] Docstrings em código

---

## Contatos e Escalação

### Bloqueadores Críticos
- **Tech Lead:** [Contato]
- **Backend Lead:** [Contato]
- **DevOps:** [Contato]

### Daily Standup
- **Hora:** 10:00 AM
- **Local:** Teams/Zoom
- **Duração:** 15min

---

**Documento preparado:** 22 de Maio de 2026  
**Sprint Duration:** 7 dias  
**Status:** 🟡 Pronto para kickoff
