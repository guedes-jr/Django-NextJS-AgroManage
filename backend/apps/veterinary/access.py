"""Who can open the Área do veterinário: contracted segment + admin, manager or veterinarian."""
from django.utils.translation import gettext_lazy as translate_message_lazy
from rest_framework.permissions import BasePermission

SEGMENT_CODE = "area-veterinario"
ROLES = {"admin", "manager", "veterinarian"}
# Subscription states that keep contracted segments available (suspended/cancelled block them).
ENABLED_STATUSES = {"trialing", "active", "past_due"}


def veterinary_enabled(organization):
    """True when the organization's subscription currently includes the veterinary segment."""
    if organization is None:
        return False
    from apps.billing.models import SubscriptionItem

    return SubscriptionItem.objects.filter(
        subscription__organization=organization,
        subscription__status__in=ENABLED_STATUSES,
        segment_code=SEGMENT_CODE,
    ).exists()


def can_use_veterinary(user):
    return (
        getattr(user, "is_authenticated", False)
        and getattr(user, "role", None) in ROLES
        and veterinary_enabled(getattr(user, "organization", None))
    )


class VeterinaryAccess(BasePermission):
    message = translate_message_lazy("A Área do veterinário não está contratada para esta organização ou o seu cargo não tem acesso.")

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated or not user.is_active or not getattr(user, "organization_id", None):
            return False
        return can_use_veterinary(user)


class VeterinaryAdmin(VeterinaryAccess):
    """Destructive reset of the whole area: organization admin only."""

    message = translate_message_lazy("Somente o administrador pode apagar todos os dados da Área do veterinário.")

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == "admin"
