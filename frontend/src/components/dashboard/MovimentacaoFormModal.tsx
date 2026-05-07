"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingCart, TrendingDown, Utensils, AlertTriangle, Save, Calendar, Package, Info, Plus, ChevronDown, List, CreditCard, User } from "lucide-react";
import { apiClient } from "@/services/api";

export type InventoryCategory = "racao" | "nucleo" | "medicamento" | "vacina" | "material" | "suplemento" | "outro";

interface InventoryItem {
  id: string;
  nome: string;
  categoria: string;
  categoria_display: string;
  unidade_medida: string;
}

interface Lote {
  id: string;
  numero_lote: string;
  quantidade_atual: string;
  data_validade: string;
}

interface Supplier {
  id: string;
  nome: string;
}

interface MovimentacaoFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoria?: string;
  produtos: InventoryItem[];
  initialData?: any;
}

const CATEGORY_LABELS: Record<string, string> = {
  racao: "Ração / Grãos",
  nucleo: "Núcleo / Premix",
  medicamento: "Medicamento",
  vacina: "Vacina",
  material: "Material",
};

const inputStyle = {
  height: '44px',
  padding: '0 1rem',
  border: '1.5px solid var(--border)',
  borderRadius: '16px',
  backgroundColor: 'transparent',
  width: '100%',
  fontSize: '0.875rem',
} as const;

const labelStyle = "form-label small fw-bold text-muted-foreground mb-1 d-block";

