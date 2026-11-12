"""Tenant-scoped HTTP boundary for dairy storage, collections and observations."""
from decimal import Decimal
from django.utils import timezone
from django.conf import settings
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404
from apps.farms.models import Farm
from .cattle_views import CattlePermission
from .cattle_serializers import past_date
from .models import MilkTank, MilkTankMovement, MilkTankQuality
from . import milk_tanks as services


class TankSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    capacity_liters = serializers.DecimalField(max_digits=11, decimal_places=2, min_value=Decimal(".01"))
    balance_liters = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = MilkTank
        fields = ["id", "farm", "farm_name", "name", "capacity_liters", "balance_liters", "is_active", "notes"]

    def validate_farm(self, farm):
        if farm.organization_id != self.context["request"].user.organization_id:
            raise serializers.ValidationError("Selecione uma fazenda da organização.")
        return farm

    def create(self, data):
        user = self.context["request"].user
        return services.tanks(user.organization).get(pk=services.save_tank(user, data).pk)

    def update(self, instance, data):
        user = self.context["request"].user
        return services.tanks(user.organization).get(pk=services.save_tank(user, data, instance).pk)


class MobileTankFormSerializer(TankSerializer):
    version = serializers.DateTimeField(source="updated_at", read_only=True)
    expected_version = serializers.DateTimeField(write_only=True, required=False)
    has_movements = serializers.SerializerMethodField()

    class Meta(TankSerializer.Meta):
        fields = TankSerializer.Meta.fields + ["version", "expected_version", "has_movements"]

    def get_has_movements(self, instance):
        return instance.movements.exists()

    def validate(self, data):
        if self.instance and "expected_version" not in data:
            raise serializers.ValidationError({"expected_version": "Informe a versão consultada."})
        if not self.instance and "expected_version" in data:
            raise serializers.ValidationError({"expected_version": "Versão não se aplica ao cadastro."})
        return super().validate(data)

    def update(self, instance, data):
        version = data.pop("expected_version")
        user = self.context["request"].user
        saved = services.save_tank(user, data, instance, expected_version=version)
        return services.tanks(user.organization).get(pk=saved.pk)


class TankRelatedSerializer(serializers.ModelSerializer):
    tank_name = serializers.CharField(source="tank.name", read_only=True)
    farm_name = serializers.CharField(source="tank.farm.name", read_only=True)
    recorded_by = serializers.CharField(source="created_by.full_name", read_only=True)
    date = serializers.DateField(validators=[past_date])
    request_key = serializers.UUIDField(write_only=True)

    def get_fields(self):
        fields = super().get_fields()
        fields["tank"].queryset = MilkTank.objects.filter(farm__organization=self.context["request"].user.organization).select_related("farm")
        return fields


class MovementSerializer(TankRelatedSerializer):
    liters = serializers.DecimalField(max_digits=11, decimal_places=2, min_value=Decimal(".01"))
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=4, min_value=Decimal(".0001"), required=False, allow_null=True)
    generate_receivable = serializers.BooleanField(write_only=True, default=False)
    due_date = serializers.DateField(write_only=True, required=False)

    class Meta:
        model = MilkTankMovement
        fields = ["id", "tank", "tank_name", "farm_name", "kind", "date", "liters", "buyer", "driver", "vehicle", "document", "reason", "notes", "unit_price", "amount", "receivable", "request_key", "recorded_by", "cancelled_at", "cancellation_reason", "generate_receivable", "due_date"]
        read_only_fields = ["amount", "receivable", "cancelled_at", "cancellation_reason"]
        validators = []  # Retries are resolved under the farm/tank lock.

    def validate(self, data):
        if data["kind"] == "collection" and not data.get("buyer", "").strip():
            raise serializers.ValidationError({"buyer": "Informe o laticínio ou destinatário da coleta."})
        if data["kind"] == "discard" and not data.get("reason", "").strip():
            raise serializers.ValidationError({"reason": "Informe o motivo do descarte."})
        if data["kind"] != "collection" and (data.get("unit_price") is not None or data["generate_receivable"]):
            raise serializers.ValidationError("Valores e receitas se aplicam somente à coleta.")
        if data["generate_receivable"] and not data.get("unit_price"):
            raise serializers.ValidationError({"unit_price": "Informe o preço por litro para gerar o título a receber."})
        return data

    def create(self, data): return services.move_milk(self.context["request"].user, data)

    def to_representation(self, instance):
        result = super().to_representation(instance)
        if self.context["request"].user.role not in {"admin", "manager"}:
            for field in ["unit_price", "amount", "receivable"]: result.pop(field, None)
        return result


class MobileMovementSerializer(serializers.ModelSerializer):
    """Operational read projection: no financial data is loaded or serialized."""
    timezone = serializers.CharField(read_only=True, default=settings.TIME_ZONE)
    farm = serializers.UUIDField(source="tank.farm_id", read_only=True)
    tank_name = serializers.CharField(source="tank.name", read_only=True)
    farm_name = serializers.CharField(source="tank.farm.name", read_only=True)
    recorded_by = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = MilkTankMovement
        fields = ["id", "timezone", "farm", "tank", "tank_name", "farm_name", "kind", "date", "liters", "buyer", "driver", "vehicle", "document", "reason", "notes", "recorded_by", "cancelled_at", "cancellation_reason"]
        read_only_fields = fields


