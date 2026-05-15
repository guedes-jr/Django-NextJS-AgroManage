"use client";

import { useState, useEffect } from "react";
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
  QuickAction,
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
  tabActions?: { 
    label: string; 
    icon: string; 
    color: string; 
    desc: string; 
    type?: 'primary' | 'weight' | 'vaccine' | 'diagnosis' | 'birth' | 'wean' | 'transfer' | 'discard' | 'promote' | 'mating_marra';
    onClick?: () => void;
  }[];
  tabAlerts?: AlertItem[];
  tabAiSuggestions?: AiSuggestion[];
  selectable?: boolean;
  rowKey?: string;
  batchActions?: BatchAction<TableRow>[];
  onRowClick?: (row: TableRow) => void;
  actions?: QuickAction[];
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

import { 
  registerWeight, 
  registerVaccination, 
  diagnosePregnancy, 
  promoteToMating, 
  discardAnimal,
  createBirth,
  registerMating,
  updateAnimal,
  createAnimalBatch,
  updatePregnancy,
  fetchAnimalDetails
} from "@/services/livestockService";

import { useRouter } from "next/navigation";

export function ReproducaoDashboard({
  config,
  initialLoading,
  tabLoading,
  onSuccess,
  reproducerOptions,
  activeTab: controlledActiveTab,
  onTabChange: controlledOnTabChange,
}: {
  config: ReproducaoConfig;
  initialLoading?: boolean;
  tabLoading?: Record<string, boolean>;
  onSuccess?: () => void;
  reproducerOptions?: { id: number; identifier: string; category: string }[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
}) {
  const router = useRouter();
  const [internalActiveTab, setInternalActiveTab] = useState("dashboard");
  const [modalOpen, setModalOpen] = useState(false);

  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = controlledOnTabChange ?? setInternalActiveTab;
  const [selectedRows, setSelectedRows] = useState<any[]>([]);

  // Reset selection when tab changes
  useEffect(() => {
    setSelectedRows([]);
  }, [activeTab]);
  const [actionModal, setActionModal] = useState<{ 
    open: boolean; 
    title: string; 
    subtitle?: string; 
    fields: ModalField[]; 
    onConfirm: (data: any) => Promise<void> 
  }>({
    open: false,
    title: "",
    fields: [],
    onConfirm: async () => {},
  });

  const handleAction = (action: any, rows: any[] = []) => {
    if (action.onClick) {
      action.onClick();
      return;
    }

    const animalOptions = rows.map(r => ({ 
      value: String(r.id || r.pk || r.identifier || ""), 
      label: String(r.identifier || r.batch_code || r.name || r.id || r.pk || "Sem ID") 
    })).filter(o => o.value);

    switch (action.type) {
      case 'weight':
        setActionModal({
          open: true,
          title: "Registrar Pesagem",
          subtitle: "Informe o peso atual do animal ou lote",
          fields: [
            { 
              name: "id", 
              label: "Animal / Lote", 
              type: animalOptions.length > 0 ? "select" : "text", 
              options: animalOptions,
              placeholder: "Brinco ou Lote", 
              required: true 
            },
            { name: "weight_kg", label: "Peso (kg)", type: "number", placeholder: "0.00", required: true },
            { name: "weighing_date", label: "Data da Pesagem", type: "date", required: true },
            { name: "notes", label: "Observações", type: "textarea" },
          ],
          onConfirm: async (data) => {
            await registerWeight(data.id, { weight_kg: parseFloat(data.weight_kg), weighing_date: data.weighing_date, notes: data.notes });
            onSuccess?.();
            setActionModal(prev => ({ ...prev, open: false }));
          }
        });
        break;
      case 'vaccine':
        setActionModal({
          open: true,
          title: "Registrar Vacina / Medicamento",
          fields: [
            { 
              name: "id", 
              label: "Identificador", 
              type: animalOptions.length > 0 ? "select" : "text", 
              options: animalOptions,
              required: true 
            },
            { name: "vaccine_name", label: "Nome do Produto", type: "text", required: true },
            { name: "application_date", label: "Data de Aplicação", type: "date", required: true },
            { name: "dose_type", label: "Tipo de Dose", type: "select", options: [
              { value: "unica", label: "Dose Única" },
              { value: "reforco", label: "Reforço" },
            ]},
            { name: "dosage_ml", label: "Dosagem (ml)", type: "number" },
          ],
          onConfirm: async (data) => {
            await registerVaccination(data.id, data);
            onSuccess?.();
            setActionModal(prev => ({ ...prev, open: false }));
          }
        });
        break;
      case 'diagnosis':
        setActionModal({
          open: true,
          title: rows.length > 1 ? `Diagnóstico em Lote (${rows.length})` : "Diagnóstico de Prenhez",
          fields: [
            { 
              name: "id", 
              label: rows.length > 1 ? "Matrizes Selecionadas" : "Matriz (Brinco)", 
              type: rows.length > 1 ? "text" : (animalOptions.length > 0 ? "select" : "text"), 
              options: animalOptions,
              initialValue: rows.length === 1 ? animalOptions[0]?.value : (rows.length > 1 ? "Múltiplos selecionados" : undefined),
              disabled: rows.length >= 1,
              required: true 
            },
            { name: "result", label: "Resultado", type: "select", required: true, options: [
              { value: "positive", label: "Positivo (Gestante)" },
              { value: "negative", label: "Negativo (Vazia)" },
            ]},
            { 
              name: "diagnosis_date", 
              label: "Data do Diagnóstico", 
              type: "date", 
              required: true,
              initialValue: new Date().toISOString().split('T')[0]
            },
          ],
          onConfirm: async (data) => {
            if (rows.length > 1) {
              await Promise.all(rows.map(r => {
                return diagnosePregnancy(r.id as number, data.result as 'positive' | 'negative', data.diagnosis_date);
              }));
            } else {
              await diagnosePregnancy(data.id as any, data.result as 'positive' | 'negative', data.diagnosis_date);
            }
            onSuccess?.();
            setActionModal(prev => ({ ...prev, open: false }));
          }
        });
        break;
      case 'birth':
        setActionModal({
            open: true,
            title: rows.length > 1 ? `Confirmar Parto em Lote (${rows.length})` : "Confirmar Parto",
            fields: [
              { 
                name: "female_identifier", 
                label: rows.length > 1 ? `Matrizes Selecionadas` : "Matriz (Brinco)", 
                type: rows.length > 1 ? "text" : (animalOptions.length > 0 ? "select" : "text"), 
                options: animalOptions,
                initialValue: rows.length === 1 ? animalOptions[0]?.value : (rows.length > 1 ? "Múltiplos selecionados" : undefined),
                disabled: rows.length >= 1,
                required: true 
              },
              { 
                name: "birth_date", 
                label: "Data do Parto", 
                type: "date", 
                required: true,
                initialValue: new Date().toISOString().split('T')[0]
              },
              { 
                name: "live_born", 
                label: "Nascidos Vivos", 
                type: "number", 
                required: true,
                initialValue: 12
              },
              { 
                name: "stillborn", 
                label: "Óbitos", 
                type: "number",
                initialValue: 0
              },
              { 
                name: "mummified", 
                label: "Mumificados", 
                type: "number",
                initialValue: 0
              },
            ],
            onConfirm: async (data) => {
              const performBirth = async (animalRow: any) => {
                const animalId = animalRow.animal_id || animalRow.id;
                const pregnancyId = animalRow.id; // Nas gestações o ID principal é o da Prenhez
                const identifier = animalRow.identifier;

                try {
                  // Buscar detalhes para ter farm e species
                  const animalDetails = await fetchAnimalDetails(animalId);

                  // 1. Criar o lote de leitões primeiro
                  const batch = await createAnimalBatch({
                    batch_code: `L-${identifier}-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '')}`,
                    quantity: parseInt(data.live_born) || 0,
                    phase: "gestacao_maternidade",
                    category: "Leitão",
                    status: "active",
                    species_code_input: "suinos",
                    farm_id: animalDetails.farm_id || animalDetails.farm,
                    entry_date: data.birth_date,
                    mother: animalId,
                    notes: `Leitegada da matriz ${identifier}`
                  });

                  // 2. Criar registro de parto (Vinculado à prenhez e ao lote recém criado)
                  await createBirth({ 
                    ...data, 
                    female: animalId,
                    pregnancy: pregnancyId,
                    batch: batch.id
                  });

                  // 3. Marcar prenhez como concluída
                  await updatePregnancy(pregnancyId, { status: 'completed' });

                  // 4. Mover mãe para Lactante
                  await updateAnimal(animalId, { 
                    reproductive_status: "lactante" 
                  });
                } catch (err) {
                  console.error(`Erro no processamento da matriz ${identifier}:`, err);
                  throw err;
                }
              };

              try {
                if (rows.length > 1) {
                  // Em lote
                  await Promise.all(rows.map(r => performBirth(r)));
                } else if (rows.length === 1) {
                  await performBirth(rows[0]);
                } else {
                  await createBirth(data);
                }
                onSuccess?.();
                setActionModal(prev => ({ ...prev, open: false }));
              } catch (err) {
                console.error("Erro geral ao processar parto:", err);
              }
            }
          });
          break;
      case 'mating_marra': {
        const sireOpts = (reproducerOptions || []).map(r => ({
          value: String(r.id),
          label: `${r.identifier}${r.category ? ` (${r.category})` : ''}`,
        }));
        setActionModal({
          open: true,
          title: "💖 Registrar Cobertura da Marrã",
          subtitle: "Registre a primeira cobertura e inicie o ciclo reprodutivo",
          fields: [
            {
              name: "id",
              label: "Marrã (Brinco)",
              type: animalOptions.length > 0 ? "select" : "text",
              options: animalOptions,
              placeholder: "Selecione a marrã",
              required: true,
            },
            { name: "mating_date", label: "Data da Cobertura", type: "date", required: true },
            {
              name: "mating_type",
              label: "Tipo de Cobertura",
              type: "select",
              options: [
                { value: "ai", label: "Inseminação Artificial" },
                { value: "natural", label: "Monta Natural" },
                { value: "iatf", label: "IATF" },
              ],
            },
            {
              name: "sire_id",
              label: sireOpts.length > 0 ? "Reprodutor (Cachaço)" : "Reprodutor (não há machos cadastrados)",
              type: sireOpts.length > 0 ? "select" : "text",
              options: sireOpts.length > 0 ? [{ value: "", label: "Não informar" }, ...sireOpts] : undefined,
              placeholder: sireOpts.length > 0 ? "Selecione o reprodutor" : "Não há reprodutores cadastrados",
            },
            {
              name: "sire_info",
              label: "Reprodutor (texto livre)",
              type: "text",
              placeholder: "Registro externo, dose de semêm, etc.",
            },
            { name: "notes", label: "Observações", type: "textarea" },
          ],
          onConfirm: async (data) => {
            const animalId = data.id;
            if (!animalId) throw new Error("Selecione a marrã");
            await registerMating(animalId, {
              mating_date: data.mating_date,
              mating_type: data.mating_type || "ai",
              sire_info: data.sire_info || "",
              ...(data.sire_id ? { sire_id: Number(data.sire_id) } : {}),
            });
            onSuccess?.();
            setActionModal(prev => ({ ...prev, open: false }));
          },
        });
        break;
      }
      case 'promote':
        setActionModal({
          open: true,
          title: "Promover para Cobertura",
          subtitle: "Confirme se o animal está pronto para o ciclo reprodutivo",
          fields: [
            { 
              name: "id", 
              label: "Identificador", 
              type: animalOptions.length > 0 ? "select" : "text", 
              options: animalOptions,
              required: true 
            },
          ],
          onConfirm: async (data) => {
            await promoteToMating(data.id);
            onSuccess?.();
            setActionModal(prev => ({ ...prev, open: false }));
          }
        });
        break;
      case 'primary':
        setModalOpen(true);
        break;
      default:
        console.warn(`Action type ${action.type} not implemented`);
    }
  };

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
                tabActions={currentTab.tabActions?.map(action => ({
                  ...action,
                  onClick: () => handleAction(action, selectedRows)
                }))}
                tabAlerts={currentTab.tabAlerts}
                tabAiSuggestions={currentTab.tabAiSuggestions}
                selectable={currentTab.selectable}
                rowKey={currentTab.rowKey}
                onRowClick={(row) => {
                  const id = row.animal_id || row.id || row.pk || row.identifier;
                  if (id) {
                    router.push(`/home/rebanho/suinos/animal/${id}`);
                  }
                }}
                actions={currentTab.actions?.map(action => ({
                  ...action,
                  onClick: (row) => {
                    if ((action as any).type) {
                      handleAction({ type: (action as any).type }, [row]);
                    } else {
                      action.onClick(row);
                    }
                  }
                }))}
                batchActions={currentTab.batchActions?.map(ba => ({
                  ...ba,
                  onClick: (rows) => {
                    if ((ba as any).type) {
                      handleAction({ type: (ba as any).type }, rows);
                    } else if (ba.onClick) {
                      ba.onClick(rows);
                    }
                  }
                }))}
                onSelectionChange={setSelectedRows}
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

      {/* ─── Generic Action Modal ─── */}
      <ReproducaoModal
        open={actionModal.open}
        onClose={() => setActionModal(prev => ({ ...prev, open: false }))}
        title={actionModal.title}
        subtitle={actionModal.subtitle}
        fields={actionModal.fields}
        confirmLabel="Confirmar"
        onConfirm={actionModal.onConfirm}
      />
    </div>
  );
}
