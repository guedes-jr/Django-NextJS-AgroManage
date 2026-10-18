from django.db import migrations
from django.db.models import F
from django.utils import timezone


TRANSITIONS = ("organization.activated", "organization.suspended", "organization.archived")


def backfill_status(apps, schema_editor):
    alias = schema_editor.connection.alias
    Organization = apps.get_model("organizations", "Organization")
    AuditLog = apps.get_model("platform_admin", "PlatformAuditLog")
    User = apps.get_model("accounts", "User")
    Grant = apps.get_model("platform_admin", "SupportAccessGrant")
    now = timezone.now()
    for organization in Organization.objects.using(alias).all().iterator(chunk_size=500):
        evidence = AuditLog.objects.using(alias).filter(
            organization_id=organization.pk, action__in=TRANSITIONS,
        ).order_by("-created_at", "-id").first()
        if organization.is_active:
            state = "active"
            changed_at = evidence.created_at if evidence and evidence.action == "organization.activated" else organization.created_at
        else:
            state = "archived" if evidence and evidence.action == "organization.archived" else "suspended"
            certain = evidence is not None and evidence.action in {"organization.archived", "organization.suspended"}
            changed_at = evidence.created_at if certain else organization.updated_at
            AuditLog.objects.using(alias).create(
                organization_id=organization.pk, action="organization.status_migrated",
                object_type="Organization", object_id=str(organization.pk),
                description="Estado migrado do cadastro anterior.",
                extra_data={"is_active": False, "status": state,
                            "evidence_id": str(evidence.pk) if evidence else None,
                            "inferred": not certain},
            )
            # Prevent previously issued tokens and grants from returning after reactivation.
            User.objects.using(alias).filter(organization_id=organization.pk).update(session_version=F("session_version") + 1)
            Grant.objects.using(alias).filter(organization_id=organization.pk, revoked_at__isnull=True).update(revoked_at=now)
        Organization.objects.using(alias).filter(pk=organization.pk).update(status=state, status_changed_at=changed_at)


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0003_organization_status_fields"),
        ("platform_admin", "0002_supportaccessgrant"),
        ("accounts", "0004_user_session_version"),
    ]

    operations = [migrations.RunPython(backfill_status, migrations.RunPython.noop)]
