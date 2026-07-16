from django.contrib import admin

from .models import Farm, FarmAsset, FarmAssetImplement, FarmStructure, FarmStructureItem, Sector


admin.site.register(Farm)
admin.site.register(Sector)
admin.site.register(FarmStructure)
admin.site.register(FarmStructureItem)
admin.site.register(FarmAsset)
admin.site.register(FarmAssetImplement)
