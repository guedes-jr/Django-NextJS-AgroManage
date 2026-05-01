"use client";

import "@/components/dashboard/dashboard.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/services/api";
import {
  Beef,
  Wheat,
  Wallet,
  Package,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  Building2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Badge } from "@/components/ui/Badge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface DashboardKpis {
  month_revenue: number;
  month_expense: number;
  total_animals: number;
  planted_area_ha: number;
  inventory_items: number;
  total_inventory_value: number;
  low_stock_items: number;
  farms_count: number;
}

interface HerdItem {
  name: string;
  value: number;
}

interface RevenueItem {
  mes: string;
  receita: number;
  despesa: number;
}

interface CropItem {
  cultura: string;
  ciclos: number;
}

interface TaskItem {
  title: string;
  due_date: string | null;
  priority: string;
  status: string;
  farm: string | null;
}

interface DashboardData {
  organization: string | null;
  kpis: DashboardKpis;
  charts: {
    revenue_vs_expense: RevenueItem[];
    herd_by_species: HerdItem[];
    production_by_crop: CropItem[];
  };
  tasks: TaskItem[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "oklch(0.65 0.15 60)",
];

const fmt = new Intl.NumberFormat("pt-BR");
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const priorityColor: Record<string, string> = {
  critical: "oklch(0.95 0.05 25)",
  high: "oklch(0.97 0.04 55)",
  medium: "oklch(0.95 0.05 145)",
  low: "oklch(0.95 0.02 240)",
};
const priorityTextColor: Record<string, string> = {
  critical: "oklch(0.5 0.15 25)",
  high: "oklch(0.5 0.15 55)",
  medium: "oklch(0.5 0.15 145)",
  low: "oklch(0.5 0.1 240)",
};

const EMPTY_KPIs: DashboardKpis = {
  month_revenue: 0,
  month_expense: 0,
  total_animals: 0,
  planted_area_ha: 0,
  inventory_items: 0,
  total_inventory_value: 0,
  low_stock_items: 0,
  farms_count: 0,
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="dashboard-card p-4 h-100" style={{ animation: "pulse 1.5s infinite" }}>
      <div style={{ height: "100px", background: "var(--muted)", borderRadius: "12px" }} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Load user from localStorage or API
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      setUser(JSON.parse(stored));
    } else {
      apiClient
        .get("/auth/me/")
        .then((res) => {
          setUser(res.data);
          localStorage.setItem("user", JSON.stringify(res.data));
        })
        .catch(() => router.push("/login"));
    }
  }, [router]);

  // Load dashboard data
  useEffect(() => {
    apiClient
      .get<DashboardData>("/reports/dashboard/")
      .then((res) => setDashboard(res.data))
      .catch((err) => {
        console.error("[Dashboard] fetch error", err);
        setError("Não foi possível carregar os dados do painel.");
      })
      .finally(() => setLoading(false));
  }, []);

  const kpis = dashboard?.kpis ?? EMPTY_KPIs;
  const herdData = (dashboard?.charts.herd_by_species ?? []).map((item, i) => ({
    ...item,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  const revenueData = dashboard?.charts.revenue_vs_expense ?? [];
  const cropData = dashboard?.charts.production_by_crop ?? [];
  const tasks = dashboard?.tasks ?? [];
  const userName = user?.full_name?.split(" ")[0] || "Agricultor";
  const orgName = dashboard?.organization;

  const kpiCards = [
    {
      label: "Receita do mês",
      value: fmtBRL.format(kpis.month_revenue),
      sub: `Despesas: ${fmtBRL.format(kpis.month_expense)}`,
      up: kpis.month_revenue >= kpis.month_expense,
      icon: Wallet,
      color: "var(--primary)",
    },
    {
      label: "Rebanho total",
      value: fmt.format(kpis.total_animals),
      sub: "animais ativos",
      up: true,
      icon: Beef,
      color: "oklch(0.65 0.15 145)",
    },
    {
      label: "Área plantada",
      value: `${fmt.format(Math.round(kpis.planted_area_ha))} ha`,
      sub: "campos ativos",
      up: true,
      icon: Wheat,
      color: "var(--gold, oklch(0.75 0.15 80))",
    },
    {
      label: "Valor do estoque",
      value: fmtBRL.format(kpis.total_inventory_value),
      sub: `${kpis.inventory_items} itens${kpis.low_stock_items > 0 ? `, ${kpis.low_stock_items} abaixo do mínimo` : ''}`,
      up: kpis.low_stock_items === 0,
      icon: Package,
      color: "oklch(0.6 0.18 25)",
    },
  ];

  return (
    <>
      {/* Header */}
      <div className="mb-5">
        <div className="d-flex align-items-center gap-3 mb-1">
          <h1
            className="fw-black mb-0"
            style={{ color: "var(--foreground)", fontSize: "1.875rem", letterSpacing: "-0.02em" }}
          >
            Visão Geral
          </h1>
          {orgName && (
            <Badge
              className="px-2 py-1 border-0 fw-semibold d-flex align-items-center gap-1"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)", fontSize: "0.75rem" }}
            >
              <Building2 size={12} />
              {orgName}
            </Badge>
          )}
        </div>
        <p className="mb-0 text-muted-foreground fw-medium">Bem-vindo de volta, {userName}</p>
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-danger border-0 mb-4 rounded-3" role="alert">
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="row g-4 mb-5">
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="col-12 col-md-6 col-xl-3">
                <SkeletonCard />
              </div>
            ))
          : kpiCards.map((k) => (
              <div key={k.label} className="col-12 col-md-6 col-xl-3">
                <div className="dashboard-card p-4 h-100">
                  <div className="d-flex justify-content-between align-items-start mb-4">
                    <div
                      className="stat-card-icon"
                      style={{ background: k.color, color: "white" }}
                    >
                      <k.icon size={24} />
                    </div>
                    <Badge
                      className="px-2 py-1 gap-1 border-0 fw-bold"
                      style={
                        k.up
                          ? { background: "oklch(0.95 0.05 145)", color: "oklch(0.5 0.15 145)" }
                          : { background: "oklch(0.95 0.05 25)", color: "oklch(0.5 0.15 25)" }
                      }
                    >
                      {k.up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    </Badge>
                  </div>
                  <div>
                    <div
                      className="fw-black"
                      style={{ fontSize: "1.75rem", color: "var(--foreground)", letterSpacing: "-0.03em" }}
                    >
                      {k.value}
                    </div>
                    <div
                      className="text-muted-foreground fw-semibold mt-1"
                      style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.02em" }}
                    >
                      {k.label}
                    </div>
                    {k.sub && (
                      <div className="text-muted-foreground mt-1" style={{ fontSize: "0.75rem" }}>
                        {k.sub}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
      </div>

      {/* Charts row 1 */}
      <div className="row g-4 mb-5">
        {/* Revenue vs Expense */}
        <div className="col-12 col-xl-8">
          <div className="dashboard-card p-4 h-100">
            <div className="d-flex justify-content-between align-items-center mb-5">
              <div>
                <h3 className="fw-bold mb-1" style={{ fontSize: "1.125rem" }}>
                  Receita vs Despesa
                </h3>
                <p className="text-muted-foreground small mb-0 fw-medium">
                  Desempenho financeiro — últimos 7 meses
                </p>
              </div>
            </div>
            <div style={{ height: "320px", width: "100%" }}>
              {!isClient || loading ? (
                <div className="d-flex align-items-center justify-content-center h-100">
                  <span className="text-muted">
                    {loading ? "Carregando..." : ""}
                  </span>
                </div>
              ) : revenueData.length === 0 ? (
                <div className="d-flex align-items-center justify-content-center h-100 flex-column gap-2">
                  <Wallet size={32} style={{ color: "var(--muted-foreground)" }} />
                  <span className="text-muted-foreground small">Nenhuma transação registrada</span>
                </div>
              ) : (
                <ResponsiveContainer>
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorDesp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.55 0.16 145)" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="oklch(0.55 0.16 145)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "var(--shadow-elegant)", padding: "12px" }} />
                    <Area type="monotone" dataKey="receita" name="Receita" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorRec)" />
                    <Area type="monotone" dataKey="despesa" name="Despesa" stroke="oklch(0.55 0.16 145)" strokeWidth={3} fillOpacity={1} fill="url(#colorDesp)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Herd donut */}
        <div className="col-12 col-xl-4">
          <div className="dashboard-card p-4 h-100">
            <div className="mb-5">
              <h3 className="fw-bold mb-1" style={{ fontSize: "1.125rem" }}>
                Composição do rebanho
              </h3>
              <p className="text-muted-foreground small mb-0 fw-medium">Distribuição por espécie</p>
            </div>
            <div style={{ height: "240px" }}>
              {!isClient || loading ? (
                <div className="d-flex align-items-center justify-content-center h-100">
                  <span className="text-muted">{loading ? "Carregando..." : ""}</span>
                </div>
              ) : herdData.length === 0 ? (
                <div className="d-flex align-items-center justify-content-center h-100 flex-column gap-2">
                  <Beef size={32} style={{ color: "var(--muted-foreground)" }} />
                  <span className="text-muted-foreground small">Nenhum animal cadastrado</span>
                </div>
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={herdData} innerRadius={65} outerRadius={90} paddingAngle={5} dataKey="value">
                      {herdData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "var(--shadow-elegant)" }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            {herdData.length > 0 && (
              <div className="mt-4 d-flex flex-column gap-3">
                {herdData.map((d) => (
                  <div key={d.name} className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                      <div className="rounded-circle" style={{ width: "10px", height: "10px", background: d.color }} />
                      <span className="text-muted-foreground fw-medium" style={{ fontSize: "0.875rem" }}>
                        {d.name}
                      </span>
                    </div>
                    <span className="fw-bold" style={{ color: "var(--foreground)" }}>
                      {fmt.format(d.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="row g-4">
        {/* Crop bar chart */}
        <div className="col-12 col-xl-8">
          <div className="dashboard-card p-4 h-100">
            <div className="mb-5">
              <h3 className="fw-bold mb-1" style={{ fontSize: "1.125rem" }}>
                Ciclos de produção ativos
              </h3>
              <p className="text-muted-foreground small mb-0 fw-medium">Culturas em andamento</p>
            </div>
            <div style={{ height: "280px", width: "100%" }}>
              {!isClient || loading ? (
                <div className="d-flex align-items-center justify-content-center h-100">
                  <span className="text-muted">{loading ? "Carregando..." : ""}</span>
                </div>
              ) : cropData.length === 0 ? (
                <div className="d-flex align-items-center justify-content-center h-100 flex-column gap-2">
                  <Wheat size={32} style={{ color: "var(--muted-foreground)" }} />
                  <span className="text-muted-foreground small">Nenhum ciclo de produção ativo</span>
                </div>
              ) : (
                <ResponsiveContainer>
                  <BarChart data={cropData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="cultura" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "var(--shadow-elegant)" }}
                      cursor={{ fill: "oklch(0.98 0.01 145)" }}
                    />
                    <Bar dataKey="ciclos" name="Ciclos" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Tasks */}
        <div className="col-12 col-xl-4">
          <div className="dashboard-card p-4 h-100">
            <div className="mb-5">
              <h3 className="fw-bold mb-1" style={{ fontSize: "1.125rem" }}>
                Tarefas próximas
              </h3>
              <p className="text-muted-foreground small mb-0 fw-medium">Atividades pendentes</p>
            </div>
            <div className="d-flex flex-column gap-3">
              {loading ? (
                [0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{ height: "56px", background: "var(--muted)", borderRadius: "12px" }}
                  />
                ))
              ) : tasks.length === 0 ? (
                <div className="d-flex align-items-center justify-content-center py-5 flex-column gap-2">
                  <Activity size={32} style={{ color: "var(--muted-foreground)" }} />
                  <span className="text-muted-foreground small">Nenhuma tarefa pendente</span>
                </div>
              ) : (
                tasks.map((t, idx) => (
                  <div
                    key={idx}
                    className="d-flex align-items-center gap-3 p-3 rounded-xl border"
                    style={{ borderColor: "var(--border)", borderStyle: "dashed" }}
                  >
                    <div
                      className="rounded-lg d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{
                        width: "40px",
                        height: "40px",
                        background: priorityColor[t.priority] ?? "var(--muted)",
                        color: priorityTextColor[t.priority] ?? "var(--foreground)",
                      }}
                    >
                      {t.priority === "critical" || t.priority === "high" ? (
                        <AlertTriangle size={20} />
                      ) : (
                        <Activity size={20} />
                      )}
                    </div>
                    <div className="flex-grow-1 min-w-0">
                      <div className="fw-bold small text-dark text-truncate">{t.title}</div>
                      <div className="text-muted-foreground" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                        {t.due_date
                          ? new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                            })
                          : "Sem prazo"}
                        {t.farm ? ` · ${t.farm}` : ""}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}