# Partes 09 a 13 — Expansão por domínio

[Voltar ao plano](../IMPLEMENTACAO.md). Estas partes ampliam o produto após o primeiro fluxo completo. Podem ser reordenadas conforme o piloto, sem antecipar dependências de autorização, contrato ou armazenamento. Não é necessário concluir todos os domínios para publicar uma primeira versão útil.

Cada domínio deve repetir o mesmo ciclo: conferir contrato → prototipar jornada → consulta real → escrita online → estados e testes → piloto → avaliar offline. Uma tela sem integração real não conta como módulo concluído.

## Parte 09 — Tratos, alimentação e estoque

**Resultado demonstrável:** alimentar o lote autorizado e conferir o efeito real no estoque sem duplicar fornecimento. **Dependências:** P02–P04, contexto P06; P08 apenas para rascunhos. **Responsáveis:** mobile/backend/operador de trato.

### Subparte 09A — Consulta do trato diário

- [ ] P09.01 — Integrar `cattleDailyFeedingService.get`, preservando lote, fazenda, quantidade de cabeças, fornecimentos, fórmulas e produtos autorizados.
- [ ] P09.02 — Priorizar para feeder os lotes que pode operar; não colocar uma página geral de gestão antes da atividade principal.
- [ ] P09.03 — Mostrar quantidade fornecida e histórico por lote; valores devem ser do servidor e não soma improvisada que ignore cancelamentos ou regras de data.
- [ ] P09.04 — Confirmar se o endpoint aceita filtro de fazenda/data. Não apresentar filtros que o servidor ignora, nem presumir que a data atual do aparelho define o dia operacional.

### Subparte 09B — Fornecimento online

- [ ] P09.05 — Formulário com lote, fórmula ou item conforme contrato, quantidade em kg, data e observação. Exibir unidade junto ao valor e evitar troca implícita entre kg, saco e unidade.
- [ ] P09.06 — Gerar `request_key` estável para uma mesma intenção de fornecimento e mantê-la durante reconciliação/retry autorizado. Só criar outra chave para uma nova operação consciente.
- [ ] P09.07 — Provar no backend o tratamento da chave: duas chamadas simultâneas, mesmo payload, payload diferente e escopo de usuário/tenant. Presença do campo no cliente não basta.
- [ ] P09.08 — Validar transação entre registro do fornecimento e baixa de estoque; se uma falhar, a outra não pode ficar isolada. Conferir auditoria e lote de estoque quando aplicável.
- [ ] P09.09 — Após confirmação, atualizar trato e consultas de estoque afetadas. Não mostrar saldo otimista como definitivo.
- [ ] P09.10 — Tratar saldo insuficiente, produto inativo, fórmula alterada e permissão revogada. Um rascunho de fórmula antiga exige nova validação.

### Subparte 09C — Consulta e operações de estoque

- [ ] P09.11 — Inventariar endpoints de itens, saldos, depósitos/lotes e movimentos usados pelo frontend. Conferir contratos em `stockAdjustmentService.ts` e backend `inventory` antes de nomear novas rotas.
- [ ] P09.12 — Criar consulta paginada com busca, unidade, saldo e localização permitida. Preço e custo ficam condicionados ao acesso.
- [ ] P09.13 — Detalhe de item com lotes/validade e histórico sob demanda; não assumir que estoque de fazendas diferentes é intercambiável.
- [ ] P09.14 — Se inventário físico for incluído, distinguir contagem de ajuste efetivo. Aprovação, motivo, concorrência e trilha de auditoria devem seguir o backend.
- [ ] P09.15 — Entradas, ajustes e transferências ficam online e em incremento separado. Não incluir edição de saldo como campo direto da ficha.

### Critérios de aceite e testes

Um fornecimento confirmado resulta em uma única baixa correta. Feeder não consegue consultar custos nem operar lote não autorizado por URL ou chamada direta. Testar toque duplo, timeout após commit, disputa pelo último saldo, unidade incompatível, lote vencido conforme regra atual, repetição da chave e interrupção da resposta.

**PRs sugeridos:** P09-A consulta; P09-B contrato/atomicidade backend quando necessário; P09-C fornecimento; P09-D estoque consulta; P09-E inventário/ajustes se priorizados. A fila offline do trato só entra após P16 e testes específicos.

## Parte 10 — Clínica, sanidade e vacinação

**Resultado demonstrável:** consultar o histórico sanitário e registrar uma ocorrência autorizada sem perder vínculo com animal/lote ou estoque. **Dependências:** P02–P04 e contexto de entidades P06 ou P11. **Responsáveis:** mobile/backend e usuário responsável por sanidade.

### Subparte 10A — Consulta e triagem operacional

- [ ] P10.01 — Conferir contratos de registros clínicos, doenças/sintomas, medicamentos, vacinas e alertas em `clinicalService.ts` e backend. Substituir tipos incompletos apenas no recorte usado.
- [ ] P10.02 — Definir quais registros pertencem a animal e quais aceitam lote, espécie ou fazenda. Não converter identificador de lote em animal para reutilizar formulário.
- [ ] P10.03 — Criar histórico com data, tipo, responsável, situação e acesso aos detalhes; carregar textos/anexos sob demanda.
- [ ] P10.04 — Mostrar alertas e pendências com a classificação do servidor. A interface não cria recomendações diagnósticas ou regras sanitárias próprias.

### Subparte 10B — Registro e vacinação

- [ ] P10.05 — Formulário de ocorrência com entidade, data/hora, observação e demais obrigatórios reais. Preservar autoria e não permitir edição de campos controlados pelo backend.
- [ ] P10.06 — Formulário de vacinação com produto, quantidade/unidade, data, próxima dose quando aplicável e identificação do estoque conforme contrato.
- [ ] P10.07 — Separar registro administrativo de vacinação de movimentação efetiva de medicamento. Se o servidor integra os dois, provar atomicidade e regra de cancelamento.
- [ ] P10.08 — Expor campos de carência, prescrição e acompanhamento somente se já suportados e adequados ao papel; não inferir prazos a partir de texto livre.
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
