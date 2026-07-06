"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ArrowLeft,
  BarChart3,
  DollarSign,
  Edit3,
  FileText,
  Info,
  Plus,
  Save,
  ShoppingBag,
  Trash2,
  WalletCards,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { cropService } from "@/services/cropService";

type Plantation = {
  id: string;
  name?: string;
  crop_name?: string;
  field_name?: string;
  farm_name?: string;
};

type HarvestBuyer = {
  id: string;
  name: string;
  document?: string;
  phone?: string;
};

type Harvest = {
  id: string;
  harvest_type: "partial" | "total";
  harvest_type_display?: string;
  harvest_date: string;
  yield_kg: string;
  destination: string;
  destination_display?: string;
  buyer?: string | null;
  buyer_name?: string;
  buyer_name_display?: string;
  unit_price?: string | null;
  revenue_amount: string;
  notes?: string;
};

type HarvestForm = {
  harvest_type: "partial" | "total";
  harvest_date: string;
  yield_kg: string;
  destination: "sale" | "stock" | "own_use" | "seed" | "other";
  buyer: string;
  unit_price: string;
  notes: string;
};

type BuyerForm = {
  name: string;
  document: string;
  phone: string;
  notes: string;
};

const today = () => new Date().toISOString().split("T")[0];

const destinationOptions = [
  { value: "sale", label: "Venda" },
  { value: "stock", label: "Estoque" },
  { value: "own_use", label: "Uso próprio" },
  { value: "seed", label: "Semente" },
  { value: "other", label: "Outro" },
];

const extractArray = <T,>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

