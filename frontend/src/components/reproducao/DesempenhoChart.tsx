"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

interface MetricConfig {
  key: string;
  label: string;
  color: string;
}

const METRICS: Record<string, MetricConfig[]> = {
  reprodutivo: [
    { key: "taxa_prenhez", label: "Taxa de Prenhez (%)", color: "var(--chart-1)" },
    { key: "taxa_parto", label: "Taxa de Parto (%)", color: "var(--chart-2)" },
    { key: "taxa_desmame", label: "Taxa de Desmame (%)", color: "var(--chart-3)" },
  ],
  nascimentos: [
    { key: "nascidos_vivos", label: "Nascidos Vivos", color: "var(--chart-1)" },
    { key: "natimortos", label: "Natimortos", color: "var(--chart-4)" },
    { key: "total_nascidos", label: "Total Nascidos", color: "var(--chart-2)" },
  ],
  peso: [
    { key: "peso_medio_nascimento", label: "Peso Médio Nasc. (kg)", color: "var(--chart-1)" },
    { key: "peso_medio_desmame", label: "Peso Médio Desmame (kg)", color: "var(--chart-2)" },
    { key: "ganho_medio_diario", label: "Ganho Médio Diário (g)", color: "var(--chart-3)" },
  ],
  producao: [
    { key: "matrizes_ativas", label: "Matrizes Ativas", color: "var(--chart-1)" },
    { key: "coberturas_mes", label: "Coberturas", color: "var(--chart-2)" },
    { key: "partos_mes", label: "Partos", color: "var(--chart-3)" },
    { key: "desmames_mes", label: "Desmames", color: "var(--chart-4)" },
  ],
};

type ChartType = "area" | "line" | "bar";

interface DesempenhoChartProps {
  category?: keyof typeof METRICS;
  data?: Record<string, number>[];
  height?: number;
}

const CHART_ICONS: Record<ChartType, React.ReactNode> = {
  area: <TrendingUp size={16} />,
  line: <TrendingDown size={16} />,
  bar: <BarChart3 size={16} />,
};

