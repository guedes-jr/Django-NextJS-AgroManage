"""Audited rehearsal, reviewed application and conflict-checked rollback."""
import hashlib
import json
import os
import shutil
import tempfile
import uuid
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

from django.apps import apps
from django.db import connection, transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.organizations.models import Organization
from apps.platform_admin.models import OrganizationExport, OrganizationRecovery, PlatformAuditLog, PlatformStaffProfile
from ..exports.capture import Capture, ExportFailure, dumps, sha256_file
from ..exports.registry import REGISTRY
from ..exports.service import allowed, fresh_permission, package_capture
from ..exports.storage import ExportStorage
from .package import Package, fail
from .importer import preflight, replay, undo, cleanup_files, restore_backup_files, query

ERRORS = {
    "invalid_package": "Pacote inválido ou incompleto.", "integrity": "A integridade do pacote não confere.",
    "incompatible": "O formato ou a estrutura do pacote não é compatível com esta versão.",
    "isolation": "Há conflito de identidade ou referência fora da organização.",
    "catalog_conflict": "Um catálogo compartilhado mudou ou deixou de existir. A recuperação foi bloqueada.",
    "stale_preview": "Os dados mudaram desde a prévia. Atualize e confira o impacto novamente.",
    "rollback_conflict": "Os dados mudaram depois da recuperação. O rollback foi bloqueado para preservar essas alterações.",
    "permission_revoked": "O solicitante não tem mais permissão para recuperar dados.",
    "interrupted": "Execução interrompida. Os dados não confirmados foram revertidos.",
    "limit_exceeded": "O pacote excede os limites configurados para recuperação.",
    "failed": "Não foi possível concluir a recuperação. Nenhum resultado parcial foi confirmado.",
}


def directory(job):
    root = Path(ExportStorage().path(f"recoveries/{job.pk}"))
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    return root


def audit(job, event):
    PlatformAuditLog.objects.create(actor_id=job.authorized_by_id or job.requested_by_id, organization_id=job.organization_id,
        action=f"organization.recovery_{event}", object_type="OrganizationRecovery", object_id=str(job.pk),
        description=f"Recuperação de organização: {event}.", extra_data={"operation": job.operation, "status": job.status, "error_code": job.error_code})


def enqueue(job):
    from ..tasks import process_organization_recovery
    transaction.on_commit(lambda: process_organization_recovery.delay(str(job.pk)), robust=True)


@transaction.atomic
def request_recovery(*, organization, source_id, request_key, request):
    if not allowed(request.user):
        raise PermissionDenied()
    organization = Organization.objects.select_for_update().get(pk=organization.pk)
    if organization.recovery_isolated:
        raise ValidationError("Use a organização original para solicitar a recuperação.")
    existing = OrganizationRecovery.objects.filter(organization=organization, requested_by=request.user, request_key=request_key).first()
    if existing:
        if str(existing.source_id) != str(source_id):
            raise ValidationError("Chave já utilizada para outro pacote.")
        return existing
    source = OrganizationExport.objects.select_for_update().filter(pk=source_id, organization=organization, format="recovery", status="ready", expires_at__gt=timezone.now()).first()
    if not source:
        raise ValidationError("Selecione uma exportação técnica disponível desta organização.")
    job = OrganizationRecovery.objects.create(organization=organization, source=source, requested_by=request.user, request_key=request_key, source_sha256=source.archive_sha256)
    audit(job, "requested"); enqueue(job)
    return job


@transaction.atomic
def schedule(job_id, request, operation, digest="", confirmation=""):
    if not allowed(request.user):
        raise PermissionDenied()
    job = OrganizationRecovery.objects.select_for_update().get(pk=job_id)
    if job.status in {"queued", "running"}:
        if job.operation == operation:
            return job
        raise ValidationError("Aguarde a execução atual.")
    if operation == "refresh":
        if job.status not in {"ready", "failed"} or not job.isolated_organization_id:
            raise ValidationError("Esta recuperação ainda não possui um ensaio concluído.")
    else:
        expected = "ready" if operation == "apply" else "applied"
        if operation not in {"apply", "rollback"} or job.status != expected:
            raise ValidationError("Operação incompatível com o estado atual.")
        expected_digest = job.preview_digest if operation == "apply" else job.applied_digest
        if digest != expected_digest or not digest or confirmation != job.organization.name:
            raise ValidationError("Confira a prévia e confirme o nome exato da organização.")
    # Authorization belongs to the administrator who confirms this specific action.
    job.authorized_by = request.user
    job.operation, job.status, job.progress, job.error_code = operation, "queued", 0, ""
    job.save(); audit(job, operation + "_requested"); enqueue(job)
    return job


