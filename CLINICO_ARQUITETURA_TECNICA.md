# 🏗️ Arquitetura Técnica - Módulo Clínico/Veterinário

## Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React/Next.js)                 │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard │ Registros │ Diagnósticos │ Medicamentos │ Alertas  │
│  Vacinação │ Relatórios │ Ficha Animal │ Exportar                │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP/REST API
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND (Django REST Framework)                      │
├─────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐   │
│ │          API Endpoints (ViewSets)                         │   │
│ │  ClinicalRecordViewSet                                   │   │
│ │  DiseaseViewSet                                          │   │
│ │  SanitaryAlertViewSet                                    │   │
│ │  MedicationInventoryViewSet                              │   │
│ │  VeterinaryProviderViewSet                               │   │
│ └──────────────────────────────────────────────────────────┘   │
│                           ▲                                       │
│        ┌──────────────────┼──────────────────┐                  │
│        │                  │                  │                  │
│        ▼                  ▼                  ▼                  │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│ │   Services   │  │   Signals    │  │   Serializers│           │
│ │ (Business    │  │  (Auto       │  │              │           │
│ │  Logic)      │  │   Alerts)    │  │              │           │
│ └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │              AI/ML Integration Layer                      │   │
│ │  - Diagnosis prediction                                  │   │
│ │  - Outbreak detection                                    │   │
│ │  - Treatment optimization                                │   │
│ └──────────────────────────────────────────────────────────┘   │
│                           ▲                                       │
└─────────────────────┬─────┴───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
    ┌────────┐  ┌──────────┐  ┌──────────┐
    │ Models │  │ Database │  │ Cache    │
    │        │  │ (Django  │  │ (Redis)  │
    │        │  │  ORM)    │  │          │
    └────────┘  └──────────┘  └──────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL INTEGRATIONS                         │
├─────────────────────────────────────────────────────────────────┤
│  Inventory │ Livestock │ Reports │ Notifications │ IA Provider   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Estrutura de Pastas

```
backend/apps/livestock/
├── models.py
│   ├── Disease
│   ├── ClinicalRecord (renomear de HealthRecord)
│   ├── MedicationInventory
│   ├── Symptom
│   ├── SanitaryAlert
│   └── VeterinaryProvider
│
├── views.py
│   ├── ClinicalRecordViewSet
│   ├── DiseaseViewSet
│   ├── SanitaryAlertViewSet
│   ├── MedicationInventoryViewSet
│   └── VeterinaryProviderViewSet
│
├── serializers.py
│   ├── ClinicalRecordSerializer
│   ├── DiseaseSerializer
│   ├── MedicationInventorySerializer
│   └── SanitaryAlertSerializer
│
├── services/
│   ├── __init__.py
│   ├── clinical_analysis_service.py
│   ├── alert_service.py
│   ├── diagnosis_service.py
│   └── medication_service.py
│
├── signals.py
│   └── auto_generate_alerts()
│
├── filters.py
│   ├── ClinicalRecordFilter
│   ├── DiseaseFilter
│   └── AlertFilter
│
├── admin.py
│   └── Admin interfaces
│
├── migrations/
│   └── Data migrations + seed data
│
└── urls.py
    └── Route definitions

frontend/src/app/home/clinico/
├── page.tsx (Dashboard principal)
├── layout.tsx (Layout)
│
├── registros/
│   ├── page.tsx (Lista de registros)
│   ├── novo/page.tsx (Criar novo registro)
│   └── [id]/page.tsx (Detalhes do registro)
│
├── diagnosticos/
│   ├── page.tsx
│   ├── wizard/page.tsx (Wizard para diagnóstico)
│   └── [id]/page.tsx
│
├── medicamentos/
│   ├── page.tsx (Inventário)
│   ├── novo/page.tsx
│   └── [id]/page.tsx
│
├── alertas/
│   └── page.tsx (Alertas sanitários)
│
├── animal/
│   └── [id]/page.tsx (Ficha clínica do animal)
│
├── vacinacao/
│   └── page.tsx
│
└── components/
    ├── ClinicalDashboard.tsx
    ├── SymptomSelector.tsx
    ├── DiseaseSearchInput.tsx
    ├── AlertCard.tsx
    ├── MedicationForm.tsx
    ├── HealthTimeline.tsx
    ├── ClinicalHistoryTable.tsx
    ├── ClinicalRecordForm.tsx
    ├── DiagnosisWizard.tsx
    └── MedicationInventoryTable.tsx

frontend/src/services/
├── clinicalService.ts (API calls)
├── diseaseService.ts
├── alertService.ts
└── medicationService.ts
```

