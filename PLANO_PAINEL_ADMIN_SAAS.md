# Plano do Painel Administrativo SaaS — AgroManage

## 1. Objetivo

Evoluir o AgroManage de uma aplicação de gestão agropecuária multi-organização para uma plataforma SaaS comercializável, com uma área administrativa exclusiva para a equipe responsável pelo serviço.

Essa nova área deverá permitir:

- gerenciar todas as organizações clientes;
- gerenciar usuários e acessos;
- cadastrar planos, preços, recursos e limites;
- controlar assinaturas, faturas e pagamentos;
- acompanhar indicadores comerciais e financeiros da plataforma;
- prestar suporte assistido aos clientes;
- monitorar a saúde técnica do sistema;
- executar ferramentas administrativas e consultas controladas;
- manter uma trilha de auditoria completa.

O painel administrativo da plataforma deverá ser separado do painel utilizado pelos clientes.

---

## 2. Diagnóstico da implementação atual

O projeto já possui uma base adequada para iniciar essa evolução:

- backend Django 5 com Django REST Framework;
- frontend Next.js 16 com App Router;
- autenticação JWT;
- entidade `Organization` funcionando como tenant;
- usuários vinculados a uma organização;
- papéis internos `owner`, `admin`, `manager`, `operator` e `viewer`;
- filtros por organização em diversos endpoints;
- financeiro operacional das organizações;
- relatórios e dashboard por organização;
- estrutura inicial de auditoria;
- Django Admin disponível na infraestrutura.

### 2.1. Lacunas encontradas

1. O campo `Organization.plan` é apenas uma escolha fixa entre Free, Starter, Pro e Enterprise. Não existem assinatura, preço, cobrança, fatura, limite ou histórico de plano.

2. Os papéis atuais representam permissões dentro de uma organização. Um `owner` é dono de uma organização cliente, não administrador do AgroManage.

3. Não existe uma autorização explícita de plataforma, como `platform_admin`, `platform_support`, `platform_finance` ou `platform_developer`.

4. A auditoria possui um modelo inicial, mas ainda não cobre de forma sistemática as operações sensíveis.

5. O isolamento multi-tenant está implementado diretamente em vários `get_queryset`. Antes de permitir acesso global, esse isolamento precisa ser padronizado e testado.

6. Existem poucos testes automatizados de isolamento entre organizações e autorização administrativa.

7. A rotina de atualização do projeto está acessível para `owner/admin` de organização. Essa é uma operação de plataforma e deverá sair do escopo dos clientes.

8. O financeiro atual representa receitas e despesas da atividade rural. Ele não deve ser usado para representar o financeiro comercial do AgroManage.

---

## 3. Arquitetura proposta

Inicialmente, o sistema poderá continuar como um monólito modular, mantendo um único backend e um único frontend. Entretanto, os dois contextos deverão possuir separação lógica rígida.

```text
Painel do cliente
/home/*
/api/v1/*

        separado de

Painel da plataforma
/platform/*
/api/v1/platform/*
```

O novo domínio interno poderá ser chamado de `platform`, `backoffice` ou `platform_admin`.

Separar o painel em outro projeto ou outro deploy poderá ser considerado no futuro. Para o primeiro ciclo, manter o monólito reduz complexidade, desde que APIs, permissões, layouts e auditoria sejam independentes.

### 3.1. Princípios arquiteturais

- autorização negada por padrão;
- separação entre dados do cliente e dados comerciais da plataforma;
- nenhuma permissão de organização concede acesso à plataforma;
- toda consulta global deve existir somente em endpoints de plataforma;
- toda operação sensível deve gerar auditoria;
- serviços e selectors devem concentrar as regras de escopo;
- o frontend nunca será a única camada de proteção;
- ferramentas técnicas terão privilégios mínimos e acesso temporário;
- operações demoradas serão executadas por jobs assíncronos;
- integrações externas deverão ser idempotentes.

---

## 4. Autorização da plataforma

Criar uma camada de autorização independente dos papéis das organizações.

### 4.1. Papéis sugeridos

- `platform_owner`: controle integral da plataforma;
- `platform_admin`: organizações, usuários, planos e configurações;
- `platform_finance`: assinaturas, cobranças, pagamentos e indicadores;
- `platform_support`: consulta de organizações e suporte assistido;
- `platform_developer`: observabilidade e ferramentas técnicas;
- `platform_auditor`: acesso somente leitura aos logs e auditorias.

Esses valores não devem ser adicionados ao campo atual `User.role`, porque ele representa o papel do usuário dentro da organização.

### 4.2. Modelagem sugerida

