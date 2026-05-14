"use client";

import "./reproducao.css";

export interface KpiCard {
  icon: string;
  value: string | number;
  label: string;
  sub?: string;
  color: string;
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
    <div className="row g-3 mb-5">
      {kpis.map((k, i) => {
        const trend = trendBadge[k.trend ?? "neutral"];
        return (
          <div key={i} className="col-12 col-sm-6 col-lg">
            <div className="dashboard-card p-3 border border-border bg-background shadow-sm h-100">
              <div className="d-flex align-items-center gap-3 mb-3">
                <div
                  className="p-2 rounded-lg d-flex align-items-center justify-content-center"
                  style={{ background: k.color, color: k.color.replace('0.95', '0.45').replace('0.96', '0.5'), width: 40, height: 40 }}
                >
                  <span style={{ fontSize: '1.1rem' }}>{k.icon}</span>
                </div>
                <div className="flex-grow-1">
                  <div className="h4 fw-black mb-0">{k.value}</div>
                  <div className="text-muted-foreground small fw-semibold">{k.label}</div>
                  {k.sub && <div className="text-muted-foreground" style={{ fontSize: '0.7rem' }}>{k.sub}</div>}
                </div>
                {k.trend && (
                  <span
                    className="d-inline-flex align-items-center"
                    style={{
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
