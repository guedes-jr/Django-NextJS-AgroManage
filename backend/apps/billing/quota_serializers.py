from rest_framework import serializers


class OrganizationLimitsSerializer(serializers.Serializer):
    max_users = serializers.IntegerField(min_value=0, max_value=2147483647, allow_null=True, required=False)
    max_farms = serializers.IntegerField(min_value=0, max_value=2147483647, allow_null=True, required=False)
    max_storage_mb = serializers.IntegerField(min_value=0, max_value=2147483647, allow_null=True, required=False)
    warning_threshold_percent = serializers.IntegerField(min_value=1, max_value=100, required=False)
    inherit = serializers.ListField(child=serializers.ChoiceField(choices=["max_users", "max_farms", "max_storage_mb", "warning_threshold_percent"]), required=False, default=list)

    def validate(self, attrs):
        unknown = set(self.initial_data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError("Há campos de cotas desconhecidos na solicitação.")
        inherited = attrs.get("inherit", [])
        if set(inherited).intersection(set(attrs) - {"inherit"}):
            raise serializers.ValidationError("Escolha herdar ou substituir cada limite, sem combinar as duas opções.")
        if not inherited and not (set(attrs) - {"inherit"}):
            raise serializers.ValidationError("Informe uma alteração de cotas.")
        return attrs
