"""Single-use first-administrator invitations; raw tokens are never stored."""

import hashlib
import secrets
from datetime import timedelta
from urllib.parse import urlsplit

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog
from apps.platform_admin.services import record_platform_action

from .models import OrganizationAdministratorInvitation, User

INVALID_INVITATION = "Convite inválido, expirado ou já utilizado. Solicite um novo convite ao administrador da plataforma."


def token_digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def schedule_invitation(invitation):
    """Called with the organization/invitation locked inside a transaction."""
    token = secrets.token_urlsafe(32)
    invitation.token_digest = token_digest(token)
    invitation.expires_at = timezone.now() + timedelta(hours=settings.ORGANIZATION_INVITATION_HOURS)
    invitation.delivery_status = "pending"
    invitation.delivery_error = ""
    invitation.save()
    def send_after_commit():
        deliver_invitation(invitation.pk, token)

    transaction.on_commit(send_after_commit, robust=True)


def deliver_invitation(invitation_id, token):
    # Resend and acceptance use the same organization lock. An obsolete callback
    # must never send an old token or overwrite a newer delivery result.
    org_id = OrganizationAdministratorInvitation.objects.filter(pk=invitation_id).values_list("organization_id", flat=True).first()
    if not org_id:
        return
    with transaction.atomic():
        organization = Organization.objects.select_for_update().get(pk=org_id)
        invitation = OrganizationAdministratorInvitation.objects.select_for_update().select_related("user").get(pk=invitation_id)
        if invitation.token_digest != token_digest(token) or invitation.accepted_at or invitation.revoked_at or invitation.delivery_status != "pending":
            return
        invitation.delivery_attempts += 1
        invitation.last_attempt_at = timezone.now()
        try:
            base_url = settings.FRONTEND_URL.rstrip("/")
            parsed = urlsplit(base_url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.query or parsed.fragment:
                raise ValueError("Invalid frontend URL")
            if not organization.is_active or invitation.expires_at <= timezone.now():
                raise ValueError("Invitation unavailable")
            link = f"{base_url}/aceitar-convite#token={token}"
            sent = send_mail(
                "Seu acesso à Fazenda Mais",
                f"Olá, {invitation.user.full_name}!\n\nVocê foi convidado para administrar {organization.name}.\n"
                f"Defina sua senha pelo link:\n{link}\n\nO convite expira em {settings.ORGANIZATION_INVITATION_HOURS} horas e pode ser utilizado uma única vez.\n"
                "Se você não esperava este convite, ignore esta mensagem.",
                settings.DEFAULT_FROM_EMAIL, [invitation.email], fail_silently=False,
            )
            if sent != 1:
                raise RuntimeError("Email not accepted")
        except Exception:
            invitation.delivery_status = "failed"
            invitation.delivery_error = "Não foi possível enviar o e-mail. Verifique a configuração de envio e tente novamente."
        else:
            invitation.delivery_status = "sent"
            invitation.last_sent_at = timezone.now()
            invitation.delivery_error = ""
        invitation.save(update_fields=["delivery_status", "delivery_attempts", "last_attempt_at", "last_sent_at", "delivery_error", "updated_at"])
        PlatformAuditLog.objects.create(
            organization=organization, action=f"organization.invitation_{invitation.delivery_status}",
            object_type="OrganizationAdministratorInvitation", object_id=str(invitation.pk),
            description="Tentativa de envio do convite do responsável.",
            extra_data={"attempt": invitation.delivery_attempts, "delivery_status": invitation.delivery_status},
        )


def _eligible(invitation, organization, user):
    return (
        not invitation.accepted_at and not invitation.revoked_at and invitation.expires_at > timezone.now()
        and organization.is_active and user.organization_id == organization.pk
        and user.role == "admin" and user.organization_responsible
        and not user.is_active and not user.has_usable_password()
        and user.email.casefold() == invitation.email.casefold()
        and not hasattr(user, "platform_staff_profile")
    )


def inspect_invitation(token):
    invitation = OrganizationAdministratorInvitation.objects.select_related("organization", "user").filter(token_digest=token_digest(token)).first()
    if not invitation or not _eligible(invitation, invitation.organization, invitation.user):
        raise ValidationError({"detail": INVALID_INVITATION})
    return invitation


@transaction.atomic
def accept_invitation(*, token, password, request):
    candidate = OrganizationAdministratorInvitation.objects.filter(token_digest=token_digest(token)).values("pk", "organization_id").first()
    if not candidate:
        raise ValidationError({"detail": INVALID_INVITATION})
    organization = Organization.objects.select_for_update().get(pk=candidate["organization_id"])
    invitation = OrganizationAdministratorInvitation.objects.select_for_update().get(pk=candidate["pk"])
    user = User.objects.select_for_update().get(pk=invitation.user_id)
    if invitation.token_digest != token_digest(token) or not _eligible(invitation, organization, user):
        raise ValidationError({"detail": INVALID_INVITATION})
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise ValidationError({"password": exc.messages}) from exc
    user.set_password(password)
    user.is_active = True
    user.force_password_change = False
    user.session_version = F("session_version") + 1
    user.save(update_fields=["password", "is_active", "force_password_change", "session_version", "updated_at"])
    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=["accepted_at", "updated_at"])
    PlatformAuditLog.objects.create(
        actor=user, organization=organization, action="organization.invitation_accepted",
        object_type="OrganizationAdministratorInvitation", object_id=str(invitation.pk),
        description="Responsável definiu sua senha e ativou o acesso.",
        ip_address=request.META.get("REMOTE_ADDR") or None,
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:512],
    )


@transaction.atomic
def resend_invitation(*, organization_id, request):
    organization = Organization.objects.select_for_update().get(pk=organization_id)
    invitation = OrganizationAdministratorInvitation.objects.select_for_update().filter(organization=organization).first()
    if not invitation:
        raise ValidationError({"detail": "Esta organização não possui convite de primeiro administrador."})
    user = User.objects.select_for_update().get(pk=invitation.user_id)
    # Expiration is the only eligibility condition a resend may repair.
    if (
        invitation.accepted_at or invitation.revoked_at or not organization.is_active or user.is_active
        or user.has_usable_password() or user.organization_id != organization.pk
        or user.role != "admin" or not user.organization_responsible
        or hasattr(user, "platform_staff_profile")
        or user.email.casefold() != invitation.email.casefold()
    ):
        raise ValidationError({"detail": "Este convite não pode ser reenviado. Verifique o responsável e o estado da organização."})
    schedule_invitation(invitation)
    record_platform_action(
        request=request, organization=organization, action="organization.invitation_resent",
        object_type="OrganizationAdministratorInvitation", object_id=invitation.pk,
        description="Novo convite solicitado; o link anterior foi invalidado.",
    )
