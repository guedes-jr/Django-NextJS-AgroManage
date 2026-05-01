from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"configs", views.ReportConfigViewSet, basename="report-config")
router.register(r"schedules", views.ReportScheduleViewSet, basename="report-schedule")
router.register(r"generated", views.GeneratedReportViewSet, basename="generated-report")
router.register(r"widgets", views.ReportWidgetViewSet, basename="report-widget")

urlpatterns = [
    path("", include(router.urls)),
    path("dashboard/", views.dashboard_summary, name="dashboard-summary"),
    path("stock/general/", views.stock_general_report, name="stock-general-report"),
    path("stock/movement/", views.stock_movement_report, name="stock-movement-report"),
    path("stock/low/", views.stock_low_report, name="stock-low-report"),
    path("stock/expiry/", views.stock_expiry_report, name="stock-expiry-report"),
    path(
        "finance/cashflow/",
        views.finance_cashflow_report,
        name="finance-cashflow-report",
    ),
    path(
        "livestock/inventory/",
        views.livestock_inventory_report,
        name="livestock-inventory-report",
    ),
]
