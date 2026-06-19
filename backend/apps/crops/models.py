"""
Crops domain models — fields, plantations, harvests.
"""
from decimal import Decimal

from common.models import BaseModel
from django.conf import settings
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

    # Optional future-use fields
    irrigation_type = models.CharField(max_length=50, blank=True, help_text="e.g. pivot, drip, flood")
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    estimated_yield_capacity_kg = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Field"
        verbose_name_plural = "Fields"

    def __str__(self) -> str:
        return f"{self.farm.name} › {self.name}"


class PlantingCycle(BaseModel):
    """
    Central entity — represents a plantation / crop cycle.

    Displayed as "Plantação" in the frontend.
    """

    class CropType(models.TextChoices):
        GRAIN = "grain", "Grão"
        FRUIT = "fruit", "Fruta"
        VEGETABLE = "vegetable", "Legume"
        FORAGE = "forage", "Forragem"
        FIBER = "fiber", "Fibra"
        OTHER = "other", "Outro"

    class Status(models.TextChoices):
        PLANNED = "planned", "Planejada"
        PLANTING = "planting", "Em plantio"
        GROWING = "growing", "Em desenvolvimento"
        MANAGEMENT = "management", "Em manejo"
        HARVESTING = "harvesting", "Em colheita"
        FINISHED = "finished", "Finalizada"
        CANCELLED = "cancelled", "Cancelada"

    # ── Organization / Ownership ──────────────────────────────────────────────
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="plantations",
    )
    farm = models.ForeignKey(
        "farms.Farm",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="plantations",
    )
    field = models.ForeignKey(Field, on_delete=models.CASCADE, related_name="planting_cycles")
    sector = models.ForeignKey(
        "farms.Sector",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="plantations",
    )

    # ── Identification ───────────────────────────────────────────────────────
    name = models.CharField(max_length=255, blank=True, help_text="Friendly name, e.g. Milho Safra 2025.2")
    crop_type = models.CharField(max_length=20, choices=CropType.choices, default=CropType.GRAIN)
    crop_name = models.CharField(max_length=100, help_text="e.g. Soja, Milho, Cana-de-açúcar")
    variety = models.CharField(max_length=100, blank=True)
    hybrid = models.CharField(max_length=100, blank=True)

    # ── Planting data ────────────────────────────────────────────────────────
    planted_area_ha = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    seed_quantity_used = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    population = models.PositiveIntegerField(null=True, blank=True, help_text="Plants per hectare")
    spacing = models.CharField(max_length=100, blank=True, help_text="e.g. 0.5m x 0.3m")

    planting_date = models.DateField()
    expected_harvest_date = models.DateField(null=True, blank=True)
    actual_harvest_date = models.DateField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNED)

    # ── Estimates ────────────────────────────────────────────────────────────
    estimated_production_kg = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    estimated_bags = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    estimated_revenue = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    # ── Responsible ──────────────────────────────────────────────────────────
    responsible_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="responsible_plantations",
    )

    # ── Notes ────────────────────────────────────────────────────────────────
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Plantação"
        verbose_name_plural = "Plantações"

    def __str__(self) -> str:
        return self.name or f"{self.crop_name} @ {self.field} ({self.planting_date})"

    @property
    def days_in_cultivation(self) -> int:
        """Days since planting until today or actual_harvest_date."""
        from django.utils import timezone
        end = self.actual_harvest_date or timezone.now().date()
        return (end - self.planting_date).days

    @property
    def days_remaining(self) -> int | None:
        """Days remaining until expected harvest."""
        if self.expected_harvest_date:
            from django.utils import timezone
            diff = (self.expected_harvest_date - timezone.now().date()).days
            return max(diff, 0)
        return None

    @property
    def investment_total(self) -> Decimal:
        """Sum of all financial transactions linked to this plantation."""
        total = self.finance_transactions.aggregate(total=models.Sum("amount"))["total"]
        return total or Decimal("0")


