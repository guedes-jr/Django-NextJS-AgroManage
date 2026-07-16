# Matriz de permissões do tenant

| Papel | Leitura | Operações rurais | Financeiro | Configuração e exclusão |
|---|---|---|---|---|
| `owner` | Sim | Sim | Sim | Sim |
| `admin` | Sim | Sim | Sim | Sim |
| `manager` | Sim | Sim | Sim | Escrita, sem exclusões sensíveis |
| `operator` | Sim | Cria e edita os próprios lançamentos | Cria e edita os próprios lançamentos | Não |
| `viewer` | Sim | Não | Não | Não |

## Regras implementadas neste incremento

- tarefas: `owner`, `admin` e `manager` podem criar e atualizar; `operator` cria e edita somente registros próprios;
- tarefas: somente `owner` e `admin` podem excluir;
- transações financeiras: `owner`, `admin` e `manager` podem escrever; `operator` cria e edita somente lançamentos próprios;
- categorias financeiras e contas bancárias: escrita restrita a `owner`, `admin` e `manager`;
- financeiro: somente `owner` e `admin` podem excluir;
- movimentações de estoque, produções e consumos de ração: `operator` cria e edita somente registros próprios;
- lançamentos de estoque e ração: somente `owner` e `admin` podem excluir;
- configurações, agendamentos e gerações de relatórios: `operator` cria e edita somente registros próprios;
- relatórios: somente `owner` e `admin` podem excluir;
- auditoria: API exclusivamente de leitura;
- `viewer`: somente métodos seguros (`GET`, `HEAD`, `OPTIONS`).

Os demais domínios serão migrados progressivamente para `OrganizationRolePermission`, definindo `write_roles` e `delete_roles` em cada ViewSet.
