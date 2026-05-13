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
    <div className="row g-4 mb-5">
      {kpis.map((k, i) => {
        const trend = trendBadge[k.trend ?? "neutral"];
        return (
          <div key={i} className="col-12 col-sm-6 col-lg-3">
            <div className="summary-card">
              <div className="summary-card-body">
                <div className="d-flex justify-content-between align-items-start">
                  <div className="summary-icon-wrapper" style={{ background: k.color, color: k.color.replace('0.95', '0.45').replace('0.96', '0.5') }}>
                    <span style={{ fontSize: '1.25rem' }}>{k.icon}</span>
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
                <div className="text-muted-foreground small fw-medium mb-1 mt-3">{k.label}</div>
                <div className="fw-bold text-foreground" style={{ fontSize: '1.75rem' }}>{k.value}</div>
                {k.sub && <div className="text-muted-foreground" style={{ fontSize: '0.7rem' }}>{k.sub}</div>}
              </div>
              <div className="summary-footer">
                <span className="summary-link" style={{ cursor: 'pointer' }}>Detalhes</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
