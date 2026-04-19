import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/TopBar";
import { ModulePage, StatusBadge } from "@/components/ModulePage";

export const Route = createFileRoute("/dashboard/lavoura")({
  head: () => ({ meta: [{ title: "Lavoura — Gestão Agro" }] }),
  component: LavouraPage,
});

const fields = [
  { id: 1, talhao: "T-01", cultura: "Soja", area: "120 ha", plantio: "12/10/2024", colheita: "Mar/2025", status: "Em colheita", tone: "warning" as const },
  { id: 2, talhao: "T-02", cultura: "Milho", area: "85 ha", plantio: "20/09/2024", colheita: "Fev/2025", status: "Colhido", tone: "success" as const },
  { id: 3, talhao: "T-03", cultura: "Café", area: "45 ha", plantio: "—", colheita: "Mai/2025", status: "Em desenvolvimento", tone: "info" as const },
  { id: 4, talhao: "T-04", cultura: "Cana", area: "210 ha", plantio: "—", colheita: "Ago/2025", status: "Em desenvolvimento", tone: "info" as const },
  { id: 5, talhao: "T-05", cultura: "Trigo", area: "65 ha", plantio: "01/05/2024", colheita: "Out/2024", status: "Pousio", tone: "success" as const },
];

function LavouraPage() {
  return (
    <>
      <TopBar title="Lavoura" subtitle="Talhões, culturas e safra" />
      <ModulePage
        title="Lavoura & Plantio"
        subtitle="Acompanhe talhões, culturas, plantio e colheita"
        addLabel="Novo talhão"
        stats={[
          { label: "Área total", value: "1.240 ha" },
          { label: "Talhões ativos", value: "18" },
          { label: "Em colheita", value: "4", color: "var(--color-warning)" },
          { label: "Produtividade", value: "+8,2%", color: "var(--color-success)" },
        ]}
        columns={[
          { key: "talhao", label: "Talhão" },
          { key: "cultura", label: "Cultura" },
          { key: "area", label: "Área" },
          { key: "plantio", label: "Plantio" },
          { key: "colheita", label: "Colheita" },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusBadge status={r.status} tone={r.tone} />,
          },
        ]}
        rows={fields}
      />
    </>
  );
}
