import re

from rest_framework import serializers

from .models import SupportArticle, SupportConfiguration
from .serializers import AIConversationDetailSerializer


class SupportArticleSerializer(serializers.ModelSerializer):
    content = serializers.CharField(max_length=12000)

    class Meta:
        model = SupportArticle
        fields = (
            "id",
            "title",
            "kind",
            "category",
            "content",
            "video_url",
            "is_published",
            "position",
            "updated_at",
        )
        read_only_fields = ("id", "updated_at")

    def validate_video_url(self, value):
        if value and not value.startswith("https://"):
            raise serializers.ValidationError("Use um endereço HTTPS para o tutorial.")
        return value


class SupportConfigurationSerializer(serializers.ModelSerializer):
    whatsapp_number = serializers.CharField(
        max_length=32, allow_blank=True, required=False
    )
    daily_question_limit = serializers.IntegerField(min_value=1, max_value=100)

    class Meta:
        model = SupportConfiguration
        fields = (
            "whatsapp_number",
            "ai_enabled",
            "daily_question_limit",
            "welcome_message",
        )

    def validate_whatsapp_number(self, value):
        number = re.sub(r"[\s()+.-]", "", value)
        if number and not re.fullmatch(r"[1-9]\d{9,14}", number):
            raise serializers.ValidationError(
                "Informe DDI e DDD, com 10 a 15 dígitos, por exemplo 5511999999999."
            )
        return number


class SupportConversationSerializer(AIConversationDetailSerializer):
    class Meta(AIConversationDetailSerializer.Meta):
        read_only_fields = AIConversationDetailSerializer.Meta.fields


class HandoffSerializer(serializers.Serializer):
    summary = serializers.CharField(max_length=4000, min_length=3, required=False)
