"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import "./reproducao.css";
import { ReproducaoKpiCards, KpiCard } from "./ReproducaoKpiCards";
import { ReproducaoAlerts, AlertItem, AiSuggestion } from "./ReproducaoAlerts";
import {
  ReproducaoTabContent,
  TableColumn,
  TableRow,
  BadgeVariant,
} from "./ReproducaoTabContent";
import { ReproducaoModal, ModalField } from "./ReproducaoModal";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlowStep {
  icon: string;
  label: string;
  count: number;
  color: string;
  borderColor: string;
}

export interface TabConfig {
  id: string;
  icon: string;
  label: string;
  count?: number;
  columns: TableColumn[];
  rows: TableRow[];
  statusKey?: string;
  statusMap?: Record<string, { label: string; variant: BadgeVariant }>;
  searchPlaceholder?: string;
  filterKey?: string;
  filterOptions?: { value: string; label: string }[];
  emptyIcon?: string;
  emptyText?: string;
  primaryActionLabel?: string;
  primaryActionModalFields?: ModalField[];
  primaryActionModalTitle?: string;
  primaryActionModalSubtitle?: string;
}

export interface ReproducaoConfig {
  especie: "suinos" | "bovinos" | "aves";
  emoji: string;
  titulo: string;
  subtitulo: string;
  badgeColor: string;
  badgeTextColor: string;
  kpis: KpiCard[];
  flowSteps: FlowStep[];
  tabs: TabConfig[];
  alerts: AlertItem[];
  aiSuggestions: AiSuggestion[];
}

// ─── Dashboard Tab (overview) ────────────────────────────────────────────────

function DashboardTabContent({
  config,
  onTabChange,
}: {
  config: ReproducaoConfig;
  onTabChange: (id: string) => void;
}) {
  return (
    <div>
      {/* KPIs */}
      <ReproducaoKpiCards kpis={config.kpis} />

      {/* Production flow */}
      <div className="dashboard-card p-4 mb-4" style={{ background: "white" }}>
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div>
            <h6 className="fw-bold mb-0" style={{ fontSize: "0.95rem" }}>
              Fluxo produtivo
            </h6>
            <p className="text-muted small mb-0" style={{ fontSize: "0.75rem" }}>
              Distribuição atual de animais por fase
            </p>
          </div>
        </div>
        <div className="repro-flow">
          {config.flowSteps.map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center" }}>
              <button
                className="repro-flow-step"
                style={{ border: "none", background: "none", cursor: "pointer" }}
                onClick={() => onTabChange(config.tabs[i + 1]?.id ?? config.tabs[1]?.id)}
                title={`Ver aba ${step.label}`}
              >
                <div
                  className="repro-flow-circle"
                  style={{
                    background: step.color,
                    borderColor: step.borderColor,
                  }}
                >
                  {step.icon}
                </div>
                <div className="repro-flow-count">{step.count}</div>
                <div className="repro-flow-label">{step.label}</div>
              </button>
              {i < config.flowSteps.length - 1 && (
                <span className="repro-flow-arrow">›</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Alerts & AI */}
      <ReproducaoAlerts
        alerts={config.alerts}
        aiSuggestions={config.aiSuggestions}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReproducaoDashboard({ config }: { config: ReproducaoConfig }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [modalOpen, setModalOpen] = useState(false);

  const allTabs = [
    { id: "dashboard", icon: "📊", label: "Dashboard", count: undefined },
    ...config.tabs,
  ];

  const currentTab = config.tabs.find((t) => t.id === activeTab);

  return (
    <div>
      {/* ─── Header ─── */}
      <div className="repro-header">
        <span
          className="repro-header-badge"
          style={{
            background: config.badgeColor,
            color: config.badgeTextColor,
          }}
        >
          {config.emoji} {config.titulo}
        </span>

        <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap">
          <div>
            <h1
              className="fw-black mb-1"
              style={{
                fontSize: "1.6rem",
                letterSpacing: "-0.03em",
                color: "var(--foreground)",
              }}
            >
              Reprodução — {config.titulo}
            </h1>
            <p
              className="mb-0"
              style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}
            >
              {config.subtitulo}
            </p>
          </div>

          {activeTab !== "dashboard" && currentTab?.primaryActionLabel && (
            <button
              className="repro-btn-primary"
              onClick={() => setModalOpen(true)}
            >
              <Plus size={16} />
              {currentTab.primaryActionLabel}
            </button>
          )}
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="repro-tabs-wrapper">
        <div className="repro-tabs-scroll">
          <div className="repro-tabs">
            {allTabs.map((tab) => (
              <button
                key={tab.id}
                className={`repro-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="repro-tab-icon">{tab.icon}</span>
                {tab.label}
                {tab.count !== undefined && (
                  <span className="repro-tab-count">{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Tab content ─── */}
        <div className="repro-tab-panel">
          {activeTab === "dashboard" ? (
            <DashboardTabContent
              config={config}
              onTabChange={setActiveTab}
            />
          ) : currentTab ? (
            <ReproducaoTabContent
              columns={currentTab.columns}
              rows={currentTab.rows}
              statusKey={currentTab.statusKey}
              statusMap={currentTab.statusMap}
              searchPlaceholder={currentTab.searchPlaceholder}
              filterKey={currentTab.filterKey}
              filterOptions={currentTab.filterOptions}
              emptyIcon={currentTab.emptyIcon}
              emptyText={currentTab.emptyText}
              actions={[]}
            />
          ) : null}
        </div>
      </div>

      {/* ─── Modal ─── */}
      {currentTab?.primaryActionModalFields && (
        <ReproducaoModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={currentTab.primaryActionModalTitle ?? currentTab.primaryActionLabel ?? "Novo registro"}
          subtitle={currentTab.primaryActionModalSubtitle}
          fields={currentTab.primaryActionModalFields}
          confirmLabel="Salvar"
          onConfirm={(data) => {
            console.log("[Reprodução] new record:", data);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
