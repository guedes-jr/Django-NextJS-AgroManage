"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, X } from "lucide-react";
import Link from "next/link";
import { ReproducaoHeader, ReproducaoPhaseCards, ReproducaoPhaseTabs } from "./ReproducaoLayout";
import "./reproducao.css";
import { useToast } from "@/components/ui/Toast";
import { Skeleton, CardSkeleton, TableSkeleton, BatchAction } from "@/components/ui";
import { ReproducaoKpiCards, KpiCard, ReproductionIcon } from "./ReproducaoKpiCards";
import { AlertItem, AiSuggestion } from "./ReproducaoAlerts";
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
import { BatchTechnicalSheetModal } from "@/components/animal/BatchTechnicalSheetModal";
import { AnimalTechnicalSheetModal } from "@/components/animal/AnimalTechnicalSheetModal";
import { HistoryTimeline, TimelineEvent } from "@/components/ui/HistoryTimeline";
import { useOrganizationLocale } from "@/lib/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlowStep {
  id?: string;
  icon: string;
  label: string;
  count: number;
  color: string;
  borderColor: string;
  image?: string;
  summary?: string;
  accent?: string;
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
    type?: 'primary' | 'weight' | 'vaccine' | 'postpartum_vaccine' | 'diagnosis' | 'birth' | 'wean' | 'transfer' | 'discard' | 'promote' | 'mating_marra' | 'transfer_crescimento' | 'transfer_engorda' | 'technical_sheet' | 'batch_mortality' | 'sale_redirect';
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
    <div className="repro-overview">
      <ReproducaoKpiCards kpis={config.kpis} />

      <ReproducaoPhaseCards phases={config.flowSteps.map((step, index) => ({ ...step, id: step.id ?? config.tabs[index]?.id ?? "dashboard", accent: step.accent ?? step.borderColor }))} onSelect={onTabChange} />

      <div className="repro-chart-wrap"><DesempenhoChart category="reprodutivo" /></div>
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
  const { t } = useOrganizationLocale();
  return (
    <div
      className="d-flex align-items-center justify-content-center py-5 text-muted-foreground gap-2"
      style={{ fontSize: "0.85rem" }}
    >
      <Loader2 size={18} className="spin-animation" />
      <span>{t("reproduction.refreshing")}</span>
    </div>
  );
}