class Planting(BaseModel):
    """Seed / seedling planting operation for a plantation."""

    plantation = models.ForeignKey(
        PlantingCycle, on_delete=models.CASCADE, related_name="plantings"
    )
    item = models.ForeignKey(
        "inventory.ItemEstoque", on_delete=models.PROTECT,
        related_name="crop_plantings",
    )
    supplier = models.ForeignKey(
        "inventory.Fornecedor", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="crop_plantings",
    )
    lot = models.ForeignKey(
        "inventory.LoteEstoque", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="crop_plantings",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit = models.CharField(max_length=20, blank=True)
    quantity_per_ha = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    total_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    population = models.PositiveIntegerField(null=True, blank=True, help_text="Plants per hectare")
    spacing = models.CharField(max_length=100, blank=True)
    depth = models.CharField(max_length=50, blank=True, help_text="Planting depth")
    planting_date = models.DateField()
    operator = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Planting"
        verbose_name_plural = "Plantings"

    def __str__(self) -> str:
        return f"{self.plantation} — {self.item} @ {self.planting_date}"


class Fertilization(BaseModel):
    """Fertilizer / soil correction application."""

    class ApplicationMethod(models.TextChoices):
        BROADCAST = "broadcast", "Lanço"
        ROW = "row", "Sulco"
        FOLIAR = "foliar", "Foliar"
        SOIL_INJECTION = "soil_injection", "Injeção no solo"
        OTHER = "other", "Outro"

    plantation = models.ForeignKey(
        PlantingCycle, on_delete=models.CASCADE, related_name="fertilizations"
    )
    item = models.ForeignKey(
        "inventory.ItemEstoque", on_delete=models.PROTECT,
        related_name="crop_fertilizations",
    )
    supplier = models.ForeignKey(
        "inventory.Fornecedor", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="crop_fertilizations",
    )
    lot = models.ForeignKey(
        "inventory.LoteEstoque", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="crop_fertilizations",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit = models.CharField(max_length=20, blank=True)
    dose_per_ha = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    total_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    application_method = models.CharField(
        max_length=30, choices=ApplicationMethod.choices, default=ApplicationMethod.BROADCAST,
    )
    area_applied_ha = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    application_date = models.DateField()
    operator = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Fertilization"
        verbose_name_plural = "Fertilizations"

    def __str__(self) -> str:
        return f"{self.plantation} — {self.item} @ {self.application_date}"


class Fertigation(BaseModel):
    """Fertigation — fertilizer application via irrigation system."""

    plantation = models.ForeignKey(
        PlantingCycle, on_delete=models.CASCADE, related_name="fertigations"
    )
    item = models.ForeignKey(
        "inventory.ItemEstoque", on_delete=models.PROTECT,
        related_name="crop_fertigations",
    )
    lot = models.ForeignKey(
        "inventory.LoteEstoque", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="crop_fertigations",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit = models.CharField(max_length=20, blank=True)
    syrup_liters = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Litros de calda")
    concentration = models.CharField(max_length=100, blank=True, help_text="Concentração / diluição")
    application_time_hours = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    area_applied_ha = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    total_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    application_date = models.DateField()
    operator = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Fertigation"
        verbose_name_plural = "Fertigations"

    def __str__(self) -> str:
        return f"{self.plantation} — {self.item} @ {self.application_date}"


class PesticideApplication(BaseModel):
    """Pesticide / agrochemical application."""

    class PesticideType(models.TextChoices):
        INSECTICIDE = "insecticide", "Inseticida"
        HERBICIDE = "herbicide", "Herbicida"
        FUNGICIDE = "fungicide", "Fungicida"
        ADJUVANT = "adjuvant", "Adjuvante"
        ACARICIDE = "acaricide", "Acaricida"
        BACTERICIDE = "bactericide", "Bactericida"
        OTHER = "other", "Outro"

    plantation = models.ForeignKey(
        PlantingCycle, on_delete=models.CASCADE, related_name="pesticide_applications"
    )
    item = models.ForeignKey(
        "inventory.ItemEstoque", on_delete=models.PROTECT,
        related_name="crop_pesticide_applications",
    )
    pesticide_type = models.CharField(
        max_length=30, choices=PesticideType.choices, default=PesticideType.OTHER,
    )
    active_ingredient = models.CharField(max_length=200, blank=True)
    dose = models.CharField(max_length=100, blank=True, help_text="e.g. 0.5 L/ha")
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit = models.CharField(max_length=20, blank=True)
    supplier = models.ForeignKey(
        "inventory.Fornecedor", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="crop_pesticide_applications",
    )
    lot = models.ForeignKey(
        "inventory.LoteEstoque", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="crop_pesticide_applications",
    )
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    total_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    area_applied_ha = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    application_date = models.DateField()
    operator = models.CharField(max_length=150, blank=True)
    target = models.CharField(max_length=200, blank=True, help_text="Alvo da aplicação (praga/doença)")
    equipment = models.CharField(max_length=150, blank=True)
    withholding_days = models.PositiveIntegerField(null=True, blank=True, help_text="Carência (dias)")
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Pesticide Application"
        verbose_name_plural = "Pesticide Applications"

    def __str__(self) -> str:
        return f"{self.plantation} — {self.item} ({self.pesticide_type}) @ {self.application_date}"


class IrrigationPump(BaseModel):
    """Reusable irrigation pump registered by the producer."""

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="irrigation_pumps",
    )
    name = models.CharField(max_length=255)
    power_cv = models.DecimalField(max_digits=8, decimal_places=2, help_text="Potência em CV")
    power_kw = models.DecimalField(max_digits=8, decimal_places=2, help_text="Potência convertida em kW")
    flow_rate_l_per_h = models.DecimalField(max_digits=12, decimal_places=2, help_text="Vazão em L/h")
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Bomba de Irrigação"
        verbose_name_plural = "Bombas de Irrigação"

    def __str__(self) -> str:
        return f"{self.name} ({self.power_cv} CV)"

    def save(self, *args, **kwargs):
        if self.power_cv:
            self.power_kw = (self.power_cv * Decimal("0.7355")).quantize(Decimal("0.01"))
        super().save(*args, **kwargs)


class Irrigation(BaseModel):
    """Irrigation event — water and energy consumption."""

    class IrrigationSystem(models.TextChoices):
        CENTER_PIVOT = "center_pivot", "Pivô central"
        DRIP = "drip", "Gotejamento"
        SPRINKLER = "sprinkler", "Aspersão"
        MICRO_SPRINKLER = "micro_sprinkler", "Microaspersão"
        HOSE = "hose", "Mangueira"
        OTHER = "other", "Outro"

    plantation = models.ForeignKey(
        PlantingCycle, on_delete=models.CASCADE, related_name="irrigations"
    )
    date = models.DateField(null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    irrigation_system = models.CharField(
        max_length=30, choices=IrrigationSystem.choices, blank=True
    )
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    pump_equipment = models.ForeignKey(
        IrrigationPump,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="irrigations",
    )
    pump = models.CharField(max_length=150, blank=True, help_text="Bomba utilizada")
    pump_power_kw = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    hours_per_day = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    operating_days = models.PositiveIntegerField(default=1)
    hours = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text="Tempo ligado (horas)")
    flow_rate_l_per_h = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Vazão (L/h)")
    liters_used = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, help_text="Litros utilizados (calculado)")
    energy_kwh = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Energia consumida kWh (calculado)")
    kwh_value = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True, help_text="Valor do kWh (R$)")
    energy_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True, help_text="Custo energético (R$, calculado)")
    operator = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Irrigation"
        verbose_name_plural = "Irrigations"

    def __str__(self) -> str:
        display_date = self.start_date or self.date
        return f"{self.plantation} — {display_date} ({self.liters_used or 0} L)"

    def save(self, *args, **kwargs):
        if self.start_date and not self.date:
            self.date = self.start_date
        if not self.start_date and self.date:
            self.start_date = self.date
        if not self.end_date:
            self.end_date = self.start_date or self.date

        if self.pump_equipment:
            self.pump = self.pump_equipment.name
            self.pump_power_kw = self.pump_equipment.power_kw
            self.flow_rate_l_per_h = self.pump_equipment.flow_rate_l_per_h

        days = 1
        if self.start_date and self.end_date:
            days = max((self.end_date - self.start_date).days + 1, 1)
        self.operating_days = days

        hours_val = Decimal("0")
        if self.hours_per_day:
            hours_val = self.hours_per_day * Decimal(days)
            self.hours = hours_val
        elif self.hours:
            hours_val = self.hours
        elif self.start_time and self.end_time:
            from datetime import datetime, timedelta
            start = datetime.combine(self.date, self.start_time)
            end = datetime.combine(self.date, self.end_time)
            if end <= start:
                end += timedelta(days=1)
            diff = Decimal(str((end - start).total_seconds() / 3600)).quantize(Decimal("0.01"))
            hours_val = diff
            self.hours = hours_val

        if self.flow_rate_l_per_h and hours_val:
            self.liters_used = (self.flow_rate_l_per_h * hours_val).quantize(Decimal("0.01"))
        if self.pump_power_kw and hours_val:
            self.energy_kwh = (self.pump_power_kw * hours_val).quantize(Decimal("0.01"))
        if self.energy_kwh and self.kwh_value:
            self.energy_cost = (self.energy_kwh * self.kwh_value).quantize(Decimal("0.01"))

        super().save(*args, **kwargs)


