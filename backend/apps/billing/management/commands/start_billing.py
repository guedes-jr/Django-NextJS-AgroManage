"""Start recurring billing: set the first period end of subscriptions without one.

    python manage.py start_billing --date 2027-01-01 --dry-run
    python manage.py start_billing --date 2027-01-01 [--organization <slug>]

The first cycle invoice is issued BILLING_INVOICE_LEAD_DAYS before --date and charges the period
that starts on --date. The dry-run prints every invoice that would be issued, with its total and the
segments left out for being "sob consulta". Nothing is billed while BILLING_AUTO_INVOICING_ENABLED is off.
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.billing.models import Subscription
from apps.billing.recurring import BILLABLE, _aware, cycle_preview, enabled


class Command(BaseCommand):
    help = "Define the first billing date of subscriptions without a period (use --dry-run first)."

    def add_arguments(self, parser):
        parser.add_argument("--date", required=True, help="First period start (YYYY-MM-DD).")
        parser.add_argument("--organization", help="Only this organization slug.")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--reset", action="store_true", help="Also overwrite subscriptions that already have a period end.")

    def handle(self, *args, **options):
        try:
            start = date.fromisoformat(options["date"])
        except ValueError as exc:
            raise CommandError("Use --date AAAA-MM-DD.") from exc
        queryset = Subscription.objects.filter(status__in=BILLABLE).select_related("organization").order_by("organization__name")
        if not options["reset"]:
            queryset = queryset.filter(current_period_ends_at__isnull=True)
        if options["organization"]:
            queryset = queryset.filter(organization__slug=options["organization"])
        total = 0
        with transaction.atomic():
            for subscription in queryset:
                subscription.current_period_ends_at = _aware(start)
                preview = cycle_preview(subscription)
                if preview is None:
                    self.stdout.write(f"- {subscription.organization.name}: ciclo {subscription.billing_cycle} não é faturado automaticamente")
                    continue
                total += preview["total"]
                unpriced = f" | sob consulta (fora): {', '.join(preview['unpriced'])}" if preview["unpriced"] else ""
                self.stdout.write(f"- {subscription.organization.name}: {preview['number']} R$ {preview['total']} "
                                  f"({preview['period_start']:%d/%m/%Y}–{preview['period_end']:%d/%m/%Y}){unpriced}")
                if not options["dry_run"]:
                    subscription.save(update_fields=["current_period_ends_at", "updated_at"])
            self.stdout.write(f"Total do primeiro ciclo: R$ {total}")
            if options["dry_run"]:
                transaction.set_rollback(True)
                self.stdout.write("Simulação: nada foi gravado.")
        if not enabled():
            self.stdout.write("BILLING_AUTO_INVOICING_ENABLED está desligado: nenhuma fatura será emitida até ligá-lo.")
