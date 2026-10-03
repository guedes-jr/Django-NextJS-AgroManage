import logging

from django.conf import settings
from django.db import transaction
from django.db.models import Count
from rest_framework import mixins, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from apps.platform_admin.services import record_platform_action
from common.permissions import IsOrganizationMember, IsPlatformAdmin

from .models import AIConversation, AIMessage, SupportArticle
from .serializers import AIMessageSerializer, AIQuestionSerializer
from .services.consumption import generation_metadata, record_generation_usage
from .services.provider_factory import get_ai_provider
from .services.providers import AIConfigurationError, AIProviderError
from .services.support import (
    configuration,
    consume_support_question,
    handoff_summary,
    knowledge_context,
    redact_secrets,
    refund_support_question,
    whatsapp_url,
)
from .support_serializers import (
    HandoffSerializer,
    SupportArticleSerializer,
    SupportConfigurationSerializer,
    SupportConversationSerializer,
)

logger = logging.getLogger(__name__)


class SupportBurstThrottle(UserRateThrottle):
    scope = "support_questions"
    rate = "30/hour"


@api_view(["GET"])
@permission_classes([IsOrganizationMember])
def support_configuration(request):
    return Response(SupportConfigurationSerializer(configuration()).data)


@api_view(["GET", "PATCH"])
@permission_classes([IsPlatformAdmin])
def admin_support_configuration(request):
    config = configuration()
    if request.method == "PATCH":
        serializer = SupportConfigurationSerializer(
            config, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        record_platform_action(
            request=request,
            action="support.configuration.updated",
            object_type="SupportConfiguration",
            object_id=config.pk,
        )
    return Response(SupportConfigurationSerializer(config).data)


class SupportArticleViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = (IsOrganizationMember,)
    serializer_class = SupportArticleSerializer
    queryset = SupportArticle.objects.filter(is_published=True)
    search_fields = ("title", "category", "content")
    filterset_fields = ("kind", "category")


class AdminSupportArticleViewSet(viewsets.ModelViewSet):
    permission_classes = (IsPlatformAdmin,)
    serializer_class = SupportArticleSerializer
    queryset = SupportArticle.objects.all()
    search_fields = ("title", "category", "content")

    def perform_create(self, serializer):
        article = serializer.save()
        record_platform_action(
            request=self.request,
            action="support.article.created",
            object_type="SupportArticle",
            object_id=article.pk,
        )

    def perform_update(self, serializer):
        article = serializer.save()
        record_platform_action(
            request=self.request,
            action="support.article.updated",
            object_type="SupportArticle",
            object_id=article.pk,
        )

    def perform_destroy(self, instance):
        record_platform_action(
            request=self.request,
            action="support.article.deleted",
            object_type="SupportArticle",
            object_id=instance.pk,
        )
        instance.delete()


class SupportConversationViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = (IsOrganizationMember,)
    serializer_class = SupportConversationSerializer

    def get_queryset(self):
        return (
            AIConversation.objects.filter(
                organization=self.request.user.organization,
                user=self.request.user,
                subject=AIConversation.Subject.SUPPORT,
            )
            .select_related("user", "organization")
            .annotate(messages_count=Count("messages"))
            .prefetch_related("messages")
        )

    def perform_create(self, serializer):
        serializer.save(
            organization=self.request.user.organization,
            user=self.request.user,
            subject=AIConversation.Subject.SUPPORT,
            title="Suporte do sistema",
        )

    @action(detail=True, methods=["post"], throttle_classes=[SupportBurstThrottle])
    def ask(self, request, pk=None):
        conversation = self.get_object()
        serializer = AIQuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get("context_type"):
            return Response(
                {
                    "detail": "O suporte utiliza apenas o guia do sistema e as dúvidas publicadas."
                },
                status=400,
            )
        question = serializer.validated_data["question"]
        with transaction.atomic():
            locked = AIConversation.objects.select_for_update().get(pk=conversation.pk)
            if not locked.is_active:
                return Response(
                    {
                        "detail": "Esta conversa está encerrada. Inicie uma nova conversa."
                    },
                    status=409,
                )
            if locked.messages.filter(status=AIMessage.Status.PENDING).exists():
                return Response(
                    {"detail": "Aguarde a resposta da pergunta anterior."}, status=409
                )
            usage_id = consume_support_question(request.user)
            message = AIMessage.objects.create(
                conversation=locked, role="user", content=question, status="pending"
            )
        try:
            provider = get_ai_provider()
            if provider.moderate(question)["flagged"]:
                message.status = AIMessage.Status.BLOCKED
                message.save(update_fields=("status", "updated_at"))
                refund_support_question(usage_id)
                return Response(
                    {
                        "detail": "Não foi possível responder a essa solicitação. Descreva a dúvida sobre o sistema."
                    },
                    status=422,
                )
            history = list(
                AIMessage.objects.filter(
                    conversation=conversation, status="completed"
                ).order_by("-created_at")[:12]
            )
            history.reverse()
            answer = provider.generate(
                user=request.user,
                conversation=conversation,
                question=question,
                history=history,
                context=knowledge_context(question),
            )
            output_safety = provider.moderate(answer.text)
            if output_safety["flagged"]:
                AIMessage.objects.create(
                    conversation=conversation, role="assistant", content="", status="blocked",
                    provider=answer.provider, model=answer.model,
                    input_tokens=answer.input_tokens, output_tokens=answer.output_tokens,
                    latency_ms=answer.latency_ms,
                    fallback_count=max(len(answer.attempts) - 1, 0),
                    provider_attempts=list(answer.attempts), **generation_metadata(answer),
                )
                record_generation_usage(request.user, answer)
                message.status = AIMessage.Status.BLOCKED
                message.save(update_fields=("status", "updated_at"))
                refund_support_question(usage_id)
                return Response(
                    {
                        "detail": "A resposta não pôde ser exibida. Você pode continuar com um atendente."
                    },
                    status=422,
                )
            with transaction.atomic():
                message.status = AIMessage.Status.COMPLETED
                message.save(update_fields=("status", "updated_at"))
                response = AIMessage.objects.create(
                    conversation=conversation,
                    role="assistant",
                    content=answer.text,
                    status="completed",
                    model=answer.model,
                    provider=answer.provider,
                    input_tokens=answer.input_tokens,
                    output_tokens=answer.output_tokens,
                    latency_ms=answer.latency_ms,
                    provider_attempts=list(answer.attempts),
                    fallback_count=max(len(answer.attempts) - 1, 0),
                    safety_classification={"output": output_safety},
                    openai_response_id=answer.response_id,
                    **generation_metadata(answer),
                )
                if answer.response_id and settings.OPENAI_AI_STORE_RESPONSES:
                    conversation.openai_previous_response_id = answer.response_id
                conversation.save(
                    update_fields=("openai_previous_response_id", "updated_at")
                )
                record_generation_usage(request.user, answer)
            return Response({"message": AIMessageSerializer(response).data}, status=201)
        except (AIConfigurationError, AIProviderError):
            error_code = "provider_unavailable"
        except Exception:
            logger.exception("Falha no atendimento de suporte por IA")
            error_code = "internal_error"
        message.status = AIMessage.Status.FAILED
        message.error_code = error_code
        message.save(update_fields=("status", "error_code", "updated_at"))
        refund_support_question(usage_id)
        return Response(
            {
                "detail": "O atendimento por IA está indisponível agora. Consulte as dúvidas e tutoriais ou fale com um atendente."
            },
            status=503,
        )

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        conversation = self.get_object()
        conversation.is_active = False
        conversation.save(update_fields=("is_active", "updated_at"))
        return Response(self.get_serializer(conversation).data)

    @action(detail=True, methods=["post"])
    def handoff(self, request, pk=None):
        conversation = self.get_object()
        serializer = HandoffSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        summary = redact_secrets(
            serializer.validated_data.get("summary") or handoff_summary(conversation)
        )
        return Response(
            {
                "summary": summary,
                "whatsapp_url": whatsapp_url(configuration().whatsapp_number, summary),
            }
        )
