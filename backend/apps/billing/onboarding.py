"""First access of a self-service signup and the end of its free trial.

1. ``preview``: the admin picks segments and the size of each one (quantity → price tier), an
   optional coupon and the billing cycle. The price comes from ``pricing.breakdown`` — the only
   price path — applied inside a transaction that is rolled back, so the amount shown is exactly
   the one that will be charged.
2. ``complete``: same selection plus the accepted terms version. Only the chosen segments stay
   contracted, the free trial (``BILLING_TRIAL_DAYS``) starts and the acceptance is stored with a
   snapshot of what was shown. Segments "sob consulta" open during the trial and their price is
   set later by the commercial team (they already show as pending in the platform dossier).
3. ``subscribe``: when the trial ends (or earlier) the admin confirms the subscription with a
   payment method. The trial ends now, the first cycle starts today and, with automatic invoicing
   on, its invoice is issued and charged in that method.
"""
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from . import segments as catalog
from .models import PaymentMethod, PlanSegment, Subscription, SubscriptionTermsAcceptance
from .pricing import breakdown
from .subscriptions import redeem_coupon, upsert_segment

# Bump when the subscription terms text changes (web and mobile show the same version).
TERMS_VERSION = "2026-11"
CYCLE_MONTHS = {Subscription.BillingCycle.MONTHLY: 1, Subscription.BillingCycle.YEARLY: 12}


class _Rollback(Exception):
    pass


def trial_days():
    return int(getattr(settings, "BILLING_TRIAL_DAYS", 7))


def _first_message(error):
    detail = error.detail
    while isinstance(detail, (dict, list)):
        detail = next(iter(detail.values())) if isinstance(detail, dict) else (detail[0] if detail else "")
    return str(detail)


def clean_selection(selections, billing_cycle):
    """Validate ``[{segment_code, quantity}]``; quantity is required when the segment prices by size."""
    if billing_cycle not in CYCLE_MONTHS:
        raise ValidationError({"billing_cycle": "Escolha a cobrança mensal ou anual."})
    if not isinstance(selections, list) or not selections:
        raise ValidationError({"segments": "Selecione ao menos um segmento."})
    segments = {segment.code: segment for segment in PlanSegment.objects.filter(is_active=True, is_public=True).prefetch_related("tiers")}
    cleaned, seen = [], set()
    for row in selections:
        code = str((row or {}).get("segment_code") or "") if isinstance(row, dict) else ""
        segment = segments.get(code)
        if segment is None or code not in catalog.ALL_SEGMENTS or code in seen:
            raise ValidationError({"segments": "Segmento inválido ou repetido."})
        seen.add(code)
        tiers = [tier for tier in segment.tiers.all() if tier.is_active]
        if not tiers:
            raise ValidationError({"segments": f"O segmento {segment.name} não está disponível no momento."})
        sized = any(tier.minimum_quantity is not None or tier.maximum_quantity is not None for tier in tiers)
        quantity = row.get("quantity")
        if sized:
            try:
                quantity = int(quantity)
            except (TypeError, ValueError):
                quantity = 0
            if quantity < 1:
                metric = segment.metric_label or "unidades"
                raise ValidationError({"segments": f"Informe a quantidade de {metric} em {segment.name}."})
        else:
            quantity = None
        cleaned.append({"segment_code": code, "quantity": quantity})
    return [row for code in catalog.ALL_SEGMENTS for row in cleaned if row["segment_code"] == code]


def _apply(subscription, selection, billing_cycle):
    subscription.billing_cycle = billing_cycle
    subscription.save(update_fields=["billing_cycle", "updated_at"])
    subscription.items.all().delete()
    for row in selection:
        upsert_segment(subscription, row["segment_code"], quantity=row["quantity"])


def _summary(subscription, selection, *, coupon_applied=False, coupon_error="", now=None):
    now = now or timezone.now()
    price = breakdown(subscription, now)
    months = CYCLE_MONTHS[subscription.billing_cycle]
    quantities = {row["segment_code"]: row["quantity"] for row in selection}
    for line in price["lines"]:
        line["quantity"] = quantities.get(line["segment_code"])
    return {
        "price": price,
        "billing_cycle": subscription.billing_cycle,
        "months": months,
        "cycle_total": str((Decimal(price["total"]) * months).quantize(Decimal("0.01"))),
        "unpriced": [line["name"] for line in price["lines"] if line["on_request"]],
        "trial_days": trial_days(),
        "trial_ends_at": (now + timedelta(days=trial_days())).isoformat(),
        "coupon_applied": coupon_applied,
        "coupon_error": coupon_error,
        "terms_version": TERMS_VERSION,
    }


