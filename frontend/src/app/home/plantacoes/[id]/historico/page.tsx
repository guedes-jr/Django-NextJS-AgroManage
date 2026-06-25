"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Droplets,
  FileText,
  FlaskConical,
  HandCoins,
  History,
  Leaf,
  Pickaxe,
  Search,
  Sprout,
  Tractor,
  Wheat,
} from "lucide-react";
import apiClient from "@/services/api";
import { cropService } from "@/services/cropService";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";

type Plantation = {
  id: string;
  name?: string;
  crop_name?: string;
  field_name?: string;
  farm_name?: string;
  planted_area_ha?: string | null;
  planting_date?: string | null;
  status_display?: string;
};

type ApiRecord = Record<string, unknown>;

type HistoryType =
  | "planting"
  | "land_preparation"
  | "fertilization"
  | "fertigation"
  | "pesticide"
  | "irrigation"
  | "labor"
  | "agronomist"
  | "soil"
  | "harvest";

type HistoryEvent = {
  id: string;
  type: HistoryType;
  title: string;
  date: string;
  description: string;
  amount?: string;
  operator?: string;
  notes?: string;
};

const typeMeta: Record<HistoryType, { label: string; color: string; background: string }> = {
  planting: { label: "Plantio", color: "#166534", background: "#dcfce7" },
  land_preparation: { label: "Preparo", color: "#92400e", background: "#fef3c7" },
  fertilization: { label: "Adubação", color: "#047857", background: "#d1fae5" },
  fertigation: { label: "Fertirrigação", color: "#0369a1", background: "#e0f2fe" },
  pesticide: { label: "Foliar & defensivos", color: "#6d28d9", background: "#ede9fe" },
  irrigation: { label: "Irrigação", color: "#0f766e", background: "#ccfbf1" },
  labor: { label: "Mão de obra", color: "#9a3412", background: "#ffedd5" },
  agronomist: { label: "Agrônomo", color: "#15803d", background: "#dcfce7" },
  soil: { label: "Análise de solo", color: "#475569", background: "#f1f5f9" },
  harvest: { label: "Colheita", color: "#854d0e", background: "#fef9c3" },
};

const typeIcons: Record<HistoryType, typeof Sprout> = {
  planting: Sprout,
  land_preparation: Tractor,
  fertilization: Leaf,
  fertigation: Droplets,
  pesticide: FlaskConical,
  irrigation: Droplets,
  labor: HandCoins,
  agronomist: ClipboardList,
  soil: FileText,
  harvest: Wheat,
};

const extractArray = <T,>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

