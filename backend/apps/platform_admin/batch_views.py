from django.db.models import Count, Q
from django.http import HttpResponse
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.permissions import IsPlatformStaff
from .models import OrganizationBatch, OrganizationBatchItem
from .organization_batches import prepare_batch, confirm_batch, retry_batch, batch_csv, permitted


class BatchSelection(serializers.Serializer):
    action = serializers.ChoiceField(choices=("export", "suspend", "activate", "resend_invitation"))
    reason = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    filters = serializers.DictField(required=False, default=dict)
    ids = serializers.ListField(child=serializers.UUIDField(), max_length=10000, required=False, allow_empty=False)
    all_matching = serializers.BooleanField(default=False)

    def validate(self, attrs):
        if set(self.initial_data) - set(self.fields):
            raise serializers.ValidationError("Campo de seleção não reconhecido.")
        return attrs


class BatchConfirmation(serializers.Serializer):
    expected_total = serializers.IntegerField(min_value=1, max_value=10000)


class BatchSerializer(serializers.ModelSerializer):
    succeeded = serializers.IntegerField(read_only=True)
    failed = serializers.IntegerField(read_only=True)
    skipped = serializers.IntegerField(read_only=True)

    class Meta:
        model = OrganizationBatch
        fields = ("id", "action", "reason", "filters", "status", "total", "succeeded", "failed", "skipped", "expires_at", "confirmed_at", "completed_at", "created_at", "parent")
        read_only_fields = fields


class BatchItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationBatchItem
        fields = ("id", "organization_id", "snapshot", "status", "message", "completed_at")
        read_only_fields = fields


class OrganizationBatchViewSet(viewsets.GenericViewSet):
    permission_classes = [IsPlatformStaff]
    serializer_class = BatchSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return OrganizationBatch.objects.filter(actor=self.request.user).annotate(
            succeeded=Count("items", filter=Q(items__status="succeeded")),
            failed=Count("items", filter=Q(items__status="failed")),
            skipped=Count("items", filter=Q(items__status="skipped")),
        ).order_by("-created_at", "-pk")

    def result(self, batch, code=200):
        return Response(self.get_serializer(self.get_queryset().get(pk=batch.pk)).data, status=code)

    def list(self, request):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    def retrieve(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)

    def create(self, request):
        serializer = BatchSelection(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self.result(prepare_batch(request=request, **serializer.validated_data), status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        batch = self.get_object()
        serializer = BatchConfirmation(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self.result(confirm_batch(batch_id=batch.pk, request=request, **serializer.validated_data), 202)

    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        batch = self.get_object()
        return self.result(retry_batch(batch_id=batch.pk, request=request), 201)

    @action(detail=True, methods=["get"])
    def items(self, request, pk=None):
        batch = self.get_object()
        queryset = batch.items.order_by("pk")
        state = request.query_params.get("status")
        if state:
            if state not in {"pending", "delivery_pending", "failed", "succeeded", "skipped"}:
                raise serializers.ValidationError({"status": "Resultado inválido."})
            queryset = queryset.filter(status=state)
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(BatchItemSerializer(page, many=True).data)

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        from rest_framework.exceptions import PermissionDenied
        batch = self.get_object()
        if not permitted(request.user, "export"):
            raise PermissionDenied()
        if batch.action != "export" or batch.status != "completed":
            raise serializers.ValidationError("Aguarde a conclusão do lote de exportação.")
        response = HttpResponse(batch_csv(batch), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="organizacoes-{batch.pk}.csv"'
        response["Cache-Control"] = "no-store"
        from .services import record_platform_action
        record_platform_action(request=request, action="organization.batch_downloaded", object_type="OrganizationBatch", object_id=batch.pk, description="Listagem de organizações exportada.")
        return response