- `PlatformStaffProfile`;
- `PlatformRole`;
- `PlatformPermission`;
- `PlatformRoleAssignment`.

Para uma primeira versão, um perfil administrativo poderá possuir um papel único. A modelagem de permissões granulares deve ser usada se diferentes colaboradores internos precisarem de combinações específicas de acesso.

### 4.3. Controles obrigatórios

- `is_staff` não deverá ser suficiente sozinho;
- MFA obrigatório para a equipe interna;
- sessão administrativa com duração menor;
- reautenticação para ações críticas;
- rate limit e bloqueio por tentativas;
- registro de IP, dispositivo e user-agent;
- encerramento remoto de sessões;
- nenhum `owner` de organização poderá acessar `/platform`;
- ações destrutivas deverão exigir confirmação e justificativa.

---

## 5. Dashboard executivo da plataforma

O dashboard global deverá consolidar dados de todas as organizações sem misturar o financeiro rural com o financeiro comercial do SaaS.

### 5.1. Indicadores de clientes

- organizações ativas;
- organizações em período de teste;
- organizações suspensas;
- novos clientes no período;
- cancelamentos;
- taxa de conversão de teste;
- crescimento mensal;
- organizações por plano;
- organizações sem atividade recente;
- quantidade total de usuários;
- usuários ativos nos últimos 7 e 30 dias.

### 5.2. Indicadores comerciais

- MRR — receita recorrente mensal;
- ARR — receita recorrente anual;
- receita recebida no período;
- receita pendente;
- inadimplência;
- ticket médio;
- ARPU;
- churn de clientes;
- churn de receita;
- expansão e redução de plano;
- previsão de renovações;
- faturas vencidas;
- pagamentos falhos.

### 5.3. Indicadores técnicos

- requisições por período;
- erros por endpoint;
- tarefas Celery com falha;
- tempo médio das APIs;
- filas pendentes;
- uso do banco de dados;
- relatórios gerados;
- armazenamento utilizado;
- últimas versões implantadas;
- organizações com maior consumo.

### 5.4. Filtros

- período;
- plano;
- status da assinatura;
- organização;
- região;
- situação de pagamento.

---

## 6. Gestão de organizações

### 6.1. Listagem

- busca por nome, documento, slug ou e-mail;
- filtros por plano, status, criação e última atividade;
- ordenação e paginação;
- exportação CSV/XLSX;
- ações em lote devidamente autorizadas.

### 6.2. Detalhes da organização

- dados cadastrais;
- contatos e endereços;
- usuários e papéis;
- fazendas e volume de dados;
- plano atual;
- assinatura;
- limites e consumo;
- situação financeira;
- faturas e pagamentos;
- histórico de alterações;
- últimas atividades;
- erros recentes;
- solicitações de suporte;
- bloqueios e observações internas.

### 6.3. Ações administrativas

- ativar ou suspender;
- alterar plano;
- conceder período de cortesia;
- ajustar limites;
- reenviar convite;
- solicitar redefinição de senha;
- encerrar sessões;
- transferir ownership;
- iniciar acesso assistido;
- iniciar processo de anonimização ou encerramento da conta.

Suspensão e exclusão deverão ser operações diferentes. Suspensão preserva os dados. Exclusão deverá ter período de retenção, confirmação reforçada e possibilidade de cancelamento antes da remoção definitiva.

---

## 7. Gestão global de usuários

Funcionalidades previstas:

- listar usuários de todas as organizações;
- filtrar por organização, papel, status e último acesso;
- visualizar sessões ativas;
- bloquear ou reativar usuário;
- encerrar todas as sessões;
- redefinir MFA;
- disparar recuperação de senha;
- transferir usuário entre organizações em fluxo controlado;
- visualizar histórico de segurança;
- detectar contas sem organização;
- exportar dados respeitando as permissões internas.

### 7.1. Evolução futura para múltiplas organizações

Atualmente, um usuário pertence a apenas uma organização. Caso consultores, contadores ou agrônomos precisem acessar vários clientes, será necessário substituir o vínculo direto por uma associação:

```text
OrganizationMembership
- user
- organization
- role
- status
- joined_at
- invitation
- custom_permissions
```

Essa mudança não precisa fazer parte do primeiro MVP, mas a arquitetura não deverá impedir sua implementação futura.

---

## 8. Planos, assinaturas e limites

O enum atual de plano deixará de ser a fonte principal de regras comerciais.

### 8.1. Modelos sugeridos

