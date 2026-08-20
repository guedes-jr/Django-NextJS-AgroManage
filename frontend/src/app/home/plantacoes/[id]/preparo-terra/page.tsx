"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Tractor, 
  Layers, 
  Grid, 
  FileSpreadsheet, 
  Scissors, 
  AlignJustify, 
  MoreHorizontal,
  Save, 
  Check,
  Sprout,
  Pencil,
  Trash2,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import apiClient from "@/services/api";
import { cropService } from "@/services/cropService";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

interface Plantation {
  id: string;
  name: string;
  crop_name: string;
  field_name: string;
  farm_name: string;
}

interface Member {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

type LandPreparationRecord = {
  id: string;
  date?: string | null;
  operation_type?: OperationType;
  operation_type_display?: string | null;
  operator?: string | null;
  hours_worked?: string | number | null;
  hourly_rate?: string | number | null;
  total_price?: string | number | null;
  notes?: string | null;
};

type OperationType = "calagem" | "aracao" | "gradagem" | "subsolagem" | "nivelamento" | "rocagem" | "plantio" | "outro";

type OperationDetails = Record<OperationType, {
  hoursWorked: string;
  hourlyRate: string;
}>;

const operationConfig: Record<OperationType, { label: string; icon: LucideIcon }> = {
  calagem: { label: "Calagem", icon: FileSpreadsheet },
  aracao: { label: "Colheita", icon: Tractor },
  gradagem: { label: "Gradagem", icon: Grid },
  subsolagem: { label: "Subsolagem", icon: Layers },
  nivelamento: { label: "Nivelamento", icon: AlignJustify },
  rocagem: { label: "Roçagem", icon: Scissors },
  plantio: { label: "Plantio", icon: Sprout },
  outro: { label: "Outro", icon: MoreHorizontal },
};

const createEmptyOperationDetails = (): OperationDetails => ({
  calagem: { hoursWorked: "", hourlyRate: "" },
  aracao: { hoursWorked: "", hourlyRate: "" },
  gradagem: { hoursWorked: "", hourlyRate: "" },
  subsolagem: { hoursWorked: "", hourlyRate: "" },
  nivelamento: { hoursWorked: "", hourlyRate: "" },
  rocagem: { hoursWorked: "", hourlyRate: "" },
  plantio: { hoursWorked: "", hourlyRate: "" },
  outro: { hoursWorked: "", hourlyRate: "" },
});

const extractArray = <T,>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
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

const numberText = (value?: string | number | null, decimals = 2) => {
  const parsed = numericValue(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : "-";
};

const money = (value?: string | number | null) =>
  numericValue(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

const normalizeOperationLabel = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return "-";
  const normalized = trimmed.toLowerCase();
  if (normalized === "aracao" || normalized === "aração") return "Colheita";
  return trimmed;
};

export default function PreparoTerraPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plantation, setPlantation] = useState<Plantation | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [selectedOperation, setSelectedOperation] = useState<OperationType>("aracao");
  const [operationDetails, setOperationDetails] = useState<OperationDetails>(() => createEmptyOperationDetails());
  const [selectedOperator, setSelectedOperator] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  
  // Data lists
  const [operators, setOperators] = useState<Member[]>([]);
  const [history, setHistory] = useState<LandPreparationRecord[]>([]);

  // Submitting states
  const [saving, setSaving] = useState(false);

