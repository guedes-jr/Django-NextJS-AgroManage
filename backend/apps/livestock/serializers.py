from rest_framework import serializers
from .models import AnimalBatch, Species, Breed

class AnimalBatchSerializer(serializers.ModelSerializer):
    # Field to receive data
    species_code_input = serializers.CharField(write_only=True, required=False)
    breed_name_input = serializers.CharField(write_only=True, required=False, allow_blank=True)
    
    # Fields to return data
    species_code = serializers.CharField(source='species.code', read_only=True)
    breed_name = serializers.CharField(source='breed.name', read_only=True)
    
    class Meta:
        model = AnimalBatch
        fields = [
            'id', 'batch_code', 'name', 'category', 'gender', 
            'origin', 'purchase_value', 'avg_weight_kg', 
            'entry_date', 'status', 'species_code', 'breed_name',
            'species_code_input', 'breed_name_input'
        ]

    def create(self, validated_data):
        species_code = validated_data.pop('species_code_input', None)
        breed_name = validated_data.pop('breed_name_input', None)
        
        if not species_code:
            # Fallback if not provided (should be required in logic)
            species_code = 'bovinos'

        # Get or create species
        species, _ = Species.objects.get_or_create(
            code=species_code,
            defaults={'name': species_code.capitalize()}
        )
        
        # Get or create breed if provided
        breed = None
        if breed_name:
            breed, _ = Breed.objects.get_or_create(
                species=species,
                name=breed_name
            )
            
        validated_data['species'] = species
        validated_data['breed'] = breed
        
        # Farm selection logic
        from apps.farms.models import Farm
        farm = Farm.objects.first()
        if not farm:
            from apps.organizations.models import Organization
            org, _ = Organization.objects.get_or_create(name="Default Org")
            farm, _ = Farm.objects.get_or_create(name="Default Farm", organization=org)
            
        validated_data['farm'] = farm
        
        return super().create(validated_data)
