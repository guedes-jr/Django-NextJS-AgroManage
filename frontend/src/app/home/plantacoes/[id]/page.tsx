"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Calendar, DollarSign, Ruler, Clock, Edit3, Trash2, Sprout, Warehouse, Target, CheckCircle2, ArrowRight, CircleDashed, Waves, Plus, ClipboardList } from "lucide-react";
import { cropService } from "@/services/cropService";
import apiClient from "@/services/api";
import type { Plantation, PlantationDashboard, PlantationStatus } from "@/types";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";

type PlantationDetail = Plantation & PlantationDashboard;
type PlantingOperation = {
  id: string;
  planting_date?: string | null;
  item_name?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  total_price?: string | null;
  operator?: string | null;
};
type ApplicationOperation = {
  id: string;
  application_date?: string | null;
  item_name?: string | null;
  pesticide_type_display?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  total_price?: string | null;
  operator?: string | null;
};
type IrrigationOperation = {
  id: string;
  date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  irrigation_system_display?: string | null;
  pump_name?: string | null;
  operating_days?: number | null;
  hours_per_day?: string | number | null;
  hours?: string | number | null;
  flow_rate_l_per_h?: string | number | null;
  liters_used?: string | number | null;
  energy_kwh?: string | number | null;
  energy_cost?: string | null;
};
type IrrigationPump = {
  id: string;
  name: string;
  power_cv: string | number;
  power_kw: string | number;
  flow_rate_l_per_h: string | number;
};
type LandPreparationOperation = {
  id: string;
  date?: string | null;
  operation_type_display?: string | null;
  hours_worked?: string | number | null;
  total_price?: string | number | null;
  total_amount?: string | number | null;
};
type LaborOperation = {
  id: string;
  activity_date?: string | null;
  activity_type_display?: string | null;
  worker?: { name?: string | null } | null;
  worker_name?: string | null;
  total_amount?: string | number | null;
};
type HarvestOperation = {
  id: string;
  yield_kg?: string | number | null;
  revenue_amount?: string | number | null;
};
type AgronomistRecommendationProduct = {
  item_name?: string | null;
  dose_per_ha?: string | number | null;
  dose_unit?: string | null;
  total_quantity?: string | number | null;
  total_unit?: string | null;
};
type AgronomistRecommendation = {
  id: string;
  title: string;
  objective?: string | null;
  suggested_application_date?: string | null;
  priority: "low" | "medium" | "high";
  priority_display?: string | null;
  status: "pending" | "in_progress" | "completed";
  status_display?: string | null;
  products?: AgronomistRecommendationProduct[];
};
type InventoryItem = {
  id: string;
  nome: string;
  categoria?: string;
  categoria_display?: string;
  especie_animal: string;
  unidade_medida: string;
  estoque_atual: string;
};
type ApplicationLine = {
  item: string;
  pesticide_type?: string;
  quantity: string;
  unit: string;
  unit_price: string;
  total_price: string;
};

const statusColors: Record<PlantationStatus, string> = {
  planned: "#6b7280",
  planting: "#f59e0b",
  growing: "#10b981",
  management: "#3b82f6",
  harvesting: "#8b5cf6",
  finished: "#059669",
  cancelled: "#ef4444",
};

const statusOptions = [
  { value: "planned", label: "Planejada" },
  { value: "planting", label: "Em plantio" },
  { value: "growing", label: "Em desenvolvimento" },
  { value: "management", label: "Em manejo" },
  { value: "harvesting", label: "Em colheita" },
  { value: "finished", label: "Finalizada" },
  { value: "cancelled", label: "Cancelada" },
];

