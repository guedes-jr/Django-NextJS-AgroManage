# Generated for the initial AgroManage platform backoffice foundation.

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("organizations", "0002_organizationaddress_organizationcontact"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformStaffProfile",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "role",
                    models.CharField(
                        choices=[
                            ("platform_owner", "Proprietário da plataforma"),
                            ("platform_admin", "Administrador da plataforma"),
                            ("platform_finance", "Financeiro da plataforma"),
                            ("platform_support", "Suporte da plataforma"),
                            ("platform_developer", "Desenvolvedor da plataforma"),
                            ("platform_auditor", "Auditor da plataforma"),
                        ],
                        max_length=30,
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("mfa_required", models.BooleanField(default=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="platform_staff_profile",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Perfil da equipe da plataforma",
                "verbose_name_plural": "Perfis da equipe da plataforma",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="PlatformAuditLog",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("action", models.CharField(db_index=True, max_length=100)),
                ("object_type", models.CharField(blank=True, max_length=100)),
                ("object_id", models.CharField(blank=True, max_length=100)),
                ("description", models.TextField(blank=True)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.CharField(blank=True, max_length=512)),
                ("request_id", models.CharField(blank=True, db_index=True, max_length=100)),
                ("extra_data", models.JSONField(blank=True, default=dict)),
                (
                    "actor",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="platform_audit_logs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="platform_audit_logs",
                        to="organizations.organization",
                    ),
                ),
            ],
            options={
                "verbose_name": "Auditoria da plataforma",
                "verbose_name_plural": "Auditorias da plataforma",
                "ordering": ["-created_at"],
            },
        ),
    ]
