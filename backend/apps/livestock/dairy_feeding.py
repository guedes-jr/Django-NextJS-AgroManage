"""Dairy feed groups use the existing cattle consumption and stock ledgers."""

import hashlib
import json
from decimal import ROUND_HALF_UP, Decimal
from types import SimpleNamespace

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from apps.farms.models import Farm
from apps.inventory.models import ItemEstoque

from .cattle_serializers import past_date
from .dairy_worksheet import WorksheetConflict, _release_feed, _save_feed
from .models import Animal, DairyWorksheetCommand


class GroupFeedInput(serializers.Serializer):
    item = serializers.UUIDField()
    quantity_kg = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal(".01")
    )
    mode = serializers.ChoiceField(
        choices=["total", "per_head_day"], default="per_head_day"
    )


class GroupInput(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    animals = serializers.ListField(
        child=serializers.UUIDField(), min_length=1, max_length=1000
    )
    feeds = GroupFeedInput(many=True, min_length=1, max_length=10)

    def validate(self, values):
        if len(set(values["animals"])) != len(values["animals"]):
            raise serializers.ValidationError("Não repita animais no grupo.")
        if len({row["item"] for row in values["feeds"]}) != len(values["feeds"]):
            raise serializers.ValidationError("Não repita rações no grupo.")
        return values


class FeedingCommand(serializers.Serializer):
    farm = serializers.UUIDField()
    date = serializers.DateField(validators=[past_date])
    period_start = serializers.DateField(validators=[past_date])
    request_key = serializers.UUIDField()
    groups = GroupInput(many=True, min_length=1, max_length=10)
    notes = serializers.CharField(max_length=1000, allow_blank=True, default="")

    def validate(self, values):
        if values["period_start"] > values["date"]:
            raise serializers.ValidationError(
                {"period_start": "A data inicial não pode ser posterior à final."}
            )
        ids = [pk for group in values["groups"] for pk in group["animals"]]
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError(
                "Um animal não pode participar de dois grupos no mesmo envio."
            )
        return values


class Cancellation(serializers.Serializer):
    farm = serializers.UUIDField()
    request_key = serializers.UUIDField()
    source_key = serializers.UUIDField()
    group_index = serializers.IntegerField(min_value=0, max_value=9)
    reason = serializers.CharField(max_length=500)


def require_manager(user):
    if user.role not in {"admin", "manager"}:
        raise PermissionDenied(
            "O fornecimento por grupos exige gerente ou administrador."
        )


def eligible_animals(user, farm):
    return (
        Animal.objects.filter(
            farm_id=farm,
            farm__organization=user.organization,
            species__code="bovinos",
            cattle_purpose__in=["dairy", "dual"],
            status="active",
        )
        .select_related("farm", "species", "batch", "cattle_profile")
        .order_by("identifier", "id")
    )


def _previous(user, values, fingerprint):
    previous = DairyWorksheetCommand.objects.filter(
        farm_id=values["farm"], request_key=values["request_key"]
    ).first()
    if previous and (
        previous.fingerprint != fingerprint or previous.recorded_by_id != user.pk
    ):
        raise WorksheetConflict("Esta identificação já foi utilizada em outro envio.")
    return previous


@transaction.atomic
def supply(request, values):
    user = request.user
    require_manager(user)
    farm = get_object_or_404(
        Farm.objects.select_for_update(),
        pk=values["farm"],
        organization=user.organization,
    )
    fingerprint = hashlib.sha256(
        json.dumps(values, default=str, sort_keys=True).encode()
    ).hexdigest()
    previous = _previous(user, values, fingerprint)
    if previous:
        return previous.receipt
    ids = [pk for group in values["groups"] for pk in group["animals"]]
    animals = {
        row.pk: row
        for row in eligible_animals(user, farm.pk)
        .select_for_update(of=("self",))
        .filter(pk__in=ids)
    }
    if len(animals) != len(ids):
        raise serializers.ValidationError(
            {"animals": "Selecione apenas animais leiteiros ativos da fazenda."}
        )
    for animal in animals.values():
        if (animal.entry_date and animal.entry_date > values["period_start"]) or (
            animal.birth_date and animal.birth_date > values["period_start"]
        ):
            raise serializers.ValidationError(
                {
                    "period_start": "O período não pode anteceder a entrada ou nascimento dos animais."
                }
            )
    days = (values["date"] - values["period_start"]).days + 1
    items = {row["item"] for group in values["groups"] for row in group["feeds"]}
    list(
        ItemEstoque.objects.select_for_update()
        .filter(organization=user.organization, pk__in=items)
        .order_by("id")
    )
    groups, effects = [], []
    for group in values["groups"]:
        targets = [animals[pk] for pk in group["animals"]]
        allocations, feeds = [], []
        for index, feed in enumerate(group["feeds"]):
            quantity = (
                feed["quantity_kg"] * len(targets) * days
                if feed["mode"] == "per_head_day"
                else feed["quantity_kg"]
            )
            quantity = quantity.quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
            if quantity > Decimal("99999999.99"):
                raise serializers.ValidationError(
                    {"quantity_kg": "A quantidade total ultrapassa o limite permitido."}
                )
            allocation = _save_feed(
                request,
                targets[0],
                values["date"],
                {**feed, "slot": f"feed_{index}", "quantity_kg": quantity},
                start=values["period_start"],
                targets=targets,
            )
            allocations.append(allocation)
            feeds.append(
                {
                    "item": str(feed["item"]),
                    "name": allocation["name"],
                    "mode": feed["mode"],
                    "quantity_kg": str(feed["quantity_kg"]),
                    "total_kg": str(quantity),
                }
            )
        groups.append(
            {
                "name": group["name"],
                "animals": [
                    {"id": str(target.pk), "identifier": target.identifier}
                    for target in targets
                ],
                "head_count": len(targets),
                "feeds": feeds,
            }
        )
        effects.append({"allocations": allocations})
    receipt = {
        "saved": True,
        "mode": "feeding",
        "request_key": str(values["request_key"]),
        "farm": str(farm.pk),
        "date": str(values["date"]),
        "period_start": str(values["period_start"]),
        "days": days,
        "groups": groups,
        "notes": values["notes"],
    }
    DairyWorksheetCommand.objects.create(
        farm=farm,
        recorded_by=user,
        request_key=values["request_key"],
        fingerprint=fingerprint,
        effects=effects,
        receipt=receipt,
    )
    return receipt


@transaction.atomic
def cancel(request, values):
    user = request.user
    require_manager(user)
    farm = get_object_or_404(
        Farm.objects.select_for_update(),
        pk=values["farm"],
        organization=user.organization,
    )
    fingerprint = hashlib.sha256(
        json.dumps(values, default=str, sort_keys=True).encode()
    ).hexdigest()
    previous = _previous(user, values, fingerprint)
    if previous:
        return previous.receipt
    source = get_object_or_404(
        DairyWorksheetCommand,
        farm=farm,
        request_key=values["source_key"],
        receipt__mode="feeding",
    )
    marker = f"{source.request_key}:{values['group_index']}"
    if DairyWorksheetCommand.objects.filter(
        farm=farm, receipt__cancelled_source=marker
    ).exists():
        raise WorksheetConflict("Este grupo já foi cancelado. Atualize o histórico.")
    if values["group_index"] >= len(source.effects):
        raise serializers.ValidationError({"group_index": "Grupo inválido."})
    allocations = source.effects[values["group_index"]]["allocations"]
    list(
        ItemEstoque.objects.select_for_update()
        .filter(
            organization=user.organization, pk__in=[row["item"] for row in allocations]
        )
        .order_by("id")
    )
    for allocation in allocations:
        _release_feed(
            request,
            SimpleNamespace(
                farm=farm,
                identifier=source.receipt["groups"][values["group_index"]]["name"],
            ),
            allocation,
        )
    receipt = {
        "saved": True,
        "mode": "feeding_cancel",
        "request_key": str(values["request_key"]),
        "farm": str(farm.pk),
        "cancelled_source": marker,
        "reason": values["reason"],
    }
    DairyWorksheetCommand.objects.create(
        farm=farm,
        recorded_by=user,
        request_key=values["request_key"],
        fingerprint=fingerprint,
        before=[source.effects[values["group_index"]]],
        receipt=receipt,
    )
    return receipt
