"""
Crops domain models — fields, planting cycles, harvests.
"""
from common.models import BaseModel
from django.db import models


class Field(BaseModel):
    """An agricultural field where crops are planted."""

    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE, related_name="fields")
    sector = models.ForeignKey(
        "farms.Sector", on_delete=models.SET_NULL, null=True, blank=True, related_name="fields"
    )
    name = models.CharField(max_length=255)
    area_ha = models.DecimalField(max_digits=10, decimal_places=2)
    soil_type = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Field"
        verbose_name_plural = "Fields"

    def __str__(self) -> str:
        return f"{self.farm.name} › {self.name}"


class PlantingCycle(BaseModel):
    """A crop planting cycle within a field."""

    class Status(models.TextChoices):
        PLANNED = "planned", "Planned"
        PLANTING = "planting", "Planting"
        GROWING = "growing", "Growing"
        HARVESTING = "harvesting", "Harvesting"
        FINISHED = "finished", "Finished"

    field = models.ForeignKey(Field, on_delete=models.CASCADE, related_name="planting_cycles")
    crop_name = models.CharField(max_length=100, help_text="e.g. Soja, Milho, Cana-de-açúcar")
    variety = models.CharField(max_length=100, blank=True)
    planting_date = models.DateField()
    expected_harvest_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNED)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Planting Cycle"
        verbose_name_plural = "Planting Cycles"

    def __str__(self) -> str:
        return f"{self.crop_name} @ {self.field} ({self.planting_date})"


class Harvest(BaseModel):
    """Harvest event for a planting cycle."""

    planting_cycle = models.ForeignKey(PlantingCycle, on_delete=models.CASCADE, related_name="harvests")
    harvest_date = models.DateField()
    yield_kg = models.DecimalField(max_digits=14, decimal_places=2)
    yield_per_ha_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    quality_grade = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Harvest"
        verbose_name_plural = "Harvests"

    def __str__(self) -> str:
        return f"Harvest {self.harvest_date} — {self.yield_kg} kg"
