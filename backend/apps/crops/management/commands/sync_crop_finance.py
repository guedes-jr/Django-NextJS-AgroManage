"""Realign the finance expenses of crop operations with the operation records.

Usage:
    python manage.py sync_crop_finance --dry-run          # report only
    python manage.py sync_crop_finance                    # all organizations
    python manage.py sync_crop_finance --organization <slug>
"""
from django.core.management.base import BaseCommand, CommandError

from apps.crops.finance_sync import resync_organization
from apps.organizations.models import Organization


class Command(BaseCommand):
    help = "Recalcula as despesas financeiras das operações de plantação (inclui lançamentos antigos)."

    def add_arguments(self, parser):
        parser.add_argument("--organization", help="Slug da organização (padrão: todas).")
        parser.add_argument("--dry-run", action="store_true", help="Só mostra o que mudaria.")

    def handle(self, *args, **options):
        organizations = Organization.objects.all()
        if options["organization"]:
            organizations = organizations.filter(slug=options["organization"])
            if not organizations.exists():
                raise CommandError("Organização não encontrada.")
        totals = {}
        for organization in organizations:
            report = resync_organization(organization, dry_run=options["dry_run"])
            for key, value in report.items():
                totals[key] = totals.get(key, 0) + value
            if any(report[key] for key in ("created", "updated", "removed", "orphans_cancelled")):
                self.stdout.write(f"{organization.slug}: {report}")
        prefix = "[simulação] " if options["dry_run"] else ""
        self.stdout.write(self.style.SUCCESS(f"{prefix}Total: {totals}"))
