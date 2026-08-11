"use client";

import "@/components/dashboard/dashboard.css";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Beef,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Landmark,
  Package,
  PiggyBank,
  Sprout,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wheat,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { apiClient } from "@/services/api";

interface User { id: string; email: string; full_name: string; role: string; }
interface DashboardKpis {
  month_revenue: number; month_expense: number; total_animals: number; planted_area_ha: number;
  inventory_items: number; total_inventory_value: number; low_stock_items: number; farms_count: number;
}
interface HerdItem { name: string; value: number; }
interface RevenueItem { mes: string; receita: number; despesa: number; }
interface CropItem { cultura: string; ciclos: number; }
interface TaskItem { title: string; due_date: string | null; priority: string; status: string; farm: string | null; }
interface DashboardData {
  organization: string | null;
  kpis: DashboardKpis;
  charts: { revenue_vs_expense: RevenueItem[]; herd_by_species: HerdItem[]; production_by_crop: CropItem[]; };
  tasks: TaskItem[];
}

const EMPTY_KPIS: DashboardKpis = {
  month_revenue: 0, month_expense: 0, total_animals: 0, planted_area_ha: 0,
  inventory_items: 0, total_inventory_value: 0, low_stock_items: 0, farms_count: 0,
};
const CHART_COLORS = ["var(--chart-1)", "var(--chart-4)", "var(--chart-2)", "var(--chart-5)", "var(--chart-3)"];
const fmt = new Intl.NumberFormat("pt-BR");
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const subscribeToHydration = () => () => undefined;

