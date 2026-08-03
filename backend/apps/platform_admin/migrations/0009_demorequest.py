import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0008_supportaccessgrant_ticket_reference"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name="DemoRequest",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=150)),
                ("email", models.EmailField(db_index=True, max_length=254)),
                ("phone", models.CharField(max_length=30)),
                ("organization_name", models.CharField(max_length=180)),
                ("operation_profile", models.CharField(max_length=80)),
                ("message", models.TextField()),
                ("status", models.CharField(choices=[("pending", "Pendente"), ("approved", "Aprovada"), ("rejected", "Rejeitada")], db_index=True, default="pending", max_length=20)),
                ("decided_at", models.DateTimeField(blank=True, null=True)),
                ("decision_notes", models.TextField(blank=True)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.CharField(blank=True, max_length=512)),
                ("decided_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="decided_demo_requests", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-created_at",), "abstract": False},
        ),
    ]
