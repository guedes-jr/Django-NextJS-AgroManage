"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, MoreHorizontal, Sprout, Ruler, DollarSign, TrendingUp, Zap, Calendar, Tag, FileText, MapPin, Activity, AlignLeft } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { cropService } from "@/services/cropService";
import type { Plantation, PlantationStatus } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";

const statusColors: Record<PlantationStatus, string> = {
  planned: "#6b7280",
  planting: "#f59e0b",
  growing: "#10b981",
  management: "#3b82f6",
  harvesting: "#8b5cf6",
  finished: "#059669",
  cancelled: "#ef4444",
};

const statusLabels: Record<string, string> = {
  planned: "Planejado", planting: "Plantando", growing: "Crescendo",
  management: "Manejo", harvesting: "Colhendo", finished: "Concluído", cancelled: "Cancelado",
};

type FieldOption = { id: string; name: string; farm_name: string };
type FarmOption = { id: string; name: string; city?: string; state?: string };
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

const cropStageCards = [
  { number: 1, title: "Análise do Solo", desc: "Resultados, laudos e histórico", image: "/images/crops/soil-analysis.png", status: "Base técnica", color: "oklch(0.58 0.16 145)" },
  { number: 2, title: "Preparação da Terra", desc: "Calagem, aração e gradagem", image: "/images/crops/land-preparation.png", status: "Operações", color: "oklch(0.7 0.18 85)" },
  { number: 3, title: "Adubação de Base", desc: "Produtos, doses e custos", image: "/images/crops/base-fertilization.png", status: "Nutrição", color: "oklch(0.62 0.17 145)" },
  { number: 4, title: "Sementes e Mudas", desc: "Híbrido, quantidade e custo", image: "/images/crops/seed.png", status: "Plantio", color: "oklch(0.66 0.16 70)" },
  { number: 5, title: "Fertirrigação", desc: "Adubos via irrigação", image: "/images/crops/fertigation.png", status: "Água + nutrição", color: "oklch(0.6 0.16 220)" },
  { number: 6, title: "Defensivos", desc: "Herbicidas, fungicidas e inseticidas", image: "/images/crops/pesticides.png", status: "Proteção", color: "oklch(0.65 0.18 290)" },
];

