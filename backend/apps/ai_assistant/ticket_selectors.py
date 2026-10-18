"""Shared ticket filtering and operational metrics; private content is not aggregated."""
from django.db.models import Count, Q
from rest_framework import serializers
from .models import SupportTicket

ACTIVE_STATES = ("open", "in_progress", "waiting_customer")


class TicketFilters(serializers.Serializer):
    status = serializers.ChoiceField(choices=SupportTicket.Status.choices, required=False)
    category = serializers.ChoiceField(choices=SupportTicket.Category.choices, required=False)
    priority = serializers.ChoiceField(choices=SupportTicket.Priority.choices, required=False)
    search = serializers.CharField(max_length=200, required=False, allow_blank=True)


class TeamTicketFilters(TicketFilters):
    organization_id = serializers.UUIDField(required=False)
    assignee_id = serializers.UUIDField(required=False)
    unassigned = serializers.BooleanField(required=False)
    mine = serializers.BooleanField(required=False)


def filter_tickets(queryset, *, user, params, staff=False, organization_id=None):
    serializer = (TeamTicketFilters if staff else TicketFilters)(data=dict(params.items()))
    serializer.is_valid(raise_exception=True)
    values = dict(serializer.validated_data)
    if organization_id is not None:
        values.pop("organization_id", None)
        queryset = queryset.filter(organization_id=organization_id)
    search = values.pop("search", "")
    if "mine" in values:
        queryset = queryset.filter(assignee=user) if values.pop("mine") else queryset.exclude(assignee=user)
    if "unassigned" in values:
        queryset = queryset.filter(assignee__isnull=values.pop("unassigned"))
    queryset = queryset.filter(**values)
    if search:
        query = Q(subject__icontains=search)
        if staff:
            query |= Q(organization__name__icontains=search) | Q(requester__full_name__icontains=search)
        queryset = queryset.filter(query)
    return queryset


def ticket_metrics(queryset):
    active = Q(status__in=ACTIVE_STATES)
    return queryset.aggregate(
        total=Count("pk"), active=Count("pk", filter=active),
        awaiting_team=Count("pk", filter=Q(status__in=["open", "in_progress"])),
        waiting_customer=Count("pk", filter=Q(status="waiting_customer")),
        unassigned=Count("pk", filter=active & Q(assignee_id__isnull=True)),
        urgent=Count("pk", filter=active & Q(priority="urgent")),
        without_first_response=Count("pk", filter=active & Q(first_response_at__isnull=True)),
    )
