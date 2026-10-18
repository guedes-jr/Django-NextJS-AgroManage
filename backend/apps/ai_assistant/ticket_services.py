"""Tenant-scoped human support with immutable messages and private attachments."""
import hashlib
import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django.utils.text import get_valid_filename
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.generics import get_object_or_404

from common.permissions import IsPlatformSupport
from apps.platform_admin.models import PlatformStaffProfile, PlatformAuditLog
from apps.notifications.services import NotificationService
from .models import AIConversation, SupportTicket, SupportTicketMessage, SupportTicketEvent, SupportTicketAttachment


class TicketConflict(APIException):
    status_code = 409
    default_detail = "O chamado foi atualizado. Atualize a tela antes de continuar."


def is_team(user):
    from types import SimpleNamespace
    return IsPlatformSupport().has_permission(SimpleNamespace(user=user), None) and not getattr(user, "support_access_grant", None)


def is_customer(user):
    return bool(user and user.is_authenticated and user.is_active and user.organization_id and user.organization.is_active
                and not getattr(user, "support_access_grant", None)
                and not hasattr(user, "platform_staff_profile")
                and not getattr(getattr(user, "affiliate_profile", None), "portal_access_only", False))


def visible_tickets(user, staff=False):
    queryset = SupportTicket.objects.select_related("organization", "requester", "assignee")
    if staff:
        return queryset if is_team(user) else queryset.none()
    if not is_customer(user):
        return queryset.none()
    queryset = queryset.filter(organization_id=user.organization_id)
    return queryset if user.role == "admin" else queryset.filter(requester=user)


def locked_ticket(user, ticket_id, staff):
    return get_object_or_404(visible_tickets(user, staff).select_for_update(of=("self",)), pk=ticket_id)


def check_version(ticket, expected):
    if ticket.version != expected:
        raise TicketConflict()


def changed(ticket):
    ticket.version += 1
    ticket.save()


def event(ticket, user, kind, description, changes=None, internal=False):
    value = SupportTicketEvent.objects.create(ticket=ticket, actor=user, kind=kind, description=description, changes=changes or {}, is_internal=internal)
    PlatformAuditLog.objects.create(actor=user, organization_id=ticket.organization_id, action=f"support.ticket.{kind}", object_type="SupportTicket", object_id=str(ticket.pk), description=description, extra_data={"event_id": str(value.pk), "internal": internal})
    return value


def team_recipients(ticket):
    queryset = get_user_model().objects.filter(is_active=True, platform_staff_profile__is_active=True, platform_staff_profile__role__in=["platform_owner", "platform_admin", "platform_support"])
    if ticket.assignee_id and queryset.filter(pk=ticket.assignee_id).exists():
        return queryset.filter(pk=ticket.assignee_id)
    return queryset


def notify(ticket, key, *, to_team=False, actor=None):
    if to_team:
        recipients = team_recipients(ticket)
        link = f"/platform/tickets/{ticket.pk}"
    else:
        recipients = get_user_model().objects.filter(pk=ticket.requester_id, is_active=True, organization_id=ticket.organization_id, platform_staff_profile__isnull=True).exclude(affiliate_profile__portal_access_only=True)
        link = f"/home/suporte/chamados/{ticket.pk}"
    for user in recipients:
        if actor and user.pk == actor.pk:
            continue
        # Generic notification text prevents internal notes or customer secrets from
        # appearing in external delivery; preferences and category policy still apply.
        NotificationService.create(user, "Atualização de chamado", "Há uma atualização de atendimento. Consulte o chamado no sistema.", link=link, event_key=f"support.ticket:{key}")


