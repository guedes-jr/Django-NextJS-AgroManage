"use client";

import "./reproducao.css";

export interface AlertItem {
  type: "warning" | "danger" | "info" | "success";
  icon: string;
  text: string;
  time: string;
}

export interface AiSuggestion {
  text: string;
}

interface ReproducaoAlertsProps {
  alerts: AlertItem[];
  aiSuggestions: AiSuggestion[];
}

export function ReproducaoAlerts({ alerts, aiSuggestions }: ReproducaoAlertsProps) {
  return (
    <div className="row g-4">
      {/* Alert list */}
      <div className="col-12 col-lg-7">
        <div
          className="dashboard-card p-4 h-100"
          style={{ background: "white" }}
        >
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h6 className="fw-bold mb-0" style={{ fontSize: "0.95rem" }}>
                ⚠️ Alertas do sistema
              </h6>
              <p className="text-muted small mb-0" style={{ fontSize: "0.75rem" }}>
                Itens que precisam de atenção
              </p>
            </div>
            {alerts.length > 0 && (
              <span
                className="repro-badge repro-badge-red"
                style={{ fontSize: "0.7rem" }}
              >
                {alerts.length} alertas
              </span>
            )}
          </div>

          {alerts.length === 0 ? (
            <div className="repro-empty" style={{ padding: "2rem" }}>
              <span className="repro-empty-icon">✅</span>
              <span className="small text-muted">Nenhum alerta no momento</span>
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
      </div>

      {/* AI Suggestions */}
      <div className="col-12 col-lg-5">
        <div className="repro-ai-card h-100">
          <div className="repro-ai-header">
            <span>🤖</span>
            <span>Assistente IA</span>
            <span className="repro-ai-badge">Beta</span>
          </div>
          {aiSuggestions.length === 0 ? (
            <div
              style={{
                fontSize: "0.8rem",
                opacity: 0.5,
                textAlign: "center",
                padding: "1rem",
              }}
            >
              Nenhuma sugestão no momento
            </div>
          ) : (
            aiSuggestions.map((s, i) => (
              <div key={i} className="repro-ai-suggestion">
                {s.text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
