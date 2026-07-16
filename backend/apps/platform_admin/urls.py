from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("organizations", views.PlatformOrganizationViewSet, basename="platform-organization")
router.register("users", views.PlatformUserViewSet, basename="platform-user")
router.register("plans", views.PlatformPlanViewSet, basename="platform-plan")
router.register("features", views.PlatformFeatureViewSet, basename="platform-feature")
router.register("subscriptions", views.PlatformSubscriptionViewSet, basename="platform-subscription")
router.register("invoices", views.PlatformInvoiceViewSet, basename="platform-invoice")
router.register("payments", views.PlatformPaymentViewSet, basename="platform-payment")
router.register("support-access", views.PlatformSupportAccessViewSet, basename="platform-support-access")
router.register("task-runs", views.PlatformTaskRunViewSet, basename="platform-task-run")
router.register("feature-flags", views.PlatformFeatureFlagViewSet, basename="platform-feature-flag")
router.register("announcements", views.PlatformAnnouncementViewSet, basename="platform-announcement")
router.register("maintenance", views.PlatformMaintenanceViewSet, basename="platform-maintenance")
router.register("sql-history", views.PlatformSqlHistoryViewSet, basename="platform-sql-history")
router.register("sandbox-grants", views.DeveloperSandboxGrantViewSet, basename="platform-sandbox-grant")
router.register("sandbox-executions", views.SandboxExecutionViewSet, basename="platform-sandbox-execution")

urlpatterns = [
    path("me/", views.platform_me, name="platform-me"),
    path("client-state/", views.client_state, name="platform-client-state"),
    path("dashboard/", views.dashboard_summary, name="platform-dashboard"),
    path("finance/dashboard/", views.finance_dashboard, name="platform-finance-dashboard"),
    path("operations/health/", views.operations_health, name="platform-operations-health"),
    path("operations/sql/execute/", views.execute_sql_query, name="platform-sql-execute"),
    path("operations/sql/explain/", views.explain_sql_query, name="platform-sql-explain"),
    path("operations/approved-queries/", views.approved_queries, name="platform-approved-queries"),
    path("operations/sandbox/execute/", views.execute_sandbox_code, name="platform-sandbox-execute"),
    path("operations/sandbox/status/", views.sandbox_status, name="platform-sandbox-status"),
    path("", include(router.urls)),
]