---

## Modelos de Dados

### 1. Disease (Doença)
```python
class Disease(BaseModel):
    name = CharField(max_length=100, unique=True)
    code = CharField(max_length=20, unique=True)  # ICD-Animal
    species = ForeignKey(Species, on_delete=CASCADE, related_name='diseases')
    description = TextField()
    
    # Manifestação clínica
    symptoms = JSONField(default=list)  # ["febre", "apatia", "diareia"]
    severity_levels = JSONField(default=dict)  # {symptom: severity}
    
    # Tratamento
    recommended_treatment = TextField()
    typical_duration_days = IntegerField(null=True)
    
    # Epidemiologia
    incubation_period_days = IntegerField(null=True)
    transmission_route = CharField(choices=[
        ("direct", "Contato direto"),
        ("indirect", "Contato indireto"),
        ("respiratory", "Via respiratória"),
        ("alimentar", "Via alimentar"),
        ("unknown", "Desconhecida"),
    ])
    
    # Políticas
    is_infectious = BooleanField(default=False)
    is_reportable = BooleanField(default=False)  # Notificação obrigatória
    prevention_measures = TextField()
    
    # Metadata
    mortality_rate = FloatField(null=True, help_text="Taxa média de mortalidade (%)")
    recovery_rate = FloatField(null=True)
    
    class Meta:
        ordering = ['species', 'name']
        verbose_name_plural = "Diseases"
```

### 2. ClinicalRecord (Registro Clínico)
```python
class ClinicalRecord(BaseModel):
    # Identificação
    farm = ForeignKey(Farm, on_delete=CASCADE, related_name='clinical_records')
    animal = ForeignKey(Animal, on_delete=CASCADE, related_name='clinical_records')
    batch = ForeignKey(AnimalBatch, on_delete=SET_NULL, null=True, blank=True)
    
    # Tipos de registro
    RECORD_TYPES = [
        ('consultation', 'Consulta'),
        ('diagnosis', 'Diagnóstico'),
        ('treatment', 'Tratamento'),
        ('follow_up', 'Acompanhamento'),
        ('recovery', 'Recuperação'),
    ]
    record_type = CharField(max_length=20, choices=RECORD_TYPES)
    
    # Timeline
    record_date = DateField()
    record_time = TimeField(null=True, blank=True)
    
    # Quadro Clínico
    symptoms_observed = JSONField(default=list)  # ["febre", "apatia"]
    clinical_notes = TextField()
    body_temperature = DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    
    # Diagnóstico
    disease = ForeignKey(Disease, on_delete=SET_NULL, null=True, blank=True, 
                        related_name='clinical_records')
    severity = CharField(max_length=20, choices=[
        ('mild', 'Leve'),
        ('moderate', 'Moderado'),
        ('severe', 'Grave'),
        ('critical', 'Crítico'),
    ], default='moderate')
    
    # Prescrição de Medicamentos
    prescribed_medications = JSONField(default=list)
    # Estrutura:
    # [
    #   {
    #     "medication_id": 123,
    #     "dosage": "500mg",
    #     "frequency": "2x ao dia",
    #     "duration_days": 7,
    #     "route": "oral",  # oral, IM, IV, tópico
    #     "notes": ""
    #   }
    # ]
    
    # Evolução
    followup_date = DateField(null=True, blank=True)
    improvement_status = CharField(max_length=20, choices=[
        ('no_improvement', 'Sem melhora'),
        ('stable', 'Estável'),
        ('improving', 'Melhorando'),
        ('recovered', 'Curado'),
    ], null=True, blank=True)
    
    outcome = CharField(max_length=20, choices=[
        ('cured', 'Curado'),
        ('death', 'Morte'),
        ('chronic', 'Crônico'),
        ('unknown', 'Desconhecido'),
        ('pending', 'Pendente'),
    ], default='pending')
    outcome_date = DateField(null=True, blank=True)
    
    # Custos
    treatment_cost = DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    
    # Profissional
    veterinarian = CharField(max_length=100, blank=True)
    veterinary_provider = ForeignKey(VeterinaryProvider, on_delete=SET_NULL, 
                                     null=True, blank=True)
    
    # Auditoria
    notes = TextField(blank=True)
    is_critical = BooleanField(default=False)
    alert_generated = BooleanField(default=False)
    
    class Meta:
        ordering = ['-record_date', '-record_time']
        indexes = [
            models.Index(fields=['farm', 'record_date']),
            models.Index(fields=['animal', 'record_date']),
            models.Index(fields=['disease', 'record_date']),
        ]
```

