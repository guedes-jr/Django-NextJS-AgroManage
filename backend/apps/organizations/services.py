"""Organization lifecycle operations shared by administrative endpoints."""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Organization


@transaction.atomic
def transition_organization(*, organization_id, target, reason, request):
    from apps.platform_admin.models import SupportAccessGrant
    from apps.platform_admin.services import record_platform_action

    organization = Organization.objects.select_for_update().get(pk=organization_id)
    if organization.recovery_isolated:
        raise ValidationError("Organizações de conferência permanecem isoladas e não podem ser ativadas.")
    previous = organization.status
    allowed = {
        Organization.Status.ACTIVE: {Organization.Status.SUSPENDED, Organization.Status.ARCHIVED},
        Organization.Status.SUSPENDED: {Organization.Status.ACTIVE, Organization.Status.ARCHIVED},
        Organization.Status.ARCHIVED: {Organization.Status.ACTIVE},
    }
    if target not in allowed[previous]:
        raise ValidationError({"detail": "Transição de estado inválida para esta organização."})

    organization.status = target
    organization.status_reason = reason
    organization.save(update_fields=["status", "status_reason", "updated_at"])
    # Revoke on both blocking and reactivation so old sessions cannot return.
    get_user_model().objects.filter(organization=organization).update(session_version=F("session_version") + 1)
    SupportAccessGrant.objects.filter(organization=organization, revoked_at__isnull=True).update(revoked_at=timezone.now())
    action, description = {
        Organization.Status.ACTIVE: ("activated", "Organização reativada pela equipe da plataforma."),
        Organization.Status.SUSPENDED: ("suspended", "Organização suspensa pela equipe da plataforma."),
        Organization.Status.ARCHIVED: ("archived", "Organização arquivada sem exclusão dos dados."),
    }[target]
    record_platform_action(
        request=request, action=f"organization.{action}", organization=organization,
        object_type="Organization", object_id=organization.pk, description=description,
        extra_data={"previous_status": previous, "status": target, "reason": reason},
    )
    return organization


def create_organization_with_administrator(*, data, request):
    from django.db import IntegrityError
    from apps.accounts.invitations import schedule_invitation
    from apps.accounts.models import OrganizationAdministratorInvitation
    from apps.billing.models import Plan, Subscription
    from apps.platform_admin.services import record_platform_action

    values = dict(data)
    administrator = values.pop("administrator")
    email = administrator["email"].strip().lower()
    try:
        with transaction.atomic():
            User = get_user_model()
            if User.objects.filter(email__iexact=email).exists():
                raise ValidationError({"administrator": {"email": "E-mail já cadastrado. Use outro e-mail; contas existentes não são movidas automaticamente."}})
            plan = Plan.objects.filter(pk=values.pop("plan_id"), is_active=True).first()
            if not plan:
                raise ValidationError({"plan_id": "Plano ativo não encontrado."})
            billing_cycle = values.pop("billing_cycle")
            legacy_codes = {choice[0] for choice in Organization.Plan.choices}
            organization = Organization.objects.create(**values, plan=plan.code if plan.code in legacy_codes else Organization.Plan.FREE)
            subscription, _ = Subscription.objects.get_or_create(
                organization=organization,
                defaults={"plan": plan, "status": Subscription.Status.ACTIVE, "billing_cycle": billing_cycle, "started_at": timezone.now()},
            )
            subscription.plan = plan
            subscription.billing_cycle = billing_cycle
            subscription.save(update_fields=["plan", "billing_cycle", "updated_at"])
            user = User.objects.create_user(
                email=email, password=None, full_name=administrator["full_name"],
                organization=organization, role="admin", organization_responsible=True, is_active=False,
            )
            invitation = OrganizationAdministratorInvitation(
                organization=organization, user=user, email=email,
            )
            schedule_invitation(invitation)
            record_platform_action(
                request=request, action="organization.created", organization=organization,
                object_type="Organization", object_id=organization.pk,
                description="Organização e primeiro administrador criados pela equipe da plataforma.",
                extra_data={"plan": plan.code, "billing_cycle": billing_cycle, "administrator_id": str(user.pk)},
            )
    except IntegrityError as exc:
        raise ValidationError({"detail": "Não foi possível criar o cadastro: e-mail ou identificador já utilizado. Atualize os dados e tente novamente."}) from exc
    return organization


@transaction.atomic
def transfer_organization_responsible(*, organization_id, user_id, expected_responsible_id, request):
    from apps.accounts.models import OrganizationAdministratorInvitation
    from apps.platform_admin.services import record_platform_action

    organization = Organization.objects.select_for_update().get(pk=organization_id)
    User = get_user_model()
    # Keep the same lock order as invitation acceptance/resend: organization,
    # invitation, users. The organization lock serializes member edits as well.
    invitation = OrganizationAdministratorInvitation.objects.select_for_update().filter(organization=organization).first()
    current = User.objects.select_for_update().filter(organization=organization, organization_responsible=True).first()
    current_id = current.pk if current else None
    if current_id != expected_responsible_id:
        raise ValidationError({"detail": "O responsável mudou desde que esta tela foi aberta. Atualize os dados antes de transferir."})
    if current_id == user_id:
        raise ValidationError({"user_id": "Este usuário já é o responsável pela organização."})
    target = User.objects.select_for_update(of=("self",)).filter(
        pk=user_id, organization=organization, is_active=True, platform_staff_profile__isnull=True,
    ).exclude(affiliate_profile__portal_access_only=True).first()
    if not target:
        raise ValidationError({"user_id": "Selecione um usuário ativo desta organização que não pertença à equipe interna."})
    previous_role = target.role
    if current:
        # Keep the previous administrator's access and account state unchanged.
        current.organization_responsible = False
        current.save(update_fields=["organization_responsible", "updated_at"])
    target.organization_responsible = True
    target.role = "admin"
    target.can_operate_crops = False
    target.operator_read_only = False
    fields = ["organization_responsible", "role", "can_operate_crops", "operator_read_only", "updated_at"]
    if previous_role != "admin":
        target.session_version += 1
        fields.append("session_version")
    target.save(update_fields=fields)
    target.allowed_livestock.clear()
    revoked_invitation = bool(invitation and not invitation.accepted_at and not invitation.revoked_at)
    if revoked_invitation:
        invitation.revoked_at = timezone.now()
        invitation.save(update_fields=["revoked_at", "updated_at"])
    record_platform_action(
        request=request, organization=organization, action="organization.responsible_transferred",
        object_type="Organization", object_id=organization.pk,
        description="Responsável pela organização alterado pela equipe da plataforma.",
        extra_data={
            "previous_responsible_id": str(current_id) if current_id else None,
            "previous_responsible_name": current.full_name if current else None,
            "new_responsible_id": str(target.pk), "new_responsible_name": target.full_name,
            "new_responsible_previous_role": previous_role,
            "pending_invitation_revoked": revoked_invitation,
        },
    )
    return organization
