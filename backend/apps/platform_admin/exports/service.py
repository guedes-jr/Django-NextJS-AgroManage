"""Durable organization export jobs and atomic, fenced private publication."""
import hashlib
import json
import os
import shutil
import tempfile
import uuid
import zipfile
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from common.permissions import IsPlatformAdmin
from apps.platform_admin.models import OrganizationExport, PlatformAuditLog
from apps.platform_admin.services import record_platform_action
from .capture import Capture, ExportFailure, dumps, sha256_file, csv_tables
from .registry import INVENTORY_VERSION, REGISTRY, EXCLUDED_FIELDS, EXCLUDED_MODELS
from .storage import ExportStorage

ERRORS = {
    "schema_changed": "O inventário de exportação precisa ser atualizado para esta versão do sistema.",
    "cross_tenant_reference": "Há referências inconsistentes entre organizações ou entidades. Revise os dados antes de exportar.",
    "missing_file": "Um arquivo referenciado não foi encontrado. Corrija o armazenamento e tente novamente.",
    "unreadable_file": "Não foi possível ler um arquivo referenciado. Verifique o armazenamento.",
    "file_changed": "Um arquivo mudou durante a captura. Tente novamente.",
    "limit_exceeded": "O pacote ultrapassou o limite de trabalho configurado para exportações.",
    "permission_revoked": "O solicitante não tem mais permissão para exportar.",
    "interrupted": "A execução foi interrompida ou excedeu o prazo. Solicite nova tentativa.",
    "snapshot_unavailable": "Não foi possível iniciar uma captura consistente neste banco de dados.",
    "failed": "Não foi possível gerar o pacote. Verifique a operação e solicite nova tentativa.",
}


def allowed(user):
    return IsPlatformAdmin().has_permission(SimpleNamespace(user=user), None) and not getattr(user, "support_access_grant", None)


def fresh_permission(user_id):
    return get_user_model().objects.filter(pk=user_id, is_active=True, platform_staff_profile__is_active=True, platform_staff_profile__role__in=["platform_owner", "platform_admin"]).exists()


def worker_audit(job, action):
    PlatformAuditLog.objects.create(actor_id=job.requested_by_id, organization_id=job.organization_id, action=f"organization.export_{action}", object_type="OrganizationExport", object_id=str(job.pk), description=f"Exportação da organização: {action}.", extra_data={"format": job.format, "status": job.status, "error_code": job.error_code})


@transaction.atomic
def request_export(*, organization, request, format, request_key, parent=None):
    if not allowed(request.user):
        raise PermissionDenied()
    if organization.recovery_isolated:
        raise ValidationError("Os arquivos do ensaio ficam na recuperação da organização original.")
    if format not in {"customer", "recovery"}:
        raise ValidationError("Formato de exportação inválido.")
    # Organization lock serializes duplicate request keys and later snapshot/file writers.
    from apps.organizations.models import Organization
    Organization.objects.select_for_update().get(pk=organization.pk)
    existing = OrganizationExport.objects.filter(organization=organization, requested_by=request.user, request_key=request_key).first()
    if existing:
        if existing.format != format or existing.parent_id != (parent.pk if parent else None):
            raise ValidationError("A chave já foi utilizada para outro formato.")
        return existing
    job = OrganizationExport.objects.create(organization=organization, requested_by=request.user, format=format, request_key=request_key, parent=parent)
    record_platform_action(request=request, action="organization.export_requested", organization=organization, object_type="OrganizationExport", object_id=job.pk, description="Exportação dos dados da organização solicitada.", extra_data={"format": format, "parent_id": str(parent.pk) if parent else None})
    from apps.platform_admin.tasks import generate_organization_export
    transaction.on_commit(lambda: generate_organization_export.delay(str(job.pk)), robust=True)
    return job


@transaction.atomic
def retry_export(*, job_id, request, request_key):
    from rest_framework.generics import get_object_or_404
    job = get_object_or_404(OrganizationExport.objects.select_for_update().select_related("organization"), pk=job_id)
    if job.status not in {"failed", "expired"} and not (job.status == "ready" and job.expires_at <= timezone.now()):
        raise ValidationError("Somente exportações com falha ou expiradas permitem nova tentativa.")
    return request_export(organization=job.organization, request=request, format=job.format, request_key=request_key, parent=job)


