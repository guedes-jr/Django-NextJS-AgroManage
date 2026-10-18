"""Shared billing pendency rules for directory, dashboard and customer dossier."""
from django.db.models import F
from django.utils import timezone
from .models import Invoice


def unpaid_invoices():
    return Invoice.objects.filter(total__gt=F("amount_paid")).exclude(status__in=[Invoice.Status.PAID, Invoice.Status.VOID, Invoice.Status.DRAFT])


def overdue_invoices():
    return unpaid_invoices().filter(due_date__lt=timezone.localdate())
