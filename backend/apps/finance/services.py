"""Financial posting and traceable, idempotent settlement operations."""
import calendar
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum, Case, When, F, DecimalField, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError


def refresh_account_balances(account_ids):
    from .models import BankAccount, Transaction
    accounts = BankAccount.objects.select_for_update().filter(pk__in=account_ids).order_by("pk")
    for account in accounts:
        signed = Case(When(category__category_type="revenue", then=F("amount")), default=-F("amount"), output_field=DecimalField(max_digits=20, decimal_places=2))
        realized = Transaction.objects.filter(bank_account=account, organization=account.organization, status="paid").aggregate(total=Sum(signed))["total"] or Decimal(0)
        BankAccount.objects.filter(pk=account.pk).update(current_balance=account.initial_balance + realized)


def _existing_event(document, key, kind):
    from .models import PaymentEvent
    existing = PaymentEvent.objects.filter(transaction=document, idempotency_key=key).first()
    if existing and (existing.transaction_id != document.pk or existing.kind != kind):
        raise ValidationError({"idempotency_key": "Esta identificação já foi utilizada em outra operação."})
    return existing


@transaction.atomic
def settle_transaction(document, user, *, bank_account, payment_date, payment_method, idempotency_key):
    from .models import Transaction, PaymentEvent, BankAccount
    document = Transaction.objects.select_for_update().get(pk=document.pk, organization=user.organization)
    existing = _existing_event(document, idempotency_key, "payment")
    if existing:
        if existing.bank_account_id != bank_account.pk or existing.payment_date != payment_date or existing.payment_method != payment_method:
            raise ValidationError({"idempotency_key": "Os dados desta baixa diferem da operação já registrada."})
        return existing
    if document.amount <= 0:
        raise ValidationError({"amount": "A baixa exige um valor positivo."})
    if document.status not in ("pending", "overdue"):
        raise ValidationError({"status": "Somente títulos em aberto podem receber baixa."})
    locked_accounts = {account.pk: account for account in BankAccount.objects.select_for_update().filter(pk__in=[bank_account.pk, document.bank_account_id], organization=user.organization).order_by("pk")}
    account = locked_accounts.get(bank_account.pk)
    if not account:
        raise ValidationError({"bank_account": "A conta não pertence à sua organização."})
    if not account.is_active:
        raise ValidationError({"bank_account": "A conta está inativa."})
    if payment_date > timezone.localdate():
        raise ValidationError({"payment_date": "A baixa não pode ter data futura."})
    event = PaymentEvent.objects.create(transaction=document, kind="payment", amount=document.amount, bank_account=account, payment_date=payment_date, payment_method=payment_method, idempotency_key=idempotency_key, created_by=user)
    document.status, document.bank_account, document.payment_date, document.payment_method = "paid", account, payment_date, payment_method
    document._settlement_operation = True
    document.save(update_fields=["status", "bank_account", "payment_date", "payment_method", "updated_at"])
    document._settlement_operation = False
    return event


@transaction.atomic
def reverse_payment(document, user, *, reason, idempotency_key, payment=None):
    from .models import Transaction, PaymentEvent
    document = Transaction.objects.select_for_update().get(pk=document.pk, organization=user.organization)
    existing = _existing_event(document, idempotency_key, "reversal")
    if existing:
        if existing.reason != reason or (payment and existing.reverses_id != payment):
            raise ValidationError({"idempotency_key": "Os dados deste estorno diferem da operação registrada."})
        return existing
    if document.status != "paid":
        raise ValidationError({"status": "Somente títulos pagos podem ser estornados."})
    active = document.payment_events.filter(kind="payment", reversal__isnull=True).first()
    if active and not payment:
        raise ValidationError({"payment": "Informe a baixa ativa para estornar; atualize o título antes de continuar."})
    if not active:
        # Capture the legacy paid state before reversing; never fabricate bank allocation.
        active = PaymentEvent.objects.create(transaction=document, kind="payment", amount=document.amount, bank_account=document.bank_account, payment_date=document.payment_date or document.due_date, payment_method=document.payment_method or "", reason="Baixa anterior ao histórico de liquidações.", created_by=user)
    if payment and active.pk != payment:
        raise ValidationError({"payment": "A baixa informada não é a baixa ativa deste título."})
    event = PaymentEvent.objects.create(transaction=document, kind="reversal", amount=active.amount, bank_account=active.bank_account, payment_date=timezone.localdate(), payment_method=active.payment_method, reverses=active, reason=reason, idempotency_key=idempotency_key, created_by=user)
    document.status, document.payment_date = "pending", None
    document._settlement_operation = True
    document.save(update_fields=["status", "payment_date", "updated_at"])
    document._settlement_operation = False
    return event


