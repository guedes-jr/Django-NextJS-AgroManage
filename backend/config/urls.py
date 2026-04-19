"""
AgroManage URL Configuration.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)

# ---------------------------------------------------------------------------
# API v1 routes
# ---------------------------------------------------------------------------
api_v1_patterns = [
    path("auth/", include("apps.accounts.urls")),
    path("organizations/", include("apps.organizations.urls")),
    path("farms/", include("apps.farms.urls")),
    path("livestock/", include("apps.livestock.urls")),
    path("crops/", include("apps.crops.urls")),
    path("inventory/", include("apps.inventory.urls")),
    path("finance/", include("apps.finance.urls")),
    path("reports/", include("apps.reports.urls")),
    path("tasks/", include("apps.tasks.urls")),
    path("audit/", include("apps.audit.urls")),
]

# ---------------------------------------------------------------------------
# Root patterns
# ---------------------------------------------------------------------------
urlpatterns = [
    path("admin/", admin.site.urls),
    # API v1
    path("api/v1/", include(api_v1_patterns)),
    # OpenAPI schema
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/schema/swagger/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/schema/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
