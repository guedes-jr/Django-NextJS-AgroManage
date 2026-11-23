"""Reviewed client and billing writes for the mobile workspace."""
from datetime import date
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import APIException

from . import integrations, reports
from .models import VeterinaryProcedure
from .serializers import HERD_PURPOSES


class AccountsConflict(APIException):
    status_code = 409
    default_detail = "Os dados mudaram. Atualize e revise novamente."


class ClientInput(serializers.Serializer):
    id = serializers.UUIDField()
    version = serializers.DateTimeField(allow_null=True)
    name = serializers.CharField(max_length=150)
    farm_name = serializers.CharField(max_length=150, allow_blank=True)
    phone = serializers.CharField(max_length=40, allow_blank=True)
    farm = serializers.UUIDField(required=False, allow_null=True)
    herd_purpose = serializers.ChoiceField(choices=HERD_PURPOSES, required=False)


def client_data(client):
    return {
        "id": client.pk, "name": client.name, "farm_name": client.farm_name, "phone": client.phone,
        "updated_at": client.updated_at, "farm": client.farm_id,
        "herd_purpose": client.data.get("herd_purpose", "unknown"),
    }


class Charge(serializers.Serializer):
    id = serializers.UUIDField()
    value = serializers.DecimalField(max_digits=10, decimal_places=2)
    version = serializers.DateTimeField()


class PaymentInput(serializers.Serializer):
    month = serializers.RegexField(r"^[1-9]\d{3}-(0[1-9]|1[0-2])$")
    client = serializers.UUIDField()
    charges = Charge(many=True, allow_empty=False)

    def validate_charges(self, charges):
        if len({row["id"] for row in charges}) != len(charges):
            raise serializers.ValidationError("Atendimentos duplicados.")
        return charges


@transaction.atomic
def settle(organization, client, command):
    start, end = reports.month_bounds(date.fromisoformat(command["month"] + "-01"))
    reviewed = {row["id"]: row["value"] for row in command["charges"]}
    rows = list(VeterinaryProcedure.objects.select_related("organization", "client", "animal").select_for_update(of=("self",)).filter(
        organization=organization, client=client, date__gte=start, date__lte=end, pk__in=reviewed,
    ).order_by("pk"))
    if {row.pk: row.value for row in rows} != reviewed:
        raise AccountsConflict()
    versions = {row["id"]: row["version"] for row in command["charges"]}
    if any(not row.paid and row.updated_at != versions[row.pk] for row in rows):
        raise AccountsConflict()
    for row in rows:
        if not row.paid:
            row.paid = True
            row.save(update_fields=["paid", "updated_at"])
            integrations.sync_finance(row)
    return {"count": len(rows), "total": format(sum(reviewed.values(), Decimal("0")), ".2f")}
