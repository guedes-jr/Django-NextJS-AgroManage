"use client";

interface AlertItem {
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
  title = "Alertas do sistema",
  subtitle = "Itens que precisam de atenção",
  emptyText = "Nenhum alerta no momento",
}: AlertListCardProps) {
  return (
    <div className="dashboard-card p-4 h-100" style={{ background: "white" }}>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h6 className="fw-bold mb-0" style={{ fontSize: "0.95rem" }}>
            ⚠️ {title}
          </h6>
          <p className="text-muted small mb-0" style={{ fontSize: "0.75rem" }}>
            {subtitle}
          </p>
        </div>
        {alerts.length > 0 && (
          <span className="repro-badge repro-badge-red" style={{ fontSize: "0.7rem" }}>
            {alerts.length} alertas
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="repro-empty" style={{ padding: "2rem" }}>
          <span className="repro-empty-icon">✅</span>
          <span className="small text-muted">{emptyText}</span>
        </div>
      ) : (
        <div className="repro-alert-list">
          {alerts.map((alert, i) => (
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
    </div>
  );
}
