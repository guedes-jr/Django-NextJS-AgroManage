# Plano de próximos passos — AgroManage SaaS

Este documento contém somente atividades ainda pendentes. Funcionalidades já implementadas no painel administrativo não fazem parte deste plano.

## 1. Estabilização do frontend

### 1.1. Corrigir hooks e mutabilidade

- corrigir atualizações de estado executadas diretamente dentro de efeitos;
- revisar dependências de `useEffect`, `useMemo` e `useCallback`;
- eliminar mutações de propriedades, estados e valores retornados por hooks;
- corrigir operações não determinísticas durante a renderização;
- preservar memoizações manuais de forma compatível com o compilador React;
- trabalhar módulo por módulo para reduzir o risco de regressões.

Ordem sugerida:

1. componentes compartilhados;
2. fichas técnicas de animais;
3. reprodução;
4. clínico;
5. estoque;
6. financeiro;
7. configurações.

Critérios de aceite:

- nenhuma ocorrência das regras `react-hooks/set-state-in-effect`, `react-hooks/immutability`, `react-hooks/purity` ou `react-hooks/preserve-manual-memoization`;
- comportamento das telas preservado;
- build de produção concluído;
- testes dos fluxos afetados aprovados.

### 1.2. Melhorar a tipagem TypeScript

- substituir os usos explícitos de `any` por tipos de domínio;
- começar pelos serviços compartilhados `livestockService.ts` e `clinicalService.ts`;
- criar tipos reutilizáveis para respostas paginadas, formulários e erros da API;
- tipar eventos e propriedades dos componentes;
- evitar conversões forçadas que escondam incompatibilidades.

Critérios de aceite:

- ausência de `@typescript-eslint/no-explicit-any` nos módulos migrados;
- contratos do frontend compatíveis com serializers e respostas do backend;
- nenhuma quebra no build TypeScript.

### 1.3. Limpeza de lint e imagens

- remover imports, estados, funções e variáveis não utilizados;
- substituir `<img>` por `Image` quando a otimização do Next.js for apropriada;
- corrigir caracteres JSX não escapados;
- manter exceções somente quando documentadas e justificadas.

Critério de aceite:

- `npm run lint` concluído sem erros e sem avisos não justificados.

## 2. Conclusão das permissões das organizações

- identificar modelos operacionais que ainda não registram o autor;
- adicionar autoria sem alterar registros históricos ou fluxos existentes;
- preencher autoria histórica somente quando houver uma origem confiável;
- permitir que `operator` crie lançamentos na própria organização;
- permitir que `operator` edite somente lançamentos criados por ele;
- permitir que `manager`, `admin` e `owner` editem lançamentos da organização conforme a matriz;
- restringir exclusões a `owner` e `admin`;
- manter `viewer` com acesso somente leitura;
- testar acesso por papel e isolamento entre organizações em cada domínio.

Critérios de aceite:

- nenhum usuário acessa ou relaciona objetos de outra organização;
- operador não altera lançamentos de outro usuário;
- operador não exclui registros;
- migrações preservam os dados atuais;
- suíte completa do backend aprovada.

## 3. MFA e segurança administrativa

- implementar MFA obrigatório para membros da equipe da plataforma;
- definir duração reduzida para sessões administrativas;
- exigir reautenticação em ações críticas;
- aplicar rate limiting ao login e às ferramentas técnicas;
- registrar tentativas, bloqueios, IP, user-agent e request ID;
- permitir encerramento remoto das sessões administrativas;
- revisar armazenamento e renovação dos tokens do painel;
- adicionar recuperação segura de MFA.

Ações que deverão exigir reautenticação:

- suspensão de organização;
- alteração de plano ou assinatura;
- encerramento de sessões de terceiros;
- concessão de suporte com escrita;
- execução de consultas SQL;
- concessão ou execução de sandbox;
- alterações de configuração global.

Critérios de aceite:

- nenhum perfil da plataforma acessa o backoffice sem MFA;
- ações críticas falham quando a reautenticação estiver expirada;
- tentativas e ações ficam registradas em auditoria imutável.

## 4. Aplicação completa de planos e entitlements

- centralizar as verificações de recursos e limites no serviço de entitlements;
- aplicar limites de usuários, fazendas, relatórios e armazenamento;
- controlar módulos e integrações disponíveis por plano;
- medir consumo por organização;
- considerar concessões e limites personalizados;
- impedir novas criações quando o limite for atingido sem bloquear consulta ou exportação dos dados existentes;
- exibir consumo e limites no painel do cliente;
- apresentar mensagens claras para upgrade;
- registrar alterações e bloqueios comerciais em auditoria.

Critérios de aceite:

