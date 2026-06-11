from django.contrib import admin

from .models import Field, PlantingCycle, Planting, Fertilization, Fertigation, PesticideApplication, Irrigation, Harvest


@admin.register(Field)
class FieldAdmin(admin.ModelAdmin):
    list_display = ["name", "farm", "area_ha", "is_active"]
    list_filter = ["is_active", "soil_type"]
    search_fields = ["name", "farm__name"]


@admin.register(PlantingCycle)
class PlantingCycleAdmin(admin.ModelAdmin):
    list_display = ["crop_name", "field", "planting_date", "status"]
    list_filter = ["status", "crop_type"]
    search_fields = ["crop_name", "name", "field__name"]


@admin.register(Planting)
class PlantingAdmin(admin.ModelAdmin):
    list_display = ["plantation", "item", "planting_date", "total_price"]
    list_filter = ["planting_date"]


@admin.register(Fertilization)
class FertilizationAdmin(admin.ModelAdmin):
    list_display = ["plantation", "item", "application_date", "total_price"]
    list_filter = ["application_method", "application_date"]


@admin.register(Fertigation)
class FertigationAdmin(admin.ModelAdmin):
    list_display = ["plantation", "item", "application_date", "total_price"]
    list_filter = ["application_date"]


@admin.register(PesticideApplication)
class PesticideApplicationAdmin(admin.ModelAdmin):
    list_display = ["plantation", "item", "pesticide_type", "application_date", "total_price"]
    list_filter = ["pesticide_type", "application_date"]


@admin.register(Irrigation)
class IrrigationAdmin(admin.ModelAdmin):
    list_display = ["plantation", "date", "liters_used", "energy_kwh", "energy_cost"]
    list_filter = ["date"]


@admin.register(Harvest)
class HarvestAdmin(admin.ModelAdmin):
    list_display = ["planting_cycle", "harvest_date", "yield_kg"]
    list_filter = ["harvest_date"]
