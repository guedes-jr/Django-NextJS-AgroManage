# Etapa 1 — estudo OCTA Agro e comparação com o AgroManage

**Data:** 30/10/2026. **Situação:** estudo público e comparação do recorte concluídos; melhorias propostas ainda não implementadas nesta etapa.

[Sequência de estudo](sequencia-estudo.md) · [Materiais OCTA Agro](octaagro.md) · [Catálogo geral](README.md)

## 1. Resultado principal

A contribuição mais útil da OCTA Agro para esta etapa é a organização de **financeiro, estoque e mapa como partes integradas da operação**. O AgroManage já tem componentes importantes nesses domínios. A comparação indica que devemos reforçar a consistência e a rastreabilidade dessas integrações antes de acrescentar capacidades avançadas.

Foram reproduzidos quatro comportamentos do AgroManage em um banco SQLite em memória, usando seus serializadores e serviços reais:

1. Uma conta com saldo inicial de R$ 1.000 e uma receita paga de R$ 400 continuou com `current_balance = 0` no caminho examinado.
2. O consumo bovino foi vinculado à fazenda correta, mas sua movimentação de estoque recebeu outra fazenda da mesma organização, escolhida pelo fallback do serviço compartilhado.
3. Um lote de insumo com custo gerou uma despesa automaticamente paga e sem fazenda, mesmo sem dados explícitos de liquidação.
4. O saldo do lote foi alterado por seu serializer sem criação de uma movimentação correspondente.

Os itens 1, 2 e 4 são oportunidades de correção de consistência. O item 3 é uma regra atual de negócio a rever para suportar compras a prazo: não significa que toda compra à vista esteja errada. As observações não provam erro em todos os caminhos da aplicação.

## 2. Fontes e limites da evidência

