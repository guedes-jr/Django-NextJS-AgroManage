# Inventário de telas e plano de implementação mobile

Levantamento local em **7 de novembro de 2026**. Fonte de verdade: rotas `frontend/src/app/**/page.tsx`, entradas `mobile/app/`, telas em `mobile/src/features/`, contratos e serviços citados abaixo. Este é o inventário de cobertura de telas; o [plano principal](IMPLEMENTACAO.md) e suas partes continuam sendo a referência técnica de execução. Não substitui auditoria de cada endpoint antes da integração.

## Incremento iniciado em 7 de novembro de 2026

A Fase 1 já possui seu recorte funcional: Agenda com consulta/detalhe/criação/edição/situação, navegação protegida, perfil mínimo, busca de entidades, contexto de fazenda, fuso organizacional em “Hoje” e prioridades da Home independentes do financeiro. Consulte [entregas, limites e validação](partes/05-08-PRIMEIRO-APP.md#complemento-funcional-da-fase-1--7-de-novembro-de-2026). Homologação com dados reais e em Android/iOS continua pendente. Edição completa de perfil, responsáveis e lembretes permanecem no web; módulos de domínio não foram antecipados. O inventário abaixo preserva a linha de base do levantamento: os itens implementados devem ser avaliados com esta atualização, e não contados novamente como ausentes.

## Início da Fase 2 — consulta do rebanho

Implementados primeiro recorte de animais/lotes de corte e leite, busca/filtros/paginação, ficha operacional e histórico de animal sob demanda. B01 e B04 permanecem parciais; B02 tem sua consulta nativa. B03 agora possui cadastro/edição essencial de animal e B05 registro de pesagem de animal/lote. L01 (leite online), cadastro/movimentação de lotes e campos avançados continuam pendentes. [Evidências e limites](partes/05-08-PRIMEIRO-APP.md#primeiro-recorte-de-consulta-bovina--7-de-novembro-de-2026). A linha de base abaixo não deve ser interpretada como ausência dessas consultas já entregues.

## 1. O que existe hoje

| Área | Situação real | Pendência |
| --- | --- | --- |
| Inicialização e sessão | Loading, restauração, indisponibilidade, nova tentativa e logout implementados | Homologação nativa Android/iOS, retomada e expiração em aparelho |
| Login por e-mail | Formulário e integração implementados; manter conectado disponível | Homologação ponta a ponta e acessibilidade nativa |
| Cadastro | Formulário integrado, alternância com login e mensagens por campo | Homologar criação real e retorno ao login em ambos os SOs |
| Recuperação de senha | Solicitação por e-mail implementada | Validar conclusão do fluxo oferecido pelo servidor; não presumir reset nativo por token |
| Troca obrigatória de senha | Formulário integrado implementado | Homologar conta com troca obrigatória |
| Google | Componentes e integração previstos no código, com alternativa web/nativa | Configuração pública por ambiente e prova em development builds Android/iOS; não considerar pronto apenas porque o botão aparece |
| Home | Resumo mensal remoto para perfis financeiros, atalhos por acesso, diretório, seleção de período e refresh | Tarefas operacionais completas, busca de entidades, navegação real e dados independentes por bloco |
| Menu, Agenda, Financeiro e demais destinos | Diretório/painéis de transição abrem o sistema web | **Não são módulos nativos implementados**; substituir progressivamente por rotas Expo Router |
| Termos e Privacidade | Links abrem as páginas públicas no navegador | Manter conteúdo único e fallback de abertura; leitura nativa é opcional, não bloqueia o piloto |

Evidências: `mobile/app/index.tsx`, `src/features/auth/SessionScreen.tsx`, `LoginScreen.tsx`, `RegistrationForm.tsx`, `LegalFooter.tsx`, `src/features/home/HomeScreen.tsx`, `contracts.ts` e `src/services/authApi.ts` (caminhos relativos a `mobile/`). Atualmente há uma entrada de tela em `app/index.tsx`; alternância interna de formulário/painel não equivale a pilhas de navegação operacionais.

## 2. Escopo e critérios de contagem

- Uma rota web pode conter abas, detalhes e formulários em modais. A tabela de backlog inclui esses fluxos: contar apenas arquivos `page.tsx` subestimaria o trabalho.
- Corte e leite usam componentes compartilhados, mas devem manter entradas, contexto e regras distintos. Reutilização de componentes não dispensa homologação de cada produção.
- Rotas antigas de bovinos e aliases não exigem telas duplicadas. Resolver links antigos para o destino canônico autorizado.
- `/platform` permanece excluído. Marketing, páginas SEO, blog, demonstração, calculadora pública e portal de afiliados não são requisitos do aplicativo operacional; manter acesso web quando necessário.
- Aves possui rotas e componentes web, mas permanece fora da primeira entrega mobile enquanto não houver confirmação de disponibilidade comercial e operacional. Registrar como condicional, sem anunciá-lo como pronto.
- Cada item abaixo está pendente, salvo o recorte explicitamente identificado na seção 1. Fase é ordem de entrega, não prazo ou promessa de conclusão.

## 3. Backlog de telas e fluxos

Em cada linha, entregar consulta antes de escrita quando houver risco de estoque, financeiro ou transição de estado. “Cadastro/edição” exige levantamento dos campos e ações realmente permitidos no contrato; não cria automaticamente exclusão ou novas permissões.

| ID | Telas/fluxos pendentes | Conteúdo e ações | Dependências / parte |
| --- | --- | --- | --- |
| N01 | Navegação autenticada | Pilhas e abas; Módulos; Novo registro contextual; voltar preservando filtros; destino indisponível e deep link autorizado | Fase 1 · P03–P04 |
| N02 | Contexto e acesso | Seleção de fazenda quando aplicável ao contrato; identificação da organização; acesso negado e somente leitura | Fase 1 · P03–P04 |
| N03 | Busca global | Resultados por animal, lote, plantação, item e estrutura; paginação por domínio; busca de módulos atual não atende este fluxo | Fase 1/expansão por domínio · P05/P06 |
| H01 | Home operacional | Prioridades/tarefas e detalhes; atalhos reais; estados por bloco; manter resumo financeiro já existente sem expor valores a outros perfis | Fase 1 · P05 |
| A01 | Agenda | Dia/semana, filtros, eventos estimados, lista paginada e abertura da origem | Fase 1 · P05 |
| A02 | Tarefa: detalhe, criar e editar | Data, prioridade, responsável e estado conforme contrato; conclusão/cancelamento apenas quando permitido | Fase 1 · P05 |
| B01 | Hub de corte / hub leiteiro | Visão por produção e acesso às rotinas; indicadores remotos sem calcular por página parcial | Fase 2 · P06/P07 |
| B02 | Rebanho: lista e ficha | Busca, filtros, histórico, situação e ações autorizadas; separar corte/leite | Fase 2 · P06 |
| B03 | Animal: cadastro e edição | Identificação, sexo, raça, datas e vínculos exigidos; ficha técnica como detalhe nativo | Fase 2 · P06 |
| B04 | Lotes: lista, detalhe, formulário e movimentação | Composição, origem/destino e histórico; confirmar efeitos e concorrência | Fase 2/4 · P06 |
| B05 | Pesagens | Lista, evolução, registro e edição autorizada; unidade e data | Fase 2 · P06 |
| B06 | Manejos e operações | Listas, detalhe, formulários de eventos e ações coletivas existentes; decompor abas de operações após auditar contrato | Fase 4 · P06/P10 |
| B07 | Sanidade | Histórico e lançamento vinculado; compartilhar componentes com clínica sem duplicar evento | Fase 4 · P10 |
| B08 | Reprodução | Painel, grupos/estados, detalhe e registro de eventos suportados; datas e previsões do servidor | Fase 4 · P06/P07 |
| B09 | Pastos e ocupações | Lista/ficha/cadastro de pasto; ocupação e saída/transferência conforme contrato | Fase 4 · P06 |
| B10 | Vendas e baixas | Consulta/detalhe; criação, revisão e confirmação online com efeitos de rebanho e financeiro | Fase 5 · P06/P13 |
| B11 | Relatórios do segmento | Filtros, resumo e detalhe de corte/leite, exportação nativa autorizada | Fase 5 · P13 |
| L01 | Produção de leite | Resumo diário; lista; lançamento individual ou total; sessões, descarte e edição conforme contrato | Fase 2 · P07 |
| L02 | Tanque de leite | Painel/lista/detalhe e registros previstos em milkTankService; não inferir campos ou ações da rota | Fase 4 · P07 |
| R01 | Ração: visão e fórmulas | Lista, detalhe e cadastro/edição de fórmula; ingredientes e unidades por espécie | Fase 3 · P09 |
| R02 | Produção de ração | Histórico, detalhe e formulário com revisão do consumo de insumos e produção resultante | Fase 3 · P09 |
| R03 | Tratos diários | Lista/planejamento permitido, registro e histórico; fluxo restrito do feeder e confirmação remota | Fase 3 · P09 |
| E01 | Estoque: resumo e alertas | Indicadores, itens abaixo do mínimo, filtros e abertura do item | Fase 3 · P09 |
| E02 | Produtos: lista, detalhe, cadastro e edição | Saldo, unidade, histórico e dados autorizados do produto | Fase 3 · P09 |
| E03 | Movimentações e ajustes | Listagem/detalhe; entrada, saída e ajustes somente se disponíveis e autorizados; justificativa e revisão | Fase 3 · P09 |
| E04 | Fornecedores | Lista, detalhe e cadastro/edição conforme API | Fase 3 · P09 |
| C01 | Clínica: painel e histórico | Eventos por animal/lote, filtros, detalhe e vínculo operacional | Fase 4 · P10 |
| C02 | Consultas, exames, vacinação e medicamentos | Listagem, detalhe e formulários por categoria; anexos e consumo de estoque quando aplicável | Fase 4 · P10/P14 |
| S01 | Suínos: hub, inventário e fichas | Lista por fase; animal/lote; ficha técnica; cadastro/edição e histórico | Fase 4 · P11 |
| S02 | Suínos: reprodução e transições | Detalhe e lançamentos de eventos; origem/destino, quantidade, datas e previsões; transações confirmadas no servidor | Fase 4 · P11 |
| S03 | Suínos: vendas e mão de obra | Listas, detalhes e formulários específicos, com efeitos e permissões auditados | Fase 5 · P11/P13 |
| S04 | Suínos: ração e fórmulas | Reaproveitar R01/R02 apenas nos contratos suportados pela espécie | Fase 4 · P09/P11 |
| P01 | Plantações: lista e detalhe | Fazenda/área/ciclo real; situação, indicadores e atividades autorizadas | Fase 4 · P12 |
| P02 | Plantação: cadastro e edição | Campos do ciclo e vínculos previstos no serviço; validação de área/unidades | Fase 4 · P12 |
| P03 | Preparo, sementes e adubação | Histórico/detalhe/formulário por atividade; revisão de insumos e data | Fase 4 · P12 |
| P04 | Defensivos, irrigação e fertirrigação | Histórico/detalhe/formulário; dose versus quantidade total, unidades e impactos | Fase 4 · P12 |
| P05 | Agrônomo, estrutura e mão de obra | Listas/vínculos/detalhes/formulários equivalentes, conforme acesso e contratos | Fase 5 · P12 |
| P06 | Colheita e histórico | Registro e consulta autorizados, produção e custos; filtros e rastreabilidade | Fase 5 · P12 |
| T01 | Estruturas: diretório e lista | Propriedade, curral, chiqueiro, galinheiro, armazém, instalação, reservatório, cerca, irrigação, máquinas e outros | Fase 5 · P13 |
| T02 | Estrutura: ficha, cadastro e edição por tipo | Formulários específicos, vínculos e ações efetivamente disponíveis em farmStructureService/farmAssetService | Fase 5 · P13 |
| F01 | Financeiro: painel e projeção | Resumo, período, projeção do servidor e filtros; não considerar os KPIs da Home como módulo completo | Fase 5 · P13 |
| F02 | Financeiro: títulos e lançamentos | Listas a pagar/receber conforme abas reais; detalhe, histórico, criação/edição autorizada | Fase 5 · P13 |
| F03 | Financeiro: liquidação, estorno e configurações | Ações online separadas; confirmar valores e efeitos; parametrizações apenas existentes | Fase 5 · P13 |
| Q01 | Central de relatórios | Rebanho, plantações, estoque e financeiro; filtros, resultados e arquivo compartilhável | Fase 5 · P13/P14 |
| U01 | Perfil e segurança pessoal | Consultar/editar campos permitidos, foto se suportada, trocar senha, informações da sessão e logout | Fase 1/5 · P13 |
| U02 | Notificações e alertas | Inbox/lista, detalhe, leitura e abertura da origem; alertas operacionais separados de mensagens | Fase 3 · P15 |
| U03 | Preferências de notificações | Canais disponíveis e preferências do servidor; permissão push do aparelho em fluxo separado | Fase 3/6 · P15 |
| U04 | Suporte e chamados | Central, lista, criação, detalhe/conversa, respostas e anexos; preservar chaves/versão do contrato | Fase 5 · P13/P14 |
| U05 | Usuários e convites | Lista/detalhe, criar/editar, papéis e escopo; aceitar convite por link autorizado; ações somente a gestores habilitados | Fase 5 · P03/P13 |
| U06 | Configurações da organização | Dados, contatos/endereços, membros, assinatura, segurança e preferências; idioma organizacional restrito; verificar ações web disponíveis | Fase 5 · P13 |
| I01 | Assistente IA | Conversa, histórico quando suportado, contexto explícito, limites, cancelamento e falha online | Fase 5 · P13 |
| O01 | Downloads, rascunhos e sincronização | Consulta autorizada salva, data de atualização, rascunhos, pendências, conflitos e resultado desconhecido; nenhuma fila de escrita genérica | Fase 6 · P08/P16 |
| O02 | Captura e anexos | Câmera/galeria/arquivo; prévia, envio, falha e permissão negada; scanner/localização só com caso de uso validado | Fase 6 · P14 |
| O03 | Sobre e ajuda de acesso | Versão, informações do app, Termos/Privacidade e links seguros; biometria opcional com alternativa | Fase 6 · P14/P17 |
| V01 | Aves: cadastro, reprodução, ração e fórmulas | Condicional: auditar maturidade e oferta antes de desenhar/copiar o fluxo web; não entra no piloto | Fora do piloto |

## 4. Sequência executável por entregas

### Fase 1 — App navegável e rotina diária (N01–N03, H01, A01–A02, U01 inicial)

1. Criar grupos autenticados e pilhas Expo Router preservando restauração, senha obrigatória e logout. Resolver contexto/autorização antes de carregar dados.
2. Substituir os painéis de transição por destinos nativos entregues; manter “Abrir no web” identificado para os ainda pendentes. Não transportar tokens em URLs.
3. Entregar Agenda de consulta, detalhe e vínculo operacional; depois escrita de tarefas comprovadamente editáveis.
4. Integrar prioridades da Home sem bloquear atalhos por falha de um indicador. Busca de entidades entra junto dos respectivos contratos, sem prometer busca global completa antecipadamente.
5. Entregar perfil mínimo e validar voltar, retomada, links internos e sessão expirada.

**Aceite:** entrar → consultar agenda → abrir tarefa → voltar ao mesmo dia/filtro; usuário sem acesso não consulta a origem. Login/cadastro não devem ser refeitos para começar esta fase.

### Fase 2 — Primeiro fluxo bovino/leiteiro (B01–B05, L01)

1. Lista paginada e ficha do rebanho por produção; depois cadastro/edição e pesagens.
2. Consulta de lotes e contexto do animal, com seleção reaproveitada nas rotinas.
3. Resumo de leite e lançamento online individual/total; edição e descarte conforme contrato.
4. Validar efeitos cruzados na web e concorrência, sem repetir escrita automaticamente após timeout.

**Aceite:** localizar animal → registrar produção permitida → consultar confirmação no app e web; cobrir leite total/individual sem dupla contagem. Corte não recebe ações leiteiras indevidas.

### Fase 3 — Trato, estoque e comunicação (R01–R03, E01–E04, U02–U03)

1. Consulta de produtos/saldos/alertas/fornecedores.
2. Fórmulas e produção de ração; depois entradas/saídas/ajustes com efeitos auditados.
3. Tratos com fluxo próprio do feeder, sem conceder Agenda ou financeiro por conveniência.
4. Inbox/alertas e preferências; push somente após registro de dispositivo e deep links homologados.

**Aceite:** insumo e unidade corretos, estoque consistente após confirmação; negação de push não bloqueia notificações internas ou operação.

### Fase 4 — Demais rotinas de campo (B06–B09, L02, C01–C02, S01–S02/S04, P01–P04)

Entregar clínica, reprodução/manejos/pastos, tanque, suínos e atividades agrícolas em incrementos independentes. Em cada domínio: lista → detalhe → primeira escrita → demais ações → histórico. Não reunir todos em um único PR ou condicionar publicação de um módulo à conclusão dos demais.

**Aceite:** associação correta a fazenda/animal/lote/ciclo; transições e consumos atômicos conforme servidor; previsões identificadas como estimativas. Cada módulo só aparece como nativo pronto após seu fluxo real ser homologado.

### Fase 5 — Gestão e paridade operacional (B10–B11, S03, P05–P06, T01–T02, F01–F03, Q01, U01 completo/U04–U06, I01)

Priorizar consulta financeira e relatórios; separar PRs de liquidação/estorno e demais escritas. Implementar estruturas por tipo, suporte com anexos, administração autorizada e IA. Convergir administração de membros presente em Usuários e Configurações em um fluxo móvel, preservando permissões e diferentes pontos de entrada.

**Aceite:** relatório corresponde aos filtros web; valores não são carregados para perfis proibidos; suporte preserva texto em conflito; IA não executa mutações de domínio implicitamente. Assinatura/pagamentos exigem revisão específica do fluxo de distribuição antes de compromisso com checkout nativo.

### Fase 6 — Recursos nativos, persistência e publicação (O01–O03; P08/P14–P17)

Começar por cache autorizado de leitura e rascunhos; versionar persistência e separar organização/usuário. Adicionar captura, compartilhamento, push e biometria conforme consumidores reais. Fila de escrita só por endpoint com idempotência/reconciliação comprovadas, não por botão geral “sincronizar”.

**Aceite:** logout/troca de contexto não expõe dados anteriores; recuperar rascunho sem confundir com registro confirmado; conflito não perde entrada. Validar Android/iOS, permissões negadas e aparelho de entrada. Qualidade nativa é contínua desde a Fase 1, não apenas uma tarefa final.

## 5. Dependências e evidências para cada domínio

| Domínio | Fonte a consultar antes de implementar |
| --- | --- |
| Sessão, capacidades e idioma | `mobile/src/features/auth/`, `frontend/src/services/organizationAccess.ts`, `api.ts`, `organizationInvitations.ts`, `organizationRecoveryService.ts` |
| Agenda e busca | `organizationAgendaService.ts`, `agendaDates.ts`, `navbarSearch.ts` |
| Corte/leite | `cattleService.ts`, `cattleOperationsService.ts`, `cattleNavigation.ts`, `dairyService.ts`, `milkProductionService.ts`, `milkTankService.ts` |
| Trato/ração/estoque | `cattleDailyFeedingService.ts`, `stockAdjustmentService.ts`, componentes das páginas de estoque e ração |
| Suínos/clínica | `livestockService.ts`, `swineLaborService.ts`, `swineProductivityService.ts`, `clinicalService.ts` |
| Agricultura e estruturas | `cropService.ts`, `farmStructureService.ts`, `farmAssetService.ts` |
| Financeiro/relatórios | `financeService.ts`, `lotReportService.ts`, `organizationExportService.ts`; localizar exportação feita no navegador antes de portar |
| Comunicação e gestão | `notificationService.ts`, `operationalAlertService.ts`, `pushNotificationService.ts`, `memberService.ts`, `supportService.ts`, `ticketService.ts`, `aiAssistantService.ts` |

Serviços sem prefixo nessa tabela ficam em `frontend/src/services/`. São referências de contratos, não imports prontos para React Native. Não foram auditados todos os endpoints neste inventário: métodos, campos, paginação e direitos de escrita devem ser confirmados no backend na entrega correspondente. Não presumir que toda ação descrita já tenha endpoint pronto.

## 6. Critério de pronto por tela

- [ ] Destino nativo real, acessível pelo menu/atalho/link apropriado; voltar restaura contexto quando seguro.
- [ ] Contrato, campos obrigatórios, permissões, filtros e efeitos de escrita documentados no incremento.
- [ ] Carregamento, vazio, erro com nova tentativa, sem rede, acesso negado e somente leitura onde aplicáveis.
- [ ] Respostas antigas canceladas/descartadas; paginação; invalidação correta depois de salvar.
- [ ] Organização/fazenda/usuário isolados em transporte, cache, arquivos e rascunhos.
- [ ] Precisão decimal, unidades, datas e fuso preservados; sem somar apenas uma página para produzir totais gerais.
- [ ] pt-BR, pt-PT, en e es; idioma da organização após login; leitor de tela e fontes ampliadas.
- [ ] Densidade compacta sem zoom global; safe areas, teclado, rotação e alvos de toque de ao menos 44 unidades lógicas.
- [ ] Fluxo verificado em Android e iOS; declarar exatamente qualquer cobertura nativa pendente.
- [ ] Teste estreito de comportamento/contrato e comparação com web; anexar evidência antes de marcar concluído.

## 7. Inventário verificável das rotas web

Caminhos relativos a `frontend/src/app/`. Esta lista cobre todas as páginas fora de `/platform` encontradas no levantamento. **Rota não equivale a tela distinta**: aliases, redirecionamentos, páginas públicas e recursos condicionais aparecem classificados. Formulários/modais são cobertos na seção 3.

| Rota web | Destino no plano / tratamento |
| --- | --- |
| `/calculadora` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/contato` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/conteudos/[slug]` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/conteudos` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/controle-de-estoque-rural` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/demo` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/gestao-agricola` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/gestao-multifazendas` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/gestao-pecuaria` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/planos` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/privacidade` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/recursos` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/software-financeiro-rural` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/termos` | Web público; Termos/Privacidade por link (O03), demais fora do app operacional |
| `/aceitar-convite` | U05 · aceitação de convite / deep link |
| `/afiliados/login` | Portal de afiliados fora do escopo mobile inicial; manter web |
| `/afiliados` | Portal de afiliados fora do escopo mobile inicial; manter web |
| `/afiliados/painel/comissoes` | Portal de afiliados fora do escopo mobile inicial; manter web |
| `/afiliados/painel/configuracoes` | Portal de afiliados fora do escopo mobile inicial; manter web |
| `/afiliados/painel/indicacoes` | Portal de afiliados fora do escopo mobile inicial; manter web |
| `/afiliados/painel` | Portal de afiliados fora do escopo mobile inicial; manter web |
| `/afiliados/painel/relatorios` | Portal de afiliados fora do escopo mobile inicial; manter web |
| `/cadastro` | Implementado como alternância no login; homologação pendente |
| `/home/afiliados` | Portal de afiliados fora do escopo mobile inicial; manter web |
| `/home/agenda` | A01–A02 · pendente nativo |
| `/home/assistente-ia` | I01 · pendente nativo |
| `/home/clinico/consultas` | C01–C02 · pendente nativo |
| `/home/clinico/exames` | C01–C02 · pendente nativo |
| `/home/clinico/medicamentos` | C01–C02 · pendente nativo |
| `/home/clinico` | C01–C02 · pendente nativo |
| `/home/clinico/vacinacao` | C01–C02 · pendente nativo |
| `/home/estoque/alertas` | E01–E04 / R01–R02 conforme rotina · pendente nativo |
| `/home/estoque/fornecedores` | E01–E04 / R01–R02 conforme rotina · pendente nativo |
| `/home/estoque/movimentacoes` | E01–E04 / R01–R02 conforme rotina · pendente nativo |
| `/home/estoque/producao-racao/gerenciar-formulas` | E01–E04 / R01–R02 conforme rotina · pendente nativo |
| `/home/estoque/producao-racao` | E01–E04 / R01–R02 conforme rotina · pendente nativo |
| `/home/estoque/produtos` | E01–E04 / R01–R02 conforme rotina · pendente nativo |
| `/home/estoque/resumo` | E01–E04 / R01–R02 conforme rotina · pendente nativo |
| `/home/estrutura/armazem` | T01–T02 · pendente nativo |
| `/home/estrutura/cerca` | T01–T02 · pendente nativo |
| `/home/estrutura/chiqueiro` | T01–T02 · pendente nativo |
| `/home/estrutura/curral` | T01–T02 · pendente nativo |
| `/home/estrutura/galinheiro` | T01–T02 · pendente nativo |
| `/home/estrutura/instalacao` | T01–T02 · pendente nativo |
| `/home/estrutura/irrigacao` | T01–T02 · pendente nativo |
| `/home/estrutura/maquinas` | T01–T02 · pendente nativo |
| `/home/estrutura/outro` | T01–T02 · pendente nativo |
| `/home/estrutura` | T01–T02 · pendente nativo |
| `/home/estrutura/propriedade` | T01–T02 · pendente nativo |
| `/home/estrutura/reservatorio` | T01–T02 · pendente nativo |
| `/home/financeiro` | F01–F03 · pendente nativo |
| `/home/notifications/alertas` | U02–U03 · pendente nativo |
| `/home/notifications` | U02–U03 · pendente nativo |
| `/home/notifications/preferences` | U02–U03 · pendente nativo |
| `/home` | H01 · parcial; resumo e diretório existentes |
| `/home/plantacoes/[id]/adubacao` | P01–P06 · pendente nativo |
| `/home/plantacoes/[id]/agronomo` | P01–P06 · pendente nativo |
| `/home/plantacoes/[id]/colheita` | P01–P06 · pendente nativo |
| `/home/plantacoes/[id]/defensivos` | P01–P06 · pendente nativo |
| `/home/plantacoes/[id]/estrutura` | P01–P06 · pendente nativo |
| `/home/plantacoes/[id]/fertirrigacao` | P01–P06 · pendente nativo |
| `/home/plantacoes/[id]/historico` | P01–P06 · pendente nativo |
| `/home/plantacoes/[id]/irrigacao` | P01–P06 · pendente nativo |
| `/home/plantacoes/[id]/mao-obra` | P01–P06 · pendente nativo |
| `/home/plantacoes/[id]` | P01–P06 · pendente nativo |
| `/home/plantacoes/[id]/preparo-terra` | P01–P06 · pendente nativo |
| `/home/plantacoes/[id]/sementes` | P01–P06 · pendente nativo |
| `/home/plantacoes` | P01–P06 · pendente nativo |
| `/home/profile` | U01 · pendente nativo |
| `/home/relatorios/estoque` | E01–E04 / R01–R02 conforme rotina · pendente nativo |
| `/home/relatorios/financeiro` | Q01 · pendente nativo |
| `/home/relatorios/plantacoes` | P01–P06 · pendente nativo |
| `/home/relatorios/rebanho` | Q01 · pendente nativo |
| `/home/seguimento/aves/cadastro` | V01 · condicional, fora do piloto |
| `/home/seguimento/aves` | V01 · condicional, fora do piloto |
| `/home/seguimento/aves/racao/gerenciar-formulas` | V01 · condicional, fora do piloto |
| `/home/seguimento/aves/racao` | V01 · condicional, fora do piloto |
| `/home/seguimento/aves/reproducao` | V01 · condicional, fora do piloto |
| `/home/seguimento/bovinos/cadastro` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/corte` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/leite` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/lotes` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/manejos` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/operacoes` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/pastos/ocupacoes` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/pastos` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/pecuaria-leiteira/animais` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/pecuaria-leiteira/cadastro` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/pecuaria-leiteira` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/pesagens` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/racao/gerenciar-formulas` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/racao` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/racao/producao` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/racao/tratos` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/relatorios` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/reproducao` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/sanidade` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/bovinos/vendas` | Alias legado bovino → destino canônico; sem tela duplicada (B/L/R) |
| `/home/seguimento/gado-de-corte/cadastro` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/lotes` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/manejos` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/operacoes` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/pastos/ocupacoes` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/pastos` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/pesagens` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/racao/gerenciar-formulas` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/racao` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/racao/producao` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/racao/tratos` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/relatorios` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/reproducao` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/sanidade` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/gado-de-corte/vendas` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/animais` | Alias de animais → cadastro canônico (B02–B03) |
| `/home/seguimento/pecuaria-leiteira/cadastro` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/leite` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/lotes` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/manejos` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/operacoes` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/pastos/ocupacoes` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/pastos` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/pesagens` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/racao/gerenciar-formulas` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/racao` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/racao/producao` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/racao/tratos` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/relatorios` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/reproducao` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/sanidade` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/tanque-de-leite` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/pecuaria-leiteira/vendas` | B01–B11 / L01–L02 / R01–R03 conforme rotina · pendente nativo |
| `/home/seguimento/suinos/animal/[id]` | S01–S04 · pendente nativo |
| `/home/seguimento/suinos/cadastro` | S01–S04 · pendente nativo |
| `/home/seguimento/suinos/mao-de-obra` | S01–S04 · pendente nativo |
| `/home/seguimento/suinos` | S01–S04 · pendente nativo |
| `/home/seguimento/suinos/racao/gerenciar-formulas` | S01–S04 · pendente nativo |
| `/home/seguimento/suinos/racao` | S01–S04 · pendente nativo |
| `/home/seguimento/suinos/reproducao` | S01–S04 · pendente nativo |
| `/home/seguimento/suinos/vendas` | S01–S04 · pendente nativo |
| `/home/settings` | U06 · pendente nativo |
| `/home/suporte/chamados/[id]` | U04 · pendente nativo |
| `/home/suporte/chamados` | U04 · pendente nativo |
| `/home/suporte` | U04 · pendente nativo |
| `/home/usuarios` | U05 · pendente nativo |
| `/login/license` | Conteúdo/aceite legal: reaproveitar documento público e conferir destino (O03) |
| `/login` | Implementado; homologação nativa pendente |
| `/login/terms` | Conteúdo/aceite legal: reaproveitar documento público e conferir destino (O03) |
| `/logout` | Logout já implementado como ação; sem tela duplicada |
| `/relatorios/plantacoes` | Redirecionamento para relatório canônico (Q01) |

**Cobertura do levantamento:** 153 arquivos de página fora de `/platform`, classificados acima; 55 pacotes de telas/fluxos na seção 3. Esses números não representam 153 telas nativas nem um percentual de conclusão. As pastas de rotas foram inventariadas; a leitura de implementação concentrou-se nos pontos de entrada, nos módulos mobile existentes e nos redirecionamentos/abas necessários à classificação.

## 8. Próximo incremento recomendado

O primeiro incremento **N01 + A01 + A02 de consulta** e o complemento funcional da Fase 1 já foram implementados, preservando a autenticação existente. Entrega demonstrável: abrir Agenda nativa, filtrar um dia, abrir o detalhe de uma tarefa e retornar ao mesmo contexto; depois adicionar a primeira escrita autorizada. O levantamento original não implementou telas; o primeiro incremento posterior já entregou a consulta e o detalhe de Agenda descritos no início deste documento. O aceite real/nativo da fase continua pendente.
