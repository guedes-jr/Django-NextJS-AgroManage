"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Search, MoreHorizontal, Sprout, Ruler, DollarSign, Calendar, Tag, FileText, MapPin, Activity, AlignLeft, AlertTriangle, Filter, Eye, Pencil, BarChart3, ChevronRight, Wheat, Leaf, Flower2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { apiClient } from "@/services/api";
import { cropService } from "@/services/cropService";
import type { Plantation } from "@/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

type FieldOption = { id: string; name: string; farm_name: string; area_ha?: string | number | null };
type FarmOption = { id: string; name: string; city?: string; state?: string };
type InventorySeedOption = {
  id: string;
  nome: string;
  categoria?: string;
  categoria_display?: string;
  estoque_atual?: string;
  unidade_medida?: string;
  unidade_display?: string;
};
type DashboardData = {
  total_plantations?: number;
  total_active?: number;
  total_area_ha?: string;
  total_estimated_production_kg?: string;
  total_investment?: string;
  total_estimated_revenue?: string;
  avg_roi?: string;
  upcoming_harvests?: number;
  status_counts?: Record<string, number>;
};

const defaultCultureOptions = [
  "Abacaxi",
  "Algodão",
  "Alface",
  "Amendoim",
  "Arroz",
  "Aveia",
  "Banana",
  "Batata",
  "Café",
  "Cana-de-açúcar",
  "Cebola",
  "Cenoura",
  "Feijão",
  "Girassol",
  "Laranja",
  "Mandioca",
  "Melancia",
  "Milheto",
  "Milho",
  "Sorgo",
  "Soja",
  "Tomate",
  "Trigo",
  "Uva",
];
const featuredCultureOptions = ["Milho", "Soja", "Feijão", "Sorgo", "Milheto", "Melancia"];

const irrigationTypeOptions = [
  { value: "", label: "Selecione..." },
  { value: "Pivô central", label: "Pivô central" },
  { value: "Gotejamento", label: "Gotejamento" },
  { value: "Aspersão", label: "Aspersão" },
  { value: "Microaspersão", label: "Microaspersão" },
  { value: "Mangueira", label: "Mangueira" },
  { value: "Sulco", label: "Sulco" },
  { value: "Inundação", label: "Inundação" },
  { value: "Outro", label: "Outro" },
];

const cropVisuals: Record<string, { image: string; icon: React.ReactNode; color: string }> = {
  milho: { image: "/images/crops/cultures/corn.png", icon: <Wheat size={18} />, color: "oklch(0.7 0.17 86)" },
  soja: { image: "/images/crops/cultures/soybean.png", icon: <Leaf size={18} />, color: "oklch(0.56 0.16 145)" },
  feijão: { image: "/images/crops/cultures/bean.png", icon: <Sprout size={18} />, color: "oklch(0.58 0.13 65)" },
  feijao: { image: "/images/crops/cultures/bean.png", icon: <Sprout size={18} />, color: "oklch(0.58 0.13 65)" },
  sorgo: { image: "/images/crops/cultures/sorghum.png", icon: <Wheat size={18} />, color: "oklch(0.58 0.15 38)" },
  milheto: { image: "/images/crops/cultures/millet.png", icon: <Flower2 size={18} />, color: "oklch(0.6 0.14 112)" },
  melancia: { image: "/images/crops/cultures/watermelon.png", icon: <Leaf size={18} />, color: "oklch(0.58 0.16 145)" },
};

const cropVisualKeywords = [
  { keys: ["milho", "corn"], visual: cropVisuals.milho },
  { keys: ["soja", "soybean"], visual: cropVisuals.soja },
  { keys: ["feijao", "feijão", "bean"], visual: cropVisuals.feijão },
  { keys: ["sorgo", "sorghum"], visual: cropVisuals.sorgo },
  { keys: ["milheto", "millet"], visual: cropVisuals.milheto },
  { keys: ["melancia", "watermelon"], visual: cropVisuals.melancia },
];