- `Plan`;
- `PlanPrice`;
- `Feature`;
- `PlanEntitlement`;
- `Subscription`;
- `SubscriptionEvent`;
- `Invoice`;
- `InvoiceItem`;
- `Payment`;
- `PaymentAttempt`;
- `Coupon`;
- `UsageRecord`.

### 8.2. Configurações de um plano

- nome e descrição;
- preço mensal e anual;
- período de teste;
- limite de usuários;
- limite de fazendas;
- limite de armazenamento;
- limite de relatórios;
- módulos disponíveis;
- integrações disponíveis;
- prioridade de suporte;
- status público;
- versão comercial.

### 8.3. Ciclo da assinatura

```text
trialing -> active -> past_due -> suspended -> cancelled
```

Também deverão existir:

- upgrade e downgrade;
- prorrata;
- cancelamento imediato ou ao final do ciclo;
- período de tolerância;
- histórico imutável;
- concessões manuais;
- plano personalizado Enterprise.

A checagem de recursos deverá ser centralizada em um serviço de entitlements, evitando condicionais comerciais espalhadas pelas views e componentes do frontend.

---

## 9. Financeiro comercial da plataforma

Criar um domínio separado, preferencialmente `apps/billing`. Não reutilizar `apps/finance`, pois esse módulo pertence à operação rural do cliente.

### 9.1. Telas previstas

- visão geral financeira;
- assinaturas;
- faturas;
- pagamentos;
- tentativas com falha;
- inadimplência;
- cupons;
- reembolsos;
- conciliação;
- exportações contábeis;
- eventos recebidos do gateway.

### 9.2. Integração com gateway

- integração futura com Stripe, Mercado Pago, Asaas ou outro provedor;
- webhooks assinados;
- processamento idempotente;
- armazenamento somente dos identificadores externos necessários;
- nenhuma persistência de dados completos de cartão;
- retentativas e fila de eventos;
- conciliação entre gateway e banco local;
- alertas de falhas de processamento.

---

## 10. Suporte e acesso assistido

O suporte poderá precisar visualizar o ambiente do cliente, mas isso não deverá ser feito por uma troca silenciosa de organização.

Criar `SupportAccessGrant` ou `ImpersonationSession` contendo:

- operador interno;
- organização acessada;
- justificativa;
- chamado relacionado;
- responsável pela autorização;
- início e expiração;
- nível de acesso;
- ações realizadas;
- data de encerramento.

Durante o acesso assistido, a interface deverá mostrar permanentemente:

> Você está acessando a organização X como suporte.

Por padrão, o acesso deverá ser somente leitura. Alterações exigirão concessão específica e serão auditadas.

---

## 11. Auditoria e segurança

Criar uma auditoria específica de plataforma ou ampliar o modelo atual com contexto explícito de tenant.

### 11.1. Eventos mínimos

- login administrativo;
- falha de login;
- visualização de dados sensíveis;
- exportação;
- alteração de plano;
- suspensão de organização;
- alteração de usuário;
- impersonação;
- consulta ao banco;
- execução operacional;
- mudança de configuração;
- criação e revogação de credenciais.

### 11.2. Dados registrados

- ator;
- organização afetada;
- ação;
- objeto afetado;
- valores anteriores e novos;
- justificativa;
- endereço IP;
- user-agent;
- request ID;
- data e horário;
- resultado da operação.

Os registros não deverão ser editáveis ou apagáveis pelo painel convencional.

---

## 12. Terminal, banco de dados e IPython

Não é recomendado expor um shell do servidor ou uma sessão IPython de produção diretamente dentro do navegador. Uma falha nessa ferramenta poderia comprometer todas as organizações, arquivos, secrets e infraestrutura.

### 12.1. Console SQL seguro

É possível disponibilizar um console administrativo limitado:

- permitir somente `SELECT`;
- usar um usuário PostgreSQL read-only;
- preferencialmente conectar a uma réplica de leitura;
- aplicar limite obrigatório de linhas;
- aplicar timeout curto;
- bloquear múltiplas instruções;
- bloquear funções perigosas;
- exigir confirmação para consultas de alto custo;
- permitir cancelamento da consulta;
- registrar o histórico completo;
- controlar exportações;
- mascarar dados pessoais;
- restringir a `platform_developer`;
- exigir MFA e justificativa por execução.

### 12.2. Consultas administrativas prontas

Antes do SQL livre, deverão ser disponibilizadas consultas aprovadas:

- usuários de uma organização;
- volume de registros por tenant;
- faturas inconsistentes;
- assinaturas vencidas;
- tarefas com erro;
- integridade entre fazendas e organizações;
- consumo de armazenamento;
- organizações sem atividade recente.

### 12.3. IPython

