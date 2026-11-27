"""Single registry of contractable segments (product areas) and what each one opens.

A *segment* is a business area sold to the customer — not a herd/species. Several segments can
share the same species (gado de corte and pecuária leiteira both work with ``bovinos``). To add a
segment: append a ``Segment`` here, create its ``PlanSegment`` (price tiers) in a data migration or
in /platform › Segmentos e preços, map its routes in the web/mobile navigation and add its card to
the general dashboard (see CLAUDE.md › Novo segmento).

Contract = access: a segment is available when the subscription (trialing/active/past_due) has an
*active* ``SubscriptionItem`` with its code. An inactive item keeps tier and negotiated price for a
one-click reactivation, but opens nothing and is not charged. Members see the intersection of the
contracted segments with their scope:

* admin and manager: every contracted segment;
* operator: only the segments enabled in Membros (the Área do veterinário only when enabled too);
* veterinarian: the Área do veterinário by role, plus the segments enabled like an operator.
"""
from dataclasses import dataclass, field

from django.core.exceptions import ValidationError


@dataclass(frozen=True)
class Segment:
    code: str
    name: str
    # Herd species handled by the segment (livestock API scope); None for non-livestock areas.
    species: str | None = None
    # Cattle production handled by the segment (``?production=`` on the cattle API).
    production: str | None = None
    # API path prefixes (after /api/v1/) that belong to the segment.
    api_prefixes: tuple = field(default_factory=tuple)
    # Segment granted by role to the veterinarian (not chosen in Membros).
    veterinary: bool = False
    # Codes stored in finance.Transaction.segmento and inventory ItemEstoque/FormulaRacao.segmento
    # (older tables keep "suinos" for Suinocultura). Defaults to the segment code.
    data_codes: tuple = ()

    @property
    def stored_codes(self):
        return self.data_codes or (self.code,)


REGISTRY = (
    Segment("plantacoes", "Plantações", api_prefixes=("crops/",)),
    Segment("suinocultura", "Suinocultura", species="suinos", api_prefixes=("livestock/",), data_codes=("suinocultura", "suinos")),
    Segment("gado-de-corte", "Gado de corte", species="bovinos", production="beef", api_prefixes=("livestock/",)),
    Segment("pecuaria-leiteira", "Pecuária leiteira", species="bovinos", production="dairy", api_prefixes=("livestock/",)),
    Segment("area-veterinario", "Área do veterinário", api_prefixes=("veterinary/",), veterinary=True),
)
BY_CODE = {segment.code: segment for segment in REGISTRY}

CROPS = "plantacoes"
SWINE = "suinocultura"
BEEF = "gado-de-corte"
DAIRY = "pecuaria-leiteira"
VETERINARY = "area-veterinario"
ALL_SEGMENTS = tuple(segment.code for segment in REGISTRY)
MEMBER_SEGMENTS = ALL_SEGMENTS
LIVESTOCK_SEGMENTS = tuple(segment.code for segment in REGISTRY if segment.species)
CATTLE_SEGMENTS = tuple(segment.code for segment in REGISTRY if segment.species == "bovinos")
DEFAULT_SEGMENTS = (CROPS, BEEF, DAIRY, SWINE)
ENABLED_STATUSES = {"trialing", "active", "past_due"}
# Codes used before segments were split from herds (kept only for data migrations and old payloads).
LEGACY_CODES = {"bovinos": (BEEF, DAIRY), "suinos": (SWINE,)}


def stored_codes(codes):
    """Values of ``segmento`` columns (finance, inventory) that belong to the given segment codes."""
    return {stored for code in codes if code in BY_CODE for stored in BY_CODE[code].stored_codes}


def inactive_segments(organization):
    """Segments removed from (or never added to) the organization's subscription, whatever the
    billing status. An organization without any subscription item (legacy data) hides nothing."""
    if organization is None:
        return set()
    from .models import SubscriptionItem

    rows = dict(SubscriptionItem.objects.filter(subscription__organization=organization).values_list("segment_code", "is_active"))
    if not rows:
        return set()
    return {code for code in ALL_SEGMENTS if not rows.get(code)}


def inactive_stored_codes(organization):
    """``segmento`` values of the inactive segments (finance and inventory rows hidden from the organization)."""
    return stored_codes(inactive_segments(organization))


def species_for(codes):
    """Herd species opened by the given segment codes."""
    return {BY_CODE[code].species for code in codes if code in BY_CODE and BY_CODE[code].species}


def productions_for(codes):
    return {BY_CODE[code].production for code in codes if code in BY_CODE and BY_CODE[code].production}


def normalize(codes):
    """Accept legacy herd codes in old payloads and keep registry order."""
    expanded = set()
    for code in codes or []:
        expanded.update(LEGACY_CODES.get(code, (code,)))
    return [code for code in ALL_SEGMENTS if code in expanded] + sorted(expanded - set(ALL_SEGMENTS))


def contracted_segments(organization):
    """Codes of the active segments currently available to the organization."""
    if organization is None:
        return set()
    from .models import SubscriptionItem

    return set(
        SubscriptionItem.objects.filter(
            subscription__organization=organization,
            subscription__status__in=ENABLED_STATUSES,
            is_active=True,
            segment_code__in=ALL_SEGMENTS,
        ).values_list("segment_code", flat=True)
    )


def forget(organization):
    """Kept for callers that change contracts; segments are read fresh on every call."""


def member_segments(user):
    """Segments stored for the member in Membros (``User.segment_access``)."""
    codes = set(getattr(user, "segment_access", None) or [])
    if not codes:
        # Scope written only in the older fields (crops flag, herd species, veterinary flag).
        if getattr(user, "can_operate_crops", False):
            codes.add(CROPS)
        livestock = getattr(user, "allowed_livestock", None)
        if livestock is not None and getattr(user, "pk", None):
            herd = {species.code for species in livestock.all()}
            codes |= {segment.code for segment in REGISTRY if segment.species in herd}
        if getattr(user, "veterinary_access", False):
            codes.add(VETERINARY)
    if getattr(user, "role", None) == "veterinarian":
        codes.add(VETERINARY)
    return codes & set(ALL_SEGMENTS)


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
    codes = set(normalize(codes))
    unknown = codes - set(MEMBER_SEGMENTS)
    if unknown:
        raise ValidationError("Segmento inválido para o membro: " + ", ".join(sorted(unknown)))
    if role not in ("operator", "veterinarian") and codes:
        raise ValidationError("Somente operador e veterinário recebem segmentos individualmente.")
    missing = codes - contracted_segments(organization)
    if missing:
        names = ", ".join(BY_CODE[code].name for code in sorted(missing) if code in BY_CODE)
        raise ValidationError("A organização não tem ativo: " + names)
    return codes


def legacy_scope(codes):
    """Values for the older scope fields still read by enforcement code (crops flag, species)."""
    return {"can_operate_crops": CROPS in codes, "species": species_for(codes), "veterinary_access": VETERINARY in codes}
