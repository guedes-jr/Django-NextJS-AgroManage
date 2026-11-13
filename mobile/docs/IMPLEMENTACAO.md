# Plano de implementação mobile

Plano original de 6 de novembro de 2026, revisado para orientar a evolução do app existente. O próximo trabalho é **consolidar, integrar e homologar**, aproveitando os recortes entregues. A Agenda atualizada é a base conceitual: contexto, dados legíveis e caminhos simples para realizar as operações, conforme o [guia de design](../DESIGN.md).

## Situação de partida

| Área | Evidência atual | O que ainda exige trabalho |
| --- | --- | --- |
| Fundação | Expo/React Native/TypeScript, rotas, transporte, sessão, SecureStore, idiomas e contexto de fazenda | Homologação nativa, retomada, acessibilidade e distribuição |
| Início e Agenda | Prioridades, atalhos, consulta, detalhe e tarefas; Agenda com Mês/Semana/Lista | Coerência entre período/paginação, retorno, áreas de toque e caminho até a operação |
| Bovinos e leite | Recortes online de rebanho/lotes, produção, reprodução, pastos, manejos, protocolos e importação; tanques com consulta/históricos/formulário essencial | Padronização, aceite em aparelhos e complementos por contrato; compatibilidade com a evolução leiteira do web |
| Estoque, alimentação e clínica | Recortes nativos de consulta/escrita, revisão e efeitos; trato próprio do feeder | Homologação das jornadas, recuperação de erros e expansões documentadas |
| Comunicação e perfil | Inbox, detalhe, leitura/arquivamento, preferências e perfil mínimo | Push nativo, complementos de perfil e gestão |
| Demais domínios | O menu contém destinos que ainda usam alternativa web | Suínos, plantações, gestão, suporte e IA nativos dependem de recortes específicos |
| Persistência e aparelho | SecureStore e seleção de CSV por DocumentPicker/FileSystem | Sem SQLite/outbox/push declarados na configuração atual; câmera, anexos e demais recursos exigem consumidores reais |

Fontes consultadas: `app/`, `src/features/workspace/navigation.ts`, Agenda, contratos de leite e `package.json`. O inventário detalha a cobertura; cada integração deve confirmar seu endpoint e seus estados no código. Um módulo presente no menu não comprova fluxo nativo completo, e testes históricos não comprovam homologação em aparelhos.

A implementação existente e as validações anteriores estão registradas nas partes abaixo. Este plano não marca fases inteiras como concluídas por haver telas, bundles ou testes de contrato.

## Inventário atual de telas

Consulte o [mapa de telas pendentes](TELAS-PENDENTES.md), levantado em 7 de novembro de 2026 a partir das rotas web e do código mobile: estado real, backlog por domínio, fases de entrega e classificação de aliases e itens fora do escopo.

## Objetivo e limites

Oferecer uma experiência de campo com menos seleções repetidas, ações acessíveis com uma mão e uso criterioso de câmera, armazenamento local e notificações. O benefício sobre o PWA deverá ser medido nas mesmas tarefas, nos mesmos aparelhos e condições de rede; a tecnologia nativa, sozinha, não garante melhor desempenho.

Premissa inicial: piloto Android e compatibilidade iOS desde a fundação. A prioridade de plataforma deve ser confirmada com os aparelhos dos usuários. Não estão incluídos `/platform`, marketing, reconstrução de toda a administração, portal de afiliados, módulos ainda em desenvolvimento, integração Bluetooth/RFID/balanças ou um novo backend.

## Base existente e reaproveitamento

