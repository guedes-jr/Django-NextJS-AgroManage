"""Read selectors for organization dossier sections, scoped by the URL tenant."""

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import serializers

from common.permissions import IsPlatformAdmin, IsPlatformAuditor, IsPlatformStaff, IsPlatformSupport
from apps.billing.models import Invoice, Payment
from .models import PlatformAuditLog, SupportAccessGrant


class OrganizationSectionFilters(serializers.Serializer):
    search = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


def dossier_sections(request):
    if not request or not IsPlatformStaff().has_permission(request, None):
        return []
    sections = ["summary", "registration", "users", "subscription", "invoices", "payments", "consumption", "adoption", "operation"]
    from .exports.service import allowed
    if allowed(request.user):
        sections.extend(["exports", "recovery"])
    from apps.ai_assistant.ticket_services import is_team
    if is_team(request.user):
        sections.append("tickets")
    if IsPlatformAuditor().has_permission(request, None):
        sections.append("history")
    if IsPlatformSupport().has_permission(request, None):
        sections.append("support-access")
    return sections


def can_manage_organization(request):
    return bool(request and IsPlatformAdmin().has_permission(request, None))


def section_records(*, organization, section, user, params):
    filters = OrganizationSectionFilters(data=params)
    filters.is_valid(raise_exception=True)
    search = filters.validated_data["search"]
    if section == "users":
        queryset = get_user_model().objects.filter(
            organization=organization, platform_staff_profile__isnull=True,
        ).exclude(affiliate_profile__portal_access_only=True).select_related("organization").order_by("full_name", "id")
        query = Q(full_name__icontains=search) | Q(email__icontains=search)
    elif section == "invoices":
        queryset = Invoice.objects.filter(organization=organization).select_related("organization", "subscription__plan").order_by("-due_date", "-id")
        query = Q(number__icontains=search)
    elif section == "payments":
        queryset = Payment.objects.filter(organization=organization).select_related("organization", "invoice").order_by("-created_at", "-id")
        query = Q(invoice__number__icontains=search) | Q(external_id__icontains=search) | Q(payment_method__icontains=search)
    elif section == "history":
        queryset = PlatformAuditLog.objects.filter(organization=organization).select_related("actor", "organization").order_by("-created_at", "-id")
        query = Q(description__icontains=search) | Q(action__icontains=search) | Q(actor__full_name__icontains=search)
    elif section == "support-access":
        queryset = SupportAccessGrant.objects.filter(organization=organization).select_related("operator", "organization").order_by("-created_at", "-id")
        if user.platform_staff_profile.role == "platform_support":
            queryset = queryset.filter(operator=user)
        query = Q(operator__full_name__icontains=search) | Q(ticket_reference__icontains=search) | Q(justification__icontains=search)
    else:
        raise ValueError("Unknown organization section")
    return queryset.filter(query) if search else queryset
