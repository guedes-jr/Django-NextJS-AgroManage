from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.ai_assistant.models import AIModel, AIModelSyncRun, AIProviderConfiguration
from apps.ai_assistant.services.provider_factory import PROVIDER_FACTORIES


class Command(BaseCommand):
    help = "Verifica se o Assistente IA está pronto para operar com o catálogo configurado."

    def add_arguments(self, parser):
        parser.add_argument(
            "--strict", action="store_true",
            help="Retorna erro quando qualquer requisito obrigatório não estiver pronto.",
        )

    def handle(self, *args, **options):
        checks = []

        def check(name, ok, detail):
            checks.append((name, bool(ok), detail))
            marker = self.style.SUCCESS("OK") if ok else self.style.ERROR("FALHA")
            self.stdout.write(f"[{marker}] {name}: {detail}")

        default_provider = settings.AI_DEFAULT_PROVIDER
        check(
            "Provedor padrão",
            default_provider in PROVIDER_FACTORIES,
            default_provider,
        )
        credential_ok = (
            bool(settings.OPENCODE_ZEN_API_KEY)
            if default_provider == "opencode_zen"
            else bool(settings.OPENAI_API_KEY)
        )
        check("Credencial", credential_ok, "configurada" if credential_ok else "ausente")

        provider = AIProviderConfiguration.objects.filter(
            provider=default_provider, is_enabled=True
        ).first()
        check("Configuração no catálogo", provider is not None, "habilitada" if provider else "ausente")
        usable_free = AIModel.objects.filter(
            provider__is_enabled=True, is_free=True, is_available=True, is_enabled=True
        ).count()
        check("Modelos gratuitos utilizáveis", usable_free > 0, str(usable_free))
        primary = AIModel.objects.filter(
            provider__is_enabled=True, is_primary=True, is_available=True, is_enabled=True
        ).first()
        check("Modelo principal", primary is not None, primary.external_id if primary else "ausente")

        last_success = AIModelSyncRun.objects.filter(
            status=AIModelSyncRun.Status.SUCCESS
        ).order_by("-finished_at").first()
        stale_limit = timezone.now() - timedelta(days=settings.AI_MODEL_CATALOG_STALE_DAYS)
        sync_ok = bool(
            last_success and last_success.finished_at and last_success.finished_at >= stale_limit
        )
        check(
            "Sincronização recente",
            sync_ok,
            timezone.localtime(last_success.finished_at).isoformat()
            if last_success and last_success.finished_at else "nunca executada",
        )

        failures = [name for name, ok, _ in checks if not ok]
        if failures and options["strict"]:
            raise CommandError("Assistente IA não está pronto: " + ", ".join(failures))
        if failures:
            self.stdout.write(self.style.WARNING(f"Prontidão parcial: {len(failures)} pendência(s)."))
        else:
            self.stdout.write(self.style.SUCCESS("Assistente IA pronto para operação."))
