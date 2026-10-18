"""
Organizations domain models.
"""
from common.models import BaseModel
from django.db import models
from django.utils import timezone


class Organization(BaseModel):
    """
    Top-level tenant entity. All farms, users and data belong to an organization.
    Supports future multi-tenancy.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Ativa"
        SUSPENDED = "suspended", "Suspensa"
        ARCHIVED = "archived", "Arquivada"

    class Plan(models.TextChoices):
        FREE = "free", "Free"
        STARTER = "starter", "Starter"
        PRO = "pro", "Pro"
        ENTERPRISE = "enterprise", "Enterprise"

    name = models.CharField(max_length=255, db_index=True)
    slug = models.SlugField(unique=True, max_length=100)
    document = models.CharField(max_length=20, blank=True, help_text="CNPJ or CPF")
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.FREE)
    is_active = models.BooleanField(default=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    status_reason = models.CharField(max_length=1000, blank=True)
    status_changed_at = models.DateTimeField(default=timezone.now)
    recovery_isolated = models.BooleanField(default=False, db_default=False, editable=False, db_index=True)
    logo = models.ImageField(upload_to="org_logos/", null=True, blank=True)
    # Direct fields are kept for backward compatibility or as "primary" values
    # but we will transition to the new tables
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Organization"
        verbose_name_plural = "Organizations"
        constraints = [
            models.CheckConstraint(condition=models.Q(recovery_isolated=False) | models.Q(is_active=False), name="isolated_organization_inactive"),
            models.CheckConstraint(
                condition=(
                    models.Q(status="active", is_active=True)
                    | models.Q(status__in=["suspended", "archived"], is_active=False)
                ),
                name="organization_status_matches_active",
            ),
        ]

    def save(self, *args, **kwargs):
        fields = kwargs.get("update_fields")
        if fields is None or {"status", "is_active"}.intersection(fields):
            previous = None
            if not self._state.adding:
                previous = (
                    type(self).objects.using(kwargs.get("using") or self._state.db)
                    .filter(pk=self.pk).values("status", "is_active").first()
                )
            # Preserve legacy saves of is_active; explicit status changes take precedence.
            legacy_update = fields is not None and "is_active" in fields and "status" not in fields
            legacy_full_save = (
                fields is None and previous and self.status == previous["status"]
                and self.is_active != previous["is_active"]
            )
            if previous and (legacy_update or legacy_full_save):
                self.status = self.Status.ACTIVE if self.is_active else (
                    self.Status.ARCHIVED if previous["status"] == self.Status.ARCHIVED else self.Status.SUSPENDED
                )
            elif self._state.adding and self.status == self.Status.ACTIVE and not self.is_active:
                self.status = self.Status.SUSPENDED
            self.is_active = self.status == self.Status.ACTIVE
            if previous and previous["status"] != self.status:
                self.status_changed_at = timezone.now()
            if fields is not None:
                kwargs["update_fields"] = set(fields) | {"status", "is_active", "status_changed_at"}
        return super().save(*args, **kwargs)

    @property
    def access_denied_message(self):
        return f"Organização {self.get_status_display().lower()}. Entre em contato com o suporte."

    def __str__(self) -> str:
        return self.name


class OrganizationAddress(BaseModel):
    """Multiple addresses for an organization."""
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="addresses"
    )
    label = models.CharField(max_length=100, default="Principal", help_text="Ex: Sede, Filial, Depósito")
    postal_code = models.CharField(max_length=20, blank=True)
    street = models.CharField(max_length=255)
    number = models.CharField(max_length=20, blank=True)
    complement = models.CharField(max_length=255, blank=True)
    neighborhood = models.CharField(max_length=100, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=2)
    is_main = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        verbose_name = "Endereço da Organização"
        verbose_name_plural = "Endereços da Organização"

    def __str__(self) -> str:
        return f"{self.street}, {self.number} - {self.city}/{self.state}"


class OrganizationContact(BaseModel):
    """Multiple contacts for an organization."""
    class ContactType(models.TextChoices):
        PHONE = "phone", "Telefone"
        EMAIL = "email", "Email"
        WHATSAPP = "whatsapp", "WhatsApp"
        OTHER = "other", "Outro"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="contacts"
    )
    name = models.CharField(max_length=150, help_text="Nome do responsável ou setor")
    contact_type = models.CharField(
        max_length=20, choices=ContactType.choices, default=ContactType.PHONE
    )
    value = models.CharField(max_length=255, help_text="Número ou email")
    is_main = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        verbose_name = "Contato da Organização"
        verbose_name_plural = "Contatos da Organização"

    def __str__(self) -> str:
        return f"{self.name} ({self.get_contact_type_display()}: {self.value})"

