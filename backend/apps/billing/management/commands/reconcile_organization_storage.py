from uuid import UUID
from django.core.management.base import BaseCommand
from apps.organizations.models import Organization
from apps.billing.quotas import reconcile_storage


class Command(BaseCommand):
    help = "Reconcilia as referências e tamanhos dos arquivos de organizações."

    def add_arguments(self, parser):
        parser.add_argument("--organization", type=UUID)

    def handle(self, *args, **options):
        organizations = Organization.objects.all()
        if options["organization"]:
            organizations = organizations.filter(pk=options["organization"])
        for organization in organizations.iterator(chunk_size=200):
            state = reconcile_storage(organization.pk)
            self.stdout.write(f"{organization.pk}: desconhecidos={state.unknown_files}, ausentes={state.missing_files}")
