"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Plus, Trash2, Tag, Calendar, Banknote, User, Activity, FileText, Warehouse, GitBranch, ChevronDown } from "lucide-react";
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
  const { showToast } = useToast();
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
      granjaOrigem: "",
      quantidade: "1",
      // Filiação
      sireName: "",
      damName: "",
    }
  ]);
  // Track which rows have filiation expanded
  const [showFiliation, setShowFiliation] = useState<Record<number, boolean>>({});

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
        granjaOrigem: "",
        quantidade: "1",
        sireName: "",
        damName: "",
      }]);
      setShowFiliation({});
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
      granjaOrigem: "",
      quantidade: "1",
      sireName: "",
      damName: "",
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
    // Validate required fields
    const errors: string[] = [];
    
    rows.forEach((row, index) => {
      if (!row.numero || !row.numero.trim()) {
        errors.push(`Registro #${index + 1}: ${getNumberLabel(row.categoria)} é obrigatório`);
      }
      if (!row.categoria || !row.categoria.trim()) {
        errors.push(`Registro #${index + 1}: Categoria é obrigatória`);
      }
      if (!row.sexo || !row.sexo.trim()) {
        errors.push(`Registro #${index + 1}: Sexo é obrigatório`);
      }
      if (!row.origem || !row.origem.trim()) {
        errors.push(`Registro #${index + 1}: Origem é obrigatória`);
      }
      if (!row.dataCompra && !row.nascimento) {
        errors.push(`Registro #${index + 1}: Data de compra ou nascimento é obrigatória`);
      }
    });

    if (errors.length > 0) {
      showToast(`Preencha os campos obrigatórios:\n${errors.join('\n')}`, "warning", 15000);
      return;
    }

    const payload = rows.map(r => ({ ...r, seguimento: type }));
    onSave(payload);
    onClose();
    setTimeout(() => {
      setRows([{ id: Date.now(), numero: "", nome: "", categoria: "", sexo: "", origem: "Comprado", raca: "", nascimento: "", dataCompra: "", peso: "", valor: "", granjaOrigem: "", quantidade: "1", sireName: "", damName: "" }]);
      setShowFiliation({});
    }, 300);
  };

  const typeConfig = {
    bovinos: {
      categorias: ["Bezerro", "Garrote", "Novilha", "Touro", "Matriz", "Vaca"],
      racas: ["Nelore", "Angus", "Brahman", "Hereford", "Senepol", "Brangus", "Girolando", "Holandês", "Mestiço"],
    },
    suinos: {
      categorias: ["Leitão", "Terminação", "Marrã", "Matriz", "Cachaço"],
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
                style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--background)" }}
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
                        <label className="login-label fw-bold">Qtd. de Animais <span className="text-danger">*</span></label>
                        <div className="login-input-wrapper">
                          <input type="number" min="1" className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }} placeholder="1" value={row.quantidade} onChange={(e) => updateRow(row.id, "quantidade", e.target.value)} />
                        </div>
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
                        <label className="login-label">Nome (Alternativo)</label>
                        <div className="login-input-wrapper">
                          <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground" placeholder="Identificação" value={row.nome} onChange={(e) => updateRow(row.id, "nome", e.target.value)} />
                          <FileText className="login-input-icon text-muted-foreground" size={16} />
                        </div>
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

                  {/* — Filiação (colapsável) — */}
                  <div className="col-12">
                    <button
                      type="button"
                      onClick={() => setShowFiliation(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                      className="d-flex align-items-center gap-2 btn btn-sm border-0 px-0 fw-semibold"
                      style={{
                        color: showFiliation[row.id] ? 'var(--primary)' : 'var(--muted-foreground)',
                        background: 'transparent',
                        fontSize: '0.82rem',
                        transition: 'color 0.2s',
                      }}
                    >
                      <GitBranch size={14} />
                      {showFiliation[row.id] ? 'Ocultar Filiação' : '+ Adicionar Filiação (Pai / Mãe)'}
                      <ChevronDown
                        size={14}
                        style={{
                          transform: showFiliation[row.id] ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.25s',
                        }}
                      />
                    </button>

                    <AnimatePresence initial={false}>
                      {showFiliation[row.id] && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div
                            className="mt-3 p-3 rounded-3"
                            style={{
                              background: 'color-mix(in srgb, var(--primary), transparent 94%)',
                              border: '1px dashed color-mix(in srgb, var(--primary), transparent 60%)',
                            }}
                          >
                            <p className="small fw-semibold mb-3 d-flex align-items-center gap-2" style={{ color: 'var(--primary)' }}>
                              <GitBranch size={13} /> Filiação do Animal
                              <span className="fw-normal text-muted-foreground ms-1">(opcional)</span>
                            </p>
                            <div className="row g-3">
                              <div className="col-12 col-md-6">
                                <div className="login-input-group mb-0">
                                  <label className="login-label">Pai (Reprodutor)</label>
                                  <div className="login-input-wrapper">
                                    <input
                                      type="text"
                                      className="login-input login-input-icon-left bg-transparent text-foreground"
                                      placeholder="Brinco ou registro do pai..."
                                      value={row.sireName}
                                      onChange={(e) => updateRow(row.id, "sireName", e.target.value)}
                                    />
                                    <User size={14} className="login-input-icon text-muted-foreground" />
                                  </div>
                                  <span className="small text-muted-foreground mt-1 d-block">Se o reprodutor estiver cadastrado, o vínculo será feito automaticamente pelo brinco.</span>
                                </div>
                              </div>
                              <div className="col-12 col-md-6">
                                <div className="login-input-group mb-0">
                                  <label className="login-label">Mãe</label>
                                  <div className="login-input-wrapper">
                                    <input
                                      type="text"
                                      className="login-input login-input-icon-left bg-transparent text-foreground"
                                      placeholder="Brinco ou registro da mãe..."
                                      value={row.damName}
                                      onChange={(e) => updateRow(row.id, "damName", e.target.value)}
                                    />
                                    <User size={14} className="login-input-icon text-muted-foreground" />
                                  </div>
                                  <span className="small text-muted-foreground mt-1 d-block">Se a matriz estiver cadastrada, o vínculo será feito automaticamente pelo brinco.</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
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