const text = (record: ApiRecord, key: string) => {
  const value = record[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
};

const money = (value: string) => {
  const parsed = Number.parseFloat(value || "0");
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const numberText = (value: string, suffix: string) => {
  const parsed = Number.parseFloat(value || "0");
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return `${parsed.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${suffix}`;
};

const dateText = (value: string) => {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const eventDate = (record: ApiRecord, keys: string[]) => {
  for (const key of keys) {
    const value = text(record, key);
    if (value) return value.slice(0, 10);
  }
  return "";
};

const makeEvent = (
  record: ApiRecord,
  type: HistoryType,
  title: string,
  dateKeys: string[],
  descriptionParts: string[],
  amount?: string,
): HistoryEvent => ({
  id: `${type}-${text(record, "id") || Math.random().toString(36).slice(2)}`,
  type,
  title,
  date: eventDate(record, dateKeys),
  description: descriptionParts.filter(Boolean).join(" • "),
  amount,
  operator: text(record, "operator") || text(record, "created_by_name") || text(record, "uploaded_by_name"),
  notes: text(record, "notes") || text(record, "objective"),
});

const fetchList = async (url: string, params: Record<string, string>) => {
  const response = await apiClient.get(url, { params }).catch(() => ({ data: [] }));
  return extractArray<ApiRecord>(response.data);
};

export default function HistoricoPlantacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plantation, setPlantation] = useState<Plantation | null>(null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | HistoryType>("all");

  useEffect(() => {
    if (!id) return;
    let active = true;

    (async () => {
      try {
        setLoading(true);
        const plantationRes = await cropService.get(id);
        const [
          plantings,
          landPreparations,
          fertilizations,
          fertigations,
          pesticides,
          irrigations,
          laborRecords,
          recommendations,
          soilAnalyses,
          harvests,
        ] = await Promise.all([
          fetchList("/crops/plantings/", { plantation: id }),
          fetchList("/crops/land-preparations/", { plantation: id }),
          fetchList("/crops/fertilizations/", { plantation: id }),
          fetchList("/crops/fertigations/", { plantation: id }),
          fetchList("/crops/pesticides/", { plantation: id }),
          fetchList("/crops/irrigations/", { plantation: id }),
          fetchList("/crops/labor-records/", { plantation: id }),
          fetchList("/crops/agronomist-recommendations/", { plantation: id }),
          fetchList("/crops/soil-analyses/", { plantation: id }),
          fetchList("/crops/harvests/", { planting_cycle: id }),
        ]);

        if (!active) return;
        setPlantation(plantationRes.data);
        setEvents([
          ...plantings.map((item) => makeEvent(
            item,
            "planting",
            text(item, "item_name") || "Plantio registrado",
            ["planting_date", "created_at"],
            [numberText(text(item, "quantity"), text(item, "unit")), text(item, "supplier_name")],
            money(text(item, "total_price")),
          )),
          ...landPreparations.map((item) => makeEvent(
            item,
            "land_preparation",
            text(item, "operation_type_display") || "Preparo de terra",
            ["date", "created_at"],
            [text(item, "execution_type_display"), text(item, "tractor_name"), numberText(text(item, "hours_worked"), "h")],
            money(text(item, "total_price")),
          )),
          ...fertilizations.map((item) => makeEvent(
            item,
            "fertilization",
            text(item, "item_name") || "Adubação de base",
            ["application_date", "created_at"],
            [numberText(text(item, "quantity"), text(item, "unit")), numberText(text(item, "dose_per_ha"), "por ha"), text(item, "application_method_display")],
            money(text(item, "total_price")),
          )),
          ...fertigations.map((item) => makeEvent(
            item,
            "fertigation",
            text(item, "item_name") || "Fertirrigação",
            ["application_date", "created_at"],
            [numberText(text(item, "quantity"), text(item, "unit")), numberText(text(item, "syrup_liters"), "L de calda"), numberText(text(item, "application_time_hours"), "h")],
            money(text(item, "total_price")),
          )),
          ...pesticides.map((item) => makeEvent(
            item,
            "pesticide",
            text(item, "item_name") || text(item, "pesticide_type_display") || "Aplicação foliar/defensivo",
            ["application_date", "created_at"],
            [text(item, "pesticide_type_display"), text(item, "dose"), numberText(text(item, "quantity"), text(item, "unit")), text(item, "target")],
            money(text(item, "total_price")),
          )),
          ...irrigations.map((item) => makeEvent(
            item,
            "irrigation",
            text(item, "irrigation_system_display") || "Irrigação",
            ["start_date", "date", "created_at"],
            [text(item, "pump_name"), numberText(text(item, "hours"), "h"), numberText(text(item, "liters_used"), "L")],
            money(text(item, "energy_cost")),
          )),
          ...laborRecords.map((item) => makeEvent(
            item,
            "labor",
            text(item, "activity_type_display") || "Mão de obra",
            ["activity_date", "created_at"],
            [text(item, "worker_name"), numberText(text(item, "daily_quantity"), "diária(s)")],
            money(text(item, "total_amount")),
          )),
          ...recommendations.map((item) => makeEvent(
            item,
            "agronomist",
            text(item, "title") || "Recomendação do agrônomo",
            ["recommendation_date", "created_at"],
            [text(item, "priority_display"), text(item, "status_display"), numberText(text(item, "area_ha"), "ha")],
          )),
          ...soilAnalyses.map((item) => makeEvent(
            item,
            "soil",
            text(item, "original_name") || "Análise de solo anexada",
            ["created_at"],
            [text(item, "uploaded_by_name")],
          )),
          ...harvests.map((item) => makeEvent(
            item,
            "harvest",
            text(item, "harvest_type_display") || "Colheita",
            ["harvest_date", "created_at"],
            [numberText(text(item, "yield_kg"), "kg"), text(item, "destination_display"), text(item, "buyer_name_display") || text(item, "buyer_name")],
            money(text(item, "revenue_amount")),
          )),
        ]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [events],
  );

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sortedEvents.filter((event) => {
      const matchesType = typeFilter === "all" || event.type === typeFilter;
      const haystack = `${event.title} ${event.description} ${event.operator || ""} ${event.notes || ""}`.toLowerCase();
      return matchesType && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [query, sortedEvents, typeFilter]);

  const totalCost = useMemo(
    () => events.reduce((sum, event) => {
      if (!event.amount) return sum;
      const parsed = Number(event.amount.replace(/[^\d,-]/g, "").replace(",", "."));
      return Number.isFinite(parsed) ? sum + parsed : sum;
    }, 0),
    [events],
  );

  if (loading) {
    return (
      <div className="p-4">
        <Skeleton height="48px" width="340px" className="mb-4" />
        <Skeleton height="520px" />
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-4">
        <div className="d-flex align-items-center gap-3">
          <button className="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center" onClick={() => router.back()} style={{ width: 38, height: 38, borderRadius: 10 }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="fw-black mb-1 d-flex align-items-center gap-2" style={{ fontSize: "1.75rem" }}>
              <History size={28} className="text-success" /> Histórico da plantação
            </h1>
            <p className="text-muted mb-0 small">
              {plantation?.name || plantation?.crop_name || "Plantação"} › {plantation?.field_name || "Talhão"}
            </p>
          </div>
        </div>
        <Button variant="outline-secondary" onClick={() => router.push(`/home/plantacoes/${id}`)}>
          Voltar para a plantação
        </Button>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="dashboard-card p-3 h-100">
            <div className="text-muted small">Registros</div>
            <div className="fw-bold fs-4">{events.length}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="dashboard-card p-3 h-100">
            <div className="text-muted small">Área cadastrada</div>
            <div className="fw-bold fs-4">{plantation?.planted_area_ha || "-"} ha</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="dashboard-card p-3 h-100">
            <div className="text-muted small">Valores registrados</div>
            <div className="fw-bold fs-4">{totalCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
          </div>
        </div>
      </div>

      <div className="dashboard-card p-4">
        <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-4">
          <div>
            <h6 className="fw-bold mb-1 d-flex align-items-center gap-2"><CalendarDays size={18} /> Linha do tempo</h6>
            <p className="text-muted small mb-0">Todas as operações registradas para esta plantação.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <div className="input-group" style={{ width: 260 }}>
              <span className="input-group-text bg-white"><Search size={16} /></span>
              <input className="form-control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar no histórico" />
            </div>
            <select className="form-select" style={{ width: 210 }} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | HistoryType)}>
              <option value="all">Todos os tipos</option>
              {Object.entries(typeMeta).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <Pickaxe size={40} className="mb-2" />
            <div className="fw-semibold">Nenhum registro encontrado.</div>
          </div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {filteredEvents.map((event) => {
              const meta = typeMeta[event.type];
              const Icon = typeIcons[event.type];
              return (
                <div key={event.id} className="border rounded p-3 d-flex gap-3 align-items-start">
                  <div className="d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 42, height: 42, borderRadius: 10, background: meta.background, color: meta.color }}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-grow-1 min-w-0">
                    <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap">
                      <div>
                        <div className="fw-bold">{event.title}</div>
                        <div className="text-muted small">{event.description || "Sem detalhes adicionais"}</div>
                      </div>
                      <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
                        <Badge style={{ background: meta.background, color: meta.color }}>{meta.label}</Badge>
                        <span className="small text-muted">{dateText(event.date)}</span>
                      </div>
                    </div>
                    {(event.amount || event.operator || event.notes) && (
                      <div className="d-flex gap-3 flex-wrap mt-2 small">
                        {event.amount ? <span className="fw-semibold text-success">{event.amount}</span> : null}
                        {event.operator ? <span className="text-muted">Responsável: {event.operator}</span> : null}
                        {event.notes ? <span className="text-muted">Obs.: {event.notes}</span> : null}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