@transaction.atomic
def open_ticket(*, user, values):
    if not is_customer(user):
        raise PermissionDenied()
    from apps.organizations.models import Organization
    organization = Organization.objects.select_for_update().get(pk=user.organization_id)
    if not organization.is_active:
        raise PermissionDenied()
    data = dict(values)
    body = data.pop("body")
    conversation_id = data.pop("conversation_id", None)
    creation_digest = hashlib.sha256(json.dumps({**data, "body": body, "conversation_id": conversation_id}, sort_keys=True, default=str).encode()).hexdigest()
    previous = SupportTicket.objects.filter(organization_id=user.organization_id, requester=user, creation_key=data["creation_key"]).first()
    if previous:
        if previous.creation_digest != creation_digest:
            raise TicketConflict("A chave de criação já foi usada com outros dados.")
        return previous
    conversation = None
    if conversation_id:
        conversation = get_object_or_404(AIConversation, pk=conversation_id, organization_id=user.organization_id, user=user, subject="support")
        if not data.get("shared_context", "").strip():
            raise ValidationError({"shared_context": "Revise e informe o resumo que deseja compartilhar."})
    elif data.get("shared_context"):
        raise ValidationError({"conversation_id": "Selecione sua conversa para compartilhar o resumo."})
    ticket = SupportTicket.objects.create(organization_id=user.organization_id, requester=user, conversation=conversation, creation_digest=creation_digest, **data)
    message = SupportTicketMessage.objects.create(ticket=ticket, author=user, body=body, request_key=data["creation_key"])
    event(ticket, user, "opened", "Chamado aberto pelo cliente.")
    notify(ticket, message.pk, to_team=True, actor=user)
    return ticket


@transaction.atomic
def add_message(*, user, ticket_id, values, staff=False):
    ticket = locked_ticket(user, ticket_id, staff)
    data = dict(values)
    expected = data.pop("expected_version")
    internal = data.get("is_internal", False)
    if internal and not staff:
        raise PermissionDenied()
    previous = ticket.messages.filter(request_key=data["request_key"]).first()
    if previous:
        if previous.author_id != user.pk or previous.body != data["body"] or previous.is_internal != internal:
            raise TicketConflict("A chave de mensagem já foi usada com outros dados.")
        return ticket, previous
    check_version(ticket, expected)
    if ticket.status in {"resolved", "closed"}:
        raise ValidationError("Reabra o chamado antes de enviar mensagens.")
    message = SupportTicketMessage.objects.create(ticket=ticket, author=user, from_team=staff, **data)
    if staff and not internal and not ticket.first_response_at:
        ticket.first_response_at = timezone.now()
    if not staff and ticket.status == "waiting_customer":
        old = ticket.status
        ticket.status = "in_progress"
        event(ticket, user, "status_changed", "Cliente respondeu; chamado voltou ao atendimento.", {"from": old, "to": ticket.status})
    changed(ticket)
    event(ticket, user, "note_added" if internal else "message_added", "Nota interna adicionada." if internal else "Mensagem pública adicionada.", internal=internal)
    notify(ticket, message.pk, to_team=not staff or internal, actor=user)
    return ticket, message


@transaction.atomic
def change_metadata(*, user, ticket_id, values):
    if not is_team(user):
        raise PermissionDenied()
    ticket = locked_ticket(user, ticket_id, True)
    data = dict(values)
    check_version(ticket, data.pop("expected_version"))
    changes = {}
    if "assignee_id" in data:
        assignee_id = data["assignee_id"]
        assignee = None
        if assignee_id:
            assignee = get_object_or_404(get_user_model(), pk=assignee_id, is_active=True, platform_staff_profile__is_active=True, platform_staff_profile__role__in=["platform_owner", "platform_admin", "platform_support"])
        if ticket.assignee_id != assignee_id:
            changes["assignee"] = {"from": str(ticket.assignee_id) if ticket.assignee_id else None, "to": str(assignee_id) if assignee_id else None}
            old_name = ticket.assignee.full_name if ticket.assignee else "Sem atribuição"
            new_name = assignee.full_name if assignee else "Sem atribuição"
            ticket.assignee = assignee
            assignment = event(ticket, user, "assignment_changed", f"Atendente alterado: {old_name} → {new_name}."[:500], {**changes["assignee"], "from_name": old_name, "to_name": new_name}, internal=True)
            notify(ticket, assignment.pk, to_team=True, actor=user)
    for key in ("category", "priority"):
        if key in data and getattr(ticket, key) != data[key]:
            changes[key] = {"from": getattr(ticket, key), "to": data[key]}
            setattr(ticket, key, data[key])
    if changes:
        changed(ticket)
        public = {key: value for key, value in changes.items() if key != "assignee"}
        if public:
            event(ticket, user, "metadata_changed", "Categoria ou prioridade atualizada.", public)
    return ticket