const decimalValue = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const rawValue = value.trim();
  if (!rawValue) return 0;

  const valueWithoutSpaces = rawValue.replace(/\s/g, "");
  const lastComma = valueWithoutSpaces.lastIndexOf(",");
  const lastDot = valueWithoutSpaces.lastIndexOf(".");
  let normalized = valueWithoutSpaces;

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandSeparator = decimalSeparator === "," ? "." : ",";
    normalized = valueWithoutSpaces.replaceAll(thousandSeparator, "").replace(decimalSeparator, ".");
  } else if (lastComma !== -1) {
    normalized = valueWithoutSpaces.replace(/\./g, "").replace(",", ".");
  } else if (lastDot !== -1) {
    const dotParts = valueWithoutSpaces.split(".");
    const decimalDigits = dotParts.at(-1)?.length ?? 0;
    const looksLikeThousandSeparator = dotParts.length > 2 || decimalDigits === 3;
    normalized = looksLikeThousandSeparator ? valueWithoutSpaces.replace(/\./g, "") : valueWithoutSpaces;
  }

  const parsed = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const numberText = (value: number, suffix = "") =>
  `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;

const money = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

const dateText = (value: string) => {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
};

export default function ColheitaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plantation, setPlantation] = useState<Plantation | null>(null);
  const [buyers, setBuyers] = useState<HarvestBuyer[]>([]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBuyer, setSavingBuyer] = useState(false);
  const [showBuyerForm, setShowBuyerForm] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [editingHarvestId, setEditingHarvestId] = useState<string | null>(null);
  const [deletingHarvestId, setDeletingHarvestId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState<HarvestForm>({
    harvest_type: "partial",
    harvest_date: today(),
    yield_kg: "",
    destination: "sale",
    buyer: "",
    unit_price: "",
    notes: "",
  });

  const [buyerForm, setBuyerForm] = useState<BuyerForm>({
    name: "",
    document: "",
    phone: "",
    notes: "",
  });

  useEffect(() => {
    if (!id) return;

    let active = true;

    Promise.all([
      cropService.get(id),
      cropService.listHarvestBuyers({ is_active: true }),
      cropService.listHarvests({ planting_cycle: id }),
    ])
      .then(([plantationRes, buyersRes, harvestsRes]) => {
        if (!active) return;
        setError("");
        setPlantation(plantationRes.data);
        setBuyers(extractArray<HarvestBuyer>(buyersRes.data));
        setHarvests(extractArray<Harvest>(harvestsRes.data));
      })
      .catch(() => {
        if (!active) return;
        setError("Não foi possível carregar os dados de colheita.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const quantity = decimalValue(form.yield_kg);
  const unitPrice = decimalValue(form.unit_price);
  const currentRevenue = form.destination === "sale" ? quantity * unitPrice : 0;

  const summary = useMemo(() => {
    const baseHarvests = editingHarvestId ? harvests.filter((harvest) => harvest.id !== editingHarvestId) : harvests;
    const accumulatedQuantity = baseHarvests.reduce((sum, harvest) => sum + decimalValue(harvest.yield_kg), 0);
    const accumulatedRevenue = baseHarvests.reduce((sum, harvest) => sum + decimalValue(harvest.revenue_amount), 0);
    const projectedQuantity = accumulatedQuantity + quantity;
    const projectedRevenue = accumulatedRevenue + currentRevenue;
    const averagePrice = projectedQuantity > 0 ? projectedRevenue / projectedQuantity : 0;

    return {
      accumulatedQuantity,
      accumulatedRevenue,
      projectedQuantity,
      projectedRevenue,
      averagePrice,
    };
  }, [currentRevenue, editingHarvestId, harvests, quantity]);

  const visibleHarvests = showAllHistory ? harvests : harvests.slice(0, 3);

  const updateForm = (patch: Partial<HarvestForm>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const updateBuyerForm = (patch: Partial<BuyerForm>) => {
    setBuyerForm((current) => ({ ...current, ...patch }));
  };

  const resetForm = () => {
    setEditingHarvestId(null);
    setForm({
      harvest_type: "partial",
      harvest_date: today(),
      yield_kg: "",
      destination: "sale",
      buyer: form.buyer,
      unit_price: "",
      notes: "",
    });
  };

  const validateForm = () => {
    if (!form.harvest_date) return "Informe a data da colheita.";
    if (quantity <= 0) return "Informe uma quantidade colhida maior que zero.";
    if (!form.destination) return "Selecione o destino da produção.";
    if (form.destination === "sale" && !form.buyer) return "Selecione o comprador/cliente.";
    if (form.destination === "sale" && unitPrice <= 0) return "Informe um preço de venda maior que zero.";
    if (form.notes.length > 200) return "As observações devem ter no máximo 200 caracteres.";
    return "";
  };

  const refreshHarvests = async () => {
    if (!id) return;
    const response = await cropService.listHarvests({ planting_cycle: id });
    setHarvests(extractArray<Harvest>(response.data));
  };

  const handleSaveBuyer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!buyerForm.name.trim() || savingBuyer) return;

    try {
      setSavingBuyer(true);
      setError("");
      const response = await cropService.createHarvestBuyer({
        name: buyerForm.name.trim(),
        document: buyerForm.document.trim(),
        phone: buyerForm.phone.trim(),
        notes: buyerForm.notes.trim(),
        is_active: true,
      });
      const newBuyer = response.data as HarvestBuyer;
      setBuyers((current) => [newBuyer, ...current]);
      updateForm({ buyer: newBuyer.id });
      setBuyerForm({ name: "", document: "", phone: "", notes: "" });
      setShowBuyerForm(false);
    } catch {
      setError("Não foi possível cadastrar o comprador.");
    } finally {
      setSavingBuyer(false);
    }
  };

  const handleSubmit = async () => {
    if (saving || !id) return;

    const validation = validateForm();
    if (validation) {
      setError(validation);
      return;
    }

    try {
      setSaving(true);
      setError("");
      const payload = {
        planting_cycle: id,
        harvest_type: form.harvest_type,
        harvest_date: form.harvest_date,
        yield_kg: quantity,
        destination: form.destination,
        buyer: form.destination === "sale" ? form.buyer : null,
        unit_price: form.destination === "sale" ? unitPrice : null,
        notes: form.notes.trim(),
      };

      if (editingHarvestId) {
        await cropService.updateHarvest(editingHarvestId, payload);
      } else {
        await cropService.createHarvest(payload);
      }

      await refreshHarvests();
      resetForm();
    } catch {
      setError("Erro ao salvar a colheita. Verifique os dados e tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditHarvest = (harvest: Harvest) => {
    setEditingHarvestId(harvest.id);
    setError("");
    setForm({
      harvest_type: harvest.harvest_type,
      harvest_date: harvest.harvest_date,
      yield_kg: String(harvest.yield_kg ?? ""),
      destination: harvest.destination as HarvestForm["destination"],
      buyer: harvest.buyer || "",
      unit_price: harvest.unit_price ? String(harvest.unit_price) : "",
      notes: harvest.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteHarvest = async (harvest: Harvest) => {
    if (!window.confirm("Remover esta colheita do histórico?")) return;

    try {
      setDeletingHarvestId(harvest.id);
      setError("");
      await cropService.deleteHarvest(harvest.id);
      if (editingHarvestId === harvest.id) resetForm();
      await refreshHarvests();
    } catch {
      setError("Não foi possível remover a colheita. Tente novamente.");
    } finally {
      setDeletingHarvestId(null);
    }
  };

  const handleGeneratePdf = () => {
    const doc = new jsPDF();
    const title = plantation?.name || plantation?.crop_name || "Colheita";

    doc.setFontSize(16);
    doc.text(`Relatório de Colheita - ${title}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Talhão: ${plantation?.field_name || "-"} | Fazenda: ${plantation?.farm_name || "-"}`, 14, 26);
    doc.text(`Produção acumulada: ${numberText(summary.accumulatedQuantity, " kg")}`, 14, 34);
    doc.text(`Receita acumulada: ${money(summary.accumulatedRevenue)}`, 14, 42);

    autoTable(doc, {
      startY: 52,
      head: [["Data", "Tipo", "Quantidade", "Preço", "Receita", "Comprador"]],
      body: harvests.map((harvest) => [
        dateText(harvest.harvest_date),
        harvest.harvest_type_display || (harvest.harvest_type === "total" ? "Total" : "Parcial"),
        numberText(decimalValue(harvest.yield_kg), " kg"),
        `${money(decimalValue(harvest.unit_price))} / kg`,
        money(decimalValue(harvest.revenue_amount)),
        harvest.buyer_name_display || harvest.buyer_name || "-",
      ]),
    });

    doc.save(`colheita-${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
  };

  if (loading) {
    return (
      <div className="p-4">
        <Skeleton height="56px" width="360px" className="mb-4" />
        <Skeleton height="520px" className="mb-3" />
        <Skeleton height="150px" className="mb-3" />
        <Skeleton height="220px" />
      </div>
    );
  }

  if (!plantation) {
    return <div className="p-4 text-muted">Plantação não encontrada.</div>;
  }

  return (
    <div className="pb-4">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
        <div className="d-flex align-items-start gap-3">
          <div
            className="d-flex align-items-center justify-content-center flex-shrink-0"
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "color-mix(in srgb, var(--primary), transparent 90%)",
              color: "var(--primary)",
            }}
          >
            <ShoppingBag size={30} />
          </div>
          <div>
            <h1 className="fw-black text-foreground mb-1" style={{ fontSize: "1.75rem" }}>
              Colheita
            </h1>
            <p className="text-muted-foreground mb-0">
              Registre as informações de cada colheita realizada nesta cultura.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-outline-secondary d-flex align-items-center gap-2 px-4"
          style={{ height: 46, borderRadius: 10, fontWeight: 700 }}
          onClick={() => router.push(`/home/plantacoes/${id}`)}
        >
          <ArrowLeft size={18} />
          Voltar
        </button>
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 mb-3" role="alert">
          {error}
        </div>
      )}

      <div className="dashboard-card p-4 mb-3">
        <h2 className="fw-black text-foreground mb-4" style={{ fontSize: "1.2rem" }}>
          {editingHarvestId ? "Editar colheita" : "Registrar colheita"}
        </h2>

        <div className="row g-4 mb-4">
          <div className="col-12 col-lg-6">
            <label className="form-label fw-bold text-foreground">Tipo de colheita</label>
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <HarvestTypeCard
                  selected={form.harvest_type === "partial"}
                  title="Colheita parcial"
                  description="Colheita realizada em etapas"
                  onClick={() => updateForm({ harvest_type: "partial" })}
                />
              </div>
              <div className="col-12 col-md-6">
                <HarvestTypeCard
                  selected={form.harvest_type === "total"}
                  title="Colheita total"
                  description="Colheita de toda a área"
                  onClick={() => updateForm({ harvest_type: "total" })}
                />
              </div>
            </div>
          </div>

          <div className="col-12 col-lg-6">
            <label className="form-label fw-bold text-foreground">Data da colheita</label>
            <input
              className="form-control"
              type="date"
              value={form.harvest_date}
              onChange={(event) => updateForm({ harvest_date: event.target.value })}
              style={{ height: 50, borderRadius: 10 }}
            />
          </div>
        </div>

        <div className="row g-4 mb-4">
          <div className="col-12 col-lg-6">
            <label className="form-label fw-bold text-foreground">
              Quantidade colhida <span className="text-danger">*</span>
            </label>
            <div className="input-group">
              <input
                className="form-control"
                inputMode="decimal"
                value={form.yield_kg}
                onChange={(event) => updateForm({ yield_kg: event.target.value })}
                placeholder="25.000,00"
                style={{ height: 50, borderRadius: "10px 0 0 10px" }}
              />
              <span className="input-group-text bg-white fw-bold" style={{ borderRadius: "0 10px 10px 0" }}>
                kg
              </span>
            </div>
            <div className="text-muted-foreground small mt-2">Informe a quantidade colhida nesta etapa.</div>
          </div>

          <div className="col-12 col-lg-6">
            <label className="form-label fw-bold text-foreground">
              Destino da produção <span className="text-danger">*</span>
            </label>
            <select
              className="form-select"
              value={form.destination}
              onChange={(event) => updateForm({ destination: event.target.value as HarvestForm["destination"] })}
              style={{ height: 50, borderRadius: 10 }}
            >
              {destinationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="text-muted-foreground small mt-2">Para onde será destinada esta produção.</div>
          </div>
        </div>

        <div className="row g-4 mb-4">
          <div className="col-12 col-lg-6">
            <label className="form-label fw-bold text-foreground">
              Comprador / Cliente <span className="text-danger">*</span>
            </label>
            <div className="row g-3">
              <div className="col">
                <select
                  className="form-select"
                  value={form.buyer}
                  disabled={form.destination !== "sale"}
                  onChange={(event) => updateForm({ buyer: event.target.value })}
                  style={{ height: 50, borderRadius: 10 }}
                >
                  <option value="">Selecione</option>
                  {buyers.map((buyer) => (
                    <option key={buyer.id} value={buyer.id}>
                      {buyer.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-auto">
                <button
                  type="button"
                  className="btn btn-outline-success d-flex align-items-center gap-2 px-3"
                  disabled={form.destination !== "sale"}
                  onClick={() => setShowBuyerForm(true)}
                  style={{ height: 50, borderRadius: 10, fontWeight: 800 }}
                >
                  <Plus size={18} />
                  Novo cliente
                </button>
              </div>
            </div>
            <div className="text-muted-foreground small mt-2">Selecione para quem foi vendida a produção.</div>
          </div>

          <div className="col-12 col-lg-6">
            <label className="form-label fw-bold text-foreground">
              Preço de venda <span className="text-danger">*</span>
            </label>
            <div className="input-group">
              <input
                className="form-control"
                inputMode="decimal"
                disabled={form.destination !== "sale"}
                value={form.unit_price}
                onChange={(event) => updateForm({ unit_price: event.target.value })}
                placeholder="1,20"
                style={{ height: 50, borderRadius: "10px 0 0 10px" }}
              />
              <span className="input-group-text bg-white fw-bold" style={{ borderRadius: "0 10px 10px 0" }}>
                R$ / kg
              </span>
            </div>
            <div className="text-muted-foreground small mt-2">Informe o preço de venda por unidade.</div>
          </div>
        </div>

        <div
          className="p-3 mb-4 border d-flex flex-wrap align-items-center justify-content-between gap-3"
          style={{
            borderRadius: 10,
            background: "linear-gradient(90deg, color-mix(in srgb, var(--primary), transparent 94%), white)",
          }}
        >
          <div className="d-flex align-items-center gap-3">
            <div
              className="d-flex align-items-center justify-content-center text-white"
              style={{ width: 44, height: 44, borderRadius: 999, background: "var(--primary)" }}
            >
              <DollarSign size={25} />
            </div>
            <div>
              <div className="fw-bold text-foreground small">Receita desta colheita</div>
              <div className="fw-black text-foreground" style={{ fontSize: "1.35rem" }}>
                {money(currentRevenue)}
              </div>
            </div>
          </div>

          <div>
            <div className="text-muted-foreground small mb-1">Cálculo automático</div>
            <div className="fw-medium text-foreground">
              {numberText(quantity, " kg")} x {money(unitPrice)}
            </div>
          </div>
        </div>

        <div>
          <label className="form-label fw-bold text-foreground">Observações (opcional)</label>
          <div className="position-relative">
            <textarea
              className="form-control"
              rows={4}
              maxLength={200}
              value={form.notes}
              onChange={(event) => updateForm({ notes: event.target.value })}
              placeholder="Primeira colheita da safra. Frutos de excelente qualidade."
              style={{ borderRadius: 10, resize: "none", paddingBottom: 32 }}
            />
            <span className="position-absolute text-muted-foreground small" style={{ right: 14, bottom: 12 }}>
              {form.notes.length}/200
            </span>
          </div>
        </div>
      </div>

      <div className="dashboard-card p-4 mb-3">
        <h3 className="fw-black text-foreground mb-3" style={{ fontSize: "1rem" }}>
          Resumo da colheita
        </h3>
        <div className="row g-3">
          <SummaryCard icon={<ShoppingBag size={24} />} color="oklch(0.58 0.16 145)" label="Quantidade colhida" value={numberText(quantity, " kg")} helper="nesta etapa" />
          <SummaryCard icon={<DollarSign size={24} />} color="oklch(0.58 0.16 245)" label="Receita desta colheita" value={money(currentRevenue)} helper="valor desta etapa" />
          <SummaryCard icon={<BarChart3 size={24} />} color="oklch(0.72 0.17 75)" label="Produção acumulada" value={numberText(summary.projectedQuantity, " kg")} helper="na cultura" />
          <SummaryCard icon={<WalletCards size={24} />} color="oklch(0.62 0.14 305)" label="Receita acumulada" value={money(summary.projectedRevenue)} helper="na cultura" />
          <SummaryCard icon={<BarChart3 size={24} />} color="oklch(0.62 0.14 185)" label="Média de preço" value={`${money(summary.averagePrice)} / kg`} helper="média dos kg vendidos" />
        </div>
        <div className="d-flex align-items-center gap-2 text-muted-foreground small mt-3">
          <Info size={16} />
          Os valores acumulados consideram todas as colheitas já registradas nesta cultura.
        </div>
      </div>

      <div className="dashboard-card p-4 mb-3">
        <h3 className="fw-black text-foreground mb-3" style={{ fontSize: "1rem" }}>
          Histórico de colheitas
        </h3>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Quantidade</th>
                <th>Preço (R$)</th>
                <th>Receita (R$)</th>
                <th>Comprador</th>
                <th className="text-end">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visibleHarvests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-4">
                    Nenhuma colheita registrada ainda.
                  </td>
                </tr>
              ) : (
                visibleHarvests.map((harvest) => (
                  <tr key={harvest.id}>
                    <td>{dateText(harvest.harvest_date)}</td>
                    <td>
                      <span className="badge bg-success-subtle text-success">
                        {harvest.harvest_type_display || (harvest.harvest_type === "total" ? "Total" : "Parcial")}
                      </span>
                    </td>
                    <td>{numberText(decimalValue(harvest.yield_kg), " kg")}</td>
                    <td>{money(decimalValue(harvest.unit_price))} / kg</td>
                    <td className="fw-bold">{money(decimalValue(harvest.revenue_amount))}</td>
                    <td>{harvest.buyer_name_display || harvest.buyer_name || "-"}</td>
                    <td>
                      <div className="d-flex justify-content-end gap-2">
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => handleEditHarvest(harvest)}
                          title="Editar colheita"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          disabled={deletingHarvestId === harvest.id}
                          onClick={() => handleDeleteHarvest(harvest)}
                          title="Remover colheita"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {harvests.length > 3 && (
          <button
            type="button"
            className="btn btn-outline-success mt-3"
            onClick={() => setShowAllHistory((current) => !current)}
            style={{ borderRadius: 10, fontWeight: 800 }}
          >
            {showAllHistory ? "Ver menos" : "Ver histórico completo"}
          </button>
        )}

        <div className="d-flex flex-wrap justify-content-end gap-3 mt-4">
          <button
            type="button"
            className="btn btn-outline-secondary px-5"
            onClick={() => (editingHarvestId ? resetForm() : router.push(`/home/plantacoes/${id}`))}
            style={{ height: 48, borderRadius: 10, fontWeight: 800 }}
          >
            {editingHarvestId ? "Cancelar edição" : "Cancelar"}
          </button>
          <button
            type="button"
            className="btn btn-success d-flex align-items-center justify-content-center gap-2 px-5"
            disabled={saving}
            onClick={handleSubmit}
            style={{ height: 48, borderRadius: 10, fontWeight: 800, minWidth: 190 }}
          >
            <Save size={18} />
            {saving ? "Salvando..." : editingHarvestId ? "Atualizar colheita" : "Salvar colheita"}
          </button>
        </div>
      </div>

      <div
        className="dashboard-card p-3 d-flex flex-wrap align-items-center justify-content-between gap-3"
        style={{ background: "color-mix(in srgb, var(--primary), transparent 96%)" }}
      >
        <div className="d-flex align-items-center gap-3">
          <FileText className="text-success" size={25} />
          <div>
            <div className="fw-black text-success">Gerar relatório em PDF</div>
            <div className="text-muted-foreground small">Gere um relatório completo desta colheita e de todas as colheitas da cultura.</div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline-success d-flex align-items-center gap-2 px-5"
          onClick={handleGeneratePdf}
          style={{ height: 46, borderRadius: 10, fontWeight: 800 }}
        >
          <FileText size={18} />
          Gerar PDF
        </button>
      </div>

      {showBuyerForm && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ background: "rgba(15, 23, 42, 0.35)", zIndex: 1050 }}
        >
          <div className="dashboard-card p-4 w-100" style={{ maxWidth: 560 }}>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h4 className="fw-black text-foreground mb-0" style={{ fontSize: "1.1rem" }}>
                Novo comprador / cliente
              </h4>
              <button
                type="button"
                className="btn btn-link text-muted-foreground p-1"
                onClick={() => setShowBuyerForm(false)}
                aria-label="Fechar cadastro"
              >
                x
              </button>
            </div>

            <form className="row g-3" onSubmit={handleSaveBuyer}>
              <div className="col-12">
                <label className="form-label fw-bold text-foreground">
                  Nome <span className="text-danger">*</span>
                </label>
                <input
                  className="form-control"
                  required
                  value={buyerForm.name}
                  onChange={(event) => updateBuyerForm({ name: event.target.value })}
                  placeholder="Ex.: CEASA - Centro de Abastecimento"
                  style={{ height: 46, borderRadius: 10 }}
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label fw-bold text-foreground">Documento</label>
                <input
                  className="form-control"
                  value={buyerForm.document}
                  onChange={(event) => updateBuyerForm({ document: event.target.value })}
                  placeholder="CPF/CNPJ"
                  style={{ height: 46, borderRadius: 10 }}
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label fw-bold text-foreground">Telefone</label>
                <input
                  className="form-control"
                  value={buyerForm.phone}
                  onChange={(event) => updateBuyerForm({ phone: event.target.value })}
                  placeholder="(00) 00000-0000"
                  style={{ height: 46, borderRadius: 10 }}
                />
              </div>

              <div className="col-12">
                <label className="form-label fw-bold text-foreground">Observações</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={buyerForm.notes}
                  onChange={(event) => updateBuyerForm({ notes: event.target.value })}
                  style={{ borderRadius: 10, resize: "none" }}
                />
              </div>

              <div className="col-12 d-flex justify-content-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary px-4"
                  onClick={() => setShowBuyerForm(false)}
                  style={{ borderRadius: 10, fontWeight: 700 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-success px-4"
                  disabled={savingBuyer || !buyerForm.name.trim()}
                  style={{ borderRadius: 10, fontWeight: 800 }}
                >
                  {savingBuyer ? "Cadastrando..." : "Cadastrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function HarvestTypeCard({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="w-100 text-start p-3 border bg-white"
      onClick={onClick}
      style={{
        minHeight: 82,
        borderRadius: 10,
        borderColor: selected ? "color-mix(in srgb, var(--primary), transparent 55%)" : "var(--border)",
        background: selected ? "color-mix(in srgb, var(--primary), transparent 95%)" : "white",
      }}
    >
      <div className="d-flex align-items-start gap-3">
        <span
          className="d-flex align-items-center justify-content-center flex-shrink-0"
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            marginTop: 2,
            border: `2px solid ${selected ? "var(--primary)" : "var(--border)"}`,
            background: selected ? "var(--primary)" : "white",
            color: "white",
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          {selected ? "✓" : ""}
        </span>
        <span>
          <span className="d-block fw-black text-foreground">{title}</span>
          <span className="d-block text-muted-foreground small">{description}</span>
        </span>
      </div>
    </button>
  );
}

function SummaryCard({
  icon,
  color,
  label,
  value,
  helper,
}: {
  icon: ReactNode;
  color: string;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="col-12 col-md-6 col-xl">
      <div className="bg-white border h-100 p-3 d-flex align-items-center gap-3" style={{ borderRadius: 10 }}>
        <div
          className="d-flex align-items-center justify-content-center flex-shrink-0"
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            color,
            background: `color-mix(in srgb, ${color}, transparent 88%)`,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="fw-bold text-foreground small mb-1">{label}</div>
          <div className="fw-black text-foreground" style={{ fontSize: "1.02rem" }}>
            {value}
          </div>
          <div className="text-muted-foreground small">{helper}</div>
        </div>
      </div>
    </div>
  );
}
