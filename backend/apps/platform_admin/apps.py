from django.apps import AppConfig


class PlatformAdminConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.platform_admin"
    verbose_name = "Administração da Plataforma"

    def ready(self):
        from . import task_signals  # noqa: F401