@transaction.atomic
def create_series(user, values, *, series_id, kind, count):
    """Installments divide one total; recurrence repeats the full amount."""
    from apps.organizations.models import Organization
    from .models import Transaction
    Organization.objects.select_for_update().get(pk=user.organization_id)
    existing = list(Transaction.objects.filter(organization=user.organization, series_id=series_id).order_by("series_number"))
    if existing:
        total = sum((entry.amount for entry in existing), Decimal(0)) if kind == "installment" else existing[0].amount
        changed = any(getattr(existing[0], key) != value for key, value in values.items() if key not in {"amount", "status", "payment_date"})
        if len(existing) != count or existing[0].series_kind != kind or total != values["amount"] or changed:
            raise ValidationError({"series_id": "Esta identificação já foi utilizada em outro parcelamento/agendamento."})
        return existing
    if values.get("status", "pending") != "pending":
        raise ValidationError({"status": "Parcelas e recorrências são criadas em aberto e recebem baixa individual."})
    if values.get("attachment"):
        raise ValidationError({"attachment": "Anexe o comprovante ao título após gerar a série."})
    cents = int(values["amount"] * 100)
    if kind == "installment" and cents < count:
        raise ValidationError({"amount": "O valor não permite parcelas de pelo menos um centavo."})
    start = values["due_date"]
    results = []
    for number in range(count):
        year, month = divmod(start.year * 12 + start.month - 1 + number, 12)
        due_date = date(year, month + 1, min(start.day, calendar.monthrange(year, month + 1)[1]))
        amount = Decimal(cents // count + (number < cents % count)) / 100 if kind == "installment" else values["amount"]
        results.append(Transaction.objects.create(**dict(values, amount=amount, due_date=due_date, payment_date=None), organization=user.organization, created_by=user, series_id=series_id, series_kind=kind, series_number=number + 1, series_count=count))
    return results


@transaction.atomic
def record_stock_purchase(movement, user, *, due_date=None, paid=False, bank_account=None, payment_date=None, payment_method="transfer"):
    """One payable per purchase receipt, even when reusing the stock lot."""
    from .models import Transaction, FinancialCategory
    lot = movement.lote
    unit_cost = lot.custo_unitario if lot else None
    if not unit_cost or unit_cost <= 0:
        if paid:
            raise ValidationError({"custo_unitario": "Informe o custo da compra para registrar o pagamento."})
        return None
    amount = (movement.quantidade * unit_cost).quantize(Decimal("0.01"))
    if amount <= 0:
        raise ValidationError({"custo_unitario": "O total da compra deve ser de pelo menos um centavo."})
    category, _ = FinancialCategory.objects.get_or_create(organization=movement.item.organization, name="Compra de Insumos", category_type="expense")
    document = Transaction.objects.create(organization=movement.item.organization, farm=movement.farm, category=category, description=f"Compra de estoque: {movement.item.nome} (Lote: {lot.numero_lote})", amount=amount, due_date=due_date or timezone.localdate(), reference=f"STOCK-MOV-{movement.pk}", created_by=user)
    if paid:
        if not bank_account or not payment_date:
            raise ValidationError({"purchase_payment_status": "Uma compra paga exige conta e data do pagamento."})
        settle_transaction(document, user, bank_account=bank_account, payment_date=payment_date, payment_method=payment_method, idempotency_key=movement.pk)
    return document


def cash_projection(organization, *, days=30, bank_account=None, include_overdue=True):
    """Future open documents, kept separate from realized cash and without postings."""
    from .models import BankAccount, Transaction
    from django.db.models.functions import Greatest
    accounts = BankAccount.objects.filter(organization=organization)
    titles = Transaction.objects.filter(organization=organization, status__in=["pending", "overdue"])
    if bank_account:
        accounts = accounts.filter(pk=bank_account.pk)
        titles = titles.filter(bank_account=bank_account)
    today = timezone.localdate()
    end = today + timedelta(days=days - 1)
    titles = titles.filter(due_date__lte=end)
    if not include_overdue:
        titles = titles.filter(due_date__gte=today)
    opening = accounts.aggregate(total=Sum("current_balance"))["total"] or Decimal(0)
    rows = titles.annotate(projected_date=Greatest(F("due_date"), today)).order_by().values("projected_date").annotate(revenue=Sum("amount", filter=Q(category__category_type="revenue")), expense=Sum("amount", filter=Q(category__category_type="expense")))
    by_day = {row["projected_date"]: row for row in rows}
    balance, first_negative, result = opening, None, []
    for offset in range(days):
        day = today + timedelta(days=offset)
        row = by_day.get(day, {})
        income, expense = row.get("revenue") or Decimal(0), row.get("expense") or Decimal(0)
        balance += income - expense
        if balance < 0 and first_negative is None: first_negative = day
        result.append({"date": day, "revenue": income, "expense": expense, "balance": balance})
    return {"start_date": today, "end_date": end, "opening_balance": opening, "closing_balance": balance, "first_negative_date": first_negative, "included_titles": titles.count(), "unassigned_titles": titles.filter(bank_account__isnull=True).count(), "include_overdue": include_overdue, "days": result}
