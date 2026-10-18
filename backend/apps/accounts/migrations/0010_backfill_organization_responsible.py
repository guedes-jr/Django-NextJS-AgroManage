from django.db import migrations, models


def backfill_responsible(apps, schema_editor):
    alias = schema_editor.connection.alias
    Organization = apps.get_model("organizations", "Organization")
    User = apps.get_model("accounts", "User")
    AuditLog = apps.get_model("platform_admin", "PlatformAuditLog")
    for organization in Organization.objects.using(alias).all().iterator(chunk_size=500):
        members = User.objects.using(alias).filter(organization_id=organization.pk)
        previous_ids = list(members.filter(organization_responsible=True).order_by("created_at", "id").values_list("pk", flat=True))
        eligible = members.filter(role="admin", platform_staff_profile__isnull=True).exclude(affiliate_profile__portal_access_only=True)
        # Preserve existing designations, preferring active accounts among duplicates.
        chosen = eligible.filter(organization_responsible=True).order_by("-is_active", "created_at", "id").first()
        source = "existing_responsible"
        if not chosen:
            chosen = eligible.filter(is_active=True).order_by("created_at", "id").first()
            source = "oldest_active_administrator" if chosen else "no_eligible_administrator"
        if chosen and previous_ids == [chosen.pk]:
            continue
        members.filter(organization_responsible=True).update(organization_responsible=False)
        if chosen:
            members.filter(pk=chosen.pk).update(organization_responsible=True)
        AuditLog.objects.using(alias).create(
            organization_id=organization.pk, action="organization.responsible_migrated",
            object_type="Organization", object_id=str(organization.pk),
            description="Responsável reconciliado a partir do cadastro anterior." if chosen else "Organização sem administrador elegível; requer definição do responsável.",
            extra_data={
                "previous_responsible_ids": [str(pk) for pk in previous_ids],
                "responsible_id": str(chosen.pk) if chosen else None,
                "selection": source,
            },
        )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0009_organizationadministratorinvitation"), ("affiliates", "0004_affiliateprofile_portal_access_only")]

    operations = [
        migrations.AddField(
            model_name="organizationadministratorinvitation", name="revoked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_responsible, migrations.RunPython.noop),
    ]
