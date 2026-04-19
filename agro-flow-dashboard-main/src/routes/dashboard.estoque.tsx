import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/TopBar";
import { ModulePage, StatusBadge } from "@/components/ModulePage";

export const Route = createFileRoute("/dashboard/estoque")({
  head: () => ({ meta: [{ title: "Estoque — Gestão Agro" }] }),
  component: EstoquePage,
});

const items = [
  { id: 1, item: "Ração bovina premium", categoria: "Ração", qtd: "1.240 kg", min: "500 kg", status: "OK", tone: "success" as const },
  { id: 2, item: "Semente de soja", categoria: "Sementes", qtd: "320 sc", min: "200 sc", status: "OK", tone: "success" as const },
  { id: 3, item: "Glifosato", categoria: "Defensivos", qtd: "85 L", min: "100 L", status: "Baixo", tone: "warning" as const },
  { id: 4, item: "Fertilizante NPK", categoria: "Fertilizantes", qtd: "0 sc", min: "50 sc", status: "Esgotado", tone: "danger" as const },
  { id: 5, item: "Vacina aftosa", categoria: "Veterinário", qtd: "450 doses", min: "200 doses", status: "OK", tone: "success" as const },
  { id: 6, item: "Diesel S10", categoria: "Combustível", qtd: "1.800 L", min: "1.000 L", status: "OK", tone: "success" as const },
];

function EstoquePage() {
  return (
    <>
      <TopBar title="Estoque" subtitle="Insumos, ração e suprimentos" />
      <ModulePage
        title="Estoque & Insumos"
        subtitle="Controle de ração, sementes, defensivos e fertilizantes"
        addLabel="Novo item"
        stats={[
          { label: "Itens cadastrados", value: "184" },
          { label: "Categorias", value: "12" },
          { label: "Em alerta", value: "9", color: "var(--color-warning)" },
          { label: "Esgotados", value: "3", color: "var(--color-destructive)" },
        ]}
        columns={[
          { key: "item", label: "Item" },
          { key: "categoria", label: "Categoria" },
          { key: "qtd", label: "Quantidade" },
          { key: "min", label: "Mínimo" },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusBadge status={r.status} tone={r.tone} />,
          },
        ]}
        rows={items}
      />
    </>
  );
}
