from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from .models import AnimalBatch, Species, Breed, Animal, Mating, Pregnancy, Birth, Litter, Incubation, VaccinationRecord, WeightRecord, Symptom, Disease, ClinicalRecord, MedicationInventory, SanitaryAlert, HealthRecord, HistoricoEvento
from collections import Counter

# Mapeamento automático de categoria de lote → fase produtiva
CATEGORY_TO_PHASE = {
    'Leitão': 'creche',
    'Crescimento': 'crescimento',
    'Terminação': 'engorda',
    'Engorda': 'engorda',
}

class AnimalBatchListSerializer(serializers.ListSerializer):
    """Custom ListSerializer to detect duplicates within the bulk request."""
    
    def validate(self, data):
        """
        Validate the list of batches for duplicates within the request
        and check against existing database records.
        """
        # Track batch_code + farm_id combinations to detect duplicates in the request
        batch_combinations = []
        
        for item in data:
            batch_code = item.get('batch_code')
            farm_id = item.get('farm_id')
            
            if batch_code and farm_id:
                combination = (farm_id, batch_code)
                batch_combinations.append(combination)
                
                # Check if batch_code already exists for this farm in database
                existing = AnimalBatch.objects.filter(
                    farm_id=farm_id,
                    batch_code=batch_code
                ).exists()
                
                if existing:
                    raise serializers.ValidationError(
                        f"Batch code '{batch_code}' already exists for farm {farm_id}."
                    )
        
        # Check for duplicates within the request itself
        duplicates = [item for item, count in Counter(batch_combinations).items() if count > 1]
        if duplicates:
            dup_strs = [f"farm_id={farm_id}, batch_code='{code}'" for farm_id, code in duplicates]
            raise serializers.ValidationError(
                f"Duplicate batch codes detected in request: {', '.join(dup_strs)}"
            )
        
        return data

