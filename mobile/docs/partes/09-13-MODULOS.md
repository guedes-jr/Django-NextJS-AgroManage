# Partes 09 a 13 — Expansão por domínio

[Voltar ao plano](../IMPLEMENTACAO.md). Estas partes ampliam o produto após o primeiro fluxo completo. Podem ser reordenadas conforme o piloto, sem antecipar dependências de autorização, contrato ou armazenamento. Não é necessário concluir todos os domínios para publicar uma primeira versão útil.

**Situação de partida:** P09 já possui recortes de estoque, movimentos, fórmulas/produção e trato; P10 possui consulta clínica/sanitária e primeiras operações; perfil mínimo já existe. Os módulos de suínos, plantações e gestão não devem ser considerados nativos completos por aparecerem no menu. Priorizar a consolidação e homologação dos fluxos existentes antes de ampliar o escopo, conforme a [ordem atual](../IMPLEMENTACAO.md#ordem-atual-de-execução).

Cada domínio deve repetir o mesmo ciclo: conferir contrato e acesso → organizar contexto/dados/ação pelo padrão da Agenda → consulta/detalhe → escrita online e efeitos → estados e testes → homologação/piloto → avaliar offline. Uma tela sem integração real não conta como módulo concluído.

## Parte 09 — Tratos, alimentação e estoque

**Resultado demonstrável:** alimentar o lote autorizado e conferir o efeito real no estoque sem duplicar fornecimento. **Dependências:** P02–P04, contexto P06; P08 apenas para rascunhos. **Responsáveis:** mobile/backend/operador de trato.

### Primeiro incremento da Fase 3 — consulta de estoque (7 de novembro de 2026)

Rotas `/inventory` e `/inventory/[id]`, acessíveis em Estoque pelo menu compartilhado, pelos alertas de estoque da Home e pela busca geral de produtos. Consulta nativa para admin/manager, preservando a política atual do menu mobile; operador e tratador não recebem novo acesso. Gestor sem capacidade financeira ou em somente leitura pode consultar dados operacionais. Regras existentes do backend não foram ampliadas.

- Resumo remoto da organização com produtos ativos e abaixo do mínimo; sem soma de quantidades de unidades distintas ou valor/contagem de vencidos artificiais. O filtro de fazenda não é enviado nem anunciado como aplicável ao estoque. A visão operacional inclui corretamente produtos sem lotes com mínimo positivo.
- Produtos paginados por servidor, busca, categoria obtida das opções existentes e situação baixo/normal. Saldo e mínimo conservam unidade e decimal do contrato. Categoria fica recolhida inicialmente para manter a lista compacta. Resumo, opções e listagem têm erros e atualização independentes.
- Ficha do produto com saldo, mínimo, categoria, descrição e fabricante. Lotes de estoque são consultados somente por ação explícita, com paginação, saldo inicial/atual, entrada, fabricação/validade, localização, fornecedor e situação ativa/inativa. Validade desconhecida permanece não informada; saldo nunca é editado na ficha.
- Alertas registrados/não resolvidos, incluindo alertas gerais sem produto. Abrir a tela não gera alertas, marca como lido ou resolve pendências. Alertas vinculados abrem a ficha do produto.
- Fornecedores com busca remota por nome/documento, lista paginada e ficha com contatos/endereços/situação. Sem carregamento externo de logos/imagens ou envio de mensagens/telefonemas. Cadastros e edições ainda usam o web.
- Produtos encontrados na busca geral abrem a ficha nativa; aceita o campo real `unidade_display`, mantendo compatibilidade com a antiga projeção de busca. Não segue links `next` retornados pelo servidor; monta sempre a requisição da próxima página.
- GET de produto/lote/resumo usa `view=operational`. Custos ficam fora da resposta antes de serializar; saldo/estoque baixo usa agregação SQL para evitar uma consulta por produto. A projeção é opcional e não altera os POST/PATCH ou a resposta web legada. Nenhuma migration ou dependência nova.
- Estado remoto no TanStack Query em memória, isolado por sessão; resposta tardia após logout é descartada. Falha de atualização preserva dados anteriores identificados como antigos; 401/403/404 não reapresentam a listagem restrita. Sem cache offline, saldo otimista, envio de ajuste ou acesso financeiro por conveniência.

**Validação:** TypeScript, ESLint e 97 testes mobile; 16 testes backend direcionados em banco efêmero para tenant, projeção/legado, saldos, produtos sem lotes, paginação, fornecedores, alerta geral sem alteração de estado, bloqueio do tratador e consultas limitadas sem N+1. Navegador com API sintética em 320/390/820 px: resumo remoto, busca/categoria/página, retorno à mesma busca, lotes carregados sob demanda e paginados, validade desconhecida, erro 503 com dados anteriores, fornecedores/contatos e alertas. Bundles web/Android/iOS. Nenhuma movimentação no banco real. Homologação com backend/dados reais e aparelhos continua pendente para o aceite final.

**Cobertura:** E01 tem resumo operacional/alertas; E02 consulta/ficha e lotes (sem histórico de movimentos ou cadastro/edição); E04 consulta/ficha (sem cadastro/edição). E03, fórmulas/produção de ração, tratos e comunicação ainda não foram implementados. Fase 3 permanece em andamento. O complemento de cadastro abaixo acrescenta as primeiras escritas; movimentações e ração/trato permanecem separados.

### Cadastro essencial de produtos e fornecedores — 7 de novembro de 2026

Rota `/inventory/form?kind=items|suppliers`, com `id` na edição. A lista oferece Cadastrar produto/fornecedor; a ficha ativa oferece Editar. Novo registro → Estoque abre cadastro de produto. Formulários usam navegação de retorno, React Hook Form/Zod e metadados novos por instância, preservando campos durante conferência.

- Produto: nome, múltiplas categorias e unidade na criação, mínimo decimal (até oito inteiros/duas casas, vírgula ou ponto), prioridade, fabricante, descrição e espécie opcional. Cadastro cria somente a ficha: não há saldo inicial, lote, custo ou movimentação. Edição mantém unidade/categorias e não envia saldos, preços, estado ativo ou campos técnicos não exibidos. Medicamentos, vacinas e sêmen indicam a necessidade de completar o cadastro técnico no web antes do uso operacional.
- Fornecedor: nome, documento opcional, contrato, contatos telefone/e-mail e endereços repetíveis. Valida limites dos campos, e-mail e coordenadas; preserva zeros iniciais e precisão textual. Endereços incluem identificação, CEP/logradouro/número/bairro/complemento/cidade/UF e latitude/longitude opcionais. Teclado permite sinal negativo das coordenadas também no iOS. Sem chamadas, mensagens, geocodificação ou carregamento externo de logos.
- Arrays de contatos/endereços só são enviados quando mudam. Correção escalar não recria IDs nem perde rótulos/coordenadas. Exclusão é explícita; o servidor mantém a semântica de substituição integral quando um array é enviado. Criação/edição de fornecedor é transacional: uma falha ao salvar um filho reverte todo o conjunto.
- Somente admin/manager não restritos podem escrever. O controlador consulta novamente usuário, organização e opções válidas antes de enviar, bloqueia envios simultâneos e verifica expiração/troca de sessão. Erros de validação preservam os campos. Registros inativos, URLs inválidas e edição sem versão não habilitam gravação.
- PATCH envia `expected_updated_at`; sob lock, o backend rejeita uma versão desatualizada antes de alterar dados. O parâmetro é opcional para manter clientes web legados. Resposta opcional `view=receipt` retorna somente ID após a validação normal, sem transportar custos ou listas no reconhecimento da escrita. Sem migrações ou dependências novas.
- Depois do sucesso, invalida listas, resumo, ficha e lotes. Editar e reabrir consulta os valores corrigidos em cache de metadados próprio, sem reinicializar outro formulário mantido na pilha. HTTP 5xx/timeout ou reconhecimento inválido após o envio bloqueia novo Save e oferece Conferir estoque, mantendo o rascunho na pilha. Falha de preflight não é confundida com confirmação remota. Sem retry automático, outbox ou idempotência presumida.

**Validação:** 104 testes mobile, TypeScript/ESLint; 23 testes backend direcionados em banco efêmero, incluindo ausência de saldo na criação, preservação de campos técnicos e ledger, concorrência por versão, isolamento, legado/recibo, dados aninhados, remoção e rollback após falha sintética no meio da escrita. Navegador com API sintética em 320/390/820 px: produto novo/edição, decimal, retorno/reabertura atualizados, fornecedores com contatos/endereços/coordenadas, omissão de arrays intactos, exclusão, validação 400, versão desatualizada e confirmação 503 após aplicação sem permitir duplicação. Bundles web/Android/iOS. Sem gravação em dados reais; homologação nativa e com dados reais permanece para o aceite final.

**Limites:** E02 tem cadastro/edição essencial; campos técnicos completos, alteração de unidade/categorias e inativação continuam no web. E04 oferece cadastro/edição de dados, contatos e endereços ativos; imagens/logos/inativação permanecem no web. E03, fórmulas/produção de ração, tratos e comunicação continuam pendentes. O incremento seguinte, descrito abaixo, adiciona histórico e contagem física. Entradas e saídas continuam separadas.

### Histórico de movimentos e contagem física online — 7 de novembro de 2026

Rotas nativas `/inventory/movements`, `/inventory/movements/[id]`, `/inventory/lots/[id]` e `/inventory/count`. Histórico usa o menu/cabeçalho compartilhados; fichas e contagem preservam retorno ao chamador. Acesso pelo Estoque, produto e lote; uma consulta contextual mantém item/lote fixados e oferece retorno à origem.

- Histórico paginado com busca remota por produto/lote/destino/observação, tipo e período de registro de até 366 dias inclusivos. Filtros são aplicados explicitamente e preservados na pilha ao voltar do detalhe. Sem downloads integrais, contagens calculadas por página ou soma de unidades diferentes.
- Projeção operacional do backend exclui custos antes da serialização e evita N+1. Preserva quantidade decimal assinada do ajuste, responsável, destino, observação, lote, fazenda quando existente e vínculo com fornecimento bovino. Nome/unidade são do cadastro atual; não se anunciam como snapshots históricos. Ausência de vínculo bovino não é classificada artificialmente como lançamento manual ou origem financeira.
- Datas exibidas no fuso informado pelo sistema, e filtros por dia seguem o mesmo calendário. Não usa o fuso do aparelho para reinterpretar registros. O filtro global de fazenda da Home não altera o estoque/histórico organizacional.
- Ficha de lote consulta saldo, situação, entrada/validade, localização e fornecedor com a unidade do produto. Abre histórico contextual e, para admin/manager com escrita e produto/lote ativos, a contagem física online.
- Contagem: quantidade real não negativa na unidade existente e motivo obrigatório; zero é permitido, igualdade não cria ajuste. Antes de gravar, mostra saldo conferido, contagem e diferença com sinal, calculada em centésimos inteiros. Sem compra/consumo/receita/transferência implícita e sem saldo otimista.
- Preflight atualiza usuário/organização e consulta lote/produto para validar vínculo, atividade e unidade. Compartilha a proteção de envio simultâneo dos cadastros de estoque. O servidor confere saldo e unidade esperados sob lock e registra diferença/autor/motivo atomicamente. 409 bloqueia nova confirmação até conferência/reabertura; não substitui automaticamente o saldo original.
- Receipt opcional da contagem retorna só o ID, sem preços/custos. Confirmação invalida resumo, produtos/lotes e histórico; a ficha do lançamento permite consultar o ajuste confirmado. Timeout/5xx ou resposta inválida após envio deixa resultado incerto e bloqueia replay, com acesso à conferência mantendo os campos na pilha. Sem chave idempotente, retry automático, outbox ou garantia de recuperação após encerrar o app.

**Validação:** 111 testes mobile, TypeScript/ESLint; 42 testes backend direcionados de inventário (contratos anteriores, ledger, tenant, versão, projeções e novo histórico/contagem), incluindo quantidades assinadas, período/fuso na virada do dia, paginação/filtros inválidos, dados nulos, consultas limitadas sem custos, count zero/diferença, saldo/unidade desatualizados, recibo e permissões. Navegador com API sintética em 320/390/820 px: histórico remoto, retorno ao mesmo filtro/página, origem bovina, contexto do lote, revisão sem escrita, confirmação da diferença, conflito 409 e resposta 503 após aplicação sem permitir reenvio. Bundles web/Android/iOS gerados. Nenhuma movimentação no banco real. Homologação Android/iOS e com dados reais permanece para o aceite final.

**Estado:** E03 agora oferece histórico/detalhe e contagem física com ajuste auditado. Entrada, saída e compra recebida foram adicionadas no incremento seguinte; demais correções/exclusões continuam no web. Ração/produção/tratos e comunicação continuam pendentes; a Fase 3 não está concluída.

### Entradas, saídas e compras recebidas — 7 de novembro de 2026

Rota `/inventory/launch`, acessível por Lançar estoque no histórico e por ações das fichas de produto/lote. Sem produto fixado, apresenta seleção paginada remota; lotes, fazendas e fornecedores também usam seletores paginados, sem baixar coleções completas. Busca é exibida apenas nos recursos que a suportam. Compras exigem capacidade financeira; acesso de escrita é revalidado a cada prévia/confirmação.

- **Entrada sem compra:** novo lote com número/recebimento, fabricação/validade opcionais, local, fornecedor e nota fiscal, ou entrada em lote existente sem editar metadados/custo. Quantidade e motivo obrigatórios. Não cria despesa; custo de aquisição desconhecido permanece null.
- **Saída:** lote explícito, recebido, ativo, não vencido, destino e motivo, com saldo suficiente. Não seleciona automaticamente outro lote nem reduz o saldo para zero para esconder falta de estoque. Saída até o saldo exato pode zerar o lote. Perdas, vencimentos e vendas seguem seus próprios fluxos no web.
- **Compra recebida:** novo lote para não sobrescrever o custo de um lote anterior; exige fazenda escolhida, quantidade, custo unitário positivo e vencimento. Fornecedor é opcional. Revisão mostra o custo e a conta a pagar pendente calculada no backend. Confirmar não paga nem debita conta. Lote, movimento, saldo e um único título financeiro são atômicos; o sinal legado de aquisição de lote é suprimido para evitar duplicação de título.
- Prévia POST sem escrita retorna saldos antes/depois, dados normalizados e revisão assinada por usuário/organização, válida por 15 minutos. Confirmar envia somente o token; alterações, expiração ou mudança de saldo/unidade/metadados exigem nova revisão. Autor vem da sessão; campos de pagamento/conta/organização não são aceitos neste fluxo.
- Revisão preserva todo o contexto relevante: produto/unidade, lote, quantidade, saldo, fazenda/fornecedor, datas e localização de novo lote, nota fiscal, motivo/destino/observações e preço/vencimento da compra. O formulário rola para o início ao entrar na revisão ou mostrar confirmação. Dinheiro é formatado a partir do texto decimal e parte inteira BigInt; não se calcula quantidade × preço em ponto flutuante no cliente.
- O serviço confere atividade, tenant, cronologia/validade, saldo e precisão de estoque/financeiro. Compras muito pequenas que arredondariam a zero e valores fora do limite são rejeitados antes de gravar. Números de lote existentes não são reutilizados silenciosamente na criação; usa-se a escolha explícita de lote existente ou outro número.
- Erros 400/409 preservam campos e permitem corrigir/refazer a revisão quando não houve confirmação. Timeout/5xx ou receipt inválido após envio deixa resultado incerto, bloqueia alteração/reenvio e oferece conferir o histórico do produto, mantendo o formulário na pilha. Sem retries automáticos, fila offline, chave persistente ou garantia de recuperação após fechar o app.
- Metadados de formulário por instância, retorno nativo com descarte consciente de rascunhos e atualização das consultas após confirmação. Não usa a seleção global de fazenda como atribuição implícita da compra. Farm/supplier/lot inativos são desabilitados quando informados pelo servidor e sempre revalidados no backend. As rotas CRUD legadas e o fluxo web de compras/pagamentos mantêm o contrato anterior.

**Validação:** 119 testes mobile, TypeScript/ESLint; 52 testes backend direcionados de estoque/ledger/tenant/projeções e compra financeira legada, incluindo prévia sem escrita, entrada sem financeiro, saída exata/insuficiente, compra com um único título pendente, ausência de pagamento, tokens expirados/adulterados ou de outra organização, campos indevidos, acesso revogado/troca obrigatória de senha, saldo/unidade alterados, limites decimais e rollback após falha no financeiro. Navegador com API sintética em 320/390/820 px: seleção de produto, entrada em novo lote, saldo insuficiente, revisão desatualizada/refeita, fazenda paginada e fornecedor explícitos, valor e efeito pendentes da compra e resposta 503 após gravação sem permitir novo envio. Bundles web/Android/iOS gerados. Nenhuma movimentação de estoque ou financeiro no banco real; homologação com dados reais e aparelhos continua no aceite final.

**Estado:** E03 já inclui consulta/detalhe, contagem física, entrada sem compra, saída e compra recebida pendente. Correções/exclusões de origem, vendas/perdas/vencimentos especiais, transferências, pagamento/estorno e demais rotinas financeiras continuam no web. Campos técnicos completos e mídia dos cadastros permanecem fora do recorte nativo. Próximo bloco da Fase 3: fórmulas e produção de ração, depois tratos e comunicação. A fase não está concluída.

### Fórmulas e produção de ração — 7 de novembro de 2026

**Rotas nativas:** `/feed`, `/feed/detail`, `/feed/form` e `/feed/produce`, acessíveis pelo estoque. A lista usa o cabeçalho/menu compartilhado; fichas e formulários mantêm retorno em pilha. R01 tem consulta paginada/busca, ficha e cadastro/edição essencial da fórmula. R02 tem histórico paginado, ficha e produção online revisada. Permissões do recorte: admin/manager; operadores e tratadores não ganham acesso por esta entrega.

- Fórmula exige produto final ativo na categoria ração, unidade kg, ingredientes ativos em kg e distintos do produto final, sem repetição, com percentuais positivos somando exatamente 100%. Até 50 ingredientes. Espécie usa opções reais do servidor. Edição envia `expected_updated_at`; versão desatualizada não altera cadastro/ingredientes. Substituição de ingredientes e dados escalares é atômica. Fórmulas antigas incompletas podem ser consultadas/corrigidas, mas não produzidas pelo novo fluxo.
- Produção informa quantidade planejada e rendimento real positivos, em kg e com duas casas decimais. Prévia somente de leitura apresenta produto final, saldo antes/depois, quantidade de cada ingrediente e lotes consumidos por ordem de entrada (data/ID). Exclui lotes inativos, vencidos e recebimentos futuros; validade desconhecida conserva o comportamento admitido no estoque. Arredondamento por maiores restos distribui centésimos de kg mantendo a soma exata do planejado. Quantidades pequenas demais para distribuir um centésimo a cada ingrediente são rejeitadas.
- Revisão assinada por usuário/organização expira em 15 minutos. Token contém comando e hash do estado revisado, sem preços; APIs operacionais não retornam custos. Confirmação revalida fórmula, produtos, saldos, lotes, dia e permissões sob bloqueio de fórmula/produtos/lotes e comparação do estado. Mudanças exigem nova revisão. Produção, baixas, movimentos auditados e lote `PROD-{id}` são uma transação; falha não deixa estoque parcialmente alterado.
- Custo fica no servidor: custo do lote e, quando desconhecido, média ponderada dos lotes ativos com saldo conforme regra existente. Limites de estoque/custo são conferidos; o lote produzido suprime o sinal de compra. Não cria conta a pagar nem pagamento. Quantidade real é o rendimento do lote, enquanto o consumo deriva do planejado.
- Formulários preservam campos em erros conhecidos. Falha incerta de gravação bloqueia novo envio/alteração e oferece conferência da lista/histórico, mantendo os dados na pilha. Não há retry automático, outbox ou chave persistente; revisão não é garantia geral de idempotência e fechar o app perde o rascunho. Operações permanecem online.

**Validação:** 126 testes mobile; 13 novos testes backend do módulo e 52 testes de regressão direcionados de estoque/financeiro. TypeScript e ESLint. Navegador com APIs sintéticas em 320/390/820 px: criar/editar fórmula, seletor por unidade/categoria, total inválido, saldo insuficiente, revisão/confirmação, conflito e resultado incerto sem replay após conferência. Bundles Android/iOS/web. Nenhuma escrita no estoque real; aparelhos, teclado nativo, leitores de tela e concorrência real em PostgreSQL permanecem para homologação.

**Limites e próximo bloco:** histórico utiliza nomes/composição atuais da fórmula, sem inventar snapshot de composição em produções antigas. Não inclui excluir/inativar fórmula, corrigir/cancelar produção nem versão histórica completa da composição. Fluxos especializados permanecem no web. R01/R02 têm o recorte essencial entregue; Fase 3 segue aberta para **tratos diários e comunicação/notificações**, além da homologação nativa.

## Trato diário bovino — 7 de novembro de 2026

**Recorte R03 entregue:** `/feeding`, `/feeding/batch` e `/feeding/form`. Tratadores autorizados entram diretamente nos lotes de trato após login; o menu compartilhado e atalhos de corte/leite também abrem as rotas nativas. Alternância corte/leite preserva lotes de dupla finalidade nos dois contextos; lotes de finalidade desconhecida devem ser classificados no fluxo de gestão antes deste recorte. A lista oferece busca por lote/fazenda e paginação. Contexto de fazenda selecionado no app filtra no servidor, com opção explícita de consultar todas; o tratador não consulta o cadastro geral de fazendas/estoque.

- GET opt-in `livestock/cattle/daily-feeding/?view=mobile` retorna páginas de `batches`, `products`, `formulas` ou `deliveries`; contexto `production` obrigatório, `farm`/`batch` opcionais e `batch` obrigatório no histórico. A resposta informa dia/fuso do negócio. Sem filtros fictícios de data: apenas o dia atual do servidor. Lotes precisam estar ativos, recebidos e ter animais. Fórmulas precisam ter produto final ativo/elegível; produtos em kg precisam ser rações/suplementos/núcleos bovinos. Consultas não produzem histórico/auditoria nem preços/custos.
- Admin/manager e feeder bovino podem fornecer; operadores bovinos consultam, sem botão de escrita. Somente leitura preservada. Feeder não ganha Agenda, cadastro de estoque, financeiro ou leituras de cocho por esta entrega. Guardas também validam acesso por URL, sessão e pré-envio.
- Formulário nativo RHF/Zod escolhe produto ou fórmula, quantidade positiva em kg (duas casas), observação e dia fixo. Revisão local mostra lote, fazenda, segmento, produto/fórmula, quantidade e identificação. Não promete produzir ração nem pré-reservar saldo. Servidor revalida produto/fórmula, período e estoque elegível ao confirmar.
- `request_key` UUID é gerada para a intenção revisada e congelada com o payload. Normalização consistente de quantidade/notas evita mudar a intenção em reconciliação. Confirmação faz preflight de usuário/organização e lote/dia; serviço existente bloqueia lote animal/produto/lotes de estoque, registra consumo e evento e baixa estoque atomicamente. Novos campos opcionais `production`/`farm` são conferidos sob o bloqueio do lote, sem quebrar o payload legado. Chave existente exige mesmo payload e mesmo responsável; outra pessoa não pode assumir a identificação.
- Resultado incerto congela edição/envio normal. Ações: consultar histórico mantendo a tela na pilha ou **conferir/concluir o mesmo envio**, explicitamente, com payload/chave idênticos. Reconciliação revalida autorização/sessão, sem exigir dia/opções atuais antes de o servidor verificar a chave já gravada. Replay confirmado continua funcionando após virada de dia ou inativação da fórmula; se nunca gravou, regras atuais impedem envio inválido. Não há retry automático.
- Confirmação invalida trato/histórico e caches de estoque relacionados; nenhum saldo otimista é mostrado como definitivo. Há proteção contra toque duplo, navegação durante envio e saída com dados/resultados incertos. Não há fila offline nem rascunho/chave persistente após encerrar o aplicativo: nessa situação, conferir histórico antes de novo lançamento.

**Validação:** 134 testes mobile; 20 testes backend direcionados (7 novos do mobile e regressões de trato/integridade). Cobertos perfis, tenant, kg/precisão, chave/payload/responsável, dia/contexto/fazenda, rollback de estoque/consumo se auditoria falhar, consultas sem financeiro e proteção do legado. Navegador sintético em 320/390/820 px: entrada direta do tratador, seleção corte/leite, fórmula/produto, revisão, saldo insuficiente, erro após gravação, consulta e reconciliação após virada de dia com um único efeito. TypeScript, ESLint e bundles Android/iOS/web. Nenhuma baixa em estoque real.

**Pendências:** homologação em aparelhos Android/iOS (teclado, leitor de tela, volta/retomada), backend real, concorrência efetiva em PostgreSQL (mesma chave e disputa pelo último saldo), recuperação durável/offline, histórico de outros dias, correções/cancelamentos e leituras de cocho. O recorte de **notificações internas e preferências** foi implementado em seguida, com escopo/limites na Parte 15 (`14-16-NATIVO-SINCRONIZACAO.md`). Próximo passo de aceite da Fase 3: homologação integrada; push segue separado. A fase permanece sem homologação.

## Homologação técnica integrada da Fase 3 — 7 de novembro de 2026

**Estado:** validação técnica integrada aprovada no ambiente descartável; **aceite nativo/operacional ainda pendente**. O PostgreSQL usado nos testes foi criado em diretório privado temporário, com socket local e sem escutar rede; não foi utilizado o banco do projeto. Ao terminar, os bancos de teste foram removidos e o servidor temporário foi encerrado.

**Evidência reproduzível:** `backend/apps/inventory/tests/test_mobile_phase3_integration.py` contém uma jornada entre módulos e sete cenários simultâneos com conexões independentes e barreira de início. Execução PostgreSQL opt-in em `config.settings.test_postgres`; procedimento no guia `docs/ai/testing.md`. Esses sete testes são explicitamente ignorados em SQLite, que não comprova os bloqueios de linha. A suíte direcionada combinada executou **124 testes em PostgreSQL, sem skips e sem falhas**. Complemento SQLite: 30 testes, sendo 23 aprovados e sete skips esperados de concorrência. Mobile: 141 testes, TypeScript e ESLint aprovados.

| Cenário concorrente em PostgreSQL | Resultado comprovado |
| --- | --- |
| Mesmo lote/chave/payload de trato | Duas respostas 201 com o mesmo ID; um consumo, um movimento e saldo exato |
| Mesma chave com payload diferente | Uma resposta 201 e outra 400; apenas um efeito |
| Lotes animais diferentes disputando o último saldo do mesmo produto | Uma resposta 201 e outra 400; estoque não negativo e um consumo |
| Duas confirmações da mesma revisão de saída | Uma resposta 201 e outra 409; um movimento |
| Duas confirmações da mesma revisão de produção de ração | Uma resposta 201 e outra 409; uma produção e uma baixa dos insumos |
| Duas confirmações da mesma compra recebida | Uma resposta 201 e outra 409; um título financeiro |
| Duas alterações de preferências com a mesma versão | Uma resposta 200 e outra 409; a atualização perdedora não sobrescreve a vencedora |

**Jornada HTTP real:** navegador com o app Expo web em 390 px consumiu respostas reais de um Django HTTP temporário com PostgreSQL e usuários fictícios. Somente o endereço das requisições foi encaminhado ao backend isolado; corpos/respostas não foram simulados. Foram exercitados: login do gerente, inbox/leitura de mensagem, preferência comercial explícita, entrada de 3,25 kg de milho, cadastro de fórmula com 100% milho, produção planejada de 10 kg com rendimento de 9,50 kg, login separado de tratador, entrada direta no trato, fornecimento de 5,25 kg e consulta do histórico. Resultado no banco: **uma produção, um consumo, quatro movimentos de estoque e nenhum título financeiro**. O teste de integração da API também confirmou os saldos finais: milho 93,25 kg e ração 14,25 kg, preservando restrições do feeder e isolamento de notificações. Não foram alterados estoque, usuários, mensagens ou preferências reais.

**Ajustes encontrados:** confirmação de uma revisão de estoque/ração anteriormente válida agora retorna conflito 409 se a elegibilidade mudou (por exemplo, saldo já consumido ou número de lote já criado), exigindo nova revisão. A validação de uma prévia nova continua retornando 400 para entrada inválida. O teste do trato passou a comparar o valor decimal, aceitando a representação equivalente `5`/`5.00` de SQLite/PostgreSQL. Ficha/formulário de trato exibem quantidades e datas no idioma da organização, preservando kg e o dia do negócio.

### Roteiro de aceite Android/iOS e piloto

Executar em ambiente de homologação e registrar aparelho/SO/build, perfil, resultado e defeito encontrado. Não reutilizar dados produtivos para simular falhas.

- [ ] Android e iOS: instalar/abrir o build, restaurar sessão, trocar conta e confirmar que caches/dados da conta anterior desaparecem. Validar gerente, tratador, operador de consulta e somente leitura.
- [ ] Celular pequeno e maior/tablet: conferir fonte ampliada, safe areas, teclado aberto, rolagem, botões alcançáveis, navegação de retorno/gestos e retomada após segundo plano. Validar leitor de tela e alvos de toque.
- [ ] Estoque: cadastrar/editar produto e fornecedor; verificar contatos/endereços e conflito de versão. Conferir lotes/validade, histórico, contagem, entrada, saída insuficiente e compra com título pendente, sem pagamento automático.
- [ ] Ração: criar/editar fórmula, validar total de 100%, produto final/ingredientes em kg e produção com revisão dos lotes/quantidades. Conferir saldos e histórico em ambos os clientes.
- [ ] Trato: alternar corte/leite, conferir fazenda/lote/dia, produto ou fórmula, toque duplo, perda controlada da resposta e reconciliação pela mesma chave. Retomar do segundo plano e confirmar que saldo/contagem não ficam otimistas nem duplicados.
- [ ] Comunicação: conferir sino/lista/detalhe, leitura explícita, agrupamento, arquivar/restaurar, origem autorizada e indisponível; salvar preferências, simular conflito e conferir recarga após resultado incerto. Preferência push da conta não deve pedir permissão nem ativar push nativo.
- [ ] Piloto com usuários: confirmar que a navegação e a densidade facilitam a rotina, registrar divergências entre mobile/web e corrigir os bloqueios de aceite antes de encerrar a fase.

**Limitação do ambiente:** `xcrun simctl` não está disponível; `adb`/`emulator` não foram encontrados no PATH nem o emulador no diretório Android padrão consultado. Portanto não houve execução nativa, teste de teclado/leitor de tela/retomada em aparelhos, nem aceite dos usuários. A geração prévia de bundles Android/iOS não substitui essas verificações. Push e os complementos de comunicação descritos na Parte 15 continuam fora deste aceite técnico.

## Subparte 09A — Consulta do trato diário

- [x] P09.01 — Integrar `cattleDailyFeedingService.get`, preservando lote, fazenda, quantidade de cabeças, fornecimentos, fórmulas e produtos autorizados.
- [x] P09.02 — Priorizar para feeder os lotes que pode operar; não colocar uma página geral de gestão antes da atividade principal.
- [x] P09.03 — Mostrar quantidade fornecida e histórico por lote; valores devem ser do servidor e não soma improvisada que ignore cancelamentos ou regras de data.
- [x] P09.04 — Confirmar se o endpoint aceita filtro de fazenda/data. Não apresentar filtros que o servidor ignora, nem presumir que a data atual do aparelho define o dia operacional.

### Subparte 09B — Fornecimento online

- [x] P09.05 — Formulário com lote, fórmula ou item conforme contrato, quantidade em kg, data e observação. Exibir unidade junto ao valor e evitar troca implícita entre kg, saco e unidade.
- [x] P09.06 — Gerar `request_key` estável para uma mesma intenção de fornecimento e mantê-la durante reconciliação/retry autorizado. Só criar outra chave para uma nova operação consciente.
- [x] P09.07 — Concorrência PostgreSQL e regressões de payload/responsável/tenant comprovadas na homologação técnica acima. Provar no backend o tratamento da chave: duas chamadas simultâneas, mesmo payload, payload diferente e escopo de usuário/tenant. Presença do campo no cliente não basta.
- [x] P09.08 — Validar transação entre registro do fornecimento e baixa de estoque; se uma falhar, a outra não pode ficar isolada. Conferir auditoria e lote de estoque quando aplicável.
- [x] P09.09 — Após confirmação, atualizar trato e consultas de estoque afetadas. Não mostrar saldo otimista como definitivo.
- [x] P09.10 — Tratar saldo insuficiente, produto inativo, fórmula alterada e permissão revogada. Um rascunho de fórmula antiga exige nova validação.

### Subparte 09C — Consulta e operações de estoque

- [x] P09.11 — Inventariar endpoints de itens, saldos, depósitos/lotes e movimentos usados pelo frontend. Conferir contratos em `stockAdjustmentService.ts` e backend `inventory` antes de nomear novas rotas.
- [x] P09.12 — Criar consulta paginada com busca, unidade, saldo e localização permitida. Preço e custo ficam condicionados ao acesso.
- [x] P09.13 — Detalhe de item com lotes/validade e histórico sob demanda; não assumir que estoque de fazendas diferentes é intercambiável.
- [x] P09.14 — Se inventário físico for incluído, distinguir contagem de ajuste efetivo. Aprovação, motivo, concorrência e trilha de auditoria devem seguir o backend.
- [ ] P09.15 — Entradas, ajustes e transferências ficam online e em incremento separado. Não incluir edição de saldo como campo direto da ficha.

### Critérios de aceite e testes

Um fornecimento confirmado resulta em uma única baixa correta. Feeder não consegue consultar custos nem operar lote não autorizado por URL ou chamada direta. Testar toque duplo, timeout após commit, disputa pelo último saldo, unidade incompatível, lote vencido conforme regra atual, repetição da chave e interrupção da resposta.

**PRs sugeridos:** P09-A consulta; P09-B contrato/atomicidade backend quando necessário; P09-C fornecimento; P09-D estoque consulta; P09-E inventário/ajustes se priorizados. A fila offline do trato só entra após P16 e testes específicos.

## Parte 10 — Clínica, sanidade e vacinação

**Resultado demonstrável:** consultar o histórico sanitário e registrar uma ocorrência autorizada sem perder vínculo com animal/lote ou estoque. **Dependências:** P02–P04 e contexto de entidades P06 ou P11. **Responsáveis:** mobile/backend e usuário responsável por sanidade.

### Primeiro recorte da Fase 4 — clínica e sanidade, 7 de novembro de 2026

**Implementado:** `/clinic`, `/clinic/detail`, `/clinic/form` e `/clinic/history`. Menu/sino de origem clínica abrem o destino nativo; a ficha de animal/lote bovino oferece atalho com UUID/fazenda. A lista usa o cabeçalho/menu compartilhado; ficha/formulário preservam retorno. Consulta paginada de ocorrências clínicas, exames/tratamentos, vacinações e alertas sanitários, com busca remota, fazenda, espécie autorizada e período pareado de até 366 dias. Rótulos/datas/volumes usam o idioma organizacional. Contadores, datas de próxima dose e classificação de alerta são do servidor; não há previsão, diagnóstico ou recomendação nova no cliente.

- Contratos opt-in em `livestock/clinical/records/mobile/`, `{id}/mobile/`, `mobile-options/` e `mobile-animals/`. A projeção operacional lê apenas os campos necessários, sem consultar colunas de custos, snapshots financeiros ou propriedades de custo do estoque. A consulta tem relações carregadas em conjunto; teste compara o número de queries com uma e seis ocorrências para impedir N+1.
- Tenant e espécies seguem `OrganizationRolePermission`/`operator_scoped`, com proteção adicional de relações legadas inconsistentes: não expor animal/lote de outra organização ou espécie secundária proibida. Alertas com afetados de espécies mistas proibidas continuam ocultos ao operador. Tratador não ganha clínica; operador somente de leitura consulta sem botão de gravação. Seleção de paciente usa UUID e fazenda, exibindo ambos mesmo quando há brincos iguais.
- Primeira escrita essencial por `POST livestock/clinical/records/?view=mobile`, sem alterar o CRUD web. Campos: animal identificado, fazenda esperada, tipo/data/horário, observação clínica obrigatória, gravidade/resultado e profissional informado. Fazenda deriva do animal e é revalidada sob bloqueio junto com atividade/escopo; data futura, campos desconhecidos/financeiros, animal inativo, contexto alterado e paciente não autorizado são rejeitados.
- Gravação reaproveita `perform_create` e a transação/ownership existente do operador; falha na vinculação de autoria reverte o registro. O profissional informado é texto do contrato, não uma identidade verificada de autor. O registro não aplica vacina, dispensa medicamento, baixa estoque, lança despesa ou altera efetivo/baixa do rebanho. Não há nova regra sanitária/diagnóstica no app.
- Formulário RHF/Zod preserva campos em erro conhecido, impede toque duplo/envio após troca de sessão e não reenvia automaticamente um POST. Resposta perdida/5xx/receipt inválido congela a gravação e oferece histórico **somente de leitura** em rota própria, com detalhe em modal e retorno ao mesmo formulário bloqueado. Campos ficam em memória; não há chave idempotente, fila offline ou garantia de recuperação após encerrar o app.

**Validação:** 149 testes mobile (8 novos), TypeScript e ESLint; 11 testes backend em PostgreSQL descartável (9 novos + 2 regressões de clínica/tenant), também com recorte validado em SQLite. Cobertos escopo/UUID, paciente que mudou de fazenda após validação, data inválida/futura, tipo/observação, custo não exposto, autorização/ownership/rollback e ausência de efeitos de estoque/financeiro na ocorrência essencial. Navegador com APIs sintéticas em 320/390/820 px: quatro áreas de consulta, ficha de vacina/volume/próxima dose e contadores de alertas, período inválido sem chamada remota, brincos iguais em fazendas diferentes, validação preservando campos, gravação e resultado incerto com retorno da consulta sem reenvio. Bundles Android/iOS/web. Nenhum registro clínico real foi criado.

**Limites:** C01 tem consulta essencial e C02 tem leitura e primeira ocorrência individual. Não inclui cadastro de doença/sintoma, prescrição/JSON completo de medicações, temperatura, anexos, aplicação de medicamento fora do primeiro recorte bovino gerencial, campos avançados de exames, correção/cancelamento nem ocorrência independente por lote (modelo clínico exige animal). A ficha informa os limites e oferece a clínica web para campos completos. Datas futuras de doses são lidas, não calculadas. O painel de alertas não reconhece/resolve registros automaticamente.

**Incremento backend de vacinação:** disponíveis catálogos operacionais paginados de animais/lotes e vacinas, revisão assinada e confirmação transacional em `livestock/vaccinations/?view=mobile-preview|mobile-confirm`. Dose em mL por animal; lote usa o efetivo ativo completo de hoje. A revisão mostra conversão, total, saldo e alocação FEFO; exclui estoque vencido/não recebido e rejeita perda de precisão. Confirmação bloqueia paciente/produto/lotes, revalida a revisão e grava baixa exata, autoria e histórico sem criar compra/pagamento. Fluxo web legado preservado. **Integração mobile implementada em `/clinic/vaccination`:** entrada pela aba Vacinações e fichas bovinas, seleção paginada de paciente/produto (UUID/fazenda), dose por animal, tipo, datas, aplicador informado e observações. Vacina sem metadados técnicos fica indisponível. RHF/Zod preserva os campos; revisão exibe produto/paciente, efetivo atual, doses, total/saldo e lotes/validade devolvidos pelo servidor. Não calcula dose clínica, conversão ou alocação no cliente. Confirmação envia somente o token, exige a revisão da mesma intenção/sessão e revalida usuário/organização/permissão. Toque duplo, mudança de campos e reutilização do token enviado são bloqueados. Conflito pede nova revisão sem apagar campos; timeout/408/5xx/resposta inválida bloqueia o formulário e oferece histórico de vacinações individual ou por lote em `/clinic/history`, com detalhe somente leitura e retorno ao mesmo rascunho bloqueado. Não há reenvio, fila offline nem persistência após encerrar o app.

**Validação mobile da vacinação:** 157 testes mobile (8 novos), TypeScript, ESLint e bundles Android/iOS/web. Chrome com API sintética em 320/390/820 px: brincos iguais em fazendas diferentes, vacina sem configuração, dose zero/data futura sem POST, revisão sem baixa, alteração exigindo nova revisão, 409 com campos preservados, sucesso/ficha, lote com dose por cabeça e total do servidor, resultado incerto após gravação simulada e histórico somente leitura sem replay. Não houve gravação em dados reais nem execução nativa em aparelhos.

**Incremento de exames/tratamentos:** `/clinic/health-form`, acessível pela aba Exames e tratamentos e pela ficha de procedimento, registra cuidado documental de animal identificado: UUID/fazenda, tipo do `HealthRecord` (exame, cirurgia, medicação ou outro), descrição obrigatória, data, profissional informado e observações. A seleção reaproveita o catálogo paginado de animais ativos; identificadores iguais são diferenciados por fazenda. `GET livestock/health/records/mobile-options/` fornece tipos reais, dia e fuso do servidor; `POST ?view=mobile` aceita somente campos essenciais e responde `{id}`. Validações impedem data futura/anterior à entrada ou nascimento, paciente inativo/fora do escopo, fazenda alterada, espécie proibida e campos financeiros/estoque/manejo. Paciente é revalidado sob bloqueio PostgreSQL na gravação. A transação de `perform_create` preserva ownership do operador e reverte o documento em caso de falha. Não cria consumo, título/pagamento, vínculo automático de manejo, carência ou alteração do rebanho. O tipo Medicação mostra aviso explícito: é descrição documental, sem dose/produto/aplicação de estoque. Profissional informado não é identidade verificada de autor.

Formulário RHF/Zod, quatro idiomas, erros com campos preservados e single flight com revalidação de usuário/organização/permissão/paciente antes do POST. Resultado incerto (timeout/408/5xx/receipt inválido) bloqueia edição/reenvio e abre `/clinic/history?kind=health` somente leitura, com ficha em modal e retorno ao mesmo formulário bloqueado. Sem retry automático, fila offline, anexos, correção/cancelamento ou persistência de rascunho ao encerrar o app. Contrato web legado permanece intacto, incluindo os campos gerenciais disponíveis no web.

**Validação de exames/tratamentos:** 165 testes mobile (8 novos), TypeScript, ESLint e bundles Android/iOS/web. 9 testes backend novos passaram em SQLite e PostgreSQL descartável; 19 regressões de clínica/vacinação também passaram no PostgreSQL (28 no recorte). Cobertos tipos reais, documentação sem efeitos de estoque/financeiro, tenant/espécie, data e contexto alterados após validação, propriedade do operador, rollback e contrato web. Chrome com API sintética em 320/390/820 px: escolha por UUID/fazenda, descrição/data inválidas sem POST, aviso de medicação documental, 400 preservando descrição/observações, gravação/ficha e 503 após gravação simulada com consulta ao histórico sem replay. Sem uso de dados reais e sem execução em aparelhos Android/iOS.

### Aplicação individual de medicamento bovino — 8 de novembro de 2026

**Implementado:** `/clinic/medication`, pela aba Exames e tratamentos, somente para administradores e gerentes, preservando a autorização existente do manejo sanitário bovino. Seleção paginada por UUID/fazenda de animal bovino ativo e lote de medicamento (inclusive categoria secundária/medicamento-vacina), quantidade positiva na unidade do produto, data, descrição, profissional informado, observações e datas manuais de carência. Quando o produto exige carência, ambas as datas são obrigatórias; o cliente não calcula dose, conversão ou prazo clínico.

A revisão assinada por 15 minutos mostra animal/fazenda, produto/lote/unidade, consumo, saldo posterior, validade e carência mínima do cadastro devolvida pelo servidor. Antes de confirmar, revalida estado do animal, unidade, categoria/espécie, atividade/recebimento/validade/saldo do lote, datas e ordenhas aproveitadas no período de carência. Cria manejo sanitário individual e participante e reaproveita `confirm_cattle_management` na mesma transação, produzindo a baixa, o registro de saúde e as carências pelos seletores já existentes. Autores do manejo são a sessão criadora/confirmadora; profissional informado continua sendo texto livre. Não cria título nem pagamento. Erro após a baixa reverte todos os efeitos.

Confirmação envia somente o token da mesma intenção/sessão; revisão expirada ou dados alterados retornam 409. Toque duplo e reutilização do token enviado são bloqueados. Timeout/408/5xx/receipt inválido congela edição/reenvio e oferece `/clinic/history?kind=health` somente leitura, com retorno ao mesmo formulário bloqueado. Ficha e histórico mostram os campos operacionais do manejo (produto/lote, quantidade/unidade, carências e ID), sem custos. Não há retry automático, fila offline, persistência do rascunho, aplicação coletiva/por lote de animais ou suporte a outras espécies neste incremento. Operadores/tratadores não ganham acesso ao manejo gerencial; o formulário de documentação continua disponível segundo a autorização anterior.

**Validação:** 173 testes mobile (8 novos), TypeScript, ESLint e bundles Android/iOS/web. 39 testes PostgreSQL descartável (11 novos, incluindo duas confirmações simultâneas; 28 regressões de clínica/saúde/vacinação), com baixa única e saldo exato. Os 7 testes iniciais passaram em SQLite; mais 3 regressões do manejo web/estoque/carência passaram em SQLite. Chrome com API sintética em 320/390/820 px: paciente por UUID/fazenda, quantidade/data inválidas sem envio, conflito de ordenhas preservando campos, revisão sem efeitos, edição exigindo nova revisão, 409 preservando rascunho, sucesso/ficha com rastreio e 503 após gravação simulada com histórico sem replay. Sem alterações em dados reais, migração ou dependência nova. Execução em aparelhos Android/iOS permanece pendente.

**Próximo incremento:** ampliar os fluxos de campo restantes da Fase 4 conforme contratos reais; clínica ainda tem campos avançados/prescrições, anexos e correções/cancelamentos pendentes. Manejo confirmado não tem estorno automático no contrato atual; não oferecer cancelamento fictício no app. Homologação em aparelhos e piloto continuam pendentes; este recorte não encerra a Fase 4 nem o aceite da Fase 3.

**Validação do incremento backend:** 10 testes novos de vacinação e 3 regressões de aplicação web/individual/lote passaram em PostgreSQL descartável. Os 9 testes de clínica também passaram nesse banco; os 8 testes iniciais de vacinação passaram em SQLite. Cobertos revisão sem escrita/custo exposto, dose por cabeça, saldo/efetivo alterado, validade/recebimento, precisão, datas, tenant, operador somente leitura/autoria, revisão vinculada ao usuário e rollback integral após falha. Sem validação de concorrência por conexões simultâneas ou de interface/dispositivo neste incremento.

### Subparte 10A — Consulta e triagem operacional

- [ ] P10.01 — **Parcial:** registros clínicos, saúde, vacinações e alertas conferidos; catálogos completos/medicamentos ficam no próximo recorte. Conferir contratos de registros clínicos, doenças/sintomas, medicamentos, vacinas e alertas em `clinicalService.ts` e backend. Substituir tipos incompletos apenas no recorte usado.
- [x] P10.02 — Definir quais registros pertencem a animal e quais aceitam lote, espécie ou fazenda. Não converter identificador de lote em animal para reutilizar formulário.
- [ ] P10.03 — **Parcial:** consulta/detalhe essencial implementados; autoria plena, prescrições e anexos não são inferidos. Criar histórico com data, tipo, responsável, situação e acesso aos detalhes; carregar textos/anexos sob demanda.
- [x] P10.04 — Mostrar alertas e pendências com a classificação do servidor. A interface não cria recomendações diagnósticas ou regras sanitárias próprias.

### Subparte 10B — Registro e vacinação

- [x] P10.05 — Ocorrência clínica e procedimento/exame/tratamento documental individual online implementados. Formulário de ocorrência com entidade, data/hora, observação e demais obrigatórios reais. Preservar autoria e não permitir edição de campos controlados pelo backend.
- [x] P10.06 — Primeiro formulário online de vacinação individual/lote ativo, com revisão assinada e baixa transacional. Formulário de vacinação com produto, quantidade/unidade, data, próxima dose quando aplicável e identificação do estoque conforme contrato.
- [ ] P10.07 — **Parcial:** ocorrência clínica não movimenta estoque; vacinação tem baixa explícita e rollback testado. Aplicação individual de medicamento bovino gerencial também usa o manejo/estoque existente com transação e concorrência testadas. Correção/cancelamento e demais espécies/ações permanecem pendentes. Separar registro administrativo de vacinação de movimentação efetiva de medicamento. Se o servidor integra os dois, provar atomicidade e regra de cancelamento.
- [ ] P10.08 — **Parcial:** carências manuais e mínimo cadastrado integram a aplicação bovina; prescrição e acompanhamento avançado permanecem pendentes. Expor campos de carência, prescrição e acompanhamento somente se já suportados e adequados ao papel; não inferir prazos a partir de texto livre.
- [ ] P10.09 — Integrar foto/anexo após Parte 14. Rascunho pode guardar observação local, mas não confirmar consumo de medicamento offline.
- [ ] P10.10 — Tratar correção/cancelamento conforme domínio, com motivo quando exigido. Registro auditável não deve ser apagado só da lista local.

### Critérios de aceite e testes

O registro retorna vinculado à entidade correta e é visível na web conforme acesso. Testar espécies não autorizadas, medicamento sem saldo, data inválida, dose/unidade incorreta, entidade inativa, edição concorrente e upload interrompido. Conteúdo clínico não pode aparecer em telemetria ou push sem necessidade.

**PRs sugeridos:** P10-A contratos/consulta; P10-B ocorrência; P10-C vacinação e impacto; P10-D anexos/alertas vinculados. Recursos de IA eventualmente associados permanecem online, identificados como assistência e separados do registro confirmado.

## Parte 11 — Suinocultura por fases

**Resultado demonstrável:** consultar e executar as rotinas selecionadas de uma fase produtiva com continuidade entre fases. **Dependências:** P02–P04; P09/P10 para efeitos compartilhados quando usados. **Responsáveis:** mobile/backend e usuário do segmento.

### Ordem interna sugerida

1. Consulta de lotes/animais por fase e ficha resumida.
2. Uma rotina frequente escolhida no piloto, sem tentar migrar todas as telas simultaneamente.
3. Registro de eventos de reprodução ou crescimento pertinentes.
4. Transferências entre fases, somente depois da prova transacional.
5. Indicadores e relatórios sob demanda.

### Tarefas

- [ ] P11.01 — Mapear `livestockService.ts`, produtividade e mão de obra para as fases realmente implementadas. Identificar marrãs, matrizes, cobertura, gestação, maternidade, creche, crescimento e terminação conforme contratos vigentes.
- [ ] P11.02 — Criar hub de fases com contagens confiáveis e lista paginada; contagens ausentes não devem ser inventadas localmente.
- [ ] P11.03 — Detalhe com identificação, fase, fazenda, datas e eventos necessários para decidir a próxima ação. Respeitar diferenças entre animal individual e lote.
- [ ] P11.04 — Preservar distinção entre data de nascimento, chegada e início da fase. Idade desconhecida permanece desconhecida; não substituir nascimento por entrada.
- [ ] P11.05 — Mostrar previsões calculadas pelo servidor e indicar natureza estimada. Estar na data prevista não muda automaticamente a fase no cliente.
- [ ] P11.06 — Selecionar e implementar a primeira escrita online com validação de contagem, peso/unidade, datas e situação. Não reutilizar regras de bovinos sem verificar.
- [ ] P11.07 — Para reprodução, validar vínculos e sequência dos eventos permitidos. Não inferir que alertas existentes concedem permissão de gravação.
- [ ] P11.08 — Transferência deve confirmar origem, destino, quantidade e efeito sobre as fases; servidor executa atomicamente e informa resultado. Transferência não é simples alteração de rótulo.
- [ ] P11.09 — Mortalidade, descarte, venda e mão de obra ficam em entregas específicas, com impactos de estoque/financeiro explicitados quando existentes.
- [ ] P11.10 — Indicadores de produtividade usam fórmulas oficiais do backend. Não recalcular no mobile a partir de uma página parcial.
- [ ] P11.11 — Definir quais observações aceitam rascunho e quais eventos precisam permanecer online; transições de fase não entram na fila genérica.

### Critérios de aceite e testes

Completar a rotina escolhida com reflexo coerente na fase de origem e destino. Testar nascimento desconhecido, lote misto conforme suporte atual, quantidade maior que disponível, tentativa de transferir duas vezes, alteração concorrente e virada de dia. As regras documentadas em `docs/ai/api.md` para datas de fases devem permanecer iguais nos dois clientes.

**PRs sugeridos:** P11-A hub/listas; P11-B ficha/datas; P11-C primeira escrita; P11-D transferências; P11-E demais rotinas e indicadores por prioridade. Cada fase pode ser liberada por feature flag, com alternativas claras para as ainda não implementadas.

## Parte 12 — Plantações e operações agrícolas

**Resultado demonstrável:** consultar a área/ciclo e registrar as rotinas agrícolas priorizadas com unidade e contexto corretos. **Dependências:** P02–P04 e P09 quando houver consumo de estoque. **Responsáveis:** mobile/backend e usuário agrícola.

### Subpartes

12A: consulta de plantações e ciclos; 12B: primeira operação de campo; 12C: demais operações e anexos; 12D: colheita/custos apenas quando autorizados e priorizados.

### Tarefas

- [ ] P12.01 — Auditar `cropService.ts` e permissões; `can_operate_crops` não autoriza automaticamente estrutura, mão de obra, colheita ou histórico restrito ao operator.
- [ ] P12.02 — Definir hierarquia real entre fazenda, área/talhão, plantação e ciclo. Não criar uma hierarquia nova só para simplificar a navegação.
- [ ] P12.03 — Lista com busca e filtros de fazenda/situação suportados, detalhe operacional e acesso às atividades autorizadas.
- [ ] P12.04 — Exibir dashboard/indicadores somente quando úteis e permitidos; consulta de atividade deve funcionar sem depender de gráficos.
- [ ] P12.05 — Escolher primeira escrita entre operações existentes, como plantio/adubação, conforme uso real. Documentar insumos, área, dose, unidade e data antes de construir formulário.
- [ ] P12.06 — Evitar conversão silenciosa entre quantidade total e dose por área. Validar hectares, kg, litros e outras unidades efetivamente usadas no contrato.
- [ ] P12.07 — Confirmar relação da operação com estoque e lançamento financeiro; envio online deve resultar em uma transação coerente ou falha integral conforme a regra do backend.
- [ ] P12.08 — Integrar foto e localização pontual apenas para campos e finalidade existentes ou aprovados. Coordenada não substitui seleção autorizada de talhão.
- [ ] P12.09 — Não criar mapa pesado como requisito para registrar uma atividade simples. Adicionar mapa somente após caso de uso validado e orçamento de rede/memória.
- [ ] P12.10 — Colheita, custos e mão de obra seguem entregas próprias, com permissões e testes negativos; não habilitar pela mera presença de rota no serviço web.
- [ ] P12.11 — Observação/rascunho local pode ser retomado, mas operações com baixa de insumo dependem de P16 antes de qualquer envio automático.

### Critérios de aceite e testes

O usuário seleciona plantação/ciclo e registra uma operação permitida com os valores exatos esperados no backend. Testar área zero, unidades incompatíveis, ciclo encerrado, insumo removido, edição concorrente e operador agrícola tentando acessar colheita/financeiro restritos. Medir número de seleções repetidas em comparação ao PWA.

**PRs sugeridos:** P12-A consulta/contexto; P12-B primeira operação; P12-C estoque/efeitos; P12-D anexos/localização; P12-E colheita e gestão apenas quando priorizadas.

## Parte 13 — Gestão, relatórios, suporte e IA

**Resultado demonstrável:** consultar informações gerenciais e resolver necessidades de suporte sem poluir o fluxo de campo. **Dependências:** P02–P04; demais conforme origem do relatório. **Responsáveis:** mobile/backend/produto.

### Subparte 13A — Financeiro gerencial

- [ ] P13.01 — Validar capacidades e acesso server-side antes de consulta, inclusive contagens e indicadores. Perfil operacional não deve receber informação financeira oculta apenas por CSS.
- [ ] P13.02 — Criar lista paginada de títulos, filtros suportados e detalhe com situação e histórico; priorizar consulta no primeiro incremento.
- [ ] P13.03 — Projeção de caixa usa `/finance/transactions/projection/` e regras existentes; não calcular saldo a partir da página visível.
- [ ] P13.04 — Liquidação, estorno e criação ficam online em PRs separados, com conta, data, valor, confirmação e auditoria. Conferir concorrência e chaves no servidor antes de repetir tentativas.
- [ ] P13.05 — Não liberar fila offline financeira nesta proposta inicial. Rascunho de formulário não equivale a obrigação contabilizada nem pagamento realizado.

### Subparte 13B — Relatórios e exportação

- [ ] P13.06 — Selecionar relatórios de maior uso; implementar resumo legível e filtros curtos antes de gráficos extensos.
- [ ] P13.07 — Inventariar exportações existentes, distinguindo CSV/backend de PDF gerado no navegador. `Blob`, `document` e `URL.createObjectURL` do cliente web não são uma integração nativa pronta.
- [ ] P13.08 — Baixar/gerar arquivo pelo mecanismo aprovado e compartilhar com o sistema operacional; respeitar autorização, prazo de retenção e limpeza do arquivo temporário.
- [ ] P13.09 — Arquivo enviado para outro app sai do controle do cache interno; explicitar a ação de compartilhar e não fazê-la automaticamente.

### Subparte 13C — Suporte e perfil

- [ ] P13.10 — Integrar abertura/listagem/detalhe de tickets apenas com contexto que o usuário autorize compartilhar. Não anexar automaticamente histórico completo ou tokens.
- [ ] P13.11 — Reutilizar contratos específicos de `creation_key`, `request_key` e `expected_version` onde existirem, preservando conflito e reconciliação.
- [ ] P13.12 — Integrar anexo com upload nativo da Parte 14; erro de anexo não pode criar várias mensagens iguais.
- [ ] P13.13 — Perfil, troca de senha, preferências e informações de versão acessíveis em Mais, respeitando campos realmente editáveis.
- [ ] P13.14 — Alteração de idioma organizacional restrita ao administrador; para os demais, informar que o idioma vem da organização sem oferecer preferência conflitante.

### Subparte 13D — Assistente de IA

- [ ] P13.15 — Conferir `aiAssistantService.ts` e contratos de conversa, permissão, limites, cobrança e streaming quando existente. Não portar código SSE/browser sem avaliar o transporte nativo.
- [ ] P13.16 — Tratar IA como recurso online opcional. Conexão indisponível não deve impedir acesso às tarefas e rascunhos.
- [ ] P13.17 — Definir seleção explícita de contexto e revisar conteúdo sensível enviado. Resposta da IA não deve executar operação de estoque/financeiro sem fluxo autorizado e confirmação apropriada.
- [ ] P13.18 — Exibir falhas, limites e cancelamento com clareza; interromper requisição ao sair quando suportado sem perder uma operação de domínio já confirmada.

### Critérios de aceite e testes

Financeiro inexistente no perfil operacional, inclusive cache e links internos. Relatório corresponde aos mesmos filtros da web. Exportação abre e compartilha arquivo correto; limpeza não remove arquivo de outra sessão. Suporte repete envio sem duplicar quando o contrato garante; conflito conserva o texto digitado. IA respeita organização/idioma, indisponibilidade e limites.

**PRs sugeridos:** financeiro consulta; ações financeiras específicas; relatório/exportação; suporte; perfil; IA. Não agrupar tudo em uma única entrega nem condicionar publicação operacional à conclusão de toda a gestão.
