"""
Livestock domain models — species, breeds, animals, batches.
Generic model supports cattle, swine, poultry, sheep and more.
"""
from common.models import BaseModel
from django.db import models


class Species(BaseModel):
    """Animal species (e.g. Bovino, Suíno, Aves, Ovino)."""

    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Species"
        verbose_name_plural = "Species"

    def __str__(self) -> str:
        return self.name


class Breed(BaseModel):
    """Breed within a species (e.g. Nelore, Landrace, Cobb)."""

    species = models.ForeignKey(Species, on_delete=models.CASCADE, related_name="breeds")
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Breed"
        verbose_name_plural = "Breeds"
        unique_together = [["species", "name"]]

    def __str__(self) -> str:
        return f"{self.species.name} — {self.name}"


class AnimalBatch(BaseModel):
    """
    A batch / lot of animals of the same species managed collectively.
    Used for poultry, swine lots, and cattle groups.
    """

    class Origin(models.TextChoices):
        PURCHASED = "purchased", "Comprado"
        BORN = "born", "Nascido"
        DONATED = "donated", "Doado"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SOLD = "sold", "Sold"
        FINISHED = "finished", "Finished"
        DEAD = "dead", "Dead"

    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE, related_name="animal_batches")
    sector = models.ForeignKey(
        "farms.Sector", on_delete=models.SET_NULL, null=True, blank=True, related_name="animal_batches"
    )
    species = models.ForeignKey(Species, on_delete=models.PROTECT, related_name="batches")
    breed = models.ForeignKey(Breed, on_delete=models.SET_NULL, null=True, blank=True)
    batch_code = models.CharField(max_length=50)
    quantity = models.PositiveIntegerField(default=0)
    entry_date = models.DateField()
    exit_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    origin = models.CharField(max_length=20, choices=Origin.choices, default=Origin.PURCHASED)
    purchase_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    sale_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    gender = models.CharField(max_length=20, null=True, blank=True)
    category = models.CharField(max_length=50, null=True, blank=True)
    name = models.CharField(max_length=100, null=True, blank=True)
    avg_weight_kg = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Animal Batch"
        verbose_name_plural = "Animal Batches"
        unique_together = [["farm", "batch_code"]]

    def __str__(self) -> str:
        return f"{self.batch_code} ({self.species}) @ {self.farm}"
