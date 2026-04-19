import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/TopBar";
import { ModulePage, StatusBadge } from "@/components/ModulePage";

export const Route = createFileRoute("/dashboard/rebanho")({
  head: () => ({ meta: [{ title: "Rebanho — Gestão Agro" }] }),
  component: RebanhoPage,
});

const animals = [
  { id: 1, brinco: "BR-0421", especie: "Bovino", raca: "Nelore", peso: "482 kg", lote: "Lote A", status: "Saudável", tone: "success" as const },
  { id: 2, brinco: "BR-0388", especie: "Bovino", raca: "Angus", peso: "510 kg", lote: "Lote A", status: "Vacinar", tone: "warning" as const },
  { id: 3, brinco: "SU-1142", especie: "Suíno", raca: "Landrace", peso: "118 kg", lote: "Pocilga 2", status: "Saudável", tone: "success" as const },
  { id: 4, brinco: "AV-3201", especie: "Ave", raca: "Cobb 500", peso: "2,8 kg", lote: "Galpão 4", status: "Em tratamento", tone: "danger" as const },
  { id: 5, brinco: "BR-0512", especie: "Bovino", raca: "Brahman", peso: "445 kg", lote: "Lote B", status: "Saudável", tone: "success" as const },
  { id: 6, brinco: "OV-0089", especie: "Ovino", raca: "Santa Inês", peso: "62 kg", lote: "Pasto 3", status: "Saudável", tone: "success" as const },
];

function RebanhoPage() {
  return (
    <>
      <TopBar title="Rebanho" subtitle="Controle de animais e lotes" />
      <ModulePage
        title="Rebanho"
        subtitle="Gerencie bovinos, suínos, aves e ovinos"
        addLabel="Novo animal"
        stats={[
          { label: "Total de animais", value: "3.090" },
          { label: "Bovinos", value: "842", hint: "+12 este mês", color: "var(--color-success)" },
          { label: "A vacinar", value: "37", hint: "Próximos 7 dias", color: "var(--color-warning)" },
          { label: "Em tratamento", value: "8", color: "var(--color-destructive)" },
        ]}
        columns={[
          { key: "brinco", label: "Brinco" },
          { key: "especie", label: "Espécie" },
          { key: "raca", label: "Raça" },
          { key: "peso", label: "Peso" },
          { key: "lote", label: "Lote" },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusBadge status={r.status} tone={r.tone} />,
          },
        ]}
        rows={animals}
      />
    </>
  );
}
