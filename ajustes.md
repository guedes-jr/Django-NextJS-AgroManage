# Ajuste da tela de Detalhes da Produção

Analise a implementação atual da tela de detalhes da produção e faça as alterações abaixo, preservando o restante da funcionalidade.

## Objetivo

Simplificar a tela removendo informações duplicadas e substituir alguns indicadores financeiros pelos indicadores realmente úteis para o produtor.

## 1. Alterar a seção "Histórico"

Atualmente existe uma seção chamada **Histórico**.

Essa seção possui informações que já estão sendo apresentadas na parte inferior da tela, gerando duplicidade.

### Alterações

* Renomear a seção **Histórico** para **Relatórios**.
* Remover da seção todas as informações que já aparecem no resumo inferior da página.
* A seção "Relatórios" deverá ficar destinada apenas aos relatórios relacionados à produção, evitando repetir dados já apresentados em outros locais.

---

## 2. Ajustar o Resumo de Produção

Na seção **Resumo de Produção**, incluir novos indicadores financeiros.

### Adicionar

Calcular e exibir:

* **Custo por kg produzido**

  * Valor total investido ÷ quantidade produzida.

* **Preço médio de venda por kg**

  * Receita total ÷ quantidade vendida.

* **Lucro por kg**

  * (Receita total − investimento total) ÷ quantidade produzida.

Esses três indicadores devem aparecer claramente no resumo, pois são as informações mais importantes para o produtor.

Exemplo:

* Custo por kg: R$ X,XX
* Venda por kg: R$ X,XX
* Lucro por kg: R$ X,XX

---

## 3. Remover indicadores

Remover completamente:

* Receita estimada
* ROI

Esses indicadores não devem mais ser exibidos na interface.

---

## 4. Manter apenas os indicadores abaixo

O resumo financeiro deve exibir apenas:

* Investimento Total
* Custo por hectare
* Receita por hectare
* Lucro real da produção

Onde:

**Investimento Total**
Valor total gasto na produção.

**Custo por hectare**
Investimento total dividido pela área plantada.

**Receita por hectare**
Receita total obtida dividida pela área plantada.

**Lucro real**
Receita total menos investimento total.

---

## 5. Regras

* Não alterar a lógica existente de cálculo da produção.
* Apenas reorganizar os indicadores exibidos.
* Reutilizar os dados já existentes sempre que possível.
* Evitar cálculos duplicados.
* Caso algum indicador já exista no backend, apenas reutilizá-lo.
* Manter o layout atual, alterando apenas os componentes necessários.

---

## Resultado esperado

Ao final, a tela deverá:

* não possuir informações duplicadas;
* possuir uma seção chamada **Relatórios** no lugar de **Histórico**;
* exibir no resumo:

  * Investimento Total;
  * Custo por hectare;
  * Receita por hectare;
  * Lucro real;
  * Custo por kg;
  * Venda por kg;
  * Lucro por kg;
* não exibir mais **Receita Estimada** nem **ROI**;
* manter a interface limpa, objetiva e focada nas informações financeiras realmente úteis ao produtor.
