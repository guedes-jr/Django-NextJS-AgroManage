from django.contrib.auth import get_user_model
from django.db.models import Q
from django.http import FileResponse
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.generics import get_object_or_404

from common.permissions import IsPlatformSupport
from . import ticket_services as services
from .ticket_serializers import (
    OpenTicketSerializer, PublicReplySerializer, TeamReplySerializer, TicketTransitionSerializer,
    TicketMetadataSerializer, TicketUploadSerializer, TicketSerializer, TeamTicketSerializer,
    PublicMessageSerializer, TeamMessageSerializer, PublicEventSerializer, TeamEventSerializer, AttachmentSerializer,
)


class TeamSupportPermission(IsPlatformSupport):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and not getattr(request.user, "support_access_grant", None)


class CustomerSupportPermission(BasePermission):
    def has_permission(self, request, view):
        return services.is_customer(request.user)


class SupportTicketViewSet(viewsets.GenericViewSet):
    permission_classes = [CustomerSupportPermission]
    serializer_class = TicketSerializer
    staff = False
    filter_backends = []
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        queryset = services.visible_tickets(self.request.user, self.staff)
        if self.action != "list":
            return queryset
        from .ticket_selectors import filter_tickets
        return filter_tickets(queryset, user=self.request.user, params=self.request.query_params, staff=self.staff)

    def list(self, request):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    def retrieve(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)

    def create(self, request):
        serializer = OpenTicketSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = services.open_ticket(user=request.user, values=serializer.validated_data)
        return Response(self.get_serializer(ticket).data, status=201)

    @action(detail=True, methods=["get", "post"])
    def messages(self, request, pk=None):
        ticket = self.get_object()
        cls = TeamMessageSerializer if self.staff else PublicMessageSerializer
        if request.method == "POST":
            serializer = (TeamReplySerializer if self.staff else PublicReplySerializer)(data=request.data)
            serializer.is_valid(raise_exception=True)
            ticket, message = services.add_message(user=request.user, ticket_id=ticket.pk, values=serializer.validated_data, staff=self.staff)
            return Response({"ticket": self.get_serializer(ticket).data, "message": cls(message, context={"request": request, "ticket": ticket}).data}, status=201)
        queryset = ticket.messages.select_related("author").prefetch_related("attachments")
        if not self.staff:
            queryset = queryset.filter(is_internal=False)
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(cls(page, many=True, context={"request": request, "ticket": ticket}).data)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        ticket = self.get_object()
        queryset = ticket.events.select_related("actor")
        if not self.staff:
            queryset = queryset.filter(is_internal=False)
        page = self.paginate_queryset(queryset)
        cls = TeamEventSerializer if self.staff else PublicEventSerializer
        return self.get_paginated_response(cls(page, many=True).data)

    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        ticket = self.get_object()
        serializer = TicketTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = services.transition_ticket(user=request.user, ticket_id=ticket.pk, values=serializer.validated_data, staff=self.staff)
        return Response(self.get_serializer(ticket).data)

    @action(detail=True, methods=["post"], url_path=r"messages/(?P<message_id>[^/.]+)/attachments")
    def upload(self, request, pk=None, message_id=None):
        ticket = self.get_object()
        serializer = TicketUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket, attachment = services.upload_attachment(user=request.user, ticket_id=ticket.pk, message_id=message_id, values=serializer.validated_data, staff=self.staff)
        return Response({"ticket": self.get_serializer(ticket).data, "attachment": AttachmentSerializer(attachment).data}, status=201)

    @action(detail=True, methods=["get"], url_path=r"attachments/(?P<attachment_id>[^/.]+)/download")
    def download(self, request, pk=None, attachment_id=None):
        ticket = self.get_object()
        messages = ticket.messages.all()
        if not self.staff:
            messages = messages.filter(is_internal=False)
        from .models import SupportTicketAttachment
        attachment = get_object_or_404(SupportTicketAttachment, pk=attachment_id, organization_id=ticket.organization_id, message_id__in=messages.values("pk"))
        try:
            handle = attachment.file.open("rb")
        except FileNotFoundError:
            from rest_framework.exceptions import NotFound
            raise NotFound("Arquivo indisponível.")
        response = FileResponse(handle, as_attachment=True, filename=attachment.filename, content_type="application/octet-stream")
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"
        return response


class TeamSupportTicketViewSet(SupportTicketViewSet):
    permission_classes = [TeamSupportPermission]
    serializer_class = TeamTicketSerializer
    staff = True
    http_method_names = ["get", "post", "patch", "head", "options"]

    def create(self, request):
        from rest_framework.exceptions import MethodNotAllowed
        raise MethodNotAllowed("POST")

    def partial_update(self, request, pk=None):
        ticket = self.get_object()
        serializer = TicketMetadataSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = services.change_metadata(user=request.user, ticket_id=ticket.pk, values=serializer.validated_data)
        return Response(self.get_serializer(ticket).data)

    @action(detail=False, methods=["get"])
    def assignees(self, request):
        queryset = get_user_model().objects.filter(is_active=True, platform_staff_profile__is_active=True, platform_staff_profile__role__in=["platform_owner", "platform_admin", "platform_support"]).order_by("full_name", "pk")
        search = request.query_params.get("search", "")
        if len(search) > 200:
            raise serializers.ValidationError("Busca muito longa.")
        if search:
            queryset = queryset.filter(Q(full_name__icontains=search) | Q(email__icontains=search))
        page = self.paginate_queryset(queryset.values("id", "full_name"))
        return self.get_paginated_response(page)
