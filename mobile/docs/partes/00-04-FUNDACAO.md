# Partes 00 a 04 — Descoberta, arquitetura e fundação

[Voltar ao plano](../IMPLEMENTACAO.md). P01–P04 já possuem implementação de projeto, sessão, transporte e navegação; conferir os recortes no código e em [LOGIN.md](../LOGIN.md), sem reiniciar o scaffold. Os checkboxes registram aceite integral, não ausência de código. Os IDs permanecem estáveis; responsáveis indicam competências, não pessoas já alocadas.

**Foco atual:** conferir a base existente e consolidar o padrão da Agenda, conforme a [ordem de execução](../IMPLEMENTACAO.md#ordem-atual-de-execução) e o [guia de design](../../DESIGN.md). A homologação nativa e o piloto continuam sendo evidências próprias.

## Parte 00 — Diagnóstico e recorte do piloto

**Resultado demonstrável:** escopo verificável do primeiro aplicativo, baseado nos fluxos atuais e em observação de campo. **Dependências:** nenhuma. **Responsáveis:** produto, mobile, backend e usuário de campo.

### Tarefas

- [ ] P00.01 — Selecionar organizações de teste com perfis admin, manager, operator e feeder; incluir somente leitura e capacidades diferentes. Usar dados sintéticos, nunca copiar dados produtivos para exemplos.
- [ ] P00.02 — Identificar tipos de operação efetivamente usados: bovinos de corte, leite, suínos e plantações. Definir qual deles será o primeiro piloto; leite é a proposta inicial, não uma escolha validada com usuários.
- [ ] P00.03 — Registrar aparelhos, sistema operacional, armazenamento disponível, qualidade de conexão, compartilhamento do aparelho e tarefas feitas sob sol ou com luvas. Não presumir que todos possuem Android recente.
- [ ] P00.04 — Medir no PWA três jornadas: abrir tarefa de hoje, localizar animal e registrar leite. Para cada uma registrar tempo mediano, toques, retornos, erros, requisições e dificuldades observadas, sem capturar dados pessoais desnecessários.
- [ ] P00.05 — Levantar as regras de somente leitura, assinatura e bloqueio operacional que o servidor aplica. Identificar o que deve continuar consultável quando escrever estiver bloqueado.
- [ ] P00.06 — Conferir cada endpoint P0 na cadeia rota → permissão → serializer → serviço/selector → resposta → teste. O schema OpenAPI é apoio, não substitui essa conferência.
- [ ] P00.07 — Inventariar rascunhos que precisam sobreviver ao encerramento e ações que podem esperar conexão; perguntar se dois dispositivos podem registrar a mesma operação no campo.
- [ ] P00.08 — Definir primeiro grupo de piloto, quem coleta feedback e quem decide se uma rotina está apta a expandir. Registrar situações que exigem continuar usando a web.
- [ ] P00.09 — Preencher a matriz de contratos da Parte 02 com o estado de cada garantia: confirmado por teste, existente mas não validado, ou ausente.
- [ ] P00.10 — Separar backlog obrigatório, expansão e pós-piloto. Toda funcionalidade deve ter usuário beneficiado, frequência, impacto e critério verificável.

### Entregáveis

Matriz de jornadas PWA/mobile; ficha dos aparelhos de referência; lista P0; mapa de perfis; riscos de API; evidência dos tempos de referência. Registrar resultados nesta documentação ou nas issues do projeto, sem criar planos na raiz.

### Critérios de aceite e testes

- As três jornadas têm início/fim definidos, pelo menos uma medição por perfil aplicável e nenhuma ação inventada para preencher a navegação.
- Está explícito quais operações serão apenas consultadas, quais permitem rascunho e quais permitem gravação online.
- Um fluxo é rejeitado antes do desenvolvimento se depende de endpoint inexistente sem tarefa de backend associada.
- Revisão conjunta do recorte com um usuário operacional; registrar divergências e decisão, sem transformar preferências de um único perfil em regra para todos.

### Divisão sugerida de entregas

P00-A: inventário e observação; P00-B: contratos e lacunas; P00-C: backlog e primeiro marco. Nenhum desses incrementos exige alterar a aplicação atual.

## Parte 01 — Estrutura do projeto e builds de desenvolvimento

**Stack definida:** React Native + Expo + TypeScript. A tarefa de compatibilidade abaixo escolhe versões suportadas dessa base; não reabre a escolha do framework. O scaffold deve respeitar `mobile/AGENTS.md`, `mobile/CLAUDE.md` e o `.gitignore`, mantendo as fontes/configurações nativas rastreáveis quando forem adicionadas.

**Resultado demonstrável:** aplicativo mínimo instalado em Android e iOS, conectado ao ambiente correto. **Dependências:** recorte P00. **Responsável principal:** mobile, com infraestrutura para ambientes.

### Tarefas

- [ ] P01.01 — Validar versão do SDK Expo e compatibilidade dos módulos necessários. Fixar versão do Node, gerenciador e lockfile; registrar a combinação usada, sem depender de `latest` em CI.
- [x] P01.02 — Inicializar o projeto dentro de `mobile/` preservando `docs/` e o README. Se o gerador exigir pasta vazia, gerar em diretório temporário e incorporar apenas os arquivos necessários após revisão.
- [x] P01.03 — Configurar TypeScript estrito e imports internos. Separar rotas, features, serviços, armazenamento e tema; rotas apenas compõem telas, sem concentrar regras de domínio.
- [ ] P01.04 — Definir identificadores Android/iOS, nome exibido, esquemas de URL e ambientes desenvolvimento, homologação e produção. Os identificadores finais dependem das contas da organização.
- [x] P01.05 — Criar configuração pública validada na inicialização: URL absoluta da API e identificação do ambiente. Segredos de assinatura, credenciais de push e chaves privadas ficam fora do bundle.
- [ ] P01.06 — Configurar builds de desenvolvimento nativos, não limitar a validação ao Expo Go. Definir se os builds serão locais, EAS ou combinação; registrar custos e acesso antes de contratar serviços.
- [ ] P01.07 — Configurar lint, typecheck, testes e scripts mobile independentes. Não alterar pipelines web sem necessidade; não instalar dependências no frontend para satisfazer o mobile.
- [ ] P01.08 — Aplicar ícone/splash derivados da marca existente, com arquivos próprios para tamanhos e safe zones. Não usar mockup como ícone final.
- [ ] P01.09 — Incluir tela diagnóstica de desenvolvimento com ambiente e versão, sem tokens, informações de tenant ou payloads sensíveis. Não disponibilizar ferramentas de debug na versão de produção.
- [ ] P01.10 — Documentar como instalar, executar em aparelho físico, obter build e resolver conexão local. Emulador e aparelho físico têm endereçamento diferente.

### Contratos e decisões

O app acessará `/api/v1/` diretamente por HTTPS. Não depende do proxy Next.js, `window`, DOM ou cookies do navegador. Workspaces não são obrigatórios para manter três projetos no mesmo repositório. Se forem adotados, documentar por que resolvem uma necessidade concreta e testar resolução de dependências sem duplicar React.

### Critérios de aceite e testes

- Build de desenvolvimento instala e abre nos dois sistemas definidos para suporte; produção não consegue apontar acidentalmente para homologação por estado persistido da interface.
- Checkout limpo reproduz instalação e typecheck usando o lockfile, sem arquivos locais não documentados.
- Falta de configuração gera erro explícito antes de enviar credenciais.
- Verificar em aparelho físico conexão com homologação e comportamento sem rede; nenhum certificado inseguro ou bypass TLS chega à produção.

### Divisão sugerida de PRs

P01-A: scaffold/configuração; P01-B: builds e branding; P01-C: CI mínimo e instruções. Não incluir telas de domínio nesta parte.

## Parte 02 — Contratos da API e camada de dados

**Resultado demonstrável:** um cliente nativo testável que consulta contratos reais e normaliza falhas. **Dependências:** P00 e P01. **Responsáveis:** mobile e backend.

### Inventário inicial a confirmar

Rotas relativas ao prefixo `/api/v1/`, confirmado em `backend/config/urls.py`. Listagem abaixo não garante cobertura completa nem comportamento de idempotência.

| Área | Evidência atual | Uso previsto | Verificações pendentes |
| --- | --- | --- | --- |
| Sessão | `backend/apps/accounts/urls.py`: login, me, refresh, logout e troca obrigatória de senha | Sessão nativa | Payloads, revogação, rotação, rate limit e estados especiais |
| Organização | `/organizations/me/`, contrato de idioma em `docs/ai/api.md` | Idioma e contexto | Envelope, campos mínimos, permissões para alteração |
| Fazendas | `/farms/`, uso em `financeService.ts` | Seleção autorizada | Filtros por usuário e paginação; não derivar acesso de exemplo gerencial |
| Agenda | `organizationAgendaService.ts` | Consulta e ações de tarefa | Filtros, fuso, paginação e destino de cada tipo de evento |
| Leite | `milkProductionService.ts` | Vacas, resumo, individual e total | Precisão, duplicidade, dias bloqueados, conflitos e consistência do resumo |
| Trato | `cattleDailyFeedingService.ts` | Consulta e fornecimento | `request_key` já aparece no cliente; provar deduplicação, escopo e atomicidade no backend |
| Tanques | `milkTankService.ts` | Consulta; movimentos em expansão | Campos dinâmicos não provam chave de requisição; verificar saldo, cancelamento e financeiro |
| Notificações | `notificationService.ts`, `backend/apps/notifications/urls.py` | Inbox e preferências | Paginação, consentimento, reconhecimento e canais |
| Web push | `pushNotificationService.ts` | Referência de regra, não transporte nativo | Existe implementação com service worker/VAPID; confirmar lacunas para APNs/FCM |
| Clínica | `clinicalService.ts` | Registros, vacinas e alertas permitidos | Tipos incompletos no cliente, regras de estoque e anexos |
| Suínos | `livestockService.ts` | Fases produtivas e reprodução | Relações entre fases, transações e regras de datas |
| Plantações | `cropService.ts` | Consulta e operações selecionadas | Capacidades, unidade, ciclo e efeitos em estoque/financeiro |
| Financeiro | `financeService.ts` | Consulta gerencial e futuras ações | Projeção, liquidação, estorno, precisão e autorização |
| Suporte | `ticketService.ts` | Abertura, resposta e anexo | Chaves/versionamento específicos; contrato de upload nativo |

### Tarefas mobile

- [ ] P02.01 — Criar transporte com base URL, timeouts por classe de operação, cancelamento e cabeçalhos comuns; tokens devem vir do módulo de sessão, não de leitura espalhada por tela.
- [ ] P02.02 — Normalizar erros de campo, de negócio, autenticação, autorização, rede, timeout e indisponibilidade. Preservar código estável e mensagem traduzida do servidor; não exibir stack ou payload bruto.
- [ ] P02.03 — Definir política de retries: consultas podem ter tentativas limitadas; mutações não podem ser repetidas automaticamente sem garantia específica. Diferenciar timeout de recusa confirmada.
- [ ] P02.04 — Modelar DTOs de rede e modelos de apresentação separados apenas quando necessário. Substituir `any` herdado por tipos do recorte; não reescrever todos os serviços web.
- [ ] P02.05 — Definir query keys com organização, usuário/contexto de acesso, fazenda, recurso e filtros. Cancelar consultas ao mudar sessão; impedir resposta atrasada de popular o contexto seguinte.
- [ ] P02.06 — Adaptar paginação sem baixar todas as páginas para montar um seletor. Usar busca remota e seleção por ID; manter rótulo do item escolhido mesmo fora da página atual.
- [ ] P02.07 — Manter valores decimais como representação exata exigida pelo contrato, evitando cálculo de dinheiro em ponto flutuante. Separar parsing localizado da serialização da API.
- [ ] P02.08 — Definir tratamento de data sem horário, instante UTC e fuso da organização. A agenda não pode mudar de dia por conversão automática indevida.
- [ ] P02.09 — Resolver mídia para URL absoluta do ambiente. Arquivos protegidos não devem virar URLs públicas nem ter token em query string; auditar o mecanismo atual antes de adaptar.
- [ ] P02.10 — Manter fixtures sintéticas de respostas/erros representativos e testes de contrato dos campos usados. Tipagem gerada por schema é opção a validar, não garantia de validação em runtime.

### Tarefas backend condicionadas às lacunas

- [ ] P02.B01 — Corrigir schema/documentação das operações escolhidas quando divergirem da implementação, mantendo compatibilidade com o frontend.
- [ ] P02.B02 — Adicionar filtro ou endpoint de busca somente se os existentes não atenderem ao fluxo autorizado; preservar tenant e capacidade no selector.
- [ ] P02.B03 — Se houver campos financeiros retornados a perfis operacionais, restringir a resposta no servidor; filtro de payload no frontend não é fronteira de segurança.
- [ ] P02.B04 — Documentar códigos de erro e política de concorrência do recurso. Não introduzir um envelope novo em toda a API por conveniência do cliente.
- [ ] P02.B05 — Criar índice ou ajuste de consulta apenas após evidência de lentidão no fluxo. Mudanças de modelo requerem migração e testes do filtro por tenant.

### Modelo obrigatório de ficha de contrato

Para cada operação: ID; arquivo/rota/view; método; versão; perfis/capacidades; escopo de tenant/fazenda; parâmetros; campos obrigatórios/opcionais; precisão/unidades; retorno; erros; paginação; efeitos colaterais; atomicidade; auditoria; limite de arquivo; política de retry; idempotência; concorrência; dados cacheáveis; teste que prova cada garantia; responsável e estado da verificação.

### Critérios de aceite e testes

Uma consulta real e uma mutação do recorte funcionam via cliente nativo em homologação. Os testes cobrem cancelamento, erro traduzido, paginação, resposta atrasada após logout e tentativa de acessar ID de outra organização. Lacunas identificadas permanecem explicitamente bloqueadas, não são preenchidas com comportamento presumido.

## Parte 03 — Autenticação, sessão, organização e permissões

**Resultado demonstrável:** usuário entra, permanece autenticado com segurança e vê apenas seu trabalho. **Dependências:** P01 e contratos de sessão P02. **Responsáveis:** mobile/backend.

### Estados e fluxo

```text
inicializando -> sem sessão -> autenticando -> carregando contexto -> autenticado
                          -> falha
sessão existente -> validando/renovando -> autenticado ou reautenticação
qualquer sessão -> revogada/expirada -> bloquear escritas -> encerrar contexto
```

Inicialização não deve mostrar conteúdo de usuário anterior enquanto valida a sessão. Sem rede, o acesso ao cache depende de política explícita de validade e reautenticação; não permitir uso offline ilimitado de uma autorização antiga.

### Tarefas

- [x] P03.01 — Login com validação, teclado adequado, exibição opcional de senha e bloqueio de envio concorrente. Tratar credencial inválida sem revelar existência de conta.
- [ ] P03.02 — Persistir credenciais mínimas no SecureStore; manter acesso aos tokens centralizado. Definir política após reinstalação, restauração e falha de armazenamento.
- [ ] P03.03 — Implementar refresh com execução única: requisições concorrentes aguardam a mesma renovação. Respeitar a rotação efetiva do servidor e não entrar em loop de 401.
- [x] P03.04 — Consultar `/auth/me/`, organização e capacidades antes de montar áreas protegidas. Não armazenar senha para facilitar nova entrada.
- [x] P03.05 — Tratar troca obrigatória de senha e recuperação com os contratos existentes; não adicionar login Google nativo sem validar OAuth e configuração próprios.
- [ ] P03.06 — Selecionar fazenda entre as autorizadas; validar seleção persistida quando permissões ou lista mudarem. “Todas” só existe quando o endpoint suporta e o perfil permite.
- [ ] P03.07 — Criar política única de acesso por feature/ação; usar capacidades, espécies, perfil e `read_only`. O backend mantém a decisão final.
- [ ] P03.08 — Atualizar o contexto no retorno ao primeiro plano com frequência controlada; invalidar telas e consultas quando acesso mudar. Uma tela aberta não garante permissão para enviar depois.
- [ ] P03.09 — Logout: encerrar sessão no servidor quando possível, revogar vínculo push, cancelar requisições, remover credenciais e tornar cache inacessível. Explicar destino dos rascunhos antes de perder acesso a eles.
- [ ] P03.10 — Troca de conta exige isolamento completo. Não adotar suporte impersonado do cliente web no piloto mobile sem requisito e desenho específico.
- [ ] P03.11 — Aplicar idioma da organização após login; apenas admin autorizado altera esse idioma compartilhado. Preferências individuais não o sobrescrevem.
- [ ] P03.12 — Definir expiração de desbloqueio local e biometria opcional em conjunto com a Parte 14; não exibir dados protegidos atrás de uma tela de login apenas visual.

### Matriz inicial de acesso

| Perfil/condição | Proposta de comportamento | Conferência obrigatória |
| --- | --- | --- |
| Admin/manager | Rotinas e indicadores segundo capacidades efetivas | Não assumir igualdade de permissões entre esses dois perfis |
| Operator | Domínios e espécies autorizados; sem atalhos financeiros indevidos | Restrições de ações internas, não só do módulo |
| Feeder | Trato permitido e áreas pessoais autorizadas | Não herdar Início/Agenda/Rebanho do mockup automaticamente |
| Somente leitura | Consultas permitidas, sem envio de mutações | Inclui retomada de rascunho e eventual fila |
| Escopo revogado | Remover acesso e invalidar dados conforme política | Tela aberta, deep link e registro offline antigo |

### Critérios de aceite e testes

Testar login válido/inválido, dois refresh simultâneos, token revogado, encerramento durante bootstrap, mudança de usuário, troca de fazenda, idioma e somente leitura. Testar tentativas diretas de abrir rota e enviar operação de outro tenant. Nenhum token aparece em log, relatório de erro ou evento analítico.

## Parte 04 — Design system, navegação e internacionalização

**Resultado demonstrável:** estrutura navegável pronta para receber módulos, com componentes móveis consistentes. **Dependências:** P01, P03 e [guia de design mobile](../../DESIGN.md). **Responsáveis:** design/mobile.

A Agenda atualizada é a base conceitual de estilos e interação: contexto, dados legíveis e caminhos claros para as operações. A composição deve ser simples, intuitiva e funcional, adaptada a cada domínio. O mockup anterior não fixa a navegação nem comprova que os requisitos de acessibilidade ou os fluxos já estejam implementados.

### Tarefas de navegação

- [ ] P04.01 — Consolidar a navegação compartilhada do `WorkspaceShell` e a criação contextual; preservar histórico e comportamento de voltar. Compor os destinos conforme as capacidades do perfil, sem impor a navegação fixa do mockup anterior.
- [ ] P04.02 — Definir árvore de rotas protegidas, modais e formulários. IDs em rotas são referências, não autorização nem espaço para payload pessoal.
- [ ] P04.03 — Implementar seletor de fazenda compartilhado e contexto visível no formulário. Ao mudar contexto, tratar alterações não salvas.
- [ ] P04.04 — Criar resolvedor de destinos internos por tipo de recurso. Rota desconhecida ou não implementada oferece mensagem e alternativa web segura quando aplicável.
- [ ] P04.05 — Definir formulário em tela inteira e folha apenas para escolhas curtas. Tratar teclado, safe area, rotação e retorno sem perder entrada.

### Componentes mínimos

AppShell; ScreenHeader; FarmSelector; ConnectionStatus; Button/LoadingButton; TextField; DecimalField; DateField; SearchField; RemoteSelect; QuantityWithUnit; SectionCard; SummaryCard; EntityRow; StatusBadge; EmptyState; ErrorState; PermissionState; ReadOnlyNotice; ConfirmAction; UnsavedChanges; DraftStatus; FeedbackMessage.

Cada componente precisa de contrato de props, estados desabilitado/carregando/erro, rótulo acessível e exemplo real do recorte. Não criar catálogo extensivo de componentes sem consumidor.

### Tarefas de tema e idioma

- [ ] P04.06 — Derivar tokens de cor, tipografia, borda e espaçamento da identidade existente; adaptar o ritmo compacto para unidades nativas. Não reutilizar CSS ou reduzir fonte global para simular 75%.
- [ ] P04.07 — Estabelecer texto base legível, alvos de toque ≥44 unidades lógicas e áreas seguras. Avaliar contraste e foco; não depender apenas de cor.
- [ ] P04.08 — Reutilizar chaves e terminologia dos quatro idiomas após auditar módulos puros. Extrair pacote compartilhado somente se necessário, com PR próprio e teste de regressão web.
- [ ] P04.09 — Traduzir validação, permissões do aparelho, estados offline, acessibilidade, notificações e mensagens de atualização. Textos de usuário não são traduzidos automaticamente.
- [ ] P04.10 — Definir parsing de decimal e formatação de moeda/unidade/data por contrato. Cobrir vírgula, ponto, zero, vazio, precisão e valores inválidos.
- [ ] P04.11 — Preparar preview de componentes e fluxos para revisão em aparelhos; imagens conceituais são referência, não critério suficiente de implementação.

### Incremento atual — consolidar a referência da Agenda

- [ ] P04.12 — Conferir a área interativa de navegação temporal, abas e chips da Agenda; manter pelo menos 44 × 44 unidades lógicas sem sobrepor alvos. O tamanho visual atual de um controle não define o mínimo de toque.

**Implementação P04.12 (13/11/2026):** navegação temporal, abas e chips usam mínimo de 44 unidades; células preservam largura/altura mínima de 44. A grade permite rolagem horizontal em larguras reduzidas, e o cabeçalho permite quebra de linha. Não há expansão de `hitSlop` sobre controles vizinhos. Validação visual em larguras pequenas/grandes, fonte ampliada e aparelhos Android/iOS ainda necessária para aceite.

- [ ] P04.13 — Aplicar a hierarquia contexto → dados → próxima ação às jornadas já existentes, uma por incremento. Reutilizar shell e componentes com consumidores reais; não exigir calendário, métricas ou o mesmo card em todos os domínios.
**P04.13 — primeiro recorte aplicado (13/11/2026):** produção de leite organizada em fazenda/data → resumo → lançamentos/operações. Ajuste de data e busca abrem sob demanda, preservando rascunho e filtro aplicado. Produção, descarte e aproveitável têm destaque; contagens e média ficam em expansão opcional. Ações de ordenha/correção permanecem no registro correspondente; atualização/tanques são acessos secundários. A tela reconfere opções ao receber foco, apresenta somente leitura conforme sessão/API e desabilita escrita em listas desatualizadas/em atualização. Totais por período continuam somente leitura e não se infere contagem individual. Validação: 11 testes de leite, TypeScript, ESLint e exportação web aprovados. Prévia web real com API sintética conferida em 320 e 768 px: sem overflow horizontal; expansão, data inválida preservada, vazio, erro e somente leitura verificados, sem exceções de execução. Android/iOS, fonte ampliada, teclado nativo e retomada permanecem pendentes. Este é um recorte de P04.13, não a conclusão de todas as jornadas.

**P04.13 — tanques de leite (13/11/2026):** lista apresenta fazenda/filtros, contagem do filtro e cartões com saldo/capacidade, seguidos do acesso à ficha. Cadastro exige fazenda selecionada e consulta disponível; somente leitura é identificado conforme o perfil. Ficha prioriza identidade/fazenda e armazenamento, depois movimentos, qualidade e edição autorizada; observações abrem sob demanda. Textos foram alinhados às operações já existentes no app, sem anunciar disponibilidade exclusiva no web. Retorno usa apenas o cabeçalho compartilhado, com destino de fallback específico para produção/lista. Nenhuma regra de saldo, autorização ou mutação foi alterada. Validação: 27 testes direcionados de tanques/formulários/movimentos/qualidade, TypeScript, ESLint e exportação web aprovados. Prévia web com dados sintéticos: lista e ficha em 320/768 px sem overflow horizontal; abertura, retorno, expansão de observações, vazio e erro sem falso vazio conferidos, sem exceções de execução. Homologação Android/iOS, fonte ampliada e retomada permanece pendente. Movimentos/qualidade ainda podem receber seu próprio refinamento de apresentação.

- [ ] P04.14 — Homologar a jornada revisada em Android/iOS, incluindo uma largura pequena e uma maior, fonte ampliada, teclado, retorno e retomada. Registrar o que foi validado e o que depende de outro aparelho/build, em conjunto com P17.
- [ ] P04.15 — Revisar os textos e estados do recorte nos quatro idiomas, inclusive Mês/Semana/Lista, contagens, seleções, estados vazios e rótulos acessíveis. Não elevar textos ou limitações atuais da Agenda a regra do design.

O incremento consolida o app existente. A imagem anterior fica como registro ilustrativo; acabamento isolado não fecha navegação, autorização ou operação.

### Critérios de aceite e testes

Navegar com leitor de tela, fonte ampliada, teclado aberto e botão voltar sem controles sobrepostos. Os quatro idiomas não apresentam chaves cruas ou botões truncados. Cancelar uma folha retorna ao contexto anterior; rota proibida não renderiza dados. Revisar os fluxos principais em largura pequena e aparelho maior, sem impor alturas fixas que cortem conteúdo.

### Divisão sugerida de PRs

P04-A: tokens/componentes usados pelo login; P04-B: tabs/contexto/retorno; P04-C: resolvedor de rotas; P04-D: idiomas e acessibilidade. O design system cresce com os fluxos seguintes.
