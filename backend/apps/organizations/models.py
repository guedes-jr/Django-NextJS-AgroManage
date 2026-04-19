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
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Organization"
        verbose_name_plural = "Organizations"

    def __str__(self) -> str:
        return self.name
