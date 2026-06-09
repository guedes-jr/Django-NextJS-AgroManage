# Plano de Ajustes: Lógica da Tabela de Desempenho por Fase

A solicitação exige que a tabela "Desempenho por Fase" da ficha técnica do lote exiba os resultados consolidados apenas quando a fase for **concluída**. Fases em andamento não devem mostrar resultados parciais, mas indicar que estão em andamento.

## User Review Required

- **Mortalidade**: Atualmente a mortalidade geral é calculada pela diferença entre a quantidade inicial e a quantidade atual do lote. Para o cálculo da mortalidade por fase, assumiremos que a quantidade ao final de uma fase anterior é o "inicial" da próxima fase (ex: Quantidade desmamada = Quantidade inicial da Creche. A diferença entre a Quantidade inicial da Creche e a Quantidade ao final da Creche será a mortalidade da Creche). 
- **Conversão Alimentar**: Como o consumo de ração está associado a datas específicas, a conversão da fase será calculada filtrando os registros de consumo de ração compreendidos entre a `entry_date` e `exit_date` da respectiva fase. Se não houver dados exatos, exibiremos `-`.

## Open Questions

- **Idade Final**: No vídeo/descrição, não fica explícito como tratar a idade ao fim de cada fase. Se a idade na creche terminou em 70 dias, o crescimento deve mostrar a idade final (ex: 140 dias) ou os dias decorridos DENTRO do crescimento? Assumiremos **Idade Total do Animal ao fim da fase**, que é o padrão (ex: Creche termina com 70 dias de vida, Crescimento termina com 145 dias de vida, etc).

## Proposed Changes

### 1. Backend (`backend/apps/livestock/serializers.py`)
- Alterar o `AnimalBatchSerializer` (método `to_representation`) para enviar explicitamente os dados de desmame e da maternidade, facilitando o preenchimento da primeira linha:
  - `weaning_date`
  - `weaned_quantity`
  - `avg_weaning_weight_kg`
  - `maternity_mortality` (diferença entre nascidos vivos e desmamados).

### 2. Frontend (`frontend/src/components/animal/BatchTechnicalSheetModal.tsx`)
- **Reescrever o array de dados "Desempenho por Fase":**
  - Identificar todas as fases completas (`type === 'phase'` no histórico) e a fase atual.
  - **Maternidade**: Preenchida caso o lote possua dados de desmame ou se a fase atual for Creche, Crescimento ou Terminação.
  - **Creche**: 
    - Se estiver concluída: buscar os dados correspondentes no array `history`.
    - Se `animal.phase === "creche"`: mostrar "Em andamento".
    - Se anterior a creche: mostrar "-".
  - **Crescimento**: Mesma lógica da Creche.
  - **Terminação/Engorda**: Mesma lógica da Creche.
- **Ajustes de Colunas**: Ajustar as colunas (Qtd Inicial, Qtd Atual, Idade, Peso Médio, Peso Total, GPD, Conversão Alimentar, Mortalidade) para extrair e calcular valores referentes a cada bloco isolado de forma consolidada.
