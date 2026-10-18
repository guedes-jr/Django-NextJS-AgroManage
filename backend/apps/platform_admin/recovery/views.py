import json
from django.apps import apps
from django.http import FileResponse
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.organizations.models import Organization
from ..models import OrganizationRecovery
from ..exports.views import ExportPermission
from ..exports.capture import sha256_file
from .service import request_recovery, schedule, directory, audit, ERRORS


class RecoverySerializer(serializers.ModelSerializer):
    error_message = serializers.SerializerMethodField()
    source = serializers.PrimaryKeyRelatedField(read_only=True)
    isolated_organization = serializers.PrimaryKeyRelatedField(read_only=True)

    def get_error_message(self, obj):
        return ERRORS.get(obj.error_code, "")

    class Meta:
        model = OrganizationRecovery
        fields = ("id", "source", "status", "operation", "progress", "created_at", "completed_at", "isolated_organization", "preview", "preview_digest", "applied_digest", "source_sha256", "before_sha256", "error_code", "error_message")
        read_only_fields = fields


class CreateRecovery(serializers.Serializer):
    source_id = serializers.UUIDField()
    request_key = serializers.UUIDField()


class ConfirmRecovery(serializers.Serializer):
    digest = serializers.CharField(max_length=64)
    confirmation = serializers.CharField(max_length=255, trim_whitespace=False)


class RecoveryViewSet(viewsets.GenericViewSet):
    permission_classes = [ExportPermission]
    serializer_class = RecoverySerializer
    http_method_names = ["get", "post", "head", "options"]
    filter_backends = []

    def organization(self):
        return get_object_or_404(Organization, pk=self.kwargs["organization_pk"])

    def get_queryset(self):
        return OrganizationRecovery.objects.filter(organization=self.organization()).select_related("organization").order_by("-created_at", "-pk")

    def list(self, request, **kwargs):
        return self.get_paginated_response(self.get_serializer(self.paginate_queryset(self.get_queryset()), many=True).data)

    def retrieve(self, request, **kwargs):
        return Response(self.get_serializer(self.get_object()).data)

    def create(self, request, **kwargs):
        data = CreateRecovery(data=request.data); data.is_valid(raise_exception=True)
        job = request_recovery(organization=self.organization(), request=request, **data.validated_data)
        return Response(self.get_serializer(job).data, status=202)

    @action(detail=True, methods=["post"])
    def refresh(self, request, **kwargs):
        job = schedule(self.get_object().pk, request, "refresh")
        return Response(self.get_serializer(job).data, status=202)

    def confirm_operation(self, request, operation):
        data = ConfirmRecovery(data=request.data); data.is_valid(raise_exception=True)
        job = schedule(self.get_object().pk, request, operation, **data.validated_data)
        return Response(self.get_serializer(job).data, status=202)

    @action(detail=True, methods=["post"])
    def apply(self, request, **kwargs):
        return self.confirm_operation(request, "apply")

    @action(detail=True, methods=["post"])
    def rollback(self, request, **kwargs):
        return self.confirm_operation(request, "rollback")

    @action(detail=True, methods=["get"])
    def records(self, request, **kwargs):
        job = self.get_object()
        if not job.isolated_organization_id:
            raise ValidationError("Aguarde a conclusão do ensaio.")
        from .package import Package
        from ..exports.registry import REGISTRY
        label = request.query_params.get("entity", "farms.farm")
        if label not in REGISTRY:
            raise ValidationError("Entidade desconhecida.")
        try:
            package = Package(directory(job) / "source.zip", job.source_sha256, job.organization_id)
        except Exception:
            raise ValidationError("O pacote de conferência está indisponível ou falhou na validação.")
        mapping_path = directory(job) / "rehearsal-map.json"
        if not mapping_path.exists() or sha256_file(mapping_path) != job.preview.get("mapping_sha256"):
            raise ValidationError("Mapa do ensaio indisponível ou inválido.")
        mapping = json.loads(mapping_path.read_text(encoding="utf-8"))[label]
        page = self.paginate_queryset(list(package.rows[label].values()))
        model = apps.get_model(label)
        ids = [mapping[str(row[model._meta.pk.name])] for row in page if not package.shared(label, row)]
        restored = {str(row[model._meta.pk.name]): row for row in model.objects.filter(pk__in=ids).values(*REGISTRY[label]["fields"])}
        return self.get_paginated_response([{"source": row, "restored": restored.get(str(mapping[str(row[model._meta.pk.name])])) if not package.shared(label, row) else None, "reference_only": package.shared(label, row)} for row in page])

    @action(detail=True, methods=["get"])
    def download(self, request, **kwargs):
        job = self.get_object()
        kind = request.query_params.get("kind", "source")
        digest = job.source_sha256 if kind == "source" else job.before_sha256 if kind == "before" else ""
        if not digest:
            raise NotFound("Cópia indisponível.")
        path = directory(job) / ("source.zip" if kind == "source" else "before.zip")
        if not path.exists() or sha256_file(path) != digest:
            raise NotFound("Cópia indisponível ou com integridade inválida.")
        handle = path.open("rb")
        try:
            audit(job, "downloaded_" + kind)
        except Exception:
            handle.close(); raise
        response = FileResponse(handle, as_attachment=True, filename=f"recuperacao-{job.pk}-{kind}.zip", content_type="application/zip")
        response["Cache-Control"], response["X-Archive-SHA256"] = "private, no-store", digest
        response["X-Content-Type-Options"] = "nosniff"
        return response
