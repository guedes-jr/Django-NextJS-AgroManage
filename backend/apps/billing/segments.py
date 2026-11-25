"""Single catalog of contractable segments and what each organization/user may access.

A segment is contracted when the organization's subscription has a ``SubscriptionItem`` with its
code and the subscription status keeps segments available. The organization always keeps at least
one segment. Members see the intersection of the contracted segments with their own scope:

* admin and manager: every contracted segment;
* operator: only the segments enabled in Membros (the Área do veterinário only when enabled too);
* veterinarian: the Área do veterinário by default plus the segments enabled like an operator.
"""
from django.core.exceptions import ValidationError

CROPS = "plantacoes"
CATTLE = "bovinos"
SWINE = "suinos"
VETERINARY = "area-veterinario"
ALL_SEGMENTS = (CROPS, CATTLE, SWINE, VETERINARY)
# Segments a member can be granted individually in Membros.
MEMBER_SEGMENTS = (CROPS, CATTLE, SWINE, VETERINARY)
DEFAULT_SEGMENTS = (CROPS, CATTLE, SWINE)
LIVESTOCK_SEGMENTS = (CATTLE, SWINE)  # Segment code == Species.code
ENABLED_STATUSES = {"trialing", "active", "past_due"}


def contracted_segments(organization):
    """Codes of the segments currently available to the organization."""
    if organization is None:
        return set()
    from .models import SubscriptionItem

    return set(
        SubscriptionItem.objects.filter(
            subscription__organization=organization,
            subscription__status__in=ENABLED_STATUSES,
            segment_code__in=ALL_SEGMENTS,
        ).values_list("segment_code", flat=True)
    )


def forget(organization):
    """Kept for callers that change contracts; segments are read fresh on every call."""


def member_segments(user):
    """Segments stored for the member, from the scope fields (crops flag + livestock species)."""
    livestock = getattr(user, "allowed_livestock", None)
    codes = {species.code for species in livestock.all() if species.code in LIVESTOCK_SEGMENTS} if livestock is not None else set()
    if getattr(user, "can_operate_crops", False):
        codes.add(CROPS)
    if getattr(user, "veterinary_access", False) or getattr(user, "role", None) == "veterinarian":
        codes.add(VETERINARY)
    return codes


def user_segments(user):
    """Segments the user can open now: contracted ∩ role scope."""
    organization = getattr(user, "organization", None)
    contracted = contracted_segments(organization)
    role = getattr(user, "role", None)
    if role in ("admin", "manager"):
        return set(contracted)
    if role in ("operator", "veterinarian"):
        return member_segments(user) & contracted
    return set()


def validate_member_segments(codes, organization, role):
    codes = set(codes or [])
    unknown = codes - set(MEMBER_SEGMENTS)
    if unknown:
        raise ValidationError("Segmento inválido para o membro: " + ", ".join(sorted(unknown)))
    if role not in ("operator", "veterinarian") and codes:
        raise ValidationError("Somente operador e veterinário recebem segmentos individualmente.")
    missing = codes - contracted_segments(organization)
    if missing:
        raise ValidationError("A organização não contratou: " + ", ".join(sorted(missing)))
    return codes
