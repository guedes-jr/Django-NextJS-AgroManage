"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Droplets, Pencil, Plus, Save, ShieldCheck, Sprout, Trash2, Wheat, X } from "lucide-react";
import apiClient from "@/services/api";
import { cropService } from "@/services/cropService";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useOrganizationLocale } from "@/lib/locale";

type OperationKind = "plantio" | "adubacao" | "fertirrigacao" | "defensivos" | "irrigacao";

type Plantation = {
  id: string;
  name?: string;
  crop_name?: string;
  field_name?: string;
  farm_name?: string;
};

type InventoryItem = {
  id: string;
  nome: string;
  categoria?: string;
  categorias?: string[];
  especie_animal?: string | null;
  unidade_medida?: string;
  estoque_atual?: string | number | null;
};

type ApplicationLine = {
  item: string;
  lot: string;
  pesticide_type?: string;
  quantity: string;
  unit: string;
  unit_price: string;
  total_price: string;
};

type ApplicationRecord = {
  id: string;
  planting_date?: string | null;
  application_date?: string | null;
  item_name?: string | null;
  pesticide_type_display?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  unit_price?: string | number | null;
  total_price?: string | number | null;
  operator?: string | null;
  notes?: string | null;
  equipments?: { equipment: string; total_price?: string | number | null }[];
};

type IrrigationPump = {
  id: string;
  name: string;
  power_cv: string | number;
  power_kw: string | number;
  flow_rate_l_per_h: string | number;
};

type IrrigationRecord = {
  id: string;
  date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  irrigation_system_display?: string | null;
  pump_name?: string | null;
  operating_days?: number | null;
  hours_per_day?: string | number | null;
  hours?: string | number | null;
  liters_used?: string | number | null;
  energy_kwh?: string | number | null;
  energy_cost?: string | number | null;
  operator?: string | null;
};

const unitOptions = [
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "l", label: "L" },
  { value: "ml", label: "mL" },
  { value: "saco", label: "sc" },
  { value: "tonelada", label: "t" },
  { value: "unidade", label: "un" },
];

const pesticideTypeOptions = [
  { value: "insecticide", label: "Inseticida" },
  { value: "herbicide", label: "Herbicida" },
  { value: "fungicide", label: "Fungicida" },
  { value: "adjuvant", label: "Adjuvante" },
  { value: "acaricide", label: "Acaricida" },
  { value: "bactericide", label: "Bactericida" },
  { value: "other", label: "Outro" },
];

const allowedInventoryCategories: Record<Exclude<OperationKind, "irrigacao">, string[]> = {
  plantio: ["semente"],
  adubacao: ["fertilizante", "corretivo"],
  fertirrigacao: ["fertirrigacao"],
  defensivos: ["defensivo", "foliar"],
};

const getItemCategories = (item: InventoryItem) =>
  item.categorias?.length ? item.categorias : item.categoria ? [item.categoria] : [];

const isItemCompatibleWithOperation = (item: InventoryItem, kind: OperationKind) => {
  if (kind === "irrigacao") return false;
  return getItemCategories(item).some((category) => allowedInventoryCategories[kind].includes(category));
};

const irrigationSystemOptions = [
  { value: "center_pivot", label: "Pivô central" },
  { value: "drip", label: "Gotejamento" },
  { value: "sprinkler", label: "Aspersão" },
  { value: "micro_sprinkler", label: "Microaspersão" },
  { value: "hose", label: "Mangueira" },
  { value: "other", label: "Outro" },
];

const configByKind = {
  plantio: {
    title: "Sementes e mudas",
    subtitle: "Registre os insumos utilizados no plantio.",
    itemTitle: "Sementes utilizadas no plantio",
    itemColumn: "Semente",
    itemPlaceholder: "Selecione uma semente do estoque...",
    emptyMessage: "Nenhuma semente cadastrada no estoque.",
    totalLabel: "Valor total das sementes",
    dateLabel: "Data do plantio",
    historyTitle: "Histórico de sementes e mudas",
    icon: Sprout,
  },
  adubacao: {
    title: "Adubação de base",
    subtitle: "Registre fertilizantes, corretivos, doses e custos.",
    itemTitle: "Fertilizantes utilizados na aplicação",
    itemColumn: "Fertilizante",
    itemPlaceholder: "Selecione um fertilizante do estoque...",
    emptyMessage: "Nenhum insumo compatível com adubação cadastrado no estoque.",
    totalLabel: "Valor total da adubação",
    dateLabel: "Data",
    historyTitle: "Histórico de adubação de base",
    icon: Wheat,
  },
  fertirrigacao: {
    title: "Fertirrigação",
    subtitle: "Registre adubos aplicados via sistema de irrigação.",
    itemTitle: "Insumos utilizados na fertirrigação",
    itemColumn: "Insumo",
    itemPlaceholder: "Selecione um insumo do estoque...",
    emptyMessage: "Nenhum insumo compatível com fertirrigação cadastrado no estoque.",
    totalLabel: "Valor total da fertirrigação",
    dateLabel: "Data",
    historyTitle: "Histórico de fertirrigação",
    icon: Droplets,
  },
  defensivos: {
    title: "Foliares / Defensivos",
    subtitle: "Registre foliares, defensivos, tipo de produto, equipamentos e custo.",
    itemTitle: "Foliares e defensivos da aplicação",
    itemColumn: "Produto",
    itemPlaceholder: "Selecione um foliar ou defensivo do estoque...",
    emptyMessage: "Nenhum foliar ou defensivo cadastrado no estoque.",
    totalLabel: "Valor total da aplicação",
    dateLabel: "Data",
    historyTitle: "Histórico de foliares / defensivos",
    icon: ShieldCheck,
  },
  irrigacao: {
    title: "Irrigação",
    subtitle: "Registre manejo de irrigação, bomba, consumo de água e energia.",
    historyTitle: "Histórico de irrigação",
    icon: Droplets,
  },
} satisfies Record<OperationKind, Record<string, unknown>>;

