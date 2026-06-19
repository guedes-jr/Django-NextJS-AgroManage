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
  Plus, 
  Save, 
  Check, 
  Info,
  X
} from "lucide-react";
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

interface TractorItem {
  id: string;
  name: string;
  brand: string;
  model: string;
  power_cv?: number;
  plate?: string;
}

interface Member {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

type OperationType = "calagem" | "aracao" | "gradagem" | "subsolagem" | "nivelamento" | "rocagem" | "outro";

const operationConfig: Record<OperationType, { label: string; icon: any }> = {
  calagem: { label: "Calagem", icon: FileSpreadsheet },
  aracao: { label: "Aração", icon: Tractor },
  gradagem: { label: "Gradagem", icon: Grid },
  subsolagem: { label: "Subsolagem", icon: Layers },
  nivelamento: { label: "Nivelamento", icon: AlignJustify },
  rocagem: { label: "Roçagem", icon: Scissors },
  outro: { label: "Outro", icon: MoreHorizontal },
};

export default function PreparoTerraPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plantation, setPlantation] = useState<Plantation | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [selectedOperation, setSelectedOperation] = useState<OperationType>("aracao");
  const [selectedTractor, setSelectedTractor] = useState<string>("");
  const [executionType, setExecutionType] = useState<"own" | "rented">("own");
  const [hoursWorked, setHoursWorked] = useState<string>("");
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [fuelLiters, setFuelLiters] = useState<string>("");
  const [fuelPrice, setFuelPrice] = useState<string>("");
  const [selectedOperator, setSelectedOperator] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  
  // Data lists
  const [tractors, setTractors] = useState<TractorItem[]>([]);
  const [operators, setOperators] = useState<Member[]>([]);

  // Drawer / Submitting states
  const [showDrawer, setShowDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Drawer form states
  const [drawerForm, setDrawerForm] = useState({
    name: "",
    brand: "",
    model: "",
    power_cv: "",
    plate: "",
  });
  const [savingTractor, setSavingTractor] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const [platRes, tractorRes, membersRes] = await Promise.all([
          cropService.get(id),
          apiClient.get<TractorItem[]>("/crops/tractors/").catch(() => ({ data: [] })),
          apiClient.get<Member[]>("/auth/members/").catch(() => ({ data: [] })),
        ]);
        
        setPlantation(platRes.data);
        setTractors(Array.isArray(tractorRes.data) ? tractorRes.data : []);
        setOperators(Array.isArray(membersRes.data) ? membersRes.data : []);
      } catch (err) {
        console.error("Erro ao carregar dados de preparação de terra", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSaveTractor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerForm.name.trim()) return;

    try {
      setSavingTractor(true);
      const payload = {
        name: drawerForm.name,
        brand: drawerForm.brand,
        model: drawerForm.model,
        power_cv: drawerForm.power_cv ? parseInt(drawerForm.power_cv) : null,
        plate: drawerForm.plate,
      };

      const res = await apiClient.post<TractorItem>("/crops/tractors/", payload);
      const newTractor = res.data;
      
      // Update list and select the newly created tractor
      setTractors(prev => [...prev, newTractor]);
      setSelectedTractor(newTractor.id);
      
      // Clear drawer form and close
      setDrawerForm({
        name: "",
        brand: "",
        model: "",
        power_cv: "",
        plate: "",
      });
      setShowDrawer(false);
    } catch (err) {
      console.error("Erro ao cadastrar trator", err);
      alert("Não foi possível cadastrar o trator.");
    } finally {
      setSavingTractor(false);
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
        execution_type: executionType,
        tractor: selectedTractor || null,
        hours_worked: executionType === "own" && hoursWorked ? parseFloat(hoursWorked) : null,
        hourly_rate: executionType === "own" && hourlyRate ? parseFloat(hourlyRate) : null,
        fuel_liters: executionType === "own" && fuelLiters ? parseFloat(fuelLiters) : null,
        fuel_price: executionType === "own" && fuelPrice ? parseFloat(fuelPrice) : null,
        operator: selectedOperator,
        notes: notes,
      };

      await apiClient.post("/crops/land-preparations/", payload);

      if (conclude) {
        router.push(`/home/plantacoes/${id}`);
      } else {
        alert("Lançamento salvo com sucesso!");
        // Reset some form values
        setHoursWorked("");
        setFuelLiters("");
        setNotes("");
      }
    } catch (err) {
      console.error("Erro ao salvar preparação de terra", err);
      alert("Erro ao salvar o lançamento. Verifique se os dados estão corretos.");
    } finally {
      setSaving(false);
    }
  };

  const fuelCost = 
    parseFloat(fuelLiters || "0") * parseFloat(fuelPrice || "0");

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
        <div className={showDrawer ? "col-lg-8 col-12 transition-all" : "col-12 transition-all"}>
          
          {/* Breadcrumb */}
          <div className="mb-3 d-flex align-items-center gap-2 text-muted small fw-medium">
            <span style={{ cursor: "pointer" }} onClick={() => router.push(`/home/plantacoes/${id}`)} className="hover-text-primary">
              {plantation.name || plantation.crop_name}
            </span>
            <span>›</span>
            <span>{plantation.field_name || "Talhão"}</span>
            <span>›</span>
            <span className="text-primary fw-semibold">Preparação da Terra</span>
          </div>

          {/* Page Header */}
          <div className="d-flex align-items-center gap-3 mb-4">
            <button 
              className="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center" 
              onClick={() => router.back()} 
              style={{ width: 38, height: 38, borderRadius: 10 }}
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="fw-black mb-1 text-foreground d-flex align-items-center gap-2" style={{ fontSize: "1.75rem" }}>
                <Tractor size={28} className="text-primary" /> Preparação da Terra
              </h1>
              <p className="text-muted-foreground small mb-0">Registre as informações da operação realizada no talhão.</p>
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
              {/* Left Column: Equipment & Execution */}
              <div className="col-md-6 col-12">
                {/* Equipamento Utilizado */}
                <div className="mb-4">
                  <label className="form-label fw-bold text-foreground mb-2">Equipamento utilizado</label>
                  <div className="d-flex gap-2">
                    <select
                      className="form-select"
                      style={{ borderRadius: 10, height: 44 }}
                      value={selectedTractor}
                      onChange={(e) => setSelectedTractor(e.target.value)}
                    >
                      <option value="">Selecione o equipamento</option>
                      {tractors.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.brand ? `(${t.brand})` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowDrawer(true)}
                      className="btn btn-outline-primary d-flex align-items-center justify-content-center"
                      style={{ width: 44, height: 44, borderRadius: 10, borderStyle: "dashed" }}
                      title="Cadastrar novo trator"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>

                {/* Forma de execução */}
                <div className="mb-4">
                  <label className="form-label fw-bold text-foreground mb-2">Forma de execução</label>
                  <div className="d-flex gap-4 align-items-center pt-1">
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="executionType"
                        id="execOwn"
                        value="own"
                        checked={executionType === "own"}
                        onChange={() => setExecutionType("own")}
                      />
                      <label className="form-check-label fw-medium text-foreground cursor-pointer" htmlFor="execOwn">
                        Equipamento próprio
                      </label>
                    </div>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="executionType"
                        id="execRented"
                        value="rented"
                        checked={executionType === "rented"}
                        onChange={() => setExecutionType("rented")}
                      />
                      <label className="form-check-label fw-medium text-foreground cursor-pointer" htmlFor="execRented">
                        Terceirizado
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Operator & Observações */}
              <div className="col-md-6 col-12">
                {/* Operador */}
                <div className="mb-4">
                  <label className="form-label fw-bold text-foreground mb-2">Operador</label>
                  <select
                    className="form-select"
                    style={{ borderRadius: 10, height: 44 }}
                    value={selectedOperator}
                    onChange={(e) => setSelectedOperator(e.target.value)}
                  >
                    <option value="">Selecione o operador</option>
                    {operators.map((op) => (
                      <option key={op.id} value={op.full_name || op.email}>
                        {op.full_name || op.email}
                      </option>
                    ))}
                  </select>
                </div>

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

            {/* Pricing Section (Conditionally styled/disabled for own equipment) */}
            <div className="row g-4 mt-1 border-top pt-4">
              {/* Horas trabalhadas */}
              <div className="col-md-6 col-12">
                <div 
                  className="p-3 rounded-xl h-100" 
                  style={{ 
                    backgroundColor: executionType === "own" ? "rgba(var(--primary-rgb), 0.02)" : "rgba(0, 0, 0, 0.02)",
                    border: "1px solid var(--border)",
                    opacity: executionType === "own" ? 1 : 0.6
                  }}
                >
                  <h6 className="fw-bold mb-3 d-flex align-items-center gap-2 text-foreground" style={{ fontSize: "0.9rem" }}>
                    Horas trabalhadas <span className="text-muted small fw-normal">(quando for equip. próprio)</span>
                  </h6>
                  
                  <div className="row g-3">
                    <div className="col-6">
                      <label className="form-label text-muted-foreground small mb-1">Horas trabalhadas</label>
                      <div className="input-group">
                        <input
                          type="number"
                          step="0.1"
                          className="form-control"
                          placeholder="Ex.: 8,5"
                          disabled={executionType !== "own"}
                          value={hoursWorked}
                          onChange={(e) => setHoursWorked(e.target.value)}
                          style={{ borderRight: "none", borderRadius: "10px 0 0 10px", height: 40 }}
                        />
                        <span className="input-group-text bg-white text-muted-foreground small" style={{ borderLeft: "none", borderRadius: "0 10px 10px 0", fontSize: '0.78rem' }}>
                          horas
                        </span>
                      </div>
                    </div>
                    
                    <div className="col-6">
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
                          disabled={executionType !== "own"}
                          value={hourlyRate}
                          onChange={(e) => setHourlyRate(e.target.value)}
                          style={{ borderLeft: "none", borderRadius: "0 10px 10px 0", height: 40 }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 d-flex gap-2 p-2 rounded-lg bg-info/5 text-info border border-info/20 align-items-start" style={{ fontSize: "0.74rem" }}>
                    <Info size={14} className="mt-0.5 flex-shrink-0" />
                    <span>Preencha apenas se o equipamento for próprio. Para serviço terceirizado, deixe em branco.</span>
                  </div>
                </div>
              </div>

              {/* Consumo de combustível */}
              <div className="col-md-6 col-12">
                <div 
                  className="p-3 rounded-xl h-100"
                  style={{ 
                    backgroundColor: executionType === "own" ? "rgba(var(--primary-rgb), 0.02)" : "rgba(0, 0, 0, 0.02)",
                    border: "1px solid var(--border)",
                    opacity: executionType === "own" ? 1 : 0.6
                  }}
                >
                  <h6 className="fw-bold mb-3 text-foreground" style={{ fontSize: "0.9rem" }}>
                    Consumo de combustível
                  </h6>

                  <div className="row g-3 mb-3">
                    <div className="col-6">
                      <label className="form-label text-muted-foreground small mb-1">Litros consumidos</label>
                      <div className="input-group">
                        <input
                          type="number"
                          step="0.1"
                          className="form-control"
                          placeholder="Ex.: 35"
                          disabled={executionType !== "own"}
                          value={fuelLiters}
                          onChange={(e) => setFuelLiters(e.target.value)}
                          style={{ borderRight: "none", borderRadius: "10px 0 0 10px", height: 40 }}
                        />
                        <span className="input-group-text bg-white text-muted-foreground small" style={{ borderLeft: "none", borderRadius: "0 10px 10px 0", fontSize: '0.78rem' }}>
                          L
                        </span>
                      </div>
                    </div>

                    <div className="col-6">
                      <label className="form-label text-muted-foreground small mb-1">Preço do diesel (R$)</label>
                      <div className="input-group">
                        <span className="input-group-text bg-white text-muted-foreground small" style={{ borderRight: "none", borderRadius: "10px 0 0 10px", fontSize: '0.78rem' }}>
                          Ex.:
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control"
                          placeholder="6,20"
                          disabled={executionType !== "own"}
                          value={fuelPrice}
                          onChange={(e) => setFuelPrice(e.target.value)}
                          style={{ borderLeft: "none", borderRadius: "0 10px 10px 0", height: 40 }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Fuel cost result card */}
                  <div 
                    className="p-2.5 rounded-lg d-flex justify-content-between align-items-center border"
                    style={{ 
                      backgroundColor: "rgba(16, 185, 129, 0.03)", 
                      borderColor: "rgba(16, 185, 129, 0.15)"
                    }}
                  >
                    <span className="fw-semibold text-primary" style={{ fontSize: "0.82rem" }}>
                      Custo com combustível
                    </span>
                    <span className="fw-black text-primary" style={{ fontSize: "1rem" }}>
                      R$ {fuelCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-muted-foreground d-block mt-2" style={{ fontSize: "0.68rem" }}>
                    * O custo será calculado automaticamente.
                  </span>
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
        </div>

        {/* Right Drawer: Cadastrar Trator */}
        {showDrawer && (
          <div className="col-lg-4 col-12">
            <div 
              className="dashboard-card p-4 border border-primary/20 sticky-top"
              style={{ 
                borderRadius: 16, 
                boxShadow: "0 12px 32px rgba(0,0,0,0.06)", 
                top: 24,
                zIndex: 10
              }}
            >
              {/* Drawer Header */}
              <div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2">
                <h5 className="fw-bold text-foreground mb-0 d-flex align-items-center gap-2">
                  <Tractor size={20} className="text-primary" /> Cadastrar trator
                </h5>
                <button
                  type="button"
                  className="btn btn-link p-1 text-muted-foreground hover-text-foreground transition-colors"
                  onClick={() => setShowDrawer(false)}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Drawer Form */}
              <form onSubmit={handleSaveTractor} className="row g-3">
                <div className="col-12">
                  <label className="form-label small fw-medium text-foreground">Nome do trator *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="Ex.: John Deere 5078E"
                    value={drawerForm.name}
                    onChange={(e) => setDrawerForm({ ...drawerForm, name: e.target.value })}
                    style={{ borderRadius: 10, height: 40 }}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label small fw-medium text-foreground">Marca</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ex.: John Deere"
                    value={drawerForm.brand}
                    onChange={(e) => setDrawerForm({ ...drawerForm, brand: e.target.value })}
                    style={{ borderRadius: 10, height: 40 }}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label small fw-medium text-foreground">Modelo</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ex.: 5078E"
                    value={drawerForm.model}
                    onChange={(e) => setDrawerForm({ ...drawerForm, model: e.target.value })}
                    style={{ borderRadius: 10, height: 40 }}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label small fw-medium text-foreground">Potência (cv)</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="Ex.: 78"
                    value={drawerForm.power_cv}
                    onChange={(e) => setDrawerForm({ ...drawerForm, power_cv: e.target.value })}
                    style={{ borderRadius: 10, height: 40 }}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label small fw-medium text-foreground">Placa / Identificação</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ex.: ABC-1234"
                    value={drawerForm.plate}
                    onChange={(e) => setDrawerForm({ ...drawerForm, plate: e.target.value })}
                    style={{ borderRadius: 10, height: 40 }}
                  />
                </div>

                {/* Drawer Actions */}
                <div className="col-12 d-flex gap-2 mt-4 border-top pt-3">
                  <Button
                    type="button"
                    variant="outline-secondary"
                    className="flex-grow-1"
                    onClick={() => setShowDrawer(false)}
                    style={{ borderRadius: 10 }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-grow-1"
                    disabled={savingTractor}
                    style={{ borderRadius: 10 }}
                  >
                    {savingTractor ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
