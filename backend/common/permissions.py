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


class IsPlatformAuditor(IsPlatformStaff):
    message = "Acesso restrito à auditoria da plataforma."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.platform_staff_profile.role in {
            "platform_owner", "platform_admin", "platform_auditor"
        }


class OrganizationRolePermission(BasePermission):
    """Tenant CRUD roles; operators may append records but never edit/delete."""

    message = "Seu cargo não permite executar esta operação."
    default_create_roles = {"owner", "admin", "manager", "operator"}
    default_write_roles = {"owner", "admin", "manager"}
    default_delete_roles = {"owner", "admin", "manager"}

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated or not user.is_active or not getattr(user, "organization_id", None):
            return False
        if request.method in SAFE_METHODS:
            return True
        role = getattr(user, "role", None)
        operation = getattr(view, "action_operations", {}).get(getattr(view, "action", None))
        if request.method == "DELETE" or operation == "delete":
            return role in getattr(view, "delete_roles", self.default_delete_roles)
        if request.method in {"PUT", "PATCH"} or operation == "edit":
            return role in self.default_write_roles and role in getattr(view, "write_roles", self.default_write_roles)
        if request.method == "POST":
            return role in getattr(view, "create_roles", self.default_create_roles)
        return False

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)