### 3. MedicationInventory
```python
class MedicationInventory(BaseModel):
    farm = ForeignKey(Farm, on_delete=CASCADE)
    
    # Informações do medicamento
    medication_name = CharField(max_length=150)
    active_ingredient = CharField(max_length=150, blank=True)
    dosage = CharField(max_length=50)  # "500mg"
    concentration = CharField(max_length=50, blank=True)  # "10mg/ml"
    unit = CharField(max_length=20, choices=[
        ('mg', 'Miligrama'),
        ('ml', 'Mililitro'),
        ('g', 'Grama'),
        ('unit', 'Unidade'),
        ('dose', 'Dose'),
    ])
    
    # Lote e validade
    batch_number = CharField(max_length=50)
    manufacturing_date = DateField(null=True, blank=True)
    expiry_date = DateField()
    
    # Quantidade e reorder
    quantity_available = DecimalField(max_digits=10, decimal_places=3)
    quantity_unit = CharField(max_length=20, default='unidade')
    reorder_level = DecimalField(max_digits=10, decimal_places=3)
    
    # Financeiro
    unit_cost = DecimalField(max_digits=10, decimal_places=2)
    supplier = CharField(max_length=100)
    
    # Uso
    species_indicated = ManyToManyField(Species)
    therapeutic_class = CharField(max_length=100, blank=True)
    approved_for = JSONField(default=list)  # ["disease_id_1", "disease_id_2"]
    
    # Metadata
    storage_conditions = CharField(max_length=200, blank=True)
    notes = TextField(blank=True)
    is_available = BooleanField(default=True)
    
    class Meta:
        unique_together = [['farm', 'medication_name', 'batch_number']]
        ordering = ['-expiry_date']
```

### 4. SanitaryAlert
```python
class SanitaryAlert(BaseModel):
    farm = ForeignKey(Farm, on_delete=CASCADE)
    
    ALERT_TYPES = [
        ('disease_outbreak', 'Surto de Doença'),
        ('medication_expired', 'Medicamento Vencido'),
        ('vaccine_expired', 'Vacina Vencida'),
        ('high_mortality', 'Mortalidade Elevada'),
        ('high_density', 'Densidade Alta'),
        ('low_vaccination_coverage', 'Cobertura Vacinal Baixa'),
        ('medication_low_stock', 'Medicamento em Falta'),
        ('other', 'Outro'),
    ]
    alert_type = CharField(max_length=30, choices=ALERT_TYPES)
    
    SEVERITY_LEVELS = [
        ('low', 'Baixa'),
        ('medium', 'Média'),
        ('high', 'Alta'),
        ('critical', 'Crítica'),
    ]
    severity = CharField(max_length=20, choices=SEVERITY_LEVELS)
    
    # Conteúdo
    title = CharField(max_length=200)
    description = TextField()
    recommended_actions = TextField()
    
    # Escopo
    affected_animals = ManyToManyField(Animal, blank=True)
    affected_batches = ManyToManyField(AnimalBatch, blank=True)
    disease = ForeignKey(Disease, on_delete=SET_NULL, null=True, blank=True)
    
    # Status
    STATUS_CHOICES = [
        ('active', 'Ativo'),
        ('acknowledged', 'Reconhecido'),
        ('resolved', 'Resolvido'),
        ('archived', 'Arquivado'),
    ]
    status = CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    
    # Timeline
    created_date = DateField(auto_now_add=True)
    acknowledged_date = DateField(null=True, blank=True)
    resolved_date = DateField(null=True, blank=True)
    
    # Auditoria
    generated_by = CharField(max_length=50)  # "system", "user", "ai"
    notes = TextField(blank=True)
    
    class Meta:
        ordering = ['-created_date']
        indexes = [
            models.Index(fields=['farm', 'status', '-created_date']),
            models.Index(fields=['severity', 'status']),
        ]
```

### 5. Symptom
```python
class Symptom(BaseModel):
    name = CharField(max_length=100, unique=True)
    code = CharField(max_length=20, unique=True)
    description = TextField(blank=True)
    species = ManyToManyField(Species)
    
    URGENCY_LEVELS = [
        ('low', 'Baixa'),
        ('medium', 'Média'),
        ('high', 'Alta'),
        ('critical', 'Crítica'),
    ]
    urgency_level = CharField(max_length=20, choices=URGENCY_LEVELS, default='medium')
    
    typical_diseases = ManyToManyField(Disease, blank=True)
    
    class Meta:
        ordering = ['name']
```