const normalizeCropName = (value: string) =>
  value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const parseDecimalInput = (value: string | number | undefined | null) => {
  if (value == null || value === "") return 0;
  const rawValue = String(value).trim();
  const normalized = rawValue.includes(",")
    ? rawValue.replace(/\./g, "").replace(",", ".")
    : rawValue;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const calculatePlantPopulation = (areaHa: string, rowSpacingM: string, plantSpacingM: string) => {
  const area = parseDecimalInput(areaHa);
  const rowSpacing = parseDecimalInput(rowSpacingM);
  const plantSpacing = parseDecimalInput(plantSpacingM);
  if (area <= 0 || rowSpacing <= 0 || plantSpacing <= 0) return "";
  return String(Math.round((area * 10000) / (rowSpacing * plantSpacing)));
};

const formatSpacing = (rowSpacingM: string, plantSpacingM: string) => {
  const parts = [];
  if (rowSpacingM) parts.push(`ruas: ${rowSpacingM} m`);
  if (plantSpacingM) parts.push(`plantas: ${plantSpacingM} m`);
  return parts.join(" | ");
};

const extractSpacingValues = (spacing?: string | null) => {
  if (!spacing) return { row: "", plant: "" };
  const values = spacing.match(/\d+(?:[,.]\d+)?/g) || [];
  if (spacing.toLowerCase().includes("ruas") || spacing.toLowerCase().includes("plantas")) {
    return { row: values[0] || "", plant: values[1] || "" };
  }
  return { plant: values[0] || "", row: values[1] || "" };
};

const isSeedInventoryItem = (item: InventorySeedOption) => {
  const text = `${item.nome} ${item.categoria || ""} ${item.categoria_display || ""}`.toLowerCase();
  return (
    text.includes("semente") ||
    ["material", "outro", "suplemento"].includes(item.categoria || "")
  );
};

function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="dashboard-card h-100" style={{ borderRadius: 8, padding: "18px 20px" }}>
      <div className="d-flex align-items-center gap-3 h-100" style={{ minHeight: 58 }}>
        <div
          className="d-flex align-items-center justify-content-center flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            color,
          }}
        >
        {icon}
        </div>
        <div className="flex-grow-1 min-w-0">
          <div className="text-muted-foreground fw-semibold mb-1" style={{ fontSize: "0.72rem" }}>{label}</div>
          <div className="fw-black text-foreground lh-sm" style={{ fontSize: "1.06rem" }}>{value}</div>
          {sub && <div className="text-muted-foreground mt-1" style={{ fontSize: "0.72rem" }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function AlertCard({ icon, title, value, color, tint }: { icon: React.ReactNode; title: string; value: string; color: string; tint: string }) {
  return (
    <button
      type="button"
      className="border-0 text-start w-100 h-100 d-flex align-items-center justify-content-between gap-3"
      style={{ background: tint, borderRadius: 8, color: "var(--foreground)", padding: "15px 16px", minHeight: 58 }}
    >
      <div className="d-flex align-items-center gap-3 min-w-0">
        <div className="flex-shrink-0 d-flex align-items-center justify-content-center" style={{ color }}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="fw-bold text-truncate" style={{ fontSize: "0.76rem" }}>{title}</div>
          <div className="text-muted-foreground" style={{ fontSize: "0.7rem" }}>{value}</div>
        </div>
      </div>
      <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
    </button>
  );
}

function CultureCard({ name, count, image, icon, color, onClick }: { name: string; count: number; image: string; icon: React.ReactNode; color: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="dashboard-card p-0 h-100 w-100 text-center border-0" style={{ borderRadius: 8, minHeight: 118 }}>
      <div className="position-relative overflow-hidden" style={{ height: 74, background: `color-mix(in srgb, ${color}, white 78%)`, borderRadius: "8px 8px 0 0" }}>
        <Image src={image} alt="" width={360} height={170} sizes="(max-width: 768px) 50vw, 180px" style={{ objectFit: "cover", width: "100%", height: "100%" }} />
        <span className="position-absolute top-0 start-0 w-100 h-100" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.12))" }} />
        <span className="position-absolute d-flex align-items-center justify-content-center shadow-sm" style={{ left: 9, top: 9, width: 26, height: 26, borderRadius: 999, background: "rgba(255,255,255,0.92)", color }}>
          {icon}
        </span>
      </div>
      <div className="px-3 py-2">
        <div className="fw-bold text-foreground text-truncate" style={{ fontSize: "0.82rem" }}>{name}</div>
        <div className="text-muted-foreground" style={{ fontSize: "0.72rem" }}>{count} plantação{count !== 1 ? "es" : ""}</div>
      </div>
    </button>
  );
}

