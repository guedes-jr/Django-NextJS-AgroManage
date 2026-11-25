"""Who can open the Área do veterinário: contracted segment + admin, manager, veterinarian or an enabled operator."""
from django.utils.translation import gettext_lazy as translate_message_lazy
from rest_framework.permissions import BasePermission

SEGMENT_CODE = "area-veterinario"
ROLES = {"admin", "manager", "veterinarian"}


def veterinary_members_q():
    """Members that may receive the area (roles with default access, or enabled operators)."""
    from django.db.models import Q

    return Q(role__in=ROLES) | Q(role="operator", veterinary_access=True)


def veterinary_enabled(organization):
    """True when the organization's subscription currently includes the veterinary segment."""
    from apps.billing.segments import VETERINARY, contracted_segments

    return VETERINARY in contracted_segments(organization)


def can_use_veterinary(user):
    """Contracted segment + admin/manager/veterinarian, or an operator explicitly enabled in Membros."""
    from apps.billing.segments import VETERINARY, user_segments

    return getattr(user, "is_authenticated", False) and VETERINARY in user_segments(user)


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