  // Edit modal states
  const [editingRecord, setEditingRecord] = useState<LandPreparationRecord | null>(null);
  const [editForm, setEditForm] = useState<{
    date: string;
    operation_type: OperationType;
    operator: string;
    hours_worked: string;
    hourly_rate: string;
    notes: string;
  }>({
    date: "",
    operation_type: "aracao",
    operator: "",
    hours_worked: "",
    hourly_rate: "",
    notes: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectedDetails = operationDetails[selectedOperation];

  const updateSelectedOperationDetails = (patch: Partial<OperationDetails[OperationType]>) => {
    setOperationDetails((prev) => ({
      ...prev,
      [selectedOperation]: {
        ...prev[selectedOperation],
        ...patch,
      },
    }));
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const [platRes, membersRes, historyRes] = await Promise.all([
          cropService.get(id),
          apiClient.get<Member[]>("/auth/members/").catch(() => ({ data: [] })),
          cropService.listLandPreparations({ plantation: id }).catch(() => ({ data: { results: [] } })),
        ]);
        
        setPlantation(platRes.data);
        setOperators(Array.isArray(membersRes.data) ? membersRes.data : []);
        setHistory(extractArray<LandPreparationRecord>(historyRes.data));
      } catch (err) {
        console.error("Erro ao carregar dados de preparação de terra", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const openEditModal = (record: LandPreparationRecord) => {
    setEditingRecord(record);
    setEditForm({
      date: record.date ?? "",
      operation_type: record.operation_type ?? "aracao",
      operator: record.operator ?? "",
      hours_worked: record.hours_worked != null ? String(record.hours_worked) : "",
      hourly_rate: record.hourly_rate != null ? String(record.hourly_rate) : "",
      notes: record.notes ?? "",
    });
  };

  const closeEditModal = () => {
    setEditingRecord(null);
  };

  const handleEditSubmit = async () => {
    if (!editingRecord || editSaving) return;
    try {
      setEditSaving(true);
      const payload = {
        plantation: id,
        date: editForm.date || new Date().toISOString().split("T")[0],
        operation_type: editForm.operation_type,
        execution_type: "own",
        operator: editForm.operator,
        hours_worked: editForm.hours_worked ? numericValue(editForm.hours_worked) : null,
        hourly_rate: editForm.hourly_rate ? numericValue(editForm.hourly_rate) : null,
        notes: editForm.notes,
      };
      await apiClient.patch(`/crops/land-preparations/${editingRecord.id}/`, payload);
      const response = await cropService.listLandPreparations({ plantation: id });
      setHistory(extractArray<LandPreparationRecord>(response.data));
      closeEditModal();
    } catch (err) {
      console.error("Erro ao editar registro", err);
      alert("Erro ao editar o registro. Tente novamente.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (recordId: string) => {
    if (!confirm("Tem certeza que deseja remover este registro?")) return;
    try {
      setDeletingId(recordId);
      await apiClient.delete(`/crops/land-preparations/${recordId}/`);
      setHistory((prev) => prev.filter((r) => r.id !== recordId));
    } catch (err) {
      console.error("Erro ao remover registro", err);
      alert("Erro ao remover o registro. Tente novamente.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (conclude: boolean) => {
    if (saving) return;

    try {
      setSaving(true);
      const payload = {
        plantation: id,
        date: new Date().toISOString().split("T")[0], // default to today
        operation_type: selectedOperation,
        execution_type: "own",
        tractor: null,
        hours_worked: selectedDetails.hoursWorked ? numericValue(selectedDetails.hoursWorked) : null,
        hourly_rate: selectedDetails.hourlyRate ? numericValue(selectedDetails.hourlyRate) : null,
        fuel_liters: null,
        fuel_price: null,
        operator: selectedOperator,
        notes: notes,
      };

      await apiClient.post("/crops/land-preparations/", payload);

      if (conclude) {
        router.push(`/home/plantacoes/${id}`);
      } else {
        const response = await cropService.listLandPreparations({ plantation: id });
        setHistory(extractArray<LandPreparationRecord>(response.data));
        alert("Lançamento salvo com sucesso!");
        setOperationDetails((prev) => ({
          ...prev,
          [selectedOperation]: { hoursWorked: "", hourlyRate: "" },
        }));
        setNotes("");
      }
    } catch (err) {
      console.error("Erro ao salvar preparação de terra", err);
      alert("Erro ao salvar o lançamento. Verifique se os dados estão corretos.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <Skeleton height="50px" width="300px" className="mb-4" />
        <Skeleton height="200px" className="mb-4" />
        <Skeleton height="400px" />
      </div>
    );
  }

  if (!plantation) {
    return <div className="p-4 text-muted">Plantação não encontrada.</div>;
  }

  return (
    <div className="position-relative overflow-hidden" style={{ minHeight: "100vh" }}>
      {/* Main Layout Grid */}
      <div className="row g-4">
        <div className="col-12 transition-all">
          
          {/* Breadcrumb */}
          <div className="mb-3 d-flex align-items-center gap-2 text-muted small fw-medium">
            <span style={{ cursor: "pointer" }} onClick={() => router.push(`/home/plantacoes/${id}`)} className="hover-text-primary">
              {plantation.name || plantation.crop_name}
            </span>
            <span>›</span>
            <span>{plantation.field_name || "Talhão"}</span>
            <span>›</span>
            <span className="text-primary fw-semibold">Serviços Mecanizados</span>
          </div>

          {/* Page Header */}
          <div className="d-flex align-items-center gap-3 mb-4">

            <div>
              <h1 className="fw-black mb-1 text-foreground d-flex align-items-center gap-2" style={{ fontSize: "1.75rem" }}>
                <Tractor size={28} className="text-primary" /> Serviços Mecanizados
              </h1>
              <p className="text-muted-foreground small mb-0">Registre as informações dos serviços mecanizados realizados no talhão.</p>
            </div>
          </div>

          {/* Form Content */}
          <div className="dashboard-card p-4 mb-4">
            {/* Tipo de Operação Selection */}
            <div className="mb-4">
              <label className="form-label fw-bold text-foreground mb-3 d-flex align-items-center gap-2">
                <span className="bg-primary/10 text-primary rounded-circle d-flex align-items-center justify-content-center" style={{ width: 22, height: 22, fontSize: '0.75rem' }}>1</span>
                Tipo de operação
              </label>
              
              <div className="d-flex flex-wrap gap-2">
                {(Object.keys(operationConfig) as OperationType[]).map((type) => {
                  const item = operationConfig[type];
                  const Icon = item.icon;
                  const isSelected = selectedOperation === type;

                  return (
                    <button
                      key={type}
                      type="button"
                      className={`btn d-flex align-items-center gap-2 py-2 px-3 transition-all ${
                        isSelected 
                          ? "btn-primary border-primary" 
                          : "btn-outline-secondary border-muted text-muted-foreground"
                      }`}
                      style={{
                        borderRadius: 12,
                        border: "1px solid",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        backgroundColor: isSelected ? "var(--primary-light)" : "white",
                        color: isSelected ? "var(--primary)" : "",
                        boxShadow: isSelected ? "0 4px 12px rgba(16, 185, 129, 0.15)" : "none",
                      }}
                      onClick={() => setSelectedOperation(type)}
                    >
                      <Icon size={16} className={isSelected ? "text-primary" : "text-muted"} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="row g-4">
              <div className="col-md-6 col-12">
                {/* Operador */}
                <div className="mb-4">
                  <label className="form-label fw-bold text-foreground mb-2">Operador</label>
                  <input
                    className="form-control"
                    list="preparo-operadores"
                    placeholder="Selecione ou digite o nome do operador"
                    style={{ borderRadius: 10, height: 44 }}
                    value={selectedOperator}
                    onChange={(e) => setSelectedOperator(e.target.value)}
                  />
                  <datalist id="preparo-operadores">
                    {operators.map((op) => (
                      <option key={op.id} value={op.full_name || op.email} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="col-md-6 col-12">
                {/* Observações */}
                <div className="mb-4">
                  <label className="form-label fw-bold text-foreground mb-2">Observações</label>
                  <div className="position-relative">
                    <textarea
                      className="form-control"
                      rows={4}
                      maxLength={500}
                      style={{ borderRadius: 10, resize: "none" }}
                      placeholder="Ex.: Condições do solo, umidade, observações gerais..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <div 
                      className="position-absolute text-muted-foreground small" 
                      style={{ bottom: 8, right: 12, fontSize: "0.72rem" }}
                    >
                      {notes.length}/500
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pricing Section */}
            <div className="row g-4 mt-1 border-top pt-4">
              {/* Horas trabalhadas */}
              <div className="col-12">
                <div 
                  className="p-3 rounded-xl h-100" 
                  style={{ 
                    backgroundColor: "rgba(var(--primary-rgb), 0.02)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <h6 className="fw-bold mb-3 d-flex align-items-center gap-2 text-foreground" style={{ fontSize: "0.9rem" }}>
                    Horas trabalhadas
                  </h6>
                  
                  <div className="row g-3">
                    <div className="col-md-6 col-12">
                      <label className="form-label text-muted-foreground small mb-1">Horas trabalhadas</label>
                      <div className="input-group">
                        <input
                          type="number"
                          step="0.1"
                          className="form-control"
                          placeholder="Ex.: 8,5"
                          value={selectedDetails.hoursWorked}
                          onChange={(e) => updateSelectedOperationDetails({ hoursWorked: e.target.value })}
                          style={{ borderRight: "none", borderRadius: "10px 0 0 10px", height: 40 }}
                        />
                        <span className="input-group-text bg-white text-muted-foreground small" style={{ borderLeft: "none", borderRadius: "0 10px 10px 0", fontSize: '0.78rem' }}>
                          horas
                        </span>
                      </div>
                    </div>
                    
                    <div className="col-md-6 col-12">
                      <label className="form-label text-muted-foreground small mb-1">Valor por hora (R$)</label>
                      <div className="input-group">
                        <span className="input-group-text bg-white text-muted-foreground small" style={{ borderRight: "none", borderRadius: "10px 0 0 10px", fontSize: '0.78rem' }}>
                          Ex.:
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control"
                          placeholder="180,00"
                          value={selectedDetails.hourlyRate}
                          onChange={(e) => updateSelectedOperationDetails({ hourlyRate: e.target.value })}
                          style={{ borderLeft: "none", borderRadius: "0 10px 10px 0", height: 40 }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="d-flex justify-content-between align-items-center mt-4 pt-3 border-top gap-3 flex-wrap">
              <Button 
                variant="outline-secondary" 
                onClick={() => router.back()}
                style={{ borderRadius: 10 }}
              >
                Cancelar
              </Button>
              <div className="d-flex gap-2">
                <Button 
                  variant="outline-primary" 
                  disabled={saving}
                  onClick={() => handleSubmit(false)}
                  style={{ borderRadius: 10 }}
                >
                  <Save size={16} className="me-1.5" />
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
                <Button 
                  onClick={() => handleSubmit(true)}
                  disabled={saving}
                  style={{ borderRadius: 10 }}
                >
                  <Check size={16} className="me-1.5" />
                  {saving ? "Salvando..." : "Salvar e concluir"}
                </Button>
              </div>
            </div>
          </div>

          <div className="dashboard-card p-4 mb-4">
            <h2 className="fw-black text-foreground mb-3" style={{ fontSize: "1.05rem" }}>
              Histórico de serviços mecanizados
            </h2>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0 agro-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Operação</th>
                    <th>Operador</th>
                    <th>Horas</th>
                    <th>Valor/hora</th>
                    <th>Total</th>
                    <th>Observações</th>
                    <th className="text-center" style={{ width: 100 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-muted-foreground py-4">
                        Nenhum serviço mecanizado registrado ainda.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {history.map((record) => (
                        <tr key={record.id}>
                          <td>{formatDate(record.date)}</td>
                          <td>{normalizeOperationLabel(record.operation_type_display || (record.operation_type ? operationConfig[record.operation_type]?.label : "-"))}</td>
                          <td>{record.operator || "-"}</td>
                          <td>{numberText(record.hours_worked)} h</td>
                          <td>{money(record.hourly_rate)}</td>
                          <td className="fw-bold">{money(record.total_price)}</td>
                          <td className="text-muted-foreground small">{record.notes || "-"}</td>
                          <td className="text-center">
                            <div className="d-flex gap-1 justify-content-center">
                              <button
                                type="button"
                                title="Editar registro"
                                className="btn btn-sm d-flex align-items-center justify-content-center"
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  border: "1px solid var(--bs-primary)",
                                  color: "var(--bs-primary)",
                                  backgroundColor: "transparent",
                                  padding: 0,
                                }}
                                onClick={() => openEditModal(record)}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                title="Remover registro"
                                className="btn btn-sm d-flex align-items-center justify-content-center"
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  border: "1px solid var(--bs-danger)",
                                  color: "var(--bs-danger)",
                                  backgroundColor: "transparent",
                                  padding: 0,
                                  opacity: deletingId === record.id ? 0.5 : 1,
                                }}
                                disabled={deletingId === record.id}
                                onClick={() => handleDelete(record.id)}
                              >
                                {deletingId === record.id ? (
                                  <span className="spinner-border spinner-border-sm" style={{ width: 12, height: 12 }} />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr className="table-light">
                        <td colSpan={5} className="text-end fw-bold">Total Geral:</td>
                        <td className="fw-black text-primary" style={{ fontSize: "1.05rem" }}>
                          {money(history.reduce((acc, record) => acc + numericValue(record.total_price), 0))}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingRecord && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1050, backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeEditModal(); }}
        >
          <div
            className="bg-white rounded-4 shadow-lg p-4"
            style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}
          >
            {/* Modal Header */}
            <div className="d-flex align-items-center justify-content-between mb-4">
              <h5 className="fw-black mb-0 d-flex align-items-center gap-2" style={{ fontSize: "1.1rem" }}>
                <Pencil size={18} className="text-primary" />
                Editar Serviço Mecanizado
              </h5>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center"
                style={{ width: 32, height: 32, borderRadius: 8, padding: 0 }}
                onClick={closeEditModal}
              >
                <X size={16} />
              </button>
            </div>

            {/* Data */}
            <div className="mb-3">
              <label className="form-label fw-semibold small text-foreground mb-1">Data</label>
              <input
                type="date"
                className="form-control"
                style={{ borderRadius: 10, height: 40 }}
                value={editForm.date}
                onChange={(e) => setEditForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>

            {/* Tipo de Operação */}
            <div className="mb-3">
              <label className="form-label fw-semibold small text-foreground mb-2">Tipo de Operação</label>
              <div className="d-flex flex-wrap gap-2">
                {(Object.keys(operationConfig) as OperationType[]).map((type) => {
                  const item = operationConfig[type];
                  const Icon = item.icon;
                  const isSelected = editForm.operation_type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      className={`btn btn-sm d-flex align-items-center gap-1 ${
                        isSelected ? "btn-primary" : "btn-outline-secondary"
                      }`}
                      style={{ borderRadius: 8, fontWeight: 600, fontSize: "0.8rem" }}
                      onClick={() => setEditForm((p) => ({ ...p, operation_type: type }))}
                    >
                      <Icon size={13} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Operador */}
            <div className="mb-3">
              <label className="form-label fw-semibold small text-foreground mb-1">Operador</label>
              <input
                className="form-control"
                list="edit-operadores"
                placeholder="Nome do operador"
                style={{ borderRadius: 10, height: 40 }}
                value={editForm.operator}
                onChange={(e) => setEditForm((p) => ({ ...p, operator: e.target.value }))}
              />
              <datalist id="edit-operadores">
                {operators.map((op) => (
                  <option key={op.id} value={op.full_name || op.email} />
                ))}
              </datalist>
            </div>

            {/* Horas e Valor/hora */}
            <div className="row g-3 mb-3">
              <div className="col-6">
                <label className="form-label fw-semibold small text-foreground mb-1">Horas trabalhadas</label>
                <div className="input-group">
                  <input
                    type="number"
                    step="0.1"
                    className="form-control"
                    placeholder="Ex.: 8"
                    style={{ borderRadius: "10px 0 0 10px", height: 40 }}
                    value={editForm.hours_worked}
                    onChange={(e) => setEditForm((p) => ({ ...p, hours_worked: e.target.value }))}
                  />
                  <span className="input-group-text small" style={{ borderRadius: "0 10px 10px 0", fontSize: "0.75rem" }}>h</span>
                </div>
              </div>
              <div className="col-6">
                <label className="form-label fw-semibold small text-foreground mb-1">Valor por hora (R$)</label>
                <div className="input-group">
                  <span className="input-group-text small" style={{ borderRadius: "10px 0 0 10px", fontSize: "0.75rem" }}>R$</span>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    placeholder="180,00"
                    style={{ borderRadius: "0 10px 10px 0", height: 40 }}
                    value={editForm.hourly_rate}
                    onChange={(e) => setEditForm((p) => ({ ...p, hourly_rate: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Observações */}
            <div className="mb-4">
              <label className="form-label fw-semibold small text-foreground mb-1">Observações</label>
              <textarea
                className="form-control"
                rows={3}
                maxLength={500}
                style={{ borderRadius: 10, resize: "none" }}
                placeholder="Observações gerais..."
                value={editForm.notes}
                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>

            {/* Modal Footer */}
            <div className="d-flex gap-2 justify-content-end">
              <button
                type="button"
                className="btn btn-outline-secondary"
                style={{ borderRadius: 10 }}
                onClick={closeEditModal}
                disabled={editSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary d-flex align-items-center gap-2"
                style={{ borderRadius: 10 }}
                onClick={handleEditSubmit}
                disabled={editSaving}
              >
                {editSaving ? (
                  <><span className="spinner-border spinner-border-sm" style={{ width: 14, height: 14 }} /> Salvando...</>
                ) : (
                  <><Save size={14} /> Salvar alterações</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
