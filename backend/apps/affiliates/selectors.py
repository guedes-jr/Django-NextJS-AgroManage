from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce

from .models import Commission, CommissionAdjustment, ReferralAttribution


def affiliate_dashboard_summary(affiliate):
    attributions = affiliate.attributions.exclude(
        status=ReferralAttribution.Status.INVALIDATED
    )
    commissions = affiliate.commissions.all()
    commission_totals = commissions.aggregate(
        total=Coalesce(Sum("commission_amount"), Decimal("0.00")),
        pending=Coalesce(
            Sum("commission_amount", filter=Q(status=Commission.Status.PENDING)),
            Decimal("0.00"),
        ),
        approved=Coalesce(
            Sum("commission_amount", filter=Q(status=Commission.Status.APPROVED)),
            Decimal("0.00"),
        ),
        paid=Coalesce(
            Sum("commission_amount", filter=Q(status=Commission.Status.PAID)),
            Decimal("0.00"),
        ),
        cancelled=Coalesce(
            Sum("commission_amount", filter=Q(status=Commission.Status.CANCELLED)),
            Decimal("0.00"),
        ),
    )
    reversed_total = CommissionAdjustment.objects.filter(
        commission__affiliate=affiliate,
        adjustment_type=CommissionAdjustment.AdjustmentType.REVERSAL,
    ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
    return {
        "clicks": affiliate.visits.count(),
        "unique_visitors": affiliate.visits.aggregate(total=Count("visitor_id", distinct=True))[
            "total"
        ],
        "registrations": attributions.filter(user__isnull=False).count(),
        "converted_customers": attributions.filter(
            status=ReferralAttribution.Status.CONVERTED
        ).count(),
        "commissions": commission_totals,
        "reversed_total": reversed_total,
    }
