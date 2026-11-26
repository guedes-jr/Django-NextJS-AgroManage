"""Monthly price of a subscription: the only place that combines segment prices and discounts.

Order (cumulative, never negative):
1. each contracted segment starts at its negotiated price (``final_monthly_price``) or the tier price;
2. discounts scoped to that segment: fixed final price → percentage → amount in R$;
3. discounts on the whole subscription, over the sum of the segments: fixed final price →
   percentage → amount in R$.
An exemption sets its scope to zero. A promotional discount (coupon, referral, campaign) marked as
non-cumulative is never combined with other promotional discounts: the cheapest valid combination
wins. Manual discounts always apply.
"""
from dataclasses import dataclass, field
from decimal import Decimal
from itertools import chain

from django.utils import timezone

from .models import DiscountKind, Subscription, SubscriptionDiscount

ZERO = Decimal("0.00")
CENT = Decimal("0.01")
KIND_ORDER = {DiscountKind.FIXED_PRICE: 0, DiscountKind.PERCENTAGE: 1, DiscountKind.FIXED_AMOUNT: 2, DiscountKind.EXEMPTION: 3}


def money(value):
    return Decimal(value or 0).quantize(CENT)


@dataclass
class Line:
    segment_code: str
    name: str
    tier_label: str
    base: Decimal
    on_request: bool = False
    total: Decimal = ZERO
    discounts: list = field(default_factory=list)


def _apply(amount, discounts):
    applied = []
    for discount in sorted(discounts, key=lambda row: (KIND_ORDER[row.kind], row.created_at)):
        before = amount
        value = Decimal(discount.value)
        if discount.kind == DiscountKind.EXEMPTION:
            amount = ZERO
        elif discount.kind == DiscountKind.FIXED_PRICE:
            amount = min(amount, value)
        elif discount.kind == DiscountKind.PERCENTAGE:
            amount = amount - amount * min(value, Decimal("100")) / Decimal("100")
        else:
            amount = amount - value
        amount = max(money(amount), ZERO)
        applied.append((discount, before - amount))
    return amount, applied


def _base_lines(subscription):
    # Inactive segments are kept for reactivation but are not charged.
    contracted = list(subscription.items.all())
    items = [item for item in contracted if item.is_active]
    if contracted:
        return [
            Line(item.segment_code, item.segment_name, item.tier_label,
                 money(item.final_monthly_price if item.final_monthly_price is not None else item.monthly_price),
                 on_request=item.final_monthly_price is None and item.monthly_price is None)
            for item in items
        ]
    plan = subscription.plan
    yearly = subscription.billing_cycle == Subscription.BillingCycle.YEARLY and plan.yearly_price
    return [Line("", plan.name, "Plano", money(plan.yearly_price / Decimal("12") if yearly else plan.monthly_price))]


def _calculate(subscription, discounts):
    lines = _base_lines(subscription)
    for line in lines:
        # A segment discount whose segment is no longer contracted simply stops applying.
        line.total, line.discounts = _apply(line.base, [row for row in discounts if row.segment_code and row.segment_code == line.segment_code])
    subtotal = sum((line.total for line in lines), ZERO)
    total, applied = _apply(subtotal, [row for row in discounts if not row.segment_code])
    return lines, subtotal, total, applied


def _candidates(discounts):
    manual = [row for row in discounts if row.source == SubscriptionDiscount.Source.MANUAL]
    promos = [row for row in discounts if row.source != SubscriptionDiscount.Source.MANUAL]
    stackable = [row for row in promos if row.cumulative]
    exclusive = [row for row in promos if not row.cumulative]
    options = [manual + stackable]
    options.extend(manual + [row] for row in exclusive)
    return options


def active_discounts(subscription, moment=None):
    moment = moment or timezone.now()
    rows = getattr(subscription, "_prefetched_objects_cache", {}).get("discounts")
    rows = rows if rows is not None else subscription.discounts.all()
    return [row for row in rows if row.is_active_at(moment)]


def breakdown(subscription, moment=None):
    """Itemized monthly amount, ready for serializers, invoices and revenue totals."""
    discounts = active_discounts(subscription, moment)
    best = None
    for option in _candidates(discounts):
        result = _calculate(subscription, option)
        if best is None or result[2] < best[2]:
            best = result
    lines, subtotal, total, applied = best
    gross = sum((line.base for line in lines), ZERO)
    serialize = lambda pairs: [{"id": str(row.id), "description": row.description, "kind": row.kind, "source": row.source, "amount": str(amount)} for row, amount in pairs]
    return {
        "currency": "BRL",
        "billing_cycle": subscription.billing_cycle,
        "lines": [{
            "segment_code": line.segment_code, "name": line.name, "tier_label": line.tier_label,
            "base": str(line.base), "on_request": line.on_request, "total": str(line.total), "discounts": serialize(line.discounts),
        } for line in lines],
        "subscription_discounts": serialize(applied),
        "gross": str(gross),
        "subtotal": str(subtotal),
        "discount_total": str(gross - total),
        "total": str(total),
        "applied_discount_ids": sorted({str(row.id) for row, _ in chain(applied, *(line.discounts for line in lines))}),
    }


def monthly_total(subscription, moment=None):
    return Decimal(breakdown(subscription, moment)["total"])