@transaction.atomic
def transition_ticket(*, user, ticket_id, values, staff=False):
    ticket = locked_ticket(user, ticket_id, staff)
    check_version(ticket, values["expected_version"])
    target = values["status"]
    allowed = {"open": {"in_progress", "waiting_customer", "resolved"}, "in_progress": {"waiting_customer", "resolved"}, "waiting_customer": {"in_progress", "resolved"}, "resolved": {"closed", "open"}, "closed": {"open"}}
    if target not in allowed[ticket.status] or (not staff and target not in {"resolved", "closed", "open"}):
        raise ValidationError("Transição inválida para este chamado.")
    previous = ticket.status
    ticket.status = target
    if target == "resolved":
        ticket.resolved_at = timezone.now()
        ticket.first_resolved_at = ticket.first_resolved_at or ticket.resolved_at
    elif target == "closed":
        ticket.closed_at = timezone.now()
    elif target == "open":
        ticket.resolved_at = ticket.closed_at = None
    changed(ticket)
    value = event(ticket, user, "status_changed", "Estado do chamado atualizado.", {"from": previous, "to": target})
    notify(ticket, value.pk, to_team=not staff, actor=user)
    return ticket


def upload_attachment(*, user, ticket_id, message_id, values, staff=False):
    file = values["file"]
    limit = 10 * 1024 * 1024
    if file.size > limit or file.size <= 0:
        raise ValidationError({"file": "Envie um arquivo de até 10 MB, não vazio."})
    allowed = {".pdf", ".txt", ".csv", ".png", ".jpg", ".jpeg", ".webp", ".xlsx", ".docx", ".zip"}
    if Path(file.name).suffix.lower() not in allowed:
        raise ValidationError({"file": "Formato não permitido. Use PDF, texto, CSV, imagem, XLSX, DOCX ou ZIP."})
    digest = hashlib.sha256()
    size = 0
    for chunk in file.chunks():
        size += len(chunk)
        if size > limit:
            raise ValidationError({"file": "O limite do arquivo é 10 MB."})
        digest.update(chunk)
    file.seek(0)
    attachment = None
    try:
        with transaction.atomic():
            # Quota writers lock organization first; avoid ticket->organization deadlocks.
            from apps.organizations.models import Organization
            candidate = get_object_or_404(visible_tickets(user, staff), pk=ticket_id)
            Organization.objects.select_for_update().get(pk=candidate.organization_id)
            ticket = locked_ticket(user, ticket_id, staff)
            message = get_object_or_404(ticket.messages, pk=message_id, author=user)
            if message.is_internal and not staff:
                raise PermissionDenied()
            previous = message.attachments.filter(request_key=values["request_key"]).first()
            if previous:
                if previous.digest != digest.hexdigest():
                    raise TicketConflict("A chave do anexo já foi usada com outro arquivo.")
                return ticket, previous
            check_version(ticket, values["expected_version"])
            if ticket.status in {"resolved", "closed"}:
                raise ValidationError("Reabra o chamado antes de anexar arquivos.")
            if message.attachments.count() >= 5:
                raise ValidationError("Cada mensagem permite até cinco anexos.")
            try:
                filename = get_valid_filename(Path(file.name).name)[:180]
            except Exception:
                raise ValidationError({"file": "Nome de arquivo inválido."})
            attachment = SupportTicketAttachment(organization_id=ticket.organization_id, message=message, file=file, filename=filename, size=size, digest=digest.hexdigest(), request_key=values["request_key"])
            attachment.save()
            changed(ticket)
            value = event(ticket, user, "attachment_added", "Anexo adicionado ao chamado.", internal=message.is_internal)
            notify(ticket, value.pk, to_team=not staff or message.is_internal, actor=user)
            return ticket, attachment
    except Exception:
        if attachment and attachment.file and attachment.file._committed:
            from apps.billing.quotas import _delete_unreferenced
            _delete_unreferenced(attachment.file.storage, attachment.file.name)
        raise
