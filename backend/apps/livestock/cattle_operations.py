"""Cattle operational read models, kept separate from execution and stock effects."""
from uuid import UUID
from datetime import timedelta, date
from decimal import Decimal
from django.db.models import F, Value, CharField, DateField, OuterRef, Subquery, Prefetch
from django.db.models.functions import Cast, Concat
from django.utils import timezone
from .models import Pregnancy, CattleManagement, CattleGrazing, WeightRecord, CattleFeedPlan, CattleFeedDelivery
from .operational_alerts import pending_diagnoses


def cattle_agenda(organization, farm=None, period="all", kind="all", production=None):
    sources = []
    if production:
        from .models import Animal
        from .cattle_improvements import filter_purpose
        participants = filter_purpose(Animal.objects.filter(farm__organization=organization, species__code="bovinos"), production)
    def project(query, day, title, event_kind, farm_path, animal_path=None):
        if production:
            query = query.filter(**{f"{animal_path}__in": participants.values("pk")}) if animal_path else query.filter(entries__animal__in=participants).distinct()
        query = query.order_by().annotate(
            _day=day, _title=title, _kind=Value(event_kind, output_field=CharField()),
            _animal=Cast(F(animal_path), CharField()) if animal_path else Value("", output_field=CharField()),
            _farm=Cast(F(farm_path), CharField()), _farm_name=F(farm_path.removesuffix("_id") + "__name"),
            _source=Cast(F("pk"), CharField()),
        )
        if farm:
            query = query.filter(**{farm_path: farm})
        today = timezone.localdate()
        if period == "current": query = query.filter(_day__gte=today)
        elif period == "overdue": query = query.filter(_day__lt=today)
        elif period == "today": query = query.filter(_day=today)
        elif period == "upcoming": query = query.filter(_day__gt=today)
        return query.values_list("_source", "_day", "_title", "_kind", "_animal", "_farm", "_farm_name")
    if kind in ("all", "birth"):
        sources.append(project(Pregnancy.objects.filter(female__farm__organization=organization, female__species__code="bovinos", female__status="active", status="ongoing"), F("expected_birth_date"), Concat(Value("Parto previsto · "), F("female__identifier")), "birth", "female__farm_id", "female_id"))
    if kind in ("all", "diagnosis"):
        sources.append(project(pending_diagnoses(organization, "bovinos", farm), F("diagnosis_due_date"), Concat(Value("Diagnóstico pendente · "), F("female__identifier")), "diagnosis", "female__farm_id", "female_id"))
    if kind in ("all", "sanitary"):
        sources.append(project(CattleManagement.objects.filter(farm__organization=organization, status="confirmed", kind="sanitary", next_procedure_date__isnull=False, follow_up_status="pending"), F("next_procedure_date"), F("description"), "sanitary", "farm_id"))
    query = sources[0]
    if len(sources) > 1:
        query = query.union(*sources[1:], all=True)
    return query.order_by("_day", "_kind", "_source")


def agenda_row(row):
    source, day, title, kind, animal, farm, name = row
    source = str(UUID(source)); farm = str(UUID(farm)); animal = str(UUID(animal)) if animal else None
    today = timezone.localdate()
    return {"id": f"{kind}:{source}", "source_id": source, "date": day.isoformat(), "title": title, "kind": kind, "animal": animal or None, "farm": farm, "farm_name": name, "period": "overdue" if day < today else "today" if day == today else "upcoming"}


def feed_forecast(plan, today=None):
    today = today or timezone.localdate()
    daily = plan.kg_per_head_day * plan.batch.quantity
    last = getattr(plan, "latest_delivery", None)
    if last is None:
        rows = getattr(plan, "ordered_deliveries", None)
        last = rows[0] if rows else None
    result = {"daily_requirement_kg": daily, "estimated_remaining_kg": None, "days_covered": None, "next_supply_date": None, "last_supply_date": last.date if last else None, "status": "not_supplied"}
    if not plan.is_active or plan.batch.status != "active" or (plan.end_date and plan.end_date < today):
        result["status"] = "inactive"; return result
    if plan.start_date > today:
        result["status"] = "scheduled"; return result
    if not last:
        return result
    if last.daily_requirement_kg != daily or last.head_count != plan.batch.quantity:
        result["status"] = "review"; return result
    elapsed = Decimal((today - last.date).days)
    remaining = max(Decimal(0), last.available_after_kg - elapsed * daily)
    days = remaining / daily if daily else None
    result.update(estimated_remaining_kg=remaining, days_covered=days, next_supply_date=today + timedelta(days=int(days)) if days is not None and days <= (date.max - today).days else None, status="supply_today" if remaining < daily else "supplied")
    return result


def with_batch_operations(queryset):
    from .models import Animal
    from django.db.models import Count
    latest = WeightRecord.objects.filter(batch_id=OuterRef("pk")).order_by("-weighing_date", "-created_at")
    linked = Animal.objects.filter(batch_id=OuterRef("pk"), status="active").order_by().values("batch_id").annotate(total=Count("pk")).values("total")
    return queryset.annotate(last_weighing_date=Subquery(latest.values("weighing_date")[:1]), identified_count=Subquery(linked[:1])).prefetch_related(Prefetch("grazings", queryset=CattleGrazing.objects.filter(exit_date__isnull=True).select_related("pasture"), to_attr="operational_grazings"))


def feed_plans():
    last = CattleFeedDelivery.objects.filter(plan_id=OuterRef("plan_id")).order_by("-date", "-created_at").values("pk")[:1]
    return CattleFeedPlan.objects.select_related("batch__farm", "item").prefetch_related(Prefetch("deliveries", queryset=CattleFeedDelivery.objects.filter(pk=Subquery(last)).order_by("-date", "-created_at"), to_attr="ordered_deliveries"))