### 6. VeterinaryProvider
```python
class VeterinaryProvider(BaseModel):
    farm = ForeignKey(Farm, on_delete=CASCADE, related_name='veterinary_providers')
    
    name = CharField(max_length=150)
    license_number = CharField(max_length=50, unique=True)
    specialties = JSONField(default=list)  # ["cirurgia", "reprodução", "clinica"]
    
    # Contato
    phone = CharField(max_length=20)
    email = EmailField()
    address = TextField(blank=True)
    
    # Relacionamento
    is_main_veterinarian = BooleanField(default=False)
    is_active = BooleanField(default=True)
    available_services = JSONField(default=list)  # ["consulta", "cirurgia", "exame"]
    
    notes = TextField(blank=True)
```

---

## APIs e Endpoints

### ClinicalRecordViewSet

```
GET    /api/clinical/records/
POST   /api/clinical/records/

GET    /api/clinical/records/{id}/
PUT    /api/clinical/records/{id}/
PATCH  /api/clinical/records/{id}/
DELETE /api/clinical/records/{id}/

# Custom actions
GET    /api/clinical/records/{id}/history/
POST   /api/clinical/records/{id}/add-followup/
GET    /api/clinical/records/by-animal/{animal_id}/
GET    /api/clinical/records/by-disease/{disease_id}/
GET    /api/clinical/records/statistics/
```

### DiseaseViewSet

```
GET    /api/diseases/
GET    /api/diseases/{id}/

# Custom actions
GET    /api/diseases/by-species/{species_id}/
GET    /api/diseases/search/?q=febre
GET    /api/diseases/{id}/symptoms/
GET    /api/diseases/{id}/treatment/
GET    /api/diseases/{id}/statistics/
```

### SanitaryAlertViewSet

```
GET    /api/alerts/
GET    /api/alerts/{id}/

# Custom actions
GET    /api/alerts/active/
POST   /api/alerts/{id}/acknowledge/
POST   /api/alerts/{id}/resolve/
GET    /api/alerts/by-farm/{farm_id}/
GET    /api/alerts/statistics/
```

### MedicationInventoryViewSet

```
GET    /api/medications/
POST   /api/medications/

GET    /api/medications/{id}/
PUT    /api/medications/{id}/
DELETE /api/medications/{id}/

# Custom actions
POST   /api/medications/{id}/consume/
GET    /api/medications/expiring-soon/
GET    /api/medications/low-stock/
GET    /api/medications/by-species/{species_id}/
```

---

## Services (Business Logic)

### clinical_analysis_service.py

```python
class ClinicalAnalysisService:
    
    @staticmethod
    def detect_disease_outbreak(farm_id, disease_id=None, days=30):
        """Detecta surto de doença em farm"""
        # Retorna: {is_outbreak: bool, confidence: float, affected_count: int}
        
    @staticmethod
    def calculate_mortality_rate(batch_id, period_days=30):
        """Calcula taxa de mortalidade"""
        # Retorna: {rate: float, deaths: int, total: int}
        
    @staticmethod
    def get_treatment_effectiveness(disease_id, medication_id=None):
        """Analisa efetividade de tratamentos"""
        # Retorna: {cure_rate: float, recovery_time_avg: int, success_cases: int}
        
    @staticmethod
    def analyze_symptoms_pattern(farm_id, days=30):
        """Encontra padrões de sintomas"""
        # Retorna: {patterns: [list], diseases_probable: [list]}
        
    @staticmethod
    def generate_sanitary_alerts(farm_id):
        """Gera alertas automaticamente"""
        # Cria SanitaryAlert based em dados atuais
```

---

## Signals (Auto-Triggers)

```python
# models.py signals

@receiver(post_save, sender=ClinicalRecord)
def auto_generate_alerts_on_clinical_record(sender, instance, created, **kwargs):
    """Gera alertas ao registrar clínica"""
    if created and instance.is_critical:
        SanitaryAlert.objects.create(
            farm=instance.farm,
            alert_type='disease_outbreak',
            severity='critical',
            title=f"Caso crítico: {instance.disease.name}",
            description=instance.clinical_notes,
            disease=instance.disease,
            affected_animals=instance.animal,
            generated_by='system'
        )
        send_notification(instance.farm, instance)

@receiver(post_save, sender=MedicationInventory)
def alert_expiring_medication(sender, instance, **kwargs):
    """Alerta medicamentos vencendo"""
    days_to_expiry = (instance.expiry_date - date.today()).days
    if days_to_expiry < 30 and days_to_expiry >= 0:
        SanitaryAlert.objects.get_or_create(
            farm=instance.farm,
            alert_type='medication_expired',
            defaults={
                'severity': 'high' if days_to_expiry < 7 else 'medium',
                'title': f"Medicamento vencendo: {instance.medication_name}",
                ...
            }
        )
```

