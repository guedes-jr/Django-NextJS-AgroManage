from rest_framework import serializers

from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = Task
        fields = (
            "id", "farm", "farm_name", "title", "description", "priority", "status", "due_date",
            "assigned_to", "assigned_to_name", "created_by", "created_by_name", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_by", "created_at", "updated_at")

    def validate(self, attrs):
        organization = getattr(getattr(self.context.get("request"), "user", None), "organization", None)
        farm = attrs.get("farm", getattr(self.instance, "farm", None))
        assigned_to = attrs.get("assigned_to", getattr(self.instance, "assigned_to", None))
        if not organization:
            raise serializers.ValidationError({"organization": "Usuário não possui organização vinculada."})
        if farm and farm.organization_id != organization.id:
            raise serializers.ValidationError({"farm": "A propriedade pertence a outra organização."})
        if assigned_to and assigned_to.organization_id != organization.id:
            raise serializers.ValidationError({"assigned_to": "O responsável pertence a outra organização."})
        return attrs