class QualitySerializer(TankRelatedSerializer):
    temperature_c = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("-273.15"), allow_null=True, required=False)
    fat_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, allow_null=True, required=False)
    protein_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, allow_null=True, required=False)
    scc = serializers.IntegerField(min_value=0, max_value=2147483647, allow_null=True, required=False)
    tbc = serializers.IntegerField(min_value=0, max_value=2147483647, allow_null=True, required=False)

    class Meta:
        model = MilkTankQuality
        fields = ["id", "tank", "tank_name", "farm_name", "date", "sample", "temperature_c", "fat_percent", "protein_percent", "scc", "tbc", "antibiotics", "notes", "request_key", "recorded_by"]
        validators = []

    def validate(self, data):
        if not any(data.get(field) is not None for field in ["temperature_c", "fat_percent", "protein_percent", "scc", "tbc"]) and data.get("antibiotics", "not_tested") == "not_tested":
            raise serializers.ValidationError("Informe ao menos um resultado de qualidade.")
        return data

    def create(self, data): return services.record_quality(self.context["request"].user, data)


class MobileQualitySerializer(serializers.ModelSerializer):
    farm = serializers.UUIDField(source="tank.farm_id", read_only=True)
    tank_name = serializers.CharField(source="tank.name", read_only=True)
    farm_name = serializers.CharField(source="tank.farm.name", read_only=True)
    recorded_by = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = MilkTankQuality
        fields = ["id", "farm", "tank", "tank_name", "farm_name", "date", "sample", "temperature_c", "fat_percent", "protein_percent", "scc", "tbc", "antibiotics", "notes", "recorded_by"]
        read_only_fields = fields


class MilkTankViewSet(viewsets.ModelViewSet):
    permission_classes = [CattlePermission]
    serializer_class = TankSerializer
    create_roles = {"admin", "manager"}
    http_method_names = ["get", "post", "patch", "head", "options"]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["farm", "is_active"]

    def get_queryset(self): return services.tanks(self.request.user.organization)

    def get_serializer_class(self):
        if self.request.query_params.get("view") == "mobile" and self.action in {"create", "partial_update"}:
            return MobileTankFormSerializer
        return super().get_serializer_class()

    def form_farm(self, request):
        if request.user.role not in {"admin", "manager"}:
            raise PermissionDenied("Cadastro de tanques exige gerente ou administrador.")
        farm_id = serializers.UUIDField().run_validation(request.query_params.get("farm"))
        return get_object_or_404(Farm, pk=farm_id, organization=request.user.organization)

    @action(detail=False, methods=["get"], url_path="form-options")
    def form_options(self, request):
        farm = self.form_farm(request)
        return Response({"farm": {"id": str(farm.pk), "name": farm.name}})

    @action(detail=True, methods=["get"], url_path="form-record")
    def form_record(self, request, pk=None):
        farm = self.form_farm(request)
        record = get_object_or_404(self.get_queryset(), pk=pk, farm=farm)
        return Response(MobileTankFormSerializer(record, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get"], url_path="production-available")
    def production_available(self, request, pk=None):
        tank = self.get_object()
        day = serializers.DateField(validators=[past_date]).run_validation(request.query_params.get("date", str(timezone.localdate())))
        return Response({"date": str(day), **{key: str(value) for key, value in services.production_available(tank.farm, day).items()}})


class TankRecordViewSet(viewsets.ModelViewSet):
    permission_classes = [CattlePermission]
    http_method_names = ["get", "post", "head", "options"]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["tank", "date"]

    def get_queryset(self):
        rows = self.model.objects.filter(tank__farm__organization=self.request.user.organization).select_related("tank__farm", "created_by")
        if self.request.query_params.get("farm"):
            rows = rows.filter(tank__farm_id=serializers.UUIDField().run_validation(self.request.query_params["farm"]))
        return rows


class MilkTankMovementViewSet(TankRecordViewSet):
    model = MilkTankMovement
    serializer_class = MovementSerializer
    filterset_fields = ["tank", "date", "kind"]
    action_operations = {"cancel": "edit"}

    def get_serializer_class(self):
        if self.request.method == "GET" and self.request.query_params.get("view") == "mobile":
            return MobileMovementSerializer
        return super().get_serializer_class()

    def get_queryset(self):
        rows = super().get_queryset()
        if self.request.method == "GET" and self.request.query_params.get("view") == "mobile":
            rows = rows.defer("unit_price", "amount", "receivable")
        return rows

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        reason = serializers.CharField(max_length=500).run_validation(request.data.get("reason"))
        return Response(self.get_serializer(services.cancel_movement(request.user, self.get_object(), reason)).data)


class MilkTankQualityViewSet(TankRecordViewSet):
    model = MilkTankQuality
    serializer_class = QualitySerializer

    def get_serializer_class(self):
        if self.request.method == "GET" and self.request.query_params.get("view") == "mobile":
            return MobileQualitySerializer
        return super().get_serializer_class()
