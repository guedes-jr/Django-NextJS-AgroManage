from rest_framework import serializers

from .models import AIConversation, AIFeedback, AIMessage


class AIMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIMessage
        fields = (
            "id", "role", "content", "status", "model", "input_tokens", "output_tokens",
            "latency_ms", "safety_classification", "created_at",
        )
        read_only_fields = fields


class AIQuestionSerializer(serializers.Serializer):
    question = serializers.CharField(min_length=3, max_length=4000, trim_whitespace=True)


class AIConversationSerializer(serializers.ModelSerializer):
    messages_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = AIConversation
        fields = ("id", "title", "subject", "is_active", "messages_count", "created_at", "updated_at")
        read_only_fields = ("id", "is_active", "messages_count", "created_at", "updated_at")


class AIConversationDetailSerializer(AIConversationSerializer):
    messages = AIMessageSerializer(many=True, read_only=True)

    class Meta(AIConversationSerializer.Meta):
        fields = AIConversationSerializer.Meta.fields + ("messages",)


class AIFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIFeedback
        fields = ("id", "message", "helpful", "comment", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_message(self, message):
        request = self.context["request"]
        if message.role != AIMessage.Role.ASSISTANT or message.conversation.user_id != request.user.id:
            raise serializers.ValidationError("Mensagem inválida para avaliação.")
        return message

    def create(self, validated_data):
        feedback, _ = AIFeedback.objects.update_or_create(
            message=validated_data["message"], user=self.context["request"].user,
            defaults={"helpful": validated_data["helpful"], "comment": validated_data.get("comment", "")},
        )
        return feedback
