from django.contrib import admin
from .models import Holiday

@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ("name", "date", "organization", "source")
    list_filter = ("source", "date")
    search_fields = ("name", "organization__name")
