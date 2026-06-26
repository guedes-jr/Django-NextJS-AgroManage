"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Beaker,
  Calendar,
  ClipboardCheck,
  Droplets,
  FileText,
  FlaskConical,
  Leaf,
  Search,
  Sprout,
  Tractor,
  Users,
  Wheat,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cropService } from "@/services/cropService";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

type Plantation = {
  id: string;
  name?: string;
  crop_name?: string;
  field_name?: string;
  farm_name?: string;
  planting_date?: string;
  expected_harvest_date?: string | null;
  status_display?: string;
  planted_area_ha?: string | number | null;
};

type ApiList<T> = T[] | { results?: T[] };

type BaseRecord = {
  id: string;
  created_at?: string;
  updated_at?: string;
  notes?: string | null;
};

type LandPreparation = BaseRecord & {
  date?: string | null;
  operation_type_display?: string | null;
  execution_type_display?: string | null;
  tractor_name?: string | null;
  hours_worked?: string | number | null;
  total_price?: string | number | null;
  operator?: string | null;
};

type Planting = BaseRecord & {
  planting_date?: string | null;
  item_name?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  total_price?: string | number | null;
  operator?: string | null;
};

type Application = BaseRecord & {
  application_date?: string | null;
  item_name?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  dose_per_ha?: string | number | null;
  total_price?: string | number | null;
  application_method_display?: string | null;
  pesticide_type_display?: string | null;
  target?: string | null;
  operator?: string | null;
};

type Irrigation = BaseRecord & {
  date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  irrigation_system_display?: string | null;
  pump_name?: string | null;
  operating_days?: number | null;
  hours?: string | number | null;
  liters_used?: string | number | null;
  energy_cost?: string | number | null;
  operator?: string | null;
};

type SoilAnalysis = BaseRecord & {
  original_name?: string | null;
  uploaded_by_name?: string | null;
};

type Recommendation = BaseRecord & {
  title?: string | null;
  objective?: string | null;
  recommendation_date?: string | null;
  suggested_application_date?: string | null;
  priority_display?: string | null;
  status_display?: string | null;
};

type LaborRecord = BaseRecord & {
  worker_name?: string | null;
  activity_type_display?: string | null;
  activity_date?: string | null;
  daily_quantity?: string | number | null;
  total_amount?: string | number | null;
};

type Harvest = BaseRecord & {
  harvest_date?: string | null;
  harvest_type_display?: string | null;
  yield_kg?: string | number | null;
  destination_display?: string | null;
  revenue_amount?: string | number | null;
  buyer_name?: string | null;
  buyer_name_display?: string | null;
};

type HistoryType =
  | "cycle"
  | "preparo"
  | "plantio"
  | "adubacao"
  | "fertirrigacao"
  | "defensivos"
  | "irrigacao"
  | "agronomo"
  | "mao_obra"
  | "colheita";

type HistoryEvent = {
  id: string;
  type: HistoryType;
  date: string;
  title: string;
  subtitle: string;
  details: string[];
  amount?: number;
  notes?: string | null;
};

const typeConfig: Record<HistoryType, { label: string; icon: LucideIcon; color: string; bg: string }> = {
  cycle: { label: "Ciclo", icon: Sprout, color: "oklch(0.48 0.16 145)", bg: "oklch(0.96 0.04 145)" },
  preparo: { label: "Preparo", icon: Tractor, color: "oklch(0.54 0.13 65)", bg: "oklch(0.96 0.04 75)" },
  plantio: { label: "Plantio", icon: Leaf, color: "oklch(0.48 0.14 145)", bg: "oklch(0.96 0.04 145)" },
  adubacao: { label: "Adubação", icon: Beaker, color: "oklch(0.52 0.14 155)", bg: "oklch(0.96 0.04 155)" },
  fertirrigacao: { label: "Fertirrigação", icon: FlaskConical, color: "oklch(0.5 0.15 220)", bg: "oklch(0.96 0.04 220)" },
  defensivos: { label: "Defensivos", icon: ClipboardCheck, color: "oklch(0.5 0.16 295)", bg: "oklch(0.96 0.04 295)" },
  irrigacao: { label: "Irrigação", icon: Droplets, color: "oklch(0.5 0.15 205)", bg: "oklch(0.96 0.04 205)" },
  agronomo: { label: "Agrônomo", icon: FileText, color: "oklch(0.46 0.13 145)", bg: "oklch(0.96 0.04 145)" },
  mao_obra: { label: "Mão de Obra", icon: Users, color: "oklch(0.48 0.12 250)", bg: "oklch(0.96 0.04 250)" },
  colheita: { label: "Colheita", icon: Wheat, color: "oklch(0.56 0.16 82)", bg: "oklch(0.97 0.05 85)" },
};

