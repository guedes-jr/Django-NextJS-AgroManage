# Plano de Implementação - Módulo Financeiro

Este plano detalha a implementação do sistema de gestão financeira (Receitas, Despesas e Fluxo de Caixa), e como ele se integrará com as operações da fazenda.

## ⚠️ User Review Required

Para que eu possa começar a escrever o código, preciso que você responda a duas perguntas de negócio:

> [!IMPORTANT]
> **Integração com Estoque**: Quando um usuário registrar a compra de um insumo no estoque (ex: ração), o sistema deve gerar automaticamente uma conta a pagar/paga no Financeiro, ou o usuário deve fazer esse lançamento manualmente lá na tela do Financeiro?
> 
> **Dashboard de Fluxo de Caixa**: Para o gráfico principal de receitas x despesas, você prefere uma visão padrão **Mensal** (onde ele vê o resultado mês a mês do ano), ou um **filtro de período dinâmico** (ex: últimos 7 dias, últimos 30 dias)?

## Proposed Changes

### Backend (Django - `apps/finance`)

#### [MODIFY] [models.py](file:///home/junior/Documentos/Projects/Django-NextJS-AgroManage/backend/apps/finance/models.py)
- Refinar `Transaction`:
    - Adicionar choices para `payment_method` (PIX, Boleto, Cartão de Crédito, Dinheiro, Transferência).
    - Adicionar `attachment` (FileField) para anexar recibos/comprovantes.
- Criar o modelo `BankAccount`:
    - Campos: Name, Type, Initial Balance, Current Balance.
- Ligar `Transaction` ao `BankAccount`.

#### [NEW] [serializers.py](file:///home/junior/Documentos/Projects/Django-NextJS-AgroManage/backend/apps/finance/serializers.py)
- Criar `FinancialCategorySerializer`, `TransactionSerializer`, e `BankAccountSerializer`.

#### [MODIFY] [views.py](file:///home/junior/Documentos/Projects/Django-NextJS-AgroManage/backend/apps/finance/views.py)
- Implementar `TransactionViewSet`:
    - Filtros por categoria, status, data de vencimento e fazenda.
    - Endpoint extra `stats` para consolidar dados do dashboard (Total a receber/pagar, fluxo por dia).
- Implementar `FinancialCategoryViewSet` e `BankAccountViewSet`.

### Frontend (Next.js - `src/app/home/financeiro`)

#### [NEW] [FinanceDashboard.tsx](file:///home/junior/Documentos/Projects/Django-NextJS-AgroManage/frontend/src/components/dashboard/FinanceDashboard.tsx)
- Cards de KPI Premium: Saldo Atual, Total a Receber, Total a Pagar.
- Gráficos: Gráfico de linha/área para Fluxo de Caixa e Gráfico de rosca para Despesas por Categoria.

#### [NEW] [TransactionManager.tsx](file:///home/junior/Documentos/Projects/Django-NextJS-AgroManage/frontend/src/components/dashboard/TransactionManager.tsx)
- Tabela moderna com filtros (Status, Categoria, Data).
- Badges dinâmicos de status (Pago, Pendente, Atrasado).
- Modal lateral/central para entrada rápida de transações.

#### [NEW] Rotas e Menus
- `/home/financeiro`: Dashboard Principal.
- Atualizar a `AppSidebar` para apontar corretamente para os links do financeiro.

## Verification Plan

### Testes Manuais
1. Criar uma transação de "Receita" e verificar se o KPI "Total a Receber" é atualizado corretamente no painel.
2. Marcar uma transação como "Paga" e confirmar se o Saldo da Conta Bancária (se ativo) reflete o novo valor.
3. Filtrar transações na tabela por "Despesa" e "Categoria".
