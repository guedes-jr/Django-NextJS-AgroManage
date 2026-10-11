# Matriz de permissões da organização

| Perfil | Operação | Financeiro e relatórios gerenciais | Usuários e permissões | Exclusão |
| --- | --- | --- | --- | --- |
| `admin` | Completa | Sim | Sim | Conforme regras do domínio |
| `manager` | Gestão operacional | Sim | Não | Conforme regras do domínio |
| `operator` | Plantações e espécies liberadas pelo administrador | Não | Não | Não |

O administrador configura **Pode operar em plantações**, **Rebanhos autorizados**
e **Somente consulta** no cadastro e na edição do usuário. Novos operadores começam
sem áreas. Tipos futuros de rebanho exigem autorização explícita.

A dashboard do operador contém somente resumos das áreas liberadas e tarefas
atribuídas. As APIs verificam organização e espécies, inclusive com tokens emitidos
antes de uma mudança de acesso. Operadores registram manejo e corrigem registros
próprios ainda abertos; correções que afetam estoque, consumos ou custos exigem um
gerente. Exclusão, vendas, financeiro, configuração administrativa e exportação
gerencial ficam bloqueados. Catálogos de apoio não expõem valores financeiros.

As migrações 0007/0008 consolidam antigos proprietários como administradores,
preservando a responsabilidade pela organização separadamente. Operadores atuais
mantêm suas áreas. Antigos visualizadores passam a operadores somente consulta,
sem áreas, aguardando revisão do administrador.

A organização mantém um administrador ativo. O responsável não pode ser
rebaixado/desativado; ninguém pode remover o próprio acesso administrativo.
Alterações são auditadas. A equipe de `/platform` mantém seus perfis independentes.

Contrato e migração: [guia de API](docs/ai/api.md).