Para produção, o acesso recomendado é:

- por SSH/VPN ou bastion;
- em container efêmero;
- com credenciais temporárias;
- usuário nominal;
- autorização just-in-time;
- gravação da sessão;
- ambiente sem acesso automático a secrets sensíveis;
- conexão read-only por padrão.

Se futuramente for indispensável oferecer IPython no painel, ele deverá rodar em um sandbox efêmero e isolado, nunca dentro do processo Django e nunca com acesso automático ao banco principal.

---

## 13. Ferramentas administrativas e operacionais

Além do gerenciamento comercial, o painel poderá oferecer:

- saúde das APIs;
- status de Celery e Redis;
- tarefas com falha;
- retentativa controlada de tarefas;
- logs sanitizados;
- histórico de deploy;
- feature flags;
- modo de manutenção;
- anúncios globais;
- templates de e-mail;
- jobs operacionais previamente cadastrados;
- status de backups;
- status de integrações;
- consumo de armazenamento;
- consulta de eventos recebidos de webhooks.

Operações como deploy, migrations e comandos Django não deverão aceitar texto arbitrário. O painel deverá apresentar uma lista fechada de operações previamente implementadas e autorizadas.

---

## 14. Plano de implementação

## Fase 0 — Segurança e fundação multi-tenant

### Atividades

- inventariar todos os modelos e relacionamentos;
- revisar querysets por organização;
- criar testes de vazamento entre tenants;
- padronizar o uso de `organization` em services e selectors;
- impedir referências cruzadas entre objetos de organizações diferentes;
- mover atualização e deploy para permissão exclusiva da plataforma;
- completar a auditoria de autenticação e ações sensíveis;
- definir matriz de papéis e permissões;
- documentar retenção, suspensão e exclusão;
- revisar armazenamento dos tokens e política de sessão.

### Critério de conclusão

Um usuário da organização A não consegue consultar, alterar ou associar nenhum objeto da organização B, mesmo manipulando UUIDs diretamente nas requisições.

## Fase 1 — Estrutura do painel da plataforma

### Backend

- criar app `platform_admin` ou `backoffice`;
- criar perfis e permissões da equipe;
- criar `/api/v1/platform/`;
- implementar guards de plataforma;
- criar serializers separados;
- adicionar filtros, ordenação e paginação;
- implementar auditoria administrativa.

### Frontend

- criar `/platform/login`, caso seja adotada autenticação separada;
- criar `/platform/layout`;
- criar sidebar e topbar próprios;
- proteger rotas;
- criar página inicial;
- implementar estados de loading, erro e acesso negado;
- diferenciar visualmente o backoffice do painel do cliente.

### Critério de conclusão

Somente a equipe explicitamente autorizada consegue acessar qualquer rota ou endpoint da plataforma.

## Fase 2 — Organizações e usuários

- criar listagem global de organizações;
- criar página de detalhes da organização;
- implementar indicadores de uso;
- implementar ativação e suspensão;
- criar gestão global de usuários;
- implementar redefinição de acesso;
- implementar encerramento de sessões;
- adicionar observações internas;
- criar exportações;
- registrar todas as ações na auditoria;
- criar testes de permissões para cada papel.

Essa fase representa o primeiro MVP operacional do backoffice.

## Fase 3 — Planos e entitlements

- substituir o enum atual como fonte principal;
- criar cadastro de planos;
- criar preços e ciclos;
- criar features e limites;
- vincular assinatura à organização;
- implementar período de teste;
- implementar concessões manuais;
- medir o uso dos recursos;
- criar serviço central de entitlement;
- criar telas de plano e consumo para o cliente;
- migrar as organizações atuais.

## Fase 4 — Billing e dashboard financeiro

- criar faturas e itens;
- criar pagamentos e tentativas;
- integrar gateway de pagamento;
- processar webhooks de forma idempotente;
- implementar inadimplência e período de tolerância;
- criar dashboard de MRR, ARR e churn;
- implementar exportações financeiras;
- criar alertas de pagamento;
- implementar conciliação.

## Fase 5 — Suporte assistido

- criar grants temporários;
- implementar impersonação somente leitura;
- adicionar banner permanente de contexto;
- exigir justificativa;
- implementar expiração automática;
- auditar cada ação;
- permitir revogação imediata;
- criar fluxo adicional para concessão de escrita.

## Fase 6 — Ferramentas de operação

- exibir saúde das APIs;
- exibir status de Celery e Redis;
- listar tarefas com falha;
- disponibilizar logs sanitizados;
- registrar histórico de deploy;
- criar feature flags;
- criar anúncios e modo de manutenção;
- criar jobs operacionais aprovados;
- implementar console SQL read-only.

