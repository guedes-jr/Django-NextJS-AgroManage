"""Customer-only activity collection and periodically materialized adoption metrics."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Max, Q
from django.utils import timezone

from apps.organizations.models import Organization
from apps.farms.models import Farm
from .models import AdoptionObservation, CustomerActivityDay, OrganizationAdoption


def customers():
    return get_user_model().objects.filter(platform_staff_profile__isnull=True).exclude(affiliate_profile__portal_access_only=True)


def record_activity(user, kind, at=None):
    if kind not in {"login", "operation"}:
        raise ValueError("Unknown activity kind")
    if not user or not user.is_authenticated or not user.is_active or not user.organization_id or getattr(user, "support_access_grant", None):
        return
    # Read persisted ownership: assisted access and transient user context are never evidence.
    if not customers().filter(pk=user.pk, organization_id=user.organization_id, is_active=True).exists():
        return
    at = at or timezone.now()
    field = "last_login_at" if kind == "login" else "last_operation_at"
    with transaction.atomic():
        row, created = CustomerActivityDay.objects.get_or_create(
            organization_id=user.organization_id, user_id=user.pk, day=at.date(), defaults={field: at},
        )
        if not created:
            CustomerActivityDay.objects.filter(pk=row.pk).filter(Q(**{f"{field}__lt": at}) | Q(**{f"{field}__isnull": True})).update(**{field: at})


def queue_activity(user, kind):
    # Analytics must not turn a committed login/business operation into an HTTP failure.
    transaction.on_commit(lambda: record_activity(user, kind), robust=True)


@transaction.atomic
def aggregate_organization(organization_id, at=None):
    at = at or timezone.now()
    organization = Organization.objects.select_for_update().get(pk=organization_id)
    start = AdoptionObservation.objects.get(pk=1).started_at
    eligible = customers().filter(organization_id=organization_id)
    events = CustomerActivityDay.objects.filter(organization_id=organization_id, user_id__in=eligible.values("pk"), day__lte=at.date())
    latest = events.aggregate(login=Max("last_login_at"), operation=Max("last_operation_at"))
    last = max((value for value in latest.values() if value), default=None)
    full_history = organization.created_at >= start
    if last:
        days = max((at - last).days, 0)
        status = "inactive_30" if days >= 30 else "inactive_15" if days >= 15 else "inactive_7" if days >= 7 else "active"
    else:
        days = None
        status = "never" if full_history else "unknown"
    active = {}
    for period in (7, 30):
        cutoff = at - timedelta(days=period)
        active[str(period)] = events.filter(Q(last_login_at__gte=cutoff) | Q(last_operation_at__gte=cutoff)).values("user_id").distinct().count()
    metrics = {
        "status": status, "observed_since": max(start, organization.created_at).isoformat(),
        "history_complete": full_history, "calculated_at": at.isoformat(),
        "last_customer_login_at": latest["login"].isoformat() if latest["login"] else None,
        "last_operation_at": latest["operation"].isoformat() if latest["operation"] else None,
        "days_without_use": days, "active_users_7d": active["7"], "active_users_30d": active["30"],
        "period_7d_complete": at - max(start, organization.created_at) >= timedelta(days=7),
        "period_30d_complete": at - max(start, organization.created_at) >= timedelta(days=30),
        "checklist": {
            "responsible_activated": eligible.filter(organization_responsible=True, is_active=True).exists(),
            "first_farm": Farm.objects.filter(organization_id=organization_id).exists(),
            "first_operation": True if latest["operation"] else False if full_history else None,
        },
    }
    OrganizationAdoption.objects.update_or_create(organization=organization, defaults={"status": status, "calculated_at": at, "metrics": metrics})
    return metrics


def adoption_metrics(organization):
    try:
        return organization.adoption.metrics
    except OrganizationAdoption.DoesNotExist:
        return None


def adoption_summary():
    from django.db.models import Count, Min
    rows = OrganizationAdoption.objects.values("status").annotate(total=Count("pk"))
    totals = {row["status"]: row["total"] for row in rows}
    return {
        "by_status": totals,
        "pending": Organization.objects.filter(adoption__isnull=True).count(),
        "oldest_calculated_at": OrganizationAdoption.objects.aggregate(value=Min("calculated_at"))["value"],
    }
