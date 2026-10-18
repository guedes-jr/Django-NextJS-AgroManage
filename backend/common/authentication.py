from django.core.exceptions import ObjectDoesNotExist
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.exceptions import APIException
from rest_framework_simplejwt.authentication import JWTAuthentication


def is_active_platform_staff(user):
    try:
        return user.platform_staff_profile.is_active
    except (AttributeError, ObjectDoesNotExist):
        return False


class MaintenanceMode(APIException):
    status_code = 503
    default_code = "maintenance_mode"
    default_detail = "A plataforma está temporariamente em manutenção."


class ActiveOrganizationJWTAuthentication(JWTAuthentication):
    """Reject tokens from suspended tenants while preserving platform access."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        token_session_version = validated_token.get("session_version", 0)
        if token_session_version != user.session_version:
            raise AuthenticationFailed(
                "Sessão encerrada. Entre novamente.",
                code="session_revoked",
            )
        grant_id = validated_token.get("support_grant_id")
        if grant_id:
            from apps.platform_admin.models import SupportAccessGrant

            if not is_active_platform_staff(user) or user.platform_staff_profile.role not in {
                "platform_owner", "platform_admin", "platform_support"
            }:
                raise AuthenticationFailed("Acesso de suporte não autorizado.")

            try:
                grant = SupportAccessGrant.objects.select_related("organization").get(
                    pk=grant_id, operator=user
                )
            except SupportAccessGrant.DoesNotExist as exc:
                raise AuthenticationFailed("Concessão de suporte inválida.") from exc
            if not grant.is_valid or not grant.organization.is_active or grant.organization.recovery_isolated:
                raise AuthenticationFailed("Concessão de suporte expirada ou revogada.")
            from django.utils import timezone
            SupportAccessGrant.objects.filter(pk=grant.pk).update(last_used_at=timezone.now())
            user.organization = grant.organization
            user.role = "admin"
            user.support_access_grant = grant
        organization = getattr(user, "organization", None)

        if organization and organization.recovery_isolated:
            raise AuthenticationFailed("Organização isolada para conferência de recuperação.")

        if organization and not is_active_platform_staff(user):
            from apps.platform_admin.operational import active_maintenance_window
            window = active_maintenance_window()
            if window:
                raise MaintenanceMode(window.message)

        if organization and not organization.is_active and not is_active_platform_staff(user):
            raise AuthenticationFailed(
                organization.access_denied_message,
                code=f"organization_{organization.status}",
            )

        return user

    def authenticate(self, request):
        result = super().authenticate(request)
        if result and not is_active_platform_staff(result[0]):
            from .operator_access import enforce_request
            enforce_request(result[0], request)
        return result
