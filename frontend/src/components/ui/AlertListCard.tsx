"use client";

import Link from "next/link";
import { newestAlerts, ALERTS_PAGE, ALERT_PREVIEW_LIMIT } from "@/services/operationalAlertPresentation";
import { useOrganizationLocale } from "@/lib/locale";

interface AlertItem {
  due_date?: string; created_at?: string;
  type: "warning" | "danger" | "info" | "success";
  icon: string;
  text: string;
  time: string;
}

interface AlertListCardProps {
  alerts: AlertItem[];
  title?: string;
  subtitle?: string;
  emptyText?: string;
}

export function AlertListCard({
  alerts,
  title,
  subtitle,
  emptyText,
}: AlertListCardProps) {
  const { t } = useOrganizationLocale();
  return (
    <div className="dashboard-card p-4 h-100" style={{ background: "var(--card)", color: "var(--foreground)" }}>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h6 className="fw-bold mb-0" style={{ fontSize: "0.95rem" }}>
            ⚠️ {title ?? t("reproduction.alerts")}
          </h6>
          <p className="text-muted small mb-0" style={{ fontSize: "0.75rem" }}>
            {subtitle ?? t("reproduction.alertsSubtitle")}
          </p>
        </div>
        {alerts.length > 0 && (
          <span className="repro-badge repro-badge-red" style={{ fontSize: "0.7rem" }}>
            {t("reproduction.alertCount", { count: alerts.length })}
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="repro-empty" style={{ padding: "2rem" }}>
          <span className="repro-empty-icon">✅</span>
          <span className="small text-muted">{emptyText ?? t("reproduction.noAlerts")}</span>
        </div>
      ) : (
        <div className="repro-alert-list">
          {newestAlerts(alerts).slice(0, ALERT_PREVIEW_LIMIT).map((alert, i) => (
            <div key={i} className={`repro-alert-item ${alert.type}`}>
              <span className="repro-alert-icon">{alert.icon}</span>
              <div>
                <div className="repro-alert-text">{alert.text}</div>
                <div className="repro-alert-time">{alert.time}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Link href={ALERTS_PAGE} className="d-inline-block mt-3 small fw-semibold">{t("reproduction.viewAllAlerts")}</Link>
    </div>
  );
}
