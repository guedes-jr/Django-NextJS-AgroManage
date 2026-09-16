"use client";

import type { ComponentType } from "react";
import {
  Baby,
  ChartNoAxesColumnIncreasing,
  Check,
  Circle,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FlaskConical,
  HeartPulse,
  Hourglass,
  Icon,
  Link2,
  Lock,
  Package,
  Pill,
  RefreshCw,
  Scale,
  ShieldAlert,
  Syringe,
  Target,
  TrendingDown,
  TrendingUp,
  Venus,
  X,
  type LucideProps,
} from "lucide-react";
import { pig, pigHead } from "@lucide/lab";
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

const PigIcon = (props: LucideProps) => <Icon iconNode={pig} {...props} />;
const PigHeadIcon = (props: LucideProps) => <Icon iconNode={pigHead} {...props} />;

const iconMap: Record<string, ComponentType<LucideProps>> = {
  "🐖": PigIcon,
  "🐷": PigHeadIcon,
  "♀": Venus,
  "🤰": HeartPulse,
  "👩‍🍼": HeartPulse,
  "🍼": Baby,
  "⚖": Scale,
  "⚖️": Scale,
  "🎯": Target,
  "📦": Package,
  "📈": TrendingUp,
  "↗": TrendingUp,
  "📉": TrendingDown,
  "📊": ChartNoAxesColumnIncreasing,
  "📋": ClipboardList,
  "📝": ClipboardList,
  "⏰": Clock3,
  "⏳": Hourglass,
  "🔄": RefreshCw,
  "💉": Syringe,
  "💊": Pill,
  "💰": CircleDollarSign,
  "💲": CircleDollarSign,
  "🔗": Link2,
  "🔒": Lock,
  "🔬": FlaskConical,
  "⚠️": ShieldAlert,
  "🚫": ShieldAlert,
  "✅": Check,
  "❌": X,
  "🟢": Circle,
  "🔴": Circle,
  "🔵": Circle,
};

export function ReproductionIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  const IconComponent = iconMap[icon] ?? Circle;
  return <IconComponent size={size} strokeWidth={2.1} aria-hidden="true" />;
}

export function ReproducaoKpiCards({ kpis }: ReproducaoKpiCardsProps) {
  return (
    <div className="repro-kpi-grid">
      {kpis.map((k, i) => {
        const trend = trendBadge[k.trend ?? "neutral"];
        return (
          <div key={i} className="repro-kpi-item">
            <div className="repro-kpi-card">
              <div className="d-flex align-items-center gap-3">
                <div
                  className="repro-kpi-icon"
                  style={{ background: k.color, color: k.color.replace('0.95', '0.45').replace('0.96', '0.5') }}
                >
                  <ReproductionIcon icon={k.icon} size={20} />
                </div>
                <div className="flex-grow-1">
                  <div className="repro-kpi-value">{k.value}</div>
                  <div className="repro-kpi-label">{k.label}</div>
                  {k.sub && <div className="repro-kpi-sub">{k.sub}</div>}
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
