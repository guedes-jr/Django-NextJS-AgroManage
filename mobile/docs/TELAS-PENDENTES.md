# Inventário de telas e plano de implementação mobile

Levantamento local em **7 de novembro de 2026**. Fonte de verdade: rotas `frontend/src/app/**/page.tsx`, entradas `mobile/app/`, telas em `mobile/src/features/`, contratos e serviços citados abaixo. Este é o inventário de cobertura de telas; o [plano principal](IMPLEMENTACAO.md) e suas partes continuam sendo a referência técnica de execução. Não substitui auditoria de cada endpoint antes da integração.

## Incremento iniciado em 7 de novembro de 2026

A Fase 1 já possui seu recorte funcional: Agenda com consulta/detalhe/criação/edição/situação, navegação protegida, perfil mínimo, busca de entidades, contexto de fazenda, fuso organizacional em “Hoje” e prioridades da Home independentes do financeiro. Consulte [entregas, limites e validação](partes/05-08-PRIMEIRO-APP.md#complemento-funcional-da-fase-1--7-de-novembro-de-2026). Homologação com dados reais e em Android/iOS continua pendente. Edição completa de perfil, responsáveis e lembretes permanecem no web; módulos de domínio não foram antecipados. O inventário abaixo preserva a linha de base do levantamento: os itens implementados devem ser avaliados com esta atualização, e não contados novamente como ausentes.

## Incremento de 23 de novembro de 2026 — padrão nativo e novos módulos

**Padrão de interação.** Kit em `src/components/mobile` (linha tocável, busca com debounce, chips, folha inferior, indicadores que filtram, ficha com métricas, rolagem contínua com puxar para atualizar, estados vazios/erro/carregando, seletor em tela cheia). Aplicado a Estoque (lista, ficha, lotes, movimentações), Leite e tanques (movimentos e qualidade), Rebanho de corte e leiteiro (lista, ficha com linha do tempo, pastos, ocupações, manejos, operações, reprodução, protocolos), Trato, Clínica, Notificações, Suínos (fases e ficha), Veterinário (curral), Perfil, Fazendas e Busca, além dos seletores usados pelos formulários. Todas as telas secundárias e formulários passaram a usar o cabeçalho e a barra inferior do `WorkspaceShell` (`workspace/AppShell`).

**Novos módulos nativos** (mesmos endpoints e permissões do web):

| ID | Entregue no app | Continua no web |
| --- | --- | --- |
| F01–F03 | Painel (saldo, a receber/a pagar, realizado, fluxo de 30 dias, maiores despesas, projeção 7/30/90 dias), títulos a receber/pagar com filtros, ficha com histórico de baixas, novo título essencial, baixa integral e estorno com chave de idempotência e revalidação | Contas bancárias, categorias, parcelamento/recorrência, vínculo com lote/plantação, exportação, edição/exclusão de título |
| P01–P04, P06 | Segmento completo: visão geral (dashboard de plantações), lista, ficha com indicadores/resultado e histórico; cadastro e edição de plantação; lançamento de plantio, adubação, defensivos, irrigação, preparo do solo e colheita (parcial/total, venda só com acesso financeiro), pelos mesmos endpoints do web — o servidor baixa estoque, calcula custo e sincroniza o financeiro (`finance_sync`) | Fertirrigação, análise de solo, recomendações do agrônomo, mão de obra, estrutura do setor, vendas de safra avulsas, edição/exclusão de operações |
| T01–T02 (consulta) | Lista por categoria/busca/fazenda e ficha com manutenção e itens; valores só com acesso financeiro | Cadastro, edição e itens |
| U04 | Lista de chamados, abertura, conversa com resposta, resolver/fechar/reabrir. **Anexos (27/11/2026):** abrir anexos baixados com autorização (folha de compartilhamento do sistema) e anexar foto da câmera, imagem da galeria ou arquivo às próprias mensagens, com os limites do servidor (10 MB, 5 por mensagem, formatos aceitos) e nova tentativa com a mesma chave | — |
| I01 | Conversas, nova conversa com sugestões, chat com cota e mensagens de segurança | Feedback de respostas |

| B10 | Vendas de animais: histórico, venda total/parcial do lote por kg vivo ou arroba de carcaça, descontos e vencimento do recebível; acesso pela ficha do lote e pelas rotinas | Baixas por morte/descarte e estorno de venda |
| Q01 | Central com estoque baixo, validade de lotes e inventário do rebanho | Relatório geral, indicadores de lote, produtividade e exportações PDF/Excel |
| U05 (consulta) | Diretório da equipe (perfil, situação, busca, filtros) | Convites e alterações de acesso |
| U06 | Configurações da organização | Dados (edição pelo administrador), faturas do plano e pagamento. **Assinatura (27/11/2026):** composição do valor (segmentos ativos, descontos por segmento e da assinatura, total mensal e anual) e aplicação de cupom pelo administrador. Pendente: contatos/endereços, troca de segmentos e idioma organizacional (web) | Fase 5 · P13 |

Agenda: lista e ficha alinhadas ao padrão (cabeçalho com “+ Nova atividade”, atalho “Hoje”, filtros, linhas por domínio, puxar para atualizar), mantendo calendário e restauração de contexto. Também foram convertidos Ração (fórmulas/produções), Evolução do leite, Custos do rebanho, histórico de trato leiteiro, Veterinário (animais, rebanho, relatório, clientes e cobrança) e os seletores de participantes de pesagem, sanitário e castração.

Pendente: seletores internos de ocorrência, classificação, protocolos, ocupações, cobertura, vacinação, medicação, trato leiteiro e produção de ração ainda usam paginação “Anterior/Próxima” (funcionais, dentro do shell). Homologação em aparelhos Android/iOS continua pendente para todo o incremento.

## Início da Fase 2 — consulta do rebanho

Implementados primeiro recorte de animais/lotes de corte e leite, busca/filtros/paginação, ficha operacional e histórico de animal sob demanda. B01 tem a visão inicial; B04 tem lista/ficha, formulário essencial e transferência entre lotes, com expansão na Fase 4. B02 tem sua consulta nativa. B03 agora possui cadastro/edição essencial de animal e B05 registro de pesagem de animal/lote. L01 agora tem resumo diário, listas e lançamento/correção individual e total. O complemento agora entrega visão remota do rebanho, cadastro/edição essencial de lotes e transferência online de composição entre lotes, com prévia, seleção de identificados e confirmação idempotente. Campos avançados, histórico completo de lote/pesagens, baixas/vendas e lançamentos/cancelamentos de tanques e registro de qualidade continuam pendentes; cabeçalho/menu compartilhado já atende Home, Agenda, corte/leite e produção de leite, preservando navegação de retorno em fichas/formulários. [Evidências e limites](partes/05-08-PRIMEIRO-APP.md#primeiro-recorte-de-consulta-bovina--7-de-novembro-de-2026). A linha de base abaixo não deve ser interpretada como ausência dessas consultas já entregues.

A navegação principal usa `WorkspaceShell`, com acesso por perfil, área ativa e seletor de módulos/novo registro. [Escopo e validação](partes/05-08-PRIMEIRO-APP.md#navegação-compartilhada-das-áreas-principais--7-de-novembro-de-2026). O primeiro incremento da Fase 3 já entrega consulta de estoque, conforme a atualização abaixo.

## Início da Fase 3 — consulta de estoque

Entregues resumo operacional, produtos com busca/categoria/situação/paginação, ficha e lotes/validade sob demanda, alertas não resolvidos e fornecedores com busca/ficha/contatos. A busca geral abre produtos no app. Consulta por organização, sem filtro fictício de fazenda; sem custos na projeção operacional. E01 é o primeiro recorte de resumo/alertas; E02 tem consulta/ficha e cadastro/edição essencial de produtos, preservando unidade/categorias na edição. E04 inclui cadastro/edição de fornecedores ativos com contatos/endereços e proteção de versão. Campos técnicos, imagens e inativação permanecem no web. E03 já tem histórico/detalhe de movimentos, ficha de lote e contagem física online com ajuste auditado. Entrada sem compra, saída e compra recebida com título pendente já têm prévia assinada e confirmação atômica. Fórmulas têm lista/ficha e cadastro/edição essencial; produção de ração tem histórico/ficha e revisão/confirmação atômica, em `/feed`. Trato diário tem lista/histórico do dia e fornecimento nativo com reconciliação pela mesma chave, incluindo entrada direta do feeder. Notificações já têm inbox/detalhe/leitura/arquivamento e preferências nativas; push nativo e complementos de comunicação permanecem pendentes; pagamentos/correções/baixas especiais permanecem no web. O incremento de formulários já está disponível em `/inventory/form`, com revalidação de acesso, proteção de versão e conferência após resultado incerto. O complemento de movimentos inclui filtros/paginação, origem, contagem revisada e bloqueio após conflito ou resultado incerto. A Fase 3 não está concluída. [Escopo, validação e limites](partes/09-13-MODULOS.md#primeiro-incremento-da-fase-3--consulta-de-estoque-7-de-novembro-de-2026).

## Ajuste obrigatório — clínica web removida (21 de novembro de 2026)

A clínica veterinária do web foi removida e substituída pela **Área do veterinário** (`/home/veterinario`, segmento contratável). O backend deixou de ter doenças, sintomas, estoque próprio de medicamentos e alertas sanitários, e `livestock/clinical/records/mobile*` passou a aceitar só `kind=health` e `kind=vaccinations` (padrão `health`). A escrita de ocorrência clínica (`POST livestock/clinical/records/`) não existe mais. Reprodução e Sanidade continuam nos segmentos.

O app ainda usa o contrato antigo. Até este ajuste, o módulo Clínica **quebra** no aparelho:

| Ponto no app | Comportamento atual | Ajuste necessário |
| --- | --- | --- |
| `ClinicScreens.tsx`: painel abre com `kind='clinical'` | API responde 400 e a tela mostra erro | Padrão `health`; `clinicKinds` só com `health` e `vaccinations` |
| Abas "Ocorrências" e "Alertas" do painel | 400 | Remover as abas, os textos e os campos `severity`/`status`/`disease`/`affected_*` da ficha |
| `ClinicFormScreen.tsx` e rota `/clinic/form` (nova ocorrência) | Seletor usa `kind='clinical'` (400) e o POST não existe | Remover a tela, a rota, o botão "Novo" da ficha e as mensagens; manter `/clinic/health-form` |
| Histórico do animal (`/clinic/history`) com padrão `kind='clinical'` | 400 | Padrão `health` |
| `clinicOptions`: `record_types`, `severities`, `outcomes` | Chegam vazios | Remover o uso e os tipos em `contracts.ts` |
| "Abrir no web" (`openClinicWeb`), atalho `clinic` da Home e origem `/home/clinico` nas notificações | `/home/clinico` redireciona para `/home/veterinario`, que só abre com o segmento contratado | Apontar exames/vacinas para a rota do segmento correspondente e tratar `/home/veterinario` como destino web |
| Vacinação, exames/tratamentos e medicamento bovino (`mobile-medication-*`, lotes do estoque geral) | Continuam funcionando | Nenhum, além de homologar após o ajuste |

Cargo **Veterinário**: o login do app precisa tratar `role=veterinarian` como sem acesso aos módulos operacionais (ele vê só a Área do veterinário no web, e as espécies liberadas pelo admin em `allowed_livestock`). A Área do veterinário nativa (clientes, atendimentos, alertas de curral, cobrança e rebanho da fazenda) entra como item **VT01** do backlog, depois do ajuste acima; o contrato está em `backend/apps/veterinary` e em [docs/ai/api.md](../../docs/ai/api.md).

**Aceite:** nenhuma chamada com `kind=clinical`/`alerts` ou POST de ocorrência; painel, ficha, histórico e formulários de exame e vacina abrindo sem erro; testes de contrato atualizados; `npm run typecheck`, `npm run lint` e testes de `mobile/` passando; verificação em Android/iOS.

**Aplicado em 22 de novembro de 2026 (código):** `clinicKinds` ficou só com `health` e `vaccinations` (padrão `health` no painel, na ficha e no histórico); a tela e a rota `/clinic/form`, `createClinicRecord` e `ClinicSaveUnconfirmed` foram removidas; o seletor de animal passou para `AnimalPicker.tsx`; o atalho "+" e o `nativeDestination('clinic', true)` abrem `/clinic/health-form`; "Abrir no web" usa `clinicWebPath` (segmento da espécie). O cargo `veterinarian` é aceito no login e fica sem módulos operacionais (`canOpenModule`, clínica, rebanho, agenda, busca e trato); quem tem a Área liberada vê na Home o cartão "Área do veterinário", que abre o web até o VT01. Validado: `npm run typecheck`, `npm run lint`, `npm test` (543/544; a falha `shared navigation keeps native routes distinct…` já existia) e `expo export` Android e iOS. **Pendente:** verificação em aparelho/simulador Android e iOS.

## Como usar este inventário agora

Este arquivo organiza cobertura e lacunas por tela/domínio; a [ordem ativa de execução](IMPLEMENTACAO.md#ordem-atual-de-execução) fica no plano principal. A próxima entrega consolida a Agenda como referência de experiência, confere os contratos atuais de leite e homologa as jornadas existentes. As fases abaixo agrupam escopo; não são uma instrução para recriar os fluxos já implementados.

## 1. O que existe hoje

| Área | Situação real | Pendência |
| --- | --- | --- |
| Inicialização e sessão | Loading, restauração, indisponibilidade, nova tentativa e logout implementados | Homologação nativa Android/iOS, retomada e expiração em aparelho |
| Login por e-mail | Formulário e integração implementados; manter conectado disponível | Homologação ponta a ponta e acessibilidade nativa |
| Cadastro | Formulário integrado, alternância com login e mensagens por campo | Homologar criação real e retorno ao login em ambos os SOs |
| Recuperação de senha | Solicitação por e-mail implementada | Validar conclusão do fluxo oferecido pelo servidor; não presumir reset nativo por token |
| Troca obrigatória de senha | Formulário integrado implementado | Homologar conta com troca obrigatória |
| Google | Componentes e integração previstos no código, com alternativa web/nativa | Configuração pública por ambiente e prova em development builds Android/iOS; não considerar pronto apenas porque o botão aparece |
| Home | Resumos remotos, prioridades operacionais independentes, atalhos por acesso, fazenda e seleção de período | Consolidar hierarquia e caminhos para as operações; homologar a jornada por perfil |
| Agenda | Mês/Semana/Lista, consulta, detalhe e formulário/situação de tarefa implementados | P05.11–P05.14: conferir dados/paginação, retorno, origem operacional, textos e acessibilidade |
| Contexto, busca e perfil | Contexto de fazenda, busca de entidades e perfil mínimo nativos | Homologar os recortes e ampliar campos/destinos somente quando o contrato permitir |
| Navegação e módulos | Shell e rotas de Agenda, bovinos/leite, estoque, alimentação, clínica, notificações e áreas pessoais | Padronizar jornadas; suínos têm recorte nativo parcial (S01/S02); Financeiro, plantações e outros destinos ainda dependem do web nos recortes não implementados |
| Termos e Privacidade | Links abrem as páginas públicas no navegador | Manter conteúdo único e fallback de abertura; leitura nativa é opcional, não bloqueia o piloto |

Evidências atuais, relativas a `mobile/`: `app/_layout.tsx`, `app/agenda/`, `app/(workspace)/`, `src/features/workspace/navigation.ts`, `src/features/workspace/WorkspaceShell.tsx`, features de autenticação/Home/Agenda e `src/services/authApi.ts`. As rotas e contratos atuais prevalecem sobre a linha de base do levantamento inicial. A existência de uma pasta ou tela não comprova todo o aceite de um domínio.

## 2. Escopo e critérios de contagem

- Uma rota web pode conter abas, detalhes e formulários em modais. A tabela de backlog inclui esses fluxos: contar apenas arquivos `page.tsx` subestimaria o trabalho.
- Corte e leite usam componentes compartilhados, mas devem manter entradas, contexto e regras distintos. Reutilização de componentes não dispensa homologação de cada produção.
- Rotas antigas de bovinos e aliases não exigem telas duplicadas. Resolver links antigos para o destino canônico autorizado.
- `/platform` entra como **Fase 7 — Backoffice da plataforma** (ver seção abaixo), restrito à equipe interna. Marketing, páginas SEO, blog, demonstração, calculadora pública e portal de afiliados não são requisitos do aplicativo operacional; manter acesso web quando necessário.
- Aves possui rotas e componentes web, mas permanece fora da primeira entrega mobile enquanto não houver confirmação de disponibilidade comercial e operacional. Registrar como condicional, sem anunciá-lo como pronto.
- Cada ID agrupa cobertura e lacunas: ler os incrementos e a descrição da linha, distinguindo código existente, validação técnica e aceite nativo. A presença no backlog não significa ausência de implementação. Fase agrupa escopo; a ordem ativa fica no plano principal, sem prazo prometido.

## 3. Backlog de telas e fluxos

Em cada linha, entregar consulta antes de escrita quando houver risco de estoque, financeiro ou transição de estado. “Cadastro/edição” exige levantamento dos campos e ações realmente permitidos no contrato; não cria automaticamente exclusão ou novas permissões.

| ID | Telas/fluxos pendentes | Conteúdo e ações | Dependências / parte |
| --- | --- | --- | --- |
| N01 | Navegação autenticada | Pilhas e abas; Módulos; Novo registro contextual; voltar preservando filtros; destino indisponível e deep link autorizado | Fase 1 · P03–P04 |
| N02 | Contexto e acesso | Seleção de fazenda quando aplicável ao contrato; identificação da organização; acesso negado e somente leitura | Fase 1 · P03–P04 |
| N03 | Busca global | Resultados por animal, lote, plantação, item e estrutura; paginação por domínio; busca de módulos atual não atende este fluxo | Fase 1/expansão por domínio · P05/P06 |
| H01 | Home operacional | Prioridades/tarefas e detalhes; atalhos reais; estados por bloco; manter resumo financeiro já existente sem expor valores a outros perfis | Fase 1 · P05 |
| A01 | Agenda | Mês/Semana/Lista implementados; consolidar seleção, filtros, paginação, indicadores e abertura da origem conforme P05.11–P05.14 | Fase 1 · P05 |
| A02 | Tarefa: detalhe, criar e editar | Data, prioridade, responsável e estado conforme contrato; conclusão/cancelamento apenas quando permitido | Fase 1 · P05 |
| B01 | Hub de corte / hub leiteiro | Visão por produção e indicadores remotos sem calcular por página parcial. Entrada leiteira `/cattle/dairy` reorganizada em Visão geral/Rebanho/Rotinas, com leite do dia, composição visual, cartões de ficha e ações agrupadas; homologação Android/iOS pendente. | Fase 2 · P06/P07 |
| B02 | Rebanho: lista e ficha | Busca, filtros, histórico, situação e ações autorizadas; separar corte/leite | Fase 2 · P06 |
| B03 | Animal: cadastro e edição | Identificação, sexo, raça, datas e vínculos exigidos; ficha técnica como detalhe nativo | Fase 2 · P06 |
| B04 | Lotes: lista, detalhe, formulário e movimentação | Composição, origem/destino e histórico; confirmar efeitos e concorrência | Fase 2/4 · P06 |
| B05 | Pesagens | Lista, evolução, registro e edição autorizada; unidade e data | Fase 2 · P06 |
| B06 | Manejos e operações | Consulta gerencial de manejos implementada: lista/ficha, filtros, participantes paginados e contagens de segmentos; cadastro de rascunho de pesagem implementado; confirmação de pesagem com revisão implementada; edição/cancelamento de rascunhos de pesagem implementados; cadastro de rascunho de castração implementado; confirmação de castração com revisão implementada; edição/cancelamento de rascunhos de castração implementados; resolução de retornos sanitários implementada; cadastro de rascunho sanitário documental implementado; confirmação sanitária documental implementada; manutenção sanitária documental implementada; rascunho de medicação coletiva com estoque implementado; confirmação da medicação coletiva implementada; edição/cancelamento de rascunhos de medicação coletiva implementados; consulta de operações (ocorrências/classificação/transferências) implementada; cadastro/resolução de ocorrências implementados; alteração de finalidade individual/lote com revisão implementada; consulta de protocolos e etapas implementada; início de protocolo com revisão e tarefas atômicas implementado; execução documental de etapas implementada; vínculo de cobertura existente e consumo revisado de sêmen implementados; cadastro/versionamento de modelos implementado; prévia CSV de importação implementada; confirmação revisada da importação implementada; seleção de arquivo CSV integrada (homologação nativa pendente); evolução do leite implementada; apuração de custos implementada para consulta gerencial com autorização financeira | Fase 4 · P06/P10 |
| B07 | Sanidade | Histórico e lançamento vinculado; compartilhar componentes com clínica sem duplicar evento | Fase 4 · P10 |
| B08 | Reprodução | Painel/grupos/lista/ficha e histórico essenciais de consulta implementados para corte/leite; datas/previsões do servidor. Diagnóstico positivo/negativo implementado com revisão e cobertura/versionamento; cobertura natural/IA/IATF implementada com revisão e preservação de lactação; parto individual cria viva/natimorto implementado com revisão e finalidade explícita da cria; ações avançadas pendentes | Fase 4 · P06/P07 |
| B09 | Pastos e ocupações | Lista/ficha de consulta implementadas, com busca, fazenda e indicadores de ocupação do servidor; histórico/ficha de ocupações e link para lote implementados; entrada e saída gerenciais online implementadas com revisão; cadastro/edição gerenciais com versão implementados; transferência integral entre pastos da mesma fazenda implementada com revisão e confirmação atômica | Fase 4 · P06 |
| B10 | Vendas e baixas | Consulta/detalhe; criação, revisão e confirmação online com efeitos de rebanho e financeiro | Fase 5 · P06/P13 |
| B11 | Relatórios do segmento | Filtros, resumo e detalhe de corte/leite, exportação nativa autorizada | Fase 5 · P13 |
| L01 | Produção de leite | Resumo diário; lista; lançamento individual ou total; sessões, descarte e edição conforme contrato | Fase 2 · P07 |
| L02 | Tanque de leite | Lista/ficha de tanques e histórico/ficha de movimentos implementados: fazenda, situação, capacidade, saldo, observações, filtros de tipo/data e cancelados sem campos financeiros. Consulta de qualidade também implementada: histórico/ficha, data, amostra, temperatura, gordura/proteína, CCS/CBT e antibióticos. Cadastro/edição essencial implementados para gerente/admin: fazenda fixa, versão, capacidade protegida pelo histórico e resposta incerta sem replay. Formulários online de entradas/coletas operacionais/descartes, cancelamento com motivo e registro de qualidade implementados com revisão, recibo e bloqueio de resultado incerto. Valores/receitas e cancelamentos de movimentos financeiros permanecem no web. Pendentes integração no ambiente de uso, recuperação durável após encerramento e homologação Android/iOS. | Fase 4 · P07 · parcial |
| R01 | Ração: visão e fórmulas | Lista/busca, detalhe e cadastro/edição essencial implementados; produtos em kg, espécie e percentuais. Homologação pendente | Fase 3 · P09 |
| R02 | Produção de ração | Edição e cancelamento com confirmação disponíveis nas produções com movimentos rastreáveis no Web e no Mobile. Alteração de data também disponível para registros antigos.  Histórico/detalhe e produção online com prévia dos insumos/lotes e confirmação atômica implementados. Homologação pendente | Fase 3 · P09 |
| R03 | Tratos diários | Lista/histórico do dia e fornecimento online implementados; operador com o segmento de gado de corte ou pecuária leiteira registra os tratos (o cargo Tratador foi extinto em 24/11/2026) e reconciliação com a mesma chave. Concorrência PostgreSQL validada; homologação nativa pendente | Fase 3 · P09 |
| E01 | Estoque: resumo e alertas | Indicadores, itens abaixo do mínimo, filtros e abertura do item | Fase 3 · P09 |
| E02 | Produtos: lista, detalhe, cadastro e edição | Saldo, unidade, histórico e dados autorizados do produto | Fase 3 · P09 |
| E03 | Movimentações e ajustes | Listagem/detalhe; entrada, saída e ajustes somente se disponíveis e autorizados; justificativa e revisão | Fase 3 · P09 |
| E04 | Fornecedores | Lista, detalhe e cadastro/edição conforme API | Fase 3 · P09 |
| C01 | Clínica: painel e histórico | **Ajuste obrigatório** (ver "clínica web removida"): ocorrências e alertas saíram do backend; manter só exames/tratamentos e vacinas, com contexto UUID/fazenda/espécie. Campos avançados pendentes | Fase 4 · P10 |
| C02 | Exames, vacinação e medicamentos | Ocorrência clínica individual **removida** (sem contrato no backend). Vacina individual/lote com revisão e baixa de estoque, exames/tratamentos documentais e aplicação individual de medicamento bovino com estoque/carência continuam; demais espécies, campos avançados, anexos e correções pendentes | Fase 4 · P10/P14 |
| VT01 | Área do veterinário | **Recorte 1 (22/11/2026):** Alertas e lista de curral em `/veterinary` (consulta, sem valores de cobrança). **Recorte 2 (22/11/2026):** Lançar atendimento em `/veterinary/launch` (online): cliente ou novo cliente, data, responsável da equipe ou digitado, animal com consulta ao servidor; retirada do dispositivo (D8/D9), inseminação do IATF, diagnóstico prenha/vazia com conduta (protocolo IATF, observar cio, indução, descarte) e confirmação de prenhez com os dados do protocolo; um envio por vez, sem repetição automática; resultado desconhecido bloqueia novo envio até conferir a lista. Contrato coberto por `backend/apps/veterinary/tests/test_mobile_contract.py` com envios gerados pelo app. **Recorte 3 (22/11/2026):** Animais em `/veterinary/animals` (filtros por cliente, situação, categoria e busca; lançar a partir do animal) e Histórico em `/veterinary/animal` (todos os procedimentos, sem valores, com marcação "No rebanho"). Acesso: segmento contratado + admin, gerente ou veterinário. **Recorte 4:** diretório de clientes com busca e contato e consulta de cobrança mensal por cliente, incluindo atendimentos pagos e pendentes. **Recorte 5:** cadastro e edição de nome, fazenda em texto e telefone, com proteção de edição concorrente. Baixa online por cliente e mês, com revisão de quantidade e valor, versões dos atendimentos e sincronização financeira quando habilitada. **Recorte 6:** rebanho da fazenda paginado com histórico somente leitura e relatório consultável por procedimento ou animal. **Recorte 7:** vínculo opcional de cliente a uma fazenda da organização, finalidade do rebanho e exclusão de cliente sem atendimentos. Pendentes: exportações do relatório, insumos, anexos e rascunho offline | Após Fase 4 · contrato `apps/veterinary` |
| S01 | Suínos: hub, inventário e fichas | Hub e listas paginadas por fase com cartões compactos e resumo por toque (dados da lista); ficha completa com fazenda e históricos e pesagem média online revisada para lotes ativos em creche/crescimento/engorda. Previsões identificadas como estimativas; listas abrangem a organização. Cadastro/edição e demais ações pendentes; testes e homologação nativa adiados | Fase 4 · P11 · parcial |
| S02 | Suínos: reprodução e transições | Cobertura, diagnóstico e parto online revisados, vinculados a matriz/cobertura/gestação e com sequência, versões e histórico validados no servidor; o parto cria o lote de maternidade. Desmame total, perda gestacional e transferência integral entre creche, crescimento e engorda implementados. Coleta de sêmen em Reprodutores segue no Web. Na futura tela nativa, o seletor de componentes deve consultar produtos ativos da categoria Doses / Sêmen (`categoria=semen`). Desmame parcial disponível no Web e no Mobile. A leitegada continua na maternidade com o saldo restante até o desmame total. Homologação nativa pendente | Fase 4 · P11 · parcial |
| S03 | Suínos: vendas e mão de obra | Venda parcial e integral disponível na ficha do lote, com atualização de saldo e título a receber pendente. Central de vendas nativa para admin/gerente, com venda de animais e de doses de sêmen. A venda de doses baixa o saldo do lote de coleta e cria título a receber pendente pelo mesmo contrato do Web. Encerramento de saldo disponível na ficha. Pendentes descarte e mão de obra. A futura tela de mão de obra deve compartilhar a validação de animais por data e as ações de edição e cancelamento do Web, que preservam o histórico financeiro | Fase 5 · P11/P13 |
| S04 | Suínos: ração e fórmulas | Reaproveitar R01/R02 apenas nos contratos suportados pela espécie | Fase 4 · P09/P11 |
| P01 | Plantações: lista e detalhe | Fazenda/área/ciclo real; situação, indicadores e atividades autorizadas | Fase 4 · P12 |
| P02 | Plantação: cadastro e edição | Campos do ciclo e vínculos previstos no serviço; validação de área/unidades | Fase 4 · P12 |
| P03 | Preparo, sementes e adubação | Histórico/detalhe/formulário por atividade; revisão de insumos e data | Fase 4 · P12 |
| P04 | Defensivos, irrigação e fertirrigação | Histórico/detalhe/formulário; dose versus quantidade total, unidades e impactos | Fase 4 · P12 |
| P05 | Agrônomo, estrutura e mão de obra | Listas/vínculos/detalhes/formulários equivalentes, conforme acesso e contratos | Fase 5 · P12 |
| P06 | Colheita e histórico | Registro e consulta autorizados, produção e custos; filtros e rastreabilidade | Fase 5 · P12 |
| T01 | Estruturas: diretório e lista | Propriedade, curral, chiqueiro, galinheiro, armazém, instalação, reservatório, cerca, irrigação, máquinas e outros. O relatório geral segue o Web com uma linha por estrutura, área construída, quantidade e valor total. Itens e ações ficam nas telas específicas. | Fase 5 · P13 |
| T02 | Estrutura: ficha, cadastro e edição por tipo | Formulários específicos, vínculos e ações efetivamente disponíveis em farmStructureService/farmAssetService. Desde 23/11/2026 o cadastro web de estruturas não pede valor pago/atual (campos mantidos no servidor) e traz comprimento e largura no bloco principal e área construída ao final. No cadastro, calcular a área em m² com largura × comprimento, a duas casas decimais, quando ambas as dimensões estiverem preenchidas. Com dimensões incompletas, permitir informar a área manualmente; o custo exibido é o de itens e serviços. Máquinas mantêm os valores | Fase 5 · P13 |
| F01 | Financeiro: painel e projeção | Resumo, período, projeção do servidor e filtros; não considerar os KPIs da Home como módulo completo | Fase 5 · P13 |
| F02 | Financeiro: títulos e lançamentos | Listas a pagar/receber conforme abas reais; detalhe, histórico, criação/edição autorizada | Fase 5 · P13 |
| F03 | Financeiro: liquidação, estorno e configurações | Ações online separadas; confirmar valores e efeitos; parametrizações apenas existentes | Fase 5 · P13 |
| Q01 | Central de relatórios | Rebanho, plantações, estoque e financeiro; filtros, resultados e arquivo compartilhável | Fase 5 · P13/P14 |
| U01 | Perfil e segurança pessoal | Consultar/editar campos permitidos, foto se suportada, trocar senha, informações da sessão e logout | Fase 1/5 · P13 |
| U02 | Notificações e alertas | Inbox paginada, detalhe, leitura, arquivamento/restauração e origens permitidas implementados; atalho de alertas de estoque. Painel reprodutivo consolidado e mídia comercial permanecem web | Fase 3 · P15 |
| U03 | Preferências de notificações | Preferências da conta implementadas com alterações parciais, versão e conferência após resultado incerto. Permissão/registro push nativo seguem separados | Fase 3/6 · P15 |
| U04 | Suporte e chamados | Central, lista, criação, detalhe/conversa, respostas e anexos; preservar chaves/versão do contrato | Fase 5 · P13/P14 |
| U05 | Usuários e convites | **Implementado (26/11/2026):** lista com busca/filtros; criar, editar dados, cargo (admin, gerente, operador, veterinário), segmentos liberados (contratados e ativos; Área do veterinário opcional para o operador e incluída no cargo do veterinário), somente consulta, desativar/reativar — somente o administrador, com o usuário revalidado antes de cada escrita. Pendente: aceitar convite por link e homologação em aparelho | Fase 5 · P03/P13 |
| U06 | Configurações da organização | Dados, contatos/endereços, membros, assinatura, segurança e preferências; idioma organizacional restrito; verificar ações web disponíveis | Fase 5 · P13 |
| I01 | Assistente IA | Conversa, histórico quando suportado, contexto explícito, limites, cancelamento e falha online | Fase 5 · P13 |
| O01 | Downloads, rascunhos e sincronização | **Rascunhos locais (27/11/2026):** SQLite (`expo-sqlite`) com migração versionada; um rascunho por ambiente/usuário/organização/formulário/contexto, sem token; salvamento ~0,8 s após cada alteração com indicador; restauração com aviso e descarte; versão do formulário conferida antes de reaplicar; limite de 64 KB, 50 por conta e expiração em 30 dias com aviso; central `/drafts` (retomar/descartar, inclusive trocando para a fazenda do rascunho); envio sem resposta marca o rascunho como "envio não confirmado". Sair voluntariamente avisa e apaga os rascunhos da conta; sessão expirada os mantém para o mesmo usuário. Formulários: cadastro de animal, produção de leite individual/total e pesagem (só criação), trato diário (produto/fórmula, quantidade e observação; revisão, chave e envio seguem online) e abertura de chamado (guarda a chave de criação, reenvio sem duplicar). Pesagem guarda a versão de cada animal: mudança no servidor aparece como conflito no envio; pesagens acima de ~300 animais excedem 64 KB e voltam a pedir confirmação ao sair. **Consulta sem rede (27/11/2026, política aprovada):** sem conexão, o app abre a última sessão confirmada pelo servidor nas últimas 24 h, somente consulta (envios e leituras recusados antes de sair do aparelho), com aviso "Sem conexão · somente consulta", horário da última confirmação e "Tentar conectar" (também ao voltar ao primeiro plano e a cada 60 s, sem desmontar as telas). Resultados salvos ao consultar com conexão, por conta: rebanho (lista, ficha, histórico, visão geral e leite do dia), agenda e opções, estoque (resumo, itens, ficha e lotes; fornecedores não), lotes e trato do dia, fazendas e perfil; mesma checagem de permissão do online; formato por versão do app, 72 h de retenção, 300 resultados por conta; sair da conta apaga sessão salva e resultados. **Download antecipado (27/11/2026):** ao entrar com conexão (no máximo a cada 30 min), opções da agenda, fazendas e agenda dos próximos 14 dias de todas as fazendas (até 300 eventos, sem registrados); offline, a agenda sem resultado exato salvo é montada dessa janela com as regras de `apps/tasks/agenda.py` (domínio, fazenda com itens da organização, sem alertas do veterinário com fazenda, ordem dia/tipo/origem, 25 por página). Pendente: download do rebanho e do estoque (hoje só o que foi aberto), horário por tela, demais formulários (sanitário, castração, vacinação, plantações, estoque), criptografia dos rascunhos em repouso, fila de envio (Parte 16, fora do escopo inicial) e homologação Android/iOS | Fase 6 · P08/P16 |
| O02 | Captura e anexos | **Primeiro consumidor (27/11/2026):** chamados do cliente e da equipe — câmera (permissão pedida só no uso, alternativa pela galeria quando negada), galeria pelo seletor do sistema, arquivo, validação local, envio com estado e nova tentativa idempotente, abertura autorizada. `expo-image-picker` (sem microfone) e `expo-sharing` adicionados. Pendente: prévia da imagem antes do envio, anexos em outros módulos (veterinário, clínica) e homologação Android/iOS; scanner/localização só com caso de uso validado | Fase 6 · P14 |
| O03 | Sobre e ajuda de acesso | **Implementado (27/11/2026):** tela `/about` (versão, sistema, servidor, ambiente, Termos, Privacidade, Licença e ajuda para entrar), acessível pelo login, Perfil e backoffice. Desbloqueio opcional por biometria (`expo-local-authentication`) ativado no Perfil/backoffice após confirmar a biometria; preferência por usuário e ambiente no armazenamento seguro; trava ao restaurar a sessão e ao voltar após 2 minutos (até 10 minutos quando o próprio app abriu câmera, galeria, arquivo ou compartilhamento); alternativa pela senha do aparelho ou novo login. Não estende a validade da sessão. Com o desbloqueio ativo, o conteúdo é coberto enquanto o app não está em primeiro plano (miniatura do seletor de apps no iOS). Pendente: no Android a miniatura pode ser capturada antes da cobertura (exigiria `FLAG_SECURE`, que também bloqueia capturas de tela) e homologação Android/iOS | Fase 6 · P14/P17 |
| V01 | Aves: cadastro, reprodução, ração e fórmulas | Condicional: auditar maturidade e oferta antes de desenhar/copiar o fluxo web; não entra no piloto | Fora do piloto |

## 4. Sequência executável por entregas

### Fase 1 — App navegável e rotina diária (N01–N03, H01, A01–A02, U01 inicial)

1. Conferir os grupos autenticados existentes, restauração, senha obrigatória, contexto e bloqueios; não reinicializar o projeto.
2. Consolidar Agenda Mês/Semana/Lista, alvos de toque e hierarquia do conteúdo. Testar período com mais eventos que uma página, sem inferir vazio/contagem completa de uma página parcial.
3. Fechar atividade → detalhe → operação autorizada → retorno à seleção anterior; identificar a alternativa web para destinos sem fluxo nativo.
4. Rever prioridades e atalhos da Home, busca e perfil mínimo já existentes, preservando estados independentes e acesso por perfil.
5. Homologar a jornada em Android/iOS, com teclado, fonte ampliada, retomada, rede ruim e resultado incerto.

**Aceite:** entrar → consultar Agenda → abrir atividade/operação → voltar ao mesmo contexto; perfil sem acesso não consulta a origem. Aparência da Agenda não comprova resolução de paginação, acessibilidade ou destinos nativos.

### Fase 2 — Primeiro fluxo bovino/leiteiro (B01–B05, L01)

1. Conferir as consultas, fichas e operações bovinas já existentes, preservando corte/leite, fazenda e permissões.
2. Aplicar a hierarquia da Agenda às listas, detalhes, filtros e ações; conservar seleção e entrada entre etapas.
3. Auditar P07.16: total diário versus total por período, novos contratos do backend e compatibilidade com o app. A planilha leiteira do web e os grupos de alimentação não equivalem a integração mobile concluída.
4. Homologar leite individual/total, lote, pesagem e transferência com revisão, efeitos e conferência após resposta incerta.
5. Priorizar os complementos restantes pelo piloto; não recontar consultas/formulários já entregues como ausência de todo o domínio.

**Estado:** recortes funcionais online existem; campos avançados, complementos e aceite nativo continuam específicos por fluxo. O próximo incremento é consolidação e compatibilidade, não a construção de outro primeiro app.

**Aceite:** localizar animal → executar operação permitida → consultar confirmação no app e web. Não representar um total por período como um único dia nem criar dupla contagem de leite.

### Fase 3 — Trato, estoque e comunicação (R01–R03, E01–E04, U02–U03)

1. Consulta de produtos/saldos/alertas/fornecedores.
2. Fórmulas e produção de ração com consulta/cadastro/edição essencial e revisão/confirmação atômica implementados; entradas/saídas/ajustes também disponíveis. Homologar o conjunto.
3. Tratos implementados para o operador com segmento bovino (o cargo Tratador foi extinto), sem conceder estoque geral/financeiro; backend HTTP real isolado e concorrência PostgreSQL validados; homologar aparelhos e piloto.
4. Inbox/detalhe/leitura/arquivamento e preferências da conta implementados; alertas de estoque com acesso nativo separado. Push, mídia de campanhas e complementos P15 seguem separados; homologar navegação/acessos.

**Aceite:** insumo e unidade corretos, estoque consistente após confirmação; negação de push não bloqueia notificações internas ou operação.

### Fase 4 — Demais rotinas de campo (B06–B09, L02, C01–C02, S01–S02/S04, P01–P04)

Clínica/sanidade iniciou com consulta essencial de quatro áreas e primeiro formulário de ocorrência individual (ocorrências e alertas saíram do backend em 21/11/2026; o formulário e as abas foram removidos do app no ajuste de 22/11/2026); vacinação individual/lote já possui formulário, revisão assinada, baixa de estoque e histórico de reconciliação somente leitura. Exames/tratamentos documentais já possuem formulário individual e reconciliação somente leitura. Aplicação individual de medicamento bovino com estoque/carência já está disponível a gerente/admin; demais espécies e ações permanecem pendentes. Reprodução bovina já possui painel/grupos/lista/ficha/histórico de consulta; diagnóstico positivo/negativo já possui revisão, controle de contexto e histórico de conferência; cobertura natural/IA/IATF já possui formulário/revisão/confirmação; parto individual cria viva/natimorto já possui formulário/revisão/confirmação atômica. Manejos/pastos e tanques também têm recortes implementados descritos no inventário. Homologar o conjunto e fechar as lacunas remanescentes; suínos já têm consulta, ficha e primeiras escritas (P11-A/B/C, testes e homologação pendentes); atividades agrícolas entram como fluxo vertical novo, conforme prioridade do piloto. Em cada domínio: lista → detalhe → primeira escrita → demais ações → histórico. Não reunir todos em um único PR ou condicionar publicação de um módulo à conclusão dos demais.

**Aceite:** associação correta a fazenda/animal/lote/ciclo; transições e consumos atômicos conforme servidor; previsões identificadas como estimativas. Cada módulo só aparece como nativo pronto após seu fluxo real ser homologado.

### Fase 5 — Gestão e paridade operacional (B10–B11, S03, P05–P06, T01–T02, F01–F03, Q01, U01 completo/U04–U06, I01)

Priorizar consulta financeira e relatórios; separar PRs de liquidação/estorno e demais escritas. Implementar estruturas por tipo, suporte com anexos, administração autorizada e IA. Convergir administração de membros presente em Usuários e Configurações em um fluxo móvel, preservando permissões e diferentes pontos de entrada.

**Aceite:** relatório corresponde aos filtros web; valores não são carregados para perfis proibidos; suporte preserva texto em conflito; IA não executa mutações de domínio implicitamente. Assinatura/pagamentos exigem revisão específica do fluxo de distribuição antes de compromisso com checkout nativo.

### Fase 6 — Recursos nativos, persistência e publicação (O01–O03; P08/P14–P17)

Começar por cache autorizado de leitura e rascunhos; versionar persistência e separar organização/usuário. Adicionar captura, compartilhamento, push e biometria conforme consumidores reais. Fila de escrita só por endpoint com idempotência/reconciliação comprovadas, não por botão geral “sincronizar”.

**Aceite:** logout/troca de contexto não expõe dados anteriores; recuperar rascunho sem confundir com registro confirmado; conflito não perde entrada. Validar Android/iOS, permissões negadas e aparelho de entrada. Qualidade nativa é contínua desde a Fase 1, não apenas uma tarefa final.

### Fase 7 — Backoffice da plataforma (/platform), solicitado em 24/11/2026

Somente para a equipe interna (`is_platform_staff`), com sessão própria (`/platform/me/`) e as mesmas permissões por papel do web (proprietário, administrador, suporte, auditor, desenvolvedor). Consome os endpoints `platform/*` existentes; nenhuma regra nova no app.

| Id | Tela | Conteúdo mínimo | Prioridade |
| --- | --- | --- | --- |
| PL01 | Entrada e visão geral | Login da equipe, KPIs (organizações, usuários ativos, MRR), pendências (chamados, faturas vencidas, organizações suspensas) | Alta |
| PL02 | Organizações | Busca e filtros em chips (estado, sem administrador, pendência financeira), lista em cartões | Alta |
| PL03 | Ficha da organização | Resumo, responsável, segmentos contratados e valor mensal, descontos (consultar/encerrar), suspender/reativar com motivo | Alta |
| PL04 | Usuários | Busca, ficha, editar dados e papel/segmentos, redefinir senha, bloquear/reativar, encerrar sessões | Alta |
| PL05 | Chamados | Fila e conversa (reaproveitar o suporte nativo), atribuição | Média |
| PL06 | Financeiro SaaS | MRR, faturas vencidas, registrar pagamento | Média |
| PL07 | Cupons e segmentos | Consulta; edição de preços fica no web | Baixa |
| PL08 | Auditoria e saúde | Últimas ações e estado dos serviços (somente consulta) | Baixa |

**Estado (27/11/2026):** PL01–PL04 implementados. O login da equipe abre uma sessão própria (`status: 'platform'`, sem organização) com rotas em `app/(platform)/platform/*`, shell com voltar/sair e as mesmas permissões do web (proprietário e administrador alteram; suporte, auditor e desenvolvedor consultam). PL03 cobre resumo, segmentos com valor mensal, descontos ativos (encerrar), suspender/arquivar/reativar com motivo; PL04 cobre busca, dados, papel e segmentos, redefinição de senha, encerrar sessões e bloquear/reativar. **PL05–PL08 (27/11/2026):** fila de chamados com assumir/liberar, mudança de situação e resposta pública ou nota interna (mesma chave para a mesma resposta); financeiro SaaS com MRR, recebido, saldo, faturas vencidas/abertas e registro de pagamento manual (proprietário/administrador); cupons e faixas de preço por segmento em consulta; saúde dos serviços (proprietário/administrador/desenvolvedor) e trilha de auditoria (proprietário/administrador/auditor). **Anexos e histórico (27/11/2026):** conversa completa com "carregar mensagens anteriores" e anexos (abrir e enviar, inclusive em nota interna) pelo mesmo bloco do suporte do cliente. Pendente: homologação em aparelho. Afiliado do portal continua sem acesso ao app.

Fora do app: SQL/sandbox/consultas aprovadas, atualização do sistema, gateways, IA, campanhas de marketing e exportação/recuperação de dados (ações sensíveis ou de tela grande).

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
| `/home/clinico/consultas` | Removida no web (redireciona para `/home/veterinario`); remover a ocorrência nativa (C01–C02) |
| `/home/clinico/exames` | C01–C02 · consulta/ficha e registro documental em `/clinic/health-form`; campos avançados/anexos/correções pendentes |
| `/home/clinico/medicamentos` | Removida no web (redireciona); medicamento bovino nativo usa lotes do estoque geral |
| `/home/clinico` | Removida no web (redireciona para `/home/veterinario`); ajustar links do app |
| `/home/veterinario` | VT01 · Alertas/curral, atendimento, animais, histórico, cadastro/edição de clientes e consulta/baixa de cobrança nativos. Rebanho e consulta de relatório nativos. Exportação e demais complementos seguem no web |
| `/home/clinico/vacinacao` | C01–C02 · consulta/ficha e aplicação essencial em `/clinic` (Vacinações) e `/clinic/vaccination`; correções pendentes |
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
| `/home/financeiro` | F01–F03 · recorte nativo em `/finance` (ver incremento de 23/11/2026) |
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

Seguir a [ordem atual de execução](IMPLEMENTACAO.md#ordem-atual-de-execução): consolidar Agenda e navegação operacional, conferir os contratos de leite alterados no backend/web e homologar a primeira jornada atual em Android/iOS. Os IDs de telas deste inventário alimentam os incrementos das partes, mas não criam uma segunda fila de prioridades.

A próxima demonstração deve mostrar **contexto → atividade/registro → operação autorizada → confirmação → retorno**, com dados corretos mesmo quando houver paginação, recuperação após erro e campos preservados. Só então ampliar os complementos escolhidos pelo piloto, sem refazer consultas e formulários já existentes ou declarar paridade a partir de layouts.
