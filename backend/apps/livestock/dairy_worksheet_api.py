"""Dairy worksheet HTTP boundary; permissions remain the bovine organization policy."""

from common.pagination import StandardResultsPagination
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.farms.models import Farm

from . import dairy_worksheet as service
from .cattle_views import CattlePermission
from .models import AnimalBatch, CattleMilkDailyTotal, DairyWorksheetCommand, MilkTank


class WorksheetQuery(serializers.Serializer):
    farm = serializers.UUIDField()
    date = serializers.DateField(
        validators=[service.past_date], default=timezone.localdate
    )
    batch = serializers.UUIDField(required=False)
    search = serializers.CharField(max_length=100, allow_blank=True, default="")
    recorded_only = serializers.BooleanField(default=False)


class DairyWorksheetView(APIView):
    permission_classes = (CattlePermission,)

    def get(self, request):
        query = WorksheetQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        values = query.validated_data
        farm = get_object_or_404(
            Farm, pk=values["farm"], organization=request.user.organization
        )
        day = values["date"]
        rows = service.worksheet_rows(request.user.organization, day, farm.pk)
        if values.get("batch"):
            rows = rows.filter(batch_id=values["batch"])
        if values["search"]:
            rows = rows.filter(
                Q(identifier__icontains=values["search"])
                | Q(cattle_profile__name__icontains=values["search"])
            )
        if values["recorded_only"]:
            rows = rows.filter(
                Q(milk_records__date=day) | Q(dairy_worksheets__date=day)
            ).distinct()
        pager = StandardResultsPagination()
        page = pager.paginate_queryset(rows, request, view=self)
        response = pager.get_paginated_response(
            [service.row_data(animal) for animal in page]
        )
        products = service.feed_products(request.user.organization).annotate(
            stock=Sum(
                "lotes__quantidade_atual",
                filter=(
                    Q(lotes__ativo=True, lotes__data_entrada__lte=day)
                    & (
                        Q(lotes__data_validade__isnull=True)
                        | Q(lotes__data_validade__gte=day)
                    )
                ),
            )
        )
        total = (
            CattleMilkDailyTotal.objects.filter(farm=farm, date=day)
            .select_related("worksheet")
            .first()
        )
        response.data.update(
            date=str(day),
            farm=str(farm.pk),
            aggregate_mode=service.milk_totals_covering(
                CattleMilkDailyTotal.objects.filter(farm=farm), day
            ).exists(),
            total=service.serialize_total(total),
            products=[
                {
                    "id": str(item.pk),
                    "name": item.nome,
                    "stock_kg": str(item.stock or 0),
                }
                for item in products
            ],
            batches=[
                {
                    "id": str(batch.pk),
                    "name": batch.name,
                    "batch_code": batch.batch_code,
                }
                for batch in AnimalBatch.objects.filter(
                    farm=farm,
                    species__code="bovinos",
                    cattle_purpose__in=["dairy", "dual"],
                    status="active",
                ).order_by("batch_code", "id")
            ],
            tanks=[
                {"id": str(tank.pk), "name": tank.name}
                for tank in MilkTank.objects.filter(farm=farm, is_active=True).order_by(
                    "name", "id"
                )
            ],
        )
        return response

    def post(self, request):
        command = service.CommandInput(data=request.data)
        command.is_valid(raise_exception=True)
        return Response(
            service.save_worksheet(request, command.validated_data), status=200
        )


class DairyWorksheetReceiptView(APIView):
    permission_classes = (CattlePermission,)

    def get(self, request, farm, key):
        command = get_object_or_404(
            DairyWorksheetCommand,
            farm_id=farm,
            farm__organization=request.user.organization,
            request_key=key,
            recorded_by=request.user,
        )
        return Response(command.receipt)
