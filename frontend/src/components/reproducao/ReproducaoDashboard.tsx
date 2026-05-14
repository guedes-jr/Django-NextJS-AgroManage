"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import "./reproducao.css";
import { Skeleton, CardSkeleton, TableSkeleton, BatchAction } from "@/components/ui";
import { ReproducaoKpiCards, KpiCard } from "./ReproducaoKpiCards";
import { ReproducaoAlerts, AlertItem, AiSuggestion } from "./ReproducaoAlerts";
import { DesempenhoChart } from "./DesempenhoChart";
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
  onSave?: (data: Record<string, string>) => Promise<void>;
  kpis?: KpiCard[];
  tabActions?: { label: string; icon: string; color: string; desc: string }[];
  tabAlerts?: AlertItem[];
  tabAiSuggestions?: AiSuggestion[];
  selectable?: boolean;
  rowKey?: string;
  batchActions?: BatchAction<TableRow>[];
}

export interface ActivityItem {
  icon: string;
  text: string;
  time: string;
  type: "success" | "info" | "warning" | "system";
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
  activities: ActivityItem[];
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
      <ReproducaoKpiCards kpis={config.kpis} />

      <div className="dashboard-card overflow-hidden p-4 mb-5 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
        <div className="d-flex align-items-center justify-content-between mb-4">
          <div>
            <h3 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: '1.25rem', color: 'var(--foreground)' }}>
              Fluxo Produtivo
            </h3>
            <p className="text-muted-foreground small mb-0 fw-medium">
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

      <DesempenhoChart category="reprodutivo" />

      <div className="dashboard-card overflow-hidden mb-5 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
        <div className="d-flex align-items-center justify-content-between p-4 pb-0">
          <div>
            <h3 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ fontSize: '1.25rem', color: 'var(--foreground)' }}>
              <span>📋</span> Atividades Recentes
            </h3>
            <p className="text-muted-foreground small mb-0 fw-medium">
              Últimas movimentações registradas no sistema
            </p>
          </div>
          <span className="badge bg-light text-muted rounded-pill" style={{ fontSize: '0.7rem', fontWeight: 700 }}>
            {config.activities.length} registros
          </span>
        </div>
        <div className="p-4">
          {config.activities.length === 0 ? (
            <div className="text-center py-4 text-muted small">Nenhuma atividade recente</div>
          ) : (
            <div className="repro-activity-list">
              {config.activities.map((act, i) => (
                <div key={i} className="repro-activity-item">
                  <div className={`repro-activity-dot repro-activity-dot-${act.type}`} />
                  <div className="repro-activity-content">
                    <span className="repro-activity-icon">{act.icon}</span>
                    <span className="repro-activity-text">{act.text}</span>
                  </div>
                  <span className="repro-activity-time">{act.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ReproducaoAlerts
        alerts={config.alerts}
        aiSuggestions={config.aiSuggestions}
      />
    </div>
  );
}

// ─── Loading skeletons ────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div>
      <div className="row g-4 mb-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="col-12 col-sm-6 col-lg">
            <CardSkeleton />
          </div>
        ))}
      </div>
      <div className="dashboard-card overflow-hidden p-4 mb-5 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
        <Skeleton width="40%" height="24px" className="mb-3" />
        <div className="d-flex gap-4 justify-content-center py-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="d-flex flex-column align-items-center gap-2">
              <Skeleton width="48px" height="48px" borderRadius="50%" />
              <Skeleton width="30px" height="16px" />
              <Skeleton width="60px" height="12px" />
            </div>
          ))}
        </div>
      </div>
      <TableSkeleton rows={4} />
    </div>
  );
}

function TabSkeleton() {
  return (
    <div>
      <div className="row g-4 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="col-12 col-sm-6 col-lg-3">
            <CardSkeleton />
          </div>
        ))}
      </div>
      <TableSkeleton rows={6} />
    </div>
  );
}

// ─── Loading overlay for background refetch ────────────────────────────────────

