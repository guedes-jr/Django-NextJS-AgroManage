from django.contrib import admin

from .models import VeterinaryAlert, VeterinaryAnimal, VeterinaryClient, VeterinaryProcedure, VeterinarySettings


@admin.register(VeterinaryClient)
class VeterinaryClientAdmin(admin.ModelAdmin):
    list_display = ("name", "farm_name", "organization", "created_at")
    search_fields = ("name", "farm_name")
    list_select_related = ("organization",)


@admin.register(VeterinaryAnimal)
class VeterinaryAnimalAdmin(admin.ModelAdmin):
    list_display = ("identifier", "name", "category", "client")
    search_fields = ("identifier", "name")
    list_select_related = ("client",)


@admin.register(VeterinaryProcedure)
class VeterinaryProcedureAdmin(admin.ModelAdmin):
    list_display = ("date", "animal", "kind", "result", "conduct", "value", "paid")
    list_filter = ("kind", "result", "paid")
    list_select_related = ("animal",)


admin.site.register(VeterinaryAlert)
admin.site.register(VeterinarySettings)
