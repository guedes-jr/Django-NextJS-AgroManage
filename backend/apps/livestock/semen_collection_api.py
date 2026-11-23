"""API of Reprodução › Reprodutores: list of breeding males and their semen collections."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Max, OuterRef, Q, Subquery, Sum
from rest_framework import mixins, serializers, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from common.operator_access import operator_scoped
from common.permissions import OrganizationRolePermission

from .models import Animal, Birth, Mating, SemenCollection, VaccinationRecord, WeightRecord
from .semen_collection import breeding_males, register_semen_collection

UNITS = ["ml", "l", "g", "kg", "unidade", "dose"]


class ComponentInput(serializers.Serializer):
    item = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    unit = serializers.ChoiceField(choices=UNITS)


class SemenCollectionInput(serializers.Serializer):
    animal = serializers.UUIDField()
    collection_date = serializers.DateField()
    volume_ml = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    responsible = serializers.UUIDField()
    diluted = serializers.BooleanField()
    doses_produced = serializers.IntegerField(min_value=1)
    components = ComponentInput(many=True, required=False)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class SemenCollectionSerializer(serializers.ModelSerializer):
    animal_identifier = serializers.CharField(source="animal.identifier", read_only=True)
    cost_per_dose = serializers.SerializerMethodField()
    components = serializers.SerializerMethodField()

    class Meta:
        model = SemenCollection
        fields = ["id", "animal", "animal_identifier", "collection_date", "volume_ml", "diluted", "doses_produced",
                  "responsible", "responsible_name", "notes", "total_cost", "cost_per_dose", "stock_lot", "components"]

    def get_cost_per_dose(self, obj):
        return str((obj.total_cost / obj.doses_produced).quantize(Decimal("0.01"))) if obj.doses_produced else None

    def get_components(self, obj):
        return [{"item": str(c.item_id), "item_name": c.item.nome, "quantity": str(c.quantity), "unit": c.unit, "cost": str(c.cost)}
                for c in obj.components.all()]


@operator_scoped
class SemenCollectionViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    permission_classes = [OrganizationRolePermission]
    write_roles = {"admin", "manager", "operator"}
    serializer_class = SemenCollectionSerializer

    def get_queryset(self):
        queryset = SemenCollection.objects.filter(farm__organization=self.request.user.organization) \
            .select_related("animal").prefetch_related("components__item")
        if self.request.query_params.get("animal"):
            queryset = queryset.filter(animal_id=self.request.query_params["animal"])
        if self.request.query_params.get("species"):
            queryset = queryset.filter(animal__species__code=self.request.query_params["species"])
        return queryset

    def create(self, request, *args, **kwargs):
        values = SemenCollectionInput(data=request.data)
        values.is_valid(raise_exception=True)
        collection = register_semen_collection(request.user.organization, request.user, values.validated_data)
        return Response(SemenCollectionSerializer(collection).data, status=201)


@operator_scoped
class ReprodutoresView(APIView):
    """Reprodução › Reprodutores and Relatórios › Reprodutores: individual control of the breeding males.

    ``include_inactive=1`` (report) also lists males that left the herd (sold, dead, discarded).
    """

    def get(self, request):
        organization = getattr(request.user, "organization", None)
        if organization is None:
            return Response({"error": "Unauthorized"}, status=401)
        species = request.query_params.get("species", "suinos")
        last_weight = WeightRecord.objects.filter(animal=OuterRef("pk")).order_by("-weighing_date", "-created_at")
        last_vaccine = VaccinationRecord.objects.filter(animal=OuterRef("pk")).order_by("-application_date", "-created_at")
        include_inactive = request.query_params.get("include_inactive") in ("1", "true")
        base = Animal.objects.filter(farm__organization=organization, species__code=species, gender="M") \
            if include_inactive else breeding_males(organization, species)
        males = base.select_related("breed", "farm").annotate(
            last_weight_kg=Subquery(last_weight.values("weight_kg")[:1]),
            last_weighing=Subquery(last_weight.values("weighing_date")[:1]),
            last_vaccine_date=Subquery(last_vaccine.values("application_date")[:1]),
            last_vaccine_name=Subquery(last_vaccine.values("vaccine_name")[:1]),
            last_collection=Max("semen_collections__collection_date"),
            collections=Count("semen_collections", distinct=True),
        ).order_by("identifier")
        doses = dict(SemenCollection.objects.filter(animal__in=males, stock_lot__ativo=True)
                     .values_list("animal").annotate(total=Sum("stock_lot__quantidade_atual")))
        # Separate aggregations: joining matings, births and collections in one query would multiply the sums.
        produced = {row["animal"]: row for row in SemenCollection.objects.filter(animal__in=males)
                    .values("animal").annotate(doses=Sum("doses_produced"), cost=Sum("total_cost"))}
        matings = {row["sire"]: row for row in Mating.objects.filter(sire__in=males).values("sire")
                   .annotate(total=Count("id"), confirmed=Count("id", filter=Q(status=Mating.Status.CONFIRMED)))}
        births = {row["pregnancy__mating__sire"]: row for row in Birth.objects.filter(pregnancy__mating__sire__in=males)
                  .values("pregnancy__mating__sire").annotate(total=Count("id"), live=Sum("live_born"))}
        today = date.today()
        rows = [{
            "id": animal.id, "identifier": animal.identifier, "category": animal.category or "",
            "breed": animal.breed.name if animal.breed else "",
            "idade": (today - animal.birth_date).days if animal.birth_date else None,
            "peso": animal.last_weight_kg if animal.last_weight_kg is not None else animal.current_weight_kg,
            "ultima_pesagem": animal.last_weighing, "ultima_vacina": animal.last_vaccine_date,
            "vacina": animal.last_vaccine_name or "", "ultima_coleta": animal.last_collection,
            "coletas": animal.collections, "doses_estoque": doses.get(animal.id, 0) or 0,
            "doses_produzidas": (produced.get(animal.id) or {}).get("doses") or 0,
            "custo_coletas": (produced.get(animal.id) or {}).get("cost") or 0,
            "coberturas": (matings.get(animal.id) or {}).get("total") or 0,
            "prenhezes": (matings.get(animal.id) or {}).get("confirmed") or 0,
            "partos": (births.get(animal.id) or {}).get("total") or 0,
            "nascidos_vivos": (births.get(animal.id) or {}).get("live") or 0,
            "farm_name": animal.farm.name, "entry_date": animal.entry_date,
            "status": "ativo" if animal.status == "active" else animal.status,
        } for animal in males]
        month = SemenCollection.objects.filter(animal__in=males, collection_date__year=today.year, collection_date__month=today.month)
        users = get_user_model().objects.filter(organization=organization, is_active=True).order_by("full_name", "email")
        return Response({
            "kpis": {
                "total": len(rows),
                "coletas_mes": month.count(),
                "doses_mes": month.aggregate(total=Sum("doses_produced"))["total"] or 0,
                "doses_estoque": sum(row["doses_estoque"] for row in rows),
            },
            "rows": rows,
            "responsibles": [{"id": str(user.id), "name": user.full_name or user.email} for user in users],
            "alerts": [], "aiSuggestions": [],
        })
