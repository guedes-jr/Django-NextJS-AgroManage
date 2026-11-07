# Partes 05 a 08 — Primeiro aplicativo operacional

[Voltar ao plano](../IMPLEMENTACAO.md). Ao concluir estas partes, o objetivo é ter um piloto online de agenda, rebanho e leite, com consulta offline limitada e rascunhos persistentes. Envio automático offline continua condicionado à Parte 16.

## Parte 05 — Início, Agenda e tarefas

**Resultado demonstrável:** descobrir o que fazer e chegar à operação correta sem percorrer o menu web. **Dependências:** P02–P04. **Responsáveis:** mobile e backend nas lacunas de contrato.

### Recorte de Início implementado

Em 6 de novembro de 2026, o pós-login passou a abrir `src/features/home/HomeScreen.tsx`. A referência visual foi adaptada para densidade compacta, com cabeçalho rural, marca Fazenda com plus amarelo, busca de módulos, seleção mensal, indicadores, segmentos, pendências, movimentos e estoque. [Prévia web com dados sintéticos](../screenshots/home-preview-web.png).

- A navegação usa **Início, Agenda, Novo registro, Financeiro e Módulos**, conforme o perfil. “Novo registro” é uma ação identificada, distinta do diretório “Módulos”. Sem badge de notificações fictício.
- A busca atual filtra módulos autorizados; ainda não busca animais, itens ou estruturas. Gado de corte e pecuária leiteira têm destinos distintos e canônicos. O diretório também inclui Assistente IA, Configurações e áreas pessoais, conforme o acesso. Aves em desenvolvimento, plataforma e afiliados não são anunciados como módulos prontos.
- Admin/manager com capacidade financeira consultam `GET reports/dashboard/` com `period=month` e `period_value=AAAA-MM`. A resposta é validada com Zod. Custos dos segmentos e despesas financeiras são separados; saldo é recebimentos menos despesas. Não há comparação percentual presumida.
- Operadores/feeder recebem atalhos autorizados e **não consultam o resumo financeiro**. O feeder só recebe tratos bovinos quando possui a espécie, além das áreas pessoais. Somente leitura remove a ação de novo registro.
- Troca de período, atualização manual e puxar para atualizar recarregam o resumo sem persistir dados. Falhas exibem erro e nova tentativa; não aparecem zeros simulando sucesso. Consultas são canceladas ao desmontar/trocar período; respostas após logout são descartadas. Expiração encerra a sessão.
- Os destinos operacionais abrem um painel que informa a implementação nativa pendente e oferece **Abrir no sistema web**. Usa a URL pública configurada, sem transportar tokens; o site pode exigir login. “Novo registro” direciona ao módulo web, ainda sem formulários nativos ou gravação. Conta permite logout local.
- O resumo bovino da API é agregado; não se inventa uma distribuição financeira entre corte e leite. A navegação separa os dois, e o cartão financeiro informa ambos quando o backend fornece apenas `bovinos`.
- Catálogos cobrem pt-BR, pt-PT, en e es, seguindo o idioma da organização. Valores mantêm BRL e formatação do idioma.

Validação: TypeScript, ESLint, 42 testes de autorização/sessão/contratos, exportação de bundles web/Android/iOS e navegador com API sintética, três perfis e seis tamanhos (320 × 568 até 1440 × 900, incluindo horizontal). Android/iOS, safe areas e fontes ampliadas em dispositivo, dados reais autenticados e módulos/Agenda nativos continuam pendentes. Este recorte não conclui P05.01/P05.02 nem a Parte 05 inteira.

### Primeiro recorte nativo de Agenda — 7 de novembro de 2026