class SoilAnalysis(BaseModel):
    """Soil analysis file attached to a plantation/field."""

    plantation = models.ForeignKey(
        PlantingCycle, on_delete=models.CASCADE, related_name="soil_analyses"
    )
    field = models.ForeignKey(Field, on_delete=models.CASCADE, related_name="soil_analyses")
    file = models.FileField(upload_to="crops/soil_analyses/%Y/%m/")
    original_name = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="soil_analyses_uploaded",
    )
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Análise de Solo"
        verbose_name_plural = "Análises de Solo"

    def __str__(self) -> str:
        return self.original_name or f"Análise de solo - {self.field}"


class AgronomistRecommendation(BaseModel):
    """Technical recommendation made by an agronomist for a plantation."""

    class Priority(models.TextChoices):
        LOW = "low", "Baixa"
        MEDIUM = "medium", "Média"
        HIGH = "high", "Alta"

    class Status(models.TextChoices):
        PENDING = "pending", "Pendente"
        IN_PROGRESS = "in_progress", "Em execução"
        COMPLETED = "completed", "Concluída"

    plantation = models.ForeignKey(
        PlantingCycle, on_delete=models.CASCADE, related_name="agronomist_recommendations"
    )
    field = models.ForeignKey(Field, on_delete=models.CASCADE, related_name="agronomist_recommendations")
    title = models.CharField(max_length=255)
    objective = models.TextField(blank=True)
    recommendation_date = models.DateField()
    suggested_application_date = models.DateField(null=True, blank=True)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    area_ha = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agronomist_recommendations_created",
    )

    class Meta(BaseModel.Meta):
        verbose_name = "Recomendação do Agrônomo"
        verbose_name_plural = "Recomendações do Agrônomo"

    def __str__(self) -> str:
        return f"{self.title} - {self.plantation}"