const recommendationStatusVariant = (status: AgronomistRecommendation["status"]) => {
  if (status === "completed") return { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
  if (status === "in_progress") return { background: "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd" };
  return { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" };
};

const emptyAdubacaoLine: ApplicationLine = { item: "", quantity: "", unit: "", unit_price: "", total_price: "" };
const emptyPlantioLine: ApplicationLine = { item: "", quantity: "", unit: "", unit_price: "", total_price: "" };
const emptyFertirrigacaoLine: ApplicationLine = { item: "", quantity: "", unit: "", unit_price: "", total_price: "" };
const emptyDefensivoLine: ApplicationLine = {
  item: "",
  pesticide_type: "insecticide",
  quantity: "",
  unit: "",
  unit_price: "",
  total_price: "",
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

const irrigationSystemOptions = [
  { value: "center_pivot", label: "Pivô central" },
  { value: "drip", label: "Gotejamento" },
  { value: "sprinkler", label: "Aspersão" },
  { value: "micro_sprinkler", label: "Microaspersão" },
  { value: "hose", label: "Mangueira" },
  { value: "other", label: "Outro" },
];

const cvToKw = (cv: string | number) => {
  const value = Number(cv || 0);
  return value ? value * 0.7355 : 0;
};

const calculateInclusiveDays = (startDate: string, endDate: string) => {
  if (!startDate) return 1;
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${(endDate || startDate)}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  return Math.max(Math.floor((end.getTime() - start.getTime()) / 86400000) + 1, 1);
};

const calculateLineTotal = (quantity: string, unitPrice: string) => {
  const q = parseFloat(quantity || "0");
  const p = parseFloat(unitPrice || "0");
  return q && p ? String(q * p) : "";
};

const shortcutStages = {
  estrutura: { image: "/images/crops/sector-structure.png", color: "oklch(0.62 0.12 70)" },
  preparo: { image: "/images/crops/land-preparation.svg", color: "oklch(0.7 0.18 85)" },
  plantio: { image: "/images/crops/seed.svg", color: "oklch(0.66 0.16 70)" },
  adubacao: { image: "/images/crops/base-fertilization.svg", color: "oklch(0.62 0.17 145)" },
  fertirrigacao: { image: "/images/crops/fertigation.png", color: "oklch(0.6 0.16 220)" },
  foliarDefensivos: { image: "/images/crops/foliar-fertilization.png", color: "oklch(0.58 0.16 145)" },
  defensivos: { image: "/images/crops/pesticides.png", color: "oklch(0.65 0.18 290)" },
  irrigacao: { image: "/images/crops/irrigation.png", color: "oklch(0.62 0.17 190)" },
  agronomo: { image: "/images/crops/agronomist.png", color: "oklch(0.54 0.14 145)" },
  maoObra: { image: "/images/crops/labor.png", color: "oklch(0.54 0.14 145)" },
  relatorio: { image: "/images/crops/applications.png", color: "oklch(0.58 0.16 145)" },
  colheita: { image: "/images/crops/harvest.png", color: "oklch(0.66 0.16 82)" },
};

const cultureVisuals: Record<string, { image: string; color: string }> = {
  milho: { image: "/images/crops/cultures/corn.png", color: "oklch(0.7 0.17 86)" },
  soja: { image: "/images/crops/cultures/soybean.png", color: "oklch(0.56 0.16 145)" },
  feijao: { image: "/images/crops/cultures/bean.png", color: "oklch(0.58 0.13 65)" },
  sorgo: { image: "/images/crops/cultures/sorghum.png", color: "oklch(0.58 0.15 38)" },
  milheto: { image: "/images/crops/cultures/millet.png", color: "oklch(0.6 0.14 112)" },
  melancia: { image: "/images/crops/cultures/watermelon.png", color: "oklch(0.58 0.16 145)" },
};

const normalizeCultureName = (value: string) =>
  value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const cultureVisualKeywords = [
  { keys: ["milho", "corn"], visual: cultureVisuals.milho },
  { keys: ["soja", "soybean"], visual: cultureVisuals.soja },
  { keys: ["feijao", "feijão", "bean"], visual: cultureVisuals.feijao },
  { keys: ["sorgo", "sorghum"], visual: cultureVisuals.sorgo },
  { keys: ["milheto", "millet"], visual: cultureVisuals.milheto },
  { keys: ["melancia", "watermelon"], visual: cultureVisuals.melancia },
];

const getCultureVisual = (cropName?: string, plantationName?: string) => {
  const normalized = normalizeCultureName(`${cropName || ""} ${plantationName || ""}`);
  const matched = cultureVisualKeywords.find((item) =>
    item.keys.some((keyword) => normalized.includes(normalizeCultureName(keyword)))
  );
  return matched?.visual || { image: "/images/crops/seed.png", color: "oklch(0.58 0.16 145)" };
};

function MetricCard({ icon, label, value, variant = "info" }: { icon: React.ReactNode; label: string; value: string; variant?: "info" | "success" | "warning" | "danger" }) {
  return (
    <div className="dashboard-card p-4 h-100">
      <div className="d-flex align-items-center gap-3">
        <div
          className={`rounded-xl d-flex align-items-center justify-content-center flex-shrink-0 bg-${variant}-subtle text-${variant}`}
          style={{
            width: 44,
            height: 44,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-muted-foreground small fw-bold text-uppercase mb-1" style={{ letterSpacing: "0.02em", fontSize: "0.65rem" }}>{label}</div>
          <div className="fw-black text-foreground" style={{ fontSize: "1.25rem" }}>{value}</div>
        </div>
      </div>
    </div>
  );
}

type ShortcutStatus = "completed" | "in_progress" | "pending" | "running";

const shortcutStatusConfig: Record<ShortcutStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  completed: {
    label: "Concluído",
    color: "var(--bs-success)",
    bg: "var(--bs-success-bg-subtle)",
    icon: <CheckCircle2 size={15} />,
  },
  in_progress: {
    label: "Em andamento",
    color: "var(--bs-warning)",
    bg: "var(--bs-warning-bg-subtle)",
    icon: <CircleDashed size={15} />,
  },
  pending: {
    label: "Pendente",
    color: "var(--bs-secondary)",
    bg: "var(--bs-secondary-bg-subtle)",
    icon: <Clock size={15} />,
  },
  running: {
    label: "Em funcionamento",
    color: "var(--bs-primary)",
    bg: "var(--bs-primary-bg-subtle)",
    icon: <Waves size={15} />,
  },
};

function ShortcutCard({ number, image, label, desc, status, onClick }: { number: number; image: string; label: string; desc: string; status: ShortcutStatus; onClick: () => void }) {
  const statusConfig = shortcutStatusConfig[status];

  return (
    <button
      type="button"
      className="dashboard-card p-0 w-100 h-100 text-start border-0 overflow-hidden"
      onClick={onClick}
      style={{ cursor: "pointer", borderRadius: 12, minHeight: 214 }}
    >
      <div className="d-flex flex-column h-100">
        <div
          className="position-relative d-flex align-items-center justify-content-center w-100"
          style={{
            height: 104,
            background: "linear-gradient(180deg, var(--bs-body-bg) 0%, color-mix(in srgb, var(--bs-body-bg), var(--primary) 4%) 100%)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Image src={image} alt="" fill sizes="(max-width: 768px) 100vw, 25vw" style={{ objectFit: "contain", padding: 4 }} />
        </div>
        <div className="d-flex flex-column flex-grow-1 p-2">
          <div className="min-w-0 flex-grow-1">
            <div className="fw-black text-foreground mb-1" style={{ fontSize: "0.9rem" }}>{number}. {label}</div>
            <div className="text-muted-foreground" style={{ fontSize: "0.76rem", lineHeight: 1.3 }}>{desc}</div>
          </div>
          <div className="d-flex align-items-center justify-content-between gap-2 mt-2">
            <span
              className="d-inline-flex align-items-center gap-2 fw-bold"
              style={{
                color: statusConfig.color,
                background: statusConfig.bg,
                border: `1px solid color-mix(in srgb, ${statusConfig.color}, transparent 50%)`,
                borderRadius: 999,
                padding: "6px 8px",
                fontSize: "0.68rem",
              }}
            >
              {statusConfig.icon}
              {statusConfig.label}
            </span>
            <span
              className="d-inline-flex align-items-center justify-content-center flex-shrink-0 bg-body text-primary"
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                border: "1px solid var(--border)",
              }}
            >
              <ArrowRight size={17} />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function PlantacaoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plantation, setPlantation] = useState<PlantationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", crop_name: "", variety: "", planted_area_ha: "",
    planting_date: "", expected_harvest_date: "", actual_harvest_date: "",
    status: "planned" as PlantationStatus, population: "", spacing: "",
  });
  const [saving, setSaving] = useState(false);

  const [plantings, setPlantings] = useState<PlantingOperation[]>([]);
  const [showPlantio, setShowPlantio] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [plantioForm, setPlantioForm] = useState({
    planting_date: "", operator: "", notes: "",
  });
  const [plantioLines, setPlantioLines] = useState<ApplicationLine[]>([{ ...emptyPlantioLine }]);
  const [savingPlantio, setSavingPlantio] = useState(false);

  const [fertilizations, setFertilizations] = useState<ApplicationOperation[]>([]);
  const [showAdubacao, setShowAdubacao] = useState(false);
  const [adubacaoForm, setAdubacaoForm] = useState({ application_date: "", operator: "", notes: "" });
  const [adubacaoLines, setAdubacaoLines] = useState<ApplicationLine[]>([{ ...emptyAdubacaoLine }]);
  const [savingAdubacao, setSavingAdubacao] = useState(false);

  const [fertigations, setFertigations] = useState<ApplicationOperation[]>([]);
  const [showFertirrigacao, setShowFertirrigacao] = useState(false);
  const [fertirrigacaoForm, setFertirrigacaoForm] = useState({ application_date: "", operator: "", notes: "" });
  const [fertirrigacaoLines, setFertirrigacaoLines] = useState<ApplicationLine[]>([{ ...emptyFertirrigacaoLine }]);
  const [savingFertirrigacao, setSavingFertirrigacao] = useState(false);

  const [pesticides, setPesticides] = useState<ApplicationOperation[]>([]);
  const [showDefensivo, setShowDefensivo] = useState(false);
  const [defensivoForm, setDefensivoForm] = useState({ application_date: "", operator: "", notes: "" });
  const [defensivoLines, setDefensivoLines] = useState<ApplicationLine[]>([{ ...emptyDefensivoLine }]);
  const [defensivoEquipments, setDefensivoEquipments] = useState<{ equipment: string; quantity: string; unit_price: string; total_price: string }[]>(
    [{ equipment: "", quantity: "", unit_price: "", total_price: "" }]
  );
  const [savingDefensivo, setSavingDefensivo] = useState(false);

  const [irrigations, setIrrigations] = useState<IrrigationOperation[]>([]);
  const [showIrrigacao, setShowIrrigacao] = useState(false);
  const [showPumpModal, setShowPumpModal] = useState(false);
  const [irrigationPumps, setIrrigationPumps] = useState<IrrigationPump[]>([]);
  const [irrigacaoForm, setIrrigacaoForm] = useState({
    start_date: "", end_date: "", irrigation_system: "",
    pump_equipment: "", hours_per_day: "", kwh_value: "", operator: "",
  });
  const [savingIrrigacao, setSavingIrrigacao] = useState(false);
  const [pumpForm, setPumpForm] = useState({ name: "", power_cv: "", flow_rate_l_per_h: "" });
  const [savingPump, setSavingPump] = useState(false);

  const [landPreparations, setLandPreparations] = useState<LandPreparationOperation[]>([]);
  const [laborRecords, setLaborRecords] = useState<LaborOperation[]>([]);
  const [harvests, setHarvests] = useState<HarvestOperation[]>([]);
  const [agronomistRecommendations, setAgronomistRecommendations] = useState<AgronomistRecommendation[]>([]);
  const [completingRecommendationId, setCompletingRecommendationId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const [detailRes, dashboardRes] = await Promise.all([
          cropService.get(id),
          cropService.dashboard(id),
        ]);
        const merged = { ...detailRes.data, ...dashboardRes.data };
        setPlantation(merged);
        setEditForm({
          name: merged.name || "",
          crop_name: merged.crop_name || "",
          variety: merged.variety || "",
          planted_area_ha: merged.planted_area_ha || "",
          planting_date: merged.planting_date || "",
          expected_harvest_date: merged.expected_harvest_date || "",
          actual_harvest_date: merged.actual_harvest_date || "",
          status: merged.status || "planned",
          population: merged.population || "",
          spacing: merged.spacing || "",
        });
        const [plantingsRes, fertsRes, fertigsRes, pestsRes, irrigsRes, itemsRes, pumpsRes, landPrepRes, laborRes, harvestRes, recommendationRes] = await Promise.all([
          cropService.listPlantings({ plantation: id }).catch(() => ({ data: { results: [] } })),
          cropService.listFertilizations({ plantation: id }).catch(() => ({ data: { results: [] } })),
          cropService.listFertigations({ plantation: id }).catch(() => ({ data: { results: [] } })),
          cropService.listPesticideApplications({ plantation: id }).catch(() => ({ data: { results: [] } })),
          cropService.listIrrigations({ plantation: id }).catch(() => ({ data: { results: [] } })),
          apiClient.get("/inventory/items/all_items/").catch(() => ({ data: [] })),
          cropService.listIrrigationPumps().catch(() => ({ data: { results: [] } })),
          cropService.listLandPreparations({ plantation: id }).catch(() => ({ data: { results: [] } })),
          cropService.listLaborRecords({ plantation: id }).catch(() => ({ data: { results: [] } })),
          cropService.listHarvests({ planting_cycle: id }).catch(() => ({ data: { results: [] } })),
          cropService.listAgronomistRecommendations({ plantation: id }).catch(() => ({ data: { results: [] } })),
        ]);
        setPlantings(Array.isArray(plantingsRes.data?.results) ? plantingsRes.data.results : []);
        setFertilizations(Array.isArray(fertsRes.data?.results) ? fertsRes.data.results : []);
        setFertigations(Array.isArray(fertigsRes.data?.results) ? fertigsRes.data.results : []);
        setPesticides(Array.isArray(pestsRes.data?.results) ? pestsRes.data.results : []);
        setIrrigations(Array.isArray(irrigsRes.data?.results) ? irrigsRes.data.results : []);
        setInventoryItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
        setIrrigationPumps(Array.isArray(pumpsRes.data?.results) ? pumpsRes.data.results : []);
        setLandPreparations(Array.isArray(landPrepRes.data?.results) ? landPrepRes.data.results : []);
        setLaborRecords(Array.isArray(laborRes.data?.results) ? laborRes.data.results : []);
        setHarvests(Array.isArray(harvestRes.data?.results) ? harvestRes.data.results : []);
        setAgronomistRecommendations(Array.isArray(recommendationRes.data?.results) ? recommendationRes.data.results : []);
      } catch { console.error("Failed to load plantation"); }
      finally { setLoading(false); }
    })();
  }, [id]);

  useEffect(() => {
    if (!showPlantio && !showAdubacao && !showFertirrigacao && !showDefensivo) return;
    let active = true;

    apiClient.get("/inventory/items/all_items/")
      .then((itemsRes) => {
        if (!active) return;
        setInventoryItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [showAdubacao, showDefensivo, showFertirrigacao, showPlantio]);

  const handleDelete = async () => {
    if (!plantation || !confirm("Excluir esta plantação permanentemente?")) return;
    try {
      await cropService.delete(plantation.id);
      router.push("/home/plantacoes");
    } catch { console.error("Failed to delete"); }
  };

  const handleSaveEdit = async () => {
    if (!plantation) return;
    try {
      setSaving(true);
      await cropService.update(plantation.id, {
        name: editForm.name,
        crop_name: editForm.crop_name,
        variety: editForm.variety,
        planted_area_ha: editForm.planted_area_ha ? Number(editForm.planted_area_ha) : null,
        planting_date: editForm.planting_date,
        expected_harvest_date: editForm.expected_harvest_date || null,
        actual_harvest_date: editForm.actual_harvest_date || null,
        status: editForm.status,
        population: editForm.population ? Number(editForm.population) : null,
        spacing: editForm.spacing || null,
      });
      setShowEdit(false);
      const [detailRes2, dashRes2] = await Promise.all([
        cropService.get(id!),
        cropService.dashboard(id!),
      ]);
      setPlantation({ ...detailRes2.data, ...dashRes2.data });
    } catch { console.error("Failed to update"); }
    finally { setSaving(false); }
  };

  const handleCompleteRecommendation = async (recommendationId: string) => {
    try {
      setCompletingRecommendationId(recommendationId);
      const response = await apiClient.patch(`/crops/agronomist-recommendations/${recommendationId}/`, { status: "completed" });
      const updated = response.data as AgronomistRecommendation;
      setAgronomistRecommendations((prev) => prev.map((rec) => rec.id === recommendationId ? updated : rec));
    } catch {
      console.error("Failed to complete agronomist recommendation");
    } finally {
      setCompletingRecommendationId(null);
    }
  };

  const getStockPrice = async (itemId: string) => {
    const { data: lots } = await apiClient.get<{ custo_unitario: string | null; quantidade_atual: string }[]>(`/inventory/items/${itemId}/lots/`);
    const activeLot = lots.find((l) => l.custo_unitario && parseFloat(l.custo_unitario) > 0);
    return activeLot?.custo_unitario ? String(parseFloat(activeLot.custo_unitario)) : "";
  };

  const updateApplicationLine = (
    lines: ApplicationLine[],
    index: number,
    patch: Partial<ApplicationLine>,
  ) => lines.map((line, lineIndex) => {
    if (lineIndex !== index) return line;
    const next = { ...line, ...patch };
    if ("quantity" in patch || "unit_price" in patch || "unit" in patch || "item" in patch) {
      const q = parseFloat(next.quantity || "0");
      const p = parseFloat(next.unit_price || "0");
      let multiplier = 1;

      const item = inventoryItems.find((i) => i.id === next.item);
      if (item) {
        const invUnit = (item.unidade_medida || "").toLowerCase();
        const selUnit = (next.unit || "").toLowerCase();
        if (invUnit === "l" && selUnit === "ml") multiplier = 0.001;
        else if (invUnit === "ml" && selUnit === "l") multiplier = 1000;
        else if (invUnit === "kg" && selUnit === "g") multiplier = 0.001;
        else if (invUnit === "g" && selUnit === "kg") multiplier = 1000;
        else if (invUnit === "tonelada" && selUnit === "kg") multiplier = 0.001;
        else if (invUnit === "kg" && selUnit === "tonelada") multiplier = 1000;
      }

      next.total_price = (q && p) ? String(q * p * multiplier) : "";
    }
    return next;
  });

  const handleAdubacaoLineItemChange = async (index: number, itemId: string) => {
    const selectedItem = inventoryItems.find((i) => i.id === itemId);
    if (!selectedItem) {
      setAdubacaoLines((prev) => updateApplicationLine(prev, index, { item: "", unit: "", unit_price: "", total_price: "" }));
      return;
    }
    const newUnit = selectedItem.unidade_medida || "";
    try {
      const unitPrice = await getStockPrice(itemId);
      setAdubacaoLines((prev) => updateApplicationLine(prev, index, { item: itemId, unit: newUnit, unit_price: unitPrice }));
    } catch {
      setAdubacaoLines((prev) => updateApplicationLine(prev, index, { item: itemId, unit: newUnit }));
    }
  };

  const handleCreateAdubacao = async () => {
    const validLines = adubacaoLines.filter((line) => line.item && line.quantity);
    if (!plantation || validLines.length === 0) return;
    try {
      setSavingAdubacao(true);
      await Promise.all(validLines.map((line) => cropService.createFertilization({
        plantation: plantation.id,
        item: line.item,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price || null,
        total_price: line.total_price || calculateLineTotal(line.quantity, line.unit_price) || "0",
        application_date: adubacaoForm.application_date,
        operator: adubacaoForm.operator,
        notes: adubacaoForm.notes,
      })));
      setShowAdubacao(false);
      setAdubacaoForm({ application_date: "", operator: "", notes: "" });
      setAdubacaoLines([{ ...emptyAdubacaoLine }]);
      const { data: r } = await cropService.listFertilizations({ plantation: plantation.id });
      setFertilizations(Array.isArray(r?.results) ? r.results : []);
    } catch { console.error("Failed to create fertilization"); }
    finally { setSavingAdubacao(false); }
  };

  const handleFertirrigacaoLineItemChange = async (index: number, itemId: string) => {
    const selectedItem = inventoryItems.find((i) => i.id === itemId);
    if (!selectedItem) {
      setFertirrigacaoLines((prev) => updateApplicationLine(prev, index, { item: "", unit: "", unit_price: "", total_price: "" }));
      return;
    }
    const newUnit = selectedItem.unidade_medida || "";
    try {
      const unitPrice = await getStockPrice(itemId);
      setFertirrigacaoLines((prev) => updateApplicationLine(prev, index, { item: itemId, unit: newUnit, unit_price: unitPrice }));
    } catch {
      setFertirrigacaoLines((prev) => updateApplicationLine(prev, index, { item: itemId, unit: newUnit }));
    }
  };

  const handleCreateFertirrigacao = async () => {
    const validLines = fertirrigacaoLines.filter((line) => line.item && line.quantity);
    if (!plantation || validLines.length === 0) return;
    try {
      setSavingFertirrigacao(true);
      await Promise.all(validLines.map((line) => cropService.createFertigation({
        plantation: plantation.id,
        item: line.item,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price || null,
        total_price: line.total_price || calculateLineTotal(line.quantity, line.unit_price) || "0",
        application_date: fertirrigacaoForm.application_date,
        operator: fertirrigacaoForm.operator,
        notes: fertirrigacaoForm.notes,
      })));
      setShowFertirrigacao(false);
      setFertirrigacaoForm({ application_date: "", operator: "", notes: "" });
      setFertirrigacaoLines([{ ...emptyFertirrigacaoLine }]);
      const { data: r } = await cropService.listFertigations({ plantation: plantation.id });
      setFertigations(Array.isArray(r?.results) ? r.results : []);
    } catch { console.error("Failed to create fertigation"); }
    finally { setSavingFertirrigacao(false); }
  };

  const handleDefensivoLineItemChange = async (index: number, itemId: string) => {
    const selectedItem = inventoryItems.find((i) => i.id === itemId);
    if (!selectedItem) {
      setDefensivoLines((prev) => updateApplicationLine(prev, index, { item: "", unit: "", unit_price: "", total_price: "" }));
      return;
    }
    const newUnit = selectedItem.unidade_medida || "";
    try {
      const unitPrice = await getStockPrice(itemId);
      setDefensivoLines((prev) => updateApplicationLine(prev, index, { item: itemId, unit: newUnit, unit_price: unitPrice }));
    } catch {
      setDefensivoLines((prev) => updateApplicationLine(prev, index, { item: itemId, unit: newUnit }));
    }
  };

  const handleCreateDefensivo = async () => {
    const validLines = defensivoLines.filter((line) => line.item && line.quantity);
    if (!plantation || validLines.length === 0) return;
    const validEquipments = defensivoEquipments.filter((eq) => eq.equipment);
    try {
      setSavingDefensivo(true);
      await Promise.all(validLines.map((line) => cropService.createPesticideApplication({
        plantation: plantation.id,
        item: line.item,
        pesticide_type: line.pesticide_type || "other",
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price || null,
        total_price: line.total_price || calculateLineTotal(line.quantity, line.unit_price) || "0",
        application_date: defensivoForm.application_date,
        operator: defensivoForm.operator,
        notes: defensivoForm.notes,
        equipments: validEquipments.map((eq) => ({
          equipment: eq.equipment,
          quantity: eq.quantity ? parseFloat(eq.quantity) : null,
          unit_price: eq.unit_price ? parseFloat(eq.unit_price) : null,
          total_price: eq.total_price ? parseFloat(eq.total_price) : null,
        })),
      })));
      setShowDefensivo(false);
      setDefensivoForm({ application_date: "", operator: "", notes: "" });
      setDefensivoLines([{ ...emptyDefensivoLine }]);
      setDefensivoEquipments([{ equipment: "", quantity: "", unit_price: "", total_price: "" }]);
      const { data: r } = await cropService.listPesticideApplications({ plantation: plantation.id });
      setPesticides(Array.isArray(r?.results) ? r.results : []);
    } catch { console.error("Failed to create pesticide application"); }
    finally { setSavingDefensivo(false); }
  };

  const selectedIrrigationPump = irrigationPumps.find((pump) => pump.id === irrigacaoForm.pump_equipment);
  const irrigationDays = calculateInclusiveDays(irrigacaoForm.start_date, irrigacaoForm.end_date);
  const irrigationHoursTotal = Number(irrigacaoForm.hours_per_day || 0) * irrigationDays;
  const irrigationEnergyKwh = Number(selectedIrrigationPump?.power_kw || 0) * irrigationHoursTotal;
  const irrigationEnergyCost = irrigationEnergyKwh * Number(irrigacaoForm.kwh_value || 0);
  const irrigationWaterLiters = Number(selectedIrrigationPump?.flow_rate_l_per_h || 0) * irrigationHoursTotal;

  const handleCreatePump = async () => {
    if (!pumpForm.name || !pumpForm.power_cv || !pumpForm.flow_rate_l_per_h) return;
    try {
      setSavingPump(true);
      const { data } = await cropService.createIrrigationPump({
        name: pumpForm.name,
        power_cv: pumpForm.power_cv,
        flow_rate_l_per_h: pumpForm.flow_rate_l_per_h,
      });
      setIrrigationPumps((prev) => [...prev, data]);
      setIrrigacaoForm((prev) => ({ ...prev, pump_equipment: data.id }));
      setPumpForm({ name: "", power_cv: "", flow_rate_l_per_h: "" });
      setShowPumpModal(false);
    } catch { console.error("Failed to create irrigation pump"); }
    finally { setSavingPump(false); }
  };

  const handleCreateIrrigacao = async () => {
    if (!plantation || !irrigacaoForm.start_date || !irrigacaoForm.pump_equipment) return;
    try {
      setSavingIrrigacao(true);
      await cropService.createIrrigation({
        plantation: plantation.id,
        start_date: irrigacaoForm.start_date,
        end_date: irrigacaoForm.end_date || irrigacaoForm.start_date,
        irrigation_system: irrigacaoForm.irrigation_system,
        pump_equipment: irrigacaoForm.pump_equipment,
        hours_per_day: irrigacaoForm.hours_per_day || null,
        kwh_value: irrigacaoForm.kwh_value || null,
        operator: irrigacaoForm.operator,
      });
      setShowIrrigacao(false);
      setIrrigacaoForm({ start_date: "", end_date: "", irrigation_system: "", pump_equipment: "", hours_per_day: "", kwh_value: "", operator: "" });
      const { data: r } = await cropService.listIrrigations({ plantation: plantation.id });
      setIrrigations(Array.isArray(r?.results) ? r.results : []);
    } catch { console.error("Failed to create irrigation"); }
    finally { setSavingIrrigacao(false); }
  };

  const handlePlantioLineItemChange = async (index: number, itemId: string) => {
    const selectedItem = inventoryItems.find((i) => i.id === itemId);
    if (!selectedItem) {
      setPlantioLines((prev) => updateApplicationLine(prev, index, { item: "", unit: "", unit_price: "", total_price: "" }));
      return;
    }
    const newUnit = selectedItem.unidade_medida || "";
    try {
      const unitPrice = await getStockPrice(itemId);
      setPlantioLines((prev) => updateApplicationLine(prev, index, { item: itemId, unit: newUnit, unit_price: unitPrice }));
    } catch {
      setPlantioLines((prev) => updateApplicationLine(prev, index, { item: itemId, unit: newUnit }));
    }
  };

  const handleCreatePlantio = async () => {
    const validLines = plantioLines.filter((line) => line.item && line.quantity);
    if (!plantation || validLines.length === 0) return;
    try {
      setSavingPlantio(true);
      await Promise.all(validLines.map((line) => cropService.createPlanting({
        plantation: plantation.id,
        item: line.item,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price || null,
        total_price: line.total_price || calculateLineTotal(line.quantity, line.unit_price) || "0",
        planting_date: plantioForm.planting_date,
        operator: plantioForm.operator,
        notes: plantioForm.notes,
      })));
      setShowPlantio(false);
      setPlantioForm({ planting_date: "", operator: "", notes: "" });
      setPlantioLines([{ ...emptyPlantioLine }]);
      const { data: plRes } = await cropService.listPlantings({ plantation: plantation.id });
      setPlantings(Array.isArray(plRes?.results) ? plRes.results : []);
      const { data: dashRes } = await cropService.dashboard(id!);
      setPlantation(prev => prev ? { ...prev, investment_total: dashRes.investment_total } : null);
    } catch { console.error("Failed to create planting"); }
    finally { setSavingPlantio(false); }
  };

  const fmt = (v: string | number | null | undefined, decimals = 2) => {
    if (v === null || v === undefined || v === "") return "-";
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (isNaN(n)) return "-";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const money = (v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === "") return "-";
    return `R$ ${fmt(v)}`;
  };

  const percent = (v: number | null | undefined) => {
    if (v === null || v === undefined || Number.isNaN(v)) return "-";
    return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
  };

  if (loading) {
    return (
      <div className="p-4">
        <Skeleton height="40px" width="300px" className="mb-4" />
        <div className="row g-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="col-md-3"><Skeleton height="100px" /></div>
          ))}
        </div>
      </div>
    );
  }

  if (!plantation) {
    return <div className="p-4 text-muted">Plantação não encontrada.</div>;
  }

  const cultureVisual = getCultureVisual(plantation.crop_name, plantation.name);

  const harvestedKg = harvests.reduce((acc, h) => acc + Number(h.yield_kg || 0), 0);
  const harvestRevenue = harvests.reduce((acc, h) => acc + Number(h.revenue_amount || 0), 0);
  const soldKg = harvests.reduce((acc, h) => acc + (Number(h.revenue_amount || 0) > 0 ? Number(h.yield_kg || 0) : 0), 0);

  const investmentTotal = parseFloat(plantation.investment_total || "0");
  const estimatedProductionKg = parseFloat(plantation.estimated_production_kg || "0");
  const realProfit = harvestRevenue - investmentTotal;
  const roi = investmentTotal > 0 ? (realProfit / investmentTotal) * 100 : null;

  const custoPorKg = harvestedKg > 0 ? investmentTotal / harvestedKg : null;
  const vendaPorKg = soldKg > 0 ? harvestRevenue / soldKg : null;
  const lucroPorKg = harvestedKg > 0 ? realProfit / harvestedKg : null;

  const costData = [
    { name: "Sementes", value: plantings.reduce((acc, p) => acc + Number(p.total_price || 0), 0), fill: "var(--bs-success)" },
    { name: "Fertilizantes", value: fertilizations.reduce((acc, p) => acc + Number(p.total_price || 0), 0) + fertigations.reduce((acc, p) => acc + Number(p.total_price || 0), 0), fill: "var(--bs-primary)" },
    { name: "Defensivos", value: pesticides.reduce((acc, p) => acc + Number(p.total_price || 0), 0), fill: "var(--bs-danger)" },
    { name: "Irrigação", value: irrigations.reduce((acc, p) => acc + Number(p.energy_cost || 0), 0), fill: "var(--bs-info)" },
    { name: "Preparo de Terra", value: landPreparations.reduce((acc, p) => acc + Number(p.total_price || p.total_amount || 0), 0), fill: "var(--bs-warning)" },
    { name: "Mão de Obra", value: laborRecords.reduce((acc, p) => acc + Number(p.total_amount || 0), 0), fill: "var(--bs-secondary)" },
  ].filter(item => item.value > 0);

  const seedItems = inventoryItems.filter((item) => item.categoria === "semente" || (!item.especie_animal && item.categoria === "outro"));
  const nutritionItems = inventoryItems.filter((item) =>
    ["fertilizante", "foliar", "corretivo", "material", "outro"].includes(item.categoria || "") || (!item.especie_animal && item.categoria !== "defensivo")
  );
  const fertilizerItems = nutritionItems;
  const fertigationItems = nutritionItems;
  const pesticideItems = inventoryItems.filter((item) => item.categoria === "defensivo" || (!item.especie_animal && item.categoria === "outro"));
  const activeAgronomistAlerts = agronomistRecommendations.filter((recommendation) => recommendation.status !== "completed");

  return (
    <div>
      {/* Header */}
      <div className="dashboard-card p-4 mb-4">
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <button className="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center" onClick={() => router.back()} style={{ width: 36, height: 36 }}>
            <ArrowLeft size={16} />
          </button>
          <div className="rounded-xl d-flex align-items-center justify-content-center flex-shrink-0"
            style={{ width: 48, height: 48, background: `color-mix(in srgb, ${cultureVisual.color}, transparent 88%)`, overflow: "hidden" }}>
            <Image src={cultureVisual.image} alt={plantation.crop_name || "Cultura"} width={42} height={42} style={{ objectFit: "cover", borderRadius: 8 }} />
          </div>
          <div className="flex-grow-1 min-w-0">
            <h1 className="fw-black mb-1 text-foreground" style={{ fontSize: "1.75rem" }}>{plantation.name || plantation.crop_name}</h1>
            <div className="text-muted-foreground fw-medium small">{plantation.farm_name} › {plantation.field_name}</div>
          </div>
          <Badge style={{ background: statusColors[plantation.status] || "#6b7280", color: "#fff", fontSize: "0.75rem", fontWeight: 700, padding: "6px 12px", borderRadius: "8px" }}>
            {plantation.status_display}
          </Badge>
          <Button variant="outline-secondary" size="sm" onClick={() => setShowEdit(true)}>
            <Edit3 size={14} /> Editar
          </Button>
          <Button variant="outline-secondary" size="sm" onClick={handleDelete} title="Excluir">
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {activeAgronomistAlerts.length > 0 && (
        <div className="dashboard-card p-4 mb-4 border-warning" style={{ background: "color-mix(in srgb, var(--bs-warning), transparent 92%)" }}>
          <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap mb-3">
            <div className="d-flex align-items-start gap-3">
              <div
                className="d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 42, height: 42, borderRadius: 10, background: "var(--bs-warning)", color: "white" }}
              >
                <ClipboardList size={22} />
              </div>
              <div>
                <h2 className="fw-black mb-1" style={{ fontSize: "1.05rem" }}>
                  Alertas do agrônomo
                </h2>
                <p className="text-muted-foreground small mb-0">
                  Recomendações pendentes para este setor. Marque como feito depois de executar e lançar o procedimento.
                </p>
              </div>
            </div>
            <Button variant="outline-secondary" size="sm" onClick={() => router.push(`/home/plantacoes/${id}/agronomo`)}>
              Ver área do agrônomo
            </Button>
          </div>

          <div className="d-flex flex-column gap-3">
            {activeAgronomistAlerts.map((recommendation) => (
              <div key={recommendation.id} className="bg-white border rounded p-3">
                <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
                      <Badge style={recommendationStatusVariant(recommendation.status)}>{recommendation.status_display || "Pendente"}</Badge>
                      <span className="small text-muted-foreground">Aplicação: {formatDate(recommendation.suggested_application_date)}</span>
                      <span className="small text-muted-foreground">Prioridade: {recommendation.priority_display || recommendation.priority}</span>
                    </div>
                    <div className="fw-bold text-foreground">{recommendation.title}</div>
                    {recommendation.objective && (
                      <div className="small text-muted-foreground mt-1">{recommendation.objective}</div>
                    )}
                    {!!recommendation.products?.length && (
                      <div className="d-flex flex-wrap gap-2 mt-2">
                        {recommendation.products.map((product, productIndex) => (
                          <span key={`${recommendation.id}-${productIndex}`} className="badge bg-success-subtle text-success border border-success-subtle">
                            {product.item_name || "Produto"}
                            {product.dose_per_ha ? ` - ${fmt(product.dose_per_ha)} ${product.dose_unit || ""}` : ""}
                            {product.total_quantity ? ` | Total: ${fmt(product.total_quantity)} ${product.total_unit || ""}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="agro"
                    size="sm"
                    disabled={completingRecommendationId === recommendation.id}
                    onClick={() => handleCompleteRecommendation(recommendation.id)}
                  >
                    <CheckCircle2 size={16} />
                    {completingRecommendationId === recommendation.id ? "Concluindo..." : "Marcar como feito"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shortcuts */}
      <div className="mb-4">
        <div className="d-flex align-items-end justify-content-between mb-3 gap-3 flex-wrap">
          <div>
            <h2 className="fw-bold mb-1" style={{ fontSize: "1.15rem" }}>Atalhos da plantação</h2>
            <p className="text-muted-foreground small mb-0">Etapas operacionais do ciclo produtivo desta plantação.</p>
          </div>
        </div>
        <div className="row g-3">
          {[
            {
              number: 1,
              label: "Estrutura do Setor",
              desc: "Talhões, áreas, equipes, equipamentos e insumos",
              stage: shortcutStages.estrutura,
              status: "completed" as ShortcutStatus,
              onClick: () => undefined,
              wide: false,
            },
            {
              number: 2,
              label: "Preparação da Terra",
              desc: "Calagem, aração, gradagem e mais",
              stage: shortcutStages.preparo,
              status: "completed" as ShortcutStatus,
              onClick: () => router.push(`/home/plantacoes/${id}/preparo-terra`),
              wide: false,
            },
            {
              number: 3,
              label: "Adubação de Base",
              desc: "Produtos, doses, quantidades e custo",
              stage: shortcutStages.adubacao,
              status: "completed" as ShortcutStatus,
              onClick: () => setShowAdubacao(true),
              wide: false,
            },
            {
              number: 4,
              label: "Sementes/mudas",
              desc: "Híbrido, mudas, quantidade, sacas e custo",
              stage: shortcutStages.plantio,
              status: "in_progress" as ShortcutStatus,
              onClick: () => setShowPlantio(true),
              wide: false,
            },
            {
              number: 5,
              label: "Fertirrigação",
              desc: "Adubos via fertirrigação, doses, volume e custo",
              stage: shortcutStages.fertirrigacao,
              status: "in_progress" as ShortcutStatus,
              onClick: () => setShowFertirrigacao(true),
              wide: false,
            },
            {
              number: 6,
              label: "Foliar & Defensivos",
              desc: "Produtos, doses, volume e custo",
              stage: shortcutStages.foliarDefensivos,
              status: "pending" as ShortcutStatus,
              onClick: () => setShowDefensivo(true),
              wide: false,
            },
            {
              number: 7,
              label: "Irrigação",
              desc: "Manejo de irrigação, gotejo, aspersão e cálculos",
              stage: shortcutStages.irrigacao,
              status: "running" as ShortcutStatus,
              onClick: () => setShowIrrigacao(true),
              wide: false,
            },
            {
              number: 8,
              label: "Área do Agrônomo",
              desc: "Recomendações, programações e acompanhamentos",
              stage: shortcutStages.agronomo,
              status: "in_progress" as ShortcutStatus,
              onClick: () => router.push(`/home/plantacoes/${id}/agronomo`),
              wide: false,
            },
            {
              number: 9,
              label: "Mão de Obra",
              desc: "Atividades, horas trabalhadas e custos",
              stage: shortcutStages.maoObra,
              status: "pending" as ShortcutStatus,
              onClick: () => router.push(`/home/plantacoes/${id}/mao-obra`),
              wide: false,
            },
            {
              number: 10,
              label: "Relatório",
              desc: "Gerar PDF completo ou resumo da produção",
              stage: shortcutStages.relatorio,
              status: "pending" as ShortcutStatus,
              onClick: () => router.push(`/home/plantacoes/${id}/historico`),
              wide: true,
            },
            {
              number: 11,
              label: "Colheita",
              desc: "Produção, sacas, umidade e valor",
              stage: shortcutStages.colheita,
              status: "pending" as ShortcutStatus,
              onClick: () => router.push(`/home/plantacoes/${id}/colheita`),
              wide: true,
            },
          ].map((shortcut) => (
            <div key={shortcut.number} className="col-12 col-sm-6 col-lg-4 col-xl-3">
              <ShortcutCard
                number={shortcut.number}
                image={shortcut.stage.image}
                label={shortcut.label}
                desc={shortcut.desc}
                status={shortcut.status}
                onClick={shortcut.onClick}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Main KPIs */}
      <div className="row g-4 mb-4">
        <div className="col-md-3 col-6">
          <MetricCard icon={<Calendar size={14} />} label="Dias de Cultivo" value={plantation.days_in_cultivation != null ? `${plantation.days_in_cultivation} dias` : "-"} variant="info" />
        </div>
        <div className="col-md-3 col-6">
          <MetricCard icon={<Clock size={14} />} label="Dias Restantes" value={plantation.days_remaining != null ? `${plantation.days_remaining} dias` : "-"} variant="warning" />
        </div>
        <div className="col-md-3 col-6">
          <MetricCard icon={<DollarSign size={14} />} label="Investimento" value={money(plantation.investment_total)} variant="danger" />
        </div>
        <div className="col-md-3 col-6">
          <MetricCard icon={<Ruler size={14} />} label="Área Plantada" value={plantation.planted_area_ha ? `${fmt(plantation.planted_area_ha, 2)} ha` : "-"} variant="info" />
        </div>
      </div>

      {/* Second row — financial KPIs */}
      <div className="row g-4 mb-4">
        <div className="col-md-3 col-6">
          <MetricCard icon={<DollarSign size={14} />} label="Investimento Total" value={money(investmentTotal)} variant="danger" />
        </div>
        <div className="col-md-3 col-6">
          <MetricCard icon={<DollarSign size={14} />} label="Receita Bruta" value={money(harvestRevenue)} variant="success" />
        </div>
        <div className="col-md-3 col-6">
          <MetricCard icon={<Target size={14} />} label="Lucro" value={money(realProfit)} variant={realProfit >= 0 ? "success" : "danger"} />
        </div>
        <div className="col-md-3 col-6">
          <MetricCard icon={<Target size={14} />} label="ROI" value={percent(roi)} variant={roi !== null && roi >= 0 ? "success" : "danger"} />
        </div>
      </div>

      {/* Sections */}
      <div className="row g-4">
        {/* Culture Data */}
        <div className="col-md-6">
          <div className="dashboard-card p-4 h-100">
            <h6 className="fw-bold mb-3"><Sprout size={16} className="me-1" /> Dados da Cultura</h6>
            <table className="table table-sm table-borderless mb-0">
              <tbody>
                <tr><td className="text-muted small" style={{ width: "40%" }}>Cultura</td><td className="fw-medium">{plantation.crop_name}</td></tr>
                <tr><td className="text-muted small">Tipo</td><td className="fw-medium">{plantation.crop_type_display || "-"}</td></tr>
                <tr><td className="text-muted small">Variedade</td><td className="fw-medium">{plantation.variety || "-"}</td></tr>
                <tr><td className="text-muted small">Híbrido</td><td className="fw-medium">{plantation.hybrid || "-"}</td></tr>
                <tr><td className="text-muted small">População</td><td className="fw-medium">{plantation.population ? `${fmt(plantation.population, 0)} plantas/ha` : "-"}</td></tr>
                <tr><td className="text-muted small">Espaçamento</td><td className="fw-medium">{plantation.spacing || "-"}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Dates */}
        <div className="col-md-6">
          <div className="dashboard-card p-4 h-100">
            <h6 className="fw-bold mb-3"><Calendar size={16} className="me-1" /> Datas</h6>
            <table className="table table-sm table-borderless mb-0">
              <tbody>
                <tr><td className="text-muted small" style={{ width: "40%" }}>Plantio</td><td className="fw-medium">{plantation.planting_date ? new Date(plantation.planting_date).toLocaleDateString("pt-BR") : "-"}</td></tr>
                <tr><td className="text-muted small">Previsão de Colheita</td><td className="fw-medium">{plantation.expected_harvest_date ? new Date(plantation.expected_harvest_date).toLocaleDateString("pt-BR") : "-"}</td></tr>
                <tr><td className="text-muted small">Colheita Real</td><td className="fw-medium">{plantation.actual_harvest_date ? new Date(plantation.actual_harvest_date).toLocaleDateString("pt-BR") : "-"}</td></tr>
                <tr><td className="text-muted small">Responsável</td><td className="fw-medium">{plantation.responsible_name || "-"}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="col-md-6">
          <div className="dashboard-card p-4 h-100">
            <h6 className="fw-bold mb-3"><DollarSign size={16} className="me-1" /> Resumo Financeiro</h6>
            <table className="table table-sm table-borderless mb-0">
              <tbody>
                <tr><td className="text-muted small" style={{ width: "40%" }}>Investimento Total</td><td className="fw-medium">{money(investmentTotal)}</td></tr>
                <tr><td className="text-muted small">Receita Bruta</td><td className="fw-medium">{money(harvestRevenue)}</td></tr>
                <tr><td className="text-muted small">Lucro</td><td className={`fw-medium ${realProfit >= 0 ? "text-success" : "text-danger"}`}>{money(realProfit)}</td></tr>
                <tr><td className="text-muted small">Retorno sobre investimento (ROI)</td><td className={`fw-medium ${roi !== null && roi >= 0 ? "text-success" : roi !== null ? "text-danger" : ""}`}>{percent(roi)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Production Summary */}
        <div className="col-md-6">
          <div className="dashboard-card p-4 h-100">
            <h6 className="fw-bold mb-3"><Warehouse size={16} className="me-1" /> Resumo de Produção</h6>
            <table className="table table-sm table-borderless mb-0">
              <tbody>
                <tr><td className="text-muted small" style={{ width: "40%" }}>Quantidade produzida</td><td className="fw-medium">{harvestedKg > 0 ? `${fmt(harvestedKg, 0)} kg` : "-"}</td></tr>
                <tr><td className="text-muted small">Quantidade vendida</td><td className="fw-medium">{soldKg > 0 ? `${fmt(soldKg, 0)} kg` : "-"}</td></tr>
                <tr><td className="text-muted small">Área Plantada</td><td className="fw-medium">{plantation.planted_area_ha ? `${fmt(plantation.planted_area_ha, 2)} ha` : "-"}</td></tr>
                <tr><td className="text-muted small">Custo por kg</td><td className="fw-medium">{custoPorKg !== null ? money(custoPorKg) : "-"}</td></tr>
                <tr><td className="text-muted small">Venda por kg</td><td className="fw-medium">{vendaPorKg !== null ? money(vendaPorKg) : "-"}</td></tr>
                <tr><td className="text-muted small">Lucro por kg</td><td className={`fw-medium ${lucroPorKg !== null && lucroPorKg >= 0 ? "text-success" : lucroPorKg !== null ? "text-danger" : ""}`}>{lucroPorKg !== null ? money(lucroPorKg) : "-"}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {plantation.notes && (
          <div className="col-12">
            <div className="dashboard-card p-4">
              <h6 className="fw-bold mb-2">Observações</h6>
              <p className="mb-0 text-muted">{plantation.notes}</p>
            </div>
          </div>
        )}
      </div>

      {/* Charts Row */}
      <div className="row g-4 mb-4 mt-0">
        <div className="col-md-6">
          <div className="dashboard-card p-4 h-100">
            <h6 className="fw-bold mb-3">Composição de Custos</h6>
            {costData.length > 0 ? (
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={costData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={80} paddingAngle={5}>
                      {costData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                    </Pie>
                    <RechartsTooltip formatter={(value) => money(Array.isArray(value) ? value[0] : value ?? 0)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted small">Dados insuficientes para o gráfico.</p>
            )}
          </div>
        </div>

        <div className="col-md-6">
          <div className="dashboard-card p-4 h-100">
            <h6 className="fw-bold mb-3">Progresso de Colheita</h6>
            <div className="mb-3">
              <div className="d-flex justify-content-between small mb-1">
                <span className="text-muted">Produção (kg)</span>
                <span className="fw-medium">{fmt(harvestedKg, 0)} / {fmt(estimatedProductionKg, 0)} kg</span>
              </div>
              <div className="progress" style={{ height: 10 }}>
                <div className="progress-bar bg-success" style={{ width: `${Math.min((harvestedKg / (estimatedProductionKg || 1)) * 100, 100)}%` }} />
              </div>
            </div>
            <div className="mb-3">
              <div className="d-flex justify-content-between small mb-1">
                <span className="text-muted">Receita Real (R$)</span>
                <span className="fw-medium">{money(harvestRevenue)}</span>
              </div>
              <div className="progress" style={{ height: 10 }}>
                <div className="progress-bar bg-primary" style={{ width: harvestRevenue > 0 ? "100%" : "0%" }} />
              </div>
            </div>
            <div className="mt-4">
              <Button variant="outline-success" size="sm" className="w-100" onClick={() => router.push(`/home/plantacoes/${id}/colheita`)}>
                Detalhes da Colheita
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Novo Plantio */}
      <Modal isOpen={showPlantio} onClose={() => setShowPlantio(false)} title="Registrar Plantio"
        footer={
          <div className="d-flex gap-2 justify-content-end">
            <Button variant="outline-secondary" onClick={() => setShowPlantio(false)}>Cancelar</Button>
            <Button onClick={handleCreatePlantio} disabled={savingPlantio}>{savingPlantio ? "Salvando..." : "Salvar"}</Button>
          </div>
        }
      >
        <div className="d-flex flex-column gap-3 p-4 p-md-5">
          <div className="d-flex align-items-center justify-content-between gap-2">
            <strong className="small text-success">Sementes utilizadas no plantio</strong>
            <Button variant="outline-success" size="sm" onClick={() => setPlantioLines((prev) => [...prev, { ...emptyPlantioLine }])}>+ Adicionar</Button>
          </div>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Semente (Insumo)</th>
                  <th style={{ minWidth: 130 }}>Quantidade</th>
                  <th style={{ minWidth: 120 }}>Unidade</th>
                  <th style={{ minWidth: 140 }}>Preço (R$)</th>
                  <th style={{ minWidth: 150 }}>Valor Total (R$)</th>
                  <th className="text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {plantioLines.map((line, index) => (
                  <tr key={index}>
                    <td style={{ minWidth: 260 }}>
                      <select className="form-select" value={line.item} onChange={(e) => handlePlantioLineItemChange(index, e.target.value)}>
                        <option value="">Selecione uma semente do estoque...</option>
                        {seedItems.map((i) => (
                          <option key={i.id} value={i.id}>{i.nome}{i.estoque_atual ? ` (${i.estoque_atual} ${i.unidade_medida})` : ""}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="form-control" type="number" step="0.01" value={line.quantity}
                        onChange={(e) => setPlantioLines((prev) => updateApplicationLine(prev, index, { quantity: e.target.value }))} />
                    </td>
                    <td>
                      <select className="form-select" value={line.unit} onChange={(e) => setPlantioLines((prev) => updateApplicationLine(prev, index, { unit: e.target.value }))}>
                        <option value="">Selecione...</option>
                        {unitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="form-control bg-light" type="number" step="0.01" value={line.unit_price} readOnly title="Preço automático do estoque" />
                    </td>
                    <td><div className="form-control bg-success-subtle fw-semibold text-success">{money(line.total_price)}</div></td>
                    <td className="text-center">
                      <Button variant="outline-danger" size="sm" onClick={() => setPlantioLines((prev) => prev.length === 1 ? [{ ...emptyPlantioLine }] : prev.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={16} /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {seedItems.length === 0 && (
            <small className="text-muted">Nenhuma semente cadastrada no estoque.</small>
          )}
          <div className="d-flex justify-content-between align-items-center rounded border bg-success-subtle px-3 py-2">
            <span className="fw-medium">Total de itens: {plantioLines.filter((line) => line.item).length}</span>
            <strong className="text-success">Valor total das sementes: {money(plantioLines.reduce((sum, line) => sum + Number(line.total_price || 0), 0))}</strong>
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Data do Plantio</label>
            <input className="form-control" type="date" value={plantioForm.planting_date}
              onChange={(e) => setPlantioForm({ ...plantioForm, planting_date: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Operador</label>
            <input className="form-control" value={plantioForm.operator}
              onChange={(e) => setPlantioForm({ ...plantioForm, operator: e.target.value })} />
          </div>
          <div className="col-12">
            <label className="form-label small fw-medium">Observações</label>
            <textarea className="form-control" rows={2} value={plantioForm.notes}
              onChange={(e) => setPlantioForm({ ...plantioForm, notes: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Modal: Nova Adubação */}
      <Modal isOpen={showAdubacao} onClose={() => setShowAdubacao(false)} title="Registrar Adubação"
        footer={<div className="d-flex gap-2 justify-content-end"><Button variant="outline-secondary" onClick={() => setShowAdubacao(false)}>Cancelar</Button><Button variant="outline-success" disabled={savingAdubacao}>Salvar rascunho</Button><Button onClick={handleCreateAdubacao} disabled={savingAdubacao}>{savingAdubacao ? "Salvando..." : "Salvar adubação"}</Button></div>}
      >
        <div className="d-flex flex-column gap-3 p-4 p-md-5">
          <div className="d-flex align-items-center justify-content-between gap-2">
            <strong className="small text-success">Fertilizantes utilizados na aplicação</strong>
            <Button variant="outline-success" size="sm" onClick={() => setAdubacaoLines((prev) => [...prev, { ...emptyAdubacaoLine }])}>+ Adicionar</Button>
          </div>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Fertilizante (Insumo)</th>
                  <th style={{ minWidth: 130 }}>Quantidade</th>
                  <th style={{ minWidth: 120 }}>Unidade</th>
                  <th style={{ minWidth: 140 }}>Preço (R$)</th>
                  <th style={{ minWidth: 150 }}>Valor Total (R$)</th>
                  <th className="text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {adubacaoLines.map((line, index) => (
                  <tr key={index}>
                    <td style={{ minWidth: 260 }}>
                      <select className="form-select" value={line.item} onChange={(e) => handleAdubacaoLineItemChange(index, e.target.value)}>
                        <option value="">Selecione um fertilizante do estoque...</option>
                        {fertilizerItems.map((i) => (
                          <option key={i.id} value={i.id}>{i.nome}{i.estoque_atual ? ` (${i.estoque_atual} ${i.unidade_medida})` : ""}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="form-control" type="number" step="0.01" value={line.quantity}
                        onChange={(e) => setAdubacaoLines((prev) => updateApplicationLine(prev, index, { quantity: e.target.value }))} />
                    </td>
                    <td>
                      <select className="form-select" value={line.unit} onChange={(e) => setAdubacaoLines((prev) => updateApplicationLine(prev, index, { unit: e.target.value }))}>
                        <option value="">Selecione...</option>
                        {unitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="form-control bg-light" type="number" step="0.01" value={line.unit_price} readOnly title="Preço automático do estoque" />
                    </td>
                    <td><div className="form-control bg-success-subtle fw-semibold text-success">{money(line.total_price)}</div></td>
                    <td className="text-center">
                      <Button variant="outline-danger" size="sm" onClick={() => setAdubacaoLines((prev) => prev.length === 1 ? [{ ...emptyAdubacaoLine }] : prev.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={16} /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fertilizerItems.length === 0 && (
            <small className="text-muted">Nenhum insumo compatível com adubação cadastrado no estoque.</small>
          )}
          <div className="d-flex justify-content-between align-items-center rounded border bg-success-subtle px-3 py-2">
            <span className="fw-medium">Total de itens: {adubacaoLines.filter((line) => line.item).length}</span>
            <strong className="text-success">Valor total da adubação: {money(adubacaoLines.reduce((sum, line) => sum + Number(line.total_price || 0), 0))}</strong>
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Data</label>
            <input className="form-control" type="date" value={adubacaoForm.application_date} onChange={(e) => setAdubacaoForm({ ...adubacaoForm, application_date: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Operador</label>
            <input className="form-control" value={adubacaoForm.operator} onChange={(e) => setAdubacaoForm({ ...adubacaoForm, operator: e.target.value })} />
          </div>
          <div>
            <label className="form-label small fw-medium">Observações</label>
            <textarea className="form-control" rows={2} maxLength={300} value={adubacaoForm.notes} onChange={(e) => setAdubacaoForm({ ...adubacaoForm, notes: e.target.value })} placeholder="Ex.: Local da aplicação, condição do solo, dose recomendada..." />
            <div className="text-end text-muted small">{adubacaoForm.notes.length}/300</div>
          </div>
        </div>
      </Modal>

      {/* Modal: Nova Fertirrigação */}
      <Modal isOpen={showFertirrigacao} onClose={() => setShowFertirrigacao(false)} title="Registrar Fertirrigação"
        footer={<div className="d-flex gap-2 justify-content-end"><Button variant="outline-secondary" onClick={() => setShowFertirrigacao(false)}>Cancelar</Button><Button onClick={handleCreateFertirrigacao} disabled={savingFertirrigacao}>{savingFertirrigacao ? "Salvando..." : "Salvar"}</Button></div>}
      >
        <div className="d-flex flex-column gap-3 p-4 p-md-5">
          <div className="d-flex align-items-center justify-content-between gap-2">
            <strong className="small text-success">Insumos utilizados na fertirrigação</strong>
            <Button variant="outline-success" size="sm" onClick={() => setFertirrigacaoLines((prev) => [...prev, { ...emptyFertirrigacaoLine }])}>+ Adicionar</Button>
          </div>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Insumo</th>
                  <th style={{ minWidth: 130 }}>Quantidade</th>
                  <th style={{ minWidth: 120 }}>Unidade</th>
                  <th style={{ minWidth: 140 }}>Preço (R$)</th>
                  <th style={{ minWidth: 150 }}>Valor Total (R$)</th>
                  <th className="text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {fertirrigacaoLines.map((line, index) => (
                  <tr key={index}>
                    <td style={{ minWidth: 260 }}>
                      <select className="form-select" value={line.item} onChange={(e) => handleFertirrigacaoLineItemChange(index, e.target.value)}>
                        <option value="">Selecione um insumo do estoque...</option>
                        {fertigationItems.map((i) => (
                          <option key={i.id} value={i.id}>{i.nome}{i.estoque_atual ? ` (${i.estoque_atual} ${i.unidade_medida})` : ""}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="form-control" type="number" step="0.01" value={line.quantity}
                        onChange={(e) => setFertirrigacaoLines((prev) => updateApplicationLine(prev, index, { quantity: e.target.value }))} />
                    </td>
                    <td>
                      <select className="form-select" value={line.unit} onChange={(e) => setFertirrigacaoLines((prev) => updateApplicationLine(prev, index, { unit: e.target.value }))}>
                        <option value="">Selecione...</option>
                        {unitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="form-control bg-light" type="number" step="0.01" value={line.unit_price} readOnly title="Preço automático do estoque" />
                    </td>
                    <td><div className="form-control bg-success-subtle fw-semibold text-success">{money(line.total_price)}</div></td>
                    <td className="text-center">
                      <Button variant="outline-danger" size="sm" onClick={() => setFertirrigacaoLines((prev) => prev.length === 1 ? [{ ...emptyFertirrigacaoLine }] : prev.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={16} /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fertigationItems.length === 0 && (
            <small className="text-muted">Nenhum insumo compatível com fertirrigação cadastrado no estoque.</small>
          )}
          <div className="d-flex justify-content-between align-items-center rounded border bg-success-subtle px-3 py-2">
            <span className="fw-medium">Total de itens: {fertirrigacaoLines.filter((line) => line.item).length}</span>
            <strong className="text-success">Valor total da fertirrigação: {money(fertirrigacaoLines.reduce((sum, line) => sum + Number(line.total_price || 0), 0))}</strong>
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Data</label>
            <input className="form-control" type="date" value={fertirrigacaoForm.application_date} onChange={(e) => setFertirrigacaoForm({ ...fertirrigacaoForm, application_date: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Operador</label>
            <input className="form-control" value={fertirrigacaoForm.operator} onChange={(e) => setFertirrigacaoForm({ ...fertirrigacaoForm, operator: e.target.value })} />
          </div>
          <div>
            <label className="form-label small fw-medium">Observações</label>
            <textarea className="form-control" rows={2} maxLength={300} value={fertirrigacaoForm.notes} onChange={(e) => setFertirrigacaoForm({ ...fertirrigacaoForm, notes: e.target.value })} placeholder="Ex.: Volume de calda, setor irrigado, condição do sistema..." />
            <div className="text-end text-muted small">{fertirrigacaoForm.notes.length}/300</div>
          </div>
        </div>
      </Modal>

      {/* Modal: Novo Defensivo */}
      <Modal isOpen={showDefensivo} onClose={() => setShowDefensivo(false)} title="Registrar Defensivo"
        footer={<div className="d-flex gap-2 justify-content-end"><Button variant="outline-secondary" onClick={() => setShowDefensivo(false)}>Cancelar</Button><Button variant="outline-success" disabled={savingDefensivo}>Salvar rascunho</Button><Button onClick={handleCreateDefensivo} disabled={savingDefensivo}>{savingDefensivo ? "Salvando..." : "Salvar aplicação"}</Button></div>}
      >
        <div className="d-flex flex-column gap-3 p-4 p-md-5">
          <div className="d-flex align-items-center justify-content-between gap-2">
            <strong className="small text-success">Defensivos da aplicação</strong>
            <Button variant="outline-success" size="sm" onClick={() => setDefensivoLines((prev) => [...prev, { ...emptyDefensivoLine }])}>+ Adicionar</Button>
          </div>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Insumo</th>
                  <th style={{ minWidth: 160 }}>Tipo</th>
                  <th style={{ minWidth: 130 }}>Quantidade</th>
                  <th style={{ minWidth: 120 }}>Unidade</th>
                  <th style={{ minWidth: 140 }}>Preço (R$)</th>
                  <th style={{ minWidth: 150 }}>Valor Total (R$)</th>
                  <th className="text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {defensivoLines.map((line, index) => (
                  <tr key={index}>
                    <td style={{ minWidth: 260 }}>
                      <select className="form-select" value={line.item} onChange={(e) => handleDefensivoLineItemChange(index, e.target.value)}>
                        <option value="">Selecione um insumo...</option>
                        {pesticideItems.map((i) => (
                          <option key={i.id} value={i.id}>{i.nome}{i.estoque_atual ? ` (${i.estoque_atual} ${i.unidade_medida})` : ""}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select className="form-select" value={line.pesticide_type || "other"} onChange={(e) => setDefensivoLines((prev) => updateApplicationLine(prev, index, { pesticide_type: e.target.value }))}>
                        {pesticideTypeOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="form-control" type="number" step="0.01" value={line.quantity}
                        onChange={(e) => setDefensivoLines((prev) => updateApplicationLine(prev, index, { quantity: e.target.value }))} />
                    </td>
                    <td>
                      <select className="form-select" value={line.unit} onChange={(e) => setDefensivoLines((prev) => updateApplicationLine(prev, index, { unit: e.target.value }))}>
                        <option value="">Selecione...</option>
                        {unitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="form-control bg-light" type="number" step="0.01" value={line.unit_price} readOnly title="Preço automático do estoque" />
                    </td>
                    <td><div className="form-control bg-success-subtle fw-semibold text-success">{money(line.total_price)}</div></td>
                    <td className="text-center">
                      <Button variant="outline-danger" size="sm" onClick={() => setDefensivoLines((prev) => prev.length === 1 ? [{ ...emptyDefensivoLine }] : prev.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={16} /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pesticideItems.length === 0 && (
            <small className="text-muted">Nenhum defensivo cadastrado no estoque.</small>
          )}
          <div className="d-flex justify-content-between align-items-center rounded border bg-success-subtle px-3 py-2">
            <span className="fw-medium">Total de itens: {defensivoLines.filter((line) => line.item).length}</span>
            <strong className="text-success">Valor total da aplicação: {money(defensivoLines.reduce((sum, line) => sum + Number(line.total_price || 0), 0))}</strong>
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Data</label>
            <input className="form-control" type="date" value={defensivoForm.application_date} onChange={(e) => setDefensivoForm({ ...defensivoForm, application_date: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Operador</label>
            <input className="form-control" value={defensivoForm.operator} onChange={(e) => setDefensivoForm({ ...defensivoForm, operator: e.target.value })} />
          </div>
          <div>
            <label className="form-label small fw-medium">Observações</label>
            <textarea className="form-control" rows={2} maxLength={300} value={defensivoForm.notes} onChange={(e) => setDefensivoForm({ ...defensivoForm, notes: e.target.value })} placeholder="Ex.: Condições climáticas, pragas alvo, recomendações..." />
            <div className="text-end text-muted small">{defensivoForm.notes.length}/300</div>
          </div>

          {/* Equipamentos Utilizados */}
          <div className="border rounded-3 overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <div className="d-flex align-items-center justify-content-between px-3 py-2" style={{ background: "rgba(16, 185, 129, 0.06)", borderBottom: "1px solid var(--border)" }}>
              <strong className="small text-success d-flex align-items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                Equipamentos Utilizados
              </strong>
              <Button variant="outline-success" size="sm" onClick={() => setDefensivoEquipments((prev) => [...prev, { equipment: "", quantity: "", unit_price: "", total_price: "" }])}>
                + Adicionar equipamento
              </Button>
            </div>
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Equipamento</th>
                    <th style={{ minWidth: 160 }}>Quantidade utilizada</th>
                    <th style={{ minWidth: 160 }}>Valor Unitário (R$)</th>
                    <th style={{ minWidth: 160 }}>Valor Total (R$)</th>
                    <th className="text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {defensivoEquipments.map((eq, index) => (
                    <tr key={index}>
                      <td style={{ minWidth: 240 }}>
                        <select className="form-select" value={eq.equipment}
                          onChange={(e) => setDefensivoEquipments((prev) => prev.map((item, i) => i !== index ? item : { ...item, equipment: e.target.value }))}>
                          <option value="">Selecione o equipamento...</option>
                          <option value="pulverizador_costal">Pulverizador costal</option>
                          <option value="pulverizador_costal_motorizado">Pulverizador costal motorizado</option>
                          <option value="pulverizador_tratorizado">Pulverizador tratorizado</option>
                          <option value="autopropelido">Autopropelido</option>
                          <option value="drone">Drone</option>
                          <option value="aviao_agricola">Avião agrícola</option>
                          <option value="barra_pulverizacao">Barra de pulverização</option>
                          <option value="outro">Outro</option>
                        </select>
                      </td>
                      <td>
                        <input className="form-control" type="number" step="0.01" placeholder="0" value={eq.quantity}
                          onChange={(e) => {
                            const qty = e.target.value;
                            setDefensivoEquipments((prev) => prev.map((item, i) => {
                              if (i !== index) return item;
                              const total = qty && item.unit_price ? String(parseFloat(qty) * parseFloat(item.unit_price)) : "";
                              return { ...item, quantity: qty, total_price: total };
                            }));
                          }} />
                      </td>
                      <td>
                        <div className="input-group">
                          <span className="input-group-text small">R$</span>
                          <input className="form-control" type="number" step="0.01" placeholder="0,00" value={eq.unit_price}
                            onChange={(e) => {
                              const price = e.target.value;
                              setDefensivoEquipments((prev) => prev.map((item, i) => {
                                if (i !== index) return item;
                                const total = price && item.quantity ? String(parseFloat(price) * parseFloat(item.quantity)) : "";
                                return { ...item, unit_price: price, total_price: total };
                              }));
                            }} />
                        </div>
                      </td>
                      <td>
                        <div className="form-control bg-success-subtle fw-semibold text-success">
                          {eq.total_price ? money(eq.total_price) : <span className="text-muted">R$ 0,00</span>}
                        </div>
                      </td>
                      <td className="text-center">
                        <Button variant="outline-danger" size="sm"
                          onClick={() => setDefensivoEquipments((prev) => prev.length === 1 ? [{ equipment: "", quantity: "", unit_price: "", total_price: "" }] : prev.filter((_, i) => i !== index))}>
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="d-flex justify-content-end align-items-center px-3 py-2 border-top" style={{ background: "rgba(16, 185, 129, 0.04)" }}>
              <span className="text-muted small me-3">Custo da aplicação (soma dos equipamentos):</span>
              <strong className="text-success">{money(defensivoEquipments.reduce((sum, eq) => sum + Number(eq.total_price || 0), 0))}</strong>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Nova Irrigação */}
      <Modal isOpen={showIrrigacao} onClose={() => setShowIrrigacao(false)} title="Registrar Irrigação"
        footer={<div className="d-flex gap-2 justify-content-end"><Button variant="outline-secondary" onClick={() => setShowIrrigacao(false)}>Cancelar</Button><Button onClick={handleCreateIrrigacao} disabled={savingIrrigacao}>{savingIrrigacao ? "Salvando..." : "Salvar irrigação"}</Button></div>}
      >
        <div className="p-4 p-md-5">
          <div className="row g-3">
            <div className="col-6">
            <label className="form-label small fw-medium">Data inicial *</label>
            <input className="form-control" type="date" value={irrigacaoForm.start_date} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, start_date: e.target.value, end_date: irrigacaoForm.end_date || e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Data final</label>
            <input className="form-control" type="date" value={irrigacaoForm.end_date} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, end_date: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Sistema de irrigação</label>
            <select className="form-select" value={irrigacaoForm.irrigation_system} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, irrigation_system: e.target.value })}>
              <option value="">Selecione...</option>
              {irrigationSystemOptions.map((system) => <option key={system.value} value={system.value}>{system.label}</option>)}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Bomba utilizada *</label>
            <div className="input-group">
              <select className="form-select" value={irrigacaoForm.pump_equipment} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, pump_equipment: e.target.value })}>
                <option value="">Selecione...</option>
                {irrigationPumps.map((pump) => (
                  <option key={pump.id} value={pump.id}>{pump.name} - {fmt(pump.power_cv)} CV / {fmt(pump.flow_rate_l_per_h, 0)} L/h</option>
                ))}
              </select>
              <Button variant="outline-success" onClick={() => setShowPumpModal(true)} title="Cadastrar nova bomba"><Plus size={16} /></Button>
            </div>
            {selectedIrrigationPump && (
              <small className="text-muted">Potência convertida: {fmt(selectedIrrigationPump.power_kw)} kW</small>
            )}
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Horas de funcionamento por dia</label>
            <input className="form-control" type="number" step="0.1" value={irrigacaoForm.hours_per_day} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, hours_per_day: e.target.value })} placeholder="Ex.: 6.5" />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Valor do kWh</label>
            <input className="form-control" type="number" step="0.0001" value={irrigacaoForm.kwh_value} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, kwh_value: e.target.value })} />
          </div>
          <div className="col-12">
            <label className="form-label small fw-medium">Operador</label>
            <input className="form-control" value={irrigacaoForm.operator} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, operator: e.target.value })} />
          </div>
          <div className="col-12">
            <div className="rounded border bg-success-subtle p-3">
              <div className="row g-3 small">
                <div className="col-6 col-md-3"><span className="text-muted d-block">Dias do período</span><strong>{irrigationDays} dia{irrigationDays === 1 ? "" : "s"}</strong></div>
                <div className="col-6 col-md-3"><span className="text-muted d-block">Horas totais</span><strong>{fmt(irrigationHoursTotal)} h</strong></div>
                <div className="col-6 col-md-3"><span className="text-muted d-block">Energia</span><strong>{fmt(irrigationEnergyKwh)} kWh</strong></div>
                <div className="col-6 col-md-3"><span className="text-muted d-block">Custo energia</span><strong>{money(irrigationEnergyCost)}</strong></div>
                <div className="col-12"><span className="text-muted d-block">Volume total de água aplicado</span><strong>{fmt(irrigationWaterLiters, 0)} L</strong></div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </Modal>

      <Modal isOpen={showPumpModal} onClose={() => setShowPumpModal(false)} title="Cadastrar Bomba"
        footer={<div className="d-flex gap-2 justify-content-end"><Button variant="outline-secondary" onClick={() => setShowPumpModal(false)}>Cancelar</Button><Button onClick={handleCreatePump} disabled={savingPump}>{savingPump ? "Salvando..." : "Salvar bomba"}</Button></div>}
      >
        <div className="p-4 p-md-5">
          <div className="row g-3">
            <div className="col-12">
            <label className="form-label small fw-medium">Nome da bomba *</label>
            <input className="form-control" value={pumpForm.name} onChange={(e) => setPumpForm({ ...pumpForm, name: e.target.value })} placeholder="Ex.: Bomba poço 01" />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Potência (CV) *</label>
            <input className="form-control" type="number" step="0.01" value={pumpForm.power_cv} onChange={(e) => setPumpForm({ ...pumpForm, power_cv: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Potência convertida</label>
            <div className="form-control bg-light">{fmt(cvToKw(pumpForm.power_cv))} kW</div>
          </div>
          <div className="col-12">
            <label className="form-label small fw-medium">Vazão (L/h) *</label>
            <input className="form-control" type="number" step="0.01" value={pumpForm.flow_rate_l_per_h} onChange={(e) => setPumpForm({ ...pumpForm, flow_rate_l_per_h: e.target.value })} />
          </div>
        </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Editar Plantação"
        footer={
          <div className="d-flex gap-2 justify-content-end">
            <Button variant="outline-secondary" onClick={() => setShowEdit(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        }
      >
        <div className="p-4 p-md-5">
          <div className="row g-3">
            <div className="col-12">
            <label className="form-label small fw-medium">Nome</label>
            <input className="form-control" value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Cultura</label>
            <input className="form-control" value={editForm.crop_name}
              onChange={(e) => setEditForm({ ...editForm, crop_name: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Status</label>
            <select className="form-select" value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value as PlantationStatus })}>
              {statusOptions.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Variedade</label>
            <input className="form-control" value={editForm.variety}
              onChange={(e) => setEditForm({ ...editForm, variety: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Área (ha)</label>
            <input className="form-control" type="number" step="0.01" value={editForm.planted_area_ha}
              onChange={(e) => setEditForm({ ...editForm, planted_area_ha: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">População (plantas/ha)</label>
            <input className="form-control" type="number" value={editForm.population}
              onChange={(e) => setEditForm({ ...editForm, population: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Espaçamento</label>
            <input className="form-control" value={editForm.spacing}
              onChange={(e) => setEditForm({ ...editForm, spacing: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Data Plantio</label>
            <input className="form-control" type="date" value={editForm.planting_date}
              onChange={(e) => setEditForm({ ...editForm, planting_date: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Previsão Colheita</label>
            <input className="form-control" type="date" value={editForm.expected_harvest_date}
              onChange={(e) => setEditForm({ ...editForm, expected_harvest_date: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Colheita Real</label>
            <input className="form-control" type="date" value={editForm.actual_harvest_date}
              onChange={(e) => setEditForm({ ...editForm, actual_harvest_date: e.target.value })} />
          </div>
        </div>
        </div>
      </Modal>
    </div>
  );
}