def artifact_files(root):
    for folder in ("data", "relations", "files", "tables"):
        directory = root / folder
        if directory.exists():
            yield from sorted(path for path in directory.rglob("*") if path.is_file())
    for name in ("schema.json", "README.txt"):
        yield root / name


def package_capture(job, capture, output):
    if job.format == "customer":
        csv_tables(capture)
    schema = capture.schema()
    schema_data = dumps({"inventory_version": INVENTORY_VERSION, "models": schema, "source_migrations": capture.migrations})
    (capture.root / "schema.json").write_text(schema_data, encoding="utf-8")
    (capture.root / "README.txt").write_text(
        "AgroManage — exportação de uma organização\n\n"
        "Formato: " + job.format + "\nVersão: 1\n"
        "data/: um objeto JSON por linha, IDs originais e relações preservadas.\n"
        "relations/: relações muitos-para-muitos (source/target).\n"
        "files/: arquivos referenciados; os campos file apontam para caminhos dentro do pacote.\n"
        "tables/: CSV legível com BOM, disponível no formato cliente.\n"
        "schema.json: tipos, relações e versões de migrations para conferência.\n"
        "manifest.json: contagens, SHA-256 e tamanho de cada entrada.\n\n"
        "O pacote inclui conversas de IA dos usuários do cliente; trate o conteúdo como privado.\n"
        "Excluídos: credenciais, senhas, sessões, convites, tokens, notas internas de suporte,\n"
        "auditoria interna, integrações/provedores, filas, notificações transitórias e comissões.\n"
        "Atores internos referenciados são substituídos por contas fictícias inativas.\n"
        "Catálogos compartilhados incluem apenas referências necessárias. URLs externas não são baixadas.\n"
        "Não é um dump do banco. Cobrança é contexto documental, sem autorizar reexecução de pagamentos.\n"
        "A importação exige o fluxo de recuperação compatível; este arquivo não executa restauração.\n"
        "Reativação de usuários, agendas, envios e integrações exige revisão no fluxo de recuperação.\n",
        encoding="utf-8",
    )
    entries = []
    for path in artifact_files(capture.root):
        entries.append({"path": path.relative_to(capture.root).as_posix(), "size": path.stat().st_size, "sha256": sha256_file(path)})
    counts = {label: len(capture.ids[label]) + (len(capture.actors) if label == "accounts.user" else 0) for label in REGISTRY}
    manifest = {
        "format_version": 1, "inventory_version": INVENTORY_VERSION, "format": job.format,
        "organization_id": str(job.organization_id), "export_id": str(job.pk), "snapshot_at": capture.snapshot_at,
        "consistency": "postgresql_repeatable_read_with_organization_file_lock" if connection.vendor == "postgresql" else "sqlite_transaction",
        "entity_counts": counts, "synthetic_actor_ids": sorted(capture.actors.values()),
        "excluded_models": EXCLUDED_MODELS, "excluded_fields": EXCLUDED_FIELDS,
        "excluded_apps": ["platform_admin", "affiliates", "auth", "sessions"],
        "sanitized_fields": {"billing.subscription.custom_limits": ["max_users", "max_farms", "max_storage_mb", "max_reports_per_month", "warning_threshold_percent"]},
        "reference_only_models": [label for label in REGISTRY if label.startswith("billing.")],
        "schema_sha256": hashlib.sha256(schema_data.encode()).hexdigest(), "entries": entries,
        "attachments": capture.file_entries,
    }
    (capture.root / "manifest.json").write_text(dumps(manifest), encoding="utf-8")
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        for entry in entries:
            archive.write(capture.root / entry["path"], entry["path"])
        archive.write(capture.root / "manifest.json", "manifest.json")
    with zipfile.ZipFile(output) as checked:
        if checked.testzip() is not None:
            raise ExportFailure("failed")
    return {"format_version": 1, "snapshot_at": capture.snapshot_at, "entity_counts": counts, "records": sum(counts.values()), "files": len(capture.file_entries), "entries": len(entries), "schema_sha256": manifest["schema_sha256"]}


