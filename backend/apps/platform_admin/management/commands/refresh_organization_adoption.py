from django.core.management.base import BaseCommand
from apps.organizations.models import Organization
from apps.platform_admin.adoption import aggregate_organization


class Command(BaseCommand):
    help = "Refresh customer adoption snapshots without inferring historical activity."

    def handle(self, *args, **options):
        for organization_id in Organization.objects.values_list("pk", flat=True).iterator(chunk_size=200):
            aggregate_organization(organization_id)
        self.stdout.write(self.style.SUCCESS("Indicadores de adoção atualizados."))