def lock_snapshot():
    if connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
            cursor.execute("SET LOCAL lock_timeout = '10s'")
            tables = {apps.get_model(label)._meta.db_table for label in REGISTRY}
            for label, spec in REGISTRY.items():
                for name in spec["m2m"]:
                    tables.add(apps.get_model(label)._meta.get_field(name).remote_field.through._meta.db_table)
            # Legacy jobs do not all acquire tenant row locks. This operational
            # maintenance window fences ORM and SQL writers, including workers.
            cursor.execute("LOCK TABLE " + ", ".join(connection.ops.quote_name(table) for table in sorted(tables)) + " IN SHARE ROW EXCLUSIVE MODE")
    elif connection.vendor != "sqlite":
        fail("incompatible")


def snapshot(job, root, name):
    with tempfile.TemporaryDirectory(prefix="capture-", dir=root) as work:
        capture = Capture(job.organization_id, work).run(in_transaction=True)
        output = root / (name + ".tmp")
        package_capture(SimpleNamespace(pk=job.pk, organization_id=job.organization_id, format="recovery"), capture, output)
        os.chmod(output, 0o600)
        os.replace(output, root / name)
    digest = sha256_file(root / name)
    package = Package(root / name, digest, job.organization_id)
    return package, digest


def preview(job, package, root):
    impact = preflight(package)
    current, _ = snapshot(job, root, "preview.zip")
    current_counts = {label: len(rows) for label, rows in current.rows.items()}
    preserved = {label: len(set(rows) - set(package.rows[label])) for label, rows in current.rows.items()}
    digest = current.fingerprint()
    proof = {key: job.preview[key] for key in ("verified_rehearsal_counts", "mapping_sha256") if key in job.preview}
    job.preview = {**proof, "policy": "merge", "entities": impact, "source_counts": package.manifest["entity_counts"],
        "current_counts": current_counts, "newer_records_preserved": preserved, "files": len(package.manifest["attachments"]),
        "source_snapshot_at": package.manifest["snapshot_at"], "previewed_at": timezone.now().isoformat(),
        "disabled_schedules": len(package.rows["reports.reportschedule"]), "accounts_policy": "preserve_existing_disable_new",
        "billing_policy": "reference_only", "isolated_files": "private_source_archive"}
    job.preview_digest = digest


def verify_rehearsal(package, target, mappings):
    counts = {}
    for label, rows in package.rows.items():
        model = apps.get_model(label)
        ids = [mappings[(label, pk)] for pk, row in rows.items() if not package.shared(label, row)]
        count = 0
        for start in range(0, len(ids), 500):
            count += query(model).filter(pk__in=ids[start:start + 500]).count()
        if count != len(ids):
            fail("integrity")
        counts[label] = count
    if query(apps.get_model("accounts.user")).filter(organization=target, is_active=True).exists():
        fail("isolation")
    return counts


