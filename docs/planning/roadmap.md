# AgroManage Roadmap

Plano implementado: gestão de organizações e atendimento administrativo.

As entregas funcionais deste plano estão implementadas. A ativação em produção
continua sujeita às migrations, configuração operacional e validação em staging.

## Decisões comuns

- Reutilizar Django/DRF, o cliente de API do frontend, Celery e os registros de auditoria existentes.
- Manter regras de domínio em serviços/seletores; consultas e operações sempre limitadas à organização.
- Definir permissões por ação antes de expor novos endpoints. Administradores da plataforma gerenciam
  cadastro, responsáveis, estados e limites; suporte atende chamados e usa acesso assistido;
  financeiro mantém seu escopo atual; auditoria recebe acesso de leitura conforme o papel.
- Registrar ator, organização, horário e resultado das ações administrativas. Associar alterações
  feitas no acesso assistido à sua sessão, sem exigir protocolo ou justificativa de entrada.
- Adicionar migrations para alterações de schema, com backfill e compatibilidade durante a transição.
- Não incluir nesta iniciativa uma reformulação geral da cobrança, dos papéis ou dos módulos agrícolas.

## Fase 4 — Exportação e recuperação por organização

- [x] Recuperação controlada por organização.
  - Objetivo: restaurar dados sem SQL manual nem afetar outros clientes.
  - Dependência: pacote técnico versionado e previamente validado, mapa de relacionamentos e estratégia de consistência.
  - Primeira entrega: restaurar em organização isolada para conferência, preservando a origem;
    validar formato, integridade, relações, arquivos e compatibilidade de schema. Bloquear autenticação,
    notificações, cobranças e integrações externas no ambiente restaurado.
  - Segunda entrega: recuperação por mesclagem sobre a organização original, preservando registros
    posteriores e contas existentes, com prévia de impacto, bloqueio transacional de escrita,
    cópia anterior de segurança, confirmação final e plano de rollback. Definir política de IDs,
    conflitos e tratamento de pagamentos/eventos externos, sem reexecutá-los.
  - Implementado em `platform_admin/recovery/` e na ficha administrativa; contratos e limites em
    `docs/ai/api.md` e operação em `docs/ai/infra.md`. Validar contenção dos locks em PostgreSQL
    antes da liberação; os testes locais usam SQLite.
  - Aceite: ensaio de restauração comparado ao manifesto; nenhum efeito externo duplicado;
    recuperação interrompida não expõe dados incompletos; trilha integral de execução e rollback testado.

## Validação e entrega

- Cada entrega inclui migrations/backfill quando necessários, contratos tipados, documentação focada
  e os testes mais estreitos que verifiquem comportamento e autorização.
- Cobrir especialmente concorrência de responsáveis/cotas, expiração de convites, isolamento de tenants,
  dados internos do suporte, retomada de tarefas e consistência de exportação/restauração.
- Executar suíte ampla quando alterar autenticação, permissões ou infraestrutura compartilhada;
  validar lint/TypeScript e os fluxos visuais das telas alteradas.
- Liberar por etapas; medir duração/erros das tarefas e custo das consultas antes de ampliar o uso.
- Estimativa de esforço e calendário devem ser definidos após fechar políticas de cotas, convites,
  visibilidade de chamados e estratégia de recuperação. Não são premissas deste plano.

## Notificações pelo Telegram

- [ ] Implementar o Telegram como canal adicional e opcional. Começar pelos lembretes da agenda
  e alertas operacionais de reprodução e vacinação. O usuário pode ativar WhatsApp, Telegram
  ou ambos. Campanhas, anexos, grupos e fallback automático ficam fora da primeira entrega.

### 1. Vínculo e consentimento

O vínculo e a revogação estão implementados no backend e nas preferências de Web e Mobile.
O contrato está em `docs/ai/api.md`. A configuração do bot e o teste com uma conta real seguem pendentes.

- Criar um bot por ambiente e guardar seu token e o segredo do webhook na configuração do backend.
  Usar um webhook HTTPS com validação do cabeçalho `X-Telegram-Bot-Api-Secret-Token`.
  [Telegram Bot API](https://core.telegram.org/bots/api#setwebhook)
- Nas preferências de notificações em Web e Mobile, iniciar o vínculo com um link para o bot.
  Gerar um código opaco, de uso único e curta duração, associado ao usuário autenticado, e armazenar
  seu hash. Receber `/start` somente em conversa privada, deduplicar por `update_id` e consumir
  o código atomicamente. Exigir confirmação no AgroManage antes de ativar o vínculo.
  [Links de bots no Telegram](https://core.telegram.org/bots/features#deep-linking)
- Persistir o vínculo por conta, com unicidade do chat ativo por bot. Tratar o `chat_id` como dado
  privado, acessível apenas no backend. Expor na API de preferências o estado do vínculo e as ações
  de iniciar, confirmar e revogar. Permitir revogação também via `/stop` no chat vinculado.
  Manter a preferência de envio separada do vínculo e desativada por padrão.

### 2. Regras de envio e operação

O envio de alertas de reprodução e vacinação para organizações piloto, as preferências
em Web e Mobile e a política por categoria na API estão implementados. Lembretes da agenda
e controles administrativos nas interfaces seguem pendentes.

- Adicionar o canal `telegram` a `NotificationDelivery` e uma opção por categoria em
  `NotificationCategoryPolicy`, ambas com migrations compatíveis com os dados existentes.
  Reutilizar `NotificationService` e Celery, incluindo o fluxo de atualização de notificações
  existentes. Na agenda, estender o contrato de disponibilidade de canais e a seleção de canal
  do lembrete em Web e Mobile. Usar a mesma checagem no agendamento e antes do envio para validar
  preferência, vínculo, categoria, acesso atual à organização e validade do evento.
- Implementar o cliente `sendMessage` e recuperar entregas pendentes pelo agendador. Usar a
  unicidade por notificação e canal e a reserva de processamento para evitar envios concorrentes.
  Respeitar `retry_after` em HTTP 429, interromper tentativas para chat bloqueado ou inválido
  e registrar timeout pós-envio como resultado incerto, sem reenvio automático. Usar mensagens
  curtas e links autenticados para conteúdo sensível. [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage)
- Exibir políticas por categoria e resultados por canal no painel administrativo, preservando
  as permissões atuais em Web e Mobile. Registrar contagens, falhas e idade das pendências.
  Omitir tokens, códigos de vínculo, identificadores de chat e corpos de mensagens da telemetria.

### 3. Validação e liberação

- Cobrir vínculo expirado, repetido ou revogado, webhook inválido, isolamento entre organizações,
  desligamento do canal com entrega pendente, concorrência de workers e falhas da API do Telegram.
- Validar em staging com bot e contas de teste. Completar o vínculo em Web e Mobile, enviar um
  lembrete e um alerta operacional, confirmar que cada canal selecionado recebe sua própria
  entrega e que a revogação impede novos envios. Verificar que as notificações existentes do
  WhatsApp continuam funcionando.
- Liberar para organizações piloto mediante flag, com categorias desativadas por padrão.
  Para reverter, desativar o agendamento e o despacho do Telegram e remover seu webhook,
  preservando o histórico de entregas e os demais canais.
