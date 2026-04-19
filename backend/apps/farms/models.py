"""
Farms domain models.
"""
from common.models import BaseModel
from django.db import models


class Farm(BaseModel):
    """A physical farm property belonging to an organization."""

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="farms",
    )
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, blank=True, help_text="Internal farm code / CAR")
    total_area_ha = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    state = models.CharField(max_length=2, blank=True, help_text="BR state abbreviation")
    city = models.CharField(max_length=100, blank=True)
    address = models.TextField(blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Farm"
        verbose_name_plural = "Farms"
        unique_together = [["organization", "name"]]

    def __str__(self) -> str:
        return f"{self.name} ({self.organization})"


class Sector(BaseModel):
    """A named area or paddock within a farm (e.g. pasture, paddock, greenhouse)."""

    class SectorType(models.TextChoices):
        PASTURE = "pasture", "Pasture"
        PADDOCK = "paddock", "Paddock"
        GREENHOUSE = "greenhouse", "Greenhouse"
        FIELD = "field", "Field"
        BUILDING = "building", "Building"
        OTHER = "other", "Other"

    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name="sectors")
    name = models.CharField(max_length=255)
    sector_type = models.CharField(max_length=20, choices=SectorType.choices, default=SectorType.OTHER)
    area_ha = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Sector"
        verbose_name_plural = "Sectors"

    def __str__(self) -> str:
        return f"{self.farm.name} › {self.name}"
