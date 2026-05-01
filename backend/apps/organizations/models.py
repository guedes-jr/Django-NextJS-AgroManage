"""
Organizations domain models.
"""
from common.models import BaseModel
from django.db import models


class Organization(BaseModel):
    """
    Top-level tenant entity. All farms, users and data belong to an organization.
    Supports future multi-tenancy.
    """

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
    logo = models.ImageField(upload_to="org_logos/", null=True, blank=True)
    # Direct fields are kept for backward compatibility or as "primary" values
    # but we will transition to the new tables
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Organization"
        verbose_name_plural = "Organizations"

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

