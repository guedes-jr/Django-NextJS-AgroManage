"""
Inventory domain models — items, stock movements, suppliers.
"""
from common.models import BaseModel
from django.db import models


class Supplier(BaseModel):
    """External supplier of goods or services."""

    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.CASCADE, related_name="suppliers"
    )
    name = models.CharField(max_length=255)
    document = models.CharField(max_length=20, blank=True, help_text="CNPJ or CPF")
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Supplier"
        verbose_name_plural = "Suppliers"

    def __str__(self) -> str:
        return self.name


class InventoryItem(BaseModel):
    """A product or input tracked in inventory."""

    class Category(models.TextChoices):
        FEED = "feed", "Feed / Ração"
        VACCINE = "vaccine", "Vaccine / Vacina"
        MEDICINE = "medicine", "Medicine / Medicamento"
        FERTILIZER = "fertilizer", "Fertilizer / Fertilizante"
        PESTICIDE = "pesticide", "Pesticide / Defensivo"
        FUEL = "fuel", "Fuel / Combustível"
        EQUIPMENT = "equipment", "Equipment / Equipamento"
        OTHER = "other", "Other"

    organization = models.ForeignKey(
        "organizations.Organization", on_delete=models.CASCADE, related_name="inventory_items"
    )
    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=100, blank=True, db_index=True)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    unit = models.CharField(max_length=20, help_text="kg, L, un, sc, etc.")
    current_stock = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    min_stock = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Inventory Item"
        verbose_name_plural = "Inventory Items"

    def __str__(self) -> str:
        return f"{self.name} ({self.unit})"

    @property
    def is_below_minimum(self) -> bool:
        return self.current_stock < self.min_stock


class StockMovement(BaseModel):
    """Records every stock in/out movement for audit and balance."""

    class MovementType(models.TextChoices):
        IN = "in", "Entry"
        OUT = "out", "Exit"
        ADJUSTMENT = "adjustment", "Adjustment"
        TRANSFER = "transfer", "Transfer"

    item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name="movements")
    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE, related_name="stock_movements")
    movement_type = models.CharField(max_length=20, choices=MovementType.choices)
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    date = models.DateField()
    reference = models.CharField(max_length=100, blank=True, help_text="NF, order number, etc.")
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, related_name="stock_movements"
    )

    class Meta(BaseModel.Meta):
        verbose_name = "Stock Movement"
        verbose_name_plural = "Stock Movements"

    def __str__(self) -> str:
        return f"{self.movement_type} {self.quantity} × {self.item} — {self.date}"
