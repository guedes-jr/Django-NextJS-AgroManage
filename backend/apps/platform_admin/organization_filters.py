"""One organization selection contract for directory and frozen batches."""
from datetime import datetime, time, timedelta

from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import User
from apps.billing.selectors import overdue_invoices
from apps.organizations.models import Organization

ADOPTION = ("active", "inactive_7", "inactive_15", "inactive_30", "never", "unknown", "pending")


class OrganizationFilters(serializers.Serializer):
    search = serializers.CharField(max_length=200, required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=Organization.Status.choices, required=False)
    plan = serializers.SlugField(max_length=60, required=False)
    is_active = serializers.BooleanField(required=False)
    trial = serializers.BooleanField(required=False)
    financial_pending = serializers.BooleanField(required=False)
    without_admin = serializers.BooleanField(required=False)
    without_responsible = serializers.BooleanField(required=False)
    adoption = serializers.ChoiceField(choices=ADOPTION, required=False)
    unused_days = serializers.ChoiceField(choices=(7, 15, 30), required=False)
    near_limit = serializers.BooleanField(required=False)
    created_from = serializers.DateField(required=False)
    created_to = serializers.DateField(required=False)

    def validate(self, attrs):
        if attrs.get("created_from") and attrs.get("created_to") and attrs["created_from"] > attrs["created_to"]:
            raise serializers.ValidationError("O início do cadastro deve anteceder o fim.")
        return attrs


def validated_filters(data, strict=False):
    if strict and set(data) - set(OrganizationFilters().fields):
        raise serializers.ValidationError({"filters": "Filtro não reconhecido."})
    serializer = OrganizationFilters(data=dict(data.items()))
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def filter_organizations(queryset, values):
    for key in ("status", "is_active"):
        if key in values:
            queryset = queryset.filter(**{key: values[key]})
    if values.get("search"):
        query = Q()
        for field in ("name", "slug", "document", "email"):
            query |= Q(**{f"{field}__icontains": values["search"]})
        queryset = queryset.filter(query)
    if values.get("plan"):
        queryset = queryset.filter(Q(subscription__plan__code=values["plan"]) | Q(subscription__isnull=True, plan=values["plan"]))
    if "trial" in values:
        query = Q(subscription__status="trialing")
        queryset = queryset.filter(query) if values["trial"] else queryset.exclude(query)
    members = User.objects.filter(organization_id=OuterRef("pk"), is_active=True, platform_staff_profile__isnull=True).exclude(affiliate_profile__portal_access_only=True)
    for key, criterion in (("without_admin", {"role": "admin"}), ("without_responsible", {"organization_responsible": True})):
        if key in values:
            queryset = queryset.alias(**{f"has_{key}": Exists(members.filter(**criterion))}).filter(**{f"has_{key}": not values[key]})
    if "financial_pending" in values:
        invoices = overdue_invoices().filter(organization_id=OuterRef("pk"))
        queryset = queryset.alias(has_financial_pending=Exists(invoices)).filter(has_financial_pending=values["financial_pending"])
    adoption = values.get("adoption")
    if adoption:
        queryset = queryset.filter(adoption__isnull=True) if adoption == "pending" else queryset.filter(adoption__status=adoption)
    if values.get("unused_days"):
        statuses = {7: ["inactive_7", "inactive_15", "inactive_30"], 15: ["inactive_15", "inactive_30"], 30: ["inactive_30"]}
        queryset = queryset.filter(adoption__status__in=statuses[values["unused_days"]])
    if "near_limit" in values:
        queryset = queryset.filter(quota_snapshot__near_limit=values["near_limit"])
    for key, lookup, extra in (("created_from", "created_at__gte", 0), ("created_to", "created_at__lt", 1)):
        if key in values:
            boundary = timezone.make_aware(datetime.combine(values[key] + timedelta(days=extra), time.min))
            queryset = queryset.filter(**{lookup: boundary})
    return queryset