| Fonte pública consultada | Informação aproveitada | Evidência |
|---|---|---|
| [Plataforma](https://octaagro.com.br/plataforma) | Organização modular, múltiplas propriedades e papéis | Documentado pelo fornecedor |
| [Produtores rurais](https://octaagro.com.br/produtores-rurais) | Relação entre tarefas administrativas da propriedade | Apresentação comercial |
| [Financeiro rural](https://octaagro.com.br/modulos/financeiro-rural) | Parcelas, baixas, reversão, rateio, contas e conciliação | Documentado pelo fornecedor |
| [Estoque rural](https://octaagro.com.br/modulos/estoque-rural) | Almoxarifados, lotes, eventos e saldo | Documentado pelo fornecedor |
| [Geo Rural](https://octaagro.com.br/modulos/geo-rural) | Importação e prévia de mapa, área/perímetro e exportação | Documentado pelo fornecedor |
| [Segurança](https://octaagro.com.br/seguranca) | Organização, autorização e autoria das operações | Declaração pública, sem auditoria externa |

As seis páginas foram relidas diretamente por HTTP porque a ferramenta de navegação não as abriu. Os [registros de consulta](octaagro-fontes.json) contêm URL, data e hash do HTML recuperado, sem republicação integral das páginas.

Não houve acesso autenticado à OCTA Agro, cadastro, contato comercial ou teste de sua aplicação. Não foram encontrados nesta amostra vídeos ou formulários bovinos. Portanto, este estudo compara **capacidades documentadas pelo fornecedor** com **caminhos de código e comportamentos locais verificados**; não apresenta as declarações comerciais como funcionamento auditado.

## 3. Recorte do AgroManage examinado

Foram consultadas apenas dependências diretamente relacionadas ao estudo:

- [Modelos financeiros](../../../../backend/apps/finance/models.py), [serializers](../../../../backend/apps/finance/serializers.py), [views](../../../../backend/apps/finance/views.py), [integrações por signals](../../../../backend/apps/finance/signals.py) e [serviços](../../../../backend/apps/finance/services.py).
- [Modelos de estoque](../../../../backend/apps/inventory/models.py), [serializers](../../../../backend/apps/inventory/serializers.py), [views](../../../../backend/apps/inventory/views.py) e [serviços de movimentação](../../../../backend/apps/inventory/services.py).
- [Serviços bovinos](../../../../backend/apps/livestock/cattle_services.py), [validações bovinas](../../../../backend/apps/livestock/cattle_serializers.py) e [serviço compartilhado de venda](../../../../backend/apps/livestock/services.py).
- [Fazendas e setores](../../../../backend/apps/farms/models.py), [cadastros agrícolas](../../../../backend/apps/crops/models.py) e seus campos geográficos pertinentes.
- [Página financeira](../../../../frontend/src/app/home/financeiro/page.tsx), [listagem de transações](../../../../frontend/src/components/dashboard/TransactionManager.tsx) e [painel financeiro](../../../../frontend/src/components/dashboard/FinanceDashboard.tsx).

Não se trata de auditoria completa do ERP. Ausências estão limitadas a esse recorte. A comparação não altera a autorização existente nem sugere duplicar os cadastros compartilhados dentro de Bovinos.

## 4. Comparação funcional

### 4.1 Organização e navegação

A OCTA apresenta áreas especializadas dentro de uma plataforma comum e descreve acesso por papéis e organizações. Isso é referência de organização, não motivo para copiar seus planos ou seus nomes de cargos. [Fonte](https://octaagro.com.br/plataforma).

O AgroManage já reúne financeiro, estoque, fazendas e rebanhos. A tela bovina também ganhou navegação por área e aproveita o padrão visual dos suínos. **Decisão: manter essa base.** A melhoria candidata é facilitar a navegação de uma operação até seus documentos de origem, sem criar outro financeiro ou outro estoque no módulo bovino.

Exemplo proposto: na ficha de uma venda, abrir seu lançamento financeiro; na linha de consumo, abrir as movimentações que baixaram os lotes de ração. A relação deve usar identificadores persistidos, com permissão revalidada no destino.

### 4.2 Financeiro: estrutura existente e diferenças

O material OCTA descreve títulos parcelados, baixa com ajustes, reversão rastreável, distribuição entre centros de custo e importação de extratos com confirmação humana. [Fonte](https://octaagro.com.br/modulos/financeiro-rural).

No AgroManage, `Transaction` já tem valor, vencimento, pagamento, situação, categoria, conta, propriedade, lote animal e espécie. `FinancialCategory` já admite uma categoria pai. Porém:

- Categoria financeira e centro de custo são eixos diferentes. Uma categoria como alimentação não substitui a distribuição do gasto entre lotes ou atividades.
- Não foi identificado no recorte um modelo de parcelas/recorrência, de baixas parciais ou de rateio percentual.
- O fluxo genérico de transações permite edição/exclusão; não foi identificado um documento de reversão de baixa equivalente ao fluxo descrito no material externo.
- O painel usa o `current_balance` armazenado nas contas, enquanto as receitas/despesas são agregadas das transações. O cenário local mostrou que esses números podem não acompanhar uns aos outros.
- A listagem do backend filtra tipo e situação. Filtros completos de fazenda, atividade e período precisam de evolução; os vínculos no modelo, isoladamente, não os implementam.
- A interface financeira consultada inclui botões de exportação/configuração sem ação associada nesse componente. A presença do botão não comprova a capacidade.

**Decisão:** reforçar o domínio financeiro compartilhado. A arquitetura do saldo pode usar cálculo direto ou projeção materializada, desde que tenha uma origem reconstruível e seja reconciliável; não é necessário copiar a implementação interna anunciada por outro fornecedor.

### 4.3 Compra, venda e dinheiro recebido/pago

Os caminhos atuais já integram compras e vendas ao financeiro, mas alguns assumem liquidação imediata:

- O signal de lote de insumo com custo cria uma despesa com `status="paid"` e sem fazenda nesse caminho.
- O signal de compra de lote animal também cria a transação como paga. A referência ajuda a atualizar o mesmo documento em vez de duplicá-lo, mas não constitui fluxo de parcelas/baixas.
- `register_batch_sale` cria a receita paga na data da venda. Isso atende ao fluxo atual à vista e ainda não representa uma venda a prazo.

**Proposta:** separar data e valor da operação comercial, título a pagar/receber e efetiva liquidação. Compra a prazo deve gerar obrigação pendente; venda a prazo, recebível. A entrada física ou saída do rebanho não deve, sozinha, provar a movimentação de dinheiro.

**Correção documental:** o contrato bovino anterior dizia que o valor de compra do lote era apenas gerencial. O código compartilhado dispara uma transação financeira. A frase foi corrigida em [docs/ai/api.md](../../../ai/api.md), sem mudança de comportamento da aplicação.

### 4.4 Estoque: reaproveitar e tornar a origem mais consistente

A OCTA descreve almoxarifados e movimentos por lote, com saldo derivado da movimentação. [Fonte](https://octaagro.com.br/modulos/estoque-rural).

O AgroManage já tem itens, lotes, validade, fornecedores, custo e movimentos. O saldo do item é a soma de `quantidade_atual` dos lotes ativos. A alimentação bovina já deduz o estoque em transação atômica e preserva o custo do consumo.

Diferenças verificadas:

- `quantidade_atual` é um saldo persistido do lote e permanece gravável pelo serializer desse cadastro. Alterá-lo diretamente não gerou movimento no cenário isolado.
- `registrar_movimentacao` escolhe uma fazenda da organização pelo fallback, sem receber a fazenda efetiva do manejo. No consumo de outra fazenda, os dois documentos ficaram divergentes.
- Local de armazenamento é um campo de escolha no lote; não foi identificado, no modelo examinado, um almoxarifado como entidade por propriedade com transferências próprias.

**Decisão:** manter os serviços e os lotes existentes, corrigir a atribuição de fazenda e formalizar ajustes como eventos. Um saldo materializado pode continuar existindo para desempenho, mas alterações precisam de causa rastreável e capacidade de conferência.

Não foi avaliada aqui a concorrência de todos os serviços de estoque. O consumo bovino já possui bloqueio/atomicidade; isso não deve ser descartado nem tratado como recurso ausente.

### 4.5 Mapas: diferença entre ponto, hectares e polígono

Geo Rural descreve importação KML/KMZ com prévia, contornos, cálculo de área/perímetro e exportação. O CAR é descrito como referência manual, sem consulta automática governamental. [Fonte](https://octaagro.com.br/modulos/geo-rural).

No recorte do AgroManage:

- Fazenda possui coordenadas e área informada.
- Setor e talhão têm dados de área; talhão também tem coordenadas.
- Pastagem bovina tem hectares, capacidade e histórico de ocupação coletiva.
- Não foi localizado nesses modelos/fluxos um contorno geográfico persistido de pastagem ou importação KML/KMZ com prévia/confirmacão.

**Proposta:** uma base geográfica compartilhada, integrada às entidades existentes. Coordenada pontual não deve ser apresentada como polígono, e área digitada não deve ser rotulada como calculada.

Fluxo candidato: selecionar arquivo → visualizar áreas → validar contornos e vínculos → conferir nomes/medidas → confirmar → vincular às pastagens/talhões. A prévia não grava o cadastro definitivo. Reenviar a confirmação não pode criar áreas duplicadas.

Essa evolução é posterior às correções de consistência. O estudo da OCTA não comprova, por si só, necessidade de substituir os cadastros de setor/pastagem existentes.

## 5. Matriz de diferenças e decisões

| ID | Tema | AgroManage no recorte | Evidência | Decisão |
|---|---|---|---|---|
| O-01 | Conta e saldo | Corrigido: saldo inicial + receitas pagas − despesas pagas, atualizado em gravações normais | Testes de financeiro; migração de reconciliação | Implementado |
| O-02 | Fazenda do consumo | Corrigido: fazenda efetiva transmitida pelos serviços bovino, agrícola e de vacinação | Testes de serviço e regressão bovina com duas fazendas | Implementado para novos movimentos; histórico preservado |
| O-03 | Compra com custo | Compras geram títulos em aberto; compra de insumo à vista exige conta/data e registra baixa | Testes de compra a prazo e à vista | Implementado; fazenda explícita e uma despesa por recebimento |
| O-04 | Ajuste de saldo | Corrigido após o diagnóstico: saldo protegido e conferência gera movimento assinado com motivo e responsável | API e testes de inventário | Implementado; registros históricos não foram reconstruídos |
| O-05 | Categoria hierárquica | Já existe | Código | Reaproveitar; não confundir com centro de custo |
| O-06 | Vínculo produtivo | Fazenda/lote/espécie/plantação disponíveis na interface e filtros | Contrato API e TypeScript | Implementado, com validação de coerência da propriedade |
| O-07 | Baixas, parcelas e reversões | Baixa integral/estorno com histórico; parcelas e recorrência mensal finita separadas | Testes de idempotência, soma exata e datas mensais | Implementado para liquidação integral; baixa parcial fica pendente |
| O-08 | Rateio por atividade | Sem entidade percentual identificada no recorte | Inspeção delimitada | Investigar e especificar apropriação sem duplicidade |
| O-09 | Conciliação OFX/CSV | Não localizada nos arquivos examinados | Inspeção delimitada | Projeto posterior de importação e correspondência |
| O-10 | Área e capacidade de pasto | Já existem | Código | Manter e enriquecer com geometria quando necessário |
| O-11 | Importação geográfica | Não localizada no recorte | Inspeção delimitada | Propor prévia e confirmação compartilhadas |
| O-12 | Navegação por módulos | Já organizada e padronizada | Código/interface existente | Preservar o padrão suíno e acrescentar links de origem |

Nenhuma linha marcada como ausência delimitada significa busca exaustiva de todo o repositório. Antes de implementar, a investigação deve seguir as dependências exatas do fluxo escolhido.

## 6. Verificações locais executadas

[Resultados estruturados](octaagro-verificacoes.json).

**Ambiente:** `config.settings.test`, SQLite `:memory:`, migrações aplicadas apenas à base descartável. Foram criados exclusivamente dados sintéticos. O enfileiramento de entrega de notificações foi substituído por mock na execução registrada, sem envio externo.

| Cenário | Observação reproduzida | Alcance da conclusão |
|---|---|---|
| Conta inicial 1.000 + receita paga 400 | `current_balance` permaneceu 0 | Caminho dos serializers e gravação examinados; não auditoria de todos os lançamentos |
| Consumo de 3 kg de um saldo de 20 kg, a R$ 2/kg | Saldo 17 kg e custo R$ 6; fazenda do movimento diferente da fazenda do consumo | Serviço bovino e helper compartilhado exercitados |
| Lote de insumo de 20 unidades a R$ 2 | Despesa R$ 40, paga automaticamente, sem fazenda | Signal de criação do lote exercitado |
| Alteração do saldo do lote para 15 | Serializer gravou 15 sem acrescentar movimento | Caminho de edição do lote pelo serializer |

São verificações diagnósticas, não quatro novos testes de regressão aprovando o comportamento como desejado. Não houve teste HTTP completo ou validação visual de cada cenário. Nenhuma migração ou escrita foi feita no PostgreSQL local do usuário.

## 7. Melhorias propostas, em ordem de execução

### Incremento A — integridade dos dados já existentes

| Prioridade | Melhoria | Benefício | Esforço inicial estimado | Aceite verificável |
|---|---|---|---|---|
| P0 | Transmitir a fazenda efetiva às movimentações de consumo | Relatórios coerentes por propriedade | Pequeno/médio, conforme outros chamadores | Consumo em B registra movimento em B mesmo com A como fallback; outra organização continua rejeitada |
| P0 | Saldo bancário reconciliável com os lançamentos | Confiabilidade do painel | Médio; envolve baixas, correções e contas | Inicial 1.000 + receita paga 400 − despesa paga 100 resulta em 1.300; pendências não alteram o realizado |
| P0 | Ajuste de estoque com documento de origem | Preservar trilha do saldo | Médio; envolve edição e dados anteriores | Ajustar 17 para 15 gera evento de −2 com motivo; não permite saldo editado sem causa |

P0 indica integridade no escopo do estudo, não incidente de segurança confirmado. As estimativas são preliminares e devem ser refinadas ao delimitar cada mudança.

### Incremento B — completar o ciclo financeiro

1. Compra/venda à vista ou a prazo com datas, conta e estado explícitos.
2. Baixas e reversões rastreáveis, distinguindo documento comercial e liquidação.
3. Parcelas e recorrência como conceitos separados.
4. Filtros por propriedade, atividade, conta e período e navegação entre origem e financeiro.
5. Completar as ações de interface que hoje aparecem sem implementação no componente examinado.

**Aceite mínimo:** venda a prazo não aumenta caixa realizado; recebimento efetivo aumenta; reversão devolve o efeito e preserva a origem; um clique repetido não duplica a baixa.

### Incremento C — apropriação e conciliação

- Centro de custo distinto da categoria financeira, com distribuição explícita por atividade/lote.
- Uma única despesa de origem e parcelas apropriadas que somem exatamente o total, sem repetir custo já contabilizado no consumo.
- Importação de extrato com prévia, detecção de repetição e correspondências confirmadas pelo usuário.

**Aceite mínimo:** R$ 100 rateados 60%/40% continuam R$ 100; reimportar o mesmo extrato não duplica lançamentos nem baixas. O método de apropriação deve respeitar o modelo de custeio escolhido.

### Incremento D — base geográfica compartilhada

- Contorno persistido e cálculo explícito de área/perímetro.
- Importação com conferência antes de gravar e vínculo às entidades existentes.
- Histórico e exportação apenas conforme necessidade operacional definida.

**Aceite mínimo:** prévia não altera cadastros; geometria inválida não é confirmada; a mesma confirmação não cria duplicidade; outra organização não recebe vínculo ou arquivo indevido.

## 8. Decisões de produto

**Adotar como princípios:** saldo com origem verificável; operação e liquidação separadas; ajustes e reversões com histórico; integração entre módulos; importação com conferência.

**Preservar:** o padrão visual aprovado dos suínos, o financeiro/estoque compartilhados, o consumo bovino atômico, as permissões por organização e as funcionalidades pecuárias já implementadas.

**Investigar antes de implementar:** centro de custo/apropriação, almoxarifados por propriedade e geometria compartilhada com setores/talhões/pastagens.

O estudo não fornece evidência de um fluxo bovino especializado da OCTA, nem justifica acrescentar todos os módulos anunciados ao AgroManage. Licenças ambientais, RH e outros domínios fora do recorte não foram detalhados nesta etapa.

## 9. Encerramento da etapa

Foram produzidos o diagnóstico, a comparação, quatro verificações locais e um conjunto priorizado de melhorias. O diagnóstico original foi documental. A implementação posterior entregou os incrementos A/B descritos abaixo; os dados históricos não tiveram situações de pagamento ou fazendas reinterpretadas.

**Próxima etapa de estudo na sequência:** VSM Agro. Os incrementos C/D continuam como propostas de produto a especificar. Não foram implementados rateio por centro de custo, importação bancária ou geometria compartilhada nesta etapa.

Atualização O-04: a reprodução acima descreve o estado anterior à correção. O contrato atual de ajustes está em [API Guide](../../../ai/api.md#stock-counts). A tela de movimentações oferece ajuste por contagem física, com diferença visível e proteção contra saldo desatualizado.


### Implementação posterior — incrementos A/B

- Saldos reconciliáveis com lançamentos; reconciliação inicial pela migração `finance.0007`.
- Contexto da fazenda nos consumos e nas novas compras/vendas.
- Compras com recebimento de estoque separado do pagamento, inclusive reposição do mesmo lote.
- Baixa integral e estorno com responsável, datas, conta, motivo e identificação de repetição. Títulos históricos pagos conservam sua situação original.
- Parcelamento do total e recorrência mensal finita, com soma exata e tratamento do fim do mês.
- Busca, paginação, filtros produtivos, histórico, links de origem, exportação CSV e cadastro/desativação de contas/categorias.
- Ajuste de inventário O-04 preservado; compras vinculadas ao financeiro não podem ser apagadas/alteradas isoladamente.

[Contrato implementado](../../../ai/api.md#financial-posting-and-settlements-octa-study-increments-ab).
Baixas parciais, rateio, conciliação OFX/CSV e importação geográfica não foram incluídos e continuam explícitos no estudo, sem controles de interface simulados.

Validação da implementação: 185 testes de financeiro, estoque, pecuária, agricultura e exportação/recuperação passaram no recorte integrado; a proteção adicional de origens financeiras legadas foi validada em teste específico posterior. TypeScript e lint dos novos componentes financeiros aprovados. Migrações `finance.0006` e `finance.0007` aplicadas no PostgreSQL local. A interface financeira foi conferida no navegador sem gravar operações de teste na base do usuário.