def generate_export(job_id):
    token = uuid.uuid4()
    with transaction.atomic():
        job = OrganizationExport.objects.select_for_update().get(pk=job_id)
        if job.status != "queued":
            return
        if not fresh_permission(job.requested_by_id):
            job.status, job.error_code, job.completed_at = "failed", "permission_revoked", timezone.now()
            job.save(); worker_audit(job, "failed")
            return
        job.status, job.progress = "running", 10
        job.started_at, job.lease_token = timezone.now(), token
        job.lease_until = timezone.now() + timedelta(hours=2)
        job.save(); worker_audit(job, "started")
    storage = ExportStorage()
    published = None
    try:
        work = Path(storage.path("work")); work.mkdir(parents=True, exist_ok=True, mode=0o700)
        with tempfile.TemporaryDirectory(prefix=f"{job.pk}-{token}-", dir=work) as directory:
            capture = Capture(job.organization_id, directory).run()
            OrganizationExport.objects.filter(pk=job.pk, status="running", lease_token=token).update(progress=70)
            output = Path(directory) / "package.zip"
            summary = package_capture(job, capture, output)
            archive_size, archive_hash = output.stat().st_size, sha256_file(output)
            name = f"packages/{job.pk}-{token}.zip"
            target = Path(storage.path(name)); target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with transaction.atomic():
                current = OrganizationExport.objects.select_for_update().get(pk=job.pk)
                if current.status != "running" or current.lease_token != token or current.lease_until <= timezone.now():
                    raise ExportFailure("interrupted")
                if not fresh_permission(current.requested_by_id):
                    raise ExportFailure("permission_revoked")
                os.chmod(output, 0o600)
                os.replace(output, target)
                published = name
                current.status, current.progress = "ready", 100
                current.archive_name, current.archive_size, current.archive_sha256 = name, archive_size, archive_hash
                current.completed_at = timezone.now()
                current.expires_at = timezone.now() + timedelta(days=max(1, settings.ORGANIZATION_EXPORT_RETENTION_DAYS))
                current.summary, current.error_code = summary, ""
                current.save(); worker_audit(current, "ready")
    except Exception as exc:
        with transaction.atomic():
            current = OrganizationExport.objects.select_for_update().get(pk=job.pk)
            # A staging cleanup failure must not remove a committed package.
            if current.status == "ready" and current.archive_name == published:
                return
            if published:
                try:
                    storage.delete(published)
                except OSError:
                    pass  # The orphan sweeper retries private file cleanup.
            if current.status == "running" and current.lease_token == token:
                current.status, current.error_code = "failed", exc.code if isinstance(exc, ExportFailure) else "failed"
                current.completed_at = timezone.now()
                current.archive_name = ""
                current.save(); worker_audit(current, "failed")


def maintain_exports():
    from apps.platform_admin.tasks import generate_organization_export
    now = timezone.now()
    storage = ExportStorage()
    for job_id in OrganizationExport.objects.filter(status="running", lease_until__lt=now).values_list("pk", flat=True).iterator(chunk_size=100):
        with transaction.atomic():
            job = OrganizationExport.objects.select_for_update().get(pk=job_id)
            if job.status == "running" and job.lease_until < timezone.now():
                job.status, job.error_code, job.completed_at = "failed", "interrupted", timezone.now()
                job.save(); worker_audit(job, "failed")
    for job_id in OrganizationExport.objects.filter(status="ready", expires_at__lte=now).values_list("pk", flat=True).iterator(chunk_size=100):
        with transaction.atomic():
            job = OrganizationExport.objects.select_for_update().get(pk=job_id)
            if job.status == "ready" and job.expires_at <= timezone.now():
                from apps.platform_admin.models import OrganizationRecovery
                if OrganizationRecovery.objects.filter(source=job, operation="rehearse", status__in=["queued", "running"]).exists():
                    continue  # A confirmed rehearsal must pin its source first.
                if job.archive_name:
                    storage.delete(job.archive_name)
                job.status, job.archive_name = "expired", ""
                job.save(); worker_audit(job, "expired")
    # Remove abandoned private staging directories after the lease window.
    work = Path(storage.path("work"))
    if work.exists():
        for directory in work.iterdir():
            if directory.is_dir() and not directory.is_symlink() and directory.stat().st_mtime < now.timestamp() - 3 * 3600:
                shutil.rmtree(directory)
    packages = Path(storage.path("packages"))
    if packages.exists():
        for package in packages.glob("*.zip"):
            if not package.is_symlink() and package.stat().st_mtime < now.timestamp() - 3 * 3600:
                name = "packages/" + package.name
                if not OrganizationExport.objects.filter(archive_name=name).exists():
                    package.unlink()
    for job_id in OrganizationExport.objects.filter(status="queued").values_list("pk", flat=True).iterator(chunk_size=100):
        generate_organization_export.delay(str(job_id))
