import logging

from django.conf import settings
from django.db.models import Count, Prefetch
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AIConversation, AIFeedback, AIMessage
from .serializers import (
    AIConversationDetailSerializer, AIConversationSerializer, AIFeedbackSerializer,
    AIMessageSerializer, AIQuestionSerializer,
)
from .services.openai_service import (
    AIConfigurationError, AIProviderError, OpenAIRuralAssistant,
)
from .services.quota import (
    AIDisabledError, AIQuotaExceededError, add_token_usage, consume_question,
    get_ai_quota, release_question,
)
from .services.safety import classify_local_risk, emergency_prefix


logger = logging.getLogger(__name__)


class AIConversationViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAuthenticated,)
    http_method_names = ("get", "post", "patch", "delete", "head", "options")

    def get_queryset(self):
        queryset = AIConversation.objects.filter(
            organization=self.request.user.organization, user=self.request.user
        ).annotate(messages_count=Count("messages")).order_by("-updated_at")
        if self.action == "retrieve":
            queryset = queryset.prefetch_related(Prefetch("messages", AIMessage.objects.all()))
        return queryset

    def get_serializer_class(self):
        return AIConversationDetailSerializer if self.action == "retrieve" else AIConversationSerializer

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization, user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        conversation = self.get_object()
        conversation.is_active = False
        conversation.save(update_fields=("is_active", "updated_at"))
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=("post",), url_path="ask")
    def ask(self, request, pk=None):
        conversation = self.get_object()
        if not conversation.is_active:
            return Response({"detail": "Esta conversa está encerrada."}, status=status.HTTP_409_CONFLICT)
        serializer = AIQuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        question = serializer.validated_data["question"]

        try:
            consume_question(request.user)
        except AIDisabledError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except AIQuotaExceededError as exc:
            return Response({"detail": str(exc), "quota": get_ai_quota(request.user).to_dict()}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        message = AIMessage.objects.create(
            conversation=conversation, role=AIMessage.Role.USER, content=question,
            status=AIMessage.Status.PENDING,
        )
        try:
            assistant = OpenAIRuralAssistant()
            input_safety = assistant.moderate(question)
            local_safety = classify_local_risk(question)
            if input_safety["flagged"]:
                message.status = AIMessage.Status.BLOCKED
                message.safety_classification = {"input": input_safety, "local": local_safety.to_dict()}
                message.save(update_fields=("status", "safety_classification", "updated_at"))
                release_question(request.user)
                return Response(
                    {"detail": "Não posso responder a essa solicitação por segurança.", "blocked": True},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )

            message.status = AIMessage.Status.COMPLETED
            message.safety_classification = {"input": input_safety, "local": local_safety.to_dict()}
            message.save(update_fields=("status", "safety_classification", "updated_at"))
            history = list(
                conversation.messages.filter(status=AIMessage.Status.COMPLETED)
                .exclude(id=message.id).order_by("-created_at")[:12]
            )
            history.reverse()
            answer = assistant.generate(
                user=request.user, conversation=conversation, question=question, history=history
            )
            output_safety = assistant.moderate(answer.text)
            if output_safety["flagged"]:
                message.status = AIMessage.Status.BLOCKED
                message.safety_classification["output"] = output_safety
                message.save(update_fields=("status", "safety_classification", "updated_at"))
                release_question(request.user)
                return Response(
                    {"detail": "A resposta foi retida pela verificação de segurança.", "blocked": True},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )

            content = f"{emergency_prefix()}{answer.text}" if local_safety.emergency else answer.text
            assistant_message = AIMessage.objects.create(
                conversation=conversation,
                role=AIMessage.Role.ASSISTANT,
                content=content,
                status=AIMessage.Status.COMPLETED,
                model=answer.model,
                input_tokens=answer.input_tokens,
                output_tokens=answer.output_tokens,
                latency_ms=answer.latency_ms,
                safety_classification={"output": output_safety, "local": local_safety.to_dict()},
                openai_response_id=answer.response_id,
            )
            add_token_usage(
                request.user, input_tokens=answer.input_tokens, output_tokens=answer.output_tokens
            )
            if conversation.title == "Nova conversa":
                conversation.title = question[:157] + ("..." if len(question) > 157 else "")
            if answer.response_id and settings.OPENAI_AI_STORE_RESPONSES:
                conversation.openai_previous_response_id = answer.response_id
            conversation.save(update_fields=("title", "openai_previous_response_id", "updated_at"))
            return Response(
                {"message": AIMessageSerializer(assistant_message).data, "quota": get_ai_quota(request.user).to_dict()},
                status=status.HTTP_201_CREATED,
            )
        except AIConfigurationError as exc:
            message.status = AIMessage.Status.FAILED
            message.error_code = "not_configured"
            message.save(update_fields=("status", "error_code", "updated_at"))
            release_question(request.user)
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except AIProviderError as exc:
            message.status = AIMessage.Status.FAILED
            message.error_code = "provider_error"
            message.save(update_fields=("status", "error_code", "updated_at"))
            release_question(request.user)
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception:
            logger.exception("Falha inesperada ao processar pergunta do Assistente IA")
            message.status = AIMessage.Status.FAILED
            message.error_code = "internal_error"
            message.save(update_fields=("status", "error_code", "updated_at"))
            release_question(request.user)
            return Response(
                {"detail": "Não foi possível concluir a resposta."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class AIFeedbackViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    permission_classes = (IsAuthenticated,)
    serializer_class = AIFeedbackSerializer
    queryset = AIFeedback.objects.none()


@api_view(("GET",))
@permission_classes((IsAuthenticated,))
def usage(request):
    if not request.user.organization_id:
        return Response({"detail": "Usuário sem organização."}, status=status.HTTP_400_BAD_REQUEST)
    return Response(get_ai_quota(request.user).to_dict())
