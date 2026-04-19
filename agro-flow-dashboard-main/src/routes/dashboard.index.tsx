import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TopBar } from "@/components/TopBar";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Gestão Agro" },
      {
        name: "description",
        content: "Visão geral da fazenda: rebanho, lavoura, financeiro e estoque.",
      },
    ],
  }),
  component: DashboardHome,
});

const revenueData = [
  { mes: "Jan", receita: 42000, despesa: 28000 },
  { mes: "Fev", receita: 51000, despesa: 31000 },
  { mes: "Mar", receita: 47000, despesa: 30000 },
  { mes: "Abr", receita: 62000, despesa: 35000 },
  { mes: "Mai", receita: 71000, despesa: 38000 },
  { mes: "Jun", receita: 89000, despesa: 42000 },
  { mes: "Jul", receita: 95000, despesa: 45000 },
];

const productionData = [
  { cultura: "Soja", ton: 320 },
  { cultura: "Milho", ton: 280 },
  { cultura: "Café", ton: 95 },
  { cultura: "Trigo", ton: 140 },
  { cultura: "Cana", ton: 410 },
];

const herdData = [
  { name: "Bovinos", value: 842, color: "var(--color-chart-1)" },
  { name: "Suínos", value: 312, color: "var(--color-chart-2)" },
  { name: "Aves", value: 1840, color: "var(--color-chart-3)" },
  { name: "Ovinos", value: 96, color: "var(--color-chart-4)" },
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

function DashboardHome() {
  return (
    <>
      <TopBar title="Visão Geral" subtitle="Bem-vindo de volta, João" />
      <main className="space-y-6 p-4 md:p-6">
        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Card className="overflow-hidden border-0 bg-gradient-card shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elegant">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${k.accent} text-primary-foreground shadow-soft`}
                    >
                      <k.icon className="h-5 w-5" />
                    </div>
                    <Badge
                      variant="secondary"
                      className={`gap-1 ${
                        k.up
                          ? "bg-success/15 text-success"
                          : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {k.up ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {k.change}
                    </Badge>
                  </div>
                  <div className="mt-4">
                    <div className="text-2xl font-bold tracking-tight">{k.value}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{k.label}</div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-0 shadow-soft lg:col-span-2">
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Receita vs Despesa</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Últimos 7 meses · em reais
                </p>
              </div>
              <Badge className="bg-gradient-gold text-gold-foreground">+24% YoY</Badge>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="grad-rec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="grad-desp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--color-chart-3)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="receita"
                    stroke="var(--color-primary)"
                    strokeWidth={2.5}
                    fill="url(#grad-rec)"
                  />
                  <Area
                    type="monotone"
                    dataKey="despesa"
                    stroke="var(--color-chart-3)"
                    strokeWidth={2.5}
                    fill="url(#grad-desp)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">Composição do rebanho</CardTitle>
              <p className="text-xs text-muted-foreground">Distribuição por espécie</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={herdData}
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {herdData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-2">
                {herdData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: d.color }}
                      />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="font-semibold">{d.value.toLocaleString("pt-BR")}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom row */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-0 shadow-soft lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Produção por cultura</CardTitle>
              <p className="text-xs text-muted-foreground">Toneladas colhidas — safra atual</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={productionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="cultura" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <Tooltip
                    cursor={{ fill: "var(--color-muted)" }}
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="ton" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">Tarefas próximas</CardTitle>
              <p className="text-xs text-muted-foreground">Atividades agendadas</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {tasks.map((t) => (
                <div
                  key={t.title}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/50"
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      t.status === "urgent"
                        ? "bg-destructive/15 text-destructive"
                        : t.status === "warning"
                          ? "bg-warning/20 text-warning-foreground"
                          : "bg-primary/15 text-primary"
                    }`}
                  >
                    {t.status === "urgent" ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Activity className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.time}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Resource usage */}
        <Card className="border-0 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Indicadores operacionais</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-3">
            {[
              { label: "Uso de água", value: 68, icon: Droplets, color: "var(--color-chart-4)" },
              { label: "Estoque de ração", value: 42, icon: Package, color: "var(--color-gold)" },
              { label: "Saúde do rebanho", value: 91, icon: Activity, color: "var(--color-primary)" },
            ].map((m) => (
              <div key={m.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <m.icon className="h-4 w-4" style={{ color: m.color }} />
                    {m.label}
                  </div>
                  <span className="font-semibold">{m.value}%</span>
                </div>
                <Progress value={m.value} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
