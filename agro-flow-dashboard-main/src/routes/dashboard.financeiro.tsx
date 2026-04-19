import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/TopBar";
import { ModulePage, StatusBadge } from "@/components/ModulePage";

export const Route = createFileRoute("/dashboard/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Gestão Agro" }] }),
  component: FinanceiroPage,
});

const txs = [
  { id: 1, data: "10/04/2025", descricao: "Venda lote bovinos", categoria: "Receita", valor: "R$ 48.200,00", status: "Recebido", tone: "success" as const },
  { id: 2, data: "08/04/2025", descricao: "Compra de ração", categoria: "Insumos", valor: "- R$ 6.420,00", status: "Pago", tone: "info" as const },
  { id: 3, data: "05/04/2025", descricao: "Venda de soja (200 sc)", categoria: "Receita", valor: "R$ 32.000,00", status: "Recebido", tone: "success" as const },
  { id: 4, data: "03/04/2025", descricao: "Manutenção trator", categoria: "Manutenção", valor: "- R$ 2.150,00", status: "Pago", tone: "info" as const },
  { id: 5, data: "02/04/2025", descricao: "Salário funcionários", categoria: "Folha", valor: "- R$ 18.300,00", status: "A pagar", tone: "warning" as const },
  { id: 6, data: "01/04/2025", descricao: "Energia elétrica", categoria: "Utilidades", valor: "- R$ 1.840,00", status: "Vencido", tone: "danger" as const },
];

function FinanceiroPage() {
  return (
    <>
      <TopBar title="Financeiro" subtitle="Receitas, despesas e fluxo de caixa" />
      <ModulePage
        title="Financeiro"
        subtitle="Controle completo de receitas e despesas"
        addLabel="Nova transação"
        stats={[
          { label: "Receita do mês", value: "R$ 95.420", color: "var(--color-success)" },
          { label: "Despesas", value: "R$ 42.180", color: "var(--color-destructive)" },
          { label: "Lucro líquido", value: "R$ 53.240", hint: "+24% vs mês anterior", color: "var(--color-success)" },
          { label: "A receber", value: "R$ 18.700" },
        ]}
        columns={[
          { key: "data", label: "Data" },
          { key: "descricao", label: "Descrição" },
          { key: "categoria", label: "Categoria" },
          { key: "valor", label: "Valor" },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusBadge status={r.status} tone={r.tone} />,
          },
        ]}
        rows={txs}
      />
    </>
  );
}
