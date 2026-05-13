"use client";

import "./reproducao.css";

export interface KpiCard {
  icon: string;
  value: string | number;
  label: string;
  sub?: string;
  color: string; /* background for icon box */
  trend?: "up" | "down" | "neutral";
}

interface ReproducaoKpiCardsProps {
  kpis: KpiCard[];
}

const trendBadge: Record<string, { bg: string; text: string; symbol: string }> = {
  up:      { bg: "oklch(0.95 0.05 145)", text: "oklch(0.45 0.15 145)", symbol: "↑" },
  down:    { bg: "oklch(0.96 0.04 25)",  text: "oklch(0.5 0.15 25)",   symbol: "↓" },
  neutral: { bg: "var(--muted)",         text: "var(--muted-foreground)", symbol: "→" },
};

export function ReproducaoKpiCards({ kpis }: ReproducaoKpiCardsProps) {
  return (
    <div className="repro-kpi-grid">
      {kpis.map((k, i) => {
        const trend = trendBadge[k.trend ?? "neutral"];
        return (
          <div key={i} className="repro-kpi-card">
            <div className="d-flex align-items-start justify-content-between">
              <div
                className="repro-kpi-icon"
                style={{ background: k.color }}
              >
                {k.icon}
              </div>
              {k.trend && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0.1rem 0.4rem",
                    borderRadius: "99px",
                    fontSize: "0.65rem",
                    fontWeight: 800,
                    background: trend.bg,
                    color: trend.text,
                  }}
                >
                  {trend.symbol}
                </span>
              )}
            </div>
            <div className="repro-kpi-value">{k.value}</div>
            <div className="repro-kpi-label">{k.label}</div>
            {k.sub && <div className="repro-kpi-sub">{k.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}