function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="dashboard-card p-4 h-100">
      <div className="d-flex align-items-center gap-3">
        <div
          className="rounded-xl d-flex align-items-center justify-content-center flex-shrink-0"
          style={{
            width: 44,
            height: 44,
            background: `color-mix(in srgb, ${color}, transparent 88%)`,
            color,
          }}
        >
        {icon}
        </div>
        <div className="flex-grow-1 min-w-0">
          <div className="text-muted-foreground small fw-bold text-uppercase mb-1" style={{ letterSpacing: "0.02em", fontSize: "0.65rem" }}>{label}</div>
          <div className="fw-black text-foreground" style={{ fontSize: "1.2rem" }}>{value}</div>
          {sub && <div className="text-muted-foreground" style={{ fontSize: "0.68rem" }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function CropStageCard({ stage }: { stage: typeof cropStageCards[number] }) {
  return (
    <div className="dashboard-card p-3 h-100">
      <div className="d-flex align-items-start gap-3">
        <div
          className="rounded-xl d-flex align-items-center justify-content-center flex-shrink-0"
          style={{
            width: 72,
            height: 72,
            background: `color-mix(in srgb, ${stage.color}, transparent 92%)`,
          }}
        >
          <Image src={stage.image} alt="" width={58} height={58} style={{ objectFit: "contain" }} />
        </div>
        <div className="min-w-0">
          <div className="text-muted-foreground small fw-bold mb-1">{stage.number}. {stage.title}</div>
          <div className="fw-semibold text-foreground mb-2" style={{ fontSize: "0.88rem" }}>{stage.desc}</div>
          <span
            className="badge rounded-pill fw-semibold"
            style={{
              background: `color-mix(in srgb, ${stage.color}, transparent 88%)`,
              color: stage.color,
              fontSize: "0.68rem",
            }}
          >
            {stage.status}
          </span>
        </div>
      </div>
    </div>
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
    population: "",
    spacing: "",
    planting_date: "",
    expected_harvest_date: "",
    status: "planned" as PlantationStatus,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [farms, setFarms] = useState<FarmOption[]>([]);
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

  const openCreate = () => {
    setEditing(null);
    setForm({ field: "", name: "", crop_type: "grain", crop_name: "", variety: "", hybrid: "", planted_area_ha: "", population: "", spacing: "", planting_date: "", expected_harvest_date: "", status: "planned", notes: "" });
    setShowModal(true);
  };

  const openEdit = (p: Plantation) => {
    setEditing(p);
    setForm({
      field: p.field || "",
      name: p.name || "",
      crop_type: p.crop_type || "grain",
      crop_name: p.crop_name || "",
      variety: p.variety || "",
      hybrid: p.hybrid || "",
      planted_area_ha: p.planted_area_ha || "",
      population: p.population?.toString() || "",
      spacing: p.spacing || "",
      planting_date: p.planting_date || "",
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
    try {
      setSaving(true);
      const payload = {
        ...form,
        planted_area_ha: form.planted_area_ha ? Number(form.planted_area_ha) : null,
        population: form.population ? Number(form.population) : null,
        expected_harvest_date: form.expected_harvest_date || null,
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

  const columns: import("@/components/ui/DataTable").Column<Plantation>[] = [
    { key: "name", label: "Nome", render: (_, row) => (
      <span className="fw-medium">{row.name || row.crop_name} @ {row.field_name}</span>
    )},
    { key: "crop_name", label: "Cultura" },
    { key: "field_name", label: "Talhão" },
    { key: "planted_area_ha", label: "Área (ha)" },
    { key: "planting_date", label: "Plantio", render: (v) =>
      v ? new Date(String(v)).toLocaleDateString("pt-BR") : "-"
    },
    { key: "status", label: "Status", render: (_, row) => (
      <Badge style={{ background: statusColors[row.status] || "#6b7280", color: "#fff", fontSize: "0.7rem", fontWeight: 600, padding: "2px 8px", borderRadius: "4px" }}>
        {row.status_display}
      </Badge>
    )},
    { key: "actions", label: "", render: (_, row) => (
      <div className="d-flex gap-1">
        <button className="btn btn-sm btn-outline-secondary border-0"
          onClick={(e) => { e.stopPropagation(); openEdit(row); }}
          title="Editar">
          <MoreHorizontal size={14} />
        </button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Plantações"
        subtitle="Gerencie todas as culturas e ciclos produtivos"
        action={<Button variant="agro" onClick={openCreate}><Plus size={16} /> Nova Plantação</Button>}
      />

      {/* KPI Cards */}
      <div className="row g-4 mb-4">
        <div className="col-12 col-md-4 col-xl-2">
          <KpiCard color="oklch(0.58 0.16 145)" icon={<Sprout size={20} />} label="Total" value={String(dashboardData?.total_plantations ?? "-")} sub={`${dashboardData?.total_active ?? "-"} ativas`} />
        </div>
        <div className="col-12 col-md-4 col-xl-2">
          <KpiCard color="oklch(0.6 0.16 240)" icon={<Ruler size={20} />} label="Área Total" value={dashboardData?.total_area_ha ? `${fmt(dashboardData.total_area_ha)} ha` : "-"} />
        </div>
        <div className="col-12 col-md-4 col-xl-2">
          <KpiCard color="oklch(0.7 0.18 85)" icon={<Zap size={20} />} label="Produção" value={dashboardData?.total_estimated_production_kg ? `${fmt(Number(dashboardData.total_estimated_production_kg) / 1000)} t` : "-"} />
        </div>
        <div className="col-12 col-md-4 col-xl-2">
          <KpiCard color="oklch(0.65 0.19 25)" icon={<DollarSign size={20} />} label="Investimento" value={dashboardData?.total_investment ? money(dashboardData.total_investment) : "-"} />
        </div>
        <div className="col-12 col-md-4 col-xl-2">
          <KpiCard color="oklch(0.62 0.17 160)" icon={<TrendingUp size={20} />} label="Receita Estimada" value={dashboardData?.total_estimated_revenue ? money(dashboardData.total_estimated_revenue) : "-"} sub={dashboardData?.avg_roi ? `ROI ${fmt(dashboardData.avg_roi)}%` : ""} />
        </div>
        <div className="col-12 col-md-4 col-xl-2">
          <KpiCard color="oklch(0.65 0.18 290)" icon={<Calendar size={20} />} label="Colheitas 30d" value={String(dashboardData?.upcoming_harvests ?? "-")} />
        </div>
      </div>

      {/* Status Breakdown */}
      {dashboardData?.status_counts && (
        <div className="d-flex gap-2 mb-4 flex-wrap">
          {Object.entries(dashboardData.status_counts).map(([status, count]) => (
            <Badge key={status}
              style={{ background: statusColors[status as PlantationStatus] || "#6b7280", color: "#fff", fontSize: "0.75rem", fontWeight: 600, padding: "4px 10px", borderRadius: "20px" }}>
              {statusLabels[status] || status}: {count}
            </Badge>
          ))}
        </div>
      )}

      <div className="mb-4">
        <div className="d-flex align-items-end justify-content-between mb-3 gap-3 flex-wrap">
          <div>
            <h2 className="fw-bold mb-1" style={{ fontSize: "1.15rem" }}>Fluxo operacional da cultura</h2>
            <p className="text-muted-foreground small mb-0">Etapas visuais para orientar o acompanhamento de cada plantação.</p>
          </div>
        </div>
        <div className="row g-3">
          {cropStageCards.map((stage) => (
            <div key={stage.title} className="col-12 col-md-6 col-xl-4">
              <CropStageCard stage={stage} />
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard-card p-3 mb-4">
        <div className="input-group" style={{ maxWidth: 360 }}>
          <span className="input-group-text bg-white border-end-0"><Search size={16} className="text-muted" /></span>
          <input className="form-control border-start-0" placeholder="Buscar plantações..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      {loading ? (
        <div className="dashboard-card p-5 text-center text-muted-foreground fw-medium">
          Carregando plantações...
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={plantations}
          emptyText="Nenhuma plantação encontrada"
          onRowClick={(row) => router.push(`/home/plantacoes/${row.id}`)}
        />
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)}
        title={editing ? "Editar Plantação" : "Nova Plantação"}
        description="Preencha as informações para acompanhar o ciclo desta cultura."
        maxWidth="max-w-3xl"
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
        <div className="p-4" style={{ background: "var(--background)" }}>
          <div className="row g-4">
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Nome da Plantação <span className="text-danger">*</span></label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-foreground" placeholder="Ex: Milho Safra 2025.2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
                <label className="login-label fw-bold">Tipo <span className="text-danger">*</span></label>
                <div className="login-input-wrapper">
                  <select className="login-input login-input-icon-left bg-white text-foreground" value={form.crop_type} onChange={(e) => setForm({ ...form, crop_type: e.target.value })}>
                    {cropService.cropTypeChoices.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                  </select>
                  <Tag className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Cultura <span className="text-danger">*</span></label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-foreground" placeholder="Ex: Milho, Soja" value={form.crop_name} onChange={(e) => setForm({ ...form, crop_name: e.target.value })} required />
                  <Sprout className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Variedade</label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-foreground" placeholder="Ex: DKB 390" value={form.variety} onChange={(e) => setForm({ ...form, variety: e.target.value })} />
                  <Tag className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Área Plantada (ha)</label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-foreground" type="number" step="0.01" placeholder="0.00" value={form.planted_area_ha} onChange={(e) => setForm({ ...form, planted_area_ha: e.target.value })} />
                  <Ruler className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Status <span className="text-danger">*</span></label>
                <div className="login-input-wrapper">
                  <select className="login-input login-input-icon-left bg-white text-foreground" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PlantationStatus })}>
                    {cropService.statusChoices.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
                  </select>
                  <Activity className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Data do Plantio <span className="text-danger">*</span></label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-muted-foreground" type="date" value={form.planting_date} onChange={(e) => setForm({ ...form, planting_date: e.target.value })} required />
                  <Calendar className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Previsão de Colheita</label>
                <div className="login-input-wrapper">
                  <input className="login-input login-input-icon-left bg-white text-muted-foreground" type="date" value={form.expected_harvest_date} onChange={(e) => setForm({ ...form, expected_harvest_date: e.target.value })} />
                  <Calendar className="login-input-icon text-muted-foreground" size={16} />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-12">
              <div className="login-input-group mb-0">
                <label className="login-label fw-bold">Observações</label>
                <div className="login-input-wrapper">
                  <textarea className="login-input login-input-icon-left bg-white text-foreground" style={{ minHeight: "80px", paddingTop: "0.75rem", paddingLeft: "2.5rem" }} placeholder="Detalhes adicionais sobre o plantio..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
        <div className="p-4" style={{ background: "var(--background)" }}>
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
                  <input className="login-input login-input-icon-left bg-white text-foreground" placeholder="Ex: Pivot, gotejamento" value={fieldForm.irrigation_type} onChange={(e) => setFieldForm({ ...fieldForm, irrigation_type: e.target.value })} />
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