| Evidência no projeto | Aproveitar | Trabalho necessário |
| --- | --- | --- |
| `frontend/src/services/organizationAccess.ts` e `/auth/me/` | Papéis admin, manager, operator, feeder; capacidades, espécies e somente leitura | Modelar a navegação por capacidades e testar também as negativas no servidor |
| `frontend/src/components/dashboard/AppSidebar.tsx` | Domínios e acessos atuais | Trocar menu lateral por tarefas e atalhos contextuais |
| `frontend/src/services/organizationAgendaService.ts` | Agenda paginada `/tasks/agenda/`, tarefas `/tasks/`, opções `/tasks/agenda-options/` | Adaptar eventos para listas diárias; resolver links web para destinos nativos autorizados |
| `frontend/src/services/milkProductionService.ts` | Resumo diário, vacas, leite individual e total | Formulário nativo e revisão do contrato de repetição de gravações |
| `frontend/src/services/api.ts` | Contratos de autenticação, renovação e idioma | Novo transporte nativo; remover dependência de localStorage, navegador e redirecionamentos web |
| `frontend/src/lib/localeMessages.ts` e `publicMessages.ts` | Vocabulário e idiomas existentes | Reutilizar apenas módulos puros após auditar dependências; não importar providers Next.js |
| `frontend/src/services/ticketService.ts` | Exemplo de chaves de requisição e controle de versão em operações específicas | Conferir garantias no backend; não generalizar para leite, estoque ou financeiro |

Os caminhos acima são relativos à raiz do repositório. A existência de um serviço web não prova compatibilidade nativa ou autorização para todos os papéis. O feeder, por exemplo, tem acesso restrito ao trato autorizado e áreas pessoais; não deve receber automaticamente a Agenda ou todos os módulos exibidos nos mockups.

## Stack definida e escopo técnico

**React Native + Expo + TypeScript são a base definida para o desenvolvimento do app Android/iOS.** Esta decisão integra o escopo das partes P01–P17; o scaffold foi inicializado no primeiro recorte de login. A escolha aproveita o conhecimento React/TypeScript existente e mantém a API Django como fonte de regras, autorização e dados.

| Camada | Escolha no planejamento | Introdução |
| --- | --- | --- |
| Aplicativo | React Native com Expo, builds nativos de desenvolvimento | P01 |
| Linguagem | TypeScript em modo estrito, versões compatíveis com o SDK Expo | P01 |
| Navegação | Expo Router, destinos por capacidade e ação central contextual | P04 |
| API | Axios em cliente nativo próprio, consumindo Django REST Framework | P02/P03 |
| Dados remotos | TanStack Query para consultas, paginação e invalidação | P02 e fluxos seguintes |
| Formulários | React Hook Form + Zod para entrada e validação local | P04 e primeiro formulário de domínio |
| Estado de interface | Estado local e Context para sessão/contexto; sem gerenciador global adicional inicialmente | P03/P04 |
| Credenciais | Expo SecureStore; sem tokens no banco de rascunhos | P03 |
| Dados locais | Expo SQLite para snapshots autorizados, rascunhos e futura outbox | P08/P16 |
| Interface | Componentes nativos com tema próprio alinhado à marca atual | P04 |
| Recursos do aparelho | Módulos Expo conforme caso de uso, permissão e compatibilidade | P14/P15 |
| Backend | Django REST Framework, PostgreSQL e serviços atuais; preservar isolamento e autorização | Todas as integrações |

O uso de Expo não obriga contratação de serviço de build: provedor de CI/build e transporte push continuam decisões próprias das partes P01/P15/P17. Fixar versões na inicialização a partir da matriz do SDK; não copiar automaticamente a versão de React do Next.js. Instalar dependências conforme a entrega, mantendo lockfile e scripts próprios em `mobile/`.

Compartilhar apenas contratos, tipos, traduções e funções puras cuja compatibilidade seja verificada. A interface web, CSS, Bootstrap, providers Next.js e utilitários dependentes de navegador não são componentes nativos reutilizáveis. SQLite não implementa sincronização automaticamente: as garantias da Parte 16 continuam obrigatórias.

As regras de contribuição estão em [AGENTS.md](../AGENTS.md); o ponto de entrada para Claude está em [CLAUDE.md](../CLAUDE.md). O [.gitignore](../.gitignore) cobre arquivos locais e gerados sem ocultar o planejamento ou os lockfiles.

## Arquitetura existente e extensões planejadas

```text
mobile/ (React Native + Expo + TypeScript)
    -> cliente HTTPS próprio -> API Django existente -> PostgreSQL
    -> SecureStore: credenciais de sessão
    -> cache de consultas: dados de servidor necessários à tela
    -> SQLite (planejado, P08/P16): rascunhos e futura fila explicitamente autorizada
frontend/ (Next.js) -> mesma API
```

