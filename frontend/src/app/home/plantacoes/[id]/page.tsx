"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, DollarSign, Ruler, Clock, Edit3, Trash2, Sprout, Warehouse, TrendingUp, TrendingDown, Target, Weight, Package, Percent } from "lucide-react";
import { cropService } from "@/services/cropService";
import apiClient from "@/services/api";
import type { Plantation, PlantationDashboard, PlantationStatus } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";

type PlantationDetail = Plantation & PlantationDashboard;

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

function MetricCard({ icon, label, value, variant = "info" }: { icon: React.ReactNode; label: string; value: string; variant?: "info" | "success" | "warning" | "danger" }) {
  const borderMap = {
    info: "#3b82f6", success: "#10b981", warning: "#f59e0b", danger: "#ef4444",
  };
  return (
    <Card className="p-3 border-start" style={{ borderLeft: `4px solid ${borderMap[variant]}` }}>
      <div className="d-flex align-items-center gap-2 mb-1 text-muted small">{icon} {label}</div>
      <div className="fs-4 fw-bold">{value}</div>
    </Card>
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

  const [plantings, setPlantings] = useState<any[]>([]);
  const [showPlantio, setShowPlantio] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<{ id: string; nome: string }[]>([]);
  const [plantioForm, setPlantioForm] = useState({
    item: "", quantity: "", unit: "", unit_price: "", total_price: "",
    planting_date: "", operator: "", notes: "",
  });
  const [savingPlantio, setSavingPlantio] = useState(false);

  const [fertilizations, setFertilizations] = useState<any[]>([]);
  const [showAdubacao, setShowAdubacao] = useState(false);
  const [adubacaoForm, setAdubacaoForm] = useState({ item: "", quantity: "", unit: "", unit_price: "", total_price: "", application_date: "", operator: "" });
  const [savingAdubacao, setSavingAdubacao] = useState(false);

  const [fertigations, setFertigations] = useState<any[]>([]);
  const [showFertirrigacao, setShowFertirrigacao] = useState(false);
  const [fertirrigacaoForm, setFertirrigacaoForm] = useState({ item: "", quantity: "", unit: "", total_price: "", application_date: "", operator: "" });
  const [savingFertirrigacao, setSavingFertirrigacao] = useState(false);

  const [pesticides, setPesticides] = useState<any[]>([]);
  const [showDefensivo, setShowDefensivo] = useState(false);
  const [defensivoForm, setDefensivoForm] = useState({ item: "", pesticide_type: "insecticide", quantity: "", unit: "", unit_price: "", total_price: "", application_date: "", operator: "" });
  const [savingDefensivo, setSavingDefensivo] = useState(false);

  const [irrigations, setIrrigations] = useState<any[]>([]);
  const [showIrrigacao, setShowIrrigacao] = useState(false);
  const [irrigacaoForm, setIrrigacaoForm] = useState({
    date: "", hours: "", flow_rate_l_per_h: "", pump_power_kw: "",
    kwh_value: "", pump: "", operator: "",
  });
  const [savingIrrigacao, setSavingIrrigacao] = useState(false);

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
        const [plantingsRes, fertsRes, fertigsRes, pestsRes, irrigsRes, itemsRes] = await Promise.all([
          cropService.listPlantings({ plantation: id }).catch(() => ({ data: { results: [] } })),
          cropService.listFertilizations({ plantation: id }).catch(() => ({ data: { results: [] } })),
          cropService.listFertigations({ plantation: id }).catch(() => ({ data: { results: [] } })),
          cropService.listPesticideApplications({ plantation: id }).catch(() => ({ data: { results: [] } })),
          cropService.listIrrigations({ plantation: id }).catch(() => ({ data: { results: [] } })),
          apiClient.get("/inventory/items/", { params: { page_size: 500 } }).catch(() => ({ data: { results: [] } })),
        ]);
        setPlantings(Array.isArray(plantingsRes.data?.results) ? plantingsRes.data.results : []);
        setFertilizations(Array.isArray(fertsRes.data?.results) ? fertsRes.data.results : []);
        setFertigations(Array.isArray(fertigsRes.data?.results) ? fertigsRes.data.results : []);
        setPesticides(Array.isArray(pestsRes.data?.results) ? pestsRes.data.results : []);
        setIrrigations(Array.isArray(irrigsRes.data?.results) ? irrigsRes.data.results : []);
        setInventoryItems(Array.isArray(itemsRes.data?.results) ? itemsRes.data.results : []);
      } catch { console.error("Failed to load plantation"); }
      finally { setLoading(false); }
    })();
  }, [id]);

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

  const handleCreateAdubacao = async () => {
    if (!plantation || !adubacaoForm.item) return;
    try {
      setSavingAdubacao(true);
      const total = adubacaoForm.total_price || (adubacaoForm.quantity && adubacaoForm.unit_price ? String(parseFloat(adubacaoForm.quantity) * parseFloat(adubacaoForm.unit_price)) : "0");
      await cropService.createFertilization({
        plantation: plantation.id, item: adubacaoForm.item, quantity: adubacaoForm.quantity,
        unit: adubacaoForm.unit, unit_price: adubacaoForm.unit_price || null, total_price: total,
        application_date: adubacaoForm.application_date, operator: adubacaoForm.operator,
      });
      setShowAdubacao(false);
      setAdubacaoForm({ item: "", quantity: "", unit: "", unit_price: "", total_price: "", application_date: "", operator: "" });
      const { data: r } = await cropService.listFertilizations({ plantation: plantation.id });
      setFertilizations(Array.isArray(r?.results) ? r.results : []);
    } catch { console.error("Failed to create fertilization"); }
    finally { setSavingAdubacao(false); }
  };

  const handleCreateFertirrigacao = async () => {
    if (!plantation || !fertirrigacaoForm.item) return;
    try {
      setSavingFertirrigacao(true);
      await cropService.createFertigation({
        plantation: plantation.id, item: fertirrigacaoForm.item, quantity: fertirrigacaoForm.quantity,
        unit: fertirrigacaoForm.unit, total_price: fertirrigacaoForm.total_price || null,
        application_date: fertirrigacaoForm.application_date, operator: fertirrigacaoForm.operator,
      });
      setShowFertirrigacao(false);
      setFertirrigacaoForm({ item: "", quantity: "", unit: "", total_price: "", application_date: "", operator: "" });
      const { data: r } = await cropService.listFertigations({ plantation: plantation.id });
      setFertigations(Array.isArray(r?.results) ? r.results : []);
    } catch { console.error("Failed to create fertigation"); }
    finally { setSavingFertirrigacao(false); }
  };

  const handleCreateDefensivo = async () => {
    if (!plantation || !defensivoForm.item) return;
    try {
      setSavingDefensivo(true);
      const total = defensivoForm.total_price || (defensivoForm.quantity && defensivoForm.unit_price ? String(parseFloat(defensivoForm.quantity) * parseFloat(defensivoForm.unit_price)) : "0");
      await cropService.createPesticideApplication({
        plantation: plantation.id, item: defensivoForm.item, pesticide_type: defensivoForm.pesticide_type,
        quantity: defensivoForm.quantity, unit: defensivoForm.unit,
        unit_price: defensivoForm.unit_price || null, total_price: total,
        application_date: defensivoForm.application_date, operator: defensivoForm.operator,
      });
      setShowDefensivo(false);
      setDefensivoForm({ item: "", pesticide_type: "insecticide", quantity: "", unit: "", unit_price: "", total_price: "", application_date: "", operator: "" });
      const { data: r } = await cropService.listPesticideApplications({ plantation: plantation.id });
      setPesticides(Array.isArray(r?.results) ? r.results : []);
    } catch { console.error("Failed to create pesticide application"); }
    finally { setSavingDefensivo(false); }
  };

  const handleCreateIrrigacao = async () => {
    if (!plantation) return;
    try {
      setSavingIrrigacao(true);
      await cropService.createIrrigation({
        plantation: plantation.id,
        date: irrigacaoForm.date,
        hours: irrigacaoForm.hours || null,
        flow_rate_l_per_h: irrigacaoForm.flow_rate_l_per_h || null,
        pump_power_kw: irrigacaoForm.pump_power_kw || null,
        kwh_value: irrigacaoForm.kwh_value || null,
        pump: irrigacaoForm.pump,
        operator: irrigacaoForm.operator,
      });
      setShowIrrigacao(false);
      setIrrigacaoForm({ date: "", hours: "", flow_rate_l_per_h: "", pump_power_kw: "", kwh_value: "", pump: "", operator: "" });
      const { data: r } = await cropService.listIrrigations({ plantation: plantation.id });
      setIrrigations(Array.isArray(r?.results) ? r.results : []);
    } catch { console.error("Failed to create irrigation"); }
    finally { setSavingIrrigacao(false); }
  };

  const handleCreatePlantio = async () => {
    if (!plantation || !plantioForm.item) return;
    try {
      setSavingPlantio(true);
      const total = plantioForm.total_price || (plantioForm.quantity && plantioForm.unit_price
        ? String(parseFloat(plantioForm.quantity) * parseFloat(plantioForm.unit_price))
        : "0");
      await cropService.createPlanting({
        plantation: plantation.id,
        item: plantioForm.item,
        quantity: plantioForm.quantity,
        unit: plantioForm.unit,
        unit_price: plantioForm.unit_price || null,
        total_price: total,
        planting_date: plantioForm.planting_date,
        operator: plantioForm.operator,
        notes: plantioForm.notes,
      });
      setShowPlantio(false);
      setPlantioForm({ item: "", quantity: "", unit: "", unit_price: "", total_price: "", planting_date: "", operator: "", notes: "" });
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

  const money = (v: string | null | undefined) => {
    if (!v) return "-";
    return `R$ ${fmt(v)}`;
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

  return (
    <div>
      {/* Header */}
      <div className="d-flex align-items-center gap-3 mb-4 flex-wrap">
        <button className="btn btn-outline-secondary btn-sm" onClick={() => router.back()}>
          <ArrowLeft size={16} />
        </button>
        <div className="flex-grow-1">
          <h4 className="mb-0 fw-bold">{plantation.name || plantation.crop_name}</h4>
          <small className="text-muted">{plantation.farm_name} › {plantation.field_name}</small>
        </div>
        <Badge style={{ background: statusColors[plantation.status] || "#6b7280", color: "#fff", fontSize: "0.75rem", fontWeight: 600, padding: "4px 12px", borderRadius: "6px" }}>
          {plantation.status_display}
        </Badge>
        <Button variant="outline-secondary" size="sm" onClick={() => setShowEdit(true)}>
          <Edit3 size={14} /> Editar
        </Button>
        <Button variant="outline-secondary" size="sm" onClick={handleDelete}>
          <Trash2 size={14} />
        </Button>
      </div>

      {/* Main KPIs */}
      <div className="row g-3 mb-4">
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
      <div className="row g-3 mb-4">
        <div className="col-md-3 col-6">
          <MetricCard icon={<DollarSign size={14} />} label="Receita Estimada" value={money(plantation.estimated_revenue)} variant="success" />
        </div>
        <div className="col-md-3 col-6">
          <MetricCard icon={<Target size={14} />} label="Lucro Estimado" value={money(plantation.estimated_profit)} variant={plantation.estimated_profit && parseFloat(plantation.estimated_profit) >= 0 ? "success" : "danger"} />
        </div>
        <div className="col-md-3 col-6">
          <MetricCard icon={<Percent size={14} />} label="ROI Estimado" value={plantation.estimated_roi ? `${fmt(plantation.estimated_roi)}%` : "-"} variant={plantation.estimated_roi && parseFloat(plantation.estimated_roi) >= 0 ? "success" : "danger"} />
        </div>
        <div className="col-md-3 col-6">
          <MetricCard icon={<DollarSign size={14} />} label="Custo por ha" value={money(plantation.cost_per_ha)} variant="warning" />
        </div>
      </div>

      {/* Third row — production KPIs */}
      <div className="row g-3 mb-4">
        <div className="col-md-3 col-6">
          <MetricCard icon={<Weight size={14} />} label="Produção Estimada" value={plantation.estimated_production_kg ? `${fmt(plantation.estimated_production_kg, 0)} kg` : "-"} variant="info" />
        </div>
        <div className="col-md-3 col-6">
          <MetricCard icon={<Package size={14} />} label="Sacas Estimadas" value={plantation.estimated_bags ? `${fmt(plantation.estimated_bags, 0)}` : "-"} variant="info" />
        </div>
        <div className="col-md-3 col-6">
          <MetricCard icon={<TrendingUp size={14} />} label="Receita por ha" value={money(plantation.estimated_revenue_per_ha)} variant="success" />
        </div>
        <div className="col-md-3 col-6">
          <MetricCard icon={<TrendingDown size={14} />} label="Lucro por ha" value={money(plantation.estimated_profit_per_ha)} variant={plantation.estimated_profit_per_ha && parseFloat(plantation.estimated_profit_per_ha) >= 0 ? "success" : "danger"} />
        </div>
      </div>

      {/* Sections */}
      <div className="row g-4">
        {/* Culture Data */}
        <div className="col-md-6">
          <Card className="p-3">
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
          </Card>
        </div>

        {/* Dates */}
        <div className="col-md-6">
          <Card className="p-3">
            <h6 className="fw-bold mb-3"><Calendar size={16} className="me-1" /> Datas</h6>
            <table className="table table-sm table-borderless mb-0">
              <tbody>
                <tr><td className="text-muted small" style={{ width: "40%" }}>Plantio</td><td className="fw-medium">{plantation.planting_date ? new Date(plantation.planting_date).toLocaleDateString("pt-BR") : "-"}</td></tr>
                <tr><td className="text-muted small">Previsão de Colheita</td><td className="fw-medium">{plantation.expected_harvest_date ? new Date(plantation.expected_harvest_date).toLocaleDateString("pt-BR") : "-"}</td></tr>
                <tr><td className="text-muted small">Colheita Real</td><td className="fw-medium">{plantation.actual_harvest_date ? new Date(plantation.actual_harvest_date).toLocaleDateString("pt-BR") : "-"}</td></tr>
                <tr><td className="text-muted small">Responsável</td><td className="fw-medium">{plantation.responsible_name || "-"}</td></tr>
              </tbody>
            </table>
          </Card>
        </div>

        {/* Financial Summary */}
        <div className="col-md-6">
          <Card className="p-3">
            <h6 className="fw-bold mb-3"><DollarSign size={16} className="me-1" /> Resumo Financeiro</h6>
            <table className="table table-sm table-borderless mb-0">
              <tbody>
                <tr><td className="text-muted small" style={{ width: "40%" }}>Investimento Total</td><td className="fw-medium">{money(plantation.investment_total)}</td></tr>
                <tr><td className="text-muted small">Custo por Hectare</td><td className="fw-medium">{money(plantation.cost_per_ha)}</td></tr>
                <tr><td className="text-muted small">Receita Estimada</td><td className="fw-medium text-success">{money(plantation.estimated_revenue)}</td></tr>
                <tr><td className="text-muted small">Receita por Hectare</td><td className="fw-medium">{money(plantation.estimated_revenue_per_ha)}</td></tr>
                <tr><td className="text-muted small">Lucro Estimado</td><td className={`fw-medium ${plantation.estimated_profit && parseFloat(plantation.estimated_profit) >= 0 ? "text-success" : "text-danger"}`}>{money(plantation.estimated_profit)}</td></tr>
                <tr><td className="text-muted small">ROI</td><td className={`fw-medium ${plantation.estimated_roi && parseFloat(plantation.estimated_roi) >= 0 ? "text-success" : "text-danger"}`}>{plantation.estimated_roi ? `${fmt(plantation.estimated_roi)}%` : "-"}</td></tr>
              </tbody>
            </table>
          </Card>
        </div>

        {/* Production Summary */}
        <div className="col-md-6">
          <Card className="p-3">
            <h6 className="fw-bold mb-3"><Warehouse size={16} className="me-1" /> Resumo de Produção</h6>
            <table className="table table-sm table-borderless mb-0">
              <tbody>
                <tr><td className="text-muted small" style={{ width: "40%" }}>Produção Estimada</td><td className="fw-medium">{plantation.estimated_production_kg ? `${fmt(plantation.estimated_production_kg, 0)} kg` : "-"}</td></tr>
                <tr><td className="text-muted small">Sacas Estimadas</td><td className="fw-medium">{plantation.estimated_bags ? `${fmt(plantation.estimated_bags, 0)} sacas` : "-"}</td></tr>
                <tr><td className="text-muted small">Área Plantada</td><td className="fw-medium">{plantation.planted_area_ha ? `${fmt(plantation.planted_area_ha, 2)} ha` : "-"}</td></tr>
              </tbody>
            </table>
          </Card>
        </div>

        {plantation.notes && (
          <div className="col-12">
            <Card className="p-3">
              <h6 className="fw-bold mb-2">Observações</h6>
              <p className="mb-0 text-muted">{plantation.notes}</p>
            </Card>
          </div>
        )}
      </div>

      {/* ── Plantio ──────────────────────────────────────────────────── */}
      <Card className="p-3 mt-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="fw-bold mb-0"><Sprout size={16} className="me-1" /> Plantio</h6>
          <Button variant="agro" size="sm" onClick={() => setShowPlantio(true)}>Registrar Plantio</Button>
        </div>
        {plantings.length === 0 ? (
          <p className="text-muted small mb-0">Nenhum plantio registrado ainda.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm table-borderless mb-0">
              <thead>
                <tr className="text-muted small">
                  <th>Data</th>
                  <th>Insumo</th>
                  <th>Quantidade</th>
                  <th>Valor Total</th>
                  <th>Operador</th>
                </tr>
              </thead>
              <tbody>
                {plantings.map((p: any) => (
                  <tr key={p.id}>
                    <td className="fw-medium">{p.planting_date ? new Date(p.planting_date).toLocaleDateString("pt-BR") : "-"}</td>
                    <td>{p.item_name || "-"}</td>
                    <td>{p.quantity ? `${fmt(p.quantity)} ${p.unit || ""}` : "-"}</td>
                    <td>{p.total_price ? money(p.total_price) : "-"}</td>
                    <td>{p.operator || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Adubação ─────────────────────────────────────────────────── */}
      <Card className="p-3 mt-3">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="fw-bold mb-0"> Adubação</h6>
          <Button variant="agro" size="sm" onClick={() => setShowAdubacao(true)}>Registrar</Button>
        </div>
        {fertilizations.length === 0 ? (
          <p className="text-muted small mb-0">Nenhuma adubação registrada.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm table-borderless mb-0">
              <thead><tr className="text-muted small"><th>Data</th><th>Insumo</th><th>Quantidade</th><th>Valor</th><th>Operador</th></tr></thead>
              <tbody>
                {fertilizations.map((p: any) => (
                  <tr key={p.id}>
                    <td className="fw-medium">{p.application_date ? new Date(p.application_date).toLocaleDateString("pt-BR") : "-"}</td>
                    <td>{p.item_name || "-"}</td>
                    <td>{p.quantity ? `${fmt(p.quantity)} ${p.unit || ""}` : "-"}</td>
                    <td>{p.total_price ? money(p.total_price) : "-"}</td>
                    <td>{p.operator || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Fertirrigação ────────────────────────────────────────────── */}
      <Card className="p-3 mt-3">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="fw-bold mb-0"> Fertirrigação</h6>
          <Button variant="agro" size="sm" onClick={() => setShowFertirrigacao(true)}>Registrar</Button>
        </div>
        {fertigations.length === 0 ? (
          <p className="text-muted small mb-0">Nenhuma fertirrigação registrada.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm table-borderless mb-0">
              <thead><tr className="text-muted small"><th>Data</th><th>Insumo</th><th>Quantidade</th><th>Valor</th><th>Operador</th></tr></thead>
              <tbody>
                {fertigations.map((p: any) => (
                  <tr key={p.id}>
                    <td className="fw-medium">{p.application_date ? new Date(p.application_date).toLocaleDateString("pt-BR") : "-"}</td>
                    <td>{p.item_name || "-"}</td>
                    <td>{p.quantity ? `${fmt(p.quantity)} ${p.unit || ""}` : "-"}</td>
                    <td>{p.total_price ? money(p.total_price) : "-"}</td>
                    <td>{p.operator || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Defensivos ──────────────────────────────────────────────── */}
      <Card className="p-3 mt-3">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="fw-bold mb-0"> Defensivos</h6>
          <Button variant="agro" size="sm" onClick={() => setShowDefensivo(true)}>Registrar</Button>
        </div>
        {pesticides.length === 0 ? (
          <p className="text-muted small mb-0">Nenhum defensivo registrado.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm table-borderless mb-0">
              <thead><tr className="text-muted small"><th>Data</th><th>Insumo</th><th>Tipo</th><th>Quantidade</th><th>Valor</th></tr></thead>
              <tbody>
                {pesticides.map((p: any) => (
                  <tr key={p.id}>
                    <td className="fw-medium">{p.application_date ? new Date(p.application_date).toLocaleDateString("pt-BR") : "-"}</td>
                    <td>{p.item_name || "-"}</td>
                    <td>{p.pesticide_type_display || "-"}</td>
                    <td>{p.quantity ? `${fmt(p.quantity)} ${p.unit || ""}` : "-"}</td>
                    <td>{p.total_price ? money(p.total_price) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Irrigação ─────────────────────────────────────────────────── */}
      <Card className="p-3 mt-3">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="fw-bold mb-0"> Irrigação</h6>
          <Button variant="agro" size="sm" onClick={() => setShowIrrigacao(true)}>Registrar</Button>
        </div>
        {irrigations.length === 0 ? (
          <p className="text-muted small mb-0">Nenhuma irrigação registrada.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm table-borderless mb-0">
              <thead><tr className="text-muted small"><th>Data</th><th>Horas</th><th>Vazão (L/h)</th><th>Litros</th><th>kWh</th><th>Custo</th></tr></thead>
              <tbody>
                {irrigations.map((irr: any) => (
                  <tr key={irr.id}>
                    <td className="fw-medium">{irr.date ? new Date(irr.date + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                    <td>{irr.hours ?? "-"}</td>
                    <td>{irr.flow_rate_l_per_h ?? "-"}</td>
                    <td>{irr.liters_used ? fmt(irr.liters_used) : "-"}</td>
                    <td>{irr.energy_kwh ?? "-"}</td>
                    <td>{irr.energy_cost ? money(irr.energy_cost) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal: Novo Plantio */}
      <Modal isOpen={showPlantio} onClose={() => setShowPlantio(false)} title="Registrar Plantio"
        footer={
          <div className="d-flex gap-2 justify-content-end">
            <Button variant="outline-secondary" onClick={() => setShowPlantio(false)}>Cancelar</Button>
            <Button onClick={handleCreatePlantio} disabled={savingPlantio}>{savingPlantio ? "Salvando..." : "Salvar"}</Button>
          </div>
        }
      >
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label small fw-medium">Insumo (Semente) *</label>
            <select className="form-select" value={plantioForm.item}
              onChange={(e) => setPlantioForm({ ...plantioForm, item: e.target.value })}>
              <option value="">Selecione...</option>
              {inventoryItems.map((i) => (
                <option key={i.id} value={i.id}>{i.nome}</option>
              ))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Quantidade *</label>
            <input className="form-control" type="number" step="0.01" value={plantioForm.quantity}
              onChange={(e) => {
                const q = e.target.value;
                const price = plantioForm.unit_price;
                const total = q && price ? String(parseFloat(q) * parseFloat(price)) : "";
                setPlantioForm({ ...plantioForm, quantity: q, total_price: total });
              }} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Unidade</label>
            <input className="form-control" value={plantioForm.unit}
              onChange={(e) => setPlantioForm({ ...plantioForm, unit: e.target.value })} placeholder="kg, sc, un" />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Preço Unitário (R$)</label>
            <input className="form-control" type="number" step="0.01" value={plantioForm.unit_price}
              onChange={(e) => {
                const up = e.target.value;
                const q = plantioForm.quantity;
                const total = q && up ? String(parseFloat(q) * parseFloat(up)) : "";
                setPlantioForm({ ...plantioForm, unit_price: up, total_price: total });
              }} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Valor Total (R$)</label>
            <input className="form-control" type="number" step="0.01" value={plantioForm.total_price}
              onChange={(e) => setPlantioForm({ ...plantioForm, total_price: e.target.value })} />
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
        footer={<div className="d-flex gap-2 justify-content-end"><Button variant="outline-secondary" onClick={() => setShowAdubacao(false)}>Cancelar</Button><Button onClick={handleCreateAdubacao} disabled={savingAdubacao}>{savingAdubacao ? "Salvando..." : "Salvar"}</Button></div>}
      >
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label small fw-medium">Insumo *</label>
            <select className="form-select" value={adubacaoForm.item} onChange={(e) => setAdubacaoForm({ ...adubacaoForm, item: e.target.value })}>
              <option value="">Selecione...</option>
              {inventoryItems.map((i) => (<option key={i.id} value={i.id}>{i.nome}</option>))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Quantidade *</label>
            <input className="form-control" type="number" step="0.01" value={adubacaoForm.quantity}
              onChange={(e) => { const q = e.target.value; const up = adubacaoForm.unit_price; setAdubacaoForm({ ...adubacaoForm, quantity: q, total_price: q && up ? String(parseFloat(q) * parseFloat(up)) : "" }); }} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Unidade</label>
            <input className="form-control" value={adubacaoForm.unit} onChange={(e) => setAdubacaoForm({ ...adubacaoForm, unit: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Preço Unit. (R$)</label>
            <input className="form-control" type="number" step="0.01" value={adubacaoForm.unit_price}
              onChange={(e) => { const up = e.target.value; const q = adubacaoForm.quantity; setAdubacaoForm({ ...adubacaoForm, unit_price: up, total_price: q && up ? String(parseFloat(q) * parseFloat(up)) : "" }); }} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Valor Total (R$)</label>
            <input className="form-control" type="number" step="0.01" value={adubacaoForm.total_price} onChange={(e) => setAdubacaoForm({ ...adubacaoForm, total_price: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Data</label>
            <input className="form-control" type="date" value={adubacaoForm.application_date} onChange={(e) => setAdubacaoForm({ ...adubacaoForm, application_date: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Operador</label>
            <input className="form-control" value={adubacaoForm.operator} onChange={(e) => setAdubacaoForm({ ...adubacaoForm, operator: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Modal: Nova Fertirrigação */}
      <Modal isOpen={showFertirrigacao} onClose={() => setShowFertirrigacao(false)} title="Registrar Fertirrigação"
        footer={<div className="d-flex gap-2 justify-content-end"><Button variant="outline-secondary" onClick={() => setShowFertirrigacao(false)}>Cancelar</Button><Button onClick={handleCreateFertirrigacao} disabled={savingFertirrigacao}>{savingFertirrigacao ? "Salvando..." : "Salvar"}</Button></div>}
      >
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label small fw-medium">Insumo *</label>
            <select className="form-select" value={fertirrigacaoForm.item} onChange={(e) => setFertirrigacaoForm({ ...fertirrigacaoForm, item: e.target.value })}>
              <option value="">Selecione...</option>
              {inventoryItems.map((i) => (<option key={i.id} value={i.id}>{i.nome}</option>))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Quantidade *</label>
            <input className="form-control" type="number" step="0.01" value={fertirrigacaoForm.quantity} onChange={(e) => setFertirrigacaoForm({ ...fertirrigacaoForm, quantity: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Unidade</label>
            <input className="form-control" value={fertirrigacaoForm.unit} onChange={(e) => setFertirrigacaoForm({ ...fertirrigacaoForm, unit: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Valor Total (R$)</label>
            <input className="form-control" type="number" step="0.01" value={fertirrigacaoForm.total_price} onChange={(e) => setFertirrigacaoForm({ ...fertirrigacaoForm, total_price: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Data</label>
            <input className="form-control" type="date" value={fertirrigacaoForm.application_date} onChange={(e) => setFertirrigacaoForm({ ...fertirrigacaoForm, application_date: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Operador</label>
            <input className="form-control" value={fertirrigacaoForm.operator} onChange={(e) => setFertirrigacaoForm({ ...fertirrigacaoForm, operator: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Modal: Novo Defensivo */}
      <Modal isOpen={showDefensivo} onClose={() => setShowDefensivo(false)} title="Registrar Defensivo"
        footer={<div className="d-flex gap-2 justify-content-end"><Button variant="outline-secondary" onClick={() => setShowDefensivo(false)}>Cancelar</Button><Button onClick={handleCreateDefensivo} disabled={savingDefensivo}>{savingDefensivo ? "Salvando..." : "Salvar"}</Button></div>}
      >
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label small fw-medium">Insumo *</label>
            <select className="form-select" value={defensivoForm.item} onChange={(e) => setDefensivoForm({ ...defensivoForm, item: e.target.value })}>
              <option value="">Selecione...</option>
              {inventoryItems.map((i) => (<option key={i.id} value={i.id}>{i.nome}</option>))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Tipo</label>
            <select className="form-select" value={defensivoForm.pesticide_type} onChange={(e) => setDefensivoForm({ ...defensivoForm, pesticide_type: e.target.value })}>
              <option value="insecticide">Inseticida</option>
              <option value="herbicide">Herbicida</option>
              <option value="fungicide">Fungicida</option>
              <option value="adjuvant">Adjuvante</option>
              <option value="acaricide">Acaricida</option>
              <option value="bactericide">Bactericida</option>
              <option value="other">Outro</option>
            </select>
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Quantidade *</label>
            <input className="form-control" type="number" step="0.01" value={defensivoForm.quantity}
              onChange={(e) => { const q = e.target.value; const up = defensivoForm.unit_price; setDefensivoForm({ ...defensivoForm, quantity: q, total_price: q && up ? String(parseFloat(q) * parseFloat(up)) : "" }); }} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Unidade</label>
            <input className="form-control" value={defensivoForm.unit} onChange={(e) => setDefensivoForm({ ...defensivoForm, unit: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Preço Unit. (R$)</label>
            <input className="form-control" type="number" step="0.01" value={defensivoForm.unit_price}
              onChange={(e) => { const up = e.target.value; const q = defensivoForm.quantity; setDefensivoForm({ ...defensivoForm, unit_price: up, total_price: q && up ? String(parseFloat(q) * parseFloat(up)) : "" }); }} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Valor Total (R$)</label>
            <input className="form-control" type="number" step="0.01" value={defensivoForm.total_price} onChange={(e) => setDefensivoForm({ ...defensivoForm, total_price: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Data</label>
            <input className="form-control" type="date" value={defensivoForm.application_date} onChange={(e) => setDefensivoForm({ ...defensivoForm, application_date: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Operador</label>
            <input className="form-control" value={defensivoForm.operator} onChange={(e) => setDefensivoForm({ ...defensivoForm, operator: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Modal: Nova Irrigação */}
      <Modal isOpen={showIrrigacao} onClose={() => setShowIrrigacao(false)} title="Registrar Irrigação"
        footer={<div className="d-flex gap-2 justify-content-end"><Button variant="outline-secondary" onClick={() => setShowIrrigacao(false)}>Cancelar</Button><Button onClick={handleCreateIrrigacao} disabled={savingIrrigacao}>{savingIrrigacao ? "Salvando..." : "Salvar"}</Button></div>}
      >
        <div className="row g-3">
          <div className="col-6">
            <label className="form-label small fw-medium">Data *</label>
            <input className="form-control" type="date" value={irrigacaoForm.date} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, date: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Bomba *</label>
            <input className="form-control" value={irrigacaoForm.pump} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, pump: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Horas</label>
            <input className="form-control" type="number" step="0.1" value={irrigacaoForm.hours} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, hours: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Vazão (L/h)</label>
            <input className="form-control" type="number" step="0.01" value={irrigacaoForm.flow_rate_l_per_h} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, flow_rate_l_per_h: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Potência da Bomba (kW)</label>
            <input className="form-control" type="number" step="0.01" value={irrigacaoForm.pump_power_kw} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, pump_power_kw: e.target.value })} />
          </div>
          <div className="col-6">
            <label className="form-label small fw-medium">Valor kWh</label>
            <input className="form-control" type="number" step="0.0001" value={irrigacaoForm.kwh_value} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, kwh_value: e.target.value })} />
          </div>
          <div className="col-12">
            <label className="form-label small fw-medium">Operador</label>
            <input className="form-control" value={irrigacaoForm.operator} onChange={(e) => setIrrigacaoForm({ ...irrigacaoForm, operator: e.target.value })} />
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
      </Modal>
    </div>
  );
}