def _pending_subscription(organization):
    subscription = Subscription.objects.select_for_update().filter(organization=organization).first()
    if subscription is None or not subscription.onboarding_pending:
        raise ValidationError({"detail": "O primeiro acesso desta organização já foi concluído."})
    return subscription


def preview(organization, *, selections, billing_cycle, coupon=""):
    """Price of a selection without saving anything."""
    selection = clean_selection(selections, billing_cycle)
    result = None
    try:
        with transaction.atomic():
            subscription = _pending_subscription(organization)
            _apply(subscription, selection, billing_cycle)
            coupon_error, applied = "", False
            if (coupon or "").strip():
                try:
                    with transaction.atomic():
                        redeem_coupon(subscription, coupon)
                    applied = True
                except ValidationError as error:
                    coupon_error = _first_message(error)
            result = _summary(subscription, selection, coupon_applied=applied, coupon_error=coupon_error)
            raise _Rollback
    except _Rollback:
        pass
    return result


@transaction.atomic
def complete(organization, user, *, selections, billing_cycle, coupon="", accepted_terms=False, terms_version="", ip_address=None, user_agent=""):
    if accepted_terms is not True:
        raise ValidationError({"accepted_terms": "Leia e aceite os termos da assinatura para continuar."})
    if terms_version != TERMS_VERSION:
        raise ValidationError({"terms_version": "Os termos foram atualizados. Revise-os antes de aceitar."})
    selection = clean_selection(selections, billing_cycle)
    subscription = _pending_subscription(organization)
    _apply(subscription, selection, billing_cycle)
    applied = False
    if (coupon or "").strip():
        redeem_coupon(subscription, coupon, actor=user)
        applied = True
    now = timezone.now()
    snapshot = _summary(subscription, selection, coupon_applied=applied, now=now)
    subscription.status = Subscription.Status.TRIALING
    subscription.started_at = now
    subscription.trial_ends_at = now + timedelta(days=trial_days())
    subscription.onboarding_completed_at = now
    subscription.save(update_fields=["status", "started_at", "trial_ends_at", "onboarding_completed_at", "updated_at"])
    SubscriptionTermsAcceptance.objects.create(
        subscription=subscription, user=user, terms_version=TERMS_VERSION, accepted_at=now,
        ip_address=ip_address or None, user_agent=(user_agent or "")[:500],
        snapshot={**snapshot, "selection": selection},
    )
    user.welcome_tour_pending = True
    user.save(update_fields=["welcome_tour_pending", "updated_at"])
    return subscription, snapshot


def set_payment_method(subscription, method):
    if method not in PaymentMethod.values:
        raise ValidationError({"payment_method": "Escolha PIX, boleto ou cartão de crédito."})
    subscription.preferred_payment_method = method
    subscription.save(update_fields=["preferred_payment_method", "updated_at"])
    return subscription


@transaction.atomic
def subscribe(organization, *, payment_method=""):
    """End the trial and start the paid subscription. Returns (subscription, invoice or None)."""
    from . import recurring

    subscription = Subscription.objects.select_for_update().filter(organization=organization).first()
    if subscription is None or subscription.onboarding_pending:
        raise ValidationError({"detail": "Conclua o primeiro acesso antes de assinar."})
    if subscription.status != Subscription.Status.TRIALING:
        raise ValidationError({"detail": "Esta assinatura não está em período de teste."})
    set_payment_method(subscription, payment_method or subscription.preferred_payment_method)
    now = timezone.now()
    subscription.status = Subscription.Status.ACTIVE
    subscription.trial_ends_at = min(subscription.trial_ends_at or now, now)
    subscription.save(update_fields=["status", "trial_ends_at", "updated_at"])
    invoice = None
    # With automatic invoicing off, the platform sets the first billing date (manage.py start_billing).
    if recurring.enabled():
        # The first cycle starts today: its invoice is the next one to be issued.
        subscription.current_period_ends_at = recurring._aware(timezone.localdate(now))
        subscription.save(update_fields=["current_period_ends_at", "updated_at"])
        invoice = recurring.issue_cycle_invoice(subscription, today=timezone.localdate(now))
        recurring.roll_period(subscription, now=now)
        if invoice is not None:
            transaction.on_commit(lambda: recurring.charge_invoice(invoice))
    return subscription, invoice
