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
  Check
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

type OperationType = "calagem" | "aracao" | "gradagem" | "subsolagem" | "nivelamento" | "rocagem" | "outro";

type OperationDetails = Record<OperationType, {
  hoursWorked: string;
  hourlyRate: string;
}>;

const operationConfig: Record<OperationType, { label: string; icon: LucideIcon }> = {
  calagem: { label: "Calagem", icon: FileSpreadsheet },
  aracao: { label: "Aração", icon: Tractor },
  gradagem: { label: "Gradagem", icon: Grid },
  subsolagem: { label: "Subsolagem", icon: Layers },
  nivelamento: { label: "Nivelamento", icon: AlignJustify },
  rocagem: { label: "Roçagem", icon: Scissors },
  outro: { label: "Outro", icon: MoreHorizontal },
};

const createEmptyOperationDetails = (): OperationDetails => ({
  calagem: { hoursWorked: "", hourlyRate: "" },
  aracao: { hoursWorked: "", hourlyRate: "" },
  gradagem: { hoursWorked: "", hourlyRate: "" },
  subsolagem: { hoursWorked: "", hourlyRate: "" },
  nivelamento: { hoursWorked: "", hourlyRate: "" },
  rocagem: { hoursWorked: "", hourlyRate: "" },
  outro: { hoursWorked: "", hourlyRate: "" },
});

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

  // Submitting states
  const [saving, setSaving] = useState(false);

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
        const [platRes, membersRes] = await Promise.all([
          cropService.get(id),
          apiClient.get<Member[]>("/auth/members/").catch(() => ({ data: [] })),
        ]);
        
        setPlantation(platRes.data);
        setOperators(Array.isArray(membersRes.data) ? membersRes.data : []);
      } catch (err) {
        console.error("Erro ao carregar dados de preparação de terra", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

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
        hours_worked: selectedDetails.hoursWorked ? parseFloat(selectedDetails.hoursWorked) : null,
        hourly_rate: selectedDetails.hourlyRate ? parseFloat(selectedDetails.hourlyRate) : null,
        fuel_liters: null,
        fuel_price: null,
        operator: selectedOperator,
        notes: notes,
      };

      await apiClient.post("/crops/land-preparations/", payload);

      if (conclude) {
        router.push(`/home/plantacoes/${id}`);
      } else {
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
        </div>
      </div>
    </div>
  );
}
