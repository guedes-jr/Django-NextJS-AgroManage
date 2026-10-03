from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.ai_assistant.models import (
    AIConversation,
    AIMessage,
    AIUsage,
    SupportArticle,
    SupportConfiguration,
    SupportUsage,
)
from apps.ai_assistant.services.prompt import build_system_prompt
from apps.ai_assistant.services.providers import AIProviderError
from apps.ai_assistant.services.providers.base import GeneratedAnswer
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformStaffProfile


class SupportTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.org = Organization.objects.create(name="Suporte A", slug="support-a")
        self.other = Organization.objects.create(name="Suporte B", slug="support-b")
        User = get_user_model()
        self.user = User.objects.create_user(
            email="support@example.com",
            password="test",
            full_name="Produtor",
            organization=self.org,
            role="operator",
        )
        self.owner = User.objects.create_user(
            email="owner-support@example.com",
            password="test",
            organization=self.org,
            role="owner",
        )
        self.other_user = User.objects.create_user(
            email="other-support@example.com", password="test", organization=self.other
        )
        self.admin = User.objects.create_user(
            email="platform-support@example.com", password="test", role="admin"
        )
        PlatformStaffProfile.objects.create(
            user=self.admin, role="platform_admin", is_active=True
        )
        self.config = SupportConfiguration.objects.create(
            key="global", whatsapp_number="5511999999999"
        )
        self.article = SupportArticle.objects.create(
            title="Cadastro confirmado",
            content="Abra o cadastro e confira a data.",
            is_published=True,
        )
        self.draft = SupportArticle.objects.create(
            title="Segredo do rascunho", content="Não publicar", is_published=False
        )
        self.client.force_authenticate(self.user)

    def conversation(self, user=None, subject="support"):
        return AIConversation.objects.create(
            organization=(user or self.user).organization,
            user=user or self.user,
            subject=subject,
        )

    def ask(self, conversation, question="Como cadastrar uma matriz?"):
        return self.client.post(
            reverse("support-conversation-ask", args=[conversation.pk]),
            {"question": question},
            format="json",
        )

    def test_published_knowledge_is_shared_but_drafts_and_mutations_are_restricted(
        self,
    ):
        for user in [self.user, self.other_user]:
            self.client.force_authenticate(user)
            response = self.client.get(reverse("support-article-list"))
            ids = {row["id"] for row in response.data["results"]}
            self.assertIn(str(self.article.pk), ids)
            self.assertNotIn(str(self.draft.pk), ids)
            self.assertEqual(
                self.client.get(
                    reverse("support-article-detail", args=[self.draft.pk])
                ).status_code,
                404,
            )
            self.assertEqual(
                self.client.post(
                    reverse("support-article-list"), {}, format="json"
                ).status_code,
                405,
            )
        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.get(reverse("admin-support-article-list")).status_code, 403
        )
        self.assertEqual(
            self.client.patch(
                reverse("admin-support-configuration"),
                {"whatsapp_number": "5511888888888"},
                format="json",
            ).status_code,
            403,
        )

    def test_platform_admin_manages_global_content_and_contact_validation(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse("admin-support-article-list"),
            {
                "title": "Tutorial novo",
                "kind": "tutorial",
                "content": "Passos",
                "is_published": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            self.client.patch(
                reverse("admin-support-article-detail", args=[response.data["id"]]),
                {"content": "Passos atualizados"},
                format="json",
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.patch(
                reverse("admin-support-configuration"),
                {"whatsapp_number": "+55 (11) 99999-9999", "daily_question_limit": 25},
                format="json",
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.patch(
                reverse("admin-support-configuration"),
                {"whatsapp_number": "https://malicioso.example"},
                format="json",
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.patch(
                reverse("admin-support-configuration"),
                {"daily_question_limit": 0},
                format="json",
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.delete(
                reverse("admin-support-article-detail", args=[response.data["id"]])
            ).status_code,
            204,
        )

    def test_conversations_are_private_even_between_members_of_the_same_org(self):
        other_conversation = self.conversation(self.owner)
        foreign = self.conversation(self.other_user)
        for conversation in [other_conversation, foreign]:
            for suffix in ["ask", "resolve", "handoff"]:
                response = self.client.post(
                    reverse(f"support-conversation-{suffix}", args=[conversation.pk]),
                    {"question": "Quero ajuda"},
                    format="json",
                )
                self.assertEqual(response.status_code, 404)
        result = self.client.post(
            reverse("support-conversation-list"),
            {"subject": "livestock"},
            format="json",
        )
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.data["subject"], "support")
        self.assertEqual(
            self.client.post(
                reverse("ai-conversation-list"), {"subject": "support"}, format="json"
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.get(
                reverse("ai-conversation-detail", args=[result.data["id"]])
            ).status_code,
            404,
        )
        regular = self.conversation(subject="livestock")
        self.assertEqual(
            self.client.patch(
                reverse("ai-conversation-detail", args=[regular.pk]),
                {"subject": "support"},
                format="json",
            ).status_code,
            400,
        )
        regular.refresh_from_db()
        self.assertEqual(regular.subject, "livestock")

    @patch("apps.ai_assistant.support_views.get_ai_provider")
    def test_blocked_question_refunds_quota_and_does_not_generate_answer(self, factory):
        factory.return_value.moderate.return_value = {"flagged": True}
        conversation = self.conversation()
        self.assertEqual(self.ask(conversation).status_code, 422)
        self.assertEqual(SupportUsage.objects.get(user=self.user).questions_used, 0)
        self.assertEqual(conversation.messages.get().status, AIMessage.Status.BLOCKED)
        factory.return_value.generate.assert_not_called()

    @patch("apps.ai_assistant.support_views.get_ai_provider")
    def test_support_reuses_provider_with_only_published_system_knowledge(
        self, factory
    ):
        self.org.subscription.custom_limits = {"ai_enabled": False}
        self.org.subscription.save(update_fields=["custom_limits"])
        provider = factory.return_value
        provider.moderate.return_value = {"flagged": False}
        provider.generate.return_value = GeneratedAnswer(
            text="Confira o cadastro e a data da compra.",
            response_id="",
            model="mock",
            input_tokens=10,
            output_tokens=5,
            latency_ms=1,
        )
        conversation = self.conversation()
        response = self.ask(conversation, "Como funciona o cadastro confirmado?")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(SupportUsage.objects.get(user=self.user).questions_used, 1)
        self.assertEqual(AIUsage.objects.get(user=self.user).questions_used, 0)
        self.assertEqual(AIUsage.objects.get(user=self.user).input_tokens, 10)
        context = provider.generate.call_args.kwargs["context"]
        self.assertIn(self.article.content, context)
        self.assertNotIn(self.draft.content, context)
        self.assertEqual(
            provider.generate.call_args.kwargs["conversation"].subject, "support"
        )
        prompt = build_system_prompt(subject="support", authorized_context="Guia")
        self.assertIn("Ajude exclusivamente a usar o sistema", prompt)
        self.assertNotIn("assistente educativo especializado", prompt)

    @patch("apps.ai_assistant.support_views.get_ai_provider")
    def test_daily_quota_and_disabled_support_do_not_call_provider(self, factory):
        self.config.daily_question_limit = 1
        self.config.save()
        conversation = self.conversation()
        from django.utils import timezone

        SupportUsage.objects.create(
            organization=self.org,
            user=self.user,
            day=timezone.localdate(),
            questions_used=1,
        )
        self.assertEqual(self.ask(conversation).status_code, 429)
        self.config.ai_enabled = False
        self.config.save()
        self.assertEqual(self.ask(conversation).status_code, 403)
        factory.assert_not_called()

    @patch("apps.ai_assistant.support_views.get_ai_provider")
    def test_provider_failure_refunds_support_quota_and_still_prepares_handoff(
        self, factory
    ):
        factory.return_value.moderate.return_value = {"flagged": False}
        factory.return_value.generate.side_effect = AIProviderError("não disponível")
        conversation = self.conversation()
        self.assertEqual(self.ask(conversation).status_code, 503)
        self.assertEqual(SupportUsage.objects.get(user=self.user).questions_used, 0)
        response = self.client.post(
            reverse("support-conversation-handoff", args=[conversation.pk]),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("Como cadastrar uma matriz", response.data["summary"])
        self.assertIn("Não houve resposta concluída", response.data["summary"])

    def test_whatsapp_summary_can_be_reviewed_and_missing_number_is_explicit(self):
        conversation = self.conversation()
        AIMessage.objects.create(
            conversation=conversation,
            role="user",
            content="Erro ao salvar. senha: segredo",
            status="completed",
        )
        AIMessage.objects.create(
            conversation=conversation,
            role="assistant",
            content="Confira a data.",
            status="completed",
        )
        url = reverse("support-conversation-handoff", args=[conversation.pk])
        response = self.client.post(url, {}, format="json")
        self.assertNotIn("segredo", response.data["summary"])
        parsed = urlparse(response.data["whatsapp_url"])
        self.assertEqual(parsed.netloc, "wa.me")
        self.assertEqual(parsed.path, "/5511999999999")
        self.assertEqual(parse_qs(parsed.query)["text"][0], response.data["summary"])
        response = self.client.post(
            url, {"summary": "Problema revisado pelo usuário"}, format="json"
        )
        self.assertEqual(response.data["summary"], "Problema revisado pelo usuário")
        self.config.whatsapp_number = ""
        self.config.save()
        self.assertIsNone(self.client.post(url, {}, format="json").data["whatsapp_url"])

    @patch("apps.ai_assistant.support_views.get_ai_provider")
    def test_closed_conversation_and_operational_context_are_rejected(self, factory):
        conversation = self.conversation()
        response = self.client.post(
            reverse("support-conversation-ask", args=[conversation.pk]),
            {
                "question": "Como salvar?",
                "context_type": "farm",
                "context_id": str(self.org.pk),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            self.client.post(
                reverse("support-conversation-resolve", args=[conversation.pk])
            ).status_code,
            200,
        )
        self.assertEqual(self.ask(conversation).status_code, 409)
        factory.assert_not_called()
