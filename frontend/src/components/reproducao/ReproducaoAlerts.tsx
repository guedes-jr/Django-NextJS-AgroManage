"use client";

import "./reproducao.css";
import { AlertListCard } from "@/components/ui/AlertListCard";
import { useOrganizationLocale } from "@/lib/locale";

export interface AlertItem {
  due_date?: string; created_at?: string;
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
  const { t } = useOrganizationLocale();
  return (
    <div className="row g-4">
      {/* Alert list */}
      <div className="col-12 col-lg-7">
        <AlertListCard alerts={alerts}/>
      </div>

      {/* AI Suggestions */}
      <div className="col-12 col-lg-5">
        <div className="repro-ai-card h-100">
          <div className="repro-ai-header">
            <span>🤖</span>
            <span>{t("reproduction.aiAssistant")}</span>
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
              {t("reproduction.noSuggestions")}
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