Expo tem suporte a monorepos, mas workspaces acrescentam configuração. Inicialmente manter a pasta independente; extrair traduções, tipos e validadores puros para um pacote compartilhado somente quando os dois clientes precisarem dele. Não compartilhar componentes DOM, CSS ou código dependente de `window`. [Referência oficial de monorepos](https://docs.expo.dev/guides/monorepos/).

Expo, navegação, transporte, consultas, formulários e sessão já têm dependências próprias e lockfile. Conferir `package.json` antes de executar comandos ou acrescentar bibliotecas. SQLite e demais integrações entram apenas nos recortes consumidores, com compatibilidade de SDK e builds verificáveis. [Integração React Native do TanStack Query](https://tanstack.com/query/latest/docs/framework/react/react-native).

Estrutura de referência: as áreas principais já existem; `src/storage/` é uma extensão planejada para P08/P16, não implementação atual:

```text
mobile/
  app/                 # rotas e composição das telas
  src/features/        # auth, home, agenda, operations, livestock, milk...
  src/components/      # controles nativos e estados compartilhados
  src/services/        # transporte e contratos da API
  src/storage/         # migrações locais, rascunhos e fila
  src/i18n/            # adaptação das traduções e formatação
  src/theme/           # tokens móveis alinhados à identidade atual
  assets/              # ícones e recursos finais aprovados
  tests/               # contratos, permissões e fluxos críticos
  docs/                # plano e conceitos já presentes
```

## Sessão, idioma e isolamento

- Configurar URL pública HTTPS direta da API por ambiente. Não reutilizar automaticamente proxy Next.js, localhost de produção ou segredos em variáveis públicas. Testar em aparelho físico.
- Guardar tokens em armazenamento seguro, renovar sessão sem requisições concorrentes de refresh e tratar expiração, revogação e logout. Biometria desbloqueia o acesso local; não substitui autenticação nem autorização do servidor. [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).
- Usar idioma do aparelho antes do login; após autenticação, respeitar o idioma configurado da organização, conforme contrato vigente. Cobrir pt-BR, en, es e pt-PT, incluindo erros, notificações e acessibilidade. Moeda, unidades e fuso não devem mudar implicitamente com o idioma.
- Segregar cache e rascunhos por organização e usuário; contexto de fazenda deve conter apenas fazendas autorizadas. Não introduzir troca de organização sem contrato existente.
- Revalidar capacidades no retorno ao primeiro plano e após erros de permissão. Esconder ações insuficientes não substitui validação no backend. Evitar até armazenar dados financeiros para quem não pode consultá-los.
- Planejar expiração e limpeza do cache. Tratar rascunhos pendentes antes do logout para evitar perda silenciosa; não permitir que outra sessão os consulte. SQLite, por si só, não garante criptografia da base.

## Escopo por prioridade

| Prioridade | Entrega | Limite inicial |
| --- | --- | --- |
| P0 | Login, sessão, idioma, permissões, fazendas autorizadas | Estados de erro, vazio, bloqueio e somente leitura |
| P0 | Início operacional e Agenda | Próximas tarefas, consultas paginadas e detalhes; sem dashboard pesado |
| P0 | Operação adaptada ao perfil | Rebanho e leite como primeiro fluxo vertical; atalhos só para módulos permitidos |
| P0 | Consolidar lançamento de leite online | Compatibilidade com a API atual, revisão, descarte e confirmação real; rascunho durável fica em P08 |
| P1 | Consulta offline limitada, após política e schema local | Data da última atualização, isolamento e retenção; não bloqueia o primeiro piloto online |
| P1 | Tratos e consulta de estoque | Escritas com impacto em estoque inicialmente online; validar limites do feeder |
| P1 | Demais rotinas autorizadas: clínica, suínos e plantações | Selecionar fluxos por uso real no piloto; não prometer paridade integral nesta fase |
| P1 | Câmera, anexos e notificações | Depende dos contratos e da infraestrutura descritos abaixo |
| P2 | Relatórios, financeiro permitido, compartilhamento, automações | Administração complexa continua disponível na web |

## Offline sem duplicar operações

Começar por consulta e rascunhos, não por replay de todas as mutações. O serviço atual de leite não envia chave de idempotência nos métodos de criação; validar unicidade não equivale a garantir uma repetição segura.

Antes de habilitar fila para qualquer escrita, documentar por endpoint: identificador imutável da operação, deduplicação no servidor, retorno da mesma resposta em repetição, reconciliação após timeout, controle de concorrência e auditoria. Confirmar como anexos e dependências são reenviados. Operações financeiras, movimentações de estoque, transferências e outras escritas com efeitos devem permanecer online até cumprir esse contrato.

Estados visíveis: rascunho → aguardando envio → enviando → confirmado; conflito e recusado exigem revisão. Um rascunho salvo no aparelho nunca deve parecer confirmado no servidor. A fila precisa sobreviver a reinício, aplicar backoff, respeitar ordem de dependências e revalidar tenant, usuário, capacidade e somente leitura a cada envio. Não repetir automaticamente uma operação de resultado desconhecido sem reconciliação.

Não presumir API de sincronização incremental, tombstones ou versões gerais: auditar o backend e começar com paginação e atualização das consultas necessárias. Sincronização principal ocorre ao abrir o app e recuperar conexão. Execução em segundo plano é complementar e depende do sistema operacional; não prometer envio imediato com app encerrado. [BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/).

## Recursos nativos e dependências

| Recurso | Utilidade | Condição para implementar |
| --- | --- | --- |
| Câmera e leitura de código | Identificar animal/item e anexar evidência | Definir formato e busca autorizada; leitura de código não cria por si só cadastro ou endpoint |
| Fotos e arquivos | Registro clínico e suporte | Confirmar endpoint, tamanho, compressão e remoção de metadados desnecessários |
| Push e lembretes | Abrir a tarefa correta | Registro de dispositivos, consentimento, revogação, deduplicação e servidor de envio; WhatsApp atual não equivale a push |
| Localização pontual | Preencher campo de ocorrência quando aplicável | Campo e finalidade definidos, consentimento durante uso; sem rastreamento contínuo |
| Biometria | Facilitar retorno à sessão | Sessão válida e tratamento de falha/indisponibilidade |
| Compartilhamento | Enviar arquivo ou relatório | Confirmar exportação compatível; não importar bibliotecas PDF dependentes de DOM |
| Feedback tátil | Confirmar interação | Breve e opcional; não substituir texto de sucesso/erro |

Push deve carregar informação mínima; ao abrir, autenticar e buscar novamente o conteúdo autorizado, inclusive em inicialização fria. Não prometer entrega garantida. Câmera, notificações e localização precisam funcionar também quando a permissão for negada. IA permanece dependente do serviço online existente.

## Como executar o desenvolvimento por partes

O desenvolvimento mantém **18 partes, de P00 a P17**, como mapa de escopo e dependências. Os IDs existentes permanecem estáveis para issues/PRs; a ordem ativa é a sequência abaixo, não a numeração das partes. Checkbox vazio significa que o aceite integral ainda precisa ser conferido, não que todo o código esteja ausente. Distinguir **implementado**, **validado tecnicamente**, **homologado em aparelho/piloto** e **distribuído**; registrar evidência e pendências por incremento antes de marcar conclusão.

| Documento detalhado | Partes | Resultado |
| --- | --- | --- |
| [Fundação](partes/00-04-FUNDACAO.md) | P00 diagnóstico; P01 projeto; P02 contratos; P03 sessão; P04 design/navegação/idiomas | Base instalada e autorização verificável |
| [Primeiro aplicativo](partes/05-08-PRIMEIRO-APP.md) | P05 Início/Agenda; P06 rebanho; P07 leite; P08 offline de leitura/rascunhos | Primeiro fluxo útil ponta a ponta |
| [Expansão por domínio](partes/09-13-MODULOS.md) | P09 trato/estoque; P10 clínica; P11 suínos; P12 plantações; P13 gestão/suporte/IA | Módulos liberados conforme demanda e acesso |
| [Recursos nativos e sincronização](partes/14-16-NATIVO-SINCRONIZACAO.md) | P14 aparelho; P15 inbox/push; P16 fila offline | Recursos nativos e envio seguro por operação |
| [Qualidade e publicação](partes/17-QUALIDADE-PUBLICACAO.md) | P17 testes, desempenho, CI, piloto, lojas e sustentação | Evidências de qualidade e distribuição responsável |

## Ordem atual de execução

| Passo | Trabalho | Partes e entrega verificável | Condição para avançar |
| --- | --- | --- | --- |
| 1 — Conferir a base e os contratos | Validar ambiente, sessão, idioma, fazenda, perfis e compatibilidade API/app | P00/P01–P03 e P07.16: confirmar escopo/aparelhos do piloto, comandos reproduzíveis e contratos atuais | Entrar, restaurar e sair com isolamento; identificar lacunas localizadas sem recriar a fundação |
| 2 — Consolidar a Agenda como referência | Corrigir hierarquia, alvos de toque, período/paginação, textos e retorno; tornar claro o caminho até a operação | P04.12–P04.15 e P05.11–P05.14: lista → detalhe → ação autorizada → retorno ao contexto | Dados corretos para a seleção e estados compreensíveis em larguras pequena e maior; alternativa web identificada quando necessária |
| 3 — Aplicar o padrão às jornadas existentes | Revisar Início, Rebanho, Leite, Trato, Estoque e Clínica, uma jornada de cada vez | P04/P06/P07/P09/P10: contexto → dados → formulário/revisão → confirmação → histórico | Critérios da Agenda adaptados ao domínio, sem efeitos duplicados, perda de entrada ou ampliação de acesso |
| 4 — Homologar e pilotar o recorte online | Validar builds e tarefas com dados sintéticos em Android/iOS; comparar com a jornada web | P17: perfis, dispositivo, rede ruim, teclado, fonte ampliada, interrupção e resultado incerto | Evidências nativas e pendências explícitas; liberar internamente apenas o conjunto aprovado |
| 5 — Fechar lacunas operacionais escolhidas | Completar os contratos e ações que o piloto precisa, antes de ampliar segmentos | P06/P07/P09/P10 e recortes P13/P15; tanques/qualidade e demais complementos conforme prioridade | Fluxo completo e homologado; lista/ficha isoladas não encerram um módulo |
| 6 — Expandir conforme demanda | Introduzir um fluxo vertical de suínos, plantações ou gestão por vez; continuar o aceite nativo | P11–P13 e complementos P15, após conferência do contrato | Consulta, ação, efeitos, recuperação e suporte demonstráveis no domínio escolhido |
| 7 — Acrescentar capacidades de campo | Selecionar o que resolve uma necessidade observada: leitura offline, rascunho, captura, push ou compartilhamento | P08/P14/P15; cada capacidade tem consumidor, política e teste próprio | Permissão negada, retenção, troca de conta e retomada tratadas; sem dependências nativas sem consumidor |
| 8 — Sincronizar e distribuir com segurança | Homologar envio offline por operação, quando necessário, e preparar versões publicáveis | P16 por endpoint; P17 acompanha todas as entregas e consolida distribuição | Idempotência e reconciliação comprovadas; build, atualização, suporte e rollback do escopo liberado |

O passo 4 não precisa esperar todos os módulos nem persistência offline. P17 acompanha cada passo; sua posição no mapa não adia qualidade. Depois do piloto, uma capacidade de campo pode preceder um novo segmento se resolver a necessidade prioritária; P16 continua dependente do contrato seguro da operação.

### Próximo incremento a executar

1. Compatibilidade leiteira P07.16 implementada: intervalo preservado, consulta por dia abrangido e bloqueio de correção diária no app/servidor. Contratos de sessão, idioma e fazenda passaram nos testes direcionados. Restam aplicar a migração 0045 no ambiente de uso identificado e homologar em aparelhos; nenhum banco de uso foi alterado.
2. Controles e leitura da Agenda implementados (P04.12/P05.11): consulta/paginação direta do dia em Mês/Semana, contagem do servidor e remoção de indicadores incompletos; alvos mínimos de 44. Aceite visual/nativo permanece pendente.
3. Retorno/contexto P05.12 implementado em memória por sessão/fazenda, com nova localização de eventos deslocados pela paginação; homologação nativa pendente. P05.13 implementado para fichas de vacinação e manejo sanitário, com conferência autorizada e alternativa web para demais origens; homologação nativa pendente. P05.14 implementado: criação/edição/situação preservam contexto, revalidam a fazenda e conferem o recibo, mantendo bloqueio de resultado incerto. Próximo recorte de implementação: aplicar o padrão à jornada já existente priorizada (P04.13); aceite visual/nativo da Agenda continua pendente.
4. P04.13 aplicado à produção de leite e à lista/ficha de tanques: contexto/dados/operação, detalhes progressivos e retorno pelo cabeçalho. Testes e prévia web em 320/768 px aprovados; validação nativa permanece pendente. Históricos/fichas de movimentos e qualidade revisados, com filtros progressivos, contexto, cancelamento auditável e resultados com unidades/ausências preservados. Formulários nativos de entrada/coleta operacional/descarte, cancelamento e análise implementados com revisão e recibo; financeiro permanece no web. Próximo bloco: validar a integração no ambiente identificado e conferir a migração 0045 pendente antes da homologação/piloto. Chaves/rascunhos são apenas em memória; não há recuperação durável após encerramento forçado.
5. Demonstrar a jornada em Android/iOS e registrar limitações (P04.14/P17). Código e prévia web são etapas de validação, não homologação nativa.

### Dependências do incremento, sem reiniciar a fundação

```text
App e recortes online existentes
 -> conferir ambiente, sessão e contratos (P01–P03; P07.16)
 -> consolidar Agenda e componentes necessários (P04/P05)
 -> aplicar às jornadas atuais (P06/P07/P09/P10)
 -> homologar e pilotar online (P17 / M2)
 -> escolher complementos e expansões pelo resultado do piloto

Em paralelo, por necessidade comprovada:
 P08 -> leitura offline e rascunhos com política/schema próprios
 P14/P15 -> recurso do aparelho ou push com fluxo consumidor
 P16 -> P08 + contrato de idempotência/reconciliação por operação
 P17 -> qualidade contínua e distribuição do escopo aprovado
```

### Marcos publicáveis

| Marco | Inclui | Demonstração obrigatória | Pode permanecer fora |
| --- | --- | --- | --- |
| M0 — Escopo validado | P00 e mapa P02 | Jornada atual medida e lista de contratos/lacunas | Qualquer tela nova |
| M1 — Fundação instalada | P01–P04 | Login, contexto, idioma, rotas e bloqueios em aparelho | Módulos de negócio |
| M2 — Piloto online | P05–P07 no recorte escolhido + testes P17 | Consultar tarefa/animal, lançar e confirmar produção uma vez | Tanques avançados, offline, push e demais domínios |
| M3 — Piloto de campo | P08 + correções de usabilidade + P17 | Modo avião de leitura, rascunho, retomada e envio manual consciente | Fila automática e paridade com PWA |
| M4 — Expansão operacional | Recortes priorizados de P09–P12 e recursos P14 úteis | Rotina de domínio completa com efeitos e acesso corretos | Outros segmentos não usados pelo grupo |
| M5 — Produto ampliado | Recortes P13/P15; P16 somente para operações aprovadas | Gestão autorizada, inbox/push e sincronização homologada | Automações/hardware não validados |
| M6 — Distribuição ampliada | P17 sobre o conjunto escolhido | Atualização, suporte, métricas, rollback e publicação gradual | Módulos explicitamente futuros |

M2/M3 podem ser distribuídos internamente. Uma primeira versão de loja pode usar o escopo online aprovado de M2, ou incluir M3 quando homologado, se cumprir P17; não é obrigatório esperar offline ou M5. Os marcos indicam disponibilidade, não datas prometidas.

### Regra para iniciar e concluir cada parte

**Pronta para iniciar:** objetivo e perfil definidos; contratos envolvidos identificados; dependências críticas concluídas; dados sintéticos preparados; dúvidas que mudam a regra de negócio resolvidas ou registradas como bloqueio localizado.

**Concluída:** fluxo integrado e demonstrado em aparelho; tratamento de carregamento/erro/vazio/permissão/somente leitura; tradução dos textos; testes relevantes aprovados; documentação de contrato quando mudou; limitações conhecidas; nenhum efeito pendente apresentado como sucesso.

Uma parte pode ter subpartes concluídas e outras pendentes. Registrar o incremento exato, por exemplo “P07 produção individual online concluída; tanques ainda fora”, em vez de marcar todo o módulo como pronto.

### Organização das issues e PRs

Usar o formato de tarefa abaixo para cada incremento. Não abrir uma issue vaga de “fazer módulo” contendo dezenas de telas sem critérios.

```text
ID e título: P07.04 — Formulário de leite individual
Usuário e necessidade: operador registra produção do animal na fazenda atual
Dependências: sessão, acesso, seleção de animal e contrato do leite
Inclui: campos reais, validação, envio online, erros e confirmação
Fora: fila automática e movimentos de tanque
API: métodos/rotas e ficha de contrato verificada
Backend: lacuna, teste que comprova ou indicação de que não precisa mudar
Critérios: casos concretos de sucesso, falha, acesso e repetição
Testes: regra pura, integração e verificação nativa pertinente
Demonstração: sequência reproduzível com dados sintéticos
Riscos: resultado desconhecido após timeout; contexto alterado
Evidência: testes executados e limitações da versão
```

Separar PR de mudança de contrato/migração de PR de tela quando isso tornar a revisão segura, mantendo compatibilidade durante a transição. Não mudar APIs usadas pela web sem testes relevantes dessa integração. Evitar PR que mistura fundação, vários domínios e publicação.

### Planejamento de esforço e capacidade

Não há estimativa confiável de prazo total antes de P00/P02. O esforço muda conforme as lacunas da API, quantidade de perfis, aparelhos e volume de testes de offline. A divisão permite estimar incrementalmente sem prometer paridade em uma data arbitrária.

1. Estimar tarefas pequenas em dias de esforço, por competência (mobile, backend, design/QA), explicitando hipóteses e dependências externas.
2. Tarefa que não cabe em um incremento demonstrável deve ser dividida em consulta, escrita, efeitos, recuperação e validação conforme aplicável.
3. Considerar revisão, teste em aparelho, correções e distribuição no esforço; “tela pronta” não é a conclusão de uma tarefa de negócio.
4. Calcular prazo com capacidade efetiva alocada, não com número de pessoas nominal. Espera por credencial, aparelho ou decisão aparece separadamente do esforço.
5. Reestimar após consolidar a Agenda e homologar a primeira jornada atual no aparelho; usar esse resultado para dimensionar os próximos incrementos, sem tratar o app existente como um novo scaffold.
6. Planejar no máximo o próximo marco em detalhe de agenda; o restante mantém ordem e escopo ajustáveis com o aprendizado do piloto.

Competências mínimas: desenvolvimento mobile, backend para contratos/invariantes, design/produto e validação com usuário de campo. Uma pessoa pode acumular competências, mas a capacidade precisa refletir isso. CI, contas de loja e credenciais precisam de responsável operacional.

### Decisões a resolver e efeito sobre o plano

| Decisão | Padrão proposto | Evidência necessária | Quando bloqueia |
| --- | --- | --- | --- |
| Primeiro segmento | Leite como sugestão | Frequência de uso e grupo piloto | Escritas do primeiro domínio |
| Android/iOS suportados | Android piloto, iOS validado desde a fundação | Inventário de aparelhos e SO | SDK e builds P01 |
| Limite de autorização offline | A definir, conservador | Risco de revogação, aparelho compartilhado e retenção | Consulta offline P08 |
| Dados conservados no logout | Não expor a próxima sessão; tratar rascunhos explicitamente | Política de segurança/recuperação | Persistência P08 |
| Criptografia local | Avaliar por dado e risco, sem supor SQLite criptografado | Classificação de dados, backup e recuperação | Persistência de conteúdo sensível |
| Push Expo ou direto | Expo como candidato, não contratação decidida | Infra atual, custo, privacidade e manutenção | Transporte P15 |
| Primeira operação em fila | Nenhuma por padrão | Provas transacionais e de reconciliação | Habilitação P16 |
| Build/distribuição | Pipeline independente, provedor a definir | Contas disponíveis e capacidade operacional | Distribuição de candidatos |
| Pacote compartilhado | Não extrair antes de consumidor real | Dependências puras e ganho concreto | Reuso, não início do mobile |

Essas decisões não impedem refinar contratos e componentes independentes. Somente a etapa dependente deve ficar bloqueada.

### Riscos e mitigação operacional

| Risco | Sinal de alerta | Mitigação | Parte responsável |
| --- | --- | --- | --- |
| Paridade indiscriminada com a web | Escopo cresce antes do primeiro fluxo utilizável | Recorte por jornada, expansão por marco | P00/produto |
| API dependente do navegador | Imports de DOM/localStorage e URLs relativas | Transporte nativo e contratos explícitos | P01/P02 |
| Vazamento de dados operacionais/financeiros | Backend retorna campo que a tela apenas esconde | Restringir servidor e cache, testes negativos | P02/P03/P17 |
| Duplicidade após timeout | Botão “tentar” cria nova operação | Reconciliação e idempotência por endpoint | P07/P09/P16 |
| Perda de rascunho | Migração/limpeza trata entrada como cache | Storage separado, recuperação e política visível | P08 |
| Bateria ou tráfego excessivo | Polling, GPS ou câmera continuam sem uso | Ciclo de vida, limites e medição real | P14/P15/P17 |
| Push enviado à conta anterior | Token de instalação conserva vínculo indevido | Registro autenticado, revogação e teste de troca | P15 |
| Atualização quebra operação em campo | Schema local/API incompatível com app instalado | Compatibilidade, migração e rollout controlado | P08/P16/P17 |
| Usabilidade não supera PWA | Mais toques ou pouca adoção | Medição e ajuste antes de expandir domínios | P00/P17 |

### Acompanhamento do progresso

Os marcos abaixo ainda não estão concluídos. O primeiro recorte de P01–P04 já entrega login, recuperação, sessão e idiomas, conforme [LOGIN.md](LOGIN.md). A renovação automática depende de revisão do contrato backend; builds instalados e validação em aparelho ainda estão pendentes.

- [ ] M0: jornadas medidas, primeiro segmento e contratos verificados.
- [ ] M1: builds de desenvolvimento com sessão, acesso e idiomas.
- [ ] M2: fluxo online completo com confirmação e testes negativos.
- [ ] M3: consulta offline e rascunhos com recuperação, piloto comparado ao PWA.
- [ ] M4: primeiros módulos adicionais escolhidos pelo uso real.
- [ ] M5: recursos gerenciais/nativos e filas apenas onde homologados.
- [ ] M6: pacote publicável, suporte, observabilidade e rollout.

## Qualidade e metas propostas

- Comparar tempo, toques, erros e conclusão das três tarefas de referência com o PWA. Meta inicial a validar: reduzir em 25% o tempo mediano das rotinas escolhidas, sem aumentar erros; não apresentar isso como resultado já obtido.
- Testar autorização entre tenants, fazendas e papéis, revogação, sessão expirada, somente leitura e deep links sem acesso. Cobrir também ausência de vazamento pelo cache.
- Testar envio duplo, timeout após gravação no servidor, conflito, rede intermitente, app encerrado e mudança de usuário. Conferir efeitos em estoque/financeiro quando esses fluxos forem incluídos.
- Avaliar aparelho Android de entrada e iPhone representativo; listas grandes virtualizadas, paginação, imagens reduzidas, sem polling frequente ou carregamento de toda a organização. Medir memória, bateria e tráfego antes de estabelecer orçamento final.
- Validar fontes ampliadas, leitor de tela, teclado, safe areas, orientação e quatro idiomas. Manter alvos de toque de pelo menos 44 pontos lógicos e campos legíveis.
- Testes unitários para política de acesso, validação e fila; integração para autenticação e contratos; ponta a ponta dos fluxos P0. CI mobile separado das verificações web, com smoke test do backend compartilhado.

## Próxima ação recomendada

Executar o [próximo incremento](#próximo-incremento-a-executar) da ordem atual: conferir a base/contratos, consolidar a Agenda (P04.12–P04.15/P05.11–P05.14), revisar a compatibilidade leiteira (P07.16) e demonstrar a jornada em Android/iOS. Completar as decisões de campo de P00 que ainda faltam sem recriar projeto, sessão ou módulos existentes. O [guia de design](../DESIGN.md) e a [experiência revisada](EXPERIENCIA.md) orientam os percursos; o mockup antigo é histórico.
