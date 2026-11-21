"""
Optional features of each segment, switched on or off in Configurações › Recursos dos segmentos.

A disabled feature is hidden in the interface and skipped by the backend. Features that already
existed before this panel default to on so nothing changes until the admin decides; new ones
default to off. Use ``enabled(organization, segment, feature)`` wherever the behaviour happens.
"""
from dataclasses import dataclass

VETERINARY = "area-veterinario"
CROPS = "plantacoes"
CATTLE = "bovinos"
SWINE = "suinos"


@dataclass(frozen=True)
class Feature:
    code: str
    default: bool


@dataclass(frozen=True)
class Segment:
    code: str
    features: tuple
    # Contracted segments only appear when the subscription includes them.
    contracted: bool = False


AGENDA = "agenda"
WHATSAPP = "whatsapp_alerts"
FINANCE = "finance"
HERD = "herd_integration"
CLIENT_SHARE = "client_share"
CLIENT_PRICING = "client_pricing"

SEGMENTS = (
    Segment(CROPS, (Feature(AGENDA, True), Feature(FINANCE, True))),
    Segment(CATTLE, (Feature(AGENDA, True), Feature(WHATSAPP, True))),
    Segment(SWINE, (Feature(AGENDA, True), Feature(WHATSAPP, True))),
    Segment(VETERINARY, (
        Feature(HERD, False), Feature(AGENDA, False), Feature(WHATSAPP, False),
        Feature(FINANCE, False), Feature(CLIENT_SHARE, False), Feature(CLIENT_PRICING, False),
    ), contracted=True),
)
CATALOG = {segment.code: segment for segment in SEGMENTS}


def _available(organization, segment):
    if not segment.contracted:
        return True
    if segment.code == VETERINARY:
        from apps.veterinary.access import veterinary_enabled

        return veterinary_enabled(organization)
    return False


def feature_map(organization):
    """{segment: {feature: bool}} for the segments the organization has."""
    if organization is None:
        return {}
    from .models import SegmentFeature

    saved = {
        (row.segment, row.feature): row.enabled
        for row in SegmentFeature.objects.filter(organization=organization)
    }
    return {
        segment.code: {feature.code: saved.get((segment.code, feature.code), feature.default) for feature in segment.features}
        for segment in SEGMENTS
        if _available(organization, segment)
    }


def enabled(organization, segment, feature):
    """True when the feature is on. Unknown codes and missing segments are off."""
    definition = CATALOG.get(segment)
    spec = next((f for f in definition.features if f.code == feature), None) if definition else None
    if organization is None or spec is None or not _available(organization, definition):
        return False
    from .models import SegmentFeature

    row = SegmentFeature.objects.filter(organization=organization, segment=segment, feature=feature).only("enabled").first()
    return row.enabled if row else spec.default


def species_segment(code):
    """Livestock species code → segment code in the catalog (None for species without options)."""
    return code if code in CATALOG else None


def update(organization, user, changes):
    """Persists {segment: {feature: bool}}; unknown or unavailable codes raise ValueError."""
    from .models import SegmentFeature

    available = feature_map(organization)
    turned_on = []
    for segment, features in (changes or {}).items():
        if segment not in available or not isinstance(features, dict):
            raise ValueError(segment)
        for feature, value in features.items():
            if feature not in available[segment] or not isinstance(value, bool):
                raise ValueError(f"{segment}.{feature}")
            if value and not available[segment][feature]:
                turned_on.append((segment, feature))
            SegmentFeature.objects.update_or_create(
                organization=organization, segment=segment, feature=feature,
                defaults={"enabled": value, "updated_by": user},
            )
    for key in turned_on:
        hook = ON_ENABLE.get(key)
        if hook:
            hook(organization)
    return feature_map(organization)


def _resync_crop_finance(organization):
    from apps.crops.finance_sync import resync_organization

    resync_organization(organization)


def _resync_veterinary_finance(organization):
    from apps.veterinary.integrations import resync_finance

    resync_finance(organization)


# Turning a finance option back on mirrors the records saved while it was off.
ON_ENABLE = {
    (CROPS, FINANCE): _resync_crop_finance,
    (VETERINARY, FINANCE): _resync_veterinary_finance,
}
