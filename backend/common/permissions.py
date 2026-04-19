"""
Common permissions used across multiple apps.
"""
from rest_framework.permissions import BasePermission


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
