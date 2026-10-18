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