- regras comerciais não ficam duplicadas em views ou componentes;
- mudança de plano atualiza os recursos de forma previsível;
- organizações existentes são migradas sem perda de acesso indevida;
- limites possuem testes de fronteira e concorrência.

## 5. Gateway de pagamentos e billing operacional

- selecionar e homologar o gateway de pagamentos;
- implementar uma camada de integração desacoplada do provedor;
- receber webhooks assinados;
- processar eventos de forma idempotente;
- atualizar faturas, pagamentos, tentativas e assinaturas;
- implementar retentativas e fila de eventos com falha;
- aplicar período de tolerância e regras de inadimplência;
- implementar upgrade, downgrade e cancelamento;
- implementar conciliação entre gateway e banco local;
- criar alertas de falhas e divergências;
- não persistir dados completos de cartão.

Critérios de aceite:

- o mesmo webhook não gera cobranças ou atualizações duplicadas;
- eventos fora de ordem são tratados com segurança;
- falhas podem ser reprocessadas sem perda de histórico;
- testes de sandbox do gateway cobrem o ciclo completo da assinatura.

## 6. Retenção, privacidade e encerramento de organizações

- formalizar prazos de retenção por tipo de dado;
- diferenciar suspensão, cancelamento, anonimização e exclusão;
- implementar solicitação e confirmação reforçada de encerramento;
- oferecer período de cancelamento antes da exclusão definitiva;
- criar exportação dos dados da organização;
- implementar anonimização de dados pessoais quando aplicável;
- impedir exclusões físicas imediatas por ações comuns do painel;
- auditar todas as etapas do processo;
- documentar responsabilidades e procedimentos operacionais.

Critérios de aceite:

- nenhuma suspensão remove dados;
- exclusões possuem confirmação, prazo e trilha de auditoria;
- rotinas podem ser interrompidas e retomadas com segurança.

## 7. Observabilidade e operação em produção

- conectar o painel aos serviços reais de API, banco, Redis e Celery;
- coletar latência, volume, taxa de erros e filas pendentes;
- monitorar webhooks, billing, armazenamento e tarefas agendadas;
- configurar alertas com responsáveis e níveis de severidade;
- acompanhar backups e testes de restauração;
- sanitizar logs e remover secrets e dados pessoais;
- criar runbooks para incidentes e operações recorrentes;
- definir indicadores e objetivos de disponibilidade.

Critérios de aceite:

- alertas possuem procedimento e responsável definidos;
- restauração de backup é testada;
- logs não expõem credenciais ou dados sensíveis;
- falhas críticas podem ser identificadas e investigadas pelo backoffice.

## 8. Implantação segura do sandbox de desenvolvedor

- implantar o runtime em ambiente efêmero e isolado;
- separar rede, filesystem, processo e credenciais do Django principal;
- usar conexão read-only e preferencialmente réplica do banco;
- aplicar concessões temporárias e justificativa obrigatória;
- limitar CPU, memória, duração e volume de saída;
- bloquear acesso automático a secrets e serviços internos;
- registrar código, ator, concessão, resultado e duração;
- permitir cancelamento e revogação imediata;
- criar alertas para execuções sensíveis ou anormais;
- validar a destruição do ambiente após cada sessão.

Critérios de aceite:

- código arbitrário nunca executa no processo do backend;
- sandbox não possui credenciais de escrita do banco principal;
- concessões expiradas não podem ser reutilizadas;
- testes de fuga e abuso do isolamento são aprovados.

## 9. Validação para comercialização

- criar testes end-to-end dos fluxos críticos do cliente e do backoffice;
- testar permissões para cada papel de organização e plataforma;
- executar testes de carga dos dashboards e consultas globais;
- testar concorrência em limites, billing e webhooks;
- revisar índices e consultas de maior custo;
- realizar revisão independente de segurança;
- executar teste de recuperação de desastre;
- preparar checklist de implantação e rollback;
- documentar suporte, incidentes e responsabilidades;
- homologar o produto em ambiente equivalente ao de produção.

Critérios finais:

- suíte completa de backend, frontend e end-to-end aprovada;
- build de produção concluído;
- nenhuma vulnerabilidade crítica ou alta pendente;
- isolamento entre organizações comprovado;
- billing homologado no gateway;
- backups e rollback testados;
- operação e suporte possuem runbooks utilizáveis.

## Ordem de execução

1. estabilização dos hooks e mutabilidade;
2. tipagem e limpeza do frontend;
3. conclusão das permissões com autoria;
4. MFA e segurança administrativa;
5. entitlements;
6. gateway e billing;
7. retenção e privacidade;
8. observabilidade;
9. implantação do sandbox;
10. validação final para comercialização.
