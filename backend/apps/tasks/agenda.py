"""Tenant-scoped operational agenda. Source records remain authoritative."""
from datetime import timedelta
from heapq import merge
from itertools import islice
from uuid import UUID
from django.db.models import F, Value, Q, CharField, DateField, DurationField, ExpressionWrapper, UUIDField, IntegerField, Case, When
from django.db.models.functions import Cast, Concat, Coalesce, Substr
from django.utils import timezone
from rest_framework import serializers
from .models import Task, Holiday


class AgendaQuery(serializers.Serializer):
    start = serializers.DateField(required=False)
    end = serializers.DateField(required=False)
    farm = serializers.UUIDField(required=False)
    domain = serializers.ChoiceField(choices=["all", "livestock", "crops", "tasks", "holidays"], default="all")
    species = serializers.CharField(required=False, max_length=50)
    include_recorded = serializers.BooleanField(default=False)

    def validate(self, attrs):
        today = timezone.localdate()
        start = attrs.get("start", today - timedelta(days=today.weekday()))
        end = attrs.get("end", start + timedelta(days=6))
        if end < start or (end - start).days > 41:
            raise serializers.ValidationError("Selecione um intervalo de até 42 dias, com fim igual ou posterior ao início.")
        attrs.update(start=start, end=end)
        return attrs