function RefetchOverlay() {
  return (
    <div
      className="d-flex align-items-center justify-content-center py-5 text-muted-foreground gap-2"
      style={{ fontSize: "0.85rem" }}
    >
      <Loader2 size={18} className="spin-animation" />
      <span>Atualizando dados...</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReproducaoDashboard({
  config,
  initialLoading,
  tabLoading,
}: {
  config: ReproducaoConfig;
  initialLoading?: boolean;
  tabLoading?: Record<string, boolean>;
}) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [modalOpen, setModalOpen] = useState(false);

  const allTabs = [
    { id: "dashboard", icon: "📊", label: "Dashboard", count: undefined },
    ...config.tabs,
  ];

  const currentTab = config.tabs.find((t) => t.id === activeTab);
  const isActiveTabLoading = activeTab === "dashboard"
    ? initialLoading
    : tabLoading?.[activeTab] ?? false;
  const hasTabData = activeTab === "dashboard" || currentTab?.count !== undefined;

  return (
    <div>
      {/* ─── Breadcrumb dinâmico ─── */}
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <span style={{ color: "var(--muted-foreground)" }}>Rebanho</span>
          <span className="text-muted-foreground">›</span>
          <span className="fw-semibold text-foreground">{config.titulo}</span>
          <span className="text-muted-foreground">›</span>
          <span>Reprodução</span>
          {activeTab !== "dashboard" && currentTab && (
            <>
              <span className="text-muted-foreground">›</span>
              <span className="fw-semibold" style={{ color: "var(--primary)" }}>{currentTab.label}</span>
            </>
          )}
        </nav>
      </div>

      <div className="mb-5 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
        <div>
          <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>
            Módulo de Reprodução
          </h1>
          <p className="mb-0 text-muted-foreground fw-medium">
            {config.subtitulo}
          </p>
        </div>

        {activeTab !== "dashboard" && currentTab?.primaryActionLabel && (
          <button
            className="btn btn-primary d-inline-flex align-items-center gap-2 fw-semibold px-4 py-2 shadow-sm rounded-pill transition-all hover-scale"
            style={{ fontSize: '0.9rem', backgroundColor: 'var(--primary)', borderColor: 'var(--primary)' }}
            onClick={() => setModalOpen(true)}
          >
            <Plus size={18} />
            {currentTab.primaryActionLabel}
          </button>
        )}
      </div>

      {/* ─── Tabs ─── */}
      <ul className="nav nav-tabs mb-4 border-bottom w-100">
        {allTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <li className="nav-item" key={tab.id}>
              <button
                className={`nav-link d-flex align-items-center gap-2 py-3 px-4 fw-semibold border-0 border-bottom border-3 rounded-0 ${
                  isActive
                    ? "active text-success border-success bg-transparent"
                    : "text-muted border-transparent hover-bg-light"
                }`}
                style={{ fontSize: '0.9rem', marginBottom: '-1px' }}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className={isActive ? "text-success" : "text-muted"}>{tab.icon}</span>
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`badge rounded-pill ms-1 ${isActive ? "bg-success" : "bg-light text-muted"}`}
                    style={{ fontSize: '0.6rem', fontWeight: 700 }}>
                    {tab.count}
                  </span>
                )}
                {tabLoading?.[tab.id] && !isActive && (
                  <Loader2 size={12} className="ms-1 text-muted spin-animation" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* ─── Tab content ─── */}
      <div>
        {activeTab === "dashboard" ? (
          initialLoading ? <DashboardSkeleton /> : <DashboardTabContent config={config} onTabChange={setActiveTab} />
        ) : currentTab ? (
          isActiveTabLoading && !hasTabData ? (
            <TabSkeleton />
          ) : (
            <>
              {isActiveTabLoading && hasTabData && <RefetchOverlay />}
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
                kpis={currentTab.kpis}
                tabActions={currentTab.tabActions}
                tabAlerts={currentTab.tabAlerts}
                tabAiSuggestions={currentTab.tabAiSuggestions}
                actions={[]}
                selectable={currentTab.selectable}
                rowKey={currentTab.rowKey}
                batchActions={currentTab.batchActions}
              />
            </>
          )
        ) : null}
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
          onConfirm={currentTab.onSave}
        />
      )}
    </div>
  );
}