export function DesempenhoChart({
  category = "reprodutivo",
  data: externalData,
  height = 300,
}: DesempenhoChartProps) {
  const [chartType, setChartType] = useState<ChartType>("area");
  const [selectedMetric, setSelectedMetric] = useState<string>(METRICS[category][0]?.key ?? "");

  const defaultData = useMemo(() =>
    MESES.map((mes, i) => {
      const base: Record<string, any> = { mes };
      Object.entries(produceMockData(category, i)).forEach(([k, v]) => {
        base[k] = v;
      });
      return base;
    }),
    [category]
  );

  const chartData = externalData ?? defaultData;
  const metrics = METRICS[category] ?? METRICS.reprodutivo;
  const activeMetric = metrics.find((m) => m.key === selectedMetric) ?? metrics[0];

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 10, left: 0, bottom: 5 },
    };

    const activeKeys = metrics.map((m) => m.key);

    switch (chartType) {
      case "line":
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "var(--shadow-elegant)", padding: "10px 14px", fontSize: "0.85rem" }} />
            <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: "12px" }} />
            {metrics.map((m) => (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                name={m.label}
                stroke={m.color}
                strokeWidth={m.key === activeMetric.key ? 3 : 1.5}
                strokeOpacity={m.key === activeMetric.key ? 1 : 0.4}
                dot={m.key === activeMetric.key ? { r: 4, fill: m.color } : false}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        );

      case "bar":
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "var(--shadow-elegant)", padding: "10px 14px", fontSize: "0.85rem" }} />
            <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: "12px" }} />
            {metrics.map((m) => (
              <Bar
                key={m.key}
                dataKey={m.key}
                name={m.label}
                fill={m.color}
                radius={[4, 4, 0, 0]}
                opacity={m.key === activeMetric.key ? 1 : 0.5}
              />
            ))}
          </BarChart>
        );

      default:
        return (
          <AreaChart {...commonProps}>
            <defs>
              {metrics.map((m) => (
                <linearGradient key={m.key} id={`grad_${m.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={m.color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={m.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "var(--shadow-elegant)", padding: "10px 14px", fontSize: "0.85rem" }} />
            <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: "12px" }} />
            {metrics.map((m) => (
              <Area
                key={m.key}
                type="monotone"
                dataKey={m.key}
                name={m.label}
                stroke={m.color}
                strokeWidth={m.key === activeMetric.key ? 3 : 1.5}
                strokeOpacity={m.key === activeMetric.key ? 1 : 0.4}
                fillOpacity={1}
                fill={`url(#grad_${m.key})`}
              />
            ))}
          </AreaChart>
        );
    }
  };

  return (
    <div className="dashboard-card overflow-hidden p-4 mb-5 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div>
          <h3 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: "1.25rem", color: "var(--foreground)" }}>
            <TrendingUp size={20} className="text-primary" />
            Gráfico de Desempenho
          </h3>
          <p className="text-muted-foreground small mb-0 fw-medium">
            Acompanhe a evolução dos indicadores ao longo do tempo
          </p>
        </div>

        <div className="d-flex align-items-center gap-2">
          <select
            className="form-select form-select-sm shadow-none"
            style={{
              width: "auto",
              borderRadius: "10px",
              border: "1.5px solid var(--border)",
              fontSize: "0.78rem",
              fontWeight: 600,
              padding: "0.4rem 2rem 0.4rem 0.75rem",
              background: "white",
            }}
            value={category}
            onChange={(e) => {
              const cat = e.target.value as keyof typeof METRICS;
              setSelectedMetric(METRICS[cat][0]?.key ?? "");
            }}
          >
            <option value="reprodutivo">Reprodutivo</option>
            <option value="nascimentos">Nascimentos</option>
            <option value="peso">Peso</option>
            <option value="producao">Produção</option>
          </select>

          <div className="btn-group" role="group" style={{ borderRadius: "10px", overflow: "hidden", border: "1.5px solid var(--border)" }}>
            {(["area", "line", "bar"] as ChartType[]).map((type) => (
              <button
                key={type}
                className={`btn btn-sm d-flex align-items-center gap-1 px-2 py-1 border-0 ${
                  chartType === type ? "bg-primary text-white" : "bg-white text-muted-foreground"
                }`}
                style={{ fontSize: "0.72rem", fontWeight: 700, borderRadius: 0 }}
                onClick={() => setChartType(type)}
                title={type === "area" ? "Gráfico de Área" : type === "line" ? "Gráfico de Linha" : "Gráfico de Barras"}
              >
                {CHART_ICONS[type]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metric selector pills */}
      <div className="d-flex flex-wrap gap-2 mb-4">
        {metrics.map((m) => (
          <button
            key={m.key}
            className="badge rounded-pill px-3 py-2 border-0 fw-semibold transition-all"
            style={{
              fontSize: "0.72rem",
              background: m.key === activeMetric.key ? m.color : "var(--muted)",
              color: m.key === activeMetric.key ? "white" : "var(--muted-foreground)",
              cursor: "pointer",
            }}
            onClick={() => setSelectedMetric(m.key)}
          >
            {m.key === activeMetric.key && (
              <Minus size={12} className="me-1" style={{ display: "inline" }} />
            )}
            {m.label.split(" (")[0]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ height: `${height}px`, width: "100%" }}>
        <ResponsiveContainer>{renderChart()}</ResponsiveContainer>
      </div>
    </div>
  );
}

function produceMockData(category: string, monthIndex: number): Record<string, number> {
  const base = monthIndex * 0.3 + Math.sin(monthIndex * 0.8) * 5;

  switch (category) {
    case "nascimentos":
      return {
        nascidos_vivos: Math.max(0, Math.round(80 + base + Math.random() * 30)),
        natimortos: Math.max(0, Math.round(5 + Math.sin(monthIndex) * 3 + Math.random() * 5)),
        total_nascidos: 0,
      };
    case "peso":
      return {
        peso_medio_nascimento: Math.round((1.5 + Math.sin(monthIndex * 0.5) * 0.2 + Math.random() * 0.3) * 100) / 100,
        peso_medio_desmame: Math.round((6 + Math.sin(monthIndex * 0.6) * 0.5 + Math.random() * 0.5) * 100) / 100,
        ganho_medio_diario: Math.round(250 + base * 3 + Math.random() * 50),
      };
    case "producao":
      return {
        matrizes_ativas: Math.max(40, Math.round(45 + Math.sin(monthIndex * 0.3) * 5)),
        coberturas_mes: Math.round(20 + Math.sin(monthIndex * 0.7) * 8 + Math.random() * 5),
        partos_mes: Math.round(18 + Math.sin(monthIndex * 0.7 + 1) * 7 + Math.random() * 4),
        desmames_mes: Math.round(16 + Math.sin(monthIndex * 0.7 + 2) * 6 + Math.random() * 4),
      };
    default:
      return {
        taxa_prenhez: Math.round(88 + Math.sin(monthIndex * 0.5) * 6 + Math.random() * 4),
        taxa_parto: Math.round(85 + Math.sin(monthIndex * 0.5 + 1) * 5 + Math.random() * 3),
        taxa_desmame: Math.round(82 + Math.sin(monthIndex * 0.5 + 2) * 5 + Math.random() * 3),
      };
  }
}
