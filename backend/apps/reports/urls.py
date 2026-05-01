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
    
    # Stock Reports
    path("reports/stock/general/", views.stock_general_report, name="stock-general-report"),
    path("reports/stock/movement/", views.stock_movement_report, name="stock-movement-report"),
    path("reports/stock/low/", views.stock_low_report, name="stock-low-report"),
    path("reports/stock/expiry/", views.stock_expiry_report, name="stock-expiry-report"),
    
    # Finance Reports
    path("reports/finance/cashflow/", views.finance_cashflow_report, name="finance-cashflow-report"),
    
    # Livestock Reports
    path("reports/livestock/inventory/", views.livestock_inventory_report, name="livestock-inventory-report"),
]