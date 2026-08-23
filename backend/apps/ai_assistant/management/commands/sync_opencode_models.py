from django.core.management.base import BaseCommand, CommandError

from apps.ai_assistant.services.model_catalog import sync_opencode_zen_models
from apps.ai_assistant.services.providers import AIProviderError


class Command(BaseCommand):
    help = "Consulta o OpenCode Zen e atualiza o catálogo local de modelos."

    def handle(self, *args, **options):
        try:
            result = sync_opencode_zen_models()
        except AIProviderError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(
            self.style.SUCCESS(
                "Sincronização concluída: "
                f"{result.models_found} modelos, {result.free_models_found} gratuitos, "
                f"{result.models_created} novos e {result.models_unavailable} indisponíveis."
            )
        )