---

## Filtros

```python
class ClinicalRecordFilter(FilterSet):
    farm = CharFilter(field_name='farm__id')
    animal = CharFilter(field_name='animal__identifier')
    disease = CharFilter(field_name='disease__id')
    severity = ChoiceFilter(choices=ClinicalRecord.SEVERITY_CHOICES)
    record_type = ChoiceFilter(choices=ClinicalRecord.RECORD_TYPES)
    date_from = DateFilter(field_name='record_date', lookup_expr='gte')
    date_to = DateFilter(field_name='record_date', lookup_expr='lte')
    
    class Meta:
        model = ClinicalRecord
        fields = ['farm', 'animal', 'disease', 'severity', 'record_type']
```

---

## Frontend Components

### ClinicalRecordForm.tsx

```typescript
interface ClinicalRecordFormProps {
  animalId: string;
  onSubmit: (data: ClinicalRecordData) => void;
  isLoading?: boolean;
}

// Campos:
// - animal (select/readonly)
// - record_type (select)
// - record_date (date)
// - symptoms_observed (multi-select)
// - disease (autocomplete com sugestões)
// - severity (radio buttons)
// - clinical_notes (textarea)
// - temperature (number)
// - prescribed_medications (dynamic table)
// - followup_date (date)
// - veterinarian (text)
```

### DiseaseSearchInput.tsx

```typescript
interface DiseaseSearchInputProps {
  species: string;
  value: string;
  onChange: (disease: Disease) => void;
  suggestions?: Disease[];
}

// Features:
// - Autocomplete com lista de doenças
// - Filtro por espécie
// - Mostra sintomas ao hover
// - Mostra tratamento recomendado
```

### SymptomSelector.tsx

```typescript
interface SymptomSelectorProps {
  species: string;
  value: string[];
  onChange: (symptoms: string[]) => void;
}

// Features:
// - Checkboxes com ícones
// - Agrupado por categoria
// - Sugestão de doenças baseado em sintomas selecionados
```

### AlertCard.tsx

```typescript
interface AlertCardProps {
  alert: SanitaryAlert;
  onResolve?: () => void;
  onAcknowledge?: () => void;
}

// Features:
// - Cor baseada em severidade
// - Ícone por tipo de alerta
// - Ações rápidas
// - Badge de status
```

---

## Integração com Outros Módulos

### Integração com Reproduction (Reprodução)

```
ClinicalRecord (pregnant animal) → Alert for prenatal care
Birth event → Auto-create postnatal followup
Mating → Track reproductive health
```

### Integração com Inventory (Estoque)

```
MedicationInventory → Consume on prescription
InventoryMovement → Log medication usage
Cost tracking → Link to farm financials
```

### Integração com Livestock (Rebanho)

```
Animal → Central repository
WeightRecord → Health status tracking
VaccinationRecord → Immunity tracking
```

---

## Considerações de Performance

### Database Indexing

```python
# Índices críticos em models.py
class ClinicalRecord(BaseModel):
    class Meta:
        indexes = [
            models.Index(fields=['farm', '-record_date']),
            models.Index(fields=['animal', '-record_date']),
            models.Index(fields=['disease', 'record_date']),
            models.Index(fields=['severity', 'status']),
        ]
```

### Caching Strategy

```python
# Redis caching
- Disease list: 24h
- Symptom list: 24h
- Animal clinical history: 1h (invalidate on update)
- Dashboard KPIs: 15min
- Alert counts: 5min
```

### Query Optimization

```python
# Use select_related/prefetch_related
ClinicalRecord.objects.select_related(
    'farm', 'animal', 'disease', 'veterinary_provider'
).prefetch_related(
    'affected_animals', 'affected_batches'
)
```

---

## Segurança e Conformidade

### Data Sensitivity

- ✅ Encrypt sensitive health records at rest
- ✅ Audit all access to clinical data
- ✅ Role-based access control (veterinarian, farm owner, system admin)
- ✅ Compliance with data protection regulations

### Audit Trail

```python
# Track all clinical changes
class AuditLog(BaseModel):
    record = ForeignKey(ClinicalRecord)
    action = CharField(choices=['create', 'update', 'delete'])
    user = ForeignKey(User)
    timestamp = DateTimeField(auto_now_add=True)
    changes = JSONField()
```

---

**Documento de Arquitetura v1.0**  
**Data:** 22 de Maio de 2026