class OrganizationAgenda:
    """A paginatable merge of SQL sources and dynamic trough projections.

    Database events are streamed only as far as the requested page. Nutrition
    estimates are not persisted as calendar appointments or stock transactions.
    """
    ordered = True

    def __init__(self, user, *, start, end, farm=None, domain="all", species=None, include_recorded=False):
        from apps.livestock.models import Pregnancy, Mating, Birth, Litter, Incubation, VaccinationRecord, CattleManagement, HeatRecord
        from apps.livestock.operational_alerts import pending_diagnoses
        from apps.crops.models import PlantingCycle, AgronomistRecommendation, Planting, Fertilization, Fertigation, PesticideApplication, Harvest
        self.start, self.end, self.projections = start, end, []
        org = user.organization
        operator = user.role == "operator"
        allowed = list(user.allowed_livestock.values_list("code", flat=True)) if operator else None
        sources = []
        def project(query, day, title, kind, group, farm_path, *, species_path=None, fixed_species="", status="planned", target=None, organization_wide=False, purpose=None):
            if domain != "all" and domain != group: return
            if group == "livestock":
                if species_path:
                    if allowed is not None: query = query.filter(**{species_path + "__in": allowed})
                    if species: query = query.filter(**{species_path: species})
                elif (allowed is not None and fixed_species not in allowed) or (species and species != fixed_species): return
            if farm and not organization_wide: query = query.filter(**{farm_path: farm})
            sources.append(query.order_by().annotate(
                _source=Cast(F("pk"), CharField()), _day=day, _title=title,
                _domain=Value(group, output_field=CharField()),
                _species=F(species_path) if species_path else Value(fixed_species, output_field=CharField()),
                _farm=Cast(F(farm_path), CharField()),
                _farm_name=F(farm_path.removesuffix("_id") + "__name") if not farm_path.startswith("_") else F("_effective_farm_name"),
                _kind=Value(kind, output_field=CharField()),
                _status=F(status[1:]) if status.startswith("$") else Value(status, output_field=CharField()),
                _target=Cast(F(target or "pk"), CharField()),
                _purpose=purpose if purpose is not None else Value("unknown", output_field=CharField()),
            ).filter(_day__range=(start, end)).values_list("_source", "_day", "_title", "_domain", "_species", "_farm", "_farm_name", "_kind", "_status", "_target", "_purpose"))
        holidays = Holiday.objects.filter(organization=org).annotate(_effective_farm=Value(None, output_field=UUIDField()), _effective_farm_name=Value("Organização", output_field=CharField()))
        project(holidays, F("date"), F("name"), "holiday", "holidays", "_effective_farm", organization_wide=True)
        tasks = Task.objects.filter(organization=org).exclude(status="cancelled")
        if not include_recorded: tasks = tasks.exclude(status="done")
        if operator: tasks = tasks.filter(Q(assigned_to=user) | Q(created_by=user))
        project(tasks, F("due_date"), Case(When(start_time__isnull=False, then=Concat(Substr(Cast("start_time", CharField()),1,5), Value(" · "), F("title"))), default=F("title"), output_field=CharField()), "task", "tasks", "farm_id", status="$status")
        project(Pregnancy.objects.filter(female__farm__organization=org, female__status="active", status="ongoing"), F("expected_birth_date"), Concat(Value("Parto previsto · "), F("female__identifier")), "birth", "livestock", "female__farm_id", species_path="female__species__code", purpose=F("female__cattle_purpose"))
        project(HeatRecord.objects.filter(animal__farm__organization=org, animal__status="active", is_predicted=True, animal__reproductive_status__in=["vazia", "em_preparo", "pronta", "aguardando_cobertura"]), F("heat_date"), Concat(Value("Cio previsto · "), F("animal__identifier")), "heat", "livestock", "animal__farm_id", species_path="animal__species__code", purpose=F("animal__cattle_purpose"))
        project(pending_diagnoses(org, None), F("diagnosis_due_date"), Concat(Value("Diagnóstico de prenhez · "), F("female__identifier")), "diagnosis", "livestock", "female__farm_id", species_path="female__species__code", purpose=F("female__cattle_purpose"))
        project(CattleManagement.objects.filter(farm__organization=org, kind="sanitary", status="confirmed", follow_up_status="pending", next_procedure_date__isnull=False), F("next_procedure_date"), F("description"), "sanitary", "livestock", "farm_id", fixed_species="bovinos")
        project(VaccinationRecord.objects.filter(farm__organization=org, next_dose_date__isnull=False).filter(Q(animal__isnull=True) | Q(animal__status="active")).filter(Q(batch__isnull=True) | Q(batch__status="active")), F("next_dose_date"), Concat(Value("Próxima dose · "), F("vaccine_name")), "vaccination", "livestock", "farm_id", species_path="species__code", purpose=Coalesce("animal__cattle_purpose", "batch__cattle_purpose", Value("unknown")))
        weaning = Cast(F("birth__birth_date") + ExpressionWrapper(Cast(F("birth__expected_weaning_days"), IntegerField()) * timedelta(days=1), output_field=DurationField()), output_field=DateField())
        project(Litter.objects.filter(birth__female__farm__organization=org, weaning_date__isnull=True, birth__live_born__gt=0), weaning, Concat(Value("Desmame previsto · "), F("birth__female__identifier")), "weaning", "livestock", "birth__female__farm_id", species_path="birth__female__species__code")
        project(Incubation.objects.filter(farm__organization=org, status="incubating"), F("expected_hatch_date"), Concat(Value("Eclosão prevista · "), F("batch__batch_code")), "hatching", "livestock", "farm_id", species_path="batch__species__code")
        if include_recorded:
            project(Mating.objects.filter(female__farm__organization=org), F("mating_date"), Concat(Value("Cobertura registrada · "), F("female__identifier")), "mating", "livestock", "female__farm_id", species_path="female__species__code", purpose=F("female__cattle_purpose"), status="recorded")
            project(Birth.objects.filter(female__farm__organization=org), F("birth_date"), Concat(Value("Parto registrado · "), F("female__identifier")), "birth_record", "livestock", "female__farm_id", species_path="female__species__code", purpose=F("female__cattle_purpose"), status="recorded")
            project(VaccinationRecord.objects.filter(farm__organization=org), F("application_date"), Concat(Value("Vacinação registrada · "), F("vaccine_name")), "vaccine_record", "livestock", "farm_id", species_path="species__code", purpose=Coalesce("animal__cattle_purpose", "batch__cattle_purpose", Value("unknown")), status="recorded")
        if not operator or user.can_operate_crops:
            cycles = PlantingCycle.objects.filter(Q(organization=org) | Q(organization__isnull=True, field__farm__organization=org), field__farm__organization=org).filter(Q(farm__isnull=True) | Q(farm__organization=org))
            cycles = cycles.annotate(_effective_farm=Coalesce("farm_id", "field__farm_id", output_field=UUIDField()), _effective_farm_name=Coalesce("farm__name", "field__farm__name"))
            project(cycles.filter(status="planned"), F("planting_date"), Concat(Value("Plantio previsto · "), F("name")), "planting", "crops", "_effective_farm")
            project(cycles.exclude(status__in=["cancelled", "finished"]), F("expected_harvest_date"), Concat(Value("Colheita prevista · "), F("name")), "harvest", "crops", "_effective_farm")
            recommendations = AgronomistRecommendation.objects.filter(plantation__in=cycles, field__farm__organization=org).exclude(status="completed")
            project(recommendations, F("suggested_application_date"), Concat(Value("Recomendação · "), F("title")), "recommendation", "crops", "plantation__field__farm_id", target="plantation_id")
            if include_recorded:
                for model, field, label in [(Planting, "planting_date", "Plantio"), (Fertilization, "application_date", "Adubação"), (Fertigation, "application_date", "Fertirrigação"), (PesticideApplication, "application_date", "Aplicação")]:
                    project(model.objects.filter(plantation__in=cycles), F(field), Concat(Value(label + " registrado · "), F("plantation__name")), "crop_record", "crops", "plantation__field__farm_id", target="plantation_id", status="recorded")
                project(Harvest.objects.filter(planting_cycle__in=cycles), F("harvest_date"), Concat(Value("Colheita registrada · "), F("planting_cycle__name")), "crop_record", "crops", "planting_cycle__field__farm_id", target="planting_cycle_id", status="recorded")
        if domain in ("all", "livestock") and (not species or species == "bovinos") and (allowed is None or "bovinos" in allowed):
            from apps.livestock.cattle_operations import feed_plans, feed_forecast
            plans = feed_plans().filter(batch__farm__organization=org, is_active=True, batch__status="active")
            if farm: plans = plans.filter(batch__farm_id=farm)
            for plan in plans:
                forecast = feed_forecast(plan)
                day = forecast["next_supply_date"] or (timezone.localdate() if forecast["status"] == "not_supplied" else None)
                if day and start <= day <= end:
                    self.projections.append((str(plan.pk), day, f"Fornecimento estimado · {plan.batch.batch_code} · {plan.item.nome}", "livestock", "bovinos", str(plan.batch.farm_id), plan.batch.farm.name, "nutrition", "planned", str(plan.pk), plan.batch.cattle_purpose))
        self.query = sources[0].union(*sources[1:], all=True).order_by("_day", "_kind", "_source") if sources else None
        self.projections.sort(key=self.key)

    @staticmethod
    def key(row): return (row[1], row[7], row[0])

    def count(self):
        return (self.query.count() if self.query is not None else 0) + len(self.projections)

    def __getitem__(self, value):
        rows = self.query.iterator(chunk_size=100) if self.query is not None else iter(())
        merged = merge(rows, self.projections, key=self.key)
        return list(islice(merged, value.start or 0, value.stop))


def agenda_event(row):
    source, day, title, domain, species, farm, name, kind, status, target, purpose = row
    source = str(UUID(source))
    farm = str(UUID(farm)) if farm else None
    if domain == "crops": url = f"/home/plantacoes/{UUID(target)}"
    elif domain == "livestock":
        code = {"suino": "suinos", "bovino": "bovinos", "ave": "aves"}.get(species, species)
        url = f"/home/seguimento/{code}"
        if code == "bovinos":
            url = "/home/seguimento/pecuaria-leiteira" if purpose == "dairy" else "/home/seguimento/gado-de-corte"
            url += "/racao" if kind == "nutrition" else "/manejos" if kind == "sanitary" else "/sanidade" if kind in ["vaccination", "vaccine_record"] else "/reproducao"
    else: url = None
    return {"id": f"{kind}:{source}", "source_id": source, "date": day.isoformat(), "title": title, "domain": domain, "species": species, "farm": farm, "farm_name": name or "Organização", "kind": kind, "status": status, "source_url": url, "estimated": kind == "nutrition"}
