# Assistente IA com OpenCode Zen

## Configuração de produção

Configure no `backend/.env`:

```env
AI_DEFAULT_PROVIDER=opencode_zen
AI_ALLOW_PAID_FALLBACK=False
OPENCODE_ZEN_API_KEY=chave_fornecida_pelo_zen
OPENCODE_ZEN_BASE_URL=https://opencode.ai/zen/v1
OPENCODE_ZEN_MODEL=mimo-v2.5-free
OPENCODE_ZEN_MAX_OUTPUT_TOKENS=1200
OPENCODE_ZEN_TIMEOUT_SECONDS=45
AI_MODEL_SYNC_DAY_OF_WEEK=monday
AI_MODEL_SYNC_HOUR=3
AI_MODEL_SYNC_MINUTE=0
AI_MODEL_CATALOG_STALE_DAYS=14
REDIS_URL=redis://127.0.0.1:6379/0
```

Não habilite `AI_ALLOW_PAID_FALLBACK` sem aprovação administrativa de custo.

## Primeira ativação

```bash
cd /var/www/agromanage/backend
source .venv/bin/activate
export DJANGO_SETTINGS_MODULE=config.settings.prod
python manage.py migrate --noinput
python manage.py sync_opencode_models
```

Depois, acesse `/platform/ai`, confirme os modelos gratuitos encontrados, escolha o modelo
principal e ordene os fallbacks. Por fim, execute:

```bash
python manage.py check_ai_readiness --strict
```

## Serviços obrigatórios

```bash
sudo systemctl enable --now agromanage-celery
sudo systemctl enable --now agromanage-celery-beat
sudo systemctl status agromanage-celery agromanage-celery-beat
```

Somente uma instância do `agromanage-celery-beat` deve estar ativa.

## Homologação funcional

1. Clique em **Sincronizar modelos** no painel e confirme uma execução concluída.
2. Confirme que há pelo menos um modelo gratuito habilitado e um principal.
3. Faça uma pergunta geral no Assistente IA.
4. Faça uma pergunta contextual vinculada a uma plantação da organização atual.
5. Confirme no painel o provedor, modelo, tokens e latência, sem conteúdo da conversa.
6. Desabilite temporariamente um fallback e confirme que ele deixa de ser elegível.
7. Mantenha o fallback pago bloqueado, salvo aprovação explícita.
8. Verifique os logs do worker e do Beat sem imprimir chaves.

## Diagnóstico

```bash
python manage.py check_ai_readiness
python manage.py sync_opencode_models
sudo journalctl -u agromanage-celery -n 100 --no-pager
sudo journalctl -u agromanage-celery-beat -n 100 --no-pager
```

Se o Zen estiver indisponível, o último catálogo válido é preservado. Uma sincronização com
falha nunca desativa todos os modelos existentes.