class AgronomistRecommendationProduct(BaseModel):
    """Product line recommended by an agronomist."""

    recommendation = models.ForeignKey(
        AgronomistRecommendation, on_delete=models.CASCADE, related_name="products"
    )
    item = models.ForeignKey(
        "inventory.ItemEstoque",
        on_delete=models.PROTECT,
        related_name="agronomist_recommendation_products",
    )
    dose_per_ha = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    dose_unit = models.CharField(max_length=20, blank=True)
    total_quantity = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    total_unit = models.CharField(max_length=20, blank=True)
    notes = models.CharField(max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Produto Recomendado"
        verbose_name_plural = "Produtos Recomendados"

    def __str__(self) -> str:
        return f"{self.item} - {self.recommendation}"


class Harvest(BaseModel):
    """Harvest event for a planting cycle / plantation."""

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


class Tractor(BaseModel):
    """A tractor or machinery utilized in farming operations."""

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="tractors",
    )
    name = models.CharField(max_length=255)
    brand = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    power_cv = models.PositiveIntegerField(null=True, blank=True, help_text="Potência em CV")
    plate = models.CharField(max_length=50, blank=True, help_text="Placa ou identificação")

    class Meta(BaseModel.Meta):
        verbose_name = "Trator"
        verbose_name_plural = "Tratores"

    def __str__(self) -> str:
        if self.brand:
            return f"{self.name} ({self.brand})"
        return self.name


class LandPreparation(BaseModel):
    """Operation for land preparation / soil correction."""

    class OperationType(models.TextChoices):
        CALAGEM = "calagem", "Calagem"
        ARACAO = "aracao", "Aração"
        GRADAGEM = "gradagem", "Gradagem"
        SUBSOLAGEM = "subsolagem", "Subsolagem"
        NIVELAMENTO = "nivelamento", "Nivelamento"
        ROCAGEM = "rocagem", "Roçagem"
        OUTRO = "outro", "Outro"

    class ExecutionType(models.TextChoices):
        OWN = "own", "Equipamento próprio"
        RENTED = "rented", "Terceirizado"

    plantation = models.ForeignKey(
        PlantingCycle, on_delete=models.CASCADE, related_name="land_preparations"
    )
    date = models.DateField()
    operation_type = models.CharField(
        max_length=30, choices=OperationType.choices, default=OperationType.OUTRO
    )
    execution_type = models.CharField(
        max_length=20, choices=ExecutionType.choices, default=ExecutionType.OWN
    )
    tractor = models.ForeignKey(
        Tractor, on_delete=models.SET_NULL, null=True, blank=True, related_name="land_preparations"
    )
    hours_worked = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    hourly_rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    fuel_liters = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    fuel_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    operator = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Preparação de Terra"
        verbose_name_plural = "Preparações de Terra"

    def __str__(self) -> str:
        return f"{self.plantation} — {self.get_operation_type_display()} @ {self.date}"

    @property
    def total_price(self) -> Decimal:
        cost = Decimal("0")
        if self.execution_type == self.ExecutionType.OWN:
            if self.hours_worked and self.hourly_rate:
                cost += self.hours_worked * self.hourly_rate
            if self.fuel_liters and self.fuel_price:
                cost += self.fuel_liters * self.fuel_price
        return cost
