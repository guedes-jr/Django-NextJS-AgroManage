"""Shared invoice filters and financial aggregates for the platform backoffice."""

from decimal import Decimal

from django.db.models import (
    Case,
    CharField,
    Count,
    DecimalField,
    ExpressionWrapper,
    F,
    Q,
    Sum,
    Value,
    When,
)
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import serializers

from apps.billing.models import Invoice, Payment, Subscription


class FinanceFilters(serializers.Serializer):
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    date_field = serializers.ChoiceField(
        choices=["due_date", "issued_at", "paid_at"], default="due_date"
    )
    organization = serializers.UUIDField(required=False)
    subscription = serializers.UUIDField(required=False)
    plan = serializers.UUIDField(required=False)
    status = serializers.ChoiceField(choices=Invoice.Status.values, required=False)
    search = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate(self, attrs):
        if (
            attrs.get("date_from")
            and attrs.get("date_to")
            and attrs["date_from"] > attrs["date_to"]
        ):
            raise serializers.ValidationError(
                "O início do período deve ser anterior ao fim."
            )
        return attrs


def finance_filters(params):
    serializer = FinanceFilters(data=params)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def filter_invoices(queryset, filters):
    for key, path in [
        ("organization", "organization_id"),
        ("subscription", "subscription_id"),
        ("plan", "subscription__plan_id"),
    ]:
        if filters.get(key):
            queryset = queryset.filter(**{path: filters[key]})
    if filters.get("status") == Invoice.Status.OVERDUE:
        queryset = queryset.filter(
            Q(status="overdue") | Q(status="open", due_date__lt=timezone.localdate())
        )
    elif filters.get("status") == Invoice.Status.OPEN:
        queryset = queryset.filter(status="open", due_date__gte=timezone.localdate())
    elif filters.get("status"):
        queryset = queryset.filter(status=filters["status"])
    search = filters.get("search", "").strip()
    if search:
        queryset = queryset.filter(
            Q(number__icontains=search)
            | Q(organization__name__icontains=search)
            | Q(organization__document__icontains=search)
            | Q(items__description__icontains=search)
            | Q(external_id__icontains=search)
        )
    field = filters.get("date_field", "due_date")
    if field == "paid_at":
        payment_conditions = Q(payments__status=Payment.Status.SUCCEEDED)
        for key, lookup in [("date_from", "gte"), ("date_to", "lte")]:
            if filters.get(key):
                payment_conditions &= Q(
                    **{f"payments__paid_at__date__{lookup}": filters[key]}
                )
        if filters.get("date_from") or filters.get("date_to"):
            queryset = queryset.filter(payment_conditions)
    else:
        date_path = field if field == "due_date" else "issued_at__date"
        for key, lookup in [("date_from", "gte"), ("date_to", "lte")]:
            if filters.get(key):
                queryset = queryset.filter(**{f"{date_path}__{lookup}": filters[key]})
    return queryset.distinct()


def finance_summary(filters):
    today = timezone.localdate()
    invoices = filter_invoices(Invoice.objects.all(), filters)
    subscriptions = Subscription.objects.filter(
        status=Subscription.Status.ACTIVE
    ).select_related("plan")
    for key, path in [("organization", "organization_id"), ("plan", "plan_id")]:
        if filters.get(key):
            subscriptions = subscriptions.filter(**{path: filters[key]})
    mrr = Decimal(0)
    for subscription in subscriptions:
        yearly = subscription.billing_cycle == Subscription.BillingCycle.YEARLY
        price = (
            subscription.plan.yearly_price
            if yearly
            else subscription.plan.monthly_price
        )
        net = price - subscription.calculate_discount(price)
        mrr += net / 12 if yearly else net
    balance = ExpressionWrapper(
        F("total") - F("amount_paid"),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )
    open_invoices = invoices.filter(
        status__in=["open", "overdue"], total__gt=F("amount_paid")
    )
    overdue = open_invoices.filter(due_date__lt=today)
    outstanding = open_invoices.aggregate(value=Sum(balance))["value"] or Decimal(0)
    overdue_amount = overdue.aggregate(value=Sum(balance))["value"] or Decimal(0)
    payments = Payment.objects.filter(
        invoice__in=invoices, status=Payment.Status.SUCCEEDED
    )
    for key, lookup in [("date_from", "gte"), ("date_to", "lte")]:
        if filters.get(key):
            payments = payments.filter(**{f"paid_at__date__{lookup}": filters[key]})
    received = payments.aggregate(value=Sum("amount"))["value"] or Decimal(0)
    received_month = payments.filter(
        paid_at__date__gte=today.replace(day=1), paid_at__date__lte=today
    ).aggregate(value=Sum("amount"))["value"] or Decimal(0)
    billed = invoices.exclude(status__in=["draft", "void"]).aggregate(
        value=Sum("total")
    )["value"] or Decimal(0)
    distribution = list(
        invoices.annotate(
            effective_status=Case(
                When(status="open", due_date__lt=today, then=Value("overdue")),
                default=F("status"),
                output_field=CharField(),
            )
        )
        .values("effective_status")
        .annotate(count=Count("pk"), total=Sum("total"))
        .order_by("effective_status")
    )
    distribution = [
        {
            "status": row["effective_status"],
            "count": row["count"],
            "total": row["total"],
        }
        for row in distribution
    ]
    return {
        "mrr": mrr,
        "arr": mrr * 12,
        "received_month": received_month,
        "received_period": received,
        "outstanding": outstanding,
        "overdue_amount": overdue_amount,
        "billed": billed,
        "overdue_rate": (overdue.count() / open_invoices.count() * 100)
        if open_invoices.exists()
        else 0,
        "active_subscriptions": subscriptions.count(),
        "open_invoices": open_invoices.count(),
        "overdue_invoices": overdue.count(),
        "failed_payments": Payment.objects.filter(
            invoice__in=invoices, status=Payment.Status.FAILED
        ).count(),
        "invoice_count": invoices.count(),
        "distribution": distribution,
        "receipts": list(
            payments.annotate(month=TruncMonth("paid_at"))
            .values("month")
            .annotate(amount=Sum("amount"))
            .order_by("month")
        ),
    }