- Implementadas `/agenda` e `/agenda/[id]` com pilha Expo Router protegida por sessão e troca obrigatória de senha. O atalho da Home/diretório abre a Agenda nativa.
- Consulta por dia ou intervalo de sete dias, navegação de período, data digitada validada, domínio, inclusão de registros concluídos e paginação de 25 itens. Retornar do detalhe preserva período, filtros e página da lista na pilha.
- Tarefas consultam `GET tasks/{id}/` para descrição, horário, local, responsável, autor, prioridade e situação. Eventos derivados revalidam a página de origem e exibem resumo, fazenda e indicação de estimativa quando fornecida. Ausência do evento após mudança da paginação é tratada como indisponibilidade; não se inventa um endpoint de detalhe de previsão.
- Origens operacionais ainda não implementadas abrem somente caminhos web conhecidos e autorizados, no navegador, sem tokens na URL. A página web pode exigir novo login. Não há WebView autenticada.
- Consultas passam pelo serviço e controlador de sessão existentes, validam respostas com Zod, enviam idioma organizacional e bearer, cancelam ao desmontar e descartam resultados após logout. Feeder e senha obrigatória são bloqueados também no controlador. Somente leitura mantém consulta; não há escrita neste recorte.
- Quatro idiomas; carregando, vazio, erro/nova tentativa e atividade indisponível. Data de calendário é enviada sem conversão UTC; “Hoje” ainda usa o calendário do aparelho. Horários são apresentados como devolvidos pela API, sem conversão pelo fuso do aparelho.

Validação deste incremento: TypeScript, ESLint, 53 testes; exportação web/Android/iOS; navegador com API sintética em 320, 390 e 820 px, lista → detalhe de tarefa → retorno preservando sete dias. Sem alterações no backend e sem gravação de tarefas reais. Bundles não substituem homologação em Android/iOS.

**Estado desse primeiro recorte:** era somente consulta. Os incrementos de escrita e complemento da Fase 1 abaixo atualizam essas pendências; sincronização offline continua fora deste recorte.

### Criação, edição e situação de tarefas — 7 de novembro de 2026

O incremento seguinte adicionou `/agenda/task-form`, acessível por **Nova atividade** na Agenda e **Editar atividade** no detalhe. Consulta `agenda-options/` para identidade, somente leitura e fuso; o controlador reconsulta opções e tarefa antes da escrita. Os formulários usam React Hook Form + Zod e o transporte atual; não foram adicionadas dependências ou alterações backend.