export default function PlantacoesDashboard() {
  const router = useRouter();
  const [plantations, setPlantations] = useState<Plantation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Plantation | null>(null);
  const [form, setForm] = useState({
    field: "",
    name: "",
    crop_type: "grain",
    crop_name: "",
    variety: "",
    hybrid: "",
    planted_area_ha: "",
    seed_quantity_used: "",
    population: "",
    spacing: "",
    plant_spacing_m: "",
    row_spacing_m: "",
    planting_date: "",
    expected_harvest_days: "",
    expected_harvest_date: "",
    status: "planned" as PlantationStatus,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [farms, setFarms] = useState<FarmOption[]>([]);
  const [seedItems, setSeedItems] = useState<InventorySeedOption[]>([]);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [savingField, setSavingField] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [fieldForm, setFieldForm] = useState({
    farm: "",
    name: "",
    area_ha: "",
    soil_type: "",
    irrigation_type: "",
    notes: "",
  });
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const { data } = await cropService.getDashboard();
      setDashboardData(data);
    } catch {
      // silent
    }
  }, []);

  const fetchPlantations = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { page, page_size: 25 };
      if (search) params.search = search;
      const { data } = await cropService.list(params);
      setPlantations(data.results || data);
    } catch {
      console.error("Failed to load plantations");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  const fetchFields = useCallback(async () => {
    try {
      const { data } = await cropService.listFields({ page_size: 200 });
      setFields(data.results || data);
    } catch {
      console.error("Failed to load fields");
    }
  }, []);

  const fetchFarms = useCallback(async () => {
    try {
      const { data } = await cropService.listFarms({ page_size: 200 });
      const loadedFarms = data.results || data;
      setFarms(loadedFarms);
      if (loadedFarms.length === 1) {
        setFieldForm((current) => ({ ...current, farm: current.farm || loadedFarms[0].id }));
      }
    } catch {
      console.error("Failed to load farms");
    }
  }, []);

  const fetchSeedItems = useCallback(async () => {
    try {
      const { data } = await apiClient.get<InventorySeedOption[]>("/inventory/items/all_items/");
      setSeedItems(Array.isArray(data) ? data.filter(isSeedInventoryItem) : []);
    } catch {
      console.error("Failed to load seed inventory items");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboard();
  }, [fetchDashboard]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPlantations();
  }, [fetchPlantations]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFields();
  }, [fetchFields]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFarms();
  }, [fetchFarms]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSeedItems();
  }, [fetchSeedItems]);

  const openCreate = () => {
    setEditing(null);
    setFormError("");
    setForm({ field: "", name: "", crop_type: "grain", crop_name: "", variety: "", hybrid: "", planted_area_ha: "", seed_quantity_used: "", population: "", spacing: "", plant_spacing_m: "", row_spacing_m: "", planting_date: "", expected_harvest_days: "", expected_harvest_date: "", status: "planned", notes: "" });
    setShowModal(true);
  };

  const openEdit = (p: Plantation) => {
    const spacingValues = extractSpacingValues(p.spacing);
    setEditing(p);
    setFormError("");
    setForm({
      field: p.field || "",
      name: p.name || "",
      crop_type: p.crop_type || "grain",
      crop_name: p.crop_name || "",
      variety: p.variety || "",
      hybrid: p.hybrid || "",
      planted_area_ha: p.planted_area_ha || "",
      seed_quantity_used: p.seed_quantity_used || "",
      population: p.population?.toString() || "",
      spacing: p.spacing || "",
      plant_spacing_m: spacingValues.plant,
      row_spacing_m: spacingValues.row,
      planting_date: p.planting_date || "",
      expected_harvest_days: calculateDaysBetween(p.planting_date, p.expected_harvest_date),
      expected_harvest_date: p.expected_harvest_date || "",
      status: p.status || "planned",
      notes: p.notes || "",
    });
    setShowModal(true);
  };

  const openFieldCreate = () => {
    setFieldError("");
    setFieldForm({
      farm: farms.length === 1 ? farms[0].id : "",
      name: "",
      area_ha: "",
      soil_type: "",
      irrigation_type: "",
      notes: "",
    });
    setShowFieldModal(true);
  };

  const handleCreateField = async () => {
    if (!fieldForm.farm || !fieldForm.name || !fieldForm.area_ha) {
      setFieldError("Informe propriedade, nome e área do talhão.");
      return;
    }

    try {
      setSavingField(true);
      setFieldError("");
      const payload = {
        ...fieldForm,
        area_ha: Number(fieldForm.area_ha),
        soil_type: fieldForm.soil_type.trim(),
        irrigation_type: fieldForm.irrigation_type.trim(),
        notes: fieldForm.notes.trim(),
      };
      const { data: newField } = await cropService.createField(payload);
      const { data } = await cropService.listFields({ page_size: 200 });
      setFields(data.results || data);
      setForm((current) => ({ ...current, field: newField.id }));
      setShowFieldModal(false);
    } catch (err: unknown) {
      const detail = err && typeof err === "object" && "response" in err
        ? (err.response as { data?: Record<string, unknown> }).data
        : null;
      const firstError = detail && typeof detail === "object" ? Object.values(detail)[0] : null;
      setFieldError(Array.isArray(firstError) ? String(firstError[0]) : "Não foi possível criar o talhão.");
    } finally {
      setSavingField(false);
    }
  };

  const handleSave = async () => {
    if (!form.crop_name || !form.name || !form.field || !form.planting_date) {
      setFormError("Informe cultura, nome da plantação, talhão e data do plantio.");
      return;
    }

    try {
      setSaving(true);
      setFormError("");
      const calculatedExpectedHarvestDate = addDaysToDate(form.planting_date, form.expected_harvest_days);
      const calculatedPopulation = calculatePlantPopulation(form.planted_area_ha, form.row_spacing_m, form.plant_spacing_m);
      const formattedSpacing = formatSpacing(form.row_spacing_m, form.plant_spacing_m);
      const formPayload: Omit<typeof form, "expected_harvest_days" | "plant_spacing_m" | "row_spacing_m"> = {
        field: form.field,
        name: form.name,
        crop_type: form.crop_type,
        crop_name: form.crop_name,
        variety: form.variety,
        hybrid: form.hybrid,
        planted_area_ha: form.planted_area_ha,
        seed_quantity_used: form.seed_quantity_used,
        population: calculatedPopulation || form.population,
        spacing: formattedSpacing || form.spacing,
        planting_date: form.planting_date,
        expected_harvest_date: form.expected_harvest_date,
        status: form.status,
        notes: form.notes,
      };
      const payload = {
        ...formPayload,
        planted_area_ha: form.planted_area_ha ? Number(form.planted_area_ha) : null,
        seed_quantity_used: form.seed_quantity_used ? Number(form.seed_quantity_used) : null,
        population: formPayload.population ? Number(formPayload.population) : null,
        expected_harvest_date: calculatedExpectedHarvestDate || null,
      };
      if (editing) {
        await cropService.update(editing.id, payload);
      } else {
        await cropService.create(payload);
      }
      setShowModal(false);
      fetchPlantations();
      fetchDashboard();
    } catch (err) {
      console.error("Failed to save", err);
    } finally {
      setSaving(false);
    }
  };

  const fmt = (v: string | number | undefined | null) => {
    if (v == null) return "-";
    const n = typeof v === "string" ? parseFloat(v) : v;
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const money = (v: string | number | undefined | null) => {
    if (v == null) return "-";
    const n = typeof v === "string" ? parseFloat(v) : v;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const parseNumber = (value: string | number | undefined | null) => {
    if (value == null || value === "") return 0;
    const n = typeof value === "string" ? Number(value) : value;
    return Number.isFinite(n) ? n : 0;
  };

  const formatCompactNumber = (value: string | number | undefined | null) => {
    const n = parseNumber(value);
    if (!n) return "-";
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  };

  const formatDate = (value: string | null | undefined) => (
    value ? new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR") : "-"
  );

  const addDaysToDate = (date: string, days: string) => {
    const parsedDays = Number(days);
    if (!date || !Number.isFinite(parsedDays) || parsedDays <= 0) return "";
    const d = new Date(`${date}T12:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + parsedDays);
    return d.toISOString().split("T")[0];
  };

  const calculateDaysBetween = (startDate?: string | null, endDate?: string | null) => {
    if (!startDate || !endDate) return "";
    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
    const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
    return diff > 0 ? String(diff) : "";
  };

  const getHarvestYear = (plantingDate: string | null | undefined) => {
    if (!plantingDate) return "-";
    const year = new Date(`${plantingDate}T00:00:00`).getFullYear();
    return `${year}/${String(year + 1).slice(-2)}`;
  };

  const getCropVisual = (cropName: string | undefined) => {
    const key = normalizeCropName(cropName || "");
    const matched = cropVisualKeywords.find((item) => item.keys.some((keyword) => key.includes(normalizeCropName(keyword))));
    return matched?.visual || { image: "/images/crops/cultures/soybean.png", icon: <Sprout size={18} />, color: "oklch(0.58 0.16 145)" };
  };

  const getNextActivity = (plantation: Plantation) => {
    if (plantation.status === "planned") return { title: "Início do plantio", date: plantation.planting_date };
    if (plantation.status === "harvesting") return { title: "Colheita em andamento", date: plantation.expected_harvest_date };
    if (plantation.status === "finished") return { title: "Ciclo concluído", date: plantation.actual_harvest_date };
    if (plantation.status === "cancelled") return { title: "Ciclo cancelado", date: plantation.actual_harvest_date || plantation.expected_harvest_date };
    return { title: "Colheita prevista", date: plantation.expected_harvest_date };
  };

  const cultureCards = useMemo(() => {
    return featuredCultureOptions.map((name) => {
      const normalizedName = normalizeCropName(name);
      const count = plantations.filter((plantation) =>
        normalizeCropName(plantation.crop_name || "").includes(normalizedName)
      ).length;
      const visual = getCropVisual(name);
      return { name, count, ...visual };
    });
  }, [plantations]);

  const cultureOptions = useMemo(() => {
    const names = new Set(defaultCultureOptions);
    plantations.forEach((plantation) => {
      const crop = plantation.crop_name?.trim();
      if (crop) names.add(crop);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [plantations]);

  const varietyOptions = useMemo(() => {
    const names = new Set(seedItems.map((item) => item.nome).filter(Boolean));
    if (form.variety) names.add(form.variety);
    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [form.variety, seedItems]);

  const getSeedItemLabel = (name: string) => {
    const item = seedItems.find((seed) => seed.nome === name);
    if (!item) return name;
    const unit = item.unidade_display || item.unidade_medida || "";
    const stock = item.estoque_atual ? ` - estoque: ${item.estoque_atual}${unit ? ` ${unit}` : ""}` : "";
    return `${item.nome}${stock}`;
  };

  const areaPlanted = dashboardData?.total_area_ha || plantations.reduce((total, plantation) => total + parseNumber(plantation.planted_area_ha), 0);
  const totalArea = fields.reduce((total, field) => total + parseNumber(field.area_ha), 0);
  const missingAreaCount = plantations.filter((plantation) => !parseNumber(plantation.planted_area_ha)).length;
  const missingFieldCount = fields.length === 0 ? 1 : 0;
  const realAlerts = [
    ...(dashboardData?.upcoming_harvests
      ? [{ icon: <AlertTriangle size={24} />, title: "Colheita próxima", value: `${dashboardData.upcoming_harvests} plantação${dashboardData.upcoming_harvests === 1 ? "" : "es"}`, color: "oklch(0.62 0.17 32)", tint: "oklch(0.98 0.025 48)" }]
      : []),
    ...(missingAreaCount
      ? [{ icon: <Ruler size={24} />, title: "Área não informada", value: `${missingAreaCount} plantação${missingAreaCount === 1 ? "" : "es"}`, color: "oklch(0.72 0.18 78)", tint: "oklch(0.98 0.025 82)" }]
      : []),
    ...(missingFieldCount
      ? [{ icon: <MapPin size={24} />, title: "Nenhum talhão cadastrado", value: "Cadastre um talhão para iniciar", color: "oklch(0.55 0.15 288)", tint: "oklch(0.97 0.025 292)" }]
      : []),
  ];
  const selectedField = fields.find((field) => field.id === form.field);
  const formVisual = getCropVisual(form.crop_name || form.name);
  const formHarvestYear = getHarvestYear(form.planting_date);
  const calculatedExpectedHarvestDate = addDaysToDate(form.planting_date, form.expected_harvest_days);
  const calculatedPopulation = calculatePlantPopulation(form.planted_area_ha, form.row_spacing_m, form.plant_spacing_m);
  const displayedPopulation = calculatedPopulation || form.population;
  const formNextActivity = calculatedExpectedHarvestDate ? `Colheita em ${formatDate(calculatedExpectedHarvestDate)}` : "Informe os dias previstos";

  return (
    <div style={{ maxWidth: 1500, margin: "0 auto" }}>
      <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 mb-4">
        <div className="d-flex align-items-start gap-3">
          <span className="d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 30, height: 30, color: "var(--primary)" }}>
            <Sprout size={28} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="fw-black mb-1 text-foreground" style={{ fontSize: "1.52rem", letterSpacing: 0, lineHeight: 1.1 }}>Plantações</h1>
            <p className="mb-0 text-muted-foreground" style={{ fontSize: "0.86rem" }}>Gerencie todas as culturas e ciclos produtivos da fazenda.</p>
          </div>
        </div>
        <Button variant="agro" onClick={openCreate} className="align-self-start align-self-md-center" style={{ borderRadius: 8, height: 38, paddingInline: 18, fontSize: "0.84rem" }}>
          <Plus size={16} /> Nova Plantação
        </Button>
      </div>

      <div className="dashboard-card mb-3" style={{ borderRadius: 8, padding: "14px 18px" }}>
        <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
          <div className="d-flex align-items-center gap-2">
            <AlertTriangle size={17} style={{ color: "oklch(0.72 0.18 78)" }} />
            <h2 className="fw-bold mb-0" style={{ fontSize: "1rem" }}>Alertas</h2>
          </div>
          <span className="text-muted-foreground fw-semibold" style={{ fontSize: "0.75rem" }}>{realAlerts.length} alerta{realAlerts.length === 1 ? "" : "s"}</span>
        </div>
        {realAlerts.length === 0 ? (
          <div className="text-muted-foreground small">Nenhum alerta real para as plantações cadastradas.</div>
        ) : (
          <div className="row g-3">
            {realAlerts.map((alert) => (
              <div key={alert.title} className="col-12 col-md-6 col-xl">
                <AlertCard icon={alert.icon} title={alert.title} value={alert.value} color={alert.color} tint={alert.tint} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="row g-3 mb-3">
        <div className="col-12 col-md-6 col-xl-2">
          <KpiCard color="oklch(0.58 0.16 145)" icon={<Ruler size={22} />} label="Área Total" value={totalArea ? `${fmt(totalArea)} ha` : "-"} sub={`${fields.length || "-"} talhões`} />
        </div>
        <div className="col-12 col-md-6 col-xl-2">
          <KpiCard color="oklch(0.58 0.16 145)" icon={<Sprout size={22} />} label="Área Plantada" value={areaPlanted ? `${fmt(areaPlanted)} ha` : "-"} sub={totalArea ? `${Math.round((parseNumber(areaPlanted) / totalArea) * 100)}% do total` : "Área cadastrada"} />
        </div>
        <div className="col-12 col-md-6 col-xl-2">
          <KpiCard color="oklch(0.54 0.15 145)" icon={<Leaf size={22} />} label="Em Desenvolvimento" value={`${dashboardData?.total_active ?? plantations.length} plantações`} sub="Ativas no ciclo" />
        </div>
        <div className="col-12 col-md-6 col-xl-2">
          <KpiCard color="oklch(0.53 0.14 145)" icon={<DollarSign size={22} />} label="Investimento" value={dashboardData?.total_investment ? money(dashboardData.total_investment) : "-"} sub="Total investido" />
        </div>
        <div className="col-12 col-md-6 col-xl-2">
          <KpiCard color="oklch(0.55 0.14 150)" icon={<BarChart3 size={22} />} label="Receita Estimada" value={dashboardData?.total_estimated_revenue ? money(dashboardData.total_estimated_revenue) : "-"} sub="Estimativa total" />
        </div>
        <div className="col-12 col-md-6 col-xl-2">
          <KpiCard color="oklch(0.52 0.12 145)" icon={<Calendar size={22} />} label="Colheitas (30d)" value={String(dashboardData?.upcoming_harvests ?? 0)} sub="Agendadas" />
        </div>
      </div>

      <div className="dashboard-card mb-3" style={{ borderRadius: 8, padding: "14px 18px" }}>
        <div className="mb-2">
          <h2 className="fw-bold mb-1" style={{ fontSize: "1rem" }}>Culturas</h2>
          <p className="text-muted-foreground mb-0" style={{ fontSize: "0.8rem" }}>Use as culturas como filtro das plantações cadastradas</p>
        </div>
        <div className="row g-3">
          {(cultureCards.length ? cultureCards : [
            { name: "Milho", count: 0, ...getCropVisual("Milho") },
            { name: "Soja", count: 0, ...getCropVisual("Soja") },
            { name: "Feijão", count: 0, ...getCropVisual("Feijão") },
            { name: "Sorgo", count: 0, ...getCropVisual("Sorgo") },
            { name: "Milheto", count: 0, ...getCropVisual("Milheto") },
          ]).map((culture) => (
            <div key={culture.name} className="col-6 col-md-4 col-xl">
              <CultureCard
                name={culture.name}
                count={culture.count}
                image={culture.image}
                icon={culture.icon}
                color={culture.color}
                onClick={() => setSearch(culture.count ? culture.name : "")}
              />
            </div>
          ))}
          <div className="col-6 col-md-4 col-xl">
            <button type="button" onClick={openCreate} className="h-100 w-100 border bg-transparent d-flex flex-column align-items-center justify-content-center gap-2" style={{ minHeight: 118, borderRadius: 8, borderStyle: "dashed" }}>
              <span className="d-flex align-items-center justify-content-center" style={{ width: 38, height: 38, borderRadius: 999, background: "var(--primary)", color: "white" }}>
                <Plus size={22} />
              </span>
              <span className="fw-bold text-primary" style={{ fontSize: "0.82rem" }}>Nova Plantação</span>
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-card overflow-hidden mb-4" style={{ borderRadius: 8 }}>
        <div className="d-flex flex-column flex-xl-row align-items-xl-center justify-content-between gap-3 px-3 px-lg-4 py-3">
          <div>
            <h2 className="fw-bold mb-1" style={{ fontSize: "1rem" }}>Plantações cadastradas</h2>
            <p className="text-muted-foreground mb-0" style={{ fontSize: "0.8rem" }}>Acompanhe todas as plantações da fazenda</p>
          </div>
          <div className="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2">
            <div className="position-relative" style={{ minWidth: 240 }}>
              <Search size={15} className="position-absolute text-muted-foreground" style={{ left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input
                className="form-control shadow-none"
                placeholder="Buscar plantação..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                style={{ paddingLeft: 36, height: 36, borderRadius: 7, borderColor: "var(--border)", background: "var(--muted)", fontSize: "0.82rem" }}
              />
            </div>
            <button type="button" className="btn btn-light border d-inline-flex align-items-center justify-content-center gap-2 fw-semibold" style={{ height: 36, borderRadius: 7, fontSize: "0.82rem" }}>
              <Filter size={15} /> Filtrar
            </button>
            <select className="form-select shadow-none fw-semibold" style={{ height: 36, borderRadius: 7, borderColor: "var(--border)", fontSize: "0.82rem", width: "auto" }} defaultValue="recent">
              <option value="recent">Mais recentes</option>
              <option value="area">Maior área</option>
              <option value="harvest">Próxima colheita</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-5 text-center text-muted-foreground fw-medium">Carregando plantações...</div>
        ) : plantations.length === 0 ? (
          <div className="p-5 text-center">
            <Sprout size={42} className="text-muted-foreground opacity-50 mb-3" />
            <h3 className="fw-bold text-foreground mb-1" style={{ fontSize: "1rem" }}>Nenhuma plantação encontrada</h3>
            <p className="text-muted-foreground mb-0 small">Crie a primeira plantação para iniciar o acompanhamento da safra.</p>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="table mb-0 align-middle text-nowrap" style={{ minWidth: 760 }}>
                <thead>
                  <tr className="text-muted-foreground" style={{ fontSize: "0.68rem", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "oklch(0.99 0.005 140)" }}>
                    <th className="border-0 ps-4 py-2 fw-bold">Plantação / Cultura</th>
                    <th className="border-0 py-2 fw-bold">Safra</th>
                    <th className="border-0 py-2 fw-bold">Área (ha)</th>
                    <th className="border-0 py-2 fw-bold">Pés / Plantas</th>
                    <th className="border-0 py-2 fw-bold">Variedade</th>
                    <th className="border-0 py-2 fw-bold">Próxima Atividade</th>
                    <th className="border-0 py-2 pe-4 fw-bold text-end">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {plantations.map((plantation) => {
                    const visual = getCropVisual(plantation.crop_name);
                    const nextActivity = getNextActivity(plantation);

                    return (
                      <tr key={plantation.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => router.push(`/home/plantacoes/${plantation.id}`)}>
                        <td className="ps-4 py-2">
                          <div className="d-flex align-items-center gap-2">
                            <span className="position-relative overflow-hidden d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 44, height: 34, borderRadius: 7, background: `color-mix(in srgb, ${visual.color}, transparent 88%)`, color: visual.color }}>
                              <Image src={visual.image} alt="" width={88} height={68} sizes="44px" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              <span className="position-absolute start-0 top-0 w-100 h-100" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.18))" }} />
                            </span>
                            <div>
                              <div className="fw-bold text-foreground" style={{ fontSize: "0.8rem" }}>{plantation.name || "Plantação sem nome"}</div>
                              <div className="text-muted-foreground" style={{ fontSize: "0.7rem" }}>{plantation.crop_name || "Cultura não informada"} · {plantation.field_name || "Talhão não informado"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="fw-semibold text-foreground" style={{ fontSize: "0.78rem" }}>{getHarvestYear(plantation.planting_date)}</td>
                        <td className="text-muted-foreground fw-semibold" style={{ fontSize: "0.78rem" }}>{fmt(plantation.planted_area_ha)}</td>
                        <td style={{ fontSize: "0.76rem" }}>
                          <div className="fw-bold text-foreground">{formatCompactNumber(plantation.population)}</div>
                          <div className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>plantas</div>
                        </td>
                        <td className="text-muted-foreground fw-semibold" style={{ fontSize: "0.78rem" }}>{plantation.variety || "-"}</td>
                        <td style={{ fontSize: "0.74rem" }}>
                          <div className="fw-bold text-foreground">{nextActivity.title}</div>
                          <div className="text-muted-foreground">{formatDate(nextActivity.date)}</div>
                        </td>
                        <td className="pe-4 text-end" onClick={(e) => e.stopPropagation()}>
                          <div className="d-flex align-items-center justify-content-end gap-1">
                            <button type="button" className="btn btn-sm border-0 text-primary p-1" title="Ver detalhes" onClick={() => router.push(`/home/plantacoes/${plantation.id}`)}><Eye size={15} /></button>
                            <button type="button" className="btn btn-sm border-0 text-primary p-1" title="Editar" onClick={() => openEdit(plantation)}><Pencil size={15} /></button>
                            <button type="button" className="btn btn-sm border-0 text-muted-foreground p-1" title="Mais ações"><MoreHorizontal size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="d-flex flex-column flex-md-row align-items-center justify-content-between gap-3 px-4 py-3 border-top border-border">
              <span className="text-muted-foreground" style={{ fontSize: "0.76rem" }}>Mostrando 1 a {plantations.length} de {plantations.length} plantações</span>
              <div className="d-flex align-items-center gap-2">
                <button type="button" className="btn btn-sm btn-light border-0 text-muted-foreground" style={{ fontSize: "0.74rem" }} disabled>Anterior</button>
                <button type="button" className="btn btn-sm fw-bold" style={{ background: "var(--primary)", color: "white", minWidth: 30, height: 30, fontSize: "0.74rem" }}>1</button>
                <button type="button" className="btn btn-sm btn-light border-0 text-muted-foreground" style={{ fontSize: "0.74rem" }} disabled>Próxima</button>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)}
        title={editing ? "Editar Plantação" : "Nova Plantação"}
        description="Cadastre a cultura, talhão e dados da safra exibidos no painel de plantações."
        maxWidth="max-w-4xl"
        footer={
          <div className="d-flex flex-column flex-md-row gap-2 w-100 w-md-auto ms-auto">
            <Button variant="outline-secondary" onClick={() => setShowModal(false)} className="px-4 border-border bg-background hover-bg-muted fw-semibold w-100 w-md-auto order-2 order-md-1">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="px-5 fw-bold shadow-sm w-100 w-md-auto order-1 order-md-2" style={{ background: "var(--primary)", color: "white" }}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        }
      >
        <div className="p-4 p-md-5" style={{ background: "var(--background)" }}>
          {formError && (
            <div className="alert alert-danger small mb-4">
              {formError}
            </div>
          )}
          <div className="dashboard-card overflow-hidden mb-4" style={{ borderRadius: 8 }}>
            <div className="row g-0 align-items-stretch">
              <div className="col-12 col-md-4">
                <div className="position-relative h-100" style={{ minHeight: 150, background: `color-mix(in srgb, ${formVisual.color}, white 80%)` }}>
                  <Image src={formVisual.image} alt="" width={560} height={300} sizes="(max-width: 768px) 100vw, 280px" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }} />
                  <span className="position-absolute top-0 start-0 w-100 h-100" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.28))" }} />
                  <span className="position-absolute d-flex align-items-center justify-content-center" style={{ left: 14, top: 14, width: 34, height: 34, borderRadius: 999, background: "rgba(255,255,255,0.92)", color: formVisual.color }}>
                    {formVisual.icon}
                  </span>
                </div>
              </div>
              <div className="col-12 col-md-8">
                <div className="p-3 p-md-4 h-100 d-flex flex-column justify-content-between">
                  <div>
                    <div className="text-muted-foreground fw-semibold mb-1" style={{ fontSize: "0.72rem" }}>Prévia da plantação cadastrada</div>
                    <h3 className="fw-black mb-1 text-foreground" style={{ fontSize: "1.18rem" }}>
                      {form.name || "Nome da plantação / safra"}
                    </h3>
                    <div className="text-muted-foreground" style={{ fontSize: "0.82rem" }}>
                      {form.crop_name || "Cultura não selecionada"} · {selectedField?.name || "Talhão não selecionado"} · Safra {formHarvestYear}
                    </div>
                  </div>
                  <div className="row g-2 mt-3">
                    <div className="col-6 col-lg-3">
                      <div className="rounded-3 p-2" style={{ background: "oklch(0.97 0.015 145)" }}>
                        <div className="text-muted-foreground" style={{ fontSize: "0.66rem" }}>Área</div>
                        <div className="fw-bold" style={{ fontSize: "0.82rem" }}>{form.planted_area_ha || "0,00"} ha</div>
                      </div>
                    </div>
                    <div className="col-6 col-lg-3">
                      <div className="rounded-3 p-2" style={{ background: "oklch(0.97 0.015 145)" }}>
                        <div className="text-muted-foreground" style={{ fontSize: "0.66rem" }}>Plantas</div>
                        <div className="fw-bold" style={{ fontSize: "0.82rem" }}>{displayedPopulation ? formatCompactNumber(displayedPopulation) : "-"}</div>
                      </div>
                    </div>
                    <div className="col-6 col-lg-3">
                      <div className="rounded-3 p-2" style={{ background: "oklch(0.97 0.015 145)" }}>
                        <div className="text-muted-foreground" style={{ fontSize: "0.66rem" }}>Colheita</div>
                        <div className="fw-bold" style={{ fontSize: "0.82rem" }}>{formatDate(calculatedExpectedHarvestDate)}</div>
                      </div>
                    </div>
                    <div className="col-6 col-lg-3">
                      <div className="rounded-3 p-2" style={{ background: "oklch(0.97 0.015 145)" }}>
                        <div className="text-muted-foreground" style={{ fontSize: "0.66rem" }}>Próxima atividade</div>
                        <div className="fw-bold text-truncate" style={{ fontSize: "0.82rem" }}>{formNextActivity}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2 mb-3">
            <Sprout size={17} style={{ color: "var(--primary)" }} />
            <h4 className="fw-bold mb-0" style={{ fontSize: "0.95rem" }}>Identificação da plantação</h4>
          </div>
          <div className="row g-3 mb-4">
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Cultura agrícola <span className="text-danger">*</span></label>
                <div className="login-input-wrapper">
                  <select className="login-input login-input-icon-left bg-white text-foreground" value={form.crop_name} onChange={(e) => setForm({ ...form, crop_name: e.target.value })} required>
                    <option value="">Selecione a cultura...</option>
                    {cultureOptions.map((culture) => (
                      <option key={culture} value={culture}>{culture}</option>
                    ))}
                  </select>
                  <Sprout className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Nome da plantação / safra <span className="text-danger">*</span></label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-foreground" placeholder="Ex: Safra Verão 2025 - Talhão 01" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <FileText className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Talhão <span className="text-danger">*</span></label>
                <div className="d-flex gap-2 align-items-stretch">
                  <div className="login-input-wrapper flex-grow-1">
                    <select className="login-input login-input-icon-left bg-white text-foreground" value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} required>
                      <option value="">{fields.length ? "Selecione..." : "Nenhum talhão cadastrado"}</option>
                      {fields.map((f) => (<option key={f.id} value={f.id}>{f.name} ({f.farm_name})</option>))}
                    </select>
                    <MapPin className="login-input-icon text-muted-foreground" size={16} />
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline-agro d-flex align-items-center justify-content-center"
                    style={{ width: 46, minWidth: 46, borderRadius: 8 }}
                    onClick={openFieldCreate}
                    title="Criar talhão"
                    aria-label="Criar talhão"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Tipo de cultura <span className="text-danger">*</span></label>
                <div className="login-input-wrapper">
                  <select className="login-input login-input-icon-left bg-white text-foreground" value={form.crop_type} onChange={(e) => setForm({ ...form, crop_type: e.target.value })}>
                    {cropService.cropTypeChoices.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                  </select>
                  <Tag className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2 mb-3">
            <Calendar size={17} style={{ color: "var(--primary)" }} />
            <h4 className="fw-bold mb-0" style={{ fontSize: "0.95rem" }}>Dados da safra</h4>
          </div>
          <div className="row g-3 mb-4">
            <div className="col-12 col-md-4">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Data do plantio <span className="text-danger">*</span></label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-muted-foreground" type="date" value={form.planting_date} onChange={(e) => setForm({ ...form, planting_date: e.target.value })} required />
                  <Calendar className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Dias previstos até a colheita</label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-muted-foreground" type="number" min="1" step="1" placeholder="Ex: 90" value={form.expected_harvest_days} onChange={(e) => setForm({ ...form, expected_harvest_days: e.target.value })} />
                  <Calendar className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Data da colheita automática</label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-muted-foreground" type="date" value={calculatedExpectedHarvestDate} readOnly disabled />
                  <Activity className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Área plantada (ha)</label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-foreground" type="number" step="0.01" placeholder="0.00" value={form.planted_area_ha} onChange={(e) => setForm({ ...form, planted_area_ha: e.target.value })} />
                  <Ruler className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Pés / plantas</label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-muted-foreground" type="number" min="0" step="1" placeholder="Calculado automaticamente" value={displayedPopulation} readOnly disabled />
                  <Leaf className="login-input-icon text-muted-foreground" size={16} />
                </div>
                <div className="text-muted-foreground mt-1" style={{ fontSize: "0.72rem" }}>Calculado pela área plantada e espaçamentos.</div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Sementes utilizadas</label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-foreground" type="number" min="0" step="0.01" placeholder="Ex: 25,00" value={form.seed_quantity_used} onChange={(e) => setForm({ ...form, seed_quantity_used: e.target.value })} />
                  <Wheat className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Espaçamento entre plantas</label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-foreground" inputMode="decimal" placeholder="Ex: 0,50" value={form.plant_spacing_m} onChange={(e) => setForm({ ...form, plant_spacing_m: e.target.value })} />
                  <Ruler className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Espaçamento entre ruas</label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-foreground" inputMode="decimal" placeholder="Ex: 1,00" value={form.row_spacing_m} onChange={(e) => setForm({ ...form, row_spacing_m: e.target.value })} />
                  <Ruler className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2 mb-3">
            <Tag size={17} style={{ color: "var(--primary)" }} />
            <h4 className="fw-bold mb-0" style={{ fontSize: "0.95rem" }}>Variedade e observações</h4>
          </div>
          <div className="row g-3">
            <div className="col-12">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Variedade</label>
                <div className="login-input-wrapper">
                  <select className="login-input login-input-icon-left bg-white text-foreground" value={form.variety} onChange={(e) => setForm({ ...form, variety: e.target.value })}>
                    <option value="">{varietyOptions.length ? "Selecione a variedade do estoque..." : "Nenhuma semente encontrada no estoque"}</option>
                    {varietyOptions.map((variety) => (
                      <option key={variety} value={variety}>{getSeedItemLabel(variety)}</option>
                    ))}
                  </select>
                  <Tag className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Observações</label>
                <div className="login-input-wrapper">
                  <textarea className="login-input login-input-icon-left bg-white text-foreground" style={{ minHeight: "82px", paddingTop: "0.75rem", paddingLeft: "2.5rem" }} placeholder="Detalhes da implantação, recomendações ou pontos de atenção..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  <AlignLeft className="login-input-icon text-muted-foreground" style={{ top: "1rem", transform: "none" }} size={16} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showFieldModal} onClose={() => setShowFieldModal(false)}
        title="Novo Talhão"
        description="Cadastre o talhão e ele será selecionado na plantação atual."
        maxWidth="max-w-xl"
        footer={
          <div className="d-flex flex-column flex-md-row gap-2 w-100 w-md-auto ms-auto">
            <Button variant="outline-secondary" onClick={() => setShowFieldModal(false)} className="px-4 border-border bg-background hover-bg-muted fw-semibold w-100 w-md-auto order-2 order-md-1">
              Cancelar
            </Button>
            <Button onClick={handleCreateField} disabled={savingField || farms.length === 0} className="px-5 fw-bold shadow-sm w-100 w-md-auto order-1 order-md-2" style={{ background: "var(--primary)", color: "white" }}>
              {savingField ? "Salvando..." : "Criar Talhão"}
            </Button>
          </div>
        }
      >
        <div className="p-4 p-md-5" style={{ background: "var(--background)" }}>
          {farms.length === 0 && (
            <div className="alert alert-warning small mb-4">
              Cadastre uma propriedade antes de criar talhões.
            </div>
          )}
          {fieldError && (
            <div className="alert alert-danger small mb-4">
              {fieldError}
            </div>
          )}
          <div className="row g-4">
            <div className="col-12">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Propriedade <span className="text-danger">*</span></label>
                <div className="login-input-wrapper">
                  <select className="login-input login-input-icon-left bg-white text-foreground" value={fieldForm.farm} onChange={(e) => setFieldForm({ ...fieldForm, farm: e.target.value })} disabled={farms.length === 0} required>
                    <option value="">{farms.length ? "Selecione..." : "Nenhuma propriedade disponível"}</option>
                    {farms.map((farm) => (
                      <option key={farm.id} value={farm.id}>
                        {farm.name}{farm.city || farm.state ? ` (${[farm.city, farm.state].filter(Boolean).join(" - ")})` : ""}
                      </option>
                    ))}
                  </select>
                  <MapPin className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Nome do Talhão <span className="text-danger">*</span></label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-foreground" placeholder="Ex: Talhão 01" value={fieldForm.name} onChange={(e) => setFieldForm({ ...fieldForm, name: e.target.value })} required />
                  <FileText className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Área (ha) <span className="text-danger">*</span></label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-foreground" type="number" step="0.01" min="0" placeholder="0.00" value={fieldForm.area_ha} onChange={(e) => setFieldForm({ ...fieldForm, area_ha: e.target.value })} required />
                  <Ruler className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Tipo de Solo</label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-foreground" placeholder="Ex: Argiloso" value={fieldForm.soil_type} onChange={(e) => setFieldForm({ ...fieldForm, soil_type: e.target.value })} />
                  <Tag className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Irrigação</label>
                <div className="login-input-wrapper">
                  <select className="login-input login-input-icon-left bg-white text-foreground" value={fieldForm.irrigation_type} onChange={(e) => setFieldForm({ ...fieldForm, irrigation_type: e.target.value })}>
                    {irrigationTypeOptions.map((option) => (
                      <option key={option.value || "empty"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <Activity className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Observações</label>
                <div className="login-input-wrapper">
                  <textarea className="login-input login-input-icon-left bg-white text-foreground" style={{ minHeight: "76px", paddingTop: "0.75rem", paddingLeft: "2.5rem" }} placeholder="Detalhes do talhão..." value={fieldForm.notes} onChange={(e) => setFieldForm({ ...fieldForm, notes: e.target.value })} />
                  <AlignLeft className="login-input-icon text-muted-foreground" style={{ top: "1rem", transform: "none" }} size={16} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
