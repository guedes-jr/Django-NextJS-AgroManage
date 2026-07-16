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


class FarmStructure(BaseModel):
    """Physical infrastructure registered for a farm."""

    class Category(models.TextChoices):
        CORRAL = "corral", "Curral"
        PIGSTY = "pigsty", "Chiqueiro"
        POULTRY_HOUSE = "poultry_house", "Galinheiro"
        WAREHOUSE = "warehouse", "Depósitos e armazéns"
        IRRIGATION = "irrigation", "Irrigação"
        WATER_RESERVOIR = "water_reservoir", "Reservatórios e água"
        FACILITY = "facility", "Instalações"
        FENCE = "fence", "Cercas e divisões"
        OTHER = "other", "Outros"

    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name="structures")
    category = models.CharField(max_length=30, choices=Category.choices)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    built_area_m2 = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    length_m = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    width_m = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    acquisition_value = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    current_value = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    acquisition_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="farm_structures_created",
    )

    class Meta(BaseModel.Meta):
        verbose_name = "Farm structure"
        verbose_name_plural = "Farm structures"
        indexes = [models.Index(fields=["farm", "category", "is_active"])]

    def __str__(self) -> str:
        return f"{self.farm.name} › {self.name}"


class FarmStructureItem(BaseModel):
    structure = models.ForeignKey(FarmStructure, on_delete=models.CASCADE, related_name="items")
    name = models.CharField(max_length=150)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    unit = models.CharField(max_length=20, default="un")
    value = models.DecimalField(max_digits=16, decimal_places=2, default=0)

    class Meta(BaseModel.Meta):
        verbose_name = "Farm structure item"
        verbose_name_plural = "Farm structure items"

    @property
    def owner_id(self):
        return self.structure.created_by_id


class FarmAsset(BaseModel):
    """Agricultural machine or vehicle belonging to a farm."""

    class AssetType(models.TextChoices):
        TRACTOR = "tractor", "Trator"
        HARVESTER = "harvester", "Colheitadeira"
        PLANTER = "planter", "Plantadeira"
        SPRAYER = "sprayer", "Pulverizador"
        TRUCK = "truck", "Caminhão"
        PICKUP = "pickup", "Caminhonete"
        CAR = "car", "Automóvel"
        MOTORCYCLE = "motorcycle", "Motocicleta"
        OTHER = "other", "Outro"

    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name="agricultural_assets")
    asset_type = models.CharField(max_length=20, choices=AssetType.choices)
    brand = models.CharField(max_length=80)
    model = models.CharField(max_length=100)
    manufacture_year = models.PositiveIntegerField(null=True, blank=True)
    fuel = models.CharField(max_length=40, blank=True)
    traction = models.CharField(max_length=40, blank=True)
    current_hours = models.DecimalField(max_digits=12, decimal_places=1, null=True, blank=True)
    power = models.CharField(max_length=60, blank=True)
    tank_capacity_l = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    serial_number = models.CharField(max_length=100, blank=True)
    transmission = models.CharField(max_length=100, blank=True)
    acquisition_date = models.DateField(null=True, blank=True)
    acquisition_value = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    current_value = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    description = models.TextField(blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, related_name="farm_assets_created"
    )

    class Meta(BaseModel.Meta):
        verbose_name = "Agricultural machine or vehicle"
        verbose_name_plural = "Agricultural machines and vehicles"
        indexes = [models.Index(fields=["farm", "asset_type", "is_active"])]

    def __str__(self) -> str:
        return f"{self.get_asset_type_display()} — {self.brand} {self.model}"


class FarmAssetImplement(BaseModel):
    asset = models.ForeignKey(FarmAsset, on_delete=models.CASCADE, related_name="implements")
    name = models.CharField(max_length=120)
    brand_model = models.CharField(max_length=150, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    manufacture_year = models.PositiveIntegerField(null=True, blank=True)
    acquisition_value = models.DecimalField(max_digits=16, decimal_places=2, default=0)

    class Meta(BaseModel.Meta):
        verbose_name = "Agricultural implement"
        verbose_name_plural = "Agricultural implements"

    def __str__(self) -> str:
        return f"{self.name} ({self.asset})"

    @property
    def owner_id(self):
        return self.asset.created_by_id