function DashboardSkeleton() {
  return <div className="org-dashboard-skeleton"><span /><div>{[0, 1, 2, 3].map((item) => <i key={item} />)}</div><b /></div>;
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isClient = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        const parsedUser = JSON.parse(stored);
        queueMicrotask(() => setUser(parsedUser));
      } catch { localStorage.removeItem("user"); }
    } else {
      apiClient.get("/auth/me/").then((response) => {
        setUser(response.data);
        localStorage.setItem("user", JSON.stringify(response.data));
      }).catch(() => router.push("/login"));
    }
  }, [router]);
  useEffect(() => {
    apiClient.get<DashboardData>("/reports/dashboard/")
      .then((response) => setDashboard(response.data))
      .catch(() => setError("Não foi possível carregar os dados do painel."))
      .finally(() => setLoading(false));
  }, []);

  const kpis = dashboard?.kpis ?? EMPTY_KPIS;
  const cropData = dashboard?.charts.production_by_crop ?? [];
  const revenueData = dashboard?.charts.revenue_vs_expense ?? [];
  const tasks = dashboard?.tasks ?? [];
  const balance = kpis.month_revenue - kpis.month_expense;
  const totalCycles = cropData.reduce((sum, item) => sum + item.ciclos, 0);
  const topCrop = [...cropData].sort((a, b) => b.ciclos - a.ciclos)[0];
  const herdData = useMemo(() => (dashboard?.charts.herd_by_species ?? []).map((item, index) => ({
    ...item, color: CHART_COLORS[index % CHART_COLORS.length],
  })), [dashboard]);
  const topSpecies = [...herdData].sort((a, b) => b.value - a.value)[0];
  const monthTrend = revenueData.length > 1
    ? revenueData[revenueData.length - 1].receita - revenueData[revenueData.length - 2].receita
    : 0;
  const userName = user?.full_name?.split(" ")[0] || "Produtor";

  if (loading) return <DashboardSkeleton />;

  const metrics = [
    { label: "Receita do mês", value: fmtBRL.format(kpis.month_revenue), note: monthTrend >= 0 ? "Evolução positiva no período" : "Abaixo do mês anterior", icon: CircleDollarSign, tone: "green", positive: monthTrend >= 0 },
    { label: "Despesas do mês", value: fmtBRL.format(kpis.month_expense), note: "Custos registrados no período", icon: Wallet, tone: "blue" },
    { label: "Saldo do mês", value: fmtBRL.format(balance), note: balance >= 0 ? "Receitas acima das despesas" : "Despesas acima das receitas", icon: balance >= 0 ? TrendingUp : TrendingDown, tone: "orange", positive: balance >= 0 },
    { label: "Valor em estoque", value: fmtBRL.format(kpis.total_inventory_value), note: `${fmt.format(kpis.inventory_items)} itens cadastrados`, icon: Package, tone: "purple" },
  ];

  return (
    <div className="org-dashboard">
      <header className="org-dashboard-header">
        <div>
          <h1>Bom dia, {userName}! <span aria-hidden="true">☀️</span></h1>
          <p>Aqui está o resumo completo da sua operação.</p>
        </div>
        <div className="org-dashboard-context">
          {dashboard?.organization && <span><Building2 size={17} />{dashboard.organization}</span>}
          <span><CalendarDays size={17} />{isClient ? new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "Hoje"}</span>
        </div>
      </header>

      {error && <div className="org-dashboard-error">{error}</div>}

      <section className="org-kpi-grid" aria-label="Resumo financeiro">
        {metrics.map((metric) => (
          <article className={`org-kpi-card tone-${metric.tone}`} key={metric.label}>
            <span className="org-kpi-icon"><metric.icon size={27} /></span>
            <div><small>{metric.label}</small><strong>{metric.value}</strong><p className={metric.positive === false ? "negative" : ""}>{metric.note}</p></div>
          </article>
        ))}
      </section>

      <section className="org-segments-panel">
        <div className="org-section-title"><span>Visão da operação</span><h2>Resultados por segmento</h2></div>
        <div className="org-segments-grid">
          <article className="org-segment agriculture">
            <header><span><Sprout size={21} /> Agricultura</span></header>
            <div className="org-segment-stats">
              <div><small>Área plantada</small><strong>{fmt.format(Math.round(kpis.planted_area_ha))} ha</strong></div>
              <div><small>Ciclos ativos</small><strong>{fmt.format(totalCycles)}</strong></div>
              <div><small>Culturas</small><strong>{fmt.format(cropData.length)}</strong></div>
              <div><small>Maior atividade</small><strong>{topCrop?.cultura || "—"}</strong></div>
            </div>
            <div className="org-chart-card">
              <div><strong>Ciclos por cultura</strong><small>Produções atualmente em andamento</small></div>
              <div className="org-chart-area">
                {!isClient || !cropData.length ? <div className="org-empty-chart"><Wheat size={26} />Nenhum ciclo ativo</div> : (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={170}>
                    <BarChart data={cropData} margin={{ top: 10, right: 4, left: -28, bottom: 0 }}>
                      <XAxis dataKey="cultura" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                      <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }} />
                      <Bar dataKey="ciclos" name="Ciclos" fill="var(--primary)" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </article>

          <article className="org-segment livestock">
            <header><span><Beef size={21} /> Pecuária</span></header>
            <div className="org-segment-stats">
              <div><small>Total de animais</small><strong>{fmt.format(kpis.total_animals)}</strong></div>
              <div><small>Espécies</small><strong>{fmt.format(herdData.length)}</strong></div>
              <div><small>Maior rebanho</small><strong>{topSpecies?.name || "—"}</strong></div>
              <div><small>Quantidade</small><strong>{topSpecies ? fmt.format(topSpecies.value) : "—"}</strong></div>
            </div>
            <div className="org-chart-card">
              <div><strong>Composição do rebanho</strong><small>Distribuição dos animais por espécie</small></div>
              <div className="org-herd-chart">
                <div className="org-chart-area">
                  {!isClient || !herdData.length ? <div className="org-empty-chart"><Beef size={26} />Nenhum animal cadastrado</div> : (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={170}>
                      <PieChart><Pie data={herdData} innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value">{herdData.map((item) => <Cell key={item.name} fill={item.color} stroke="var(--card)" strokeWidth={2} />)}</Pie><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }} /></PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                {!!herdData.length && <div className="org-chart-legend">{herdData.slice(0, 5).map((item) => <span key={item.name}><i style={{ background: item.color }} /><b>{item.name}</b><small>{fmt.format(item.value)}</small></span>)}</div>}
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="org-lower-grid">
        <article className="org-info-panel">
          <div className="org-section-title"><span>Acompanhamento</span><h2>Alertas e pendências</h2></div>
          <div className="org-task-list">
            {kpis.low_stock_items > 0 && <div className="urgent"><span><AlertTriangle size={19} /></span><p><strong>Estoque abaixo do mínimo</strong><small>{kpis.low_stock_items} {kpis.low_stock_items === 1 ? "item precisa" : "itens precisam"} de reposição</small></p><b>Urgente</b></div>}
            {tasks.slice(0, 3).map((task, index) => <div key={`${task.title}-${index}`} className={task.priority === "critical" || task.priority === "high" ? "attention" : "info"}><span>{task.priority === "critical" || task.priority === "high" ? <AlertTriangle size={19} /> : <Activity size={19} />}</span><p><strong>{task.title}</strong><small>{task.due_date ? `Prazo: ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString("pt-BR")}` : "Sem prazo definido"}{task.farm ? ` · ${task.farm}` : ""}</small></p><b>{task.priority === "high" ? "Atenção" : "Pendente"}</b></div>)}
            {!tasks.length && !kpis.low_stock_items && <div className="org-all-clear"><Activity size={21} />Nenhuma pendência para o período.</div>}
          </div>
        </article>

        <article className="org-info-panel">
          <div className="org-section-title"><span>Estrutura</span><h2>Resumo operacional</h2></div>
          <div className="org-operation-grid">
            <div><span><Landmark size={21} /></span><p><small>Fazendas</small><strong>{fmt.format(kpis.farms_count)}</strong></p></div>
            <div><span><Package size={21} /></span><p><small>Itens em estoque</small><strong>{fmt.format(kpis.inventory_items)}</strong></p></div>
            <div><span><PiggyBank size={21} /></span><p><small>Patrimônio em estoque</small><strong>{fmtBRL.format(kpis.total_inventory_value)}</strong></p></div>
            <div><span><AlertTriangle size={21} /></span><p><small>Estoque baixo</small><strong>{fmt.format(kpis.low_stock_items)}</strong></p></div>
          </div>
        </article>
      </section>
    </div>
  );
}
