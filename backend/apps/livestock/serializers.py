from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import AnimalBatch, Species, Breed
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
    farm_id = serializers.IntegerField(write_only=True, required=False)
    
    # Fields to return data
    species_code = serializers.CharField(source='species.code', read_only=True)
    breed_name = serializers.CharField(source='breed.name', read_only=True)
    
    class Meta:
        model = AnimalBatch
        list_serializer_class = AnimalBatchListSerializer
        fields = [
            'id', 'batch_code', 'name', 'category', 'gender', 
            'origin', 'purchase_value', 'avg_weight_kg', 
            'entry_date', 'status', 'species_code', 'breed_name',
            'species_code_input', 'breed_name_input', 'farm_id'
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
            return super().create(validated_data)
        except Exception as e:
            raise serializers.ValidationError(f'Erro ao criar lote: {str(e)}')
