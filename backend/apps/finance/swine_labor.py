"""Corrections to paid swine labor, preserving the original posting and reversal."""
import json
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework import serializers
from rest_framework.exceptions import NotFound

from .models import PaymentEvent, Transaction
from .services import reverse_payment, settle_transaction


PREFIX = "LABOR-SWINE-"


class Correction(serializers.Serializer):
    request_key = serializers.UUIDField()
    date = serializers.DateField()
    sector = serializers.ChoiceField(choices=(
        "Geral", "Maternidade", "Creche", "Crescimento", "Engorda",
        "Fábrica de ração", "Limpeza / Manutenção", "Reprodução",
    ))
    worker = serializers.CharField(max_length=150)
    activity = serializers.CharField(max_length=150)
    type = serializers.ChoiceField(choices=("daily", "monthly", "hourly"))
    people = serializers.IntegerField(min_value=1, max_value=999999)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    rate = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    observations = serializers.CharField(max_length=2000, allow_blank=True)


@transaction.atomic
def correct(user, pk, command=None):
    original = Transaction.objects.select_for_update().select_related("category").filter(
        pk=pk, organization_id=user.organization_id, reference__startswith=PREFIX,
        category__category_type="expense", planting_cycle__isnull=True,
    ).first()
    if original is None:
        raise NotFound()
    if command:
        reference = PREFIX + str(command["request_key"])
        day = command["date"]
        labor = {key: value for key, value in command.items() if key not in ("request_key", "date")}
        labor["quantity"] = Decimal(1) if labor["type"] == "monthly" else labor["quantity"]
        amount = (labor["people"] * labor["quantity"] * labor["rate"]).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
        if amount > Decimal("99999999999999.99"):
            raise serializers.ValidationError({"amount": _("O valor excede o limite permitido.")})
        labor.update(quantity=float(labor["quantity"]), rate=float(labor["rate"]))
        notes = json.dumps({"version": 1, "labor": labor, "replaces": str(original.pk)}, ensure_ascii=False)
        existing = Transaction.objects.filter(organization_id=user.organization_id, reference=reference).first()
        if existing:
            if existing.notes == notes and existing.due_date == day:
                return existing
            raise serializers.ValidationError({"detail": _("Essa correção já foi usada com outros dados.")})
        if original.status == Transaction.Status.CANCELLED:
            raise serializers.ValidationError({"detail": _("Este lançamento já foi cancelado ou corrigido.")})
        from apps.reports.lot_costs import has_swine_labor_population

        if day > timezone.localdate() or not has_swine_labor_population(
            user.organization, day, farm=original.farm, batch=original.animal_batch,
        ):
            raise serializers.ValidationError({"due_date": _("Informe uma data válida com animais em lotes de produção.")})
    elif original.status == Transaction.Status.CANCELLED:
        return original

    account, method = original.bank_account, original.payment_method
    paid = original.status == Transaction.Status.PAID
    if paid:
        payment = original.payment_events.filter(kind="payment", reversal__isnull=True).first()
        reverse_payment(original, user, reason=_("Correção de lançamento de mão de obra."),
                        idempotency_key=uuid4(), payment=payment.pk if payment else None)
        original.refresh_from_db()
    original.status = Transaction.Status.CANCELLED
    original._settlement_operation = True
    original.save(update_fields=["status", "updated_at"])
    if command is None:
        return original

    label = {"daily": "Diária", "monthly": "Mensal", "hourly": "Por hora"}[labor["type"]]
    replacement = Transaction.objects.create(
        organization_id=user.organization_id, category=original.category, farm_id=original.farm_id,
        animal_batch_id=original.animal_batch_id, species_id=original.species_id,
        reference=reference, notes=notes, amount=amount, due_date=day,
        description=f"Mão de obra ({label}): {labor['sector']} — {labor['activity']} — {labor['worker']}",
        status=Transaction.Status.PAID if paid and not account else Transaction.Status.PENDING,
        payment_date=day if paid and not account else None, created_by=user,
    )
    if paid and account:
        settle_transaction(replacement, user, bank_account=account, payment_date=day,
                           payment_method=method, idempotency_key=uuid4())
        replacement.refresh_from_db()
    elif paid:
        PaymentEvent.objects.create(
            transaction=replacement, kind="payment", amount=amount, payment_date=day,
            created_by=user, reason=_("Baixa do lançamento corrigido de mão de obra."),
        )
    return replacement
