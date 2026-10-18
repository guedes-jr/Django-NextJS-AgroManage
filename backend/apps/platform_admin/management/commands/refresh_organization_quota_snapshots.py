from django.core.management.base import BaseCommand
from apps.platform_admin.tasks import refresh_organization_quota_snapshots


class Command(BaseCommand):
    help = "Initialize or refresh quota indicators used by organization filters."

    def handle(self, *args, **options):
        result = refresh_organization_quota_snapshots()
        self.stdout.write(self.style.SUCCESS(f'{result["completed"]} indicadores de cotas atualizados.'))