const configTranslationKeys = {
  plantio: {
    title: "plantations.operation.seeds.title",
    subtitle: "plantations.operation.seeds.subtitle",
    itemTitle: "plantations.operation.seeds.items",
    itemColumn: "plantations.operation.seeds.column",
    itemPlaceholder: "plantations.operation.seeds.placeholder",
    emptyMessage: "plantations.operation.seeds.empty",
    totalLabel: "plantations.operation.seeds.total",
    dateLabel: "plantations.operation.plantingDate",
    historyTitle: "plantations.operation.seeds.history",
  },
  adubacao: {
    title: "plantations.operation.fertilization.title",
    subtitle: "plantations.operation.fertilization.subtitle",
    itemTitle: "plantations.operation.fertilization.items",
    itemColumn: "plantations.operation.fertilization.column",
    itemPlaceholder: "plantations.operation.fertilization.placeholder",
    emptyMessage: "plantations.operation.fertilization.empty",
    totalLabel: "plantations.operation.fertilization.total",
    dateLabel: "plantations.operation.date",
    historyTitle: "plantations.operation.fertilization.history",
  },
  fertirrigacao: {
    title: "plantations.operation.fertigation.title",
    subtitle: "plantations.operation.fertigation.subtitle",
    itemTitle: "plantations.operation.fertigation.items",
    itemColumn: "plantations.operation.fertigation.column",
    itemPlaceholder: "plantations.operation.fertigation.placeholder",
    emptyMessage: "plantations.operation.fertigation.empty",
    totalLabel: "plantations.operation.fertigation.total",
    dateLabel: "plantations.operation.date",
    historyTitle: "plantations.operation.fertigation.history",
  },
  defensivos: {
    title: "plantations.operation.pesticide.title",
    subtitle: "plantations.operation.pesticide.subtitle",
    itemTitle: "plantations.operation.pesticide.items",
    itemColumn: "plantations.operation.pesticide.column",
    itemPlaceholder: "plantations.operation.pesticide.placeholder",
    emptyMessage: "plantations.operation.pesticide.empty",
    totalLabel: "plantations.operation.pesticide.total",
    dateLabel: "plantations.operation.date",
    historyTitle: "plantations.operation.pesticide.history",
  },
  irrigacao: {
    title: "plantations.operation.irrigation.title",
    subtitle: "plantations.operation.irrigation.subtitle",
    historyTitle: "plantations.operation.irrigation.history",
  },
} as const;

const emptyLine = (kind: OperationKind): ApplicationLine => ({
  item: "",
  lot: "",
  pesticide_type: kind === "defensivos" ? "insecticide" : undefined,
  quantity: "",
  unit: "",
  unit_price: "",
  total_price: "",
});

const extractArray = <T,>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

const formatDate = (value: string | null | undefined, language: string) => {
  if (!value) return "-";
  return new Date(`${value}T12:00:00`).toLocaleDateString(language);
};