class AnimalBatchSerializer(serializers.ModelSerializer):
    # Field to receive data
    species_code_input = serializers.CharField(write_only=True, required=False)
    breed_name_input = serializers.CharField(write_only=True, required=False, allow_blank=True)
    farm_id = serializers.UUIDField(write_only=True, required=False)
    source_batch_ids = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False
    )
    
    # Fields to return data
    species_code = serializers.CharField(source='species.code', read_only=True)
    breed_name = serializers.CharField(source='breed.name', read_only=True)
    
    class Meta:
        model = AnimalBatch
        list_serializer_class = AnimalBatchListSerializer
        fields = [
            'id', 'batch_code', 'name', 'category', 'phase',
            'gender', 'origin', 'purchase_value', 'avg_weight_kg', 
            'entry_date', 'status', 'species_code', 'breed_name',
            'species_code_input', 'breed_name_input', 'farm_id', 'quantity', 'mother',
            'notes', 'source_batch_ids'
        ]

    def validate_batch_code(self, value):
        """Validate that batch_code is not empty."""
        if not value or not value.strip():
            raise serializers.ValidationError("Batch code é obrigatório e não pode estar vazio.")
        return value.strip()

    def validate(self, data):
        """Validação de fase produtiva para lotes comprados."""
        origin = data.get('origin')
        phase = data.get('phase')

        if origin == AnimalBatch.Origin.PURCHASED and not phase:
            category = data.get('category', '')
            repro_categories = ['Matriz', 'Marrã', 'Vaca', 'Novilha', 'Touro', 'Cachaço', 'Reprodutor', 'Poedeira']
            if category not in repro_categories:
                raise serializers.ValidationError(
                    {'phase': 'Fase produtiva é obrigatória para lotes comprados não-reprodutivos.'}
                )

        return data

    def validate_entry_date(self, value):
        """Validate entry_date format."""
        if not value:
            raise serializers.ValidationError("Data de entrada é obrigatória.")
        return value
    
    def validate_purchase_value(self, value):
        """Convert purchase_value to Decimal if string."""
        if value is None:
            return None
        if isinstance(value, str):
            try:
                from decimal import Decimal
                return Decimal(value)
            except:
                raise serializers.ValidationError("Valor de compra deve ser um número válido.")
        return value
    
    def validate_avg_weight_kg(self, value):
        """Convert avg_weight_kg to Decimal if string."""
        if value is None:
            return None
        if isinstance(value, str):
            try:
                from decimal import Decimal
                return Decimal(value)
            except:
                raise serializers.ValidationError("Peso médio deve ser um número válido.")
        return value

    def create(self, validated_data):
        species_code = validated_data.pop('species_code_input', None)
        breed_name = validated_data.pop('breed_name_input', None)
        farm_id = validated_data.pop('farm_id', None)
        
        # Ensure batch_code exists
        batch_code = validated_data.get('batch_code')
        if not batch_code:
            raise serializers.ValidationError({'batch_code': 'Batch code é obrigatório.'})
        
        # Ensure entry_date exists
        entry_date = validated_data.get('entry_date')
        if not entry_date:
            raise serializers.ValidationError({'entry_date': 'Data de entrada é obrigatória.'})
        
        if not species_code:
            species_code = 'bovinos'

        # Get or create species
        try:
            species, _ = Species.objects.get_or_create(
                code=species_code,
                defaults={'name': species_code.capitalize()}
            )
        except Exception as e:
            raise serializers.ValidationError({'species_code_input': f'Erro ao processar espécie: {str(e)}'})
        
        # Get or create breed if provided
        breed = None
        if breed_name:
            try:
                breed, _ = Breed.objects.get_or_create(
                    species=species,
                    name=breed_name
                )
            except Exception as e:
                raise serializers.ValidationError({'breed_name_input': f'Erro ao processar raça: {str(e)}'})
            
        validated_data['species'] = species
        validated_data['breed'] = breed
        
        # Farm selection logic based on request user
        from apps.farms.models import Farm
        
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        organization = getattr(user, 'organization', None) if user else None
        
        if farm_id:
            try:
                farm = Farm.objects.get(id=farm_id)
                # Verify farm belongs to organization
                if organization and farm.organization != organization:
                    raise serializers.ValidationError({'farm_id': 'Esta fazenda não pertence à sua organização.'})
            except Farm.DoesNotExist:
                raise serializers.ValidationError({'farm_id': f'Fazenda com id {farm_id} não encontrada.'})
        else:
            # Get first farm of organization
            if organization:
                farm = Farm.objects.filter(organization=organization).first()
                if not farm:
                    # Create default farm for organization if none exists
                    farm = Farm.objects.create(name="Fazenda Principal", organization=organization)
            else:
                farm = Farm.objects.first()
                if not farm:
                    try:
                        from apps.organizations.models import Organization
                        org, _ = Organization.objects.get_or_create(name="Default Org")
                        farm, _ = Farm.objects.get_or_create(name="Default Farm", organization=org)
                    except Exception as e:
                        raise serializers.ValidationError({'farm_id': f'Erro ao obter farm: {str(e)}'})
            
        validated_data['farm'] = farm
        
        source_batch_ids = validated_data.pop('source_batch_ids', [])
        
        try:
            with transaction.atomic():
                # ── Fase 2: Mapeamento automático categoria → fase produtiva ──────────
                # Se o payload não traz phase explicitamente, derivar da categoria
                if not validated_data.get('phase') and validated_data.get('category'):
                    auto_phase = CATEGORY_TO_PHASE.get(validated_data['category'])
                    if auto_phase:
                        validated_data['phase'] = auto_phase
                # ─────────────────────────────────────────────────────────────────────

                batch = super().create(validated_data)
                if source_batch_ids:
                    batch.source_batches.set(source_batch_ids)

                # ── Registrar BatchPhaseHistory da fase inicial ──
                if batch.phase:
                    from .models import BatchPhaseHistory
                    BatchPhaseHistory.objects.create(
                        batch=batch,
                        phase=batch.phase,
                        quantity=batch.quantity,
                        avg_weight_kg=batch.avg_weight_kg,
                        entry_date=batch.entry_date,
                    )

                # ── Fase 2: Registrar HistoricoEvento de entrada na fase produtiva ──
                if batch.phase:
                    origin_label = dict(AnimalBatch.Origin.choices).get(batch.origin, batch.origin)
                    phase_labels = {
                        'creche': 'Creche',
                        'crescimento': 'Crescimento',
                        'engorda': 'Engorda',
                        'gestacao': 'Gestação',
                        'maternidade': 'Maternidade',
                    }
                    phase_label = phase_labels.get(batch.phase, batch.phase.capitalize())
                    HistoricoEvento.objects.create(
                        farm=batch.farm,
                        tipo_evento='Entrada de Lote',
                        descricao=(
                            f"Lote {batch.batch_code} cadastrado (origem: {origin_label}) "
                            f"na fase {phase_label}."
                        ),
                        data_evento=batch.entry_date,
                        lote=batch,
                        metadata={
                            'fase': batch.phase,
                            'categoria': batch.category,
                            'quantidade': batch.quantity,
                            'origem': batch.origin,
                        }
                    )
                # ─────────────────────────────────────────────────────────────────────

            # If it's a reproductive category, create individual animals for tracking
            repro_categories = ['Matriz', 'Marrã', 'Vaca', 'Novilha', 'Touro', 'Cachaço', 'Reprodutor']
            if batch.category in repro_categories:
                # We already have Animal imported at the top
                for i in range(batch.quantity or 1):
                    # Use batch_code as base for identifier
                    identifier = batch.batch_code
                    if (batch.quantity or 1) > 1:
                        identifier = f"{batch.batch_code}-{i+1}"
                    
                    # Create or update individual animal
                    Animal.objects.get_or_create(
                        farm=batch.farm,
                        identifier=identifier,
                        defaults={
                            'species': batch.species,
                            'breed': batch.breed,
                            'batch': batch,
                            'gender': batch.gender if batch.gender in ['M', 'F'] else ('F' if batch.category in ['Matriz', 'Marrã', 'Vaca', 'Novilha'] else 'M'),
                            'category': batch.category,
                            'entry_date': batch.entry_date,
                            'initial_weight_kg': batch.avg_weight_kg,
                            'current_weight_kg': batch.avg_weight_kg,
                        }
                    )
            return batch
        except Exception as e:
            raise serializers.ValidationError(f'Erro ao criar lote: {str(e)}')

    def update(self, instance, validated_data):
        old_phase = instance.phase
        new_phase = validated_data.get('phase', old_phase)
        
        # Se a fase mudou, criamos o registro de historico da fase antiga
        if old_phase and new_phase != old_phase:
            from django.utils import timezone
            from .models import BatchPhaseHistory
            exit_date = validated_data.get('entry_date') or timezone.now().date()
            BatchPhaseHistory.objects.create(
                batch=instance,
                phase=old_phase,
                quantity=instance.quantity,
                avg_weight_kg=instance.avg_weight_kg,
                entry_date=instance.entry_date,
                exit_date=exit_date
            )
            
        return super().update(instance, validated_data)


