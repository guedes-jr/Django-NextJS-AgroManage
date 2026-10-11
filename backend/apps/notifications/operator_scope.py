from django.db.models import CharField, Q, Value
from django.db.models.functions import Cast, Concat, Replace

from common.operator_access import is_operator, scoped_queryset


def authorized_events(model, user):
    organization_path = (
        "birth__female__farm__organization_id"
        if model.__name__ == "Litter"
        else "female__farm__organization_id"
    )
    return scoped_queryset(
        model.objects.filter(**{organization_path: user.organization_id}), user
    )


def visible_notifications(queryset, user):
    if not is_operator(user):
        return queryset
    from apps.livestock.models import Birth, Litter, Mating

    allowed = Q(category__in=["system", "marketing"])
    for model, prefix in [
        (Birth, "livestock.reproductive_vaccine.birth:"),
        (Mating, "livestock.reproductive_vaccine.mating:"),
        (Litter, "livestock.next_mating:"),
    ]:
        events = (
            authorized_events(model, user)
            .annotate(
                event=Concat(
                    Value(prefix),
                    Replace(Cast("pk", CharField()), Value("-"), Value("")),
                )
            )
            .values("event")
        )
        allowed |= Q(category="animal_cycle", _operator_event__in=events)
    return queryset.annotate(
        _operator_event=Replace("event_key", Value("-"), Value(""))
    ).filter(allowed)


def event_allowed(user, category, event_key):
    if not is_operator(user) or category in ("system", "marketing"):
        return True
    from uuid import UUID

    from apps.livestock.models import Birth, Litter, Mating

    if category != "animal_cycle":
        return False
    for model, prefix in [
        (Birth, "livestock.reproductive_vaccine.birth:"),
        (Mating, "livestock.reproductive_vaccine.mating:"),
        (Litter, "livestock.next_mating:"),
    ]:
        if event_key.startswith(prefix):
            try:
                pk = UUID(event_key[len(prefix) :])
            except ValueError:
                return False
            return authorized_events(model, user).filter(pk=pk).exists()
    return False
