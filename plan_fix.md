# Plano de Implementação - Customização do Cadastro de Matrizes e Reprodutores

Ajustar os formulários de cadastro de animais para que, ao utilizar os atalhos **Cadastro de Matrizes / Fêmeas** e **Cadastro de Reprodutores / Machos**, os campos desnecessários sejam ocultados/pré-preenchidos e a rotulagem de identificação seja adequada.

## User Review Required

> [!IMPORTANT]
>
> - **Para Matrizes (Fêmeas):**
>   - Campo **Quantidade de Animais** pré-definido como `1` e ocultado.
>   - Campo **Sexo** pré-definido como `Fêmea` (`Femea`) e ocultado.
>   - Campo de identificação principal rotulado sempre como **Brinco (Nº)**.
> - **Para Reprodutores (Machos):**
>   - Campo **Quantidade de Animais** pré-definido como `1` e ocultado.
>   - Campo **Sexo** pré-definido como `Macho` e ocultado.
>   - Campo de identificação principal rotulado sempre como **Brinco (Nº)**.

## Proposed Changes

### Frontend Components

#### [MODIFY] [SpeciesDashboard.tsx](file:///home/junior/Documentos/Projects/Django-NextJS-AgroManage/frontend/src/components/dashboard/SpeciesDashboard.tsx)

- No método `handleOpenModal`, adicionar sinalizadores no `modalInitialData`:
  - Se `title === "Matrizes"` (suínos) ou `title === "Fêmeas"` (bovinos/aves): `isMatrixShortcut: true`, `categoria`, `sexo = "Femea"`.
  - Se `title === "Reprodutores"` (suínos) ou `title === "Machos"` (bovinos/aves): `isSireShortcut: true`, `categoria`, `sexo = "Macho"`.

#### [MODIFY] [page.tsx](file:///home/junior/Documentos/Projects/Django-NextJS-AgroManage/frontend/src/app/home/rebanho/animais/page.tsx)

- Na ação do botão de cadastro de matrizes/fêmeas, passar `isMatrixShortcut: true` no `initialData`.
- Na ação do botão de cadastro de reprodutores/machos, passar `isSireShortcut: true` no `initialData`.

#### [MODIFY] [AnimalFormModal.tsx](file:///home/junior/Documentos/Projects/Django-NextJS-AgroManage/frontend/src/components/dashboard/AnimalFormModal.tsx)

- Atualizar a interface `AnimalFormModalProps` para aceitar `isMatrixShortcut?: boolean` e `isSireShortcut?: boolean` dentro do objeto `initialData`.
- Atualizar o estado inicial e o efeito de montagem do modal para respeitar esses limites:
  - Se for `isMatrixShortcut` ou `isSireShortcut`, inicializar a quantidade como `"1"`.
  - Ocultar os campos **Quantidade de Animais** e **Sexo** no layout do formulário quando `isMatrixShortcut` ou `isSireShortcut` for ativo.
  - Atualizar a função `getNumberLabel` para retornar `"Brinco (Nº)"` se a categoria for matriz/reprodutor ou se `isMatrixShortcut` / `isSireShortcut` for verdadeiro.
  - Atualizar a função `getNumberPlaceholder` para retornar `"Ex: BR-123"` para ambos os casos individuais em suínos/aves.

---

## Verification Plan

### Automated / Integration Tests

- Validar no navegador que:
  1. No atalho de **Matrizes**:
     - Qtd. e Sexo ocultados.
     - Identificador rotulado como "Brinco (Nº)".
     - Cadastro de suínos (Marrã), bovinos (Matriz) e aves (Poedeira/Matriz) funciona perfeitamente.
  2. No atalho de **Reprodutores**:
     - Qtd. e Sexo ocultados.
     - Identificador rotulado como "Brinco (Nº)".
     - Cadastro de suínos (Cachaço), bovinos (Touro) e aves (Reprodutor) funciona perfeitamente.
