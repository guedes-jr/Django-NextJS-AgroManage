"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, MoreHorizontal, Sprout, Ruler, DollarSign, TrendingUp, Zap, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { cropService } from "@/services/cropService";
import type { Plantation, PlantationStatus } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

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

const cropTypeLabels: Record<string, string> = {
  grain: "Grãos", fiber: "Fibra", fruit: "Frutas", vegetable: "Hortaliças",
  forage: "Forragem", coffee: "Café", sugarcane: "Cana", forestry: "Floresta",
  other: "Outros",
};

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-4 p-3 d-flex align-items-center gap-3"
      style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-soft)" }}>
      <div className="d-flex align-items-center justify-content-center rounded-3"
        style={{ width: 44, height: 44, background: "var(--accent-bg)", color: "var(--accent)" }}>
        {icon}
      </div>
      <div>
        <div className="text-muted small">{label}</div>
        <div className="fw-bold fs-5">{value}</div>
        {sub && <div className="text-muted small">{sub}</div>}
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
  const [totalPages, setTotalPages] = useState(1);
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
  const [fields, setFields] = useState<{ id: string; name: string; farm_name: string }[]>([]);
  const [dashboardData, setDashboardData] = useState<any>(null);

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
      if (data.total_pages) setTotalPages(data.total_pages);
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

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);
  useEffect(() => { fetchPlantations(); }, [fetchPlantations]);
  useEffect(() => { fetchFields(); }, [fetchFields]);

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

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta plantação?")) return;
    try {
      await cropService.delete(id);
      fetchPlantations();
      fetchDashboard();
    } catch {
      console.error("Failed to delete");
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
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-4 col-lg-2">
          <KpiCard icon={<Sprout size={20} />} label="Total" value={String(dashboardData?.total_plantations ?? "-")} sub={`${dashboardData?.total_active ?? "-"} ativas`} />
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <KpiCard icon={<Ruler size={20} />} label="Área Total" value={dashboardData?.total_area_ha ? `${fmt(dashboardData.total_area_ha)} ha` : "-"} />
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <KpiCard icon={<Zap size={20} />} label="Projeção Produção" value={dashboardData?.total_estimated_production_kg ? `${fmt(Number(dashboardData.total_estimated_production_kg) / 1000)} t` : "-"} />
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <KpiCard icon={<DollarSign size={20} />} label="Investimento" value={dashboardData?.total_investment ? money(dashboardData.total_investment) : "-"} />
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <KpiCard icon={<TrendingUp size={20} />} label="Receita Estimada" value={dashboardData?.total_estimated_revenue ? money(dashboardData.total_estimated_revenue) : "-"} sub={dashboardData?.avg_roi ? `ROI ${fmt(dashboardData.avg_roi)}%` : ""} />
        </div>
        <div className="col-6 col-md-4 col-lg-2">
          <KpiCard icon={<Calendar size={20} />} label="Colheitas (30d)" value={String(dashboardData?.upcoming_harvests ?? "-")} />
        </div>
      </div>

      {/* Status Breakdown */}
      {dashboardData?.status_counts && (
        <div className="d-flex gap-2 mb-4 flex-wrap">
          {Object.entries(dashboardData.status_counts).map(([status, count]: [string, any]) => (
            <Badge key={status}
              style={{ background: statusColors[status as PlantationStatus] || "#6b7280", color: "#fff", fontSize: "0.75rem", fontWeight: 600, padding: "4px 10px", borderRadius: "20px" }}>
              {statusLabels[status] || status}: {count}
            </Badge>
          ))}
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-4 gap-3 flex-wrap">
        <div className="input-group" style={{ maxWidth: 320 }}>
          <span className="input-group-text bg-white border-end-0"><Search size={16} className="text-muted" /></span>
          <input className="form-control border-start-0" placeholder="Buscar plantações..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={plantations}
        emptyText="Nenhuma plantação encontrada"
        onRowClick={(row) => router.push(`/home/plantacoes/${row.id}`)}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)}
        title={editing ? "Editar Plantação" : "Nova Plantação"}
        footer={
          <div className="d-flex gap-2 justify-content-end">
            <Button variant="outline-secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        }
      >
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label small fw-medium">Nome</label>
            <input className="form-control" placeholder="Ex: Milho Safra 2025.2" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Talhão *</label>
            <select className="form-select" value={form.field}
              onChange={(e) => setForm({ ...form, field: e.target.value })} required>
              <option value="">Selecione...</option>
              {fields.map((f) => (<option key={f.id} value={f.id}>{f.name} ({f.farm_name})</option>))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Tipo</label>
            <select className="form-select" value={form.crop_type}
              onChange={(e) => setForm({ ...form, crop_type: e.target.value })}>
              {cropService.cropTypeChoices.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Cultura *</label>
            <input className="form-control" placeholder="Ex: Milho, Soja" value={form.crop_name}
              onChange={(e) => setForm({ ...form, crop_name: e.target.value })} required />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Variedade</label>
            <input className="form-control" placeholder="Ex: DKB 390" value={form.variety}
              onChange={(e) => setForm({ ...form, variety: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Área Plantada (ha)</label>
            <input className="form-control" type="number" step="0.01" value={form.planted_area_ha}
              onChange={(e) => setForm({ ...form, planted_area_ha: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Data do Plantio *</label>
            <input className="form-control" type="date" value={form.planting_date}
              onChange={(e) => setForm({ ...form, planting_date: e.target.value })} required />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Previsão Colheita</label>
            <input className="form-control" type="date" value={form.expected_harvest_date}
              onChange={(e) => setForm({ ...form, expected_harvest_date: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Status</label>
            <select className="form-select" value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as PlantationStatus })}>
              {cropService.statusChoices.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
            </select>
          </div>
          <div className="col-12">
            <label className="form-label small fw-medium">Observações</label>
            <textarea className="form-control" rows={3} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