import {
  registerWeight,
  registerBatchWeight,
  registerVaccination,
  registerBatchVaccination,
  diagnosePregnancy,
  promoteToMating,
  discardAnimal,
  registerLoss,
  registerMortality,
  registerProcedure,
  createBirth,
  weanBirth,
  registerMating,
  createMating,
  updateAnimal,
  createAnimalBatch,
  updateAnimalBatch,
  registerBatchMortality,
  changeBatchPhase,
  updatePregnancy,
  fetchAnimalDetails,
  fetchAnimalHistory,
  registerHeat,
  mergeBatches,
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
  reproducerOptions?: { id: number; identifier: string; name?: string; category: string }[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { language, t } = useOrganizationLocale();
  const [internalActiveTab, setInternalActiveTab] = useState("dashboard");
  const [modalOpen, setModalOpen] = useState(false);
  const [noReproducersWarningOpen, setNoReproducersWarningOpen] = useState(false);
  const [allSemenItems, setAllSemenItems] = useState<any[]>([]);
  const [semenItems, setSemenItems] = useState<any[]>([]);
  const [vaccineItems, setVaccineItems] = useState<any[]>([]);
  const [medicationItems, setMedicationItems] = useState<any[]>([]);
  const [batchSheetOpen, setBatchSheetOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | number | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<TimelineEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const TYPE_ICON: Record<string, string> = {
    mating: '🤰',
    pregnancy: '✅',
    birth: '🍼',
    weight: '⚖️',
    vaccination: '💉',
    health: '🩺',
    feeding: '🌾',
    mortality: '⚠️',
    historico_evento: '📌',
  };

  const TYPE_COLOR: Record<string, 'success' | 'info' | 'warning' | 'system'> = {
    mating: 'info',
    pregnancy: 'success',
    birth: 'success',
    weight: 'system',
    vaccination: 'info',
    health: 'warning',
    feeding: 'system',
    mortality: 'warning',
    historico_evento: 'warning',
  };

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

  useEffect(() => {
    const fetchVaccines = async () => {
      try {
        const { data } = await apiClient.get("/inventory/items/all_items/", {
          params: { categoria: "vacina" }
        });
        setVaccineItems(data || []);
      } catch (err) {
        console.error("Erro ao buscar vacinas do estoque:", err);
      }
    };
    fetchVaccines();
  }, []);

  useEffect(() => {
    const fetchMedications = async () => {
      try {
        const { data } = await apiClient.get("/inventory/items/all_items/", {
          params: { categoria: "medicamento" }
        });
        setMedicationItems(data || []);
      } catch (err) {
        console.error("Erro ao buscar medicamentos do estoque:", err);
      }
    };
    fetchMedications();
  }, []);

  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = controlledOnTabChange ?? setInternalActiveTab;
  const [selectedRows, setSelectedRows] = useState<any[]>([]);
  const isSwineMatingTab = (tab?: TabConfig) => config.especie === "suinos" && tab?.id === "matrizes";

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

  const handleTransferPhase = async (targetPhase: "crescimento" | "engorda", rows: any[] = []) => {
    const activeTabRows = rows.length > 0 ? rows : selectedRows;
    const currentTab = config.tabs.find((t) => t.id === activeTab);
    const availableRows = activeTabRows.length > 0 ? activeTabRows : (currentTab?.rows || []);

    if (availableRows.length === 0) {
      alert(t("reproduction.noBatchSelected"));
      return;
    }

    const targetRows = rows.length > 0 ? rows : (selectedRows.length > 0 ? selectedRows : [availableRows[0]]);

    const firstRow = targetRows[0];
    const initialBatchCode = firstRow?.lote || firstRow?.batch_code || "";
    const initialQty = targetRows.reduce((sum, r) => sum + (parseInt(r.qtd || r.quantity) || 0), 0);

    const parseWeight = (val: any) => {
      if (!val) return 0;
      return parseFloat(String(val).replace(/[^\d.]/g, "")) || 0;
    };

    let totalWeightProduct = 0;
    let totalQtyForWeight = 0;
    targetRows.forEach(r => {
      const qty = parseInt(r.qtd || r.quantity) || 0;
      const weight = parseWeight(r.peso || r.avg_weight_kg);
      if (weight > 0) {
        totalWeightProduct += weight * qty;
        totalQtyForWeight += qty;
      }
    });
    const avgWeight = totalQtyForWeight > 0 ? (totalWeightProduct / totalQtyForWeight) : 0;
    const initialAvgWeight = avgWeight > 0 ? Math.round(avgWeight * 100) / 100 : (parseWeight(firstRow?.peso || firstRow?.avg_weight_kg) || "");

    const title = targetPhase === "crescimento"
      ? t("reproduction.transferGrowth")
      : t("reproduction.transferFattening");
    const subtitle = targetRows.length > 1
      ? t("reproduction.transferringBatches", { count: targetRows.length })
      : t("reproduction.transferringBatch", { batch: initialBatchCode });

    const fields: ModalField[] = [];

    fields.push({
      name: "batch_code_display",
      label: targetRows.length > 1 ? t("reproduction.selectedBatches") : t("reproduction.batch"),
      type: "text",
      initialValue: targetRows.length > 1
        ? targetRows.map(r => r.lote || r.batch_code).join(", ")
        : initialBatchCode,
      disabled: true,
      colSpan: "full"
    });

    const isMultiSelect = targetRows.length > 1;
    if (isMultiSelect) {
      fields.push({
        name: "merge_batches",
        label: t("reproduction.mergeBatchesQuestion"),
        type: "select",
        options: [
          { value: "no", label: t("reproduction.transferIndividually") },
          { value: "yes", label: t("reproduction.mergeIntoNewBatch") }
        ],
        initialValue: "no",
        required: true,
        colSpan: "full"
      });

      fields.push({
        name: "new_batch_code",
        label: t("reproduction.newBatchCode"),
        type: "text",
        placeholder: `L-${targetPhase.toUpperCase()}-${new Date().toLocaleDateString(language).replace(/\//g, '')}`,
        initialValue: `L-${targetPhase.toUpperCase()}-${new Date().toLocaleDateString(language).replace(/\//g, '')}`,
        required: true,
        colSpan: "full",
        showIf: (values) => values.merge_batches === "yes"
      });
    }

    fields.push({
      name: "quantity",
      label: t("reproduction.animalQuantity"),
      type: "number",
      initialValue: initialQty,
      required: true,
      colSpan: "half",
      showIf: (values) => !isMultiSelect || values.merge_batches === "yes"
    });

    fields.push({
      name: "avg_weight_kg",
      label: t("reproduction.averageWeight"),
      type: "number",
      placeholder: "0.00",
      initialValue: initialAvgWeight,
      required: true,
      colSpan: "half",
      showIf: (values) => !isMultiSelect || values.merge_batches === "yes"
    });

    fields.push({
      name: "entry_date",
      label: t("reproduction.transferDate"),
      type: "date",
      initialValue: new Date().toISOString().split('T')[0],
      required: true,
      colSpan: "full"
    });

    setActionModal({
      open: true,
      title,
      subtitle,
      fields,
      onConfirm: async (data) => {
        const isMerging = data.merge_batches === "yes";

        try {
          if (isMerging) {
            // Merging selected batches
            // 1. Get full details of the first batch to copy organization/farm/category
            const firstBatchDetail = await apiClient.get(`/livestock/batches/${targetRows[0].id}/`).then(res => res.data);

            // 2. Create the new merged batch
            await createAnimalBatch({
              batch_code: data.new_batch_code,
              quantity: parseInt(data.quantity),
              avg_weight_kg: parseFloat(data.avg_weight_kg),
              phase: targetPhase,
              category: firstBatchDetail.category || (targetPhase === "crescimento" ? "Leitão" : "Terminação"),
              status: "active",
              species_code_input: "suinos",
              farm_id: firstBatchDetail.farm_id || firstBatchDetail.farm,
              entry_date: data.entry_date,
              notes: t("reproduction.mergedBatchesNote", {
                batches: targetRows.map(r => r.lote || r.batch_code).join(", "),
              }),
              source_batch_ids: targetRows.map(r => r.id)
            });

            // 3. Mark the source batches as finished (phase already frozen on merge endpoint)
            await Promise.all(targetRows.map(r =>
              updateAnimalBatch(r.id as number, { status: "finished" })
            ));

            showToast(t("reproduction.mergeTransferSuccess"), "success");
          } else {
            // Transferring individually — congela a fase anterior via change-phase
            if (targetRows.length === 1) {
              await changeBatchPhase(targetRows[0].id as number, {
                new_phase: targetPhase,
                exit_quantity: parseInt(data.quantity),
                exit_weight_kg: parseFloat(data.avg_weight_kg),
                exit_date: data.entry_date,
              });
            } else {
              await Promise.all(targetRows.map((r) => {
                const rowQty = parseInt(r.qtd || r.quantity) || 0;
                const rowWeight = parseWeight(r.peso || r.avg_weight_kg);
                return changeBatchPhase(r.id as number, {
                  new_phase: targetPhase,
                  exit_date: data.entry_date,
                  ...(rowQty > 0 ? { exit_quantity: rowQty } : {}),
                  ...(rowWeight > 0 ? { exit_weight_kg: rowWeight } : {}),
                });
              }));
            }
            showToast(
              targetRows.length === 1
                ? t("reproduction.batchTransferred")
                : t("reproduction.batchesTransferred", { count: targetRows.length }),
              "success"
            );
          }
          onSuccess?.();
          setActionModal(prev => ({ ...prev, open: false }));
        } catch (err: any) {
          console.error("Erro ao transferir lotes:", err);
          showToast(err.response?.data?.detail || t("reproduction.batchTransferFailed"), "error");
        }
      }
    });
  };

  const handleAction = (action: any, rows: any[] = []) => {
    const currentTab = config.tabs.find((t) => t.id === activeTab);
    const isMatingAction = action.type === 'mating_marra' || (action.type === 'primary' && isSwineMatingTab(currentTab));

    if (isMatingAction && !hasReproducers && !hasSemenStock) {
      setNoReproducersWarningOpen(true);
      return;
    }

    if (action.onClick) {
      action.onClick();
      return;
    }

    const animalOptions = rows.map(r => ({
      // Em Gestação/Maternidade, `id` pertence ao evento reprodutivo.
      // As ações sanitárias devem sempre apontar para a matriz vinculada.
      value: String(r.animal_id || r.id || r.pk || r.identifier || ""),
      label: String(r.identifier || r.batch_code || r.name || r.id || r.pk || t("reproduction.noIdentifier"))
    })).filter(o => o.value);

    switch (action.type) {
      case 'sale_redirect':
        router.push(`/home/seguimento/${config.especie}/vendas`);
        break;
      case 'batch_mortality': {
        const availableRows = rows.length > 0 ? rows : (currentTab?.rows || []);
        const batchOptions = availableRows.map(r => ({
          value: String(r.id || r.pk || ""),
          label: String(r.lote || r.batch_code || r.name || r.id || t("reproduction.batch")),
        })).filter(option => option.value);
        setActionModal({
          open: true,
          title: t("reproduction.batchMortalityTitle"),
          subtitle: t("reproduction.batchMortalitySubtitle"),
          fields: [
            {
              name: "id",
              label: t("reproduction.batch"),
              type: batchOptions.length > 0 ? "select" : "text",
              options: batchOptions,
              initialValue: batchOptions.length === 1 ? batchOptions[0].value : undefined,
              required: true,
            },
            { name: "quantidade", label: t("reproduction.deadAnimalCount"), type: "number", required: true },
            { name: "data", label: t("reproduction.occurrenceDate"), type: "date", required: true, initialValue: new Date().toISOString().split('T')[0] },
            { name: "causa", label: t("reproduction.probableCause"), type: "select", required: true, options: [
              { value: "DOENCA", label: t("reproduction.disease") },
              { value: "ACIDENTE", label: t("reproduction.accident") },
              { value: "ESMAGAMENTO", label: t("reproduction.crushing") },
              { value: "REFUGO", label: t("reproduction.poorDevelopment") },
              { value: "DESCONHECIDA", label: t("reproduction.unknownCause") },
              { value: "OUTRA", label: t("reproduction.other") },
            ] },
            { name: "observacao", label: t("reproduction.observations"), type: "textarea" },
          ],
          onConfirm: async (data) => {
            await registerBatchMortality(data.id, {
              quantidade: Number(data.quantidade),
              data: data.data,
              causa: data.causa,
              observacao: data.observacao,
            });
            showToast(t("reproduction.batchMortalitySaved"), "success");
            onSuccess?.();
            setActionModal(prev => ({ ...prev, open: false }));
          },
        });
        break;
      }
      case 'weight':
        setActionModal({
          open: true,
          title: t("reproduction.weightTitle"),
          subtitle: t("reproduction.weightSubtitle"),
          fields: [
            {
              name: "id",
              label: t("reproduction.animalOrBatch"),
              type: animalOptions.length > 0 ? "select" : "text",
              options: animalOptions,
              placeholder: t("reproduction.earTagOrBatch"),
              required: true
            },
            { name: "weight_kg", label: t("reproduction.weight"), type: "number", placeholder: "0.00", required: true },
            { name: "weighing_date", label: t("reproduction.weighingDate"), type: "date", required: true },
            { name: "notes", label: t("reproduction.observations"), type: "textarea" },
          ],
          onConfirm: async (data) => {
            const payload = { weight_kg: parseFloat(data.weight_kg), weighing_date: data.weighing_date, notes: data.notes };
            if (["creche", "crescimento", "engorda"].includes(currentTab?.id || "")) {
              await registerBatchWeight(data.id, payload);
            } else {
              await registerWeight(data.id, payload);
            }
            onSuccess?.();
            setActionModal(prev => ({ ...prev, open: false }));
          }
        });
        break;
      case 'vaccine': {
        const isBatchVaccination = ["creche", "crescimento", "engorda"].includes(currentTab?.id || "");
        const vaccineOpts = (vaccineItems || []).map(v => ({
          value: String(v.id),
          label: `${v.nome}${v.estoque_atual != null ? ` (${t("reproduction.stockCount", {
            count: v.estoque_atual,
            unit: v.unidade_display || v.unidade_medida || "un",
          })})` : ''}`,
        }));
        const targetRows = isBatchVaccination
          ? (rows.length > 0 ? rows : (currentTab?.rows || []))
          : rows;
        const targetOptions = targetRows.map((row: any) => ({
          value: String(row.id || row.pk || ""),
          label: String(row.lote || row.batch_code || row.identifier || row.name || t("reproduction.batch")),
        })).filter((option: { value: string }) => option.value);
        setActionModal({
          open: true,
          title: t("reproduction.vaccineTitle"),
          subtitle: vaccineItems.length === 0 ? t("reproduction.noVaccineStock") : undefined,
          fields: [
            {
              name: "id",
              label: isBatchVaccination ? t("reproduction.batch") : t("reproduction.identifier"),
              type: targetOptions.length > 0 ? "select" : "text",
              options: targetOptions,
              required: true
            },
            {
              name: "vaccine_applications",
              label: t("reproduction.vaccines"),
              type: "inventory-list",
              required: true,
              colSpan: "full",
              initialValue: JSON.stringify([{ inventory_item: "", dose_per_animal: "" }]),
              options: vaccineOpts,
            },
            { name: "application_date", label: t("reproduction.applicationDate"), type: "date", required: true, initialValue: new Date().toISOString().split("T")[0] },
            { name: "dose_type", label: t("reproduction.doseType"), type: "select", options: [
              { value: "unica", label: t("reproduction.singleDose") },
              { value: "reforco", label: t("reproduction.boosterDose") },
            ] , initialValue: "unica"},
          ],
          onConfirm: async (data) => {
            try {
              const applications = JSON.parse(data.vaccine_applications) as Array<{
                inventory_item: string;
                dose_per_animal: string;
              }>;
              for (const application of applications) {
                const payload = {
                  application_date: data.application_date,
                  dose_type: data.dose_type,
                  vaccine_item_id: application.inventory_item,
                  dosage_ml: Number(application.dose_per_animal.replace(",", ".")),
                };
                if (isBatchVaccination) {
                  await registerBatchVaccination(data.id, payload);
                } else {
                  await registerVaccination(data.id, payload);
                }
              }
              showToast(applications.length > 1 ? t("reproduction.vaccinesSaved") : t("reproduction.vaccineSaved"), "success");
              onSuccess?.();
              setActionModal(prev => ({ ...prev, open: false }));
            } catch (error: any) {
              const response = error?.response?.data;
              const dosageError = response?.dosage_ml;
              const detail = (Array.isArray(dosageError) ? dosageError[0] : dosageError) || response?.error || response?.detail;
              showToast(detail || t("reproduction.vaccineSaveFailed"), "error");
              throw error;
            }
          }
        });
        break;
      }
      case 'diagnosis':
        setActionModal({
          open: true,
          title: rows.length > 1
            ? t("reproduction.batchDiagnosisTitle", { count: rows.length })
            : t("reproduction.diagnosisTitle"),
          fields: [
            {
              name: "id",
              label: rows.length > 1 ? t("reproduction.selectedMatrices") : t("reproduction.matrixTag"),
              type: rows.length > 1 ? "text" : (animalOptions.length > 0 ? "select" : "text"),
              options: animalOptions,
              initialValue: rows.length === 1 ? animalOptions[0]?.value : (rows.length > 1 ? t("reproduction.multipleSelected") : undefined),
              disabled: rows.length >= 1,
              required: true
            },
            { name: "result", label: t("reproduction.result"), type: "select", required: true, options: [
              { value: "positive", label: t("reproduction.positivePregnant") },
              { value: "negative", label: t("reproduction.negativeEmpty") },
            ]},
            {
              name: "diagnosis_date",
              label: t("reproduction.diagnosisDate"),
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
      case 'discard':
        setActionModal({
          open: true,
          title: t("reproduction.discardMatrixTitle"),
          fields: [
            {
              name: "id",
              label: rows.length > 1 ? t("reproduction.selectedMatrices") : t("reproduction.matrixTag"),
              type: rows.length > 1 ? "text" : (animalOptions.length > 0 ? "select" : "text"),
              options: animalOptions,
              initialValue: rows.length === 1 ? animalOptions[0]?.value : (rows.length > 1 ? t("reproduction.multipleSelected") : undefined),
              disabled: rows.length >= 1,
              required: true
            },
            { name: "data_descarte", label: t("reproduction.discardDate"), type: "date", required: true, initialValue: new Date().toISOString().split('T')[0] },
            { name: "motivo", label: t("reproduction.reasonJustification"), type: "text", required: true },
            { name: "tipo_descarte", label: t("reproduction.discardType"), type: "select", options: [
              { value: "VENDA", label: t("reproduction.sale") },
              { value: "MORTE", label: t("reproduction.death") },
              { value: "DESCARTE_SANITARIO", label: t("reproduction.sanitaryDiscard") },
              { value: "BAIXA_PRODUTIVA", label: t("reproduction.lowProduction") },
              { value: "OUTRO", label: t("reproduction.other") },
            ]},
            { name: "peso", label: t("reproduction.weight"), type: "number" },
            { name: "valor_venda", label: t("reproduction.saleValue"), type: "number" },
            { name: "observacao", label: t("reproduction.observations"), type: "textarea" },
          ],
          onConfirm: async (data) => {
            if (rows.length > 1) {
              await Promise.all(rows.map(r => discardAnimal(r.id as number, data)));
            } else {
              await discardAnimal(data.id, data);
            }
            onSuccess?.();
            setActionModal(prev => ({ ...prev, open: false }));
          }
        });
        break;
      case 'loss':
        setActionModal({
          open: true,
          title: t("reproduction.pregnancyLossTitle"),
          fields: [
            {
              name: "id",
              label: t("reproduction.gestationMatrix"),
              type: rows.length > 1 ? "text" : (animalOptions.length > 0 ? "select" : "text"),
              options: animalOptions,
              initialValue: rows.length === 1 ? animalOptions[0]?.value : (rows.length > 1 ? t("reproduction.multipleSelected") : undefined),
              disabled: rows.length >= 1,
              required: true
            },
            { name: "data", label: t("reproduction.lossDate"), type: "date", required: true, initialValue: new Date().toISOString().split('T')[0] },
            { name: "tipo_perda", label: t("reproduction.lossType"), type: "select", required: true, options: [
              { value: "ABORTO", label: t("reproduction.abortion") },
              { value: "REABSORCAO", label: t("reproduction.resorption") },
              { value: "RETORNO_CIO", label: t("reproduction.heatReturn") },
              { value: "OUTRO", label: t("reproduction.other") },
            ]},
            { name: "observacao", label: t("reproduction.observations"), type: "textarea" },
          ],
          onConfirm: async (data) => {
            if (rows.length > 1) {
              await Promise.all(rows.map(r => registerLoss(r.id as number, data)));
            } else {
              await registerLoss(data.id, data);
            }
            onSuccess?.();
            setActionModal(prev => ({ ...prev, open: false }));
          }
        });
        break;
      case 'procedure': {
        const availableLitters = rows.length > 0 ? rows : (currentTab?.rows || []);
        const litterOptions = availableLitters.map((row) => ({
          value: String(row.id || row.pk || ""),
          label: `${t("reproduction.matrix")} ${row.identifier || row.name || row.id}`,
        })).filter((option) => option.value);
        const selectedSourceIds = new Set(
          rows.map((row) => String(row.id || row.pk || "")).filter(Boolean)
        );
        const destinationOptions = Array.from(
          new Map(
            (currentTab?.rows || [])
              .filter((row) => row.identifier && !selectedSourceIds.has(String(row.id || row.pk || "")))
              .map((row) => [
                String(row.id || row.pk),
                {
                  value: String(row.id || row.pk),
                  label: `${t("reproduction.matrix")} ${row.identifier}`,
                },
              ])
          ).values()
        );
        setActionModal({
          open: true,
          title: t("reproduction.procedureTitle"),
          subtitle: t("reproduction.procedureSubtitle"),
          fields: [
            {
              name: "id",
              label: t("reproduction.litterMatrix"),
              type: rows.length > 1 ? "text" : (litterOptions.length > 0 ? "select" : "text"),
              options: litterOptions,
              initialValue: rows.length === 1 ? String(rows[0].id) : (rows.length > 1 ? t("reproduction.multipleSelected") : litterOptions[0]?.value),
              disabled: rows.length >= 1,
              required: true
            },
            {
              name: "tipo",
              label: t("reproduction.procedureType"),
              type: "select",
              required: true,
              options: [
                { value: "TRANSFERENCIA_LEITAO", label: `🔄 ${t("reproduction.pigletTransfer")}` },
                { value: "APLICACAO_MEDICAMENTO", label: `💊 ${t("reproduction.medicationApplication")}` },
                { value: "APLICACAO_VACINA", label: `💉 ${t("reproduction.vaccineApplication")}` },
              ],
              initialValue: "TRANSFERENCIA_LEITAO",
              colSpan: "full"
            },
            // Campos para Transferência de Leitões
            {
              name: "quantidade",
              label: t("reproduction.pigletCount"),
              type: "number",
              required: true,
              showIf: (values: any) => values.tipo === "TRANSFERENCIA_LEITAO"
            },
            {
              name: "destino_birth_id",
              label: t("reproduction.destinationMatrix"),
              type: "select",
              options: destinationOptions,
              required: true,
              showIf: (values: any) => values.tipo === "TRANSFERENCIA_LEITAO"
            },
            {
              name: "data",
              label: t("reproduction.date"),
              type: "date",
              required: true,
              initialValue: new Date().toISOString().split('T')[0],
              showIf: (values: any) => values.tipo === "TRANSFERENCIA_LEITAO"
            },
            {
              name: "observacao",
              label: t("reproduction.observation"),
              type: "textarea",
              showIf: (values: any) => values.tipo === "TRANSFERENCIA_LEITAO"
            },
            // Campos para Aplicação de Medicamentos
            {
              name: "medication_applications",
              label: t("reproduction.medication"),
              type: "inventory-list",
              required: true,
              colSpan: "full",
              initialValue: JSON.stringify([{ inventory_item: "", dose_per_animal: "" }]),
              options: medicationItems.map((item) => ({
                value: String(item.id),
                label: `${item.nome} (${t("reproduction.stockCount", {
                  count: item.estoque_atual,
                  unit: item.unidade_medida,
                })})`,
              })),
              showIf: (values: any) => values.tipo === "APLICACAO_MEDICAMENTO"
            },
            {
              name: "vaccine_applications",
              label: t("reproduction.vaccine"),
              type: "inventory-list",
              required: true,
              colSpan: "full",
              initialValue: JSON.stringify([{ inventory_item: "", dose_per_animal: "" }]),
              options: vaccineItems.map((item) => ({
                value: String(item.id),
                label: `${item.nome} (${t("reproduction.stockCount", {
                  count: item.estoque_atual,
                  unit: item.unidade_medida,
                })})`,
              })),
              showIf: (values: any) => values.tipo === "APLICACAO_VACINA"
            },
            {
              name: "animal_count",
              label: t("reproduction.pigletCount"),
              type: "number",
              required: true,
              min: 1,
              initialValue: rows.length === 1 ? (rows[0].vivos ?? rows[0].live_born ?? "") : "",
              showIf: (values: any) => ["APLICACAO_MEDICAMENTO", "APLICACAO_VACINA"].includes(values.tipo)
            },
            {
              name: "data",
              label: t("reproduction.applicationDate"),
              type: "date",
              required: true,
              initialValue: new Date().toISOString().split('T')[0],
              showIf: (values: any) => ["APLICACAO_MEDICAMENTO", "APLICACAO_VACINA"].includes(values.tipo)
            },
            {
              name: "motivo",
              label: t("reproduction.applicationReason"),
              type: "text",
              placeholder: t("reproduction.anemiaPreventionExample"),
              showIf: (values: any) => ["APLICACAO_MEDICAMENTO", "APLICACAO_VACINA"].includes(values.tipo)
            },
            {
              name: "responsavel",
              label: t("reproduction.responsible"),
              type: "text",
              placeholder: t("reproduction.responsibleName"),
              showIf: (values: any) => ["APLICACAO_MEDICAMENTO", "APLICACAO_VACINA"].includes(values.tipo)
            },
          ],
          onConfirm: async (data) => {
            // Parse applications only for medication/vaccine procedures
            if (data.tipo === "APLICACAO_VACINA" || data.tipo === "APLICACAO_MEDICAMENTO") {
              try {
                data.applications = JSON.parse(
                  data.tipo === "APLICACAO_VACINA"
                    ? data.vaccine_applications
                    : data.medication_applications
                );
              } catch {
                data.applications = [];
              }
            }
            if (rows.length > 1) {
              await Promise.all(rows.map(r => registerProcedure(r.id as number, data)));
              showToast(t("reproduction.procedureSavedForLitters", { count: rows.length }), "success");
            } else {
              const result = await registerProcedure(data.id, data);
              showToast(result?.message || t("reproduction.procedureSaved"), "success");
            }
            onSuccess?.();
            setActionModal(prev => ({ ...prev, open: false }));
          }
        });
        break;
      }
      case 'postpartum_vaccine': {
        const availableMothers = rows.length > 0 ? rows : (currentTab?.rows || []);
        const motherOptions = Array.from(
          new Map(availableMothers.map((row) => [
            String(row.animal_id || ""),
            {
              value: String(row.animal_id || ""),
              label: `${t("reproduction.matrix")} ${row.identifier || row.name || row.animal_id}`,
            },
          ])).values()
        ).filter((option) => option.value);
        const selectedMother = rows.length === 1 ? rows[0] : undefined;
        const isBatchVaccination = rows.length > 1;
        const selectedMotherLabels = motherOptions.map((option) => option.label).join(", ");
        const vaccineOpts = (vaccineItems || []).map((item) => ({
          value: String(item.id),
          label: `${item.nome}${item.estoque_atual != null ? ` (${t("reproduction.stockCount", {
            count: item.estoque_atual,
            unit: item.unidade_display || item.unidade_medida || "un",
          })})` : ""}`,
        }));
        setActionModal({
          open: true,
          title: isBatchVaccination
            ? t("reproduction.postpartumVaccineBatchTitle", { count: rows.length })
            : t("reproduction.postpartumVaccineTitle"),
          subtitle: vaccineItems.length === 0
            ? t("reproduction.noVaccineAvailable")
            : isBatchVaccination
              ? t("reproduction.batchVaccineInventoryNote")
              : t("reproduction.singleVaccineInventoryNote"),
          fields: [
            ...(isBatchVaccination
              ? [{
                  name: "selected_mothers",
                  label: t("reproduction.selectedMatrices"),
                  type: "text" as const,
                  initialValue: selectedMotherLabels,
                  disabled: true,
                  colSpan: "full" as const,
                }]
              : [{
                  name: "id",
                  label: t("reproduction.matrix"),
                  type: motherOptions.length > 0 ? "select" as const : "text" as const,
                  options: motherOptions,
                  initialValue: selectedMother ? String(selectedMother.animal_id) : undefined,
                  disabled: rows.length === 1,
                  required: true,
                }]),
            {
              name: "vaccine_applications",
              label: t("reproduction.vaccines"),
              type: "inventory-list",
              required: true,
              colSpan: "full",
              initialValue: JSON.stringify([{ inventory_item: "", dose_per_animal: "" }]),
              options: vaccineOpts,
            },
            {
              name: "application_date",
              label: t("reproduction.applicationDateCapitalized"),
              type: "date",
              required: true,
              initialValue: new Date().toISOString().split('T')[0],
            },
            {
              name: "dose_type",
              label: t("reproduction.doseType"),
              type: "select",
              options: [
                { value: "unica", label: t("reproduction.singleDose") },
                { value: "reforco", label: t("reproduction.boosterDose") },
              ],
              initialValue: "unica",
            },
            { name: "notes", label: t("reproduction.observations"), type: "textarea", colSpan: "full" },
          ],
          onConfirm: async (data) => {
            const targetMotherIds = isBatchVaccination
              ? Array.from(new Set(rows
                .map((row) => String(row.animal_id || row.id || row.pk || ""))
                .filter(Boolean)))
              : [data.id];
            const applications = JSON.parse(data.vaccine_applications) as Array<{
              inventory_item: string;
              dose_per_animal: string;
            }>;
            for (const animalId of targetMotherIds) {
              for (const application of applications) {
                await registerVaccination(animalId, {
                  application_date: data.application_date,
                  dose_type: data.dose_type,
                  notes: data.notes,
                  vaccine_item_id: application.inventory_item,
                  dosage_ml: Number(application.dose_per_animal.replace(",", ".")),
                });
              }
            }
            showToast(
              isBatchVaccination
                ? t("reproduction.postpartumBatchSaved", { count: targetMotherIds.length })
                : t("reproduction.postpartumSaved"),
              "success"
            );
            onSuccess?.();
            setActionModal((previous) => ({ ...previous, open: false }));
          },
        });
        break;
      }
      case 'mortality': {
        const availableLitters = rows.length > 0 ? rows : (currentTab?.rows || []);
        const mortalityOptions = availableLitters.map((row) => ({
          value: String(row.id || row.pk || ""),
          label: `${t("reproduction.matrix")} ${row.identifier || row.name || row.id}`,
        })).filter((option) => option.value);
        setActionModal({
          open: true,
          title: t("reproduction.maternityMortalityTitle"),
          fields: [
            {
              name: "id",
              label: t("reproduction.litterMatrix"),
              type: rows.length > 1 ? "text" : (mortalityOptions.length > 0 ? "select" : "text"),
              options: mortalityOptions,
              initialValue: rows.length === 1 ? String(rows[0].id) : (rows.length > 1 ? t("reproduction.multipleSelected") : mortalityOptions[0]?.value),
              disabled: rows.length >= 1,
              required: true
            },
            { name: "data", label: t("reproduction.deathDate"), type: "date", required: true, initialValue: new Date().toISOString().split('T')[0] },
            { name: "quantidade", label: t("reproduction.deadPigletCount"), type: "number", required: true },
            { name: "causa", label: t("reproduction.probableCause"), type: "select", required: true, options: [
              { value: "ESMAGAMENTO", label: t("reproduction.crushing") },
              { value: "NATIMORTO", label: t("reproduction.stillborn") },
              { value: "FRACO", label: t("reproduction.weakPiglet") },
              { value: "DOENCA", label: t("reproduction.disease") },
              { value: "DESCONHECIDA", label: t("reproduction.unknown") },
              { value: "OUTRA", label: t("reproduction.other") },
            ]},
            { name: "observacao", label: t("reproduction.observations"), type: "textarea" },
          ],
          onConfirm: async (data) => {
            if (rows.length > 1) {
              await Promise.all(rows.map(r => registerMortality(r.id as number, data)));
            } else {
              await registerMortality(data.id, data);
            }
            showToast(t("reproduction.litterMortalitySaved"), "success");
            onSuccess?.();
            setActionModal(prev => ({ ...prev, open: false }));
          }
        });
        break;
      }
      case 'birth': {
        const reproductiveVaccineOpts = (vaccineItems || []).map(v => ({
          value: String(v.id),
          label: `${v.nome}${v.estoque_atual ? ` (${t("reproduction.stockCount", {
            count: v.estoque_atual,
            unit: v.unidade || "un",
          })})` : ''}`,
        }));
        setActionModal({
            open: true,
            title: rows.length > 1
              ? t("reproduction.batchBirthTitle", { count: rows.length })
              : t("reproduction.birthTitle"),
            fields: [
              {
                name: "female_identifier",
                label: rows.length > 1 ? t("reproduction.selectedMatrices") : t("reproduction.matrixTag"),
                type: rows.length > 1 ? "text" : (animalOptions.length > 0 ? "select" : "text"),
                options: animalOptions,
                initialValue: rows.length === 1 ? animalOptions[0]?.value : (rows.length > 1 ? t("reproduction.multipleSelected") : undefined),
                disabled: rows.length >= 1,
                required: true
              },
              {
                name: "birth_date",
                label: t("reproduction.birthDate"),
                type: "date",
                required: true,
                initialValue: new Date().toISOString().split('T')[0]
              },
              {
                name: "birth_time_start",
                label: t("reproduction.birthStartTime"),
                type: "time",
                required: false,
              },
              {
                name: "birth_time_end",
                label: t("reproduction.birthEndTime"),
                type: "time",
                required: false,
              },
              {
                name: "expected_weaning_days",
                label: t("reproduction.weaningForecastDays"),
                type: "number",
                required: true,
                initialValue: 21,
                min: 1,
                max: 90,
              },
              {
                name: "schedule_reproductive_vaccine",
                label: t("reproduction.scheduleReproductiveVaccine"),
                type: "select",
                options: [
                  { value: "no", label: t("reproduction.doNotSchedule") },
                  { value: "yes", label: t("reproduction.scheduleReminder") },
                ],
                initialValue: "no",
                required: true,
              },
              {
                name: "reproductive_vaccine_item",
                label: t("reproduction.reproductiveVaccine"),
                type: "select",
                options: reproductiveVaccineOpts,
                required: true,
                showIf: (values) => values.schedule_reproductive_vaccine === "yes",
              },
              {
                name: "reproductive_vaccine_days",
                label: t("reproduction.remindAfterDays"),
                type: "number",
                required: true,
                initialValue: 70,
                min: 1,
                max: 365,
                showIf: (values) => values.schedule_reproductive_vaccine === "yes",
              },
              {
                name: "live_born",
                label: t("reproduction.liveBorn"),
                type: "number",
                required: true,
                initialValue: 12
              },
              {
                name: "stillborn",
                label: t("reproduction.death"),
                type: "number",
                initialValue: 0
              },
              {
                name: "mummified",
                label: t("reproduction.mummified"),
                type: "number",
                initialValue: 0
              },
              {
                name: "avg_weight_kg",
                label: t("reproduction.pigletAverageWeight"),
                type: "number",
                required: true,
                initialValue: 1.4
              },
            ],
            onConfirm: async (data) => {
              const performBirth = async (animalRow: any) => {
                const animalId = animalRow.animal_id || animalRow.id;
                const pregnancyId = animalRow.id;
                const identifier = animalRow.identifier;

                try {
                  await createBirth({
                    pregnancy: pregnancyId,
                    female: animalId,
                    birth_date: data.birth_date,
                    birth_time_start: data.birth_time_start || null,
                    birth_time_end: data.birth_time_end || null,
                    live_born: parseInt(data.live_born) || 0,
                    stillborn: parseInt(data.stillborn) || 0,
                    mummified: parseInt(data.mummified) || 0,
                    avg_weight_kg: data.avg_weight_kg ? parseFloat(data.avg_weight_kg) : null,
                    expected_weaning_days: parseInt(data.expected_weaning_days) || 21,
                    reproductive_vaccine_item: data.schedule_reproductive_vaccine === "yes"
                      ? data.reproductive_vaccine_item
                      : null,
                    reproductive_vaccine_days: data.schedule_reproductive_vaccine === "yes"
                      ? parseInt(data.reproductive_vaccine_days)
                      : null,
                    notes: data.notes || ""
                  });

                  await updatePregnancy(pregnancyId, { status: 'completed' });

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
                  const birthData = { ...data };
                  delete birthData.schedule_reproductive_vaccine;
                  await createBirth({
                    ...birthData,
                    expected_weaning_days: parseInt(data.expected_weaning_days) || 21,
                    reproductive_vaccine_item: data.schedule_reproductive_vaccine === "yes"
                      ? data.reproductive_vaccine_item
                      : null,
                    reproductive_vaccine_days: data.schedule_reproductive_vaccine === "yes"
                      ? parseInt(data.reproductive_vaccine_days)
                      : null,
                  });
                }
                onSuccess?.();
                setActionModal(prev => ({ ...prev, open: false }));
              } catch (err) {
                console.error("Erro geral ao processar parto:", err);
              }
            }
          });
          break;
      }
      case 'wean': {
        const weanOptions = (rows.length > 0 ? rows : (config.tabs.find(t => t.id === 'maternidade')?.rows || [])).map(r => ({
          value: String(r.id), // Birth ID
          label: String(r.identifier || `${t("reproduction.matrix")} ${r.animal_id || r.id}`) // Matrix Identifier
        }));

        if (weanOptions.length === 0) {
          alert(t("reproduction.weanUnavailable"));
          return;
        }

        setActionModal({
          open: true,
          title: rows.length > 1
            ? t("reproduction.batchWeaningTitle", { count: rows.length })
            : t("reproduction.weaningTitle"),
          subtitle: t("reproduction.weaningSubtitle"),
          fields: [
            {
              name: "birth_id",
              label: rows.length > 1 ? t("reproduction.selectedMatrices") : t("reproduction.matrixTag"),
              type: rows.length > 1 ? "text" : "select",
              options: weanOptions,
              initialValue: rows.length === 1 ? weanOptions[0]?.value : (rows.length > 1 ? t("reproduction.multipleSelected") : weanOptions[0]?.value),
              disabled: rows.length >= 1,
              required: true
            },
            {
              name: "weaning_date",
              label: t("reproduction.weaningDate"),
              type: "date",
              required: true,
              initialValue: new Date().toISOString().split('T')[0]
            },
            {
              name: "weaned_quantity",
              label: t("reproduction.weanedQuantity"),
              type: "number",
              required: true,
              initialValue: rows.length === 1 ? (rows[0].vivos_atual || rows[0].vivos || 10) : 10,
              placeholder: t("reproduction.pigletQuantity")
            },
            {
              name: "avg_weaning_weight_kg",
              label: t("reproduction.averageWeaningWeight"),
              type: "number",
              required: true,
              initialValue: 6.5,
              placeholder: t("reproduction.weightExample")
            },
            {
              name: "weaning_type",
              label: t("reproduction.weaningType"),
              type: "select",
              required: true,
              options: [
                { value: "total", label: t("reproduction.totalWeaning") },
                { value: "parcial", label: t("reproduction.partialWeaning") }
              ],
              initialValue: "total"
            },
            {
              name: "batch_code",
              label: t("reproduction.newNurseryBatchCode"),
              type: "text",
              required: true,
              initialValue: rows.length === 1
                ? `L-CRECHE-${rows[0].identifier}-${new Date().toLocaleDateString(language).replace(/\//g, '')}`
                : `L-CRECHE-LOTE-${new Date().toLocaleDateString(language).replace(/\//g, '')}`
            },
            {
              name: "next_mating_notice_days",
              label: t("reproduction.daysToNextHeat"),
              type: "number",
              required: true,
              initialValue: 7,
              min: 1,
              max: 365,
              showIf: (values) => values.weaning_type === "total",
            }
          ],
          onConfirm: async (data) => {
            const performWean = async (row: any) => {
              const birthId = row.id;
              const identifier = row.identifier;
              const vivosAtual = parseInt(row.vivos_atual || row.vivos) || 0;

              try {
                const batchQty = parseInt(data.weaned_quantity) || vivosAtual;
                await weanBirth(birthId, {
                  batch_code: data.batch_code || `L-CRECHE-${identifier}-${new Date().toLocaleDateString(language).replace(/\//g, '')}`,
                  weaned_quantity: batchQty,
                  weaning_date: data.weaning_date,
                  weaning_type: data.weaning_type,
                  avg_weaning_weight_kg: data.avg_weaning_weight_kg ? parseFloat(data.avg_weaning_weight_kg) : null,
                  next_mating_notice_days: data.weaning_type === "total"
                    ? Number(data.next_mating_notice_days)
                    : null,
                });
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
          label: `${r.name || r.identifier}${r.name && r.name !== r.identifier ? ` — ${r.identifier}` : ''}${r.category ? ` (${r.category})` : ''}`,
        }));
        const semenOpts = (semenItems || []).map(s => {
          const classif = s.tipo_semen === 'sexado_macho'
            ? t("reproduction.sexedMale")
            : s.tipo_semen === 'sexado_femea'
              ? t("reproduction.sexedFemale")
              : t("reproduction.conventional");
          return {
            value: String(s.id),
            label: `${s.nome} [${classif}] (${t("reproduction.semenDosesStock", { count: s.estoque_atual || 0 })})`,
          };
        });
        const reproductiveVaccineOpts = (vaccineItems || []).map(v => ({
          value: String(v.id),
          label: `${v.nome}${v.estoque_atual ? ` (${t("reproduction.stockCount", {
            count: v.estoque_atual,
            unit: v.unidade || "un",
          })})` : ''}`,
        }));
        setActionModal({
          open: true,
          title: rows.length > 1
            ? `💖 ${t("reproduction.batchMatingTitle", { count: rows.length })}`
            : `💖 ${t("reproduction.giltMatingTitle")}`,
          subtitle: rows.length > 1
            ? t("reproduction.batchMatingSubtitle")
            : t("reproduction.giltMatingSubtitle"),
          fields: [
            {
              name: "id",
              label: rows.length > 1 ? t("reproduction.selectedMatrices") : t("reproduction.giltTag"),
              type: rows.length > 1 ? "text" : (animalOptions.length > 0 ? "select" : "text"),
              options: animalOptions,
              initialValue: rows.length === 1 ? animalOptions[0]?.value : (rows.length > 1 ? t("reproduction.selectedCount", { count: rows.length }) : undefined),
              disabled: rows.length >= 1,
              placeholder: t("reproduction.selectGilt"),
              required: true,
            },
            {
              name: "mating_date",
              label: t("reproduction.matingDate"),
              type: "date",
              required: true,
              initialValue: new Date().toISOString().split('T')[0]
            },
            {
              name: "mating_type",
              label: t("reproduction.matingType"),
              type: "select",
              options: [
                { value: "natural", label: t("reproduction.naturalMating") },
                { value: "ai", label: t("reproduction.artificialInsemination") },
                { value: "iatf", label: "IATF" },
              ],
              initialValue: "natural",
              required: true,
            },
            {
              name: "material_origin",
              label: t("reproduction.semenMaterialOrigin"),
              type: "select",
              options: [
                { value: "reprodutor", label: t("reproduction.registeredReproducer") },
                { value: "semen", label: t("reproduction.semenFromStock") },
              ],
              initialValue: "reprodutor",
              required: true,
              showIf: (vals) => vals.mating_type === "ai" || vals.mating_type === "iatf",
            },
            {
              name: "sire_id",
              label: sireOpts.length > 0 ? t("reproduction.reproducerBoar") : t("reproduction.noMalesRegistered"),
              type: sireOpts.length > 0 ? "select" : "text",
              options: sireOpts.length > 0 ? sireOpts : undefined,
              placeholder: sireOpts.length > 0 ? t("reproduction.selectReproducer") : t("reproduction.noReproducersRegistered"),
              required: true,
              showIf: (vals) => vals.mating_type === "natural" || vals.material_origin === "reprodutor",
            },
            {
              name: "semen_item_id",
              label: t("reproduction.selectSemenStock"),
              type: "select",
              options: semenOpts.length > 0 ? semenOpts : undefined,
              placeholder: semenOpts.length > 0 ? t("reproduction.selectSemen") : t("reproduction.noSemenRegistered"),
              required: true,
              showIf: (vals) => (vals.mating_type === "ai" || vals.mating_type === "iatf") && vals.material_origin === "semen",
            },
            {
              name: "semen_doses",
              label: t("reproduction.semenDosesUsed"),
              type: "number",
              initialValue: 1,
              min: 1,
              step: 1,
              required: true,
              showIf: (vals) => (vals.mating_type === "ai" || vals.mating_type === "iatf") && vals.material_origin === "semen",
            },
            {
              name: "sire_info",
              label: t("reproduction.semenIdentification"),
              type: "text",
              placeholder: t("reproduction.semenExample"),
              showIf: (vals) => (vals.mating_type === "ai" || vals.mating_type === "iatf") && vals.material_origin === "semen",
            },
            {
              name: "schedule_reproductive_vaccine",
              label: t("reproduction.scheduleReproductiveVaccine"),
              type: "select",
              options: [
                { value: "no", label: t("reproduction.doNotSchedule") },
                { value: "yes", label: t("reproduction.scheduleReminder") },
              ],
              initialValue: "no",
              required: true,
            },
            {
              name: "reproductive_vaccine_item",
              label: t("reproduction.reproductiveVaccine"),
              type: "select",
              options: reproductiveVaccineOpts,
              required: true,
              showIf: (vals) => vals.schedule_reproductive_vaccine === "yes",
            },
            {
              name: "reproductive_vaccine_days",
              label: t("reproduction.remindAfterDays"),
              type: "number",
              required: true,
              initialValue: 21,
              min: 1,
              max: 365,
              showIf: (vals) => vals.schedule_reproductive_vaccine === "yes",
            },
            { name: "notes", label: t("reproduction.observations"), type: "textarea" },
          ],
          onConfirm: async (data) => {
            let computedSireInfo = data.sire_info || "";
            if (data.material_origin === "semen" && data.semen_item_id) {
              const selectedSemen = (semenItems || []).find(s => String(s.id) === String(data.semen_item_id));
              if (selectedSemen) {
                computedSireInfo = `${t("reproduction.semenPrefix")}: ${selectedSemen.nome}`;
              }
            }

            if (data.material_origin !== "semen" && data.sire_id) {
              const selectedSire = (reproducerOptions || []).find(
                sire => String(sire.id) === String(data.sire_id)
              );
              if (selectedSire) computedSireInfo = selectedSire.name || selectedSire.identifier;
            }

            const isSireText = isNaN(Number(data.sire_id));
            if (isSireText && data.sire_id) {
              computedSireInfo = computedSireInfo ? `${computedSireInfo} - ${data.sire_id}` : data.sire_id;
            }

            const payload = {
              mating_date: data.mating_date,
              mating_type: data.mating_type || "natural",
              sire_info: computedSireInfo,
              ...(data.material_origin !== "semen" && data.sire_id && !isSireText ? { sire_id: Number(data.sire_id) } : {}),
              reproductive_vaccine_item: data.schedule_reproductive_vaccine === "yes"
                ? data.reproductive_vaccine_item
                : null,
              reproductive_vaccine_days: data.schedule_reproductive_vaccine === "yes"
                ? Number(data.reproductive_vaccine_days)
                : null,
              notes: data.notes || "",
            };

            const targetRows = rows.length > 0 ? rows : [data];
            const animalIds = rows.length > 1
              ? rows.map(r => r.animal_id || r.id || r.pk || r.identifier)
              : [data.id || (rows.length === 1 ? (rows[0].animal_id || rows[0].id || rows[0].pk || rows[0].identifier) : null)];

            if (animalIds.some(id => !id)) throw new Error(t("reproduction.chooseFemale"));

            // 1. Register the coverages
            await Promise.all(animalIds.map(animalId => registerMating(String(animalId), payload)));

            // 2. Perform inventory consumption if semen is used
            if (data.material_origin === "semen" && data.semen_item_id) {
              try {
                const dosesPerFemale = Math.max(1, Number(data.semen_doses || 1));
                await apiClient.post("/inventory/movimentacoes/", {
                  item: data.semen_item_id,
                  tipo: "consumo",
                  quantidade: dosesPerFemale * Math.max(1, targetRows.length),
                  observacao: t("reproduction.semenConsumptionNote", {
                    count: dosesPerFemale,
                    animals: animalIds.join(", "),
                  }),
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
      case 'heat':
        setActionModal({
          open: true,
          title: t("reproduction.heatTitle"),
          subtitle: t("reproduction.heatSubtitle"),
          fields: [
            {
              name: "id",
              label: rows.length > 1 ? t("reproduction.selectedMatrices") : t("reproduction.giltMatrixTag"),
              type: rows.length > 1 ? "text" : (animalOptions.length > 0 ? "select" : "text"),
              options: animalOptions,
              initialValue: rows.length === 1 ? animalOptions[0]?.value : (rows.length > 1 ? t("reproduction.multipleSelected") : undefined),
              disabled: rows.length >= 1,
              required: true,
            },
            {
              name: "heat_date",
              label: t("reproduction.heatDate"),
              type: "date",
              required: true,
              initialValue: new Date().toISOString().split('T')[0]
            },
            {
              name: "notes",
              label: t("reproduction.observations"),
              type: "textarea"
            }
          ],
          onConfirm: async (data) => {
            if (rows.length > 1) {
              await Promise.all(rows.map(r => registerHeat(r.id || r.pk || r.identifier, data)));
            } else {
              await registerHeat(data.id, data);
            }
            onSuccess?.();
            setActionModal(prev => ({ ...prev, open: false }));
          }
        });
        break;
      case 'merge_batches':
        if (rows.length < 2) {
          alert(t("reproduction.selectTwoBatches"));
          return;
        }
        setActionModal({
          open: true,
          title: t("reproduction.mergeBatchesTitle"),
          subtitle: t("reproduction.mergeBatchesSubtitle", { count: rows.length }),
          fields: [
            {
              name: "source_batches",
              label: t("reproduction.selectedBatches"),
              type: "text",
              initialValue: rows.map(r => r.lote || r.batch_code).join(", "),
              disabled: true,
              colSpan: "full",
            },
            {
              name: "new_batch_code",
              label: t("reproduction.newBatchCode"),
              type: "text",
              required: true,
              initialValue: `L-JUNCAO-${new Date().toLocaleDateString(language).replace(/\//g, '')}`,
              colSpan: "full",
            },
            {
              name: "entry_date",
              label: t("reproduction.mergeDate"),
              type: "date",
              required: true,
              initialValue: new Date().toISOString().split('T')[0]
            },
            {
              name: "notes",
              label: t("reproduction.observations"),
              type: "textarea"
            }
          ],
          onConfirm: async (data) => {
            await mergeBatches({
              batch_ids: rows.map(r => r.id),
              new_batch_code: data.new_batch_code,
              entry_date: data.entry_date,
              notes: data.notes
            });
            onSuccess?.();
            setActionModal(prev => ({ ...prev, open: false }));
          }
        });
        break;
      case 'transfer_crescimento':
        handleTransferPhase("crescimento", rows);
        break;
      case 'transfer_engorda':
        handleTransferPhase("engorda", rows);
        break;
      case 'promote':
        setActionModal({
          open: true,
          title: t("reproduction.promoteTitle"),
          subtitle: t("reproduction.promoteSubtitle"),
          fields: [
            {
              name: "id",
              label: t("reproduction.identifier"),
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
      case 'history':
        if (rows.length > 0) {
          setHistoryModalOpen(true);
          setHistoryLoading(true);
          setHistoryEvents([]);
          fetchAnimalHistory(rows[0].id).then((events: any[]) => {
            setHistoryEvents(events.map((e: any) => ({
              date: e.date,
              icon: TYPE_ICON[e.type as string] || '📋',
              text: `${e.title} — ${e.subtitle}`,
              type: TYPE_COLOR[e.type as string] || 'system',
            })));
          }).catch(() => {
            showToast(t("reproduction.historyError"), "error");
          }).finally(() => {
            setHistoryLoading(false);
          });
        }
        break;
      case 'technical_sheet':
        if (rows.length > 0) {
          // Linhas de gestação/maternidade representam o evento reprodutivo.
          // A ficha técnica, porém, deve receber o id do animal (matriz), não o
          // id desse evento — o mesmo critério usado ao clicar na linha/lupa.
          const animalId = rows[0].animal_id || rows[0].id || rows[0].pk;
          setBatchSheetOpen(true);
          setSelectedBatchId(animalId);
        }
        break;
      case 'primary':
        setModalOpen(true);
        break;
      default:
        console.warn(`Action type ${action.type} not implemented`);
    }
  };

  const allTabs = [
    { id: "dashboard", icon: "📊", label: t("sidebar.dashboard"), count: undefined },
    ...config.tabs,
  ];

  const currentTab = config.tabs.find((t) => t.id === activeTab);
  const isActiveTabLoading = activeTab === "dashboard"
    ? initialLoading
    : tabLoading?.[activeTab] ?? false;
  const getPrimaryModalFields = (): ModalField[] => {
    if (isSwineMatingTab(currentTab)) {
      const sireOpts = (reproducerOptions || []).map(r => ({
        value: String(r.id),
        label: `${r.identifier}${r.category ? ` (${r.category})` : ''}`,
      }));
      const semenOpts = (semenItems || []).map(s => {
        const classif = s.tipo_semen === 'sexado_macho'
          ? t("reproduction.sexedMale")
          : s.tipo_semen === 'sexado_femea'
            ? t("reproduction.sexedFemale")
            : t("reproduction.conventional");
        return {
          value: String(s.id),
          label: `${s.nome} [${classif}] (${t("reproduction.semenDosesStock", { count: s.estoque_atual || 0 })})`,
        };
      });
      const reproductiveVaccineOpts = (vaccineItems || []).map(v => ({
        value: String(v.id),
        label: `${v.nome}${v.estoque_atual ? ` (${t("reproduction.stockCount", {
          count: v.estoque_atual,
          unit: v.unidade || "un",
        })})` : ''}`,
      }));
      return [
        {
          name: "matriz",
          label: t("reproduction.matrixEarTag"),
          type: "text",
          required: true,
        },
        {
          name: "data_cobertura",
          label: t("reproduction.matingDate"),
          type: "date",
          required: true,
          initialValue: new Date().toISOString().split('T')[0]
        },
        {
          name: "tipo",
          label: t("reproduction.matingType"),
          type: "select",
          options: [
            { value: "MN", label: t("reproduction.naturalMating") },
            { value: "IA", label: t("reproduction.artificialInsemination") },
          ],
          initialValue: "MN",
          required: true,
        },
        {
          name: "material_origin",
          label: t("reproduction.semenMaterialOrigin"),
          type: "select",
          options: [
            { value: "reprodutor", label: t("reproduction.registeredReproducer") },
            { value: "semen", label: t("reproduction.semenFromStock") },
          ],
          initialValue: "reprodutor",
          required: true,
          showIf: (vals: Record<string, string>) => vals.tipo === "IA",
        },
        {
          name: "sire_id",
          label: sireOpts.length > 0 ? t("reproduction.reproducerBoar") : t("reproduction.noMalesRegistered"),
          type: sireOpts.length > 0 ? "select" : "text",
          options: sireOpts.length > 0 ? sireOpts : undefined,
          placeholder: sireOpts.length > 0 ? t("reproduction.selectReproducer") : t("reproduction.noReproducersRegistered"),
          required: true,
          showIf: (vals: Record<string, string>) => vals.tipo === "MN" || vals.material_origin === "reprodutor",
        },
        {
          name: "semen_item_id",
          label: t("reproduction.selectSemenStock"),
          type: "select",
          options: semenOpts.length > 0 ? semenOpts : undefined,
          placeholder: semenOpts.length > 0 ? t("reproduction.selectSemen") : t("reproduction.noSemenRegistered"),
          required: true,
          showIf: (vals: Record<string, string>) => vals.tipo === "IA" && vals.material_origin === "semen",
        },
        {
          name: "semen_doses",
          label: t("reproduction.semenDosesUsed"),
          type: "number",
          initialValue: 1,
          min: 1,
          step: 1,
          required: true,
          showIf: (vals: Record<string, string>) => vals.tipo === "IA" && vals.material_origin === "semen",
        },
        {
          name: "sire_info",
          label: t("reproduction.semenIdentification"),
          type: "text",
          placeholder: t("reproduction.semenExample"),
          showIf: (vals: Record<string, string>) => vals.tipo === "IA" && vals.material_origin === "semen",
        },
        {
          name: "apply_reproductive_vaccine",
          label: t("reproduction.applyReproductiveVaccine"),
          type: "select",
          options: [
            { value: "no", label: t("reproduction.doNotApply") },
            { value: "yes", label: t("reproduction.applyNow") },
          ],
          initialValue: "no",
          required: true,
        },
        {
          name: "reproductive_vaccine_item_id",
          label: t("reproduction.reproductiveVaccine"),
          type: "select",
          options: reproductiveVaccineOpts,
          required: true,
          showIf: (vals: Record<string, string>) => vals.apply_reproductive_vaccine === "yes",
        },
        {
          name: "reproductive_vaccine_dosage_ml",
          label: t("reproduction.doseMl"),
          type: "number",
          showIf: (vals: Record<string, string>) => vals.apply_reproductive_vaccine === "yes",
        },
      ];
    }
    return (currentTab?.primaryActionModalFields as ModalField[]) || [];
  };

  const handlePrimaryConfirm = async (data: Record<string, string>) => {
    if (isSwineMatingTab(currentTab)) {
      // Support both the simplified primary form and the rich mating_marra form
      const mating_type = data.mating_type || (data.tipo === "IA" ? "ai" : data.tipo === "MN" ? "natural" : "natural");
      const sire_info = data.sire_info || data.reprodutor || "";
      const material_origin = data.material_origin || "";
      const semen_item_id = data.semen_item_id || null;

      let computedSireInfo = sire_info;
      if (material_origin === "semen" && semen_item_id) {
        const selectedSemen = (semenItems || []).find(s => String(s.id) === String(semen_item_id));
        if (selectedSemen) {
          computedSireInfo = `${t("reproduction.semenPrefix")}: ${selectedSemen.nome}`;
        }
      }

      const isSireText = isNaN(Number(data.sire_id));
      if (isSireText && data.sire_id) {
        computedSireInfo = computedSireInfo ? `${computedSireInfo} - ${data.sire_id}` : data.sire_id;
      }

      // 1. Save using createMating
      const female_id = data.matriz || data.id || data.female_identifier || "";
      const mating = await createMating({
        female_identifier: female_id,
        mating_date: data.data_cobertura || data.mating_date,
        mating_type: mating_type,
        sire_info: computedSireInfo,
        ...(material_origin !== "semen" && data.sire_id && !isSireText ? { sire_id: Number(data.sire_id) } : {}),
        reproductive_vaccine_item: data.schedule_reproductive_vaccine === "yes"
          ? data.reproductive_vaccine_item
          : null,
        reproductive_vaccine_days: data.schedule_reproductive_vaccine === "yes"
          ? Number(data.reproductive_vaccine_days)
          : null,
      });

      if (data.apply_reproductive_vaccine === "yes" && data.reproductive_vaccine_item_id) {
        await registerVaccination(mating.female, {
          vaccine_item_id: String(data.reproductive_vaccine_item_id),
          application_date: data.data_cobertura || data.mating_date,
          dose_type: "unica",
          dosage_ml: data.reproductive_vaccine_dosage_ml ? Number(data.reproductive_vaccine_dosage_ml) : undefined,
          notes: t("reproduction.reproductiveVaccineDuringMatingNote"),
        });
      }

      // 2. Perform inventory consumption if semen is used
      if (mating_type === "ai" && material_origin === "semen" && semen_item_id) {
        try {
          const semenDoses = Math.max(1, Number(data.semen_doses || 1));
          await apiClient.post("/inventory/movimentacoes/", {
            item: semen_item_id,
            tipo: "consumo",
            quantidade: semenDoses,
            observacao: t("reproduction.semenConsumptionNote", {
              count: semenDoses,
              animals: String(female_id),
            }),
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
  const speciesLabel = (species?: string, display?: string) => {
    if (species === "suinos" || species === "suino") return t("reproduction.speciesSwine");
    if (species === "bovinos" || species === "bovino") return t("reproduction.speciesCattle");
    if (species === "aves" || species === "ave") return t("reproduction.speciesPoultry");
    return display ?? species ?? "";
  };

  const hasTabData = activeTab === "dashboard" || currentTab?.count !== undefined;

  return (
    <div className="repro-dashboard">
      {/* ─── Breadcrumb dinâmico ─── */}
      <div className="repro-breadcrumb mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <span style={{ color: "var(--muted-foreground)" }}>{t("reproduction.herd")}</span>
          <span className="text-muted-foreground">›</span>
          <span className="fw-semibold text-foreground">{config.titulo}</span>
          <span className="text-muted-foreground">›</span>
          <span>{t("reproduction.sectionReproduction")}</span>
          {activeTab !== "dashboard" && currentTab && (
            <>
              <span className="text-muted-foreground">›</span>
              <span className="fw-semibold" style={{ color: "var(--primary)" }}>{currentTab.label}</span>
            </>
          )}
        </nav>
      </div>

      <ReproducaoHeader subtitle={config.subtitulo}>
        {activeTab !== "dashboard" && currentTab?.primaryActionLabel && (
          <button
            className="btn btn-primary d-inline-flex align-items-center gap-2 fw-semibold px-4 py-2 shadow-sm rounded-pill transition-all hover-scale"
            style={{ fontSize: '0.9rem', backgroundColor: 'var(--primary)', borderColor: 'var(--primary)' }}
            onClick={() => {
              if (isSwineMatingTab(currentTab) && !hasReproducers && !hasSemenStock) {
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
      </ReproducaoHeader>

      {/* As abas internas aparecem somente depois que o produtor entra em uma fase. */}
      <ReproducaoPhaseTabs selected={activeTab} onSelect={setActiveTab} loading={tabLoading} phases={allTabs.map(tab => ({ id: tab.id, label: tab.label, count: tab.count, icon: <ReproductionIcon icon={tab.icon} size={20} /> }))} />

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
                    // Se for aba de lote, abre a Ficha do Lote. Caso contrário, página do animal
                    if (["creche", "crescimento", "engorda"].includes(currentTab.id)) {
                      setSelectedBatchId(id as string | number);
                      setBatchSheetOpen(true);
                    } else {
                      router.push(`/home/seguimento/${config.especie}/animal/${id}`);
                    }
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
          title={currentTab.primaryActionModalTitle ?? currentTab.primaryActionLabel ?? t("reproduction.newRecord")}
          subtitle={currentTab.primaryActionModalSubtitle}
          fields={getPrimaryModalFields()}
          confirmLabel={t("reproduction.save")}
          onConfirm={handlePrimaryConfirm}
        />
      )}

      {batchSheetOpen && selectedBatchId && (
        ["creche", "crescimento", "engorda"].includes(activeTab) ? (
          <BatchTechnicalSheetModal
            isOpen={batchSheetOpen}
            onClose={() => {
              setBatchSheetOpen(false);
              setSelectedBatchId(null);
            }}
            batchId={selectedBatchId}
          />
        ) : (
          <AnimalTechnicalSheetModal
            isOpen={batchSheetOpen}
            onClose={() => {
              setBatchSheetOpen(false);
              setSelectedBatchId(null);
            }}
            animalId={selectedBatchId}
            mode="animal"
          />
        )
      )}

      {/* ─── History Modal ─── */}
      {historyModalOpen && (
        <div className="repro-modal-overlay" onClick={() => setHistoryModalOpen(false)}>
          <div className="repro-modal" onClick={e => e.stopPropagation()}>
            <div className="repro-modal-header">
              <div>
                <div className="repro-modal-title">📋 {t("reproduction.historyTitle")}</div>
                <div className="repro-modal-subtitle">{t("reproduction.eventTimeline")}</div>
              </div>
              <button className="repro-modal-close" onClick={() => setHistoryModalOpen(false)} type="button">
                <X size={16} />
              </button>
            </div>
            <div className="repro-modal-body">
              {historyLoading ? (
                <div className="d-flex justify-content-center py-5"><Loader2 size={32} className="spin-animation text-muted" /></div>
              ) : (
                <HistoryTimeline events={historyEvents} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Generic Action Modal ─── */}
      <ReproducaoModal
        open={actionModal.open}
        onClose={() => setActionModal(prev => ({ ...prev, open: false }))}
        title={actionModal.title}
        subtitle={actionModal.subtitle}
        fields={actionModal.fields}
        confirmLabel={t("reproduction.confirm")}
        onConfirm={actionModal.onConfirm}
      />

      {/* ─── No Reproducers Warning Modal ─── */}
      {noReproducersWarningOpen && (
        <div className="repro-modal-overlay" onClick={() => setNoReproducersWarningOpen(false)}>
          <div className="repro-modal" style={{ maxWidth: "480px" }}>
            <div className="repro-modal-header" style={{ paddingBottom: "0.5rem" }}>
              <div>
                <div className="repro-modal-title text-danger d-flex align-items-center gap-2" style={{ fontSize: "1.25rem" }}>
                  <span>⚠️</span> {t("reproduction.noReproducerAvailable")}
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
                {t("reproduction.availabilityDiagnosis")}
              </h5>

              <div className="text-start px-3 py-3 bg-muted/10 rounded-xl mb-4 border border-border/40" style={{ fontSize: '0.85rem' }}>
                <div className="mb-3 d-flex align-items-center gap-2">
                  <span className={hasReproducers ? "text-success" : "text-danger"} style={{ fontSize: '1.1rem' }}>
                    {hasReproducers ? "✔" : "❌"}
                  </span>
                  <div>
                    <strong>{t("reproduction.reproducers")}:</strong> {hasReproducers
                      ? t("reproduction.activeCount", { count: reproducerOptions.length })
                      : t("reproduction.noActiveMale")}
                  </div>
                </div>

                <div className="d-flex align-items-start gap-2">
                  <span className={hasSemenStock ? "text-success" : "text-danger"} style={{ fontSize: '1.1rem', marginTop: '-2px' }}>
                    {hasSemenStock ? "✔" : "❌"}
                  </span>
                  <div>
                    <strong>{t("reproduction.semenInStock")}:</strong>{" "}
                    {hasSemenStock ? (
                      t("reproduction.availableForUse")
                    ) : (
                      <>
                        {semenItems.length === 0 ? (
                          <>
                            {t("reproduction.noProductsForSpecies", { species: speciesLabel(config.especie) })}
                            {allSemenItems.length > 0 && (
                              <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                                💡 {t("reproduction.otherSpeciesSemen", {
                                  species: Array.from(new Set(allSemenItems.map(item =>
                                    speciesLabel(item.especie_animal, item.especie_animal_display),
                                  ))).join(", "),
                                  currentSpecies: speciesLabel(config.especie),
                                })}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {t("reproduction.semenOutOfStock")}
                            <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                              {t("reproduction.productsFound", { products: semenItems.map(s => s.nome).join(", ") })}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-muted-foreground mb-0" style={{ fontSize: "0.82rem", lineHeight: "1.5" }}>
                {t("reproduction.matingPrerequisite")}
              </p>
            </div>

            <div className="repro-modal-footer d-flex flex-column gap-2 w-100" style={{ padding: "0 1.5rem 1.5rem" }}>
              <Link
                href={`/home/seguimento/${config.especie}/cadastro`}
                className="repro-btn-primary w-100 justify-content-center text-decoration-none text-center d-flex align-items-center gap-2"
                style={{ background: "oklch(0.55 0.16 145)", border: "none", boxShadow: "0 4px 12px oklch(0.55 0.16 145 / 0.2)" }}
                onClick={() => setNoReproducersWarningOpen(false)}
              >
                {t("reproduction.registerNewReproducer")}
              </Link>
              <Link
                href={`/home/estoque/produtos?openModal=true&category=semen`}
                className="repro-btn-primary w-100 justify-content-center text-decoration-none text-center d-flex align-items-center gap-2"
                style={{ background: "oklch(0.65 0.22 350)", border: "none", boxShadow: "0 4px 12px oklch(0.65 0.22 350 / 0.2)" }}
                onClick={() => setNoReproducersWarningOpen(false)}
              >
                {t("reproduction.addSemenToInventory")}
              </Link>
              <button
                type="button"
                className="repro-btn-secondary w-100 justify-content-center"
                onClick={() => setNoReproducersWarningOpen(false)}
              >
                {t("reproduction.back")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
