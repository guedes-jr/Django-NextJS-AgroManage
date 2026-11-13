from common.pagination import StandardResultsPagination
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.farms.models import Farm

from . import dairy_feeding as service
from .cattle_views import CattlePermission
from .dairy_worksheet import feed_products
from .models import DairyWorksheetCommand


class DairyFeedingView(APIView):
    permission_classes = (CattlePermission,)

    def get(self, request):
        service.require_manager(request.user)
        farm = get_object_or_404(
            Farm,
            pk=serializers.UUIDField().run_validation(request.query_params.get("farm")),
            organization=request.user.organization,
        )
        pager = StandardResultsPagination()
        if request.query_params.get("resource") == "history":
            commands = DairyWorksheetCommand.objects.filter(
                farm=farm, receipt__mode="feeding"
            ).order_by("-created_at", "-id")
            page = pager.paginate_queryset(commands, request, view=self)
            markers = {
                f"{command.request_key}:{index}"
                for command in page
                for index in range(len(command.receipt["groups"]))
            }
            cancelled = set(
                DairyWorksheetCommand.objects.filter(
                    farm=farm, receipt__cancelled_source__in=markers
                ).values_list("receipt__cancelled_source", flat=True)
            )
            results = [
                {
                    **command.receipt,
                    "groups": [
                        {
                            **group,
                            "cancelled": f"{command.request_key}:{index}" in cancelled,
                        }
                        for index, group in enumerate(command.receipt["groups"])
                    ],
                }
                for command in page
            ]
        else:
            animals = service.eligible_animals(request.user, farm.pk)
            if request.query_params.get("category"):
                animals = animals.filter(category=request.query_params["category"])
            if request.query_params.get("batch"):
                animals = animals.filter(
                    batch_id=serializers.UUIDField().run_validation(
                        request.query_params["batch"]
                    )
                )
            search = request.query_params.get("search", "").strip()[:100]
            if search:
                animals = animals.filter(
                    Q(identifier__icontains=search)
                    | Q(cattle_profile__name__icontains=search)
                )
            page = pager.paginate_queryset(animals, request, view=self)
            results = [
                {
                    "id": str(animal.pk),
                    "identifier": animal.identifier,
                    "name": getattr(
                        getattr(animal, "cattle_profile", None), "name", ""
                    ),
                    "category": animal.category,
                    "batch_code": animal.batch.batch_code if animal.batch_id else "",
                }
                for animal in page
            ]
        response = pager.get_paginated_response(results)
        response.data["products"] = [
            {"id": str(item.pk), "name": item.nome}
            for item in feed_products(request.user.organization)
        ]
        return response

    def post(self, request):
        service.require_manager(request.user)
        serializer = service.FeedingCommand(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(service.supply(request, serializer.validated_data))


class DairyFeedingCancellationView(APIView):
    permission_classes = (CattlePermission,)

    def post(self, request):
        service.require_manager(request.user)
        serializer = service.Cancellation(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(service.cancel(request, serializer.validated_data))