export function MovimentacaoFormModalWithHeader({ 
  isOpen, 
  onClose, 
  categoria, 
  produtos = [],
  initialData 
}: MovimentacaoFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [tipo, setTipo] = useState<string>("compra");
  const [itemId, setItemId] = useState<string>("");
  const [loteId, setLoteId] = useState<string>("");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState("");

  // Batch fields (for purchase)
  const [numeroLote, setNumeroLote] = useState("");
  const [dataValidade, setDataValidade] = useState("");
  const [custoUnitario, setCustoUnitario] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [notaFiscal, setNotaFiscal] = useState("");
  const [localArmazenamento, setLocalArmazenamento] = useState("deposito");

  // Options
  const [availableLotes, setAvailableLotes] = useState<Lote[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setDirection(initialData.tipo === "compra" || initialData.tipo === "entrada" || initialData.tipo === "ajuste" ? "in" : "out");
        setTipo(initialData.tipo);
        setItemId(initialData.item?.id || initialData.item || "");
        setLoteId(initialData.lote?.id || initialData.lote || "");
        setQuantidade(initialData.quantidade);
        setObservacao(initialData.observacao || "");
        
        // Batch fields (if available)
        if (initialData.lote) {
          setNumeroLote(initialData.lote.numero_lote || "");
          setDataValidade(initialData.lote.data_validade || "");
          setCustoUnitario(initialData.lote.custo_unitario || "");
          setFornecedorId(initialData.lote.fornecedor || "");
          setNotaFiscal(initialData.lote.nota_fiscal || "");
        }
      } else {
        setDirection("in");
        setTipo("compra");
        setItemId("");
        setLoteId("");
        setQuantidade("");
        setObservacao("");
        setNumeroLote("");
        setDataValidade("");
        setCustoUnitario("");
        setFornecedorId("");
        setNotaFiscal("");
      }
      setError("");
      fetchSuppliers();
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    if (itemId) {
      fetchLotes(itemId);
    } else {
      setAvailableLotes([]);
    }
  }, [itemId]);

  useEffect(() => {
    if (direction === "in" && !initialData) {
      setTipo("compra");
    } else if (direction === "out" && !initialData) {
      setTipo("consumo");
    }
  }, [direction, initialData]);

  const fetchSuppliers = async () => {
    try {
      const { data } = await apiClient.get("/inventory/fornecedores/");
      setSuppliers(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      console.error("Erro ao buscar fornecedores:", err);
    }
  };

  const fetchLotes = async (id: string) => {
    try {
      const { data } = await apiClient.get("/inventory/lotes/", { params: { item: id } });
      setAvailableLotes(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      console.error("Erro ao buscar lotes:", err);
    }
  };

  const filteredProdutos = categoria 
    ? produtos.filter(p => p.categoria === categoria)
    : produtos;

  const produtoSelecionado = produtos.find(p => p.id === itemId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!itemId) {
      setError("Selecione um produto");
      return;
    }
    if (!quantidade || parseFloat(quantidade) <= 0) {
      setError("Informe uma quantidade válida");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload: any = {
        item: itemId,
        tipo,
        quantidade: parseFloat(quantidade),
        observacao,
      };

      if (loteId) payload.lote = loteId;
      
      if (tipo === "compra") {
        if (numeroLote) payload.numero_lote = numeroLote;
        if (dataValidade) payload.data_validade = dataValidade;
        if (custoUnitario) payload.custo_unitario = parseFloat(custoUnitario);
        if (fornecedorId) payload.fornecedor = fornecedorId;
        if (notaFiscal) payload.nota_fiscal = notaFiscal;
        if (localArmazenamento) payload.local_armazenamento = localArmazenamento;
      }

      if (initialData) {
        await apiClient.patch(`/inventory/movimentacoes/${initialData.id}/`, payload);
      } else {
        await apiClient.post("/inventory/movimentacoes/", payload);
      }
      onClose();
    } catch (err: any) {
      const errorData = err.response?.data;
      let errorMessage = "Erro ao salvar movimentação";
      
      if (typeof errorData === 'string') {
        errorMessage = errorData;
      } else if (errorData?.error) {
        const nestedError = errorData.error;
        if (nestedError.detail && typeof nestedError.detail === 'object') {
          const firstKey = Object.keys(nestedError.detail)[0];
          const fieldError = nestedError.detail[firstKey];
          errorMessage = Array.isArray(fieldError) ? fieldError[0] : (typeof fieldError === 'string' ? fieldError : nestedError.message);
        } else {
          errorMessage = nestedError.message || nestedError.detail || errorMessage;
        }
      } else if (errorData?.detail) {
        errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="modal-root">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-backdrop"
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(4px)", zIndex: 1040 
          }}
          onClick={onClose}
        />
        <div 
          className="modal-container"
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050,
            pointerEvents: 'none', padding: '1rem'
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="modal-content"
            style={{ 
              maxWidth: "600px", width: "100%", pointerEvents: 'auto',
              background: "var(--background)", borderRadius: "1.25rem",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              overflow: "hidden", display: "flex", flexDirection: "column",
              maxHeight: "90vh", border: "1px solid var(--border)"
            }}
          >
            {/* Header */}
            <div className="p-4 border-bottom border-border d-flex justify-content-between align-items-center" style={{ background: "var(--muted)/50" }}>
              <div>
                <h2 className="fw-bold mb-0" style={{ fontSize: "1.25rem" }}>Registrar Movimentação</h2>
                <p className="text-muted-foreground small mb-0">Entrada ou saída de itens do estoque</p>
              </div>
              <button onClick={onClose} className="btn p-2 hover-bg-border rounded-circle">
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="overflow-auto flex-grow-1 p-4">
              
              {/* Type Switcher - Fully Rounded Pill Design */}
              <div className="mb-4">
                <div 
                  className="d-flex p-1 position-relative" 
                  style={{ 
                    background: "var(--muted)", 
                    height: "48px",
                    border: "1px solid var(--border)",
                    borderRadius: "99px"
                  }}
                >
                  {/* Sliding Background Indicator */}
                  <motion.div
                    className="position-absolute shadow-sm"
                    initial={false}
                    animate={{
                      x: direction === "in" ? 0 : "100%",
                      backgroundColor: direction === "in" ? "oklch(0.65 0.14 145)" : "oklch(0.65 0.14 15)",
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    style={{
                      top: "4px",
                      left: "4px",
                      width: "calc(50% - 4px)",
                      height: "calc(100% - 8px)",
                      zIndex: 1,
                      borderRadius: "99px"
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => setDirection("in")}
                    className="flex-grow-1 border-0 d-flex align-items-center justify-content-center gap-2 transition-all"
                    style={{ 
                      zIndex: 2, 
                      background: "transparent",
                      color: direction === "in" ? "white" : "var(--muted-foreground)",
                      fontWeight: "700",
                      fontSize: "0.9rem"
                    }}
                  >
                    <Plus size={16} />
                    Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection("out")}
                    className="flex-grow-1 border-0 d-flex align-items-center justify-content-center gap-2 transition-all"
                    style={{ 
                      zIndex: 2, 
                      background: "transparent",
                      color: direction === "out" ? "white" : "var(--muted-foreground)",
                      fontWeight: "700",
                      fontSize: "0.9rem"
                    }}
                  >
                    <TrendingDown size={16} />
                    Saída
                  </button>
                </div>
              </div>

              {/* Sub-type Selection - Fully Rounded Pill Design */}
              <div className="mb-4">
                <label className={labelStyle}>Tipo Específico</label>
                <div className="row g-2">
                  {direction === "in" ? (
                    <>
                      <div className="col-6">
                        <button 
                          type="button" 
                          onClick={() => setTipo("compra")} 
                          className={`w-100 p-3 border text-start transition-all ${tipo === "compra" ? "border-emerald-500 bg-emerald-50" : "border-border hover:border-muted-foreground"}`}
                          style={{ 
                            borderRadius: "99px",
                            borderColor: tipo === "compra" ? "oklch(0.65 0.14 145)" : "", 
                            backgroundColor: tipo === "compra" ? "oklch(0.65 0.14 145 / 0.1)" : "" 
                          }}
                        >
                          <div className="d-flex align-items-center gap-2">
                            <ShoppingCart size={16} style={{ color: tipo === "compra" ? "oklch(0.65 0.14 145)" : "var(--muted-foreground)" }} />
                            <span className="fw-bold small" style={{ color: tipo === "compra" ? "oklch(0.65 0.14 145)" : "var(--foreground)" }}>Compra</span>
                          </div>
                        </button>
                      </div>
                      <div className="col-6">
                        <button 
                          type="button" 
                          onClick={() => setTipo("entrada")} 
                          className={`w-100 p-3 border text-start transition-all ${tipo === "entrada" ? "border-emerald-500 bg-emerald-50" : "border-border hover:border-muted-foreground"}`}
                          style={{ 
                            borderRadius: "99px",
                            borderColor: tipo === "entrada" ? "oklch(0.65 0.14 145)" : "", 
                            backgroundColor: tipo === "entrada" ? "oklch(0.65 0.14 145 / 0.1)" : "" 
                          }}
                        >
                          <div className="d-flex align-items-center gap-2">
                            <Plus size={16} style={{ color: tipo === "entrada" ? "oklch(0.65 0.14 145)" : "var(--muted-foreground)" }} />
                            <span className="fw-bold small" style={{ color: tipo === "entrada" ? "oklch(0.65 0.14 145)" : "var(--foreground)" }}>Ajuste</span>
                          </div>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="col-4">
                        <button 
                          type="button" 
                          onClick={() => setTipo("consumo")} 
                          className={`w-100 p-2 p-md-3 border text-start transition-all ${tipo === "consumo" ? "border-rose-500 bg-rose-50" : "border-border hover:border-muted-foreground"}`}
                          style={{ 
                            borderRadius: "99px",
                            borderColor: tipo === "consumo" ? "oklch(0.65 0.14 15)" : "", 
                            backgroundColor: tipo === "consumo" ? "oklch(0.65 0.14 15 / 0.1)" : "" 
                          }}
                        >
                          <div className="d-flex align-items-center gap-1 gap-md-2">
                            <Utensils size={14} style={{ color: tipo === "consumo" ? "oklch(0.65 0.14 15)" : "var(--muted-foreground)" }} />
                            <span className="fw-bold small" style={{ color: tipo === "consumo" ? "oklch(0.65 0.14 15)" : "var(--foreground)", fontSize: "0.75rem" }}>Consumo</span>
                          </div>
                        </button>
                      </div>
                      <div className="col-4">
                        <button 
                          type="button" 
                          onClick={() => setTipo("venda")} 
                          className={`w-100 p-2 p-md-3 border text-start transition-all ${tipo === "venda" ? "border-rose-500 bg-rose-50" : "border-border hover:border-muted-foreground"}`}
                          style={{ 
                            borderRadius: "99px",
                            borderColor: tipo === "venda" ? "oklch(0.65 0.14 15)" : "", 
                            backgroundColor: tipo === "venda" ? "oklch(0.65 0.14 15 / 0.1)" : "" 
                          }}
                        >
                          <div className="d-flex align-items-center gap-1 gap-md-2">
                            <TrendingDown size={14} style={{ color: tipo === "venda" ? "oklch(0.65 0.14 15)" : "var(--muted-foreground)" }} />
                            <span className="fw-bold small" style={{ color: tipo === "venda" ? "oklch(0.65 0.14 15)" : "var(--foreground)", fontSize: "0.75rem" }}>Venda</span>
                          </div>
                        </button>
                      </div>
                      <div className="col-4">
                        <button 
                          type="button" 
                          onClick={() => setTipo("perda")} 
                          className={`w-100 p-2 p-md-3 border text-start transition-all ${tipo === "perda" ? "border-rose-500 bg-rose-50" : "border-border hover:border-muted-foreground"}`}
                          style={{ 
                            borderRadius: "99px",
                            borderColor: tipo === "perda" ? "oklch(0.65 0.14 15)" : "", 
                            backgroundColor: tipo === "perda" ? "oklch(0.65 0.14 15 / 0.1)" : "" 
                          }}
                        >
                          <div className="d-flex align-items-center gap-1 gap-md-2">
                            <AlertTriangle size={14} style={{ color: tipo === "perda" ? "oklch(0.65 0.14 15)" : "var(--muted-foreground)" }} />
                            <span className="fw-bold small" style={{ color: tipo === "perda" ? "oklch(0.65 0.14 15)" : "var(--foreground)", fontSize: "0.75rem" }}>Perda</span>
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Animated Content Wrapper */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={direction}
                  initial={{ opacity: 0, x: direction === "in" ? -10 : 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction === "in" ? 10 : -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  {/* Product Selection */}
                  <div className="mb-3">
                    <label className={labelStyle}>Produto</label>
                    <div className="position-relative">
                      <select 
                        style={inputStyle}
                        value={itemId}
                        onChange={(e) => setItemId(e.target.value)}
                        required
                      >
                        <option value="">Selecione o produto...</option>
                        {filteredProdutos.map(p => (
                          <option key={p.id} value={p.id}>{p.nome} ({p.categoria_display})</option>
                        ))}
                      </select>
                      <Package size={16} className="position-absolute text-muted-foreground" style={{ right: '12px', top: '14px', pointerEvents: 'none' }} />
                    </div>
                  </div>

                  <div className="row g-3 mb-3">
                    <div className="col-6">
                      <label className={labelStyle}>Quantidade {produtoSelecionado && `(${produtoSelecionado.unidade_medida})`}</label>
                      <input
                        type="number"
                        style={inputStyle}
                        placeholder="0.00"
                        value={quantidade}
                        onChange={(e) => setQuantidade(e.target.value)}
                        step="0.01"
                        required
                      />
                    </div>
                    <div className="col-6">
                      {direction === "out" ? (
                        <>
                          <label className={labelStyle}>Lote (Opcional)</label>
                          <select style={inputStyle} value={loteId} onChange={(e) => setLoteId(e.target.value)}>
                            <option value="">Padrão (FIFO)</option>
                            {availableLotes.map(l => (
                              <option key={l.id} value={l.id}>{l.numero_lote || "Sem nº"} - Saldo: {l.quantidade_atual}</option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <>
                          <label className={labelStyle}>Nº do Lote</label>
                          <input type="text" style={inputStyle} placeholder="Ex: LOT-001" value={numeroLote} onChange={e => setNumeroLote(e.target.value)} />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Purchase Specific Fields */}
                  {tipo === "compra" && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-3 rounded-2xl bg-muted/30 border border-border mb-3">
                      <h4 className="fw-bold small mb-3 d-flex align-items-center gap-2">
                        <CreditCard size={14} style={{ color: "oklch(0.65 0.14 145)" }} />
                        Dados da Compra
                      </h4>
                      <div className="row g-3">
                        <div className="col-6">
                          <label className={labelStyle}>Custo Unitário (R$)</label>
                          <input type="number" style={inputStyle} placeholder="0.00" value={custoUnitario} onChange={e => setCustoUnitario(e.target.value)} step="0.01" />
                        </div>
                        <div className="col-6">
                          <label className={labelStyle}>Data Validade</label>
                          <input type="date" style={inputStyle} value={dataValidade} onChange={e => setDataValidade(e.target.value)} />
                        </div>
                        <div className="col-12">
                          <label className={labelStyle}>Fornecedor</label>
                          <select style={inputStyle} value={fornecedorId} onChange={e => setFornecedorId(e.target.value)}>
                            <option value="">Selecione...</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                          </select>
                        </div>
                        <div className="col-12">
                          <label className={labelStyle}>Nota Fiscal</label>
                          <input type="text" style={inputStyle} placeholder="Nº da NF-e" value={notaFiscal} onChange={e => setNotaFiscal(e.target.value)} />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Observation */}
              <div className="mb-0">
                <label className={labelStyle}>Observação / Motivo</label>
                <textarea
                  style={{ ...inputStyle, height: '80px', padding: '0.75rem 1rem', resize: 'none' }}
                  placeholder="Descreva o motivo desta movimentação..."
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </div>

              {error && (
                <div className="mt-4 p-3 rounded-2xl d-flex align-items-start gap-3" style={{ background: "oklch(0.6 0.15 25 / 0.1)", color: "oklch(0.6 0.15 25)" }}>
                  <AlertTriangle size={18} className="mt-1 flex-shrink-0" />
                  <span className="small fw-medium">{error}</span>
                </div>
              )}
            </form>

            {/* Footer */}
            <div className="p-4 border-top border-border d-flex justify-content-end gap-2 bg-muted/20">
              <button type="button" onClick={onClose} className="btn px-4 py-2 border-0 fw-bold text-muted-foreground hover-bg-border rounded-2xl">
                Cancelar
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={loading}
                className="btn px-4 py-2 rounded-2xl fw-bold d-flex align-items-center gap-2 transition-all"
                style={{ 
                  background: direction === "in" ? "oklch(0.65 0.14 145)" : "oklch(0.65 0.14 15)", 
                  color: 'white', 
                  border: 'none', 
                  boxShadow: direction === "in" ? '0 4px 12px oklch(0.65 0.14 145 / 0.3)' : '0 4px 12px oklch(0.65 0.14 15 / 0.3)' 
                }}
              >
                {loading ? (
                  <div className="spinner-border spinner-border-sm" role="status" />
                ) : (
                  <>
                    <Save size={18} />
                    Confirmar Registro
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}