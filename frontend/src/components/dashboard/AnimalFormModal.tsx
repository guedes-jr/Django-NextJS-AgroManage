"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Plus, Trash2, Tag, Calendar, Banknote, User, Activity, FileText, Warehouse } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AnimalFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "bovinos" | "suinos" | "aves";
  onSave: (data: any[]) => void;
  initialData?: {
    categoria?: string;
    sexo?: string;
  };
}

export function AnimalFormModal({ isOpen, onClose, type, onSave, initialData }: AnimalFormModalProps) {
  const [rows, setRows] = useState([
    { 
      id: Date.now(), 
      numero: "", 
      nome: "", 
      categoria: initialData?.categoria || "", 
      sexo: initialData?.sexo || (type === "bovinos" ? "Macho" : "Misto"), 
      origem: "Comprado", 
      raca: "", 
      nascimento: "", 
      dataCompra: "", 
      peso: "", 
      valor: "", 
      granjaOrigem: "" 
    }
  ]);

  // Update rows when modal opens with new initialData
  useEffect(() => {
    if (isOpen) {
      setRows([{ 
        id: Date.now(), 
        numero: "", 
        nome: "", 
        categoria: initialData?.categoria || "", 
        sexo: initialData?.sexo || (type === "bovinos" ? "Macho" : "Misto"), 
        origem: "Comprado", 
        raca: "", 
        nascimento: "", 
        dataCompra: "", 
        peso: "", 
        valor: "", 
        granjaOrigem: "" 
      }]);
    }
  }, [isOpen, initialData, type]);

  const addRow = () => {
    setRows([...rows, { 
      id: Date.now(), 
      numero: "", 
      nome: "", 
      categoria: initialData?.categoria || "", 
      sexo: initialData?.sexo || (type === "bovinos" ? "Macho" : "Misto"), 
      origem: "Comprado", 
      raca: "", 
      nascimento: "", 
      dataCompra: "", 
      peso: "", 
      valor: "", 
      granjaOrigem: "" 
    }]);
  };

  const removeRow = (id: number) => {
    if (rows.length > 1) {
      setRows(rows.filter((r) => r.id !== id));
    }
  };

  const updateRow = (id: number, field: string, value: string) => {
    setRows(rows.map((r) => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSubmit = () => {
    const payload = rows.map(r => ({ ...r, seguimento: type }));
    onSave(payload);
    onClose();
    setTimeout(() => {
      setRows([{ id: Date.now(), numero: "", nome: "", categoria: "", sexo: "", origem: "Comprado", raca: "", nascimento: "", dataCompra: "", peso: "", valor: "", granjaOrigem: "" }]);
    }, 300);
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cadastrar Animais"
      description="Preencha as características e adicione ao seu rebanho."
      maxWidth="max-w-6xl"
      footer={
        <>
          <div className="d-flex align-items-center gap-2 text-muted-foreground fw-semibold small">
            <span className="badge bg-primary/10 text-primary px-3 py-1 rounded-pill">{rows.length}</span>
            <span>registros.</span>
          </div>
          <div className="d-flex flex-column flex-md-row gap-2 w-100 w-md-auto">
            <Button variant="outline-secondary" onClick={onClose} className="px-4 border-border bg-background hover-bg-muted fw-semibold w-100 w-md-auto order-2 order-md-1">
              Cancelar
            </Button>
            <Button onClick={handleSubmit} className="px-5 fw-bold shadow-sm w-100 w-md-auto order-1 order-md-2" style={{ background: "var(--primary)", color: "white" }}>
              Salvar Registros
            </Button>
          </div>
        </>
      }
    >
      <div className="p-3 p-md-5" style={{ background: "var(--background)", minHeight: "50vh" }}>
        
        <div className="d-flex flex-column gap-5 mb-4">
          <AnimatePresence initial={false}>
            {rows.map((row, index) => (
              <motion.div 
                key={row.id} 
                initial={{ opacity: 0, height: 0, scale: 0.95 }}
                animate={{ opacity: 1, height: "auto", scale: 1 }}
                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="dashboard-card overflow-hidden shadow-sm position-relative p-3 p-md-4" 
                style={{ border: "1px solid var(--border)", borderRadius: "1rem", background: "var(--background)" }}
              >
                <div className="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom border-border">
                   <h5 className="fw-bold mb-0" style={{ color: "var(--foreground)", fontSize: "1.1rem" }}>
                     <span className="text-primary me-2">#{index + 1}</span> Registro
                   </h5>
                   <button 
                     className={`btn btn-sm d-flex align-items-center justify-content-center p-2 rounded transition-colors ${rows.length === 1 ? 'text-muted-foreground bg-muted cursor-not-allowed border-0' : 'text-danger bg-danger/10 hover-bg-danger hover-text-white border-0'}`}
                     onClick={() => removeRow(row.id)}
                     disabled={rows.length === 1}
                     title="Remover este registro"
                   >
                     <Trash2 size={16} />
                   </button>
                </div>

                <div className="row g-4">
                  {/* Linha 1 */}
                  <div className="col-12 col-md-3">
                     <div className="login-input-group mb-0">
                        <label className="login-label fw-bold">{getNumberLabel(row.categoria)} <span className="text-danger">*</span></label>
                        <div className="login-input-wrapper">
                          <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground" placeholder={getNumberPlaceholder(row.categoria)} value={row.numero} onChange={(e) => updateRow(row.id, "numero", e.target.value)} />
                          <Tag className="login-input-icon text-muted-foreground" size={16} />
                        </div>
                     </div>
                  </div>
                  <div className="col-12 col-md-3">
                     <div className="login-input-group mb-0">
                        <label className="login-label">Nome (Alternativo)</label>
                        <div className="login-input-wrapper">
                          <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground" placeholder="Identificação" value={row.nome} onChange={(e) => updateRow(row.id, "nome", e.target.value)} />
                          <FileText className="login-input-icon text-muted-foreground" size={16} />
                        </div>
                     </div>
                  </div>
                  {!initialData?.categoria && (
                    <div className="col-12 col-md-3">
                       <div className="login-input-group mb-0">
                          <label className="login-label fw-bold">Categoria <span className="text-danger">*</span></label>
                          <select className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }} value={row.categoria} onChange={(e) => updateRow(row.id, "categoria", e.target.value)}>
                            <option value="">Selecione...</option>
                            {currentConfig.categorias.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                       </div>
                    </div>
                  )}
                  {!initialData?.sexo && (
                    <div className="col-12 col-md-3">
                       <div className="login-input-group mb-0">
                          <label className="login-label fw-bold">Sexo <span className="text-danger">*</span></label>
                          <select className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }} value={row.sexo} onChange={(e) => updateRow(row.id, "sexo", e.target.value)}>
                            <option value="Macho">Macho</option>
                            <option value="Femea">Fêmea</option>
                            <option value="Misto">Misto</option>
                          </select>
                       </div>
                    </div>
                  )}

                  {/* Linha 2 */}
                  <div className="col-12 col-md-3">
                     <div className="login-input-group mb-0">
                        <label className="login-label fw-bold">Origem <span className="text-danger">*</span></label>
                        <select className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }} value={row.origem} onChange={(e) => updateRow(row.id, "origem", e.target.value)}>
                          <option value="Comprado">Comprado</option>
                          <option value="Nascido">Nascido</option>
                          <option value="Doado">Doado</option>
                        </select>
                     </div>
                  </div>
                  <div className="col-12 col-md-3">
                     <div className="login-input-group mb-0">
                        <label className="login-label">Linhagem/Raça</label>
                        <select className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }} value={row.raca} onChange={(e) => updateRow(row.id, "raca", e.target.value)}>
                          <option value="">Não informada</option>
                          {currentConfig.racas.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                     </div>
                  </div>
                  <div className="col-12 col-md-3">
                     <div className="login-input-group mb-0">
                        <label className="login-label">Nascimento / Eclosão</label>
                        <div className="login-input-wrapper">
                          <input type="date" className="login-input login-input-icon-left bg-transparent text-muted-foreground" value={row.nascimento} onChange={(e) => updateRow(row.id, "nascimento", e.target.value)} />
                          <Calendar className="login-input-icon text-muted-foreground" size={16} />
                        </div>
                     </div>
                  </div>
                  <div className="col-12 col-md-3">
                     <div className="login-input-group mb-0">
                        <label className="login-label">Data de Compra</label>
                        <div className="login-input-wrapper">
                          <input type="date" className={`login-input login-input-icon-left transition-colors ${row.origem !== 'Comprado' ? 'bg-muted opacity-50 cursor-not-allowed' : 'bg-transparent text-muted-foreground'}`} disabled={row.origem !== 'Comprado'} value={row.dataCompra} onChange={(e) => updateRow(row.id, "dataCompra", e.target.value)} />
                          <Calendar className={`login-input-icon ${row.origem !== 'Comprado' ? 'text-muted-foreground opacity-50' : 'text-muted-foreground'}`} size={16} />
                        </div>
                     </div>
                  </div>

                  {/* Linha 3 */}
                  <div className="col-12 col-md-3">
                     <div className="login-input-group mb-0">
                        <label className="login-label">Peso Médio (kg)</label>
                        <div className="login-input-wrapper">
                          <input type="number" step="0.1" className="login-input bg-transparent pe-5 text-foreground" style={{ paddingLeft: "1rem" }} placeholder="0.0" value={row.peso} onChange={(e) => updateRow(row.id, "peso", e.target.value)} />
                          <span className="position-absolute end-0 top-50 translate-middle-y pe-3 small text-muted-foreground fw-bold pe-none">kg</span>
                        </div>
                     </div>
                  </div>
                  <div className="col-12 col-md-3">
                     <div className="login-input-group mb-0">
                        <label className="login-label">Valor Unitário (R$)</label>
                        <div className="login-input-wrapper">
                          <input type="number" step="0.01" className={`login-input ps-5 transition-colors ${row.origem !== 'Comprado' ? 'bg-muted opacity-50 cursor-not-allowed' : 'bg-transparent text-foreground'}`} placeholder="0.00" disabled={row.origem !== 'Comprado'} value={row.valor} onChange={(e) => updateRow(row.id, "valor", e.target.value)} />
                          <span className="position-absolute start-0 top-50 translate-middle-y ps-3 small text-muted-foreground fw-bold pe-none">R$</span>
                        </div>
                     </div>
                  </div>
                  
                  <AnimatePresence>
                    {row.origem === 'Comprado' && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="col-12 col-md-6" style={{ overflow: 'hidden' }}>
                         <div className="login-input-group mb-0">
                            <label className="login-label text-primary fw-bold">Granja Origem (Fornecedor)</label>
                            <div className="login-input-wrapper">
                              <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground border-primary/30" placeholder="Nome da propriedade ou fornecedor..." value={row.granjaOrigem} onChange={(e) => updateRow(row.id, "granjaOrigem", e.target.value)} />
                              <Warehouse size={16} className="login-input-icon text-primary" />
                            </div>
                         </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <button 
          className="w-100 py-3 mt-2 rounded dashboard-card border-border d-flex align-items-center justify-content-center gap-2 hover-bg-muted transition-all text-primary fw-bold shadow-sm"
          onClick={addRow}
          style={{ borderStyle: "dashed" }}
        >
          <Plus size={18} /> Adicionar Novo Registro ao Lote
        </button>
        
      </div>
    </Modal>
  );
}
