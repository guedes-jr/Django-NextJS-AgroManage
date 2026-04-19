import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/TopBar";
import { ModulePage, StatusBadge } from "@/components/ModulePage";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/dashboard/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Gestão Agro" }] }),
  component: UsuariosPage,
});

const users = [
  { id: 1, nome: "João Silva", email: "joao@fazenda.com", funcao: "Administrador", ultimo: "Agora", status: "Ativo", tone: "success" as const, ini: "JS" },
  { id: 2, nome: "Maria Costa", email: "maria@fazenda.com", funcao: "Gerente", ultimo: "2h atrás", status: "Ativo", tone: "success" as const, ini: "MC" },
  { id: 3, nome: "Pedro Almeida", email: "pedro@fazenda.com", funcao: "Veterinário", ultimo: "Ontem", status: "Ativo", tone: "success" as const, ini: "PA" },
  { id: 4, nome: "Ana Souza", email: "ana@fazenda.com", funcao: "Operador", ultimo: "3 dias", status: "Inativo", tone: "warning" as const, ini: "AS" },
  { id: 5, nome: "Carlos Lima", email: "carlos@fazenda.com", funcao: "Financeiro", ultimo: "1 semana", status: "Ativo", tone: "success" as const, ini: "CL" },
  { id: 6, nome: "Beatriz Rocha", email: "bia@fazenda.com", funcao: "Operador", ultimo: "Nunca", status: "Pendente", tone: "danger" as const, ini: "BR" },
];

function UsuariosPage() {
  return (
    <>
      <TopBar title="Usuários" subtitle="Gestão de equipe e permissões" />
      <ModulePage
        title="Gestão de Usuários"
        subtitle="Controle quem acessa e o que cada um pode fazer"
        addLabel="Convidar usuário"
        stats={[
          { label: "Total de usuários", value: "24" },
          { label: "Ativos", value: "19", color: "var(--color-success)" },
          { label: "Pendentes", value: "3", color: "var(--color-warning)" },
          { label: "Funções", value: "6" },
        ]}
        columns={[
          {
            key: "nome",
            label: "Usuário",
            render: (r) => (
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-gradient-primary text-xs text-primary-foreground">
                    {r.ini}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{r.nome}</div>
                  <div className="text-xs text-muted-foreground">{r.email}</div>
                </div>
              </div>
            ),
          },
          { key: "funcao", label: "Função" },
          { key: "ultimo", label: "Último acesso" },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusBadge status={r.status} tone={r.tone} />,
          },
        ]}
        rows={users}
      />
    </>
  );
}
