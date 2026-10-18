from django.http import FileResponse
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from apps.organizations.models import Organization
from apps.platform_admin.models import OrganizationExport
from apps.platform_admin.services import record_platform_action
from .service import allowed, request_export, retry_export, ERRORS
from .storage import ExportStorage


class ExportPermission(BasePermission):
    def has_permission(self, request, view):
        return allowed(request.user)


class ExportRequest(serializers.Serializer):
    format = serializers.ChoiceField(choices=["customer", "recovery"])
    request_key = serializers.UUIDField()

    def validate(self, attrs):
        if set(self.initial_data) - set(self.fields):
            raise serializers.ValidationError("Campo não permitido na exportação.")
        return attrs


class RetryRequest(serializers.Serializer):
    request_key = serializers.UUIDField()


class ExportSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    error_message = serializers.SerializerMethodField()
    download_allowed = serializers.SerializerMethodField()

    def get_status(self, obj):
        return "expired" if obj.status == "ready" and obj.expires_at <= timezone.now() else obj.status

    def get_error_message(self, obj):
        return ERRORS.get(obj.error_code, "")

    def get_download_allowed(self, obj):
        return obj.status == "ready" and obj.expires_at > timezone.now()

    class Meta:
        model = OrganizationExport
        fields = ("id", "format", "status", "progress", "created_at", "started_at", "completed_at", "expires_at", "archive_size", "archive_sha256", "summary", "error_code", "error_message", "download_allowed", "parent")
        read_only_fields = fields


class OrganizationExportViewSet(viewsets.GenericViewSet):
    permission_classes = [ExportPermission]
    serializer_class = ExportSerializer
    http_method_names = ["get", "post", "head", "options"]
    filter_backends = []

    def organization(self):
        return get_object_or_404(Organization, pk=self.kwargs["organization_pk"])

    def get_queryset(self):
        return OrganizationExport.objects.filter(organization=self.organization()).order_by("-created_at", "-pk")

    def list(self, request, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    def retrieve(self, request, **kwargs):
        return Response(self.get_serializer(self.get_object()).data)

    def create(self, request, **kwargs):
        serializer = ExportRequest(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = request_export(organization=self.organization(), request=request, **serializer.validated_data)
        return Response(self.get_serializer(job).data, status=202)

    @action(detail=True, methods=["post"])
    def retry(self, request, **kwargs):
        job = self.get_object()
        serializer = RetryRequest(data=request.data)
        serializer.is_valid(raise_exception=True)
        value = retry_export(job_id=job.pk, request=request, **serializer.validated_data)
        return Response(self.get_serializer(value).data, status=202)

    @action(detail=True, methods=["get"])
    def download(self, request, **kwargs):
        job = self.get_object()
        if job.status != "ready" or job.expires_at <= timezone.now():
            raise ValidationError("O pacote não está pronto ou já expirou.")
        storage = ExportStorage()
        try:
            if storage.size(job.archive_name) != job.archive_size:
                raise FileNotFoundError()
            handle = storage.open(job.archive_name, "rb")
        except FileNotFoundError:
            OrganizationExport.objects.filter(pk=job.pk, status="ready").update(status="failed", error_code="missing_file", archive_name="", completed_at=timezone.now())
            raise NotFound("Pacote indisponível. Solicite nova tentativa.")
        try:
            record_platform_action(request=request, action="organization.export_downloaded", organization=job.organization, object_type="OrganizationExport", object_id=job.pk, description="Pacote de dados da organização baixado.", extra_data={"format": job.format, "sha256": job.archive_sha256})
        except Exception:
            handle.close()
            raise
        response = FileResponse(handle, as_attachment=True, filename=f"organizacao-{job.organization_id}-{job.format}.zip", content_type="application/zip")
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        response["X-Archive-SHA256"] = job.archive_sha256
        return response
