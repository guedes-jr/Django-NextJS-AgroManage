from rest_framework import serializers
from .models import SupportTicket, SupportTicketMessage, SupportTicketEvent, SupportTicketAttachment


class StrictSerializer(serializers.Serializer):
    def validate(self, attrs):
        if set(self.initial_data) - set(self.fields):
            raise serializers.ValidationError("Campo não permitido nesta operação.")
        return attrs


class OpenTicketSerializer(StrictSerializer):
    subject = serializers.CharField(max_length=200, min_length=3)
    body = serializers.CharField(max_length=10000, min_length=3)
    category = serializers.ChoiceField(choices=SupportTicket.Category.choices)
    priority = serializers.ChoiceField(choices=SupportTicket.Priority.choices, default="normal")
    creation_key = serializers.UUIDField()
    conversation_id = serializers.UUIDField(required=False)
    shared_context = serializers.CharField(max_length=4000, required=False, allow_blank=True, default="")


class PublicReplySerializer(StrictSerializer):
    body = serializers.CharField(max_length=10000)
    request_key = serializers.UUIDField()
    expected_version = serializers.IntegerField(min_value=1)


class TeamReplySerializer(PublicReplySerializer):
    is_internal = serializers.BooleanField(default=False)


class TicketTransitionSerializer(StrictSerializer):
    status = serializers.ChoiceField(choices=SupportTicket.Status.choices)
    expected_version = serializers.IntegerField(min_value=1)


class TicketMetadataSerializer(StrictSerializer):
    expected_version = serializers.IntegerField(min_value=1)
    assignee_id = serializers.UUIDField(allow_null=True, required=False)
    category = serializers.ChoiceField(choices=SupportTicket.Category.choices, required=False)
    priority = serializers.ChoiceField(choices=SupportTicket.Priority.choices, required=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if len(attrs) < 2:
            raise serializers.ValidationError("Informe uma alteração.")
        return attrs


class TicketUploadSerializer(StrictSerializer):
    file = serializers.FileField()
    request_key = serializers.UUIDField()
    expected_version = serializers.IntegerField(min_value=1)


class TicketSerializer(serializers.ModelSerializer):
    organization_id = serializers.UUIDField(read_only=True)
    requester_id = serializers.UUIDField(read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    requester_name = serializers.CharField(source="requester.full_name", read_only=True)
    assignee_name = serializers.CharField(source="assignee.full_name", read_only=True, allow_null=True)

    class Meta:
        model = SupportTicket
        fields = ("id", "organization_id", "organization_name", "requester_id", "requester_name", "assignee_name", "subject", "category", "priority", "status", "version", "shared_context", "first_response_at", "first_resolved_at", "resolved_at", "closed_at", "created_at", "updated_at")
        read_only_fields = fields


class TeamTicketSerializer(TicketSerializer):
    assignee_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta(TicketSerializer.Meta):
        fields = TicketSerializer.Meta.fields + ("assignee_id",)
        read_only_fields = fields


class AttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportTicketAttachment
        fields = ("id", "filename", "size", "created_at")
        read_only_fields = fields


class PublicMessageSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    can_attach = serializers.SerializerMethodField()

    def get_can_attach(self, obj):
        return obj.author_id == self.context["request"].user.pk and self.context["ticket"].status not in {"resolved", "closed"}

    class Meta:
        model = SupportTicketMessage
        fields = ("id", "author_name", "body", "from_team", "attachments", "can_attach", "created_at")
        read_only_fields = fields


class TeamMessageSerializer(PublicMessageSerializer):
    class Meta(PublicMessageSerializer.Meta):
        fields = PublicMessageSerializer.Meta.fields + ("is_internal",)
        read_only_fields = fields


class PublicEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True)

    class Meta:
        model = SupportTicketEvent
        fields = ("id", "actor_name", "kind", "description", "changes", "created_at")
        read_only_fields = fields


class TeamEventSerializer(PublicEventSerializer):
    class Meta(PublicEventSerializer.Meta):
        fields = PublicEventSerializer.Meta.fields + ("is_internal",)
        read_only_fields = fields
