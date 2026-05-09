"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Tag, Calendar, Banknote, FileText, Warehouse } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface EditAnimalModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "bovinos" | "suinos" | "aves";
  onSave: (id: number, data: any) => void;
  animal: any | null;
}

export function EditAnimalModal({ isOpen, onClose, type, onSave, animal }: EditAnimalModalProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (isOpen && animal) {
      setFormData({
        numero: animal.batch_code || "",
        nome: animal.name || "",
        categoria: animal.category || "",
        sexo: animal.gender || "",
        origem: animal.origin === 'purchased' ? 'Comprado' : animal.origin === 'born' ? 'Nascido' : 'Doado',
        raca: animal.breed_name || "",
        nascimento: animal.entry_date || "",
        dataCompra: animal.entry_date || "",
        peso: animal.avg_weight_kg || "",
        valor: animal.purchase_value || "",
        quantidade: animal.quantity?.toString() || "1",
      });
    }
  }, [isOpen, animal]);

  const updateField = (field: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!formData.numero || !formData.numero.trim()) {
      showToast("O número de identificação é obrigatório", "warning");
      return;
    }
    if (!formData.categoria || !formData.categoria.trim()) {
      showToast("A categoria é obrigatória", "warning");
      return;
    }

    const payload = {
      batch_code: formData.numero,
      quantity: parseInt(formData.quantidade, 10) || 1,
      name: formData.nome || "",
      category: formData.categoria,
      gender: formData.sexo,
      origin: formData.origem === "Comprado" ? "purchased" : formData.origem === "Nascido" ? "born" : "donated",
      purchase_value: parseFloat(formData.valor) || null,
      avg_weight_kg: parseFloat(formData.peso) || null,
      entry_date: formData.dataCompra || formData.nascimento || new Date().toISOString().split('T')[0],
      species_code_input: type,
      breed_name_input: formData.raca
    };

    onSave(animal.id, payload);
  };

  const typeConfig = {
    bovinos: {
      categorias: ["Bezerro", "Garrote", "Novilha", "Touro", "Matriz"],
      racas: ["Nelore", "Angus", "Brahman", "Hereford", "Senepol", "Brangus", "Girolando", "Holandês", "Mestiço"],
    },
    suinos: {
      categorias: ["Leitão", "Terminação", "Matriz", "Cachaço"],
      racas: ["Large White", "Landrace", "Duroc", "Pietrain", "Moura", "Wessex"],
    },
    aves: {
      categorias: ["Pinto", "Frango de Corte", "Poedeira", "Matriz"],
      racas: ["Cobb 500", "Ross 308", "Hubbard", "Hy-Line", "Lohmann", "Embrapa 051"],
    }
  };

  const currentConfig = typeConfig[type] || typeConfig.bovinos;

  const getNumberPlaceholder = (cat?: string) => {
    if (type === "bovinos") return "Ex: 001";
    if (type === "suinos") {
      if (cat === "Matriz" || cat === "Cachaço") return "Ex: BR-123";
      return "Ex: 14-A";
    }
    return "Ex: G1";
  }
  const getNumberLabel = (cat?: string) => {
    if (type === "bovinos") return "Brinco (Nº)";
    if (type === "suinos") {
      if (cat === "Matriz" || cat === "Cachaço") return "Brinco (Nº)";
      return "Lote (Nº)";
    }
    return "Galpão (Nº)";
  }

  if (!animal) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Editar Registro"
      description="Atualize as informações do lote ou animal."
      maxWidth="max-w-4xl"
      footer={
        <>
          <div className="d-flex flex-column flex-md-row gap-2 w-100 justify-content-end">
            <Button variant="outline-secondary" onClick={onClose} className="px-4 border-border bg-background hover-bg-muted fw-semibold w-100 w-md-auto order-2 order-md-1">
              Cancelar
            </Button>
            <Button onClick={handleSubmit} className="px-5 fw-bold shadow-sm w-100 w-md-auto order-1 order-md-2" style={{ background: "var(--primary)", color: "white" }}>
              Salvar Alterações
            </Button>
          </div>
        </>
      }
    >
      <div className="p-3 p-md-5" style={{ background: "var(--background)" }}>
        <div className="dashboard-card overflow-hidden shadow-sm position-relative p-3 p-md-4" style={{ border: "1px solid var(--border)", borderRadius: "1rem", background: "var(--background)" }}>
          <div className="row g-4">
            {/* Linha 1 */}
            <div className="col-12 col-md-3">
               <div className="login-input-group mb-0">
                  <label className="login-label fw-bold">{getNumberLabel(formData.categoria)} <span className="text-danger">*</span></label>
                  <div className="login-input-wrapper">
                    <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground" placeholder={getNumberPlaceholder(formData.categoria)} value={formData.numero || ""} onChange={(e) => updateField("numero", e.target.value)} />
                    <Tag className="login-input-icon text-muted-foreground" size={16} />
                  </div>
               </div>
            </div>
            <div className="col-12 col-md-3">
               <div className="login-input-group mb-0">
                  <label className="login-label fw-bold">Qtd. de Animais <span className="text-danger">*</span></label>
                  <div className="login-input-wrapper">
                    <input type="number" min="1" className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }} placeholder="1" value={formData.quantidade || ""} onChange={(e) => updateField("quantidade", e.target.value)} />
                  </div>
               </div>
            </div>
            <div className="col-12 col-md-3">
               <div className="login-input-group mb-0">
                  <label className="login-label">Linhagem/Raça</label>
                  <select className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }} value={formData.raca || ""} onChange={(e) => updateField("raca", e.target.value)}>
                    <option value="">Não informada</option>
                    {currentConfig.racas.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
               </div>
            </div>
            <div className="col-12 col-md-3">
               <div className="login-input-group mb-0">
                  <label className="login-label fw-bold">Categoria <span className="text-danger">*</span></label>
                  <select className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }} value={formData.categoria || ""} onChange={(e) => updateField("categoria", e.target.value)}>
                    <option value="">Selecione...</option>
                    {currentConfig.categorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
               </div>
            </div>

            {/* Linha 2 */}
            <div className="col-12 col-md-3">
               <div className="login-input-group mb-0">
                  <label className="login-label fw-bold">Sexo <span className="text-danger">*</span></label>
                  <select className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }} value={formData.sexo || ""} onChange={(e) => updateField("sexo", e.target.value)}>
                    <option value="Macho">Macho</option>
                    <option value="Femea">Fêmea</option>
                    <option value="Misto">Misto</option>
                  </select>
               </div>
            </div>
            <div className="col-12 col-md-3">
               <div className="login-input-group mb-0">
                  <label className="login-label fw-bold">Origem <span className="text-danger">*</span></label>
                  <select className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }} value={formData.origem || "Comprado"} onChange={(e) => updateField("origem", e.target.value)}>
                    <option value="Comprado">Comprado</option>
                    <option value="Nascido">Nascido</option>
                    <option value="Doado">Doado</option>
                  </select>
               </div>
            </div>
            <div className="col-12 col-md-3">
               <div className="login-input-group mb-0">
                  <label className="login-label">Nome (Alternativo)</label>
                  <div className="login-input-wrapper">
                    <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground" placeholder="Identificação" value={formData.nome || ""} onChange={(e) => updateField("nome", e.target.value)} />
                    <FileText className="login-input-icon text-muted-foreground" size={16} />
                  </div>
               </div>
            </div>
            <div className="col-12 col-md-3">
               <div className="login-input-group mb-0">
                  <label className="login-label">Nascimento / Eclosão</label>
                  <div className="login-input-wrapper">
                    <input type="date" className="login-input login-input-icon-left bg-transparent text-muted-foreground" value={formData.nascimento || ""} onChange={(e) => updateField("nascimento", e.target.value)} />
                    <Calendar className="login-input-icon text-muted-foreground" size={16} />
                  </div>
               </div>
            </div>

            {/* Linha 3 */}
            <div className="col-12 col-md-3">
               <div className="login-input-group mb-0">
                  <label className="login-label">Data de Compra</label>
                  <div className="login-input-wrapper">
                    <input type="date" className={`login-input login-input-icon-left transition-colors ${formData.origem !== 'Comprado' ? 'bg-muted opacity-50 cursor-not-allowed' : 'bg-transparent text-muted-foreground'}`} disabled={formData.origem !== 'Comprado'} value={formData.dataCompra || ""} onChange={(e) => updateField("dataCompra", e.target.value)} />
                    <Calendar className={`login-input-icon ${formData.origem !== 'Comprado' ? 'text-muted-foreground opacity-50' : 'text-muted-foreground'}`} size={16} />
                  </div>
               </div>
            </div>
            <div className="col-12 col-md-3">
               <div className="login-input-group mb-0">
                  <label className="login-label">Peso Médio (kg)</label>
                  <div className="login-input-wrapper">
                    <input type="number" step="0.1" className="login-input bg-transparent pe-5 text-foreground" style={{ paddingLeft: "1rem" }} placeholder="0.0" value={formData.peso || ""} onChange={(e) => updateField("peso", e.target.value)} />
                    <span className="position-absolute end-0 top-50 translate-middle-y pe-3 small text-muted-foreground fw-bold pe-none">kg</span>
                  </div>
               </div>
            </div>
            <div className="col-12 col-md-3">
               <div className="login-input-group mb-0">
                  <label className="login-label">Valor Unitário (R$)</label>
                  <div className="login-input-wrapper">
                    <input type="number" step="0.01" className={`login-input ps-5 transition-colors ${formData.origem !== 'Comprado' ? 'bg-muted opacity-50 cursor-not-allowed' : 'bg-transparent text-foreground'}`} placeholder="0.00" disabled={formData.origem !== 'Comprado'} value={formData.valor || ""} onChange={(e) => updateField("valor", e.target.value)} />
                    <span className="position-absolute start-0 top-50 translate-middle-y ps-3 small text-muted-foreground fw-bold pe-none">R$</span>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
