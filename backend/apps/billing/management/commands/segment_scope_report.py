"""Read-only report: what each organization stops seeing because a segment is not active.

    python manage.py segment_scope_report [--organization <slug>]

Rows of segments the organization does not have active (removed, or never contracted) are hidden
from the organization's screens, dashboards and alerts (apps/billing/segment_lifecycle.py). This
command changes nothing; run it before deploying to know how dashboards and inventory totals of
existing organizations will change. Finance launches are only archived by an explicit removal,
so launches tagged with a never-contracted segment are listed but stay visible.
"""
from django.core.management.base import BaseCommand
from django.db.models import Count, Sum

from apps.billing import segments as catalog
from apps.organizations.models import Organization


class Command(BaseCommand):
    help = "List rows hidden from each organization by inactive segments (nothing is changed)."

    def add_arguments(self, parser):
        parser.add_argument("--organization", help="Only this organization slug.")

    def handle(self, *args, **options):
        from apps.finance.models import Transaction
        from apps.inventory.models import ItemEstoque
        from apps.livestock.models import AnimalBatch
        from common.operator_access import organization_scoped_queryset

        organizations = Organization.objects.order_by("name")
        if options["organization"]:
            organizations = organizations.filter(slug=options["organization"])
        affected = 0
        for organization in organizations:
            inactive = catalog.inactive_segments(organization)
            if not inactive:
                continue
            batches = AnimalBatch.objects.filter(farm__organization=organization)
            hidden_batches = batches.count() - organization_scoped_queryset(batches, organization).count()
            items = ItemEstoque.objects.filter(organization=organization, segmento__in=catalog.stored_codes(inactive))
            finance = Transaction.objects.filter(organization=organization, segmento__in=catalog.stored_codes(inactive)).aggregate(count=Count("id"), total=Sum("amount"))
            archived = Transaction.all_objects.filter(organization=organization, archived_at__isnull=False).count()
            if not (hidden_batches or items.exists() or finance["count"] or archived):
                continue
            affected += 1
            names = ", ".join(catalog.BY_CODE[code].name for code in sorted(inactive))
            self.stdout.write(f"- {organization.name} ({organization.slug}) · inativos: {names}")
            self.stdout.write(f"    lotes ocultos: {hidden_batches} · itens de estoque ocultos: {items.count()}")
            self.stdout.write(f"    lançamentos visíveis marcados com segmento inativo: {finance['count']} (R$ {finance['total'] or 0}) · já arquivados: {archived}")
        self.stdout.write(f"Organizações afetadas: {affected}. Nada foi alterado.")
