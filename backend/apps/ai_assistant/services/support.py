"""System support: global knowledge, private conversations and independent daily allowance."""

import re
from urllib.parse import urlencode

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, Throttled

from ..models import AIMessage, SupportArticle, SupportConfiguration, SupportUsage

GUIDE = """
Fazenda Mais — guia de uso confirmado:
- Dashboard: resumos financeiros respeitam o mês/ano selecionado e a data da compra/pagamento.
  Uma compra cadastrada hoje com data antiga aparece no período antigo.
- Suínos: cadastros de matriz, marrã, reprodutor e lotes são categorias distintas.
  Matrizes são acompanhadas no Relatório das Matrizes; o Relatório Geral dos Lotes mostra produção.
- Cobertura, diagnóstico, parto e desmame são registros do ciclo reprodutivo. Parto provável
  depende de cobertura em andamento e não é mostrado durante lactação.
- Mão de Obra: tipos diária, mensal e por hora; informe setor, pessoas, quantidade e valor.
- Relatórios: filtros de período/status/categoria e exportações; valores ausentes aparecem como —.
- Permissões: operadores criam registros/categorias; gerente, administrador e proprietário
  editam/removem. Gestão dos membros da organização é de administrador/proprietário.
- Configurações ficam no menu lateral. Suporte fica próximo às Configurações.
""".strip()


def configuration():
    return SupportConfiguration.objects.get_or_create(key="global")[0]


def knowledge_context(question):
    articles = SupportArticle.objects.filter(is_published=True)
    words = list(dict.fromkeys(re.findall(r"[\wÀ-ÿ]{3,}", question.lower())))[:8]
    matches = Q()
    for word in words:
        matches |= (
            Q(title__icontains=word)
            | Q(category__icontains=word)
            | Q(content__icontains=word)
        )
    relevant = list(articles.filter(matches)[:15]) if words else []
    selected = relevant or list(articles[:15])
    context = GUIDE + "\n\nBase de dúvidas e tutoriais publicados:\n"
    for article in selected:
        context += f"\n{article.title}\n{article.content[:5000]}\n"
    return context[:24000]


@transaction.atomic
def consume_support_question(user):
    config = configuration()
    if not config.ai_enabled:
        raise PermissionDenied(
            "O atendimento por IA está indisponível. Use as dúvidas e tutoriais ou fale com um atendente."
        )
    usage, _ = SupportUsage.objects.select_for_update().get_or_create(
        organization=user.organization, user=user, day=timezone.localdate()
    )
    if usage.questions_used >= config.daily_question_limit:
        raise Throttled(
            detail="Você atingiu o limite de perguntas de suporte de hoje. Pode continuar pelas dúvidas e tutoriais ou pelo WhatsApp."
        )
    usage.questions_used += 1
    usage.save(update_fields=("questions_used", "updated_at"))
    return usage.pk


def refund_support_question(usage_id):
    SupportUsage.objects.filter(pk=usage_id, questions_used__gt=0).update(
        questions_used=F("questions_used") - 1
    )


def redact_secrets(text):
    return re.sub(
        r"(?i)\b(senha|password|token|chave(?: de api)?)\s*[:=]\s*\S+",
        r"\1: [omitido]",
        text,
    )


def handoff_summary(conversation):
    messages = list(
        conversation.messages.exclude(status=AIMessage.Status.BLOCKED).order_by(
            "-created_at"
        )[:12]
    )
    messages.reverse()
    questions = [
        redact_secrets(m.content[:900])
        for m in messages
        if m.role == AIMessage.Role.USER
    ]
    attempts = [
        redact_secrets(m.content[:600])
        for m in messages
        if m.role == AIMessage.Role.ASSISTANT and m.status == AIMessage.Status.COMPLETED
    ]
    lines = [
        "Suporte — Fazenda Mais",
        f"Usuário: {conversation.user.full_name}",
        f"Conta: {conversation.user.email}",
        f"Organização: {conversation.organization.name}",
        "",
        "Problema relatado:",
    ]
    lines += [f"- {text}" for text in questions[-3:]] or [
        "O usuário deseja ajuda com o sistema."
    ]
    lines += ["", "Orientações fornecidas pela IA (a confirmar com o usuário):"]
    lines += [f"- {text}" for text in attempts[-2:]] or [
        "Não houve resposta concluída pela IA."
    ]
    lines += [
        "",
        "Solicitação: dar continuidade ao atendimento; o usuário ainda precisa de ajuda.",
    ]
    return "\n".join(lines)[:4000]


def whatsapp_url(number, summary):
    return f"https://wa.me/{number}?{urlencode({'text': summary})}" if number else None