const numericValue = (value?: string | number | null) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const trimmed = String(value).trim();
  if (!trimmed) return 0;

  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");
  const normalized = hasComma
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : hasDot && /^\d{1,3}(\.\d{3}){2,}$/.test(trimmed)
      ? trimmed.replace(/\./g, "")
      : trimmed;
  const parsed = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmt = (value: string | number | null | undefined, language: string, decimals = 2) => {
  if (value === null || value === undefined || value === "") return "-";
  const number = numericValue(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString(language, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const money = (value: string | number | null | undefined, language: string) => {
  if (value === null || value === undefined || value === "") return "R$ 0,00";
  const number = numericValue(value);
  if (!Number.isFinite(number)) return "R$ 0,00";
  return number.toLocaleString(language, { style: "currency", currency: "BRL" });
};

const cvToKw = (cv: string | number) => numericValue(cv) * 0.7355;

const calculateInclusiveDays = (startDate: string, endDate: string) => {
  if (!startDate) return 1;
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate || startDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  return Math.max(Math.floor((end.getTime() - start.getTime()) / 86400000) + 1, 1);
};

const calculateLineTotal = (quantity: string, unitPrice: string) => {
  const q = numericValue(quantity);
  const p = numericValue(unitPrice);
  return q && p ? (q * p).toFixed(2) : "";
};

const stringifyApiError = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(stringifyApiError).filter(Boolean).join("; ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => {
        const message = stringifyApiError(entry);
        return message ? `${key}: ${message}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return String(value);
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    const apiMessage = stringifyApiError(response?.data);
    if (apiMessage) return apiMessage;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Erro ao salvar o lançamento. Verifique os dados informados.";
};

export function CropOperationPage({ kind }: { kind: OperationKind }) {
  const { language, t } = useOrganizationLocale();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const config = Object.fromEntries(
    Object.entries(configTranslationKeys[kind]).map(([field, key]) => [field, t(key)])
  ) as Record<string, unknown>;
  config.icon = configByKind[kind].icon;
  const Icon = config.icon as typeof Sprout;
  const isIrrigation = kind === "irrigacao";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plantation, setPlantation] = useState<Plantation | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<ApplicationRecord[]>([]);
  const [irrigationHistory, setIrrigationHistory] = useState<IrrigationRecord[]>([]);
  const [lines, setLines] = useState<ApplicationLine[]>([emptyLine(kind)]);
  const [form, setForm] = useState({ date: "", operator: "", notes: "" });
  const [equipments, setEquipments] = useState([{ equipment: "", quantity: "", unit_price: "", total_price: "" }]);
  const [pumpModalOpen, setPumpModalOpen] = useState(false);
  const [pumps, setPumps] = useState<IrrigationPump[]>([]);
  const [pumpForm, setPumpForm] = useState({ name: "", power_cv: "", flow_rate_l_per_h: "" });
  const [savingPump, setSavingPump] = useState(false);
  const [irrigationForm, setIrrigationForm] = useState({
    start_date: "",
    end_date: "",
    irrigation_system: "",
    pump_equipment: "",
    hours_per_day: "",
    kwh_value: "",
    operator: "",
    notes: "",
  });

  // ── Edit / Delete states ────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<ApplicationRecord | IrrigationRecord | null>(null);
  const [editForm, setEditForm] = useState({ date: "", operator: "", notes: "", quantity: "", unit_price: "" });
  const [editSaving, setEditSaving] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (kind === "plantio") {
      const { data } = await cropService.listPlantings({ plantation: id });
      setHistory(extractArray<ApplicationRecord>(data));
    } else if (kind === "adubacao") {
      const { data } = await cropService.listFertilizations({ plantation: id });
      setHistory(extractArray<ApplicationRecord>(data));
    } else if (kind === "fertirrigacao") {
      const { data } = await cropService.listFertigations({ plantation: id });
      setHistory(extractArray<ApplicationRecord>(data));
    } else if (kind === "defensivos") {
      const { data } = await cropService.listPesticideApplications({ plantation: id });
      setHistory(extractArray<ApplicationRecord>(data));
    } else {
      const { data } = await cropService.listIrrigations({ plantation: id });
      setIrrigationHistory(extractArray<IrrigationRecord>(data));
    }
  }, [id, kind]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const requests: Promise<unknown>[] = [
          cropService.get(id),
          isIrrigation ? cropService.listIrrigationPumps() : apiClient.get("/inventory/items/all_items/"),
        ];

        const [plantationRes, secondaryRes] = await Promise.all(requests);
        setPlantation((plantationRes as { data: Plantation }).data);

        if (isIrrigation) {
          setPumps(extractArray<IrrigationPump>((secondaryRes as { data: unknown }).data));
        } else {
          const data = (secondaryRes as { data: unknown }).data;
          setInventoryItems(Array.isArray(data) ? data as InventoryItem[] : []);
        }

        await fetchHistory();
      } catch (error) {
        console.error("Erro ao carregar atalho da plantacao", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchHistory, id, isIrrigation, kind]);

  const filteredItems = useMemo(() => {
    return inventoryItems.filter((item) => isItemCompatibleWithOperation(item, kind));
  }, [inventoryItems, kind]);

  const selectedPump = pumps.find((pump) => pump.id === irrigationForm.pump_equipment);
  const irrigationDays = calculateInclusiveDays(irrigationForm.start_date, irrigationForm.end_date);
  const irrigationHoursTotal = numericValue(irrigationForm.hours_per_day) * irrigationDays;
  const irrigationEnergyKwh = numericValue(selectedPump?.power_kw) * irrigationHoursTotal;
  const irrigationEnergyCost = irrigationEnergyKwh * numericValue(irrigationForm.kwh_value);
  const irrigationWaterLiters = numericValue(selectedPump?.flow_rate_l_per_h) * irrigationHoursTotal;

  const getStockLot = async (itemId: string) => {
    const { data: lots } = await apiClient.get<{ id: string; custo_unitario?: string | null; custo_unitário?: string | null; quantidade_atual: string }[]>(`/inventory/items/${itemId}/lots/`);
    const availableLots = lots.filter((lot) => numericValue(lot.quantidade_atual) > 0);
    const lotCost = (lot: { custo_unitario?: string | null; custo_unitário?: string | null }) => lot.custo_unitario ?? lot.custo_unitário;
    const activeLot = availableLots.find((lot) => numericValue(lotCost(lot)) > 0) || availableLots[0];
    return {
      lot: activeLot?.id || "",
      unitPrice: activeLot ? String(numericValue(lotCost(activeLot))) : "",
    };
  };

  const updateLine = (index: number, patch: Partial<ApplicationLine>) => {
    setLines((prev) => prev.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const next = { ...line, ...patch };
      if ("quantity" in patch || "unit_price" in patch || "unit" in patch || "item" in patch) {
        const q = numericValue(next.quantity);
        const p = numericValue(next.unit_price);
        let multiplier = 1;
        const item = inventoryItems.find((inventoryItem) => inventoryItem.id === next.item);
        if (item) {
          const invUnit = (item.unidade_medida || "").toLowerCase();
          const selectedUnit = (next.unit || "").toLowerCase();
          if (invUnit === "l" && selectedUnit === "ml") multiplier = 0.001;
          else if (invUnit === "ml" && selectedUnit === "l") multiplier = 1000;
          else if (invUnit === "kg" && selectedUnit === "g") multiplier = 0.001;
          else if (invUnit === "g" && selectedUnit === "kg") multiplier = 1000;
          else if (invUnit === "tonelada" && selectedUnit === "kg") multiplier = 0.001;
          else if (invUnit === "kg" && selectedUnit === "tonelada") multiplier = 1000;
        }
        next.total_price = q && p ? (q * p * multiplier).toFixed(2) : "";
      }
      return next;
    }));
  };

  const handleItemChange = async (index: number, itemId: string) => {
    const selectedItem = inventoryItems.find((item) => item.id === itemId);
    if (!selectedItem) {
      updateLine(index, { item: "", lot: "", unit: "", unit_price: "", total_price: "" });
      return;
    }
    try {
      const { lot, unitPrice } = await getStockLot(itemId);
      updateLine(index, { item: itemId, lot, unit: selectedItem.unidade_medida || "", unit_price: unitPrice });
    } catch {
      updateLine(index, { item: itemId, lot: "", unit: selectedItem.unidade_medida || "" });
    }
  };

  const handleSaveApplications = async (conclude: boolean) => {
    const validLines = lines.filter((line) => line.item && line.quantity);
    if (!plantation || validLines.length === 0 || !form.date) return;

    try {
      setSaving(true);
      if (kind === "defensivos") {
        const validEquipments = equipments.filter((equipment) => equipment.equipment.trim());
        await cropService.bulkCreatePesticideApplications({
          applications: validLines.map((line, lineIndex) => ({
            plantation: plantation.id,
            item: line.item,
            lot: line.lot || null,
            quantity: line.quantity,
            unit: line.unit,
            unit_price: line.unit_price || null,
            total_price: line.total_price || calculateLineTotal(line.quantity, line.unit_price) || "0",
            operator: form.operator,
            notes: form.notes,
            pesticide_type: line.pesticide_type || "other",
            application_date: form.date,
            // O equipamento pertence à aplicação inteira, não a cada insumo.
            equipments: lineIndex === 0 ? validEquipments.map((equipment) => ({
              equipment: equipment.equipment.trim(),
              quantity: equipment.quantity ? numericValue(equipment.quantity) : null,
              unit_price: equipment.unit_price ? numericValue(equipment.unit_price) : null,
              total_price: equipment.total_price ? numericValue(equipment.total_price) : null,
            })) : [],
          })),
        });
      } else {
        for (const line of validLines) {
          const basePayload = {
            plantation: plantation.id,
            item: line.item,
            lot: line.lot || null,
            quantity: line.quantity,
            unit: line.unit,
            unit_price: line.unit_price || null,
            total_price: line.total_price || calculateLineTotal(line.quantity, line.unit_price) || "0",
            operator: form.operator,
            notes: form.notes,
          };

          if (kind === "plantio") {
            await cropService.createPlanting({ ...basePayload, planting_date: form.date });
            continue;
          }
          if (kind === "adubacao") {
            await cropService.createFertilization({ ...basePayload, application_date: form.date });
            continue;
          }
          if (kind === "fertirrigacao") {
            await cropService.createFertigation({ ...basePayload, application_date: form.date });
            continue;
          }
        }
      }

      if (conclude) {
        router.push(`/home/plantacoes/${id}`);
        return;
      }

      await fetchHistory();
      setLines([emptyLine(kind)]);
      setForm({ date: "", operator: "", notes: "" });
      setEquipments([{ equipment: "", quantity: "", unit_price: "", total_price: "" }]);
    } catch (error) {
      console.error("Erro ao salvar lançamento", error);
      alert(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveIrrigation = async (conclude: boolean) => {
    if (!plantation || !irrigationForm.start_date || !irrigationForm.pump_equipment) return;

    try {
      setSaving(true);
      await cropService.createIrrigation({
        plantation: plantation.id,
        start_date: irrigationForm.start_date,
        end_date: irrigationForm.end_date || irrigationForm.start_date,
        irrigation_system: irrigationForm.irrigation_system,
        pump_equipment: irrigationForm.pump_equipment,
        hours_per_day: irrigationForm.hours_per_day || null,
        kwh_value: irrigationForm.kwh_value || null,
        operator: irrigationForm.operator,
        notes: irrigationForm.notes,
      });

      if (conclude) {
        router.push(`/home/plantacoes/${id}`);
        return;
      }

      await fetchHistory();
      setIrrigationForm({ start_date: "", end_date: "", irrigation_system: "", pump_equipment: "", hours_per_day: "", kwh_value: "", operator: "", notes: "" });
    } catch (error) {
      console.error("Erro ao salvar irrigação", error);
      alert(t("plantations.operation.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePump = async () => {
    if (!pumpForm.name || !pumpForm.power_cv || !pumpForm.flow_rate_l_per_h) return;
    try {
      setSavingPump(true);
      const { data } = await cropService.createIrrigationPump({
        name: pumpForm.name,
        power_cv: pumpForm.power_cv,
        flow_rate_l_per_h: pumpForm.flow_rate_l_per_h,
      });
      setPumps((prev) => [...prev, data]);
      setIrrigationForm((prev) => ({ ...prev, pump_equipment: data.id }));
      setPumpForm({ name: "", power_cv: "", flow_rate_l_per_h: "" });
      setPumpModalOpen(false);
    } catch (error) {
      console.error("Erro ao cadastrar bomba", error);
    } finally {
      setSavingPump(false);
    }
  };

  // ── Delete handler ──────────────────────────────────────────────────────
  const handleDelete = async (recordId: string) => {
    if (!confirm("Tem certeza que deseja remover este registro?")) return;
    try {
      setDeletingId(recordId);
      if (isIrrigation) {
        await cropService.deleteIrrigation(recordId);
        setIrrigationHistory((prev) => prev.filter((r) => r.id !== recordId));
      } else {
        if (kind === "plantio") await cropService.deletePlanting(recordId);
        else if (kind === "adubacao") await cropService.deleteFertilization(recordId);
        else if (kind === "fertirrigacao") await cropService.deleteFertigation(recordId);
        else if (kind === "defensivos") await cropService.deletePesticideApplication(recordId);
        setHistory((prev) => prev.filter((r) => r.id !== recordId));
      }
    } catch (err) {
      console.error("Erro ao remover registro", err);
      alert(t("plantations.operation.errorDelete"));
    } finally {
      setDeletingId(null);
    }
  };

  // ── Edit handlers ───────────────────────────────────────────────────────
  const openEdit = (record: ApplicationRecord | IrrigationRecord) => {
    setEditingRecord(record);
    if (isIrrigation) {
      const r = record as IrrigationRecord;
      setEditForm({
        date: r.start_date ?? r.date ?? "",
        operator: r.operator ?? "",
        notes: "",
        quantity: r.hours_per_day != null ? String(r.hours_per_day) : "",
        unit_price: "",
      });
    } else {
      const r = record as ApplicationRecord;
      setEditForm({
        date: kind === "plantio" ? (r.planting_date ?? "") : (r.application_date ?? ""),
        operator: r.operator ?? "",
        notes: r.notes ?? "",
        quantity: r.quantity != null ? String(r.quantity) : "",
        unit_price: r.unit_price != null ? String(r.unit_price) : "",
      });
    }
  };

  const closeEdit = () => setEditingRecord(null);

  const handleEditSubmit = async () => {
    if (!editingRecord || editSaving) return;
    try {
      setEditSaving(true);
      const basePayload = { operator: editForm.operator, notes: editForm.notes };
      if (isIrrigation) {
        await cropService.updateIrrigation(editingRecord.id, {
          ...basePayload,
          start_date: editForm.date,
          hours_per_day: editForm.quantity || null,
        });
        await fetchHistory();
      } else {
        const dateField = kind === "plantio" ? { planting_date: editForm.date } : { application_date: editForm.date };
        const payload = { ...basePayload, ...dateField };
        if (kind === "plantio") await cropService.updatePlanting(editingRecord.id, payload);
        else if (kind === "adubacao") await cropService.updateFertilization(editingRecord.id, payload);
        else if (kind === "fertirrigacao") await cropService.updateFertigation(editingRecord.id, payload);
        else if (kind === "defensivos") await cropService.updatePesticideApplication(editingRecord.id, payload);
        await fetchHistory();
      }
      closeEdit();
    } catch (err) {
      console.error("Erro ao editar registro", err);
      alert(t("plantations.operation.errorEdit"));
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <Skeleton height="50px" width="300px" className="mb-4" />
        <Skeleton height="260px" className="mb-4" />
        <Skeleton height="320px" />
      </div>
    );
  }

  if (!plantation) {
    return <div className="p-4 text-muted">{t("plantations.notFound")}</div>;
  }

  return (
    <div className="position-relative overflow-hidden" style={{ minHeight: "100vh" }}>
      <div className="mb-3 d-flex align-items-center gap-2 text-muted small fw-medium">
        <span style={{ cursor: "pointer" }} onClick={() => router.push(`/home/plantacoes/${id}`)} className="hover-text-primary">
          {plantation.name || plantation.crop_name}
        </span>
        <span>›</span>
        <span>{plantation.field_name || "Talhão"}</span>
        <span>›</span>
        <span className="text-primary fw-semibold">{config.title as string}</span>
      </div>

      <div className="d-flex align-items-center gap-3 mb-4">

        <div>
          <h1 className="fw-black mb-1 text-foreground d-flex align-items-center gap-2" style={{ fontSize: "1.75rem" }}>
            <Icon size={28} className="text-primary" /> {config.title as string}
          </h1>
          <p className="text-muted-foreground small mb-0">{config.subtitle as string}</p>
        </div>
      </div>

      <div className="dashboard-card p-4 mb-4">
        {isIrrigation ? (
          <IrrigationForm
            form={irrigationForm}
            setForm={setIrrigationForm}
            pumps={pumps}
            selectedPump={selectedPump}
            onOpenPumpModal={() => setPumpModalOpen(true)}
            days={irrigationDays}
            hoursTotal={irrigationHoursTotal}
            energyKwh={irrigationEnergyKwh}
            energyCost={irrigationEnergyCost}
            waterLiters={irrigationWaterLiters}
          />
        ) : (
          <ApplicationForm
            kind={kind}
            config={config}
            lines={lines}
            items={filteredItems}
            form={form}
            equipments={equipments}
            setForm={setForm}
            setLines={setLines}
            updateLine={updateLine}
            handleItemChange={handleItemChange}
            setEquipments={setEquipments}
          />
        )}

        <div className="d-flex justify-content-between align-items-center mt-4 pt-3 border-top gap-3 flex-wrap">
          <Button variant="outline-secondary" onClick={() => router.back()} style={{ borderRadius: 10 }}>
            {t("plantations.cancel")}
          </Button>
          <div className="d-flex gap-2">
            <Button variant="outline-primary" disabled={saving} onClick={() => isIrrigation ? handleSaveIrrigation(false) : handleSaveApplications(false)} style={{ borderRadius: 10 }}>
              <Save size={16} />
              {saving ? t("plantations.saving") : t("plantations.save")}
            </Button>
            <Button disabled={saving} onClick={() => isIrrigation ? handleSaveIrrigation(true) : handleSaveApplications(true)} style={{ borderRadius: 10 }}>
              {saving ? t("plantations.saving") : t("plantations.saveAndFinish")}
            </Button>
          </div>
        </div>
      </div>

      <div className="dashboard-card p-4 mb-4">
        <h2 className="fw-black text-foreground mb-3" style={{ fontSize: "1.05rem" }}>
          {config.historyTitle as string}
        </h2>
        {isIrrigation
          ? <IrrigationHistory records={irrigationHistory} deletingId={deletingId} onDelete={handleDelete} onEdit={openEdit} />
          : <ApplicationHistory kind={kind} records={history} deletingId={deletingId} onDelete={handleDelete} onEdit={openEdit} />}
      </div>

      {/* Edit Modal */}
      {editingRecord && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1050, backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
        >
          <div
            className="bg-white rounded-4 shadow-lg p-4"
            style={{ width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="d-flex align-items-center justify-content-between mb-4">
              <h5 className="fw-black mb-0 d-flex align-items-center gap-2" style={{ fontSize: "1.05rem" }}>
                <Pencil size={17} className="text-primary" />
                {t("plantations.operation.editRecord")}
              </h5>
              <button type="button" className="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center" style={{ width: 32, height: 32, borderRadius: 8, padding: 0 }} onClick={closeEdit}>
                <X size={16} />
              </button>
            </div>

            {/* Data */}
            <div className="mb-3">
              <label className="form-label fw-semibold small mb-1">
                {isIrrigation ? t("plantations.operation.initialDate") : (kind === "plantio" ? t("plantations.operation.plantingDate") : t("plantations.operation.date"))}
              </label>
              <input
                type="date"
                className="form-control"
                style={{ borderRadius: 10, height: 40 }}
                value={editForm.date}
                onChange={(e) => setEditForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>

            {/* Operator */}
            <div className="mb-3">
              <label className="form-label fw-semibold small mb-1">{t("plantations.operation.operator")}</label>
              <input
                className="form-control"
                placeholder={t("plantations.operation.operator")}
                style={{ borderRadius: 10, height: 40 }}
                value={editForm.operator}
                onChange={(e) => setEditForm((p) => ({ ...p, operator: e.target.value }))}
              />
            </div>

            {/* Hours / Quantity (irrigation) */}
            {isIrrigation && (
              <div className="mb-3">
                <label className="form-label fw-semibold small mb-1">{t("plantations.operation.hoursPerDay")}</label>
                <input
                  type="number" step="0.1"
                  className="form-control"
                  style={{ borderRadius: 10, height: 40 }}
                  value={editForm.quantity}
                  onChange={(e) => setEditForm((p) => ({ ...p, quantity: e.target.value }))}
                />
              </div>
            )}

            {/* Notes (non-irrigation) */}
            {!isIrrigation && (
              <div className="mb-4">
                <label className="form-label fw-semibold small mb-1">{t("plantations.notes")}</label>
                <textarea
                  className="form-control"
                  rows={3}
                  maxLength={300}
                  style={{ borderRadius: 10, resize: "none" }}
                  value={editForm.notes}
                  onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
            )}

            <div className="d-flex gap-2 justify-content-end mt-3">
              <button type="button" className="btn btn-outline-secondary" style={{ borderRadius: 10 }} onClick={closeEdit} disabled={editSaving}>
                {t("plantations.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary d-flex align-items-center gap-2"
                style={{ borderRadius: 10 }}
                onClick={handleEditSubmit}
                disabled={editSaving}
              >
                {editSaving
                  ? <><span className="spinner-border spinner-border-sm" style={{ width: 14, height: 14 }} /> {t("plantations.saving")}</>
                  : <><Save size={14} /> {t("plantations.save")}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={pumpModalOpen}
        onClose={() => setPumpModalOpen(false)}
        title={t("plantations.operation.addPump")}
        footer={
          <div className="d-flex gap-2 justify-content-end">
            <Button variant="outline-secondary" onClick={() => setPumpModalOpen(false)}>{t("plantations.cancel")}</Button>
            <Button onClick={handleCreatePump} disabled={savingPump}>{savingPump ? t("plantations.saving") : t("plantations.operation.addPump")}</Button>
          </div>
        }
      >
        <div className="p-4 p-md-5">
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label small fw-medium">{t("plantations.operation.pumpName")} *</label>
              <input className="form-control" value={pumpForm.name} onChange={(event) => setPumpForm({ ...pumpForm, name: event.target.value })} placeholder={`${t("plantations.operation.pumpName")} 01`} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-medium">{t("plantations.operation.power")} *</label>
              <input className="form-control" type="number" step="0.01" value={pumpForm.power_cv} onChange={(event) => setPumpForm({ ...pumpForm, power_cv: event.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-medium">{t("plantations.operation.convertedPower")}</label>
              <div className="form-control bg-light">{fmt(cvToKw(pumpForm.power_cv), language)} kW</div>
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium">{t("plantations.operation.flow")} *</label>
              <input className="form-control" type="number" step="0.01" value={pumpForm.flow_rate_l_per_h} onChange={(event) => setPumpForm({ ...pumpForm, flow_rate_l_per_h: event.target.value })} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ApplicationForm({
  kind,
  config,
  lines,
  items,
  form,
  equipments,
  setForm,
  setLines,
  updateLine,
  handleItemChange,
  setEquipments,
}: {
  kind: OperationKind;
  config: Record<string, unknown>;
  lines: ApplicationLine[];
  items: InventoryItem[];
  form: { date: string; operator: string; notes: string };
  equipments: { equipment: string; quantity: string; unit_price: string; total_price: string }[];
  setForm: (form: { date: string; operator: string; notes: string }) => void;
  setLines: React.Dispatch<React.SetStateAction<ApplicationLine[]>>;
  updateLine: (index: number, patch: Partial<ApplicationLine>) => void;
  handleItemChange: (index: number, itemId: string) => void;
  setEquipments: React.Dispatch<React.SetStateAction<{ equipment: string; quantity: string; unit_price: string; total_price: string }[]>>;
}) {
  const { language, t } = useOrganizationLocale();
  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <strong className="small text-success">{config.itemTitle as string}</strong>
        <Button variant="outline-success" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine(kind)])}>
          <Plus size={16} /> {t("plantations.operation.add")}
        </Button>
      </div>

      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0 agro-table">
          <thead>
            <tr>
              <th>{config.itemColumn as string}</th>
              {kind === "defensivos" && <th style={{ minWidth: 160 }}>{t("plantations.operation.type")}</th>}
              <th style={{ minWidth: 130 }}>{t("plantations.operation.quantity")}</th>
              <th style={{ minWidth: 120 }}>{t("plantations.operation.unit")}</th>
              <th style={{ minWidth: 140 }}>{t("plantations.operation.price")}</th>
              <th style={{ minWidth: 150 }}>{t("plantations.operation.total")}</th>
              <th className="text-center">{t("plantations.operation.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td style={{ minWidth: 260 }}>
                  <select className="form-select" value={line.item} onChange={(event) => handleItemChange(index, event.target.value)}>
                    <option value="">{config.itemPlaceholder as string}</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}{item.estoque_atual ? ` (${item.estoque_atual} ${item.unidade_medida || ""})` : ""}
                      </option>
                    ))}
                  </select>
                </td>
                {kind === "defensivos" && (
                  <td>
                    <select className="form-select" value={line.pesticide_type || "other"} onChange={(event) => updateLine(index, { pesticide_type: event.target.value })}>
                      {pesticideTypeOptions.map((type) => <option key={type.value} value={type.value}>{t(`plantations.pesticide.${type.value}` as "plantations.pesticide.insecticide")}</option>)}
                    </select>
                  </td>
                )}
                <td>
                  <input className="form-control" type="number" step="0.01" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
                </td>
                <td>
                  <select className="form-select" value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value })}>
                    <option value="">{t("plantations.irrigation.select")}</option>
                    {unitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                  </select>
                </td>
                <td>
                  <input className="form-control bg-light" type="number" step="0.01" value={line.unit_price} readOnly title={t("plantations.operation.autoInventoryPrice")} />
                </td>
                <td><div className="form-control bg-success-subtle fw-semibold text-success">{money(line.total_price, language)}</div></td>
                <td className="text-center">
                  <Button variant="outline-danger" size="sm" onClick={() => setLines((prev) => prev.length === 1 ? [emptyLine(kind)] : prev.filter((_, lineIndex) => lineIndex !== index))}>
                    <Trash2 size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 && <small className="text-muted">{config.emptyMessage as string}</small>}

      <div className="d-flex justify-content-between align-items-center rounded border bg-success-subtle px-3 py-2 flex-wrap gap-2">
        <span className="fw-medium">{t("plantations.operation.totalItems")}: {lines.filter((line) => line.item).length}</span>
        <strong className="text-success">{config.totalLabel as string}: {money(lines.reduce((sum, line) => sum + numericValue(line.total_price), 0), language)}</strong>
      </div>

      <div className="row g-3">
        <div className="col-md-6 col-12">
          <label className="form-label small fw-medium">{config.dateLabel as string} *</label>
          <input className="form-control" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
        </div>
        <div className="col-md-6 col-12">
          <label className="form-label small fw-medium">{t("plantations.operation.operator")}</label>
          <input className="form-control" value={form.operator} onChange={(event) => setForm({ ...form, operator: event.target.value })} />
        </div>
        <div className="col-12">
          <label className="form-label small fw-medium">{t("plantations.notes")}</label>
          <textarea className="form-control" rows={3} maxLength={300} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          <div className="text-end text-muted small">{form.notes.length}/300</div>
        </div>
      </div>

      {kind === "defensivos" && (
        <div className="border rounded-3 overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="d-flex align-items-center justify-content-between px-3 py-2 flex-wrap gap-2" style={{ background: "rgba(16, 185, 129, 0.06)", borderBottom: "1px solid var(--border)" }}>
            <strong className="small text-success">{t("plantations.operation.equipment")}</strong>
            <Button variant="outline-success" size="sm" onClick={() => setEquipments((prev) => [...prev, { equipment: "", quantity: "", unit_price: "", total_price: "" }])}>
              <Plus size={16} /> {t("plantations.operation.addEquipment")}
            </Button>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 agro-table">
              <thead>
                <tr>
                  <th>{t("plantations.operation.equipment")}</th>
                  <th style={{ minWidth: 160 }}>{t("plantations.operation.quantity")}</th>
                  <th style={{ minWidth: 160 }}>{t("plantations.operation.unitPrice")}</th>
                  <th style={{ minWidth: 160 }}>{t("plantations.operation.total")}</th>
                  <th className="text-center">{t("plantations.operation.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {equipments.map((equipment, index) => (
                  <tr key={index}>
                    <td style={{ minWidth: 240 }}>
                      <input className="form-control" placeholder={t("plantations.operation.equipment")} value={equipment.equipment} onChange={(event) => setEquipments((prev) => prev.map((item, itemIndex) => itemIndex !== index ? item : { ...item, equipment: event.target.value }))} />
                    </td>
                    <td>
                      <input className="form-control" type="number" step="0.01" value={equipment.quantity} onChange={(event) => {
                        const quantity = event.target.value;
                        setEquipments((prev) => prev.map((item, itemIndex) => itemIndex !== index ? item : { ...item, quantity, total_price: quantity && item.unit_price ? String(numericValue(quantity) * numericValue(item.unit_price)) : "" }));
                      }} />
                    </td>
                    <td>
                      <input className="form-control" type="number" step="0.01" value={equipment.unit_price} onChange={(event) => {
                        const unitPrice = event.target.value;
                        setEquipments((prev) => prev.map((item, itemIndex) => itemIndex !== index ? item : { ...item, unit_price: unitPrice, total_price: unitPrice && item.quantity ? String(numericValue(unitPrice) * numericValue(item.quantity)) : "" }));
                      }} />
                    </td>
                    <td><div className="form-control bg-success-subtle fw-semibold text-success">{money(equipment.total_price, language)}</div></td>
                    <td className="text-center">
                      <Button variant="outline-danger" size="sm" onClick={() => setEquipments((prev) => prev.length === 1 ? [{ equipment: "", quantity: "", unit_price: "", total_price: "" }] : prev.filter((_, itemIndex) => itemIndex !== index))}>
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function IrrigationForm({
  form,
  setForm,
  pumps,
  selectedPump,
  onOpenPumpModal,
  days,
  hoursTotal,
  energyKwh,
  energyCost,
  waterLiters,
}: {
  form: { start_date: string; end_date: string; irrigation_system: string; pump_equipment: string; hours_per_day: string; kwh_value: string; operator: string; notes: string };
  setForm: (form: { start_date: string; end_date: string; irrigation_system: string; pump_equipment: string; hours_per_day: string; kwh_value: string; operator: string; notes: string }) => void;
  pumps: IrrigationPump[];
  selectedPump?: IrrigationPump;
  onOpenPumpModal: () => void;
  days: number;
  hoursTotal: number;
  energyKwh: number;
  energyCost: number;
  waterLiters: number;
}) {
  const { language, t } = useOrganizationLocale();
  return (
    <div className="row g-3">
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">{t("plantations.operation.initialDate")} *</label>
        <input className="form-control" type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value, end_date: form.end_date || event.target.value })} />
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">{t("plantations.operation.endDate")}</label>
        <input className="form-control" type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">{t("plantations.operation.irrigationSystem")}</label>
        <select className="form-select" value={form.irrigation_system} onChange={(event) => setForm({ ...form, irrigation_system: event.target.value })}>
          <option value="">{t("plantations.irrigation.select")}</option>
          {irrigationSystemOptions.map((system) => <option key={system.value} value={system.value}>{t(`plantations.irrigation.${system.value === "center_pivot" ? "centerPivot" : system.value === "micro_sprinkler" ? "microSprinkler" : system.value}` as "plantations.irrigation.other")}</option>)}
        </select>
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">{t("plantations.operation.pumpUsed")} *</label>
        <div className="input-group">
          <select className="form-select" value={form.pump_equipment} onChange={(event) => setForm({ ...form, pump_equipment: event.target.value })}>
            <option value="">{t("plantations.irrigation.select")}</option>
            {pumps.map((pump) => (
              <option key={pump.id} value={pump.id}>{pump.name} - {fmt(pump.power_cv, language)} CV / {fmt(pump.flow_rate_l_per_h, language, 0)} L/h</option>
            ))}
          </select>
          <Button variant="outline-success" onClick={onOpenPumpModal} title={t("plantations.operation.addNewPump")}>
            <Plus size={16} />
          </Button>
        </div>
        {selectedPump && <small className="text-muted">{t("plantations.operation.convertedPower")}: {fmt(selectedPump.power_kw, language)} kW</small>}
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">{t("plantations.operation.hoursPerDay")}</label>
        <input className="form-control" type="number" step="0.1" value={form.hours_per_day} onChange={(event) => setForm({ ...form, hours_per_day: event.target.value })} placeholder="Ex.: 6.5" />
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">{t("plantations.operation.kwhPrice")}</label>
        <input className="form-control" type="number" step="0.0001" value={form.kwh_value} onChange={(event) => setForm({ ...form, kwh_value: event.target.value })} />
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">{t("plantations.operation.operator")}</label>
        <input className="form-control" value={form.operator} onChange={(event) => setForm({ ...form, operator: event.target.value })} />
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">{t("plantations.notes")}</label>
        <textarea className="form-control" rows={2} maxLength={300} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </div>
      <div className="col-12">
        <div className="rounded border bg-success-subtle p-3">
          <div className="row g-3 small">
            <div className="col-6 col-md-3"><span className="text-muted d-block">{t("plantations.operation.daysInPeriod")}</span><strong>{days}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted d-block">{t("plantations.operation.totalHours")}</span><strong>{fmt(hoursTotal, language)} h</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted d-block">{t("plantations.operation.energy")}</span><strong>{fmt(energyKwh, language)} kWh</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted d-block">{t("plantations.operation.energyCost")}</span><strong>{money(energyCost, language)}</strong></div>
            <div className="col-12"><span className="text-muted d-block">{t("plantations.operation.totalWater")}</span><strong>{fmt(waterLiters, language, 0)} L</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApplicationHistory({
  kind,
  records,
  deletingId,
  onDelete,
  onEdit,
}: {
  kind: OperationKind;
  records: ApplicationRecord[];
  deletingId: string | null;
  onDelete: (id: string) => void;
  onEdit: (record: ApplicationRecord) => void;
}) {
  const { language, t } = useOrganizationLocale();
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0 agro-table">
        <thead>
          <tr>
            <th>{t("plantations.operation.date")}</th>
            <th>{t("plantations.operation.supply")}</th>
            {kind === "defensivos" && <th>{t("plantations.operation.type")}</th>}
            <th>{t("plantations.operation.quantity")}</th>
            <th>{t("plantations.operation.price")}</th>
            {kind === "defensivos" && <th>{t("plantations.operation.equipment")}</th>}
            <th>{t("plantations.operation.total")}</th>
            <th>{t("plantations.operation.operator")}</th>
            <th>{t("plantations.notes")}</th>
            <th className="text-center" style={{ width: 90 }}>{t("plantations.operation.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={kind === "defensivos" ? 9 : 8} className="text-center text-muted-foreground py-4">
                {t("plantations.operation.noRecords")}
              </td>
            </tr>
          ) : (
            <>
              {records.map((record) => {
                const baseTotal = numericValue(record.total_price);
                const eqTotal = (record.equipments || []).reduce((acc, eq) => acc + numericValue(eq.total_price), 0);
                const finalTotal = baseTotal + eqTotal;
                
                return (
                <tr key={record.id}>
                  <td>{formatDate(kind === "plantio" ? record.planting_date : record.application_date, language)}</td>
                  <td>{record.item_name || "-"}</td>
                  {kind === "defensivos" && <td>{record.pesticide_type_display || "-"}</td>}
                  <td>{fmt(record.quantity, language)} {record.unit || ""}</td>
                  <td>{money(record.unit_price, language)}</td>
                  {kind === "defensivos" && (
                    <td>
                      {record.equipments && record.equipments.length > 0 ? (
                        <div className="d-flex flex-column gap-1">
                          {record.equipments.map((eq, i) => (
                            <span key={i} className="small text-muted text-nowrap" title={eq.equipment}>
                              {eq.equipment.length > 15 ? eq.equipment.substring(0, 15) + "..." : eq.equipment} ({money(eq.total_price, language)})
                            </span>
                          ))}
                        </div>
                      ) : "-"}
                    </td>
                  )}
                  <td className="fw-bold">{money(finalTotal, language)}</td>
                  <td>{record.operator || "-"}</td>
                  <td className="text-muted-foreground small">{record.notes || "-"}</td>
                  <td className="text-center">
                    <div className="d-flex gap-1 justify-content-center">
                      <button
                        type="button"
                        title={t("plantations.edit")}
                        aria-label={t("plantations.edit")}
                        className="btn btn-sm d-flex align-items-center justify-content-center"
                        style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid var(--bs-primary)", color: "var(--bs-primary)", backgroundColor: "transparent", padding: 0 }}
                        onClick={() => onEdit(record)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        title={t("plantations.operation.removeRecord")}
                        aria-label={t("plantations.operation.removeRecord")}
                        className="btn btn-sm d-flex align-items-center justify-content-center"
                        style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid var(--bs-danger)", color: "var(--bs-danger)", backgroundColor: "transparent", padding: 0, opacity: deletingId === record.id ? 0.5 : 1 }}
                        disabled={deletingId === record.id}
                        onClick={() => onDelete(record.id)}
                      >
                        {deletingId === record.id
                          ? <span className="spinner-border spinner-border-sm" style={{ width: 11, height: 11 }} />
                          : <Trash2 size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
              <tr className="table-light">
                <td colSpan={kind === "defensivos" ? 6 : 4} className="text-end fw-bold">{t("plantations.structure.total")}:</td>
                <td className="fw-black text-primary" style={{ fontSize: "1.05rem" }}>
                  {money(records.reduce((acc, r) => acc + numericValue(r.total_price) + (r.equipments || []).reduce((sum, e) => sum + numericValue(e.total_price), 0), 0), language)}
                </td>
                <td colSpan={3}></td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function IrrigationHistory({
  records,
  deletingId,
  onDelete,
  onEdit,
}: {
  records: IrrigationRecord[];
  deletingId: string | null;
  onDelete: (id: string) => void;
  onEdit: (record: IrrigationRecord) => void;
}) {
  const { language, t } = useOrganizationLocale();
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0 agro-table">
        <thead>
          <tr>
            <th>{t("plantations.operation.period")}</th>
            <th>{t("plantations.operation.system")}</th>
            <th>{t("plantations.operation.pump")}</th>
            <th>{t("plantations.operation.days")}</th>
            <th>{t("plantations.operation.hours")}</th>
            <th>{t("plantations.operation.water")}</th>
            <th>{t("plantations.operation.energy")}</th>
            <th>{t("plantations.operation.cost")}</th>
            <th>{t("plantations.operation.operator")}</th>
            <th className="text-center" style={{ width: 90 }}>{t("plantations.operation.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={10} className="text-center text-muted-foreground py-4">
                {t("plantations.operation.noIrrigation")}
              </td>
            </tr>
          ) : (
            <>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{formatDate(record.start_date || record.date, language)}{record.end_date ? ` - ${formatDate(record.end_date, language)}` : ""}</td>
                  <td>{record.irrigation_system_display || "-"}</td>
                  <td>{record.pump_name || "-"}</td>
                  <td>{record.operating_days || "-"}</td>
                  <td>{fmt(record.hours || record.hours_per_day, language)} h</td>
                  <td>{fmt(record.liters_used, language, 0)} L</td>
                  <td>{fmt(record.energy_kwh, language)} kWh</td>
                  <td className="fw-bold">{money(record.energy_cost, language)}</td>
                  <td>{record.operator || "-"}</td>
                  <td className="text-center">
                    <div className="d-flex gap-1 justify-content-center">
                      <button
                        type="button"
                        title={t("plantations.edit")}
                        aria-label={t("plantations.edit")}
                        className="btn btn-sm d-flex align-items-center justify-content-center"
                        style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid var(--bs-primary)", color: "var(--bs-primary)", backgroundColor: "transparent", padding: 0 }}
                        onClick={() => onEdit(record)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        title={t("plantations.operation.removeRecord")}
                        aria-label={t("plantations.operation.removeRecord")}
                        className="btn btn-sm d-flex align-items-center justify-content-center"
                        style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid var(--bs-danger)", color: "var(--bs-danger)", backgroundColor: "transparent", padding: 0, opacity: deletingId === record.id ? 0.5 : 1 }}
                        disabled={deletingId === record.id}
                        onClick={() => onDelete(record.id)}
                      >
                        {deletingId === record.id
                          ? <span className="spinner-border spinner-border-sm" style={{ width: 11, height: 11 }} />
                          : <Trash2 size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="table-light">
                <td colSpan={7} className="text-end fw-bold">Custo Total:</td>
                <td className="fw-black text-primary" style={{ fontSize: "1.05rem" }}>
                  {money(records.reduce((acc, record) => acc + numericValue(record.energy_cost), 0), language)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