class AnimalSerializer(serializers.ModelSerializer):
    # Field to receive data
    species_code_input = serializers.CharField(write_only=True, required=False)
    breed_name_input = serializers.CharField(write_only=True, required=False, allow_blank=True)
    farm_id = serializers.UUIDField(write_only=True, required=False)

    # Fields to return data
    species_name = serializers.CharField(source='species.name', read_only=True)
    species_code = serializers.CharField(source='species.code', read_only=True)
    breed_name = serializers.CharField(source='breed.name', read_only=True)
    batch_code = serializers.CharField(source='batch.batch_code', read_only=True)

    # Filiação — leitura
    sire_identifier = serializers.CharField(source='sire_ref.identifier', read_only=True, default=None)
    dam_identifier = serializers.CharField(source='dam_ref.identifier', read_only=True, default=None)

    class Meta:
        model = Animal
        fields = [
            'id', 'farm', 'species', 'species_name', 'species_code', 'breed', 'breed_name',
            'batch', 'batch_code', 'identifier', 'birth_date', 'entry_date',
            'gender', 'category', 'status', 'reproductive_status',
            'initial_weight_kg', 'current_weight_kg', 'notes',
            # Controle reprodutivo
            'birth_count', 'previous_phase',
            # Filiação
            'sire_ref', 'dam_ref', 'sire_name', 'dam_name',
            'sire_identifier', 'dam_identifier',
            'species_code_input', 'breed_name_input', 'farm_id'
        ]
        read_only_fields = ['farm', 'species', 'birth_count', 'previous_phase']

    def create(self, validated_data):
        species_code = validated_data.pop('species_code_input', None)
        breed_name = validated_data.pop('breed_name_input', None)
        farm_id = validated_data.pop('farm_id', None)
        
        if not species_code:
            species_code = 'suinos' # Default for reproduction context if not provided

        # Get or create species
        try:
            species, _ = Species.objects.get_or_create(
                code=species_code,
                defaults={'name': species_code.capitalize()}
            )
        except Exception as e:
            raise serializers.ValidationError({'species_code_input': f'Erro ao processar espécie: {str(e)}'})
        
        # Get or create breed if provided
        breed = None
        if breed_name:
            try:
                breed, _ = Breed.objects.get_or_create(
                    species=species,
                    name=breed_name
                )
            except Exception as e:
                raise serializers.ValidationError({'breed_name_input': f'Erro ao processar raça: {str(e)}'})
            
        validated_data['species'] = species
        validated_data['breed'] = breed

        # Status inicial padrão para Marrãs de suínos
        if species.code == 'suinos' and validated_data.get('category') == 'Marrã' and not validated_data.get('reproductive_status'):
            validated_data['reproductive_status'] = 'aguardando_cobertura'
        
        # Farm selection logic based on request user
        from apps.farms.models import Farm
        
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        organization = getattr(user, 'organization', None) if user else None
        
        if farm_id:
            try:
                farm = Farm.objects.get(id=farm_id)
                if organization and farm.organization != organization:
                    raise serializers.ValidationError({'farm_id': 'Esta fazenda não pertence à sua organização.'})
            except Farm.DoesNotExist:
                raise serializers.ValidationError({'farm_id': f'Fazenda com id {farm_id} não encontrada.'})
        else:
            if organization:
                farm = Farm.objects.filter(organization=organization).first()
                if not farm:
                    farm = Farm.objects.create(name="Fazenda Principal", organization=organization)
            else:
                farm = Farm.objects.first()
                if not farm:
                    try:
                        from apps.organizations.models import Organization
                        org, _ = Organization.objects.get_or_create(name="Default Org")
                        farm, _ = Farm.objects.get_or_create(name="Default Farm", organization=org)
                    except Exception as e:
                        raise serializers.ValidationError({'farm_id': f'Erro ao obter farm: {str(e)}'})
            
        validated_data['farm'] = farm
        
        return super().create(validated_data)