const extractArray = <T,>(data: ApiList<T> | unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

const parseNumber = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const dateOnly = value.includes("T") ? value.split("T")[0] : value;
  const [year, month, day] = dateOnly.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const formatAmount = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const numberText = (value?: string | number | null, suffix = "") => {
  const parsed = parseNumber(value);
  if (!parsed) return "";
  return `${parsed.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${suffix}`;
};

const compact = (values: Array<string | null | undefined | false>) =>
  values.filter(Boolean) as string[];

function KpiCard({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="dashboard-card p-3 h-100 border border-border bg-card">
      <div className="d-flex align-items-center gap-3">
        <div className="rounded-xl d-flex align-items-center justify-content-center bg-primary/10 text-primary" style={{ width: 42, height: 42 }}>
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <div className="text-muted-foreground fw-semibold" style={{ fontSize: "0.72rem" }}>{label}</div>
          <div className="fw-black text-foreground text-truncate" style={{ fontSize: "1.05rem" }}>{value}</div>
        </div>
      </div>
    </div>
  );
}

function buildEvents(plantation: Plantation, sources: {
  landPreparations: LandPreparation[];
  plantings: Planting[];
  fertilizations: Application[];
  fertigations: Application[];
  pesticides: Application[];
  irrigations: Irrigation[];
  soilAnalyses: SoilAnalysis[];
  recommendations: Recommendation[];
  laborRecords: LaborRecord[];
  harvests: Harvest[];
}): HistoryEvent[] {
  const events: HistoryEvent[] = [];

  if (plantation.planting_date) {
    events.push({
      id: `cycle-${plantation.id}`,
      type: "cycle",
      date: plantation.planting_date,
      title: "Ciclo produtivo iniciado",
      subtitle: plantation.crop_name || plantation.name || "Plantação",
      details: compact([
        plantation.field_name ? `Talhão: ${plantation.field_name}` : undefined,
        plantation.planted_area_ha ? `Área: ${numberText(plantation.planted_area_ha, " ha")}` : undefined,
        plantation.expected_harvest_date ? `Colheita prevista: ${formatDate(plantation.expected_harvest_date)}` : undefined,
      ]),
    });
  }

  sources.landPreparations.forEach((item) => {
    const amount = parseNumber(item.total_price);
    events.push({
      id: `preparo-${item.id}`,
      type: "preparo",
      date: item.date || item.created_at || "",
      title: item.operation_type_display || "Preparação da terra",
      subtitle: item.execution_type_display || "Operação de preparo",
      details: compact([
        item.tractor_name ? `Trator: ${item.tractor_name}` : undefined,
        item.operator ? `Operador: ${item.operator}` : undefined,
        item.hours_worked ? `Horas: ${numberText(item.hours_worked, " h")}` : undefined,
        amount ? `Custo: ${formatAmount(amount)}` : undefined,
      ]),
      amount,
      notes: item.notes,
    });
  });

  sources.plantings.forEach((item) => {
    const amount = parseNumber(item.total_price);
    events.push({
      id: `plantio-${item.id}`,
      type: "plantio",
      date: item.planting_date || item.created_at || "",
      title: item.item_name || "Semente / plantio",
      subtitle: "Registro de plantio",
      details: compact([
        item.quantity ? `Quantidade: ${numberText(item.quantity, item.unit ? ` ${item.unit}` : "")}` : undefined,
        item.operator ? `Operador: ${item.operator}` : undefined,
        amount ? `Custo: ${formatAmount(amount)}` : undefined,
      ]),
      amount,
      notes: item.notes,
    });
  });

  sources.fertilizations.forEach((item) => {
    const amount = parseNumber(item.total_price);
    events.push({
      id: `adubacao-${item.id}`,
      type: "adubacao",
      date: item.application_date || item.created_at || "",
      title: item.item_name || "Adubação de base",
      subtitle: item.application_method_display || "Aplicação de fertilizante",
      details: compact([
        item.quantity ? `Quantidade: ${numberText(item.quantity, item.unit ? ` ${item.unit}` : "")}` : undefined,
        item.dose_per_ha ? `Dose: ${numberText(item.dose_per_ha, "/ha")}` : undefined,
        item.operator ? `Operador: ${item.operator}` : undefined,
        amount ? `Custo: ${formatAmount(amount)}` : undefined,
      ]),
      amount,
      notes: item.notes,
    });
  });

  sources.fertigations.forEach((item) => {
    const amount = parseNumber(item.total_price);
    events.push({
      id: `fertirrigacao-${item.id}`,
      type: "fertirrigacao",
      date: item.application_date || item.created_at || "",
      title: item.item_name || "Fertirrigação",
      subtitle: "Aplicação via irrigação",
      details: compact([
        item.quantity ? `Quantidade: ${numberText(item.quantity, item.unit ? ` ${item.unit}` : "")}` : undefined,
        item.operator ? `Operador: ${item.operator}` : undefined,
        amount ? `Custo: ${formatAmount(amount)}` : undefined,
      ]),
      amount,
      notes: item.notes,
    });
  });

  sources.pesticides.forEach((item) => {
    const amount = parseNumber(item.total_price);
    events.push({
      id: `defensivos-${item.id}`,
      type: "defensivos",
      date: item.application_date || item.created_at || "",
      title: item.item_name || "Aplicação foliar / defensivo",
      subtitle: item.pesticide_type_display || "Defensivo agrícola",
      details: compact([
        item.target ? `Alvo: ${item.target}` : undefined,
        item.quantity ? `Quantidade: ${numberText(item.quantity, item.unit ? ` ${item.unit}` : "")}` : undefined,
        item.operator ? `Operador: ${item.operator}` : undefined,
        amount ? `Custo: ${formatAmount(amount)}` : undefined,
      ]),
      amount,
      notes: item.notes,
    });
  });

  sources.irrigations.forEach((item) => {
    const amount = parseNumber(item.energy_cost);
    const date = item.start_date || item.date || item.created_at || "";
    events.push({
      id: `irrigacao-${item.id}`,
      type: "irrigacao",
      date,
      title: item.irrigation_system_display || "Irrigação",
      subtitle: item.end_date && item.end_date !== date ? `${formatDate(date)} a ${formatDate(item.end_date)}` : "Manejo de irrigação",
      details: compact([
        item.pump_name ? `Bomba: ${item.pump_name}` : undefined,
        item.operating_days ? `Dias: ${item.operating_days}` : undefined,
        item.hours ? `Horas: ${numberText(item.hours, " h")}` : undefined,
        item.liters_used ? `Água: ${numberText(item.liters_used, " L")}` : undefined,
        amount ? `Energia: ${formatAmount(amount)}` : undefined,
      ]),
      amount,
      notes: item.notes,
    });
  });

  sources.soilAnalyses.forEach((item) => {
    events.push({
      id: `solo-${item.id}`,
      type: "agronomo",
      date: item.created_at || "",
      title: "Análise de solo anexada",
      subtitle: item.original_name || "Documento técnico",
      details: compact([
        item.uploaded_by_name ? `Enviado por: ${item.uploaded_by_name}` : undefined,
      ]),
      notes: item.notes,
    });
  });

  sources.recommendations.forEach((item) => {
    events.push({
      id: `recomendacao-${item.id}`,
      type: "agronomo",
      date: item.recommendation_date || item.created_at || "",
      title: item.title || "Recomendação técnica",
      subtitle: item.objective || "Orientação agronômica",
      details: compact([
        item.priority_display ? `Prioridade: ${item.priority_display}` : undefined,
        item.status_display ? `Status: ${item.status_display}` : undefined,
        item.suggested_application_date ? `Aplicação sugerida: ${formatDate(item.suggested_application_date)}` : undefined,
      ]),
      notes: item.notes,
    });
  });

  sources.laborRecords.forEach((item) => {
    const amount = parseNumber(item.total_amount);
    events.push({
      id: `mao-obra-${item.id}`,
      type: "mao_obra",
      date: item.activity_date || item.created_at || "",
      title: item.activity_type_display || "Atividade de mão de obra",
      subtitle: item.worker_name || "Trabalhador",
      details: compact([
        item.daily_quantity ? `Diárias: ${numberText(item.daily_quantity)}` : undefined,
        amount ? `Custo: ${formatAmount(amount)}` : undefined,
      ]),
      amount,
      notes: item.notes,
    });
  });

  sources.harvests.forEach((item) => {
    const revenue = parseNumber(item.revenue_amount);
    events.push({
      id: `colheita-${item.id}`,
      type: "colheita",
      date: item.harvest_date || item.created_at || "",
      title: item.harvest_type_display || "Colheita registrada",
      subtitle: item.destination_display || "Destino da produção",
      details: compact([
        item.yield_kg ? `Produção: ${numberText(item.yield_kg, " kg")}` : undefined,
        item.buyer_name_display || item.buyer_name ? `Comprador: ${item.buyer_name_display || item.buyer_name}` : undefined,
        revenue ? `Receita: ${formatAmount(revenue)}` : undefined,
      ]),
      amount: revenue,
      notes: item.notes,
    });
  });

  return events.sort((a, b) => {
    const first = new Date(b.date || "0000-01-01").getTime();
    const second = new Date(a.date || "0000-01-01").getTime();
    return first - second;
  });
}

export default function HistoricoPlantacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [plantation, setPlantation] = useState<Plantation | null>(null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [activeType, setActiveType] = useState<HistoryType | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!id) return;
    let active = true;

    Promise.all([
      cropService.get(id),
      cropService.listLandPreparations({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listPlantings({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listFertilizations({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listFertigations({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listPesticideApplications({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listIrrigations({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listSoilAnalyses({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listAgronomistRecommendations({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listLaborRecords({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listHarvests({ planting_cycle: id }).catch(() => ({ data: { results: [] } })),
    ])
      .then(([
        plantationRes,
        landRes,
        plantingRes,
        fertilizationRes,
        fertigationRes,
        pesticideRes,
        irrigationRes,
        soilRes,
        recommendationRes,
        laborRes,
        harvestRes,
      ]) => {
        if (!active) return;
        const currentPlantation = plantationRes.data as Plantation;
        const history = buildEvents(currentPlantation, {
          landPreparations: extractArray<LandPreparation>(landRes.data),
          plantings: extractArray<Planting>(plantingRes.data),
          fertilizations: extractArray<Application>(fertilizationRes.data),
          fertigations: extractArray<Application>(fertigationRes.data),
          pesticides: extractArray<Application>(pesticideRes.data),
          irrigations: extractArray<Irrigation>(irrigationRes.data),
          soilAnalyses: extractArray<SoilAnalysis>(soilRes.data),
          recommendations: extractArray<Recommendation>(recommendationRes.data),
          laborRecords: extractArray<LaborRecord>(laborRes.data),
          harvests: extractArray<Harvest>(harvestRes.data),
        });
        setPlantation(currentPlantation);
        setEvents(history);
        setError("");
      })
      .catch(() => {
        if (!active) return;
        setError("Não foi possível carregar o histórico da plantação.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((event) => {
      const matchesType = activeType === "all" || event.type === activeType;
      const text = [event.title, event.subtitle, event.notes, ...event.details].join(" ").toLowerCase();
      const matchesSearch = !term || text.includes(term);
      return matchesType && matchesSearch;
    });
  }, [activeType, events, search]);

  const eventCounts = useMemo(() => {
    return events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Partial<Record<HistoryType, number>>);
  }, [events]);

  const totalCost = useMemo(
    () => events.filter((event) => event.type !== "colheita").reduce((sum, event) => sum + (event.amount || 0), 0),
    [events],
  );

  const totalRevenue = useMemo(
    () => events.filter((event) => event.type === "colheita").reduce((sum, event) => sum + (event.amount || 0), 0),
    [events],
  );

  if (loading) {
    return (
      <div className="p-4">
        <Skeleton height="48px" width="320px" className="mb-4" />
        <div className="row g-3 mb-4">
          {[1, 2, 3, 4].map((item) => (
            <div className="col-12 col-md-3" key={item}>
              <Skeleton height="78px" />
            </div>
          ))}
        </div>
        <Skeleton height="520px" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-muted">{error}</div>;
  }

  if (!plantation) {
    return <div className="p-4 text-muted">Plantação não encontrada.</div>;
  }

  return (
    <div>
      <div className="mb-3 d-flex align-items-center gap-2 text-muted small fw-medium">
        <span style={{ cursor: "pointer" }} onClick={() => router.push("/home/plantacoes")} className="hover-text-primary">
          Plantações
        </span>
        <span>›</span>
        <span style={{ cursor: "pointer" }} onClick={() => router.push(`/home/plantacoes/${id}`)} className="hover-text-primary">
          {plantation.name || plantation.crop_name}
        </span>
        <span>›</span>
        <span className="text-primary fw-semibold">Histórico</span>
      </div>

      <div className="d-flex align-items-start justify-content-between gap-3 mb-4 flex-wrap">
        <div className="d-flex align-items-center gap-3">
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center"
            onClick={() => router.push(`/home/plantacoes/${id}`)}
            style={{ width: 38, height: 38, borderRadius: 10 }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="fw-black mb-1 text-foreground d-flex align-items-center gap-2" style={{ fontSize: "1.75rem" }}>
              <Calendar size={27} className="text-primary" /> Histórico da Plantação
            </h1>
            <p className="text-muted-foreground small mb-0">
              {plantation.farm_name} › {plantation.field_name} › {plantation.status_display || "Ciclo produtivo"}
            </p>
          </div>
        </div>
        <Button variant="outline-secondary" size="sm" onClick={() => router.push(`/home/plantacoes/${id}`)}>
          Voltar para a plantação
        </Button>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-xl-3">
          <KpiCard label="Eventos registrados" value={String(events.length)} icon={ClipboardCheck} />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <KpiCard label="Investimento operacional" value={formatAmount(totalCost)} icon={Tractor} />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <KpiCard label="Receita de colheita" value={formatAmount(totalRevenue)} icon={Wheat} />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <KpiCard label="Início do ciclo" value={formatDate(plantation.planting_date)} icon={Sprout} />
        </div>
      </div>

      <div className="dashboard-card p-3 p-md-4 mb-4 border border-border bg-card">
        <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="fw-bold mb-1" style={{ fontSize: "1.05rem" }}>Linha do tempo operacional</h2>
            <p className="text-muted-foreground small mb-0">Registros consolidados das etapas produtivas desta plantação.</p>
          </div>
          <div className="position-relative" style={{ width: "min(100%, 320px)" }}>
            <Search size={16} className="position-absolute text-muted" style={{ left: 14, top: "50%", transform: "translateY(-50%)" }} />
            <input
              className="form-control bg-background border-border"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar no histórico..."
              style={{ borderRadius: 12, paddingLeft: 40, minHeight: 42 }}
            />
          </div>
        </div>

        <div className="d-flex gap-2 flex-wrap mb-4">
          <button
            type="button"
            className={`btn btn-sm ${activeType === "all" ? "btn-primary" : "btn-outline-secondary"}`}
            style={{ borderRadius: 999, fontWeight: 700 }}
            onClick={() => setActiveType("all")}
          >
            Todos <span className="ms-1 opacity-75">{events.length}</span>
          </button>
          {(Object.keys(typeConfig) as HistoryType[]).map((type) => {
            const config = typeConfig[type];
            const Icon = config.icon;
            const count = eventCounts[type] || 0;
            return (
              <button
                key={type}
                type="button"
                className={`btn btn-sm d-inline-flex align-items-center gap-1 ${activeType === type ? "btn-primary" : "btn-outline-secondary"}`}
                style={{ borderRadius: 999, fontWeight: 700 }}
                onClick={() => setActiveType(type)}
              >
                <Icon size={14} /> {config.label} <span className="opacity-75">{count}</span>
              </button>
            );
          })}
        </div>

        {filteredEvents.length === 0 ? (
          <div className="text-center py-5 text-muted-foreground">
            Nenhum evento encontrado para os filtros atuais.
          </div>
        ) : (
          <div className="position-relative">
            <div
              className="position-absolute d-none d-md-block"
              style={{ left: 23, top: 8, bottom: 18, width: 2, background: "var(--border)" }}
            />
            <div className="d-flex flex-column gap-3">
              {filteredEvents.map((event) => {
                const config = typeConfig[event.type];
                const Icon = config.icon;
                return (
                  <article key={event.id} className="d-flex gap-3 position-relative">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 border border-border"
                      style={{ width: 48, height: 48, color: config.color, background: config.bg, zIndex: 1 }}
                    >
                      <Icon size={22} />
                    </div>
                    <div className="dashboard-card p-3 p-md-4 border border-border bg-background flex-grow-1" style={{ borderRadius: 8 }}>
                      <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap mb-2">
                        <div>
                          <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                            <span className="badge" style={{ background: config.bg, color: config.color, borderRadius: 999 }}>
                              {config.label}
                            </span>
                            <span className="text-muted-foreground fw-semibold" style={{ fontSize: "0.76rem" }}>
                              {formatDate(event.date)}
                            </span>
                          </div>
                          <h3 className="fw-bold text-foreground mb-1" style={{ fontSize: "1rem" }}>{event.title}</h3>
                          <p className="text-muted-foreground small mb-0">{event.subtitle}</p>
                        </div>
                        {event.amount ? (
                          <span className="fw-bold text-foreground" style={{ fontSize: "0.9rem" }}>
                            {formatAmount(event.amount)}
                          </span>
                        ) : null}
                      </div>

                      {event.details.length > 0 && (
                        <div className="d-flex flex-wrap gap-2 mt-3">
                          {event.details.map((detail) => (
                            <span key={detail} className="px-2 py-1 bg-card border border-border text-muted-foreground fw-semibold" style={{ borderRadius: 8, fontSize: "0.72rem" }}>
                              {detail}
                            </span>
                          ))}
                        </div>
                      )}

                      {event.notes ? (
                        <div className="mt-3 pt-3 border-top border-border text-muted-foreground small">
                          {event.notes}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
