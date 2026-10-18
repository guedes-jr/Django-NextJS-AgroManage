"""Frozen, reviewed batches with transactional per-organization results."""
import csv
import io
from datetime import timedelta
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from common.permissions import IsPlatformAdmin, IsPlatformStaff
from apps.organizations.models import Organization
from .models import OrganizationBatch, OrganizationBatchItem
from .organization_filters import validated_filters, filter_organizations
from .services import record_platform_action

ACTIONS = ("export", "suspend", "activate", "resend_invitation")
MAX_ITEMS = 10000


def actor_request(actor):
    return SimpleNamespace(user=actor, META={})


def permitted(actor, action):
    check = IsPlatformStaff() if action == "export" else IsPlatformAdmin()
    return check.has_permission(actor_request(actor), None) and not getattr(actor, "support_access_grant", None)


def audit(batch, item, request, message):
    record_platform_action(request=request, action="organization.batch_item", organization=Organization.objects.filter(pk=item.organization_id).first(), object_type="OrganizationBatch", object_id=batch.pk, description=message, extra_data={"batch_id": str(batch.pk), "organization_id": str(item.organization_id), "action": batch.action, "result": item.status})


@transaction.atomic
def prepare_batch(*, request, action, reason="", filters=None, ids=None, all_matching=False, parent=None):
    if action not in ACTIONS:
        raise ValidationError({"action": "Ação inválida."})
    if not permitted(request.user, action):
        raise PermissionDenied()
    if action in {"suspend", "activate"} and not reason.strip():
        raise ValidationError({"reason": "Informe o motivo da alteração de estado."})
    if bool(ids) == bool(all_matching):
        raise ValidationError("Selecione IDs ou todos os resultados, exclusivamente.")
    if ids and filters:
        raise ValidationError("Filtros são aceitos apenas na seleção de todos os resultados.")
    values = validated_filters(filters or {}, strict=True)
    queryset = Organization.objects.all()
    if all_matching:
        queryset = filter_organizations(queryset, values)
    else:
        unique = set(ids)
        queryset = queryset.filter(pk__in=unique)
        if queryset.count() != len(unique):
            raise ValidationError("A seleção contém organização inexistente. Atualize a listagem.")
    records = list(queryset.order_by("pk").values("id", "name", "slug", "document", "email", "status", "plan", "created_at", "subscription__plan__code")[:MAX_ITEMS + 1])
    if not records or len(records) > MAX_ITEMS:
        raise ValidationError(f"Selecione entre 1 e {MAX_ITEMS} organizações por lote.")
    # Normalize dates using the same validated representation used by directory queries.
    normalized = {key: value.isoformat() if hasattr(value, "isoformat") else value for key, value in values.items()}
    batch = OrganizationBatch.objects.create(actor=request.user, action=action, reason=reason.strip(), filters=normalized, total=len(records), expires_at=timezone.now() + timedelta(hours=1), parent=parent)
    items = []
    for row in records:
        org_id = row.pop("id")
        row["plan"] = row.pop("subscription__plan__code") or row["plan"]
        row["created_at"] = row["created_at"].isoformat()
        items.append(OrganizationBatchItem(batch=batch, organization_id=org_id, snapshot=row))
    OrganizationBatchItem.objects.bulk_create(items)
    record_platform_action(request=request, action="organization.batch_prepared", object_type="OrganizationBatch", object_id=batch.pk, description="Seleção de organizações congelada para revisão.", extra_data={"action": action, "total": batch.total, "filters": normalized, "parent_id": str(parent.pk) if parent else None})
    return batch


@transaction.atomic
def confirm_batch(*, batch_id, request, expected_total):
    batch = OrganizationBatch.objects.select_for_update().get(pk=batch_id, actor=request.user)
    if not permitted(request.user, batch.action):
        raise PermissionDenied()
    if expected_total != batch.total:
        raise ValidationError("A quantidade confirmada não corresponde à seleção revisada.")
    if batch.status != "draft":
        return batch
    if batch.expires_at <= timezone.now():
        raise ValidationError("A revisão expirou. Prepare uma nova seleção.")
    batch.status = "queued"
    batch.confirmed_at = timezone.now()
    batch.save(update_fields=["status", "confirmed_at", "updated_at"])
    record_platform_action(request=request, action="organization.batch_confirmed", object_type="OrganizationBatch", object_id=batch.pk, description="Execução do lote confirmada.", extra_data={"action": batch.action, "total": batch.total})
    # Beat also scans the durable queue if publication/broker availability fails.
    from .tasks import process_organization_batch
    transaction.on_commit(lambda: process_organization_batch.delay(str(batch.pk)), robust=True)
    return batch


