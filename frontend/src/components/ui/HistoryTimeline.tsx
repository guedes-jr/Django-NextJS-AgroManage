"use client";

export interface TimelineEvent {
  date: string;
  icon: string;
  text: string;
  type: "success" | "info" | "warning" | "system";
}

interface HistoryTimelineProps {
  events: TimelineEvent[];
  title?: string;
  subtitle?: string;
  emptyText?: string;
}

const dotClass: Record<string, string> = {
  success: "bg-success",
  info: "bg-primary",
  warning: "bg-warning",
  system: "bg-muted-foreground",
};

export function HistoryTimeline({
  events,
  title = "Histórico",
  subtitle = "Registro de eventos",
  emptyText = "Nenhum evento registrado",
}: HistoryTimelineProps) {
  return (
    <div
      className="dashboard-card p-4 shadow-sm"
      style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}
    >
      <div className="mb-4">
        <h6 className="fw-bold mb-0" style={{ fontSize: "0.95rem" }}>
          📋 {title}
        </h6>
        <p className="text-muted small mb-0" style={{ fontSize: "0.75rem" }}>
          {subtitle}
        </p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-4 text-muted small">{emptyText}</div>
      ) : (
        <div style={{ position: "relative" }}>
          {/* Vertical line */}
          <div
            style={{
              position: "absolute",
              left: "15px",
              top: "8px",
              bottom: "8px",
              width: "2px",
              background: "var(--border)",
            }}
          />
          <div className="d-flex flex-column" style={{ gap: 0 }}>
            {events.map((event, i) => (
              <div key={i} className="d-flex align-items-start gap-3 pb-4 position-relative" style={{ paddingLeft: 0 }}>
                <div
                  className={`rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 ${dotClass[event.type] || dotClass.system}`}
                  style={{
                    width: "32px",
                    height: "32px",
                    fontSize: "0.85rem",
                    zIndex: 1,
                    color: "white",
                  }}
                >
                  {event.icon}
                </div>
                <div className="flex-grow-1 min-w-0" style={{ paddingTop: "4px" }}>
                  <div className="fw-semibold small text-foreground">{event.text}</div>
                  <div className="text-muted-foreground" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                    {event.date}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