def process_recovery(job_id):
    token = uuid.uuid4()
    with transaction.atomic():
        job = OrganizationRecovery.objects.select_for_update().get(pk=job_id)
        if job.status != "queued":
            return
        job.status, job.progress, job.lease_token = "running", 10, token
        job.lease_until = timezone.now() + timedelta(hours=2)
        job.save(); audit(job, "started")
    files = []
    try:
        if not fresh_permission(job.authorized_by_id or job.requested_by_id):
            fail("permission_revoked")
        root = directory(job)
        source_path = root / "source.zip"
        if not source_path.exists():
            source = OrganizationExport.objects.get(pk=job.source_id)
            with ExportStorage().open(source.archive_name, "rb") as handle, (root / "source.tmp").open("wb") as output:
                shutil.copyfileobj(handle, output, 1024 * 1024)
            os.chmod(root / "source.tmp", 0o600)
            os.replace(root / "source.tmp", source_path)
        package = Package(source_path, job.source_sha256, job.organization_id)
        with transaction.atomic():
            lock_snapshot()
            job = OrganizationRecovery.objects.select_for_update().get(pk=job_id)
            if job.status != "running" or job.lease_token != token or job.lease_until <= timezone.now():
                fail("interrupted")
            organization = Organization.objects.select_for_update().get(pk=job.organization_id)
            PlatformStaffProfile.objects.select_for_update().get(user_id=job.authorized_by_id or job.requested_by_id)
            if organization.recovery_isolated or not fresh_permission(job.authorized_by_id or job.requested_by_id):
                fail("permission_revoked")
            if job.operation == "rehearse":
                preflight(package)
                target = Organization(name="Conferência de recuperação", slug=f"recovery-{job.pk}", recovery_isolated=True, is_active=False, status="suspended", status_reason="Ambiente isolado de recuperação; acesso e efeitos externos bloqueados.")
                query(Organization).bulk_create([target])
                _, mappings = replay(package, job, target=target)
                connection.check_constraints()
                job.isolated_organization = target
                counts = verify_rehearsal(package, target, mappings)
                preview(job, package, root)
                job.preview["verified_rehearsal_counts"] = counts
                mapping = {label: {pk: mappings[(label, pk)] for pk in rows} for label, rows in package.rows.items()}
                (root / "rehearsal-map.json").write_text(dumps(mapping), encoding="utf-8")
                os.chmod(root / "rehearsal-map.json", 0o600)
                job.preview["mapping_sha256"] = sha256_file(root / "rehearsal-map.json")
                job.status = "ready"
            elif job.operation == "refresh":
                preview(job, package, root); job.status = "ready"
            elif job.operation == "apply":
                current, backup_hash = snapshot(job, root, "before.zip")
                if current.fingerprint() != job.preview_digest:
                    fail("stale_preview")
                preflight(package)
                journal, _ = replay(package, job, files=files)
                connection.check_constraints()
                from apps.billing.quotas import reconcile_storage
                reconcile_storage(job.organization_id)
                (root / "journal.tmp").write_text(dumps(journal), encoding="utf-8")
                os.chmod(root / "journal.tmp", 0o600); os.replace(root / "journal.tmp", root / "journal.json")
                job.journal_sha256, job.before_sha256 = sha256_file(root / "journal.json"), backup_hash
                after, _ = snapshot(job, root, "after.zip")
                job.applied_digest = after.fingerprint()
                job.status = "applied"
            elif job.operation == "rollback":
                current, _ = snapshot(job, root, "rollback-preview.zip")
                if current.fingerprint() != job.applied_digest:
                    fail("rollback_conflict")
                if sha256_file(root / "journal.json") != job.journal_sha256 or sha256_file(root / "before.zip") != job.before_sha256:
                    fail("integrity")
                journal = json.loads((root / "journal.json").read_text(encoding="utf-8"))
                before = Package(root / "before.zip", job.before_sha256, job.organization_id)
                undo(journal)
                restore_backup_files(before, job, files)
                connection.check_constraints()
                from apps.billing.quotas import reconcile_storage
                reconcile_storage(job.organization_id)
                restored, _ = snapshot(job, root, "rolled-back.zip")
                before = Package(root / "before.zip", job.before_sha256, job.organization_id)
                if restored.fingerprint() != before.fingerprint():
                    fail("integrity")
                job.status = "rolled_back"
                transaction.on_commit(lambda: cleanup_files(journal["files"]), robust=True)
            else:
                fail()
            if job.lease_until <= timezone.now() or not fresh_permission(job.authorized_by_id or job.requested_by_id):
                fail("permission_revoked")
            job.progress, job.completed_at, job.error_code = 100, timezone.now(), ""
            job.save(); audit(job, job.status)
    except Exception as exc:
        # The atomic block rolled back every domain row and M2M relation.
        with transaction.atomic():
            current = OrganizationRecovery.objects.select_for_update().get(pk=job_id)
            if current.status != "running" or current.lease_token != token:
                return
            cleanup_files(files)
            if current.status == "running" and current.lease_token == token:
                current.status = "applied" if current.operation == "rollback" else "ready" if current.isolated_organization_id else "failed"
                code = exc.code if isinstance(exc, ExportFailure) else "failed"
                current.error_code = code if code in ERRORS else "failed"
                current.completed_at = timezone.now()
                current.save(); audit(current, "failed")


def maintain_recoveries():
    for job_id in OrganizationRecovery.objects.filter(status="running", lease_until__lt=timezone.now()).values_list("pk", flat=True).iterator(chunk_size=100):
        with transaction.atomic():
            job = OrganizationRecovery.objects.select_for_update().get(pk=job_id)
            if job.status == "running" and job.lease_until < timezone.now():
                job.status = "applied" if job.operation == "rollback" else "ready" if job.isolated_organization_id else "failed"
                job.error_code, job.completed_at = "interrupted", timezone.now()
                job.save(); audit(job, "interrupted")
    from .importer import cleanup_orphans
    for job_id in OrganizationRecovery.objects.exclude(status__in=["queued", "running"]).values_list("pk", flat=True).iterator(chunk_size=100):
        with transaction.atomic():
            current = OrganizationRecovery.objects.select_for_update().get(pk=job_id)
            if current.status not in {"queued", "running"}:
                cleanup_orphans(job_id)
    from ..tasks import process_organization_recovery
    for job_id in OrganizationRecovery.objects.filter(status="queued").values_list("pk", flat=True).iterator(chunk_size=100):
        process_organization_recovery.delay(str(job_id))
