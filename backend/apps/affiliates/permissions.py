from django.core.exceptions import ObjectDoesNotExist
from rest_framework.permissions import BasePermission


class IsActiveAffiliate(BasePermission):
    message = "Acesso restrito a afiliados cadastrados."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        try:
            return user.affiliate_profile.status == "active"
        except (AttributeError, ObjectDoesNotExist):
            return False