## Fase 7 — Ferramentas avançadas de desenvolvedor

- configurar réplica de leitura;
- implementar mascaramento de dados;
- criar biblioteca de consultas aprovadas;
- permitir análise controlada de query plan;
- criar sandbox efêmero;
- implementar acesso just-in-time;
- integrar acesso seguro ao bastion para IPython;
- criar alertas para consultas sensíveis.

---

## 15. Ordem recomendada de execução

1. Auditoria completa do isolamento multi-tenant.
2. Papéis administrativos da plataforma.
3. API `/api/v1/platform`.
4. Layout `/platform`.
5. Dashboard global básico.
6. CRUD e detalhes das organizações.
7. Gestão global de usuários.
8. Suspensão e reativação.
9. Auditoria administrativa.
10. Planos e assinaturas.
11. Billing e dashboard financeiro.
12. Suporte assistido.
13. Observabilidade e ferramentas operacionais.
14. Console SQL read-only.
15. Ambiente seguro para IPython.

---

## 16. Primeiro marco recomendado

O primeiro marco deverá entregar:

- autorização administrativa separada;
- layout exclusivo do backoffice;
- dashboard global básico;
- listagem e detalhes das organizações;
- gestão global de usuários;
- ativação e suspensão;
- encerramento de sessões;
- auditoria administrativa;
- testes de isolamento multi-tenant.

Planos, billing, suporte assistido e ferramentas técnicas serão construídos sobre essa fundação.

O console SQL e o IPython deverão permanecer nas últimas fases, após permissões, MFA, auditoria e isolamento estarem comprovadamente seguros.

---

## 17. Critérios gerais de aceite

- nenhum papel de organização concede acesso ao painel da plataforma;
- endpoints globais existem somente em `/api/v1/platform/`;
- operações administrativas são autorizadas no backend;
- dados financeiros do SaaS não se misturam ao financeiro rural;
- alterações sensíveis possuem ator, justificativa e auditoria;
- organizações suspensas não perdem seus dados automaticamente;
- limites de plano são aplicados por um serviço central;
- webhooks de pagamento são idempotentes;
- acesso assistido é temporário, visível e auditado;
- consultas SQL não possuem permissão de escrita;
- IPython não roda dentro do processo principal da aplicação;
- testes automatizados cobrem isolamento entre tenants e papéis internos.

---

## 18. Estado da implementação

Atualizado em 16/07/2026.

### Concluído

- estrutura independente do backoffice em `/platform` e `/api/v1/platform/`;
- perfis e guards próprios da equipe da plataforma;
- dashboard global, gestão de organizações e gestão global de usuários;
- planos, features, assinaturas, faturas, pagamentos e indicadores financeiros internos;
- acesso assistido temporário e auditado;
- operações administrativas, feature flags, anúncios e manutenção;
- console SQL somente leitura, consultas aprovadas e análise controlada com `EXPLAIN`;
- concessões temporárias para sandbox de desenvolvedor e infraestrutura isolada;
- testes de isolamento entre organizações nos principais domínios;
- matriz inicial de permissões internas da organização;
- política para operador criar e editar somente lançamentos próprios nos fluxos que possuem autoria rastreável;
- exclusão de tarefas, transações, movimentações de estoque, registros de ração e relatórios restrita a `owner/admin`.

### Parcial

- entitlements: modelos e administração existem, mas os limites ainda precisam ser aplicados progressivamente em todos os módulos do cliente;
- billing: domínio interno e dashboard existem, mas falta integração com um gateway real, webhooks e conciliação;
- observabilidade: saúde e execuções estão disponíveis, mas dependem da integração com os serviços reais de produção;
- sandbox/IPython: controle, auditoria e infraestrutura existem, mas o runtime isolado precisa ser implantado no ambiente operacional;
- matriz de permissões: aplicada aos lançamentos com campo de autoria; os demais modelos precisam registrar autor antes de receber a mesma restrição sem quebra de compatibilidade.

### Pendente antes da comercialização

- MFA obrigatório e reautenticação para ações críticas da plataforma;
- rate limiting e política reforçada de login administrativo;
- integração e homologação do gateway de pagamentos;
- aplicação completa dos entitlements e medição de consumo;
- política automatizada de retenção, anonimização e exclusão;
- armazenamento/observabilidade reais, alertas e runbooks operacionais;
- implantação do sandbox em rede e credenciais isoladas;
- testes end-to-end do backoffice e testes de carga dos dashboards;
- revisão de segurança independente antes do acesso a dados globais em produção.
