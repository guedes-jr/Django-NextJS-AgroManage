from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import AnimalBatch, Species, Breed, Animal, Mating, Pregnancy, Birth, Litter, Incubation, VaccinationRecord, WeightRecord
from collections import Counter

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
            'species_code_input', 'breed_name_input', 'farm_id', 'quantity', 'mother'
        ]

    def validate_batch_code(self, value):
        """Validate that batch_code is not empty."""
        if not value or not value.strip():
            raise serializers.ValidationError("Batch code é obrigatório e não pode estar vazio.")
        return value.strip()

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
        
        try:
            batch = super().create(validated_data)
            
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
    class Meta:
        model = VaccinationRecord
        fields = '__all__'


class WeightRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeightRecord
        fields = '__all__'

