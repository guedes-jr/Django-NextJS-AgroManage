from django.apps import AppConfig


class BillingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.billing"
    verbose_name = "Planos e Assinaturas"

    def ready(self):
        from . import signals  # noqa: F401
