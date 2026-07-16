import time

from django.contrib.auth import get_user_model
from django.db.models import Count, F

from apps.billing.models import Invoice, Subscription
from apps.organizations.models import Organization

from .models import BackgroundTaskRun


MAX_ROWS = 200
QUERIES = {
    "organization_overview": {
        "name": "Visão geral das organizações",
        "description": "Organizações, plano legado, situação e quantidade de usuários.",
        "requires_organization": False,
    },
    "organization_users": {
        "name": "Usuários de uma organização",
        "description": "Usuários, papéis e situação de acesso do tenant selecionado.",
        "requires_organization": True,
    },
    "billing_inconsistencies": {
        "name": "Inconsistências de faturamento",
        "description": "Faturas cujo valor pago supera o total ou cujo status pago não possui quitação integral.",
        "requires_organization": False,
    },
    "expired_subscriptions": {
        "name": "Assinaturas vencidas",
        "description": "Assinaturas ativas ou em teste cujo período vigente já terminou.",
        "requires_organization": False,
    },
    "failed_tasks": {
        "name": "Tarefas com erro",
        "description": "Falhas recentes de tarefas assíncronas, sem stack trace ou payload sensível.",
        "requires_organization": False,
    },
}


def available_queries():
    return [{"key": key, **value} for key, value in QUERIES.items()]


def run_approved_query(key, organization_id=None):
    if key not in QUERIES:
        raise ValueError("Consulta aprovada inexistente.")
    if QUERIES[key]["requires_organization"] and not organization_id:
        raise ValueError("Selecione uma organização para executar esta consulta.")

    started = time.monotonic()
    if key == "organization_overview":
        columns = ["id", "nome", "plano", "ativa", "usuarios", "criada_em"]
        queryset = Organization.objects.annotate(users_count=Count("members")).values_list(
            "id", "name", "plan", "is_active", "users_count", "created_at"
        ).order_by("-created_at")
    elif key == "organization_users":
        columns = ["id", "nome", "email_mascarado", "papel", "ativo", "criado_em"]
        queryset = get_user_model().objects.filter(organization_id=organization_id).annotate(
            masked_email=F("email")
        ).values_list("id", "full_name", "masked_email", "role", "is_active", "created_at").order_by("full_name")
    elif key == "billing_inconsistencies":
        columns = ["fatura", "organizacao", "status", "total", "valor_pago", "vencimento"]
        queryset = Invoice.objects.filter(
            models_filter_billing_inconsistency()
        ).values_list("number", "organization__name", "status", "total", "amount_paid", "due_date")
    elif key == "expired_subscriptions":
        from django.utils import timezone

        columns = ["organizacao", "plano", "status", "fim_periodo"]
        queryset = Subscription.objects.filter(
            status__in=[Subscription.Status.ACTIVE, Subscription.Status.TRIALING],
            current_period_ends_at__lt=timezone.now(),
        ).values_list("organization__name", "plan__name", "status", "current_period_ends_at")
    else:
        columns = ["tarefa", "tipo", "erro", "duracao_ms", "criada_em"]
        queryset = BackgroundTaskRun.objects.filter(status=BackgroundTaskRun.Status.FAILURE).values_list(
            "task_id", "task_name", "error_class", "duration_ms", "created_at"
        )

    raw_rows = list(queryset[: MAX_ROWS + 1])
    rows = [[serialize_value(value, column) for value, column in zip(row, columns)] for row in raw_rows[:MAX_ROWS]]
    truncated = len(raw_rows) > MAX_ROWS
    return {
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "was_truncated": truncated,
        "truncated": truncated,
        "duration_ms": int((time.monotonic() - started) * 1000),
    }


def models_filter_billing_inconsistency():
    from django.db.models import Q

    return Q(amount_paid__gt=F("total")) | Q(status=Invoice.Status.PAID, amount_paid__lt=F("total"))


def serialize_value(value, column):
    if value is None:
        return None
    if column == "email_mascarado":
        local, separator, domain = str(value).partition("@")
        return f"{local[:2]}***{separator}{domain}" if separator else "***"
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value) if value.__class__.__name__ == "Decimal" else value