def finish_delivery(batch, item, request):
    from apps.accounts.models import OrganizationAdministratorInvitation
    invitation = OrganizationAdministratorInvitation.objects.filter(organization_id=item.organization_id).first()
    if invitation and invitation.token_digest == item.invitation_revision and invitation.delivery_status == "sent":
        item.status, item.message = "succeeded", "Convite enviado pelo serviço de e-mail."
    elif invitation and invitation.token_digest == item.invitation_revision and invitation.delivery_status == "pending" and item.updated_at > timezone.now() - timedelta(minutes=2):
        return False
    else:
        item.status, item.message = "failed", "Envio não confirmado. Confira o convite antes de tentar novamente."
    item.completed_at = timezone.now()
    item.save(update_fields=["status", "message", "completed_at", "updated_at"])
    audit(batch, item, request, item.message)
    return True


def process_batch(batch_id):
    # Each item commits separately. Duplicate workers serialize on the batch row;
    # no lifecycle operation can commit without its durable terminal result.
    while True:
        with transaction.atomic():
            batch = OrganizationBatch.objects.select_for_update().get(pk=batch_id)
            if batch.status not in {"queued", "running"}:
                return
            actor = get_user_model().objects.get(pk=batch.actor_id)
            request = actor_request(actor)
            item = batch.items.filter(status__in=["pending", "delivery_pending"]).order_by("pk").first()
            if not item:
                batch.status = "completed"
                batch.completed_at = timezone.now()
                batch.save(update_fields=["status", "completed_at", "updated_at"])
                record_platform_action(request=request, action="organization.batch_completed", object_type="OrganizationBatch", object_id=batch.pk, description="Processamento do lote concluído.", extra_data={"results": dict(batch.items.values("status").annotate(total=Count("pk")).values_list("status", "total"))})
                return
            batch.status = "running"
            batch.save(update_fields=["status", "updated_at"])
            if item.status == "delivery_pending":
                if not finish_delivery(batch, item, request):
                    return
                continue
            if not permitted(actor, batch.action):
                item.status, item.message = "failed", "Permissão do autor revogada."
            else:
                try:
                    with transaction.atomic():
                        organization = Organization.objects.select_for_update().get(pk=item.organization_id)
                        if batch.action == "export":
                            item.status, item.message = "succeeded", "Registro incluído na exportação revisada."
                        elif batch.action in {"suspend", "activate"}:
                            from apps.organizations.services import transition_organization
                            target = "suspended" if batch.action == "suspend" else "active"
                            if organization.status == target:
                                item.status, item.message = "skipped", "Organização já está no estado solicitado."
                            elif batch.action == "activate" and organization.status != "suspended":
                                item.status, item.message = "skipped", "A reativação em lote é permitida apenas para organizações suspensas."
                            elif batch.action == "suspend" and organization.status != "active":
                                item.status, item.message = "skipped", "A suspensão em lote é permitida apenas para organizações ativas."
                            else:
                                transition_organization(organization_id=organization.pk, target=target, reason=batch.reason, request=request)
                                item.status, item.message = "succeeded", "Estado atualizado."
                        else:
                            from apps.accounts.invitations import resend_invitation
                            from apps.accounts.models import OrganizationAdministratorInvitation
                            resend_invitation(organization_id=organization.pk, request=request)
                            item.invitation_revision = OrganizationAdministratorInvitation.objects.get(organization=organization).token_digest
                            item.status, item.message = "delivery_pending", "Aguardando confirmação do envio."
                except Organization.DoesNotExist:
                    item.status, item.message = "failed", "Organização não encontrada."
                except Exception as exc:
                    # Never persist provider/database exception strings or credentials.
                    item.status = "failed"
                    item.message = "Organização inelegível ou limite insuficiente." if isinstance(exc, ValidationError) else "Não foi possível concluir a ação. Tente novamente após verificar a organização."
            item.completed_at = timezone.now() if item.status != "delivery_pending" else None
            item.save(update_fields=["status", "message", "completed_at", "invitation_revision", "updated_at"])
            if item.status != "delivery_pending":
                audit(batch, item, request, item.message)
        # Existing invitation delivery callbacks run here, after the item commit.


@transaction.atomic
def retry_batch(*, batch_id, request):
    parent = OrganizationBatch.objects.select_for_update().get(pk=batch_id, actor=request.user)
    if parent.status != "completed":
        raise ValidationError("Aguarde a conclusão antes de retentar falhas.")
    # A single follow-up review prevents repeated clicks from resending successes.
    existing = OrganizationBatch.objects.filter(parent=parent).order_by("-created_at").first()
    if existing and not (existing.status == "draft" and existing.expires_at <= timezone.now()):
        if not permitted(request.user, existing.action):
            raise PermissionDenied()
        return existing
    ids = list(parent.items.filter(status="failed").values_list("organization_id", flat=True))
    return prepare_batch(request=request, action=parent.action, reason=parent.reason, ids=ids, parent=parent)


def batch_csv(batch):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["id", "nome", "slug", "documento", "email", "estado", "plano", "cadastro"])
    def cell(value):
        text = str(value or "")
        return "'" + text if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n")) else text
    for item in batch.items.filter(status="succeeded").order_by("pk").iterator(chunk_size=200):
        writer.writerow([str(item.organization_id)] + [cell(item.snapshot.get(key)) for key in ("name", "slug", "document", "email", "status", "plan", "created_at")])
    return "\ufeff" + output.getvalue()