class MatingSerializer(serializers.ModelSerializer):
    female_identifier = serializers.CharField(source='female.identifier', read_only=True)
    sire_identifier = serializers.CharField(source='sire.identifier', read_only=True)

    class Meta:
        model = Mating
        fields = [
            'id', 'female', 'female_identifier', 'sire', 'sire_identifier',
            'sire_info', 'mating_date', 'mating_type', 'status',
            'expected_birth_date', 'notes'
        ]
        read_only_fields = ['female']


class PregnancySerializer(serializers.ModelSerializer):
    female_identifier = serializers.CharField(source='female.identifier', read_only=True)

    class Meta:
        model = Pregnancy
        fields = [
            'id', 'mating', 'female', 'female_identifier', 'start_date',
            'expected_birth_date', 'status', 'notes'
        ]


class BirthSerializer(serializers.ModelSerializer):
    female_identifier = serializers.CharField(source='female.identifier', read_only=True)
    total_born = serializers.IntegerField(read_only=True)

    class Meta:
        model = Birth
        fields = [
            'id', 'pregnancy', 'female', 'female_identifier', 'birth_date',
            'birth_time_start', 'birth_time_end', 'birth_order',
            'live_born', 'stillborn', 'mummified', 'total_born', 'avg_weight_kg', 'notes', 'batch'
        ]


class LitterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Litter
        fields = [
            'id', 'birth', 'weaning_date', 'weaned_quantity',
            'avg_weaning_weight_kg', 'notes'
        ]


class IncubationSerializer(serializers.ModelSerializer):
    batch_code = serializers.CharField(source='batch.batch_code', read_only=True)

    class Meta:
        model = Incubation
        fields = [
            'id', 'farm', 'batch', 'batch_code', 'start_date', 'expected_hatch_date',
            'eggs_incubated', 'eggs_hatched', 'status', 'notes'
        ]


class VaccinationRecordSerializer(serializers.ModelSerializer):
    vaccine_item_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    vaccine_item_name = serializers.CharField(source='vaccine_item.nome', read_only=True, default=None)

    class Meta:
        model = VaccinationRecord
        fields = '__all__'
        extra_kwargs = {
            'vaccine_item': {'read_only': True},
        }

    def validate_vaccine_item_id(self, value):
        if value is None:
            return value
        from apps.inventory.models import ItemEstoque
        try:
            item = ItemEstoque.objects.get(id=value, categoria='vacina')
        except ItemEstoque.DoesNotExist:
            raise serializers.ValidationError("Vacina não encontrada no estoque.")
        return value

    def create(self, validated_data):
        vaccine_item_id = validated_data.pop('vaccine_item_id', None)
        if vaccine_item_id:
            from apps.inventory.models import ItemEstoque
            try:
                item = ItemEstoque.objects.get(id=vaccine_item_id)
                validated_data['vaccine_item'] = item
                if not validated_data.get('vaccine_name'):
                    validated_data['vaccine_name'] = item.nome
            except ItemEstoque.DoesNotExist:
                pass
        return super().create(validated_data)


class WeightRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeightRecord
        fields = '__all__'


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
            'id', 'farm', 'medication_name', 'dosage',
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


class HealthRecordSerializer(serializers.ModelSerializer):
    animal_identifier = serializers.CharField(
        source='animal.identifier',
        read_only=True
    )
    treatment_type_display = serializers.CharField(
        source='get_treatment_type_display',
        read_only=True
    )
    
    class Meta:
        model = HealthRecord
        fields = [
            'id', 'farm', 'animal', 'animal_identifier',
            'treatment_type', 'treatment_type_display',
            'description', 'application_date',
            'veterinary', 'cost', 'notes'
        ]
