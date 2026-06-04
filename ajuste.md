# PENDÊNCIAS E MELHORIAS DO SISTEMA

## 1. ABA MARRÃS – REGISTRO DE CIO

Implementar a opção "Registrar Cio".

### Funcionamento:

Ao registrar o primeiro cio da marrã, o sistema deve:

* Salvar a data do primeiro cio.
* Gerar automaticamente uma previsão para o próximo cio em 21 dias.
* Gerar uma nova previsão para o terceiro cio em mais 21 dias.

Exemplo:

1º Cio → 01/05/2026

2º Cio (previsto) → 22/05/2026

3º Cio (previsto) → 12/06/2026

### Objetivo:

A cobertura será realizada normalmente no terceiro cio.

### Ficha da Marrã

Na ficha da marrã deve aparecer:

* Data do 1º cio
* Data do 2º cio
* Data do 3º cio
* Situação atual
* Data prevista para cobertura

---

## 2. ABA GESTAÇÃO – CONFIRMAÇÃO DE PARTO

Atualmente já existem os campos:

* Matriz
* Data do parto
* Nascidos vivos
* Natimortos
* Mumificados

Adicionar:

* Horário de início do parto
* Horário de término do parto

### Exemplo:

Início do parto: 03:15

Fim do parto: 06:45

### Ficha da Matriz

Essas informações devem aparecer no histórico reprodutivo da matriz.

---

## 3. MATERNIDADE – PROCEDIMENTOS / MANEJOS

Na opção "Registrar Procedimento / Manejo" deixar apenas:

### Opção 1 – Transferência de Leitões

Ao selecionar:

Campos:

* Quantidade de leitões
* Matriz origem
* Matriz destino
* Data
* Observação

Exemplo:

Transferir 3 leitões da matriz 045 para a matriz 062.

Registrar automaticamente na ficha das duas matrizes.
### Opção 2 – Aplicação de Medicamentos

Ao selecionar:

O sistema deve entender que o medicamento será aplicado aos leitões daquela leitegada.

Campos:

* Medicamento
* Dosagem
* Data
* Motivo
* Responsável

### Histórico

Quando esse lote for desmamado e entrar na Creche, o histórico deve acompanhar o lote.

Exemplo:

Aplicado Ferro Injetável na maternidade.

Essa informação deve aparecer futuramente na ficha do lote da Creche, Crescimento e Engorda.

---

## 4. FICHA DA MATRIZ – HISTÓRICO REPRODUTIVO

No histórico reprodutivo adicionar:

### Na frente de cada parto: ou entao fazer outra tabela de parto em baixo 

* Peso médio ao nascer
* Peso médio ao desmame


### Histórico de cios

Também incluir:

* Data do 1º cio
* Data do 2º cio
* Data do 3º cio
* Datas futuras registradas

Objetivo:

Ter todo histórico reprodutivo da matriz em um único local.

---

## 5. ABA CRECHE – JUNTAR LOTES

Implementar função:

### "Juntar Lotes"

Exemplo:

Lote 001 = 20 leitões

Lote 002 = 18 leitões

Lote 003 = 22 leitões

O usuário seleciona os 3 lotes e cria um novo lote.

Resultado:

Lote Novo = 60 leitões

### O sistema deve:

* Encerrar os lotes originais.
* Criar um novo lote.
* Manter rastreabilidade da origem dos lotes.
* Somar automaticamente:

  * Quantidade de animais
  * Histórico sanitário
  * Histórico de medicamentos
  * Histórico de consumo

### Ficha do Novo Lote

Deve aparecer:

Lote formado por:

* Lote 001
* Lote 002
* Lote 003

Com data da unificação.

Objetivo:

Facilitar o manejo da creche, crescimento e engorda, onde normalmente vários lotes são agrupados em uma única baia.
