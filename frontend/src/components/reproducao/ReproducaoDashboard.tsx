"use client";
 
import { useState, useEffect } from "react";
import { Plus, Loader2, X } from "lucide-react";
import Link from "next/link";
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
import { apiClient } from "@/services/api";

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
  createMating,
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
  const [noReproducersWarningOpen, setNoReproducersWarningOpen] = useState(false);
  const [allSemenItems, setAllSemenItems] = useState<any[]>([]);
  const [semenItems, setSemenItems] = useState<any[]>([]);

  useEffect(() => {
    const fetchSemen = async () => {
      try {
        const mapEspecie = (e: string) => {
          if (e === "suinos") return "suino";
          if (e === "bovinos") return "bovino";
          if (e === "aves") return "ave";
          return e;
        };
        const mappedSp = mapEspecie(config.especie);
        const { data: allData } = await apiClient.get("/inventory/items/all_items/", {
          params: { categoria: "semen" }
        });
        setAllSemenItems(allData || []);
        const filtered = (allData || []).filter((s: any) => 
          s.especie_animal === mappedSp || 
          s.especie_animal === "multiplo" || 
          !s.especie_animal
        );
        setSemenItems(filtered);
      } catch (err) {
        console.error("Erro ao buscar sêmen do estoque:", err);
      }
    };
    fetchSemen();
  }, [config.especie]);

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
    const currentTab = config.tabs.find((t) => t.id === activeTab);
    const isMatingAction = action.type === 'mating_marra' || (action.type === 'primary' && currentTab?.primaryActionLabel === "Registrar Cobertura");
    
    if (isMatingAction && !hasReproducers && !hasSemenStock) {
      setNoReproducersWarningOpen(true);
      return;
    }

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
                  // 1. Criar registro de parto (Vinculado à prenhez)
                  await createBirth({ 
                    pregnancy: pregnancyId,
                    female: animalId,
                    birth_date: data.birth_date,
                    live_born: parseInt(data.live_born) || 0,
                    stillborn: parseInt(data.stillborn) || 0,
                    mummified: parseInt(data.mummified) || 0,
                    notes: data.notes || ""
                  });

                  // 2. Marcar prenhez como concluída
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
      case 'wean': {
        const weanOptions = (rows.length > 0 ? rows : (config.tabs.find(t => t.id === 'maternidade')?.rows || [])).map(r => ({
          value: String(r.id), // Birth ID
          label: String(r.identifier || `Matriz ${r.animal_id || r.id}`) // Matrix Identifier
        }));

        if (weanOptions.length === 0) {
          alert("Não há matrizes em lactação disponíveis para desmame.");
          return;
        }

        setActionModal({
          open: true,
          title: rows.length > 1 ? `Confirmar Desmame em Lote (${rows.length})` : "Confirmar Desmame",
          subtitle: "Registre o desmame e destine os leitões para a creche",
          fields: [
            {
              name: "birth_id",
              label: rows.length > 1 ? "Matrizes Selecionadas" : "Matriz (Brinco)",
              type: rows.length > 1 ? "text" : "select",
              options: weanOptions,
              initialValue: rows.length === 1 ? weanOptions[0]?.value : (rows.length > 1 ? "Múltiplos selecionados" : weanOptions[0]?.value),
              disabled: rows.length >= 1,
              required: true
            },
            {
              name: "weaning_date",
              label: "Data do Desmame",
              type: "date",
              required: true,
              initialValue: new Date().toISOString().split('T')[0]
            },
            {
              name: "weaned_quantity",
              label: "Quantidade Desmamada",
              type: "number",
              required: true,
              initialValue: rows.length === 1 ? (rows[0].vivos_atual || rows[0].vivos || 10) : 10,
              placeholder: "Quantidade de leitões"
            },
            {
              name: "avg_weaning_weight_kg",
              label: "Peso Médio ao Desmame (kg)",
              type: "number",
              required: true,
              initialValue: 6.5,
              placeholder: "Ex: 6.5"
            },
            {
              name: "weaning_type",
              label: "Tipo de Desmame",
              type: "select",
              required: true,
              options: [
                { value: "total", label: "Desmame Total (Matriz retorna para Cobertura)" },
                { value: "parcial", label: "Desmame Parcial (Matriz continua em Lactação)" }
              ],
              initialValue: "total"
            },
            {
              name: "batch_code",
              label: "Código do Novo Lote na Creche",
              type: "text",
              required: true,
              initialValue: rows.length === 1 
                ? `L-CRECHE-${rows[0].identifier}-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '')}`
                : `L-CRECHE-LOTE-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '')}`
            }
          ],
          onConfirm: async (data) => {
            const performWean = async (row: any) => {
              const birthId = row.id;
              const femaleId = row.animal_id;
              const identifier = row.identifier;
              const vivosAtual = parseInt(row.vivos_atual || row.vivos) || 0;

              try {
                // Buscar detalhes do animal para farm_id
                const animalDetails = await fetchAnimalDetails(femaleId);
                const farmId = animalDetails.farm_id || animalDetails.farm;

                // 1. Criar o lote de leitões na Creche
                const batchQty = parseInt(data.weaned_quantity) || vivosAtual;
                const batch = await createAnimalBatch({
                  batch_code: data.batch_code || `L-CRECHE-${identifier}-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '')}`,
                  quantity: batchQty,
                  phase: "creche",
                  category: "Leitão",
                  status: "active",
                  species_code_input: "suinos",
                  farm_id: farmId,
                  entry_date: data.weaning_date,
                  mother: femaleId,
                  avg_weight_kg: data.avg_weaning_weight_kg ? parseFloat(data.avg_weaning_weight_kg) : null,
                  notes: `Lote desmamado da matriz ${identifier} (${data.weaning_type === 'total' ? 'Desmame Total' : 'Desmame Parcial'})`
                });

                // 2. Criar ou atualizar Litter (Leitegada / Registro de Desmame)
                await apiClient.post("/livestock/litters/", {
                  birth: birthId,
                  weaning_date: data.weaning_date,
                  weaned_quantity: batchQty,
                  avg_weaning_weight_kg: data.avg_weaning_weight_kg ? parseFloat(data.avg_weaning_weight_kg) : null,
                  notes: `Desmame da matriz ${identifier}`
                });

                // 3. Vincular o lote recém criado ao Parto (Birth)
                await apiClient.patch(`/livestock/births/${birthId}/`, {
                  batch: batch.id
                });

                // 4. Mudar status reprodutivo da matriz
                if (data.weaning_type === "total") {
                  await updateAnimal(femaleId, {
                    reproductive_status: "aguardando_cobertura",
                    previous_phase: ""
                  });
                } else {
                  await updateAnimal(femaleId, {
                    reproductive_status: "lactante"
                  });
                }
              } catch (err) {
                console.error(`Erro ao desmamar matriz ${identifier}:`, err);
                throw err;
              }
            };

            try {
              const targets = rows.length > 0 ? rows : [ (config.tabs.find(t => t.id === 'maternidade')?.rows || []).find(r => String(r.id) === data.birth_id) ].filter(Boolean);
              if (targets.length > 1) {
                await Promise.all(targets.map(r => performWean(r)));
              } else if (targets.length === 1) {
                await performWean(targets[0]);
              }
              onSuccess?.();
              setActionModal(prev => ({ ...prev, open: false }));
            } catch (err) {
              console.error("Erro geral no desmame:", err);
            }
          }
        });
      }
      break;
      case 'mating_marra': {
        const sireOpts = (reproducerOptions || []).map(r => ({
          value: String(r.id),
          label: `${r.identifier}${r.category ? ` (${r.category})` : ''}`,
        }));
        const semenOpts = (semenItems || []).map(s => {
          const classif = s.tipo_semen_display || (s.tipo_semen === 'sexado_macho' ? 'Sexado Macho' : s.tipo_semen === 'sexado_femea' ? 'Sexado Fêmea' : 'Convencional');
          return {
            value: String(s.id),
            label: `${s.nome} [${classif}] (Estoque: ${s.estoque_atual || 0} doses)`,
          };
        });
        setActionModal({
          open: true,
          title: rows.length > 1 ? `💖 Registrar Cobertura em Lote (${rows.length})` : "💖 Registrar Cobertura da Marrã",
          subtitle: rows.length > 1 ? "Registre a cobertura para as matrizes selecionadas" : "Registre a primeira cobertura e inicie o ciclo reprodutivo",
          fields: [
            {
              name: "id",
              label: rows.length > 1 ? "Matrizes Selecionadas" : "Marrã (Brinco)",
              type: rows.length > 1 ? "text" : (animalOptions.length > 0 ? "select" : "text"),
              options: animalOptions,
              initialValue: rows.length === 1 ? animalOptions[0]?.value : (rows.length > 1 ? `${rows.length} selecionadas` : undefined),
              disabled: rows.length >= 1,
              placeholder: "Selecione a marrã",
              required: true,
            },
            { 
              name: "mating_date", 
              label: "Data da Cobertura", 
              type: "date", 
              required: true,
              initialValue: new Date().toISOString().split('T')[0]
            },
            {
              name: "mating_type",
              label: "Tipo de Cobertura",
              type: "select",
              options: [
                { value: "natural", label: "Monta Natural" },
                { value: "ai", label: "Inseminação Artificial" },
                { value: "iatf", label: "IATF" },
              ],
              initialValue: "natural",
              required: true,
            },
            {
              name: "material_origin",
              label: "Origem do Sêmen / Material",
              type: "select",
              options: [
                { value: "reprodutor", label: "Reprodutor Cadastrado" },
                { value: "semen", label: "Sêmen do Estoque" },
              ],
              initialValue: "reprodutor",
              required: true,
              showIf: (vals) => vals.mating_type === "ai" || vals.mating_type === "iatf",
            },
            {
              name: "sire_id",
              label: sireOpts.length > 0 ? "Reprodutor (Cachaço)" : "Reprodutor (não há machos cadastrados)",
              type: sireOpts.length > 0 ? "select" : "text",
              options: sireOpts.length > 0 ? sireOpts : undefined,
              placeholder: sireOpts.length > 0 ? "Selecione o reprodutor" : "Não há reprodutores cadastrados",
              required: true,
              showIf: (vals) => vals.mating_type === "natural" || vals.material_origin === "reprodutor",
            },
            {
              name: "semen_item_id",
              label: "Selecionar Sêmen do Estoque",
              type: "select",
              options: semenOpts.length > 0 ? semenOpts : undefined,
              placeholder: semenOpts.length > 0 ? "Selecione o sêmen..." : "Não há sêmen cadastrado no estoque",
              required: true,
              showIf: (vals) => (vals.mating_type === "ai" || vals.mating_type === "iatf") && vals.material_origin === "semen",
            },
            {
              name: "sire_info",
              label: "Identificação do Sêmen (texto livre)",
              type: "text",
              placeholder: "Ex: Raça, lote do cachaço externo, etc.",
              showIf: (vals) => (vals.mating_type === "ai" || vals.mating_type === "iatf") && vals.material_origin === "semen",
            },
            { name: "notes", label: "Observações", type: "textarea" },
          ],
          onConfirm: async (data) => {
            let computedSireInfo = data.sire_info || "";
            if (data.material_origin === "semen" && data.semen_item_id) {
              const selectedSemen = (semenItems || []).find(s => String(s.id) === String(data.semen_item_id));
              if (selectedSemen) {
                computedSireInfo = `Sêmen: ${selectedSemen.nome}`;
              }
            }

            const payload = {
              mating_date: data.mating_date,
              mating_type: data.mating_type || "natural",
              sire_info: computedSireInfo,
              ...(data.material_origin !== "semen" && data.sire_id ? { sire_id: Number(data.sire_id) } : {}),
              notes: data.notes || "",
            };

            const targetRows = rows.length > 0 ? rows : [data];
            const animalIds = rows.length > 1 
              ? rows.map(r => r.animal_id || r.id || r.pk || r.identifier)
              : [data.id || (rows.length === 1 ? (rows[0].animal_id || rows[0].id || rows[0].pk || rows[0].identifier) : null)];

            if (animalIds.some(id => !id)) throw new Error("Selecione a fêmea/marrã");

            // 1. Register the coverages
            await Promise.all(animalIds.map(animalId => registerMating(String(animalId), payload)));

            // 2. Perform inventory consumption if semen is used
            if (data.material_origin === "semen" && data.semen_item_id) {
              try {
                await apiClient.post("/inventory/movimentacoes/", {
                  item: data.semen_item_id,
                  tipo: "consumo",
                  quantidade: 1.0 * Math.max(1, targetRows.length),
                  observacao: `Consumo automático por inseminação artificial na fêmea ${animalIds.join(", ")}.`,
                });
              } catch (movErr) {
                console.error("Erro ao dar baixa automática do sêmen no estoque:", movErr);
              }
            }

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
  const getPrimaryModalFields = (): ModalField[] => {
    if (currentTab?.primaryActionLabel === "Registrar Cobertura") {
      const sireOpts = (reproducerOptions || []).map(r => ({
        value: String(r.id),
        label: `${r.identifier}${r.category ? ` (${r.category})` : ''}`,
      }));
      const semenOpts = (semenItems || []).map(s => {
        const classif = s.tipo_semen_display || (s.tipo_semen === 'sexado_macho' ? 'Sexado Macho' : s.tipo_semen === 'sexado_femea' ? 'Sexado Fêmea' : 'Convencional');
        return {
          value: String(s.id),
          label: `${s.nome} [${classif}] (Estoque: ${s.estoque_atual || 0} doses)`,
        };
      });
      return [
        {
          name: "matriz",
          label: "Matriz (Brinco)",
          type: "text",
          required: true,
        },
        { 
          name: "data_cobertura", 
          label: "Data da Cobertura", 
          type: "date", 
          required: true,
          initialValue: new Date().toISOString().split('T')[0]
        },
        {
          name: "tipo",
          label: "Tipo de Cobertura",
          type: "select",
          options: [
            { value: "MN", label: "Monta Natural" },
            { value: "IA", label: "Inseminação Artificial" },
          ],
          initialValue: "MN",
          required: true,
        },
        {
          name: "material_origin",
          label: "Origem do Sêmen / Material",
          type: "select",
          options: [
            { value: "reprodutor", label: "Reprodutor Cadastrado" },
            { value: "semen", label: "Sêmen do Estoque" },
          ],
          initialValue: "reprodutor",
          required: true,
          showIf: (vals: Record<string, string>) => vals.tipo === "IA",
        },
        {
          name: "sire_id",
          label: sireOpts.length > 0 ? "Reprodutor (Cachaço)" : "Reprodutor (não há machos cadastrados)",
          type: sireOpts.length > 0 ? "select" : "text",
          options: sireOpts.length > 0 ? sireOpts : undefined,
          placeholder: sireOpts.length > 0 ? "Selecione o reprodutor" : "Não há reprodutores cadastrados",
          required: true,
          showIf: (vals: Record<string, string>) => vals.tipo === "MN" || vals.material_origin === "reprodutor",
        },
        {
          name: "semen_item_id",
          label: "Selecionar Sêmen do Estoque",
          type: "select",
          options: semenOpts.length > 0 ? semenOpts : undefined,
          placeholder: semenOpts.length > 0 ? "Selecione o sêmen..." : "Não há sêmen cadastrado no estoque",
          required: true,
          showIf: (vals: Record<string, string>) => vals.tipo === "IA" && vals.material_origin === "semen",
        },
        {
          name: "sire_info",
          label: "Identificação do Sêmen (texto livre)",
          type: "text",
          placeholder: "Ex: Raça, lote do cachaço externo, etc.",
          showIf: (vals: Record<string, string>) => vals.tipo === "IA" && vals.material_origin === "semen",
        },
      ];
    }
    return (currentTab?.primaryActionModalFields as ModalField[]) || [];
  };

  const handlePrimaryConfirm = async (data: Record<string, string>) => {
    if (currentTab?.primaryActionLabel === "Registrar Cobertura") {
      let computedSireInfo = data.sire_info || "";
      if (data.material_origin === "semen" && data.semen_item_id) {
        const selectedSemen = (semenItems || []).find(s => String(s.id) === String(data.semen_item_id));
        if (selectedSemen) {
          computedSireInfo = `Sêmen: ${selectedSemen.nome}`;
        }
      }

      // 1. Save using createMating
      await createMating({
        female_identifier: data.matriz,
        mating_date: data.data_cobertura,
        mating_type: data.tipo === "IA" ? "ai" : "natural",
        sire_info: computedSireInfo,
        ...(data.material_origin !== "semen" && data.sire_id ? { sire_id: Number(data.sire_id) } : {}),
      });

      // 2. Perform inventory consumption if semen is used
      if (data.tipo === "IA" && data.material_origin === "semen" && data.semen_item_id) {
        try {
          await apiClient.post("/inventory/movimentacoes/", {
            item: data.semen_item_id,
            tipo: "consumo",
            quantidade: 1.0,
            observacao: `Consumo automático por Inseminação Artificial na fêmea ${data.matriz}.`,
          });
        } catch (movErr) {
          console.error("Erro ao dar baixa automática do sêmen no estoque:", movErr);
        }
      }

      onSuccess?.();
    } else if (currentTab?.onSave) {
      await currentTab.onSave(data);
    }
  };
  const hasReproducers = reproducerOptions && reproducerOptions.length > 0;
  const hasSemenProduct = semenItems && semenItems.length > 0;
  const hasSemenStock = semenItems && semenItems.some(s => parseFloat(s.estoque_atual || 0) > 0);

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
            onClick={() => {
              if (currentTab.primaryActionLabel === "Registrar Cobertura" && !hasReproducers && !hasSemenStock) {
                setNoReproducersWarningOpen(true);
              } else {
                setModalOpen(true);
              }
            }}
          >
            <Plus size={18} />
            {currentTab.primaryActionLabel}
          </button>
        )}
      </div>

      {/* ─── Tabs ─── */}
      <ul className="nav nav-tabs mb-4 border-0 w-100 flex-nowrap overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', borderBottom: 'none' }}>
        {allTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <li className="nav-item" key={tab.id} style={{ flexShrink: 0 }}>
              <button
                className={`nav-link d-flex align-items-center py-2.5 px-2 px-xl-3 fw-semibold border-0 border-bottom border-3 rounded-0 ${
                  isActive
                    ? "active text-success border-success bg-transparent"
                    : "text-muted border-transparent hover-bg-light"
                }`}
                style={{ fontSize: '0.85rem', marginBottom: '-1px', gap: '6px' }}
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
          fields={getPrimaryModalFields()}
          confirmLabel="Salvar"
          onConfirm={handlePrimaryConfirm}
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

      {/* ─── No Reproducers Warning Modal ─── */}
      {noReproducersWarningOpen && (
        <div className="repro-modal-overlay" onClick={() => setNoReproducersWarningOpen(false)}>
          <div className="repro-modal" style={{ maxWidth: "480px" }}>
            <div className="repro-modal-header" style={{ paddingBottom: "0.5rem" }}>
              <div>
                <div className="repro-modal-title text-danger d-flex align-items-center gap-2" style={{ fontSize: "1.25rem" }}>
                  <span>⚠️</span> Sem Material Reprodutor Disponível
                </div>
              </div>
              <button className="repro-modal-close" onClick={() => setNoReproducersWarningOpen(false)} type="button">
                <X size={16} />
              </button>
            </div>
            
            <div className="repro-modal-body text-center py-4">
              <div className="mb-3 d-inline-flex align-items-center justify-content-center animate-bounce" style={{ width: "64px", height: "64px", borderRadius: "50%", background: "oklch(0.96 0.04 25)", color: "oklch(0.5 0.15 25)", fontSize: "2rem" }}>
                🧪
              </div>
              <h5 className="fw-black text-foreground mb-3 text-uppercase small" style={{ letterSpacing: '0.05em' }}>
                Diagnóstico de Disponibilidade
              </h5>
              
              <div className="text-start px-3 py-3 bg-muted/10 rounded-xl mb-4 border border-border/40" style={{ fontSize: '0.85rem' }}>
                <div className="mb-3 d-flex align-items-center gap-2">
                  <span className={hasReproducers ? "text-success" : "text-danger"} style={{ fontSize: '1.1rem' }}>
                    {hasReproducers ? "✔" : "❌"}
                  </span>
                  <div>
                    <strong>Reprodutores:</strong> {hasReproducers 
                      ? `${reproducerOptions.length} ativos.` 
                      : "Nenhum macho reprodutor ativo cadastrado."}
                  </div>
                </div>

                <div className="d-flex align-items-start gap-2">
                  <span className={hasSemenStock ? "text-success" : "text-danger"} style={{ fontSize: '1.1rem', marginTop: '-2px' }}>
                    {hasSemenStock ? "✔" : "❌"}
                  </span>
                  <div>
                    <strong>Sêmen em Estoque:</strong>{" "}
                    {hasSemenStock ? (
                      "Disponível para uso."
                    ) : (
                      <>
                        {semenItems.length === 0 ? (
                          <>
                            Nenhum produto cadastrado para <strong>{config.especie === 'suinos' ? 'Suínos' : config.especie === 'bovinos' ? 'Bovinos' : 'Aves'}</strong>.
                            {allSemenItems.length > 0 && (
                              <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                                💡 Nota: Identificamos sêmen cadastrado para outra(s) espécie(s) ({
                                  Array.from(new Set(allSemenItems.map(s => {
                                    if (s.especie_animal === 'suino') return 'Suínos';
                                    if (s.especie_animal === 'bovino') return 'Bovinos';
                                    if (s.especie_animal === 'ave') return 'Aves';
                                    return s.especie_animal_display || s.especie_animal;
                                  }))).join(', ')
                                }), mas nenhum para <strong>{config.especie === 'suinos' ? 'Suínos' : config.especie === 'bovinos' ? 'Bovinos' : 'Aves'}</strong>. Por favor, verifique se selecionou a espécie correta ao cadastrar o produto no estoque.
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            Cadastrado, mas está <strong>sem estoque (0 doses)</strong>.
                            <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                              Produtos encontrados: {semenItems.map(s => s.nome).join(', ')}.
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-muted-foreground mb-0" style={{ fontSize: "0.82rem", lineHeight: "1.5" }}>
                Para registrar uma cobertura, você precisa possuir pelo menos um reprodutor ativo cadastrado OU sêmen com saldo disponível no estoque para a espécie correspondente.
              </p>
            </div>

            <div className="repro-modal-footer d-flex flex-column gap-2 w-100" style={{ padding: "0 1.5rem 1.5rem" }}>
              <Link
                href={`/home/rebanho/${config.especie}/cadastro`}
                className="repro-btn-primary w-100 justify-content-center text-decoration-none text-center d-flex align-items-center gap-2"
                style={{ background: "oklch(0.55 0.16 145)", border: "none", boxShadow: "0 4px 12px oklch(0.55 0.16 145 / 0.2)" }}
                onClick={() => setNoReproducersWarningOpen(false)}
              >
                Cadastrar Novo Reprodutor
              </Link>
              <Link
                href={`/home/estoque/produtos?openModal=true&category=semen`}
                className="repro-btn-primary w-100 justify-content-center text-decoration-none text-center d-flex align-items-center gap-2"
                style={{ background: "oklch(0.65 0.22 350)", border: "none", boxShadow: "0 4px 12px oklch(0.65 0.22 350 / 0.2)" }}
                onClick={() => setNoReproducersWarningOpen(false)}
              >
                Adicionar Sêmen ao Estoque
              </Link>
              <button
                type="button"
                className="repro-btn-secondary w-100 justify-content-center"
                onClick={() => setNoReproducersWarningOpen(false)}
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
