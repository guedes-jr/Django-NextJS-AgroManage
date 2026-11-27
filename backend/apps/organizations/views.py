from django.utils.translation import gettext as translate_message
from rest_framework import status, viewsets
from common.permissions import OrganizationRolePermission
from rest_framework.decorators import api_view, permission_classes, parser_classes
from common.permissions import IsTenantAccessAllowed as IsAuthenticated
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.response import Response
import os
import subprocess
from django.conf import settings
from django.utils import timezone
from django.utils.translation import gettext as _
from django.db import transaction
from decimal import Decimal
from .models import OrganizationAddress, OrganizationContact
from .serializers import (
    OrganizationSerializer, 
    OrganizationAddressSerializer, 
    OrganizationContactSerializer
)
from common.permissions import IsPlatformAdmin
from apps.billing.models import Subscription, SubscriptionItem, SubscriptionQuote
from apps.billing.serializers import SubscriptionQuoteInputSerializer, PublicSubscriptionQuoteSerializer
from apps.billing.services import create_manual_invoice, create_subscription_quote

@api_view(["GET", "PUT", "PATCH"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def my_organization_view(request):
    """Get or update current user's organization."""
    org = getattr(request.user, "organization", None)
    
    if not org:
        return Response(
            {"detail": _("Usuário não vinculado a uma organização.")},
            status=status.HTTP_404_NOT_FOUND
        )

    if request.method == "GET":
        if request.user.role == "operator":
            return Response({"id": str(org.pk), "name": org.name, "language": org.language, "subscription": None})
        return Response(OrganizationSerializer(org).data)

    # Permission check: Only Owners or Admins can edit organization data
    if request.user.role not in ["admin"]:
        return Response(
            {"detail": _("Apenas administradores podem editar dados da organização.")},
            status=status.HTTP_403_FORBIDDEN
        )

    serializer = OrganizationSerializer(org, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    
    return Response(serializer.data)


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def segment_features_view(request):
    """Optional features per segment (Configurações › Recursos dos segmentos). Admin edits."""
    from apps.audit.models import AuditLog
    from apps.audit.services import record_client_action
    from . import segment_features

    org = getattr(request.user, "organization", None)
    if not org:
        return Response({"detail": _("Usuário não vinculado a uma organização.")}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "GET":
        return Response({"segments": segment_features.feature_map(org), "can_edit": request.user.role == "admin"})
    if request.user.role != "admin":
        return Response({"detail": _("Apenas administradores podem alterar os recursos dos segmentos.")}, status=status.HTTP_403_FORBIDDEN)
    try:
        segments = segment_features.update(org, request.user, request.data.get("segments"))
    except ValueError as error:
        return Response({"detail": _("Recurso inválido: %(code)s") % {"code": error}}, status=status.HTTP_400_BAD_REQUEST)
    record_client_action(
        request=request, action=AuditLog.Action.UPDATE, model_name="SegmentFeature", object_id=org.pk,
        description=f"Recursos dos segmentos alterados: {request.data.get('segments')}",
    )
    return Response({"segments": segments, "can_edit": True})


def _current_monthly_total(subscription):
    from apps.billing.pricing import monthly_total

    return monthly_total(subscription)


def _change_preview(subscription, quote):
    current_monthly = _current_monthly_total(subscription)
    difference = quote.monthly_total - current_monthly
    remaining_days = 0
    if subscription.current_period_ends_at and subscription.current_period_ends_at > timezone.now():
        remaining_days = max((subscription.current_period_ends_at - timezone.now()).days, 0)
    if subscription.billing_cycle == Subscription.BillingCycle.YEARLY and quote.billing_cycle == SubscriptionQuote.BillingCycle.MONTHLY:
        effective_at = "next_renewal"
        prorata = Decimal("0.00")
    elif subscription.billing_cycle == Subscription.BillingCycle.MONTHLY and quote.billing_cycle == SubscriptionQuote.BillingCycle.YEARLY:
        effective_at = "immediately"
        current_credit = current_monthly * Decimal(min(remaining_days, 30)) / Decimal("30")
        prorata = max(quote.billing_total - current_credit, Decimal("0.00")).quantize(Decimal("0.01"))
    else:
        effective_at = "immediately" if difference >= 0 else "next_renewal"
        prorata = (difference * Decimal(min(remaining_days, 30)) / Decimal("30")).quantize(Decimal("0.01"))
    return {
        "quote": PublicSubscriptionQuoteSerializer(quote).data,
        "current_monthly_total": current_monthly,
        "new_monthly_total": quote.monthly_total,
        "monthly_difference": difference,
        "prorated_difference": prorata,
        "remaining_days": remaining_days,
        "effective_at": effective_at,
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def subscription_change_preview_view(request):
    org = getattr(request.user, "organization", None)
    if not org or not hasattr(org, "subscription"):
        return Response({"detail": translate_message("Assinatura não encontrada.")}, status=status.HTTP_404_NOT_FOUND)
    serializer = SubscriptionQuoteInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    quote = create_subscription_quote(**serializer.validated_data)
    return Response(_change_preview(org.subscription, quote), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def subscription_change_confirm_view(request):
    if request.user.role not in ["admin"]:
        return Response({"detail": translate_message("Apenas administradores podem alterar a assinatura.")}, status=status.HTTP_403_FORBIDDEN)
    org = getattr(request.user, "organization", None)
    if not org or not hasattr(org, "subscription"):
        return Response({"detail": translate_message("Assinatura não encontrada.")}, status=status.HTTP_404_NOT_FOUND)
    try:
        quote = SubscriptionQuote.objects.prefetch_related("items__tier").get(public_token=request.data.get("quote_token"))
    except (SubscriptionQuote.DoesNotExist, ValueError, TypeError):
        return Response({"detail": translate_message("Orçamento inválido.")}, status=status.HTTP_400_BAD_REQUEST)
    if quote.status != SubscriptionQuote.Status.DRAFT or quote.is_expired:
        return Response({"detail": translate_message("Este orçamento não está mais disponível.")}, status=status.HTTP_400_BAD_REQUEST)
    if quote.requires_contact:
        return Response({"detail": translate_message("Esta composição precisa de atendimento comercial.")}, status=status.HTTP_400_BAD_REQUEST)

    subscription = org.subscription
    preview = _change_preview(subscription, quote)
    if preview["effective_at"] == "next_renewal":
        return Response({"detail": translate_message("Downgrades serão disponibilizados após a integração de agendamento para a próxima renovação.")}, status=status.HTTP_400_BAD_REQUEST)

    previous_codes = set(subscription.items.values_list("segment_code", flat=True))
    subscription.items.all().delete()
    SubscriptionItem.objects.bulk_create([
        SubscriptionItem(
            subscription=subscription,
            tier=item.tier,
            segment_code=item.segment_code,
            segment_name=item.segment_name,
            segment_subtitle=item.segment_subtitle,
            tier_label=item.tier_label,
            monthly_price=item.monthly_price,
            discount_percent=item.discount_percent,
            final_monthly_price=item.final_monthly_price,
        ) for item in quote.items.all()
    ])
    subscription.billing_cycle = quote.billing_cycle
    subscription.save(update_fields=("billing_cycle", "updated_at"))
    from apps.billing import segments as segment_catalog
    from apps.billing.subscriptions import _drop_member_scope

    segment_catalog.forget(org)
    for code in previous_codes - {item.segment_code for item in quote.items.all()}:
        _drop_member_scope(org, code)
    invoice = None
    if preview["prorated_difference"] > 0:
        invoice = create_manual_invoice(
            organization=org,
            due_date=timezone.localdate(),
            description=f"Alteração de assinatura — orçamento {quote.public_token}",
            amount=preview["prorated_difference"],
        )
    quote.status = SubscriptionQuote.Status.CONVERTED
    quote.save(update_fields=("status", "updated_at"))
    return Response({
        "detail": translate_message("Plano atualizado com sucesso."),
        "subscription": OrganizationSerializer(org).data["subscription"],
        "invoice": {"id": str(invoice.id), "number": invoice.number, "total": invoice.total} if invoice else None,
    })


@api_view(["POST"])
@permission_classes([IsPlatformAdmin])
def update_project_view(request):
    """Trigger the update_project command in the background."""
    command = getattr(settings, "UPDATE_PROJECT_COMMAND", "/home/deploy/bin/update_project")

    # Determine log folder and file path
    logs_dir = settings.BASE_DIR.parent / "logs"
    if not logs_dir.exists():
        logs_dir = settings.BASE_DIR / "logs"

    try:
        logs_dir.mkdir(parents=True, exist_ok=True)
        log_path = logs_dir / "update_project.log"
        # Overwrite file to clear past execution logs
        log_file = open(log_path, "w")
        log_file.write(f"--- Update triggered by user {request.user.email} at {timezone.now()} ---\n")
        log_file.flush()
    except Exception:
        # Fallback to devnull if we can't write to log file
        log_file = open(os.devnull, "w")

    # Pass the password as an environment variable to the subprocess
    env_vars = os.environ.copy()
    deploy_user = getattr(settings, "DEPLOY_USER", "deploy")
    deploy_password = getattr(settings, "DEPLOY_PASSWORD", "")
    update_timeout_seconds = getattr(settings, "UPDATE_TIMEOUT_SECONDS", "600")
    if update_timeout_seconds:
        env_vars["UPDATE_TIMEOUT_SECONDS"] = str(update_timeout_seconds)
    if deploy_user:
        env_vars["DEPLOY_USER"] = deploy_user
    if deploy_password:
        env_vars["DEPLOY_PASSWORD"] = deploy_password

    try:
        # Start the process in a new session (detached)
        proc = subprocess.Popen(
            [command],
            stdout=log_file,
            stderr=log_file,
            env=env_vars,
            start_new_session=True
        )

        # Write PID to file
        pid_path = logs_dir / "update_project.pid"
        try:
            pid_path.write_text(str(proc.pid))
        except Exception:
            pass

        return Response(
            {
                "detail": translate_message("Atualização do projeto iniciada com sucesso em segundo plano. O sistema pode ficar temporariamente indisponível durante a reinicialização dos serviços.")
            },
            status=status.HTTP_200_OK
        )
    except Exception as e:
        return Response(
            {"detail": f"Falha ao iniciar o comando de atualização: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(["GET"])
@permission_classes([IsPlatformAdmin])
def update_logs_view(request):
    """Retrieve the current update logs, calculate progress, and check status."""
    # Determine log folder
    logs_dir = settings.BASE_DIR.parent / "logs"
    if not logs_dir.exists():
        logs_dir = settings.BASE_DIR / "logs"

    log_path = logs_dir / "update_project.log"
    pid_path = logs_dir / "update_project.pid"

    # Read log content
    log_content = ""
    if log_path.exists():
        try:
            log_content = log_path.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            log_content = f"Erro ao ler arquivo de log: {str(e)}"

    # Determine status by checking if process is running
    status_str = "idle"
    pid = None
    if pid_path.exists():
        try:
            pid = int(pid_path.read_text().strip())
        except Exception:
            pass

    is_running = False
    if pid is not None:
        try:
            # Check if process exists on Linux
            os.kill(pid, 0)
            is_running = True
            status_str = "running"
        except OSError:
            # Process is not running anymore
            is_running = False

    # Calculate progress and adjust status if process finished
    progress = 0
    if log_content:
        # If it finished successfully
        if "Atualização concluída com sucesso!" in log_content:
            progress = 100
            status_str = "success"
        # If there's an error marker
        elif "[ERRO]" in log_content:
            status_str = "failed"
            progress = calculate_progress_pct(log_content)
        elif is_running:
            status_str = "running"
            progress = calculate_progress_pct(log_content)
        else:
            # Not running and not success or error marker -> likely crashed/terminated unexpectedly
            status_str = "failed"
            progress = calculate_progress_pct(log_content)
    else:
        if is_running:
            status_str = "running"
            progress = 5

    return Response({
        "status": status_str,
        "progress": progress,
        "logs": log_content
    })


def calculate_progress_pct(log_content):
    markers = [
        ("[DEPLOY] Atualização concluída com sucesso!", 100),
        ("[DEPLOY] Testando frontend local...", 98),
        ("[DEPLOY] Testando backend local...", 96),
        ("[DEPLOY] Verificando status do frontend...", 94),
        ("[DEPLOY] Verificando status do backend...", 92),
        ("[DEPLOY] Reiniciando serviços...", 90),
        ("[DEPLOY] Gerando build do Next.js...", 75),
        ("[DEPLOY] Instalando dependências do frontend...", 60),
        ("[DEPLOY] Coletando arquivos estáticos...", 55),
        ("[DEPLOY] Aplicando migrations...", 45),
        ("[DEPLOY] Checando configuração Django...", 40),
        ("[DEPLOY] Garantindo Gunicorn instalado...", 35),
        ("[DEPLOY] Instalando dependências do backend...", 30),
        ("[DEPLOY] Limpando arquivos não rastreados...", 25),
        ("[DEPLOY] Atualizando código para", 20),
        ("[DEPLOY] Buscando atualizações", 15),
        ("[DEPLOY] Salvando commit atual", 10),
        ("[DEPLOY] Verificando repositório Git...", 5),
    ]
    for marker, pct in markers:
        if marker in log_content:
            return pct
    return 0



class OrganizationBaseViewSet(viewsets.ModelViewSet):
    permission_classes = [OrganizationRolePermission]

    def get_queryset(self):
        org = getattr(self.request.user, "organization", None)
        if not org:
            return self.queryset.none()
        return self.queryset.filter(organization=org)

    def perform_create(self, serializer):
        org = getattr(self.request.user, "organization", None)
        serializer.save(organization=org)

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method not in ['GET'] and request.user.role not in ["admin"]:
            self.permission_denied(request, message="Apenas administradores podem editar.")


class OrganizationAddressViewSet(OrganizationBaseViewSet):
    queryset = OrganizationAddress.objects.all()
    serializer_class = OrganizationAddressSerializer


class OrganizationContactViewSet(OrganizationBaseViewSet):
    queryset = OrganizationContact.objects.all()
    serializer_class = OrganizationContactSerializer


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def subscription_coupon_view(request):
    """Redeem a promotional coupon on the organization's subscription (admin only)."""
    from apps.audit.models import AuditLog
    from apps.audit.services import record_client_action
    from apps.billing.pricing import breakdown
    from apps.billing.subscriptions import redeem_coupon

    org = getattr(request.user, "organization", None)
    if not org or not hasattr(org, "subscription"):
        return Response({"detail": translate_message("Assinatura não encontrada.")}, status=status.HTTP_404_NOT_FOUND)
    if request.user.role != "admin":
        return Response({"detail": translate_message("Somente administradores aplicam cupons.")}, status=status.HTTP_403_FORBIDDEN)
    discount = redeem_coupon(org.subscription, request.data.get("code"), actor=request.user)
    record_client_action(request=request, action=AuditLog.Action.UPDATE, model_name="SubscriptionDiscount", object_id=discount.pk, description=f"Cupom aplicado: {discount.description}")
    return Response(breakdown(org.subscription), status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_invoices_view(request):
    """Plan invoices of the organization with the open charge link (admin and manager, as the Financeiro)."""
    from apps.billing.models import Invoice, Payment

    user = request.user
    org = getattr(user, "organization", None)
    if not org or user.role not in ("admin", "manager"):
        return Response({"detail": translate_message("Sem acesso às faturas do plano.")}, status=status.HTTP_403_FORBIDDEN)
    rows = []
    invoices = Invoice.objects.filter(organization=org).exclude(status=Invoice.Status.DRAFT).prefetch_related("payments").order_by("-due_date")[:24]
    today = timezone.localdate()
    for invoice in invoices:
        pending = next((row for row in invoice.payments.all() if row.status == Payment.Status.PENDING and row.provider != "manual"), None)
        meta = pending.metadata if pending else {}
        open_balance = invoice.total - invoice.amount_paid
        rows.append({
            "id": str(invoice.pk), "number": invoice.number, "status": invoice.status, "due_date": invoice.due_date,
            "total": str(invoice.total), "amount_paid": str(invoice.amount_paid), "balance": str(max(open_balance, Decimal("0.00"))),
            "overdue": invoice.status in {Invoice.Status.OPEN, Invoice.Status.OVERDUE} and open_balance > 0 and invoice.due_date < today,
            "paid_at": invoice.paid_at, "notes": invoice.notes,
            "payment_url": meta.get("payment_url", ""), "pix_copy_paste": meta.get("pix_copy_paste", ""),
        })
    subscription = getattr(org, "subscription", None)
    return Response({"subscription_status": getattr(subscription, "status", None), "results": rows})
