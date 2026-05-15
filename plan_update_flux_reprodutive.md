Atualize o módulo de reprodução suína do sistema para refletir corretamente o ciclo reprodutivo das matrizes, considerando que existem diferenças entre uma marrã (primeira cobertura) e uma matriz já parida.

# Objetivo do módulo

Criar um fluxo reprodutivo completo para suínos, controlando todas as fases da vida reprodutiva da matriz, desde a entrada como marrã até os ciclos contínuos de reprodução após o primeiro parto.

O sistema deve funcionar por fases/abas operacionais.

---

# Estrutura correta das fases

## 1. Marrã

A fase `Marrã` representa:

* fêmeas jovens
* sem histórico de parto
* nunca pegaram cria
* ainda não se tornaram matrizes produtivas

Quando cadastrada/comprada:

* entra inicialmente em:

  * `Marrã`

---

## 2. Gestação

Quando ocorrer cobertura/inseminação:

A marrã:

* sai de `Marrã`
* vai para:

  * `Gestação`

Status:

* `Aguardando confirmação de prenhez`

Após 21 dias:

* permitir confirmação da prenhez

Se prenha:

* continua em `Gestação`

Se não prenha:

* retornar para:

  * `Marrã`

---

## 3. Maternidade

Após 114 dias de gestação:

Liberar:

* `Confirmar Parto`

Ao confirmar:

* mover automaticamente para:

  * `Maternidade`

Campos do parto:

* data do parto
* horário inicial
* horário final
* quantidade total de leitões
* leitões vivos
* natimortos
* mumificados
* observações

Status:

* `Lactação`

---

# NOVA REGRA IMPORTANTE

Após sair da maternidade:

A fêmea NÃO deve:

* voltar para `Marrã`
* voltar para `Gestação`

Porque:

* ela já é uma matriz produtiva
* já possui histórico de cria

---

# Nova fase obrigatória

Criar uma nova aba/fase chamada:

## Sugestão principal

* `Aguardando Cobertura`

Outras sugestões possíveis:

* `Aguardando Cio`
* `Matriz em Descanso`
* `Pré-Cobertura`
* `Retorno Reprodutivo`
* `Reprodução`
* `Ciclo Reprodutivo`

A recomendação é utilizar:

* `Aguardando Cobertura`

Pois representa melhor a realidade operacional.

---

# Fluxo atualizado correto

## Primeiro ciclo

```text
Marrã
   ↓
Gestação
   ↓
Maternidade
   ↓
Aguardando Cobertura
```

---

# Próximos ciclos

Depois da maternidade:

```text
Aguardando Cobertura
   ↓
Gestação
   ↓
Maternidade
   ↓
Aguardando Cobertura
```

---

# Regras de negócio atualizadas

## Marrã

Representa:

* animais sem parto anterior

## Aguardando Cobertura

Representa:

* matrizes já produtivas
* aguardando novo cio
* aguardando nova inseminação/cobertura

## Gestação

Representa:

* fêmeas prenhas
* aguardando parto

## Maternidade

Representa:

* período pós-parto/lactação

---

# Regras automáticas

## Ao cadastrar animal

→ entrar em `Marrã`

---

## Ao registrar cobertura

### Se estiver em:

* `Marrã`
  ou
* `Aguardando Cobertura`

Então:

* mover para `Gestação`

---

## Após 21 dias

Liberar:

* confirmação de prenhez

### Se negativa

Retornar para:

* fase anterior

Exemplo:

* se veio de Marrã → voltar para Marrã
* se veio de Aguardando Cobertura → voltar para Aguardando Cobertura

---

## Após 114 dias

Liberar:

* confirmação de parto

---

## Ao confirmar parto

Mover para:

* `Maternidade`

---

## Ao finalizar maternidade/desmame

Mover automaticamente para:

* `Aguardando Cobertura`

---

# Melhorias recomendadas

## Controle de ciclo reprodutivo

Adicionar:

* número do parto
* ordem da cria

Exemplo:

* 1ª cria
* 2ª cria
* 3ª cria

---

# Indicadores importantes

Dashboard com:

* taxa de prenhez
* intervalo entre partos
* retorno ao cio
* média de leitões vivos
* mortalidade
* número de partos por matriz

---

# Estrutura recomendada das entidades

## Animal

* id
* identificação
* fase_atual
* status
* numero_de_partos
* ultimo_parto
* origem

---

## Cobertura

* animal_id
* data_cobertura
* tipo
* macho
* observações

---

## Prenhez

* cobertura_id
* confirmada
* data_confirmacao

---

## Parto

* animal_id
* ordem_parto
* data_parto
* hora_inicio
* hora_fim
* total_leitoes
* vivos
* natimortos
* mumificados

---

# Objetivo final da implementação

Criar um fluxo reprodutivo fiel à operação real de granjas suínas, diferenciando corretamente:

* marrãs
* matrizes já produtivas
* gestação
* maternidade
* retorno reprodutivo

Garantindo automações inteligentes, rastreabilidade completa e facilidade operacional para o produtor.
