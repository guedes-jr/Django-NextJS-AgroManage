from rest_framework import serializers
from .models import Organization, OrganizationAddress, OrganizationContact

class OrganizationAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationAddress
        fields = [
            'id', 'label', 'postal_code', 'street', 'number', 
            'complement', 'neighborhood', 'city', 'state', 'is_main'
        ]

class OrganizationContactSerializer(serializers.ModelSerializer):
    contact_type_display = serializers.CharField(source='get_contact_type_display', read_only=True)

    class Meta:
        model = OrganizationContact
        fields = [
            'id', 'name', 'contact_type', 'contact_type_display', 'value', 'is_main'
        ]

class OrganizationSerializer(serializers.ModelSerializer):
    plan_display = serializers.CharField(source='get_plan_display', read_only=True)
    addresses = OrganizationAddressSerializer(many=True, read_only=True)
    contacts = OrganizationContactSerializer(many=True, read_only=True)
    farms_count = serializers.SerializerMethodField()
    storage_used = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            'id', 'name', 'slug', 'document', 'plan', 'plan_display',
            'is_active', 'logo', 'address', 'phone', 'email',
            'addresses', 'contacts', 'farms_count', 'storage_used',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'slug', 'plan', 'is_active', 'created_at', 'updated_at']

    def get_farms_count(self, obj):
        return 0

    def get_storage_used(self, obj):
        return 0

