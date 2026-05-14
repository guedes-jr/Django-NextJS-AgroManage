"use client";

import { ChevronRight } from "lucide-react";

interface QuickAction {
  label: string;
  icon: string;
  color: string;
  desc: string;
  onClick?: () => void;
}

interface QuickActionsCardProps {
  title?: string;
  subtitle?: string;
  actions: QuickAction[];
}

export function QuickActionsCard({ title = "Ações Rápidas", subtitle, actions }: QuickActionsCardProps) {
  if (!actions || actions.length === 0) return null;

  return (
    <div className="mb-4">
      {title && (
        <div className="mb-3">
          <h3 className="fw-bold mb-0" style={{ fontSize: "1.25rem", color: "var(--foreground)" }}>
            {title}
          </h3>
          {subtitle && <p className="text-muted-foreground small mb-0 fw-medium">{subtitle}</p>}
        </div>
      )}
      <div className="row g-3">
        {actions.map((action, i) => (
          <div key={i} className="col-12 col-md-6 col-lg-3">
            <button
              className="d-flex w-100 text-start align-items-center gap-3 p-3"
              onClick={action.onClick}
              type="button"
              style={{
                background: "var(--card)",
                borderRadius: "12px",
                border: "1.5px solid var(--border)",
                boxShadow: "var(--card-premium-shadow)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 15px 35px -5px rgba(0,0,0,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
            >
              <div
                className="d-flex align-items-center justify-content-center rounded-lg flex-shrink-0"
                style={{
                  width: 40,
                  height: 40,
                  background: `color-mix(in srgb, ${action.color}, transparent 90%)`,
                  color: action.color,
                }}
              >
                <span style={{ fontSize: "1.1rem" }}>{action.icon}</span>
              </div>
              <div className="flex-grow-1 min-w-0">
                <div className="fw-bold small text-foreground">{action.label}</div>
                <div className="text-muted-foreground" style={{ fontSize: "0.7rem" }}>
                  {action.desc}
                </div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
