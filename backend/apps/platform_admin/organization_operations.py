"""Focused organization operations summary using existing quota/adoption/support rules."""
from django.db.models import F, Sum
from django.utils import timezone
from apps.ai_assistant.ticket_services import is_team, visible_tickets
from apps.ai_assistant.ticket_selectors import ticket_metrics
from apps.billing.quotas import organization_usage
from apps.billing.selectors import unpaid_invoices, overdue_invoices
from .adoption import customers, adoption_metrics


def support_metrics(user, organization_id=None):
    if not is_team(user):
        return None
    queryset = visible_tickets(user, staff=True)
    if organization_id is not None:
        queryset = queryset.filter(organization_id=organization_id)
    return ticket_metrics(queryset)


def organization_operations(organization, user):
    usage = organization_usage(organization.pk)
    adoption = adoption_metrics(organization)
    members = customers().filter(organization=organization)
    responsible = members.filter(organization_responsible=True).values("id", "full_name", "email", "is_active").first()
    has_admin = members.filter(is_active=True, role="admin").exists()
    overdue = overdue_invoices().filter(organization=organization)
    billing = {
        "unpaid_count": unpaid_invoices().filter(organization=organization).count(),
        "overdue_count": overdue.count(),
        "overdue_amounts": list(overdue.order_by("currency").values("currency").annotate(outstanding=Sum(F("total") - F("amount_paid")))),
    }
    for amount in billing["overdue_amounts"]:
        amount["outstanding"] = format(amount["outstanding"], ".2f")
    support = support_metrics(user, organization.pk)
    invitation = getattr(organization, "administrator_invitation", None)
    subscription = getattr(organization, "subscription", None)
    issues = []
    def issue(code, severity, section):
        issues.append({"code": code, "severity": severity, "section": section})
    if organization.status != "active":
        issue("organization_blocked", "warning", "registration")
    if not responsible:
        issue("without_responsible", "warning", "users")
    elif not responsible["is_active"]:
        issue("inactive_responsible", "warning", "users")
    if not has_admin:
        issue("without_admin", "warning", "users")
    if invitation and invitation.state in {"pending", "sent", "failed", "expired"}:
        issue(f"invitation_{invitation.state}", "warning" if invitation.state in {"failed", "expired"} else "info", "users")
    if subscription is None:
        issue("without_subscription", "info", "subscription")
    elif subscription.status in {"past_due", "suspended", "cancelled"}:
        issue("subscription_attention", "warning", "subscription")
    if billing["overdue_count"]:
        issue("overdue_invoices", "warning", "invoices")
    if any(metric["status"] in {"at_limit", "over_limit"} for metric in usage["resources"].values()):
        issue("quota_limit", "warning", "consumption")
    elif any(metric["status"] == "warning" for metric in usage["resources"].values()):
        issue("quota_warning", "warning", "consumption")
    if usage["storage"]["unknown_files"] or usage["storage"]["missing_files"]:
        issue("storage_attention", "warning", "consumption")
    if not adoption:
        issue("adoption_pending", "info", "adoption")
    elif adoption["status"] in {"inactive_7", "inactive_15", "inactive_30", "never"}:
        issue("without_use", "warning", "adoption")
    elif adoption["status"] == "unknown":
        issue("adoption_unknown", "info", "adoption")
    if adoption and any(value is False for value in adoption["checklist"].values()):
        issue("onboarding_pending", "info", "adoption")
    if support and support["awaiting_team"]:
        issue("tickets_awaiting_team", "warning", "tickets")
    if support and support["unassigned"]:
        issue("tickets_unassigned", "warning", "tickets")
    return {"calculated_at": timezone.now(), "responsible": responsible, "has_active_admin": has_admin,
            "usage": usage, "adoption": adoption, "billing": billing, "support": support, "issues": issues}
