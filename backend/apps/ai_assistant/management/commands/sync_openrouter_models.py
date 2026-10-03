from django.core.management.base import BaseCommand, CommandError

from apps.ai_assistant.services.model_catalog import sync_openrouter_models
from apps.ai_assistant.services.providers import AIProviderError


class Command(BaseCommand):
    help = "Consulta o OpenRouter e atualiza o catálogo local de modelos."

    def handle(self, *args, **options):
        try:
            result = sync_openrouter_models()
        except AIProviderError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(
            self.style.SUCCESS(
                f"Sincronização concluída: {result.models_found} modelos, "
                f"{result.free_models_found} gratuitos e {result.models_created} novos."
            )
        )
