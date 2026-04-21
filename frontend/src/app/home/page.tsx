"use client";

import "@/components/dashboard/dashboard.css";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { apiClient } from "@/services/api";
import {
  Beef,
  Wheat,
  Wallet,
  Package,
  TrendingUp,
  TrendingDown,
  Droplets,
  Activity,
  AlertTriangle,
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
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

const revenueData = [
  { mes: "Jan", receita: 42000, despesa: 28000 },
  { mes: "Fev", receita: 51000, despesa: 31000 },
  { mes: "Mar", receita: 47000, despesa: 30000 },
  { mes: "Abr", receita: 62000, despesa: 35000 },
  { mes: "Mai", receita: 71000, despesa: 38000 },
  { mes: "Jun", receita: 89000, despesa: 42000 },
  { mes: "Jul", receita: 95420, despesa: 45000 },
];

const productionData = [
  { cultura: "Soja", ton: 320 },
  { cultura: "Milho", ton: 280 },
  { cultura: "Café", ton: 95 },
  { cultura: "Trigo", ton: 140 },
  { cultura: "Cana", ton: 410 },
];

const herdData = [
  { name: "Bovinos", value: 842, color: "var(--chart-1)" },
  { name: "Suínos", value: 312, color: "var(--chart-2)" },
  { name: "Aves", value: 1840, color: "var(--chart-3)" },
  { name: "Ovinos", value: 96, color: "var(--chart-4)" },
];

const kpis = [
  {
    label: "Receita do mês",
    value: "R$ 95.420",
    change: "+12,4%",
    up: true,
    icon: Wallet,
    accent: "from-primary to-primary/70",
  },
  {
    label: "Rebanho total",
    value: "3.090",
    change: "+38",
    up: true,
    icon: Beef,
    accent: "from-chart-3 to-chart-3/70",
  },
  {
    label: "Área plantada",
    value: "1.240 ha",
    change: "+5,2%",
    up: true,
    icon: Wheat,
    accent: "from-gold to-warning",
  },
  {
    label: "Itens em estoque",
    value: "184",
    change: "-3,1%",
    up: false,
    icon: Package,
    accent: "from-chart-4 to-chart-4/70",
  },
];

const tasks = [
  { title: "Vacinação lote A — Bovinos", time: "Hoje · 14:00", status: "urgent" },
  { title: "Colheita talhão 7 — Soja", time: "Amanhã", status: "normal" },
  { title: "Reposição de ração", time: "Sex, 12 abr", status: "normal" },
  { title: "Pesagem mensal — Suínos", time: "Sáb, 13 abr", status: "warning" },
];

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    } else {
      apiClient
        .get("/auth/me/")
        .then((res) => {
          setUser(res.data);
          localStorage.setItem("user", JSON.stringify(res.data));
        })
        .catch(() => {
          router.push("/login");
        });
    }
  }, [router]);

  const userName = user?.full_name?.split(" ")[0] || "João";

  return (
    <div className="d-flex" style={{ minHeight: "100vh" }}>
      <AppSidebar />
      <div className="flex-grow-1 d-flex flex-column" style={{ background: "var(--background)" }}>
        <TopBar />
        <main className="flex-grow-1 p-4 p-lg-5 overflow-auto">
          <div className="mb-5">
            <h1 className="fw-black mb-1" style={{ color: "var(--foreground)", fontSize: '1.875rem', letterSpacing: '-0.02em' }}>Visão Geral</h1>
            <p className="mb-0 text-muted-foreground fw-medium">Bem-vindo de volta, {userName}</p>
          </div>

          {/* KPIs */}
          <div className="row g-4 mb-5">
            {kpis.map((k, i) => (
              <div key={k.label} className="col-12 col-md-6 col-xl-3">
                <div className="dashboard-card p-4 h-100">
                  <div className="d-flex justify-content-between align-items-start mb-4">
                    <div className="stat-card-icon" 
                         style={{ 
                           background: k.accent.includes("from-primary") 
                             ? "var(--primary)" 
                             : k.accent.includes("chart-3")
                               ? "oklch(0.65 0.15 145)"
                               : k.accent.includes("gold")
                                 ? "var(--gold)"
                                 : "oklch(0.6 0.18 25)",
                           color: "white"
                         }}>
                      <k.icon size={24} />
                    </div>
                    <Badge
                      className="px-2 py-1 gap-1 border-0 fw-bold"
                      style={k.up 
                        ? { background: "oklch(0.95 0.05 145)", color: "oklch(0.5 0.15 145)" }
                        : { background: "oklch(0.95 0.05 25)", color: "oklch(0.5 0.15 25)" }
                      }
                    >
                      {k.up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {k.change}
                    </Badge>
                  </div>
                  <div>
                    <div className="fw-black" style={{ fontSize: "1.75rem", color: "var(--foreground)", letterSpacing: "-0.03em" }}>
                      {k.value}
                    </div>
                    <div className="text-muted-foreground fw-semibold mt-1" style={{ fontSize: "0.8rem", textTransform: 'uppercase', letterSpacing: '0.02em' }}>{k.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="row g-4 mb-5">
            {/* Main Chart */}
            <div className="col-12 col-xl-8">
              <div className="dashboard-card p-4 h-100">
                <div className="d-flex justify-content-between align-items-center mb-5">
                  <div>
                    <h3 className="fw-bold mb-1" style={{ fontSize: "1.125rem" }}>Receita vs Despesa</h3>
                    <p className="text-muted-foreground small mb-0 fw-medium">Desempenho financeiro nos últimos 7 meses</p>
                  </div>
                  <Badge className="bg-gold/10 text-gold-foreground border-0 px-3 py-1.5 fw-bold" style={{ fontSize: '0.75rem' }}>
                    +24% YoY
                  </Badge>
                </div>
                <div style={{ height: "320px", width: "100%" }}>
                  {!isClient ? (
                    <div className="d-flex align-items-center justify-content-center h-100">
                      <span className="text-muted">Carregando...</span>
                    </div>
                  ) : (
                  <ResponsiveContainer>
                    <AreaChart data={revenueData}>
                      <defs>
                        <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorDesp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="oklch(0.55 0.16 145)" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="oklch(0.55 0.16 145)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{fill: 'var(--muted-foreground)', fontSize: 12}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--muted-foreground)', fontSize: 12}} />
                      <Tooltip 
                        contentStyle={{borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-elegant)', padding: '12px'}}
                      />
                      <Area type="monotone" dataKey="receita" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorRec)" />
                      <Area type="monotone" dataKey="despesa" stroke="oklch(0.55 0.16 145)" strokeWidth={3} fillOpacity={1} fill="url(#colorDesp)" />
                    </AreaChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Donut Chart */}
            <div className="col-12 col-xl-4">
              <div className="dashboard-card p-4 h-100">
                <div className="mb-5">
                  <h3 className="fw-bold mb-1" style={{ fontSize: "1.125rem" }}>Composição do rebanho</h3>
                  <p className="text-muted-foreground small mb-0 fw-medium">Distribuição por espécie</p>
                </div>
                <div style={{ height: "240px" }}>
                  {!isClient ? (
                    <div className="d-flex align-items-center justify-content-center h-100">
                      <span className="text-muted">Carregando...</span>
                    </div>
                  ) : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={herdData}
                        innerRadius={65}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {herdData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-elegant)'}}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  )}
                </div>
                <div className="mt-4 d-flex flex-column gap-3">
                  {herdData.map((d) => (
                    <div key={d.name} className="d-flex justify-content-between align-items-center">
                      <div className="d-flex align-items-center gap-2">
                        <div className="rounded-circle" style={{ width: '10px', height: '10px', background: d.color }} />
                        <span className="text-muted-foreground fw-medium" style={{ fontSize: '0.875rem' }}>{d.name}</span>
                      </div>
                      <span className="fw-bold" style={{ color: 'var(--foreground)' }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="row g-4">
            {/* Bar Chart */}
            <div className="col-12 col-xl-8">
              <div className="dashboard-card p-4 h-100">
                <div className="mb-5">
                  <h3 className="fw-bold mb-1" style={{ fontSize: "1.125rem" }}>Produção por cultura</h3>
                  <p className="text-muted-foreground small mb-0 fw-medium">Toneladas colhidas — safra atual</p>
                </div>
                <div style={{ height: "280px", width: "100%" }}>
                  {!isClient ? (
                    <div className="d-flex align-items-center justify-content-center h-100">
                      <span className="text-muted">Carregando...</span>
                    </div>
                  ) : (
                  <ResponsiveContainer>
                    <BarChart data={productionData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="cultura" axisLine={false} tickLine={false} tick={{fill: 'var(--muted-foreground)', fontSize: 12}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--muted-foreground)', fontSize: 12}} />
                      <Tooltip 
                        contentStyle={{borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-elegant)'}}
                        cursor={{fill: 'oklch(0.98 0.01 145)'}}
                      />
                      <Bar dataKey="ton" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Task List */}
            <div className="col-12 col-xl-4">
              <div className="dashboard-card p-4 h-100">
                <div className="mb-5">
                  <h3 className="fw-bold mb-1" style={{ fontSize: "1.125rem" }}>Tarefas próximas</h3>
                  <p className="text-muted-foreground small mb-0 fw-medium">Atividades agendadas</p>
                </div>
                <div className="d-flex flex-column gap-3">
                  {tasks.map((t, idx) => (
                    <div key={idx} className="d-flex align-items-center gap-3 p-3 rounded-xl border border-dashed border-border hover-bg-muted transition-all">
                      <div className="rounded-lg d-flex align-items-center justify-content-center flex-shrink-0" 
                           style={{ 
                             width: '40px', 
                             height: '40px',
                             background: t.status === "urgent" ? "oklch(0.95 0.05 25)" : "oklch(0.95 0.05 145)",
                             color: t.status === "urgent" ? "oklch(0.5 0.15 25)" : "oklch(0.5 0.15 145)"
                           }}>
                        {t.status === "urgent" ? <AlertTriangle size={20} /> : <Activity size={20} />}
                      </div>
                      <div className="flex-grow-1">
                        <div className="fw-bold small text-dark">{t.title}</div>
                        <div className="text-muted-foreground" style={{ fontSize: '0.7rem', fontWeight: 600 }}>{t.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}