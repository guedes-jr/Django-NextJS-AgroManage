"""
Common permissions used across multiple apps.
"""
from django.core.exceptions import ObjectDoesNotExist
from rest_framework.permissions import BasePermission
from rest_framework.permissions import SAFE_METHODS


class IsOrganizationMember(BasePermission):
    """Allow access only to members of the current organization."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and hasattr(request.user, "organization")
            and request.user.organization is not None
        )


class IsOrganizationAdmin(BasePermission):
    """Allow access only to organization admins."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("admin", "owner")
        )


class IsPlatformStaff(BasePermission):
    """Allow access only to active members of the AgroManage platform team."""

    message = "Acesso restrito à equipe da plataforma."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated or not user.is_active:
            return False

        try:
            profile = user.platform_staff_profile
        except (AttributeError, ObjectDoesNotExist):
            return False

        return profile.is_active


class IsPlatformAdmin(IsPlatformStaff):
    """Allow access to platform owners and administrators only."""

    message = "Acesso restrito aos administradores da plataforma."

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False

        return request.user.platform_staff_profile.role in {
            "platform_owner",
            "platform_admin",
        }


class IsPlatformSupport(IsPlatformStaff):
    message = "Acesso restrito à equipe de suporte da plataforma."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.platform_staff_profile.role in {
            "platform_owner", "platform_admin", "platform_support"
        }


class IsPlatformDeveloper(IsPlatformStaff):
    message = "Acesso restrito à equipe técnica da plataforma."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.platform_staff_profile.role in {
            "platform_owner", "platform_admin", "platform_developer"
        }


class OrganizationRolePermission(BasePermission):
    """Role matrix for tenant endpoints, configurable per view."""

    message = "Seu papel não permite executar esta operação."
    default_write_roles = {"owner", "admin", "manager"}
    default_delete_roles = {"owner", "admin"}

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated or not getattr(user, "organization_id", None):
            return False
        if request.method in SAFE_METHODS:
            return True
        role = getattr(user, "role", None)
        if request.method == "DELETE":
            return role in getattr(view, "delete_roles", self.default_delete_roles)
        return role in getattr(view, "write_roles", self.default_write_roles)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True

        role = getattr(request.user, "role", None)
        if request.method == "DELETE":
            return role in getattr(view, "delete_roles", self.default_delete_roles)

        if role != "operator" or not getattr(view, "operator_edits_own_only", False):
            return True

        owner_field = getattr(view, "operator_owner_field", "created_by_id")
        return getattr(obj, owner_field, None) == request.user.id