- Cadastro online de tarefa/evento/compromisso: título, descrição, data, horários opcionais, local, prioridade e situação. Neste recorte a data é obrigatória, inclusive para tarefa, para que o registro apareça na Agenda. Novas atividades são atribuídas ao usuário autenticado.
- Edição envia somente os campos do formulário; não altera fazenda, responsável ou lembrete existentes. Seleção de fazenda/outro responsável e configuração de WhatsApp continuam no web até seus fluxos nativos específicos.
- Operador edita tarefa aberta criada por ele; tarefa aberta atribuída a ele por outro autor permite somente situação. Concluídas/canceladas de operador, somente leitura e origens de protocolo/ocorrência bovina não oferecem edição genérica. O servidor continua sendo a autorização definitiva.
- Lista e detalhe consultam novamente ao receber foco, preservando filtros/página ao voltar. Uma tarefa concluída pode sair da lista se o filtro de registros concluídos estiver desligado.
- Salvamento bloqueia submissões simultâneas. Não há repetição automática de POST/PATCH. Em erro de validação os campos permanecem; em falha sem resposta, 5xx ou confirmação inválida, o formulário bloqueia reenvio e permite **Conferir Agenda** sem apagar seus campos da pilha. Não equivale a rascunho persistido após encerrar o app.
- Sair de um formulário alterado pede confirmação; durante o envio a saída pela navegação é bloqueada. Usado o [usePreventRemove do Expo Router SDK 58](https://docs.expo.dev/router/advanced/prevent-screen-removal/), sem dependência de React Navigation.
- Não existe controle de versão/idempotência de tarefa neste contrato. A reconsulta verifica acesso/situação antes da escrita, mas não constitui bloqueio atômico contra edição concorrente. Campos ausentes do PATCH permanecem sob controle do servidor.

Validação do incremento de escrita: TypeScript, ESLint e 59 testes automatizados; navegador com API sintética para criação, edição, alteração de situação, erro 400, resultado 503 incerto, retorno sem perda de campos e larguras 320/390/820 px; bundles web/Android/iOS. Nenhuma tarefa real foi criada. Backend real, teclado/gestos e aparelhos Android/iOS ainda precisam de homologação.

Este incremento de escrita substitui a indicação de ausência de formulários no recorte inicial. O complemento abaixo registra a implementação dos demais itens funcionais da Fase 1; homologação real/nativa continua obrigatória.

### Complemento funcional da Fase 1 — 7 de novembro de 2026

| Item | Entrega atual | Limite explícito |
| --- | --- | --- |
| N01 navegação | Home abre Agenda e perfil nativos; busca e fazendas têm rotas protegidas; Novo registro → Agenda abre o formulário | Outros módulos permanecem identificados como pendentes e abrem o web; não são telas nativas concluídas |
| N02 contexto | Seleção paginada de fazendas da organização; filtro na Agenda e nas prioridades; nova atividade usa a fazenda selecionada | O contexto é apenas em memória e volta a todas as fazendas ao revalidar/reabrir sessão. Não cria troca de organização ou uma nova restrição de autorização |
| N03 busca | Busca remota por animais, lotes, plantações, produtos e estruturas, separada por categoria e paginada | Somente domínios autorizados; consulta da organização, sem afirmar filtro por fazenda. Os detalhes de domínio completos pertencem às fases seguintes |
| H01 Home operacional | Próximos sete dias em bloco independente do dashboard financeiro; detalhe nativo de tarefa/evento e acesso à Agenda | Falha financeira não bloqueia prioridades. Financeiro permanece identificado como organização inteira; sem totais de fazenda simulados |
| A01/A02 calendário | “Hoje” e data inicial usam o fuso de `agenda-options/`; consulta, detalhe e escrita com retorno/contexto | Permissão e estado final continuam validados no servidor; recursos avançados de responsáveis/lembretes continuam no web |
| U01 perfil mínimo | Nome, e-mail, telefone, organização, perfil, idioma organizacional, somente leitura, Termos/Privacidade e logout | Consulta nativa; edição pessoal, foto e segurança completa continuam no web, conforme escopo mínimo desta fase |

A busca apresenta identificação e dados resumidos nativos. Quando existe um destino conhecido e permitido, oferece **Abrir módulo no web**, sem tokens e sem importar `href` arbitrário retornado pelo servidor. Bovinos individuais usam `cattle_purpose` para escolher corte/leite. Lotes bovinos genéricos não informam essa finalidade no contrato atual: exibem o resultado sem inventar um destino de produção. Aves não ganha entrada operacional nova.

A seleção de fazenda não filtra o resumo financeiro ou a busca, cujo escopo está informado na tela. A API de Agenda inclui eventos da organização (por exemplo, feriados) conforme suas regras existentes. Tarefas editadas não têm seus vínculos alterados por mudança de contexto; apenas novas tarefas recebem a fazenda selecionada. Ao trocar fazenda a paginação da Agenda começa em 1.

**Validação:** TypeScript, ESLint e 65 testes mobile; dois testes Django focados em busca de plantações (termo/paginação/tenant e autorização agrícola do operador); navegador com API sintética em 320/390/820 px. Verificados erro financeiro com prioridades disponíveis, paginação de fazendas, filtro e vinculação no cadastro, dia organizacional diferente do aparelho, perfil e busca paginada. Bundles web/Android/iOS gerados. Não houve escrita de dados reais ou alteração de schema.

**Aceite ainda pendente:** dados reais autenticados, Android e iOS em aparelho/simulador, teclado, gestos, fonte ampliada, safe areas, retomada e revogação de acesso ponta a ponta. A Fase 1 tem seu recorte funcional implementado, mas não deve ser marcada como homologada/publicada. P05 inteira inclui tarefas adicionais de recorrência/lembretes/medição e não foi declarada concluída. P06 e demais módulos continuam planejados.

### Telas e comportamento

| Tela | Conteúdo | Ação principal | Estados específicos |
| --- | --- | --- | --- |
| Início | Fazenda atual, prioridades, poucos indicadores e atalhos autorizados | Abrir próxima tarefa ou lançamento | Sem tarefas; indicador indisponível sem bloquear a tela |
| Agenda | Dia/semana, lista paginada e filtros | Abrir evento/tarefa | Sem eventos; cache antigo; filtro sem resultado |
| Detalhe de tarefa | Data, prioridade, descrição, origem e situação | Ação permitida conforme tipo | Fonte removida; tarefa não editável; acesso revogado |
| Criar/editar tarefa | Campos previstos no contrato | Salvar online | Conflito; validação; saída com alterações |

### Tarefas

- [ ] P05.01 — Definir quais dados compõem o Início para cada perfil. Reutilizar consultas existentes quando suficientes; propor agregação backend apenas se houver excesso medido de chamadas ou regra compartilhada.
- [ ] P05.02 — Carregar indicadores de maneira independente; erro de resumo não impede abrir tarefas. Exibir estado por bloco e atualização manual.
- [ ] P05.03 — Integrar `/tasks/agenda/` com filtros suportados, paginação e cancelamento. Não buscar todo o histórico para filtrar no celular.
- [ ] P05.04 — Tratar eventos estimados e origens distintas sem apresentá-los como tarefas editáveis. Preservar `estimated`, `source_id`, `kind` e `status` conforme resposta.
- [ ] P05.05 — Mapear `source_url`/`operational_link` para destinos nativos autorizados. Não abrir qualquer URL recebida em WebView com credenciais.
- [ ] P05.06 — Integrar detalhe e opções de tarefas antes de habilitar edição; usar o fuso e as permissões retornadas pelo contrato.
- [ ] P05.07 — Implementar criação/edição e alteração de status somente para ações comprovadas no backend. Preencher fazenda atual quando aplicável e exigir revisão quando mudar contexto.
- [ ] P05.08 — Diferenciar lembrete WhatsApp existente, lembrete local proposto e push nativo futuro. Não converter um no outro silenciosamente.
- [ ] P05.09 — Atualizar consultas afetadas após salvar; retorno à lista conserva dia, filtros e posição quando seguro.
- [ ] P05.10 — Registrar eventos de medição sem conteúdo de tarefas: abertura, duração até detalhe e falhas por categoria. Não enviar descrição de tarefa para analytics.

### Dependências e limites de backend

Conferir em `organizationAgendaService.ts` e app `tasks` os filtros, estados, direitos de edição, regras de recorrência caso existam e vínculo operacional. Não propor criação de tarefas para feeder apenas porque a tela é reutilizável. Alteração de status não pode apagar o histórico exigido pelo domínio.

### Critérios de aceite

- Uma tarefa aparece no dia correto no fuso da organização e abre o recurso certo.
- Eventos derivados/estimados são identificados; campos não editáveis não recebem controles ativos.
- Alterações feitas na web aparecem após atualização do app e vice-versa.
- Sem permissão ou vínculo removido gera mensagem útil, sem exibir dados de outra fazenda.

### Testes e divisão de PRs

Testar dia sem eventos, horário próximo à meia-noite, intervalo extenso, paginação, tarefa alterada por outro usuário, link desconhecido, somente leitura e rede interrompida. P05-A: Início/consulta; P05-B: detalhe e roteamento; P05-C: escrita de tarefas permitidas.

## Parte 06 — Rebanho bovino e contexto operacional

**Resultado demonstrável:** localizar um animal/lote e executar uma ação permitida com o contexto correto. **Dependências:** P02–P04; ligação com P05 quando aplicável. **Responsáveis:** mobile/backend.

### Primeiro recorte de consulta bovina — 7 de novembro de 2026

- Rotas nativas `/cattle/[production]` e `/cattle/[production]/[id]` para `beef` e `dairy`, acessíveis pela Home. Animais e lotes têm listas virtualizadas, paginação remota de 20, busca explícita por identificação/nome/lote, situação e fazenda selecionada. A busca é enviada ao confirmar, evitando consultas por tecla; não há varredura local do rebanho inteiro.
- Ficha operacional com identificação, fazenda, finalidade, categoria, situação, sexo, datas conhecidas, peso em kg, observações e dados pertinentes de animal/lote. Datas desconhecidas não viram “Hoje”; códigos com zeros iniciais são preservados. Lote bovino não é confundido com animal individual.
- Histórico de animal é solicitado somente pelo botão, paginado. A nova projeção backend `view=operational` remove campos financeiros e detalhes de origem antes do transporte; a paginação opcional preserva a resposta antiga em array para o web. O histórico ainda é composto integralmente no servidor antes de paginar: isto limita tráfego/renderização, não constitui otimização SQL de todas as origens.
- A API aplica finalidade (incluindo dupla aptidão), tenant e fazenda; o cliente valida a consistência dos registros recebidos. Feeder, operador sem bovinos e senha obrigatória são bloqueados também pelo controlador. Ausência/inatividade e perda de acesso recebem estados explícitos; dados antigos ficam identificados após falha de atualização e não são exibidos após 403/404.
- Busca global de bovino identificado com finalidade conhecida abre a ficha nativa. Origem sem finalidade confirmada não recebe uma classificação inventada; os demais domínios continuam com seus destinos disponíveis.
- Introduzido `@tanstack/react-query` 5.107.1, previsto na arquitetura, sem migrar os módulos anteriores. Cache apenas em memória, por sessão/epoch; chaves incluem produção, recurso, fazenda, filtros, página e entidade. Não guarda tokens, não persiste offline e não repete automaticamente requisições. Consultas recebem AbortSignal; cache anterior é cancelado/limpo ao mudar sessão, sem recriar a pilha de navegação. Ver [cancelamento](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).

**Cobertura:** B01 parcial (entradas por produção), B02 consulta/lista/ficha/histórico, B04 consulta de lotes. No recorte inicial B03, B05 e L01 ainda estavam pendentes; o incremento seguinte adicionou cadastro/edição essencial e pesagens. Movimentos de lote e L01 continuam pendentes. A Fase 2 não foi marcada concluída.

Validação: TypeScript, ESLint, 72 testes mobile e quatro testes Django focados em projeção, histórico, tenant/fazenda/finalidade e permissão bovina. Prévia com API sintética em 320/390/820 px: animais → ficha → histórico paginado → retorno com busca/página; consulta de lote; troca corte/leite; operador sem consultas financeiras. Bundles web/Android/iOS gerados. Homologação com dados reais e aparelhos segue reservada ao aceite final do usuário; nenhum registro real de rebanho foi alterado.

### Cadastro essencial, edição e pesagens — 7 de novembro de 2026

Adicionada `/cattle/[production]/form`, com modos de cadastro de animal, edição essencial e pesagem de animal/lote. O cadastro está na lista de animais e em Novo registro → Corte/Leite; edição e pesagem estão na ficha. Sem alterações no domínio/backend ou migrations neste incremento.

- **Cadastro:** identificação/brinco (preserva zeros iniciais), nome opcional, fazenda selecionada entre as disponíveis, sexo, categoria, nascimento opcional, entrada, raça opcional, peso de entrada opcional e observações. Finalidade vem da área corte/leite e espécie é sempre `bovinos`. Nascimento desconhecido segue `null`, sem substituir pela entrada. Peso de entrada usa o registro de pesagem criado pelo próprio backend.
- **Edição:** identificação, nome, sexo, categoria, nascimento, entrada e observações. PATCH não inclui fazenda, espécie, finalidade, raça, peso atual/de entrada, lote, ascendentes ou situação. Dados avançados e vínculos seguem no web. No recorte nativo a edição está restrita a admin/manager com animal ativo; operador mantém cadastro e pesagem permitidos, e edição de registros próprios pode ser feita no web conforme as regras existentes de autoria.
- **Pesagem:** `POST animals/{id}/register-weight/` ou `batches/{id}/register-weight/`, em kg; no lote é peso médio por cabeça. Data não pode ser futura nem anterior à entrada. Entrada desconhecida precisa ser conferida no cadastro antes de usar a ação nativa. O servidor conserva o peso mais recente quando chega um lançamento histórico.
- Os dois pesos aceitam até **duas casas decimais**, conforme o contrato real. Vírgula decimal é normalizada para ponto como texto, sem converter o payload para float; separadores ambíguos, zero e precisão excedente são rejeitados. Nascimento/entrada e sexo/categoria recebem validação local e definitiva do servidor.
- Antes de gravar, o controlador verifica usuário, organização, acesso/estado atual e fuso novamente. Troca de organização encerra a sessão local; fazenda e finalidade também acompanham os filtros de edição/pesagem. Feeder, somente leitura, acesso bovino ausente e registros inativos não ganham essas operações.
- Salvamento usa trava contra envios simultâneos, sem retry automático ou fila offline. Erro de validação conserva os campos. Timeout, 5xx ou resposta que não confirma o registro bloqueiam reenvio até a conferência manual do rebanho/histórico; o botão de conferência preserva o formulário na pilha. Isso não é rascunho persistente após encerrar o app.
- Após confirmação, listas, fichas e histórico são invalidados no cache da sessão. Novo animal abre sua ficha; edição e pesagem retornam à origem. Saída com alterações exige confirmação; navegação é bloqueada durante o envio. Não há garantia de idempotência nem controle atômico de versão para cadastro/edição/pesagem nestes endpoints.

**Cobertura atual:** B03 possui cadastro/edição essencial; B05 possui registro de pesagem individual e de lote. Cadastro de lote, transferências, mortalidade/vendas, alterações de finalidade, formulários avançados e leite online continuam em seus incrementos próprios. Não considerar a Fase 2 inteira concluída.

**Validação:** 78 testes mobile, TypeScript e ESLint; quatro testes Django de contrato cobrindo criação/edição, duplicidade de brinco, nascimento desconhecido, peso de entrada, pesos históricos, precisão/datas inválidas e operador autorizado/somente leitura. Prévia com API sintética em 320/390/820 px para cadastro, edição, pesagens de animal/lote, validação 400 e confirmação incerta 503. Bundles web/Android/iOS gerados. Não houve criação ou pesagem no banco real; a homologação manual permanece para o aceite final combinado com o usuário.

### Telas

Operação → Rebanho → lista com busca e filtros → ficha do animal ou lote → histórico e ações. A ficha deve priorizar identificação, fazenda, lote/situação e dados operacionais relevantes; informações financeiras são condicionais e não devem sequer ser buscadas quando proibidas.

### Tarefas

- [ ] P06.01 — Auditar `cattleService.ts`, `cattleOperationsService.ts` e rotas correspondentes para separar animal, lote e operação. Registrar identificadores e tipos de cada recurso.
- [ ] P06.02 — Implementar busca remota por identificador/nome e filtros realmente suportados. Aplicar debounce e cancelamento; resposta antiga não substitui busca nova.
- [ ] P06.03 — Implementar lista virtualizada e paginação; preservar contexto ao voltar do detalhe. Não renderizar todos os históricos e anexos na primeira abertura.
- [ ] P06.04 — Montar ficha operacional com estados para animal transferido, inativo ou removido, respeitando as situações efetivas da API.
- [ ] P06.05 — Separar histórico por categorias existentes e carregar detalhes sob demanda. Não reconstruir regras de reprodução ou custo no cliente.
- [ ] P06.06 — Criar atalhos contextuais para leite, clínica e trato quando aplicáveis; passar IDs e consultar elegibilidade antes de enviar.
- [ ] P06.07 — Definir se cadastro/edição de animal entra no piloto. Caso sim, cobrir validação de identificador, raça, sexo, data, fazenda e demais obrigatórios do contrato; caso não, oferecer apenas consulta clara.
- [ ] P06.08 — Deixar transferências, baixas, morte, venda e operações irreversíveis para incremento próprio online, com confirmação e efeito documentados.
- [ ] P06.09 — Preparar ponto de integração com scanner da Parte 14; até lá manter busca manual, sem botão que simula leitura.
- [ ] P06.10 — Definir quais campos mínimos podem compor consulta offline; não persistir todo o cadastro por conveniência.

### Critérios de aceite

Localizar animal por identificador e abrir formulário com fazenda/animal coerentes. Um ID válido de outro tenant continua inacessível. Ações incompatíveis com situação do animal não são enviadas como se fossem válidas; servidor revalida mesmo quando a interface sugere elegibilidade.

### Testes e divisão de PRs

Busca sem resultado, nomes iguais, identificadores com zeros iniciais, mudança de fazenda, animal alterado entre consulta e ação, milhares de registros paginados, campos restritos e fonte ampliada. P06-A: busca/lista; P06-B: ficha/histórico; P06-C: ações contextuais; cadastro e transferências são PRs separados quando incluídos.

## Parte 07 — Produção de leite online e expansão leiteira

**Resultado demonstrável:** registrar produção uma vez, consultar o registro confirmado e reconciliar o resumo diário. **Dependências:** P02–P04 e P06. **Responsáveis:** mobile/backend e usuário leiteiro.

### Primeiro recorte: produção

Dados existentes em `milkProductionService.ts`: resumo diário, vacas, registros individuais, registros totais, sessões e descartes. A API distingue modo individual/total; o mobile deve respeitar o comportamento vigente, não somar indiscriminadamente as duas formas.

### Tarefas

- [ ] P07.01 — Documentar regras de data, sessão, animal em lactação, produção individual/total, descarte e edição. Definir no contrato quando registro existente deve ser editado em vez de criado.
- [ ] P07.02 — Criar resumo diário com produzido, descartado, utilizável e pendências. Valores desconhecidos não devem aparecer como zero; média sem base válida não deve ser inventada.
- [ ] P07.03 — Implementar lista de vacas com estado pendente/registrado/total segundo a API. Filtro de data e fazenda deve ser compartilhado com o resumo.
- [ ] P07.04 — Criar formulário de produção com contexto visível, teclado decimal, sessão e observações. Descarte exige motivo quando o servidor exigir; validar limites sem divergência de unidade.
- [ ] P07.05 — Separar modo individual e modo total com explicação de impacto. Impedir que a interface aparente registrar as duas formas para o mesmo objetivo sem regra explícita.
- [ ] P07.06 — Desabilitar envio concorrente e identificar resultado desconhecido de timeout. Não habilitar retry automático apenas porque animal/data/sessão parecem únicos.
- [ ] P07.07 — Ao receber sucesso, mostrar ID/estado confirmado, atualizar o resumo e a lista; “salvar e próximo” limpa apenas os campos próprios do animal anterior.
- [ ] P07.08 — Ao editar, carregar o registro existente e enviar apenas os campos previstos; tratar mudança concorrente conforme capacidade efetiva da API.
- [ ] P07.09 — Preparar serialização do rascunho com versão de schema, mas persistência durável entra na Parte 08. Cancelar deve avisar sobre alterações não salvas.
- [ ] P07.10 — Validar a jornada completa em aparelho no local de trabalho: teclado, luz, identificação e retorno após chamada/interrupção.

### Segundo recorte: tanques e qualidade, após piloto

- [ ] P07.11 — Consulta de tanques, capacidade, saldo e produção disponível, com carregamento sob demanda. Evitar portar o loop web que busca todas as páginas sem avaliar volume.
- [ ] P07.12 — Detalhe e histórico de movimentos com classificação produção/coleta/descarte e situação cancelada.
- [ ] P07.13 — Formulário online de movimento, com validação server-side de saldo e vinculação financeira quando existente. Não calcular saldo definitivo localmente.
- [ ] P07.14 — Registro de qualidade com unidades e limites documentados para temperatura, gordura, proteína, CCS/CBT e antibiótico conforme contrato.
- [ ] P07.15 — Cancelamento com motivo, auditoria e atualização de impactos vinculados. Não representar cancelamento como exclusão local.

### Critérios de aceite

- Valor digitado como `18,5` em pt-BR chega com serialização correta, retorna confirmado e altera resumo sem duplicidade.
- Diferença entre produzido, descartado e utilizável segue regra do backend; produção total e individual não são somadas erroneamente.
- Timeout posterior a eventual gravação resulta em reconciliação ou orientação segura, não nova criação silenciosa.
- Somente leitura e acesso revogado bloqueiam escrita mesmo com formulário já aberto.

### Testes e divisão de PRs

P07-A: consulta/resumo; P07-B: criação/edição individual; P07-C: modo total e descartes; P07-D: tanques consulta; P07-E: movimentos/qualidade. Testar zero/negativo/precisão excessiva, descarte maior que permitido, sessão inválida, duplicidade, mudança de dia, perda de conexão após envio e respostas financeiras restritas. Critérios de tanque só se tornam bloqueantes quando essa expansão for incluída na versão.

## Parte 08 — Consulta offline e rascunhos duráveis

**Resultado demonstrável:** consultar o último conjunto autorizado e retomar um formulário após encerrar o app, sem afirmar que houve envio. **Dependências:** P03, P04 e pelo menos um fluxo P07. **Responsáveis:** mobile/backend para política de validade.

### Distinção obrigatória

| Tipo de dado | Dono | Pode ser alterado localmente? | Significado |
| --- | --- | --- | --- |
| Consulta remota em memória | Camada de consultas | Apenas apresentação/otimismo explicitamente seguro | Estado do servidor carregado para uma tela |
| Snapshot persistido | Armazenamento autorizado de leitura | Substituído por atualização confirmada | Cópia limitada, com data e validade |
| Rascunho | Usuário no dispositivo | Sim | Entrada ainda não enviada |
| Operação em fila | Motor da Parte 16 | Segundo máquina de estados | Pedido com contrato de envio/repetição |
| Registro confirmado | Backend | Somente via API autorizada | Fonte definitiva da operação |

### Tarefas

- [ ] P08.01 — Definir allowlist de consultas offline: campos mínimos de animal/fazenda, agenda de janela limitada e contexto do formulário. Financeiro excluído inicialmente; não persistir indiscriminadamente toda a cache.
- [ ] P08.02 — Definir política de autorização offline: validade máxima, exigência de sessão anterior válida, bloqueio local e comportamento sem conseguir revalidar. Documentar a revogação que não pode ser conhecida enquanto o dispositivo está desconectado.
- [ ] P08.03 — Criar SQLite e migrações versionadas. Uma migração que falha não pode apagar rascunhos silenciosamente; cache descartável e entrada do usuário têm recuperação diferente.
- [ ] P08.04 — Persistir rascunhos por organização/usuário/feature/fazenda, com ID local, versão do formulário, datas e campos necessários. Não armazenar token em SQLite.
- [ ] P08.05 — Implementar salvamento após alterações com intervalo controlado e indicador de persistência. Reduzir gravações repetidas; tratar disco cheio e erro de escrita.
- [ ] P08.06 — Criar central de rascunhos com identificação, data, estado e opções retomar/descartar. Evitar duplicar um rascunho a cada retorno à tela.
- [ ] P08.07 — Ao retomar, revalidar contexto, recurso, campos obrigatórios e permissão quando online. Dados antigos podem precisar de revisão antes de enviar.
- [ ] P08.08 — Mostrar horário da última atualização e estado sem conexão. Indicador de rede não prova disponibilidade da API; tratar timeout/servidor indisponível mesmo com Wi-Fi.
- [ ] P08.09 — Implementar retenção/limites de snapshots e anexos. Para rascunhos, apresentar política de expiração e aviso em vez de apagar sem conhecimento do usuário.
- [ ] P08.10 — Definir destino dos dados em logout, troca de conta e revogação. Se houver conservação local, ela exige desenho de criptografia e chave segregada; se houver descarte, informar a perda e permitir cancelar logout voluntário quando apropriado. Revogação de segurança não depende da concordância do usuário.
- [ ] P08.11 — Atualizar consultas ao retomar o app/recuperar conexão com limites; não usar polling contínuo como mecanismo principal.
- [ ] P08.12 — Instrumentar tamanho do cache, erros de persistência e quantidade de rascunhos sem capturar conteúdo.

### Modelo local proposto

`drafts`: id local, organization_id, user_id, farm_id, feature, schema_version, payload mínimo, created_at, updated_at, validation_state. `snapshots`: chave de consulta, mesmo escopo, data de busca, expiração e conteúdo autorizado. `schema_migrations`: versão aplicada. Estrutura física e criptografia devem ser decididas após política de retenção; estes nomes são proposta, não migrações já criadas.

Não misturar ID local com ID do servidor. Ao enviar manualmente um rascunho, manter estado até confirmar resultado e vincular o ID recebido; timeout não autoriza apagá-lo nem recriá-lo automaticamente.

### Critérios de aceite e testes

Modo avião permite abrir apenas o conjunto autorizado já persistido e mostra sua data. Rascunho sobrevive a encerramento/reinício, atualização compatível e mudança de orientação. Troca de usuário não revela rascunhos anteriores. Testar disco cheio, migração interrompida, schema antigo, recurso removido, permissão revogada, logout com pendência e limpeza de cache sem apagar rascunho.

### Divisão sugerida de PRs

P08-A: storage/migrações/política; P08-B: snapshots e estados; P08-C: rascunho de leite e central; P08-D: recuperação/limpeza e testes. Nenhuma dessas entregas habilita automaticamente uma fila de mutações.
