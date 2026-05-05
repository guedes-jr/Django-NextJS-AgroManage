"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, Save, Calendar, Package, AlertTriangle, 
  ArrowDownRight, CreditCard, ShoppingCart, 
  Utensils, Trash2, Plus
} from "lucide-react";
import { apiClient } from "@/services/api";

interface InventoryItem {
  id: string;
  nome: string;
  categoria: string;
  unidade_medida: string;
  unidade_display: string;
}

interface Lote {
  id: string;
  numero_lote: string;
  quantidade_atual: string;
  data_validade: string;
}

interface Fornecedor {
  id: string;
  nome: string;
  razao_social: string;
}

interface QuickMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: InventoryItem;
  type: "in" | "out";
}

const inputStyle = {
  height: '48px',
  padding: '0 1rem',
  border: '1.5px solid #e2e8f0',
  borderRadius: '12px',
  backgroundColor: '#f8fafc',
  width: '100%',
  fontSize: '0.95rem',
  fontWeight: '500',
  transition: 'all 0.2s ease',
} as const;

const labelStyle = "form-label small fw-bold text-dark mb-1 d-block";

export function QuickMovementModal({ isOpen, onClose, item: initialItem, type: initialType }: QuickMovementModalProps) {
  const [loading, setLoading] = useState(false);
  const [mainType, setMainType] = useState<"in" | "out">(initialType);
  const [subType, setSubType] = useState<string>("");
  
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState("");

  // Product Selection
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(initialItem || null);
  const [productSearch, setProductSearch] = useState("");
  const [suggestions, setSuggestions] = useState<InventoryItem[]>([]);
  const [searching, setSearching] = useState(false);

  // Options
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loteId, setLoteId] = useState<string>("");
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);

  // Entrance fields
  const [numeroLote, setNumeroLote] = useState("");
  const [dataValidade, setDataValidade] = useState("");
  const [custoUnitario, setCustoUnitario] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");

  useEffect(() => {
    if (isOpen) {
      setMainType(initialType);
      setSelectedItem(initialItem || null);
      setProductSearch("");
      setSuggestions([]);
      setError("");
      setQuantidade("");
      setObservacao("");
      setNumeroLote("");
      setDataValidade("");
      setCustoUnitario("");
      setFornecedorId("");
      setSubType(initialType === "in" ? "compra" : "consumo");
      
      fetchFornecedores();
    }
  }, [isOpen, initialItem, initialType]);

  useEffect(() => {
    if (isOpen && selectedItem && mainType === "out") {
      fetchLotes(selectedItem.id);
    }
  }, [isOpen, selectedItem, mainType]);

  const fetchFornecedores = async () => {
    try {
      const { data } = await apiClient.get("/inventory/fornecedores/");
      setFornecedores(data.results || data);
    } catch (err) {
      console.error("Erro fornecedores:", err);
    }
  };

  const fetchLotes = async (itemId: string) => {
    try {
      const { data } = await apiClient.get(`/inventory/items/${itemId}/lots/`);
      setLotes(data);
      if (data.length > 0) setLoteId(data[0].id);
      else setLoteId("");
    } catch (err) {
      console.error("Erro lotes:", err);
    }
  };

  const handleProductSearch = async (query: string) => {
    setProductSearch(query);
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await apiClient.get("/inventory/items/all_items/", {
        params: { search: query }
      });
      setSuggestions(data || []);
    } catch (err) {
      console.error("Erro busca:", err);
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) { setError("Selecione um produto."); return; }
    if (!quantidade || parseFloat(quantidade) <= 0) { setError("Informe uma quantidade válida."); return; }

    setLoading(true);
    setError("");

    try {
      const payload: any = {
        item: selectedItem.id,
        tipo: subType,
        quantidade: parseFloat(quantidade),
        observacao,
      };

      if (mainType === "out") {
        if (loteId) payload.lote = loteId;
      } else {
        // Para entradas, sempre tentamos enviar numero_lote para o backend criar/vincular o lote
        payload.numero_lote = numeroLote || `LOTE-${new Date().getTime().toString().slice(-6)}`;
        if (dataValidade) payload.data_validade = dataValidade;
        if (custoUnitario) payload.custo_unitario = parseFloat(custoUnitario);
        if (fornecedorId) payload.fornecedor = fornecedorId;
      }

      await apiClient.post("/inventory/movimentacoes/", payload);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erro ao processar.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="modal-root" style={{ position: 'relative', zIndex: 1100 }}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-backdrop"
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0, 0, 0, 0.2)", backdropFilter: "blur(4px)", zIndex: 1040 
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
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            className="modal-content"
            style={{ 
              maxWidth: "520px", width: "100%", pointerEvents: 'auto',
              background: "#fdfdfb", borderRadius: "1.5rem",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              overflow: "hidden", display: "flex", flexDirection: "column",
              maxHeight: "95vh", border: "1px solid #e2e8f0"
            }}
          >
            {/* Header */}
            <div className="p-4 border-bottom d-flex justify-content-between align-items-center">
              <div>
                <h2 className="fw-bold mb-0 text-dark" style={{ fontSize: "1.25rem" }}>Registrar Movimentação</h2>
                <p className="text-muted small mb-0">Entrada ou saída de itens do estoque</p>
              </div>
              <button onClick={onClose} className="btn btn-link text-dark p-2 border-0">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-auto flex-grow-1 p-4">
              
              {/* Main Type Selector (Entrada / Saída) */}
              <div className="d-flex p-1 bg-light rounded-pill border mb-4" style={{ height: '56px' }}>
                <button 
                  type="button"
                  onClick={() => { setMainType("in"); setSubType("compra"); }}
                  className={`flex-grow-1 rounded-pill border-0 fw-bold d-flex align-items-center justify-content-center gap-2 transition-all ${mainType === "in" ? "bg-success text-white shadow-sm" : "bg-transparent text-muted"}`}
                >
                  <Plus size={18} /> Entrada
                </button>
                <button 
                  type="button"
                  onClick={() => { setMainType("out"); setSubType("consumo"); }}
                  className={`flex-grow-1 rounded-pill border-0 fw-bold d-flex align-items-center justify-content-center gap-2 transition-all ${mainType === "out" ? "bg-danger-subtle text-danger shadow-sm" : "bg-transparent text-muted"}`}
                  style={mainType === "out" ? { backgroundColor: "#d66b7a", color: "white" } : {}}
                >
                  <ArrowDownRight size={18} /> Saída
                </button>
              </div>

              {/* Sub-type Specific */}
              <div className="mb-4">
                <label className={labelStyle}>Tipo Específico</label>
                <div className="row g-2">
                  {mainType === "in" ? (
                    <>
                      <div className="col-6">
                        <button type="button" onClick={() => setSubType("compra")} className={`btn w-100 py-3 rounded-xl border d-flex align-items-center gap-2 fw-bold transition-all ${subType === "compra" ? "bg-success-subtle border-success text-success" : "bg-light border-light text-muted"}`}>
                          <ShoppingCart size={18} /> Compra
                        </button>
                      </div>
                      <div className="col-6">
                        <button type="button" onClick={() => setSubType("entrada")} className={`btn w-100 py-3 rounded-xl border d-flex align-items-center gap-2 fw-bold transition-all ${subType === "entrada" ? "bg-success-subtle border-success text-success" : "bg-light border-light text-muted"}`}>
                          <Plus size={18} /> Ajuste
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="col-4">
                        <button type="button" onClick={() => setSubType("consumo")} className={`btn w-100 py-3 rounded-xl border d-flex align-items-center gap-2 fw-bold transition-all ${subType === "consumo" ? "bg-danger-subtle border-danger text-danger" : "bg-light border-light text-muted"}`} style={subType === "consumo" ? { backgroundColor: "#fce7e9", borderColor: "#fecaca" } : {}}>
                          <Utensils size={18} /> Consumo
                        </button>
                      </div>
                      <div className="col-4">
                        <button type="button" onClick={() => setSubType("venda")} className={`btn w-100 py-3 rounded-xl border d-flex align-items-center gap-2 fw-bold transition-all ${subType === "venda" ? "bg-light border-light text-dark" : "bg-light border-light text-muted"}`}>
                          <ArrowDownRight size={18} /> Venda
                        </button>
                      </div>
                      <div className="col-4">
                        <button type="button" onClick={() => setSubType("perda")} className={`btn w-100 py-3 rounded-xl border d-flex align-items-center gap-2 fw-bold transition-all ${subType === "perda" ? "bg-light border-light text-dark" : "bg-light border-light text-muted"}`}>
                          <AlertTriangle size={18} /> Perda
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Product Selection */}
              <div className="mb-4">
                <label className={labelStyle}>Produto</label>
                {!selectedItem ? (
                  <div className="position-relative">
                    <input
                      type="text"
                      style={inputStyle}
                      placeholder="Selecione o produto..."
                      value={productSearch}
                      onChange={(e) => handleProductSearch(e.target.value)}
                    />
                    <Package size={18} className="position-absolute end-0 top-0 mt-3 me-3 text-muted" />
                    {suggestions.length > 0 && (
                      <div className="position-absolute w-100 mt-1 bg-white border rounded-xl shadow-lg z-3 overflow-hidden">
                        {suggestions.map(s => (
                          <button key={s.id} type="button" className="w-100 p-3 text-start border-0 border-bottom bg-transparent hover-bg-light" onClick={() => setSelectedItem(s)}>
                            <div className="fw-bold small">{s.nome}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="d-flex align-items-center justify-content-between p-3 border rounded-xl bg-light">
                    <div className="fw-bold">{selectedItem.nome}</div>
                    <button type="button" onClick={() => setSelectedItem(null)} className="btn btn-sm p-0 text-muted"><X size={16} /></button>
                  </div>
                )}
              </div>

              {/* Qty & Lot */}
              <div className="row g-3 mb-4">
                <div className="col-6">
                  <label className={labelStyle}>Quantidade</label>
                  <input type="number" style={inputStyle} placeholder="0.00" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
                </div>
                <div className="col-6">
                  <label className={labelStyle}>{mainType === "in" ? "Nº do Lote" : "Lote (Opcional)"}</label>
                  {mainType === "in" ? (
                    <input type="text" style={inputStyle} placeholder="Ex: LOT-001" value={numeroLote} onChange={e => setNumeroLote(e.target.value)} />
                  ) : (
                    <select style={inputStyle} value={loteId} onChange={e => setLoteId(e.target.value)}>
                      <option value="">Padrão (FIFO)</option>
                      {lotes.map(l => (
                        <option key={l.id} value={l.id}>{l.numero_lote} - Saldo: {l.quantidade_atual}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Specific Purchase Section */}
              {mainType === "in" && subType === "compra" && (
                <div className="p-4 rounded-xl border mb-4 bg-white">
                  <div className="d-flex align-items-center gap-2 mb-3 text-success fw-bold small">
                    <CreditCard size={16} /> Dados da Compra
                  </div>
                  <div className="row g-3 mb-3">
                    <div className="col-6">
                      <label className={labelStyle}>Custo Unitário (R$)</label>
                      <input type="number" style={inputStyle} placeholder="0.00" value={custoUnitario} onChange={e => setCustoUnitario(e.target.value)} step="0.01" />
                    </div>
                    <div className="col-6">
                      <label className={labelStyle}>Data Validade</label>
                      <input type="date" style={inputStyle} value={dataValidade} onChange={e => setDataValidade(e.target.value)} />
                    </div>
                  </div>
                  <div className="mb-0">
                    <label className={labelStyle}>Fornecedor</label>
                    <select style={inputStyle} value={fornecedorId} onChange={e => setFornecedorId(e.target.value)}>
                      <option value="">Selecione...</option>
                      {fornecedores.map(f => (
                        <option key={f.id} value={f.id}>{f.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Observation */}
              <div className="mb-0">
                <label className={labelStyle}>Observação / Motivo</label>
                <textarea
                  style={{ ...inputStyle, height: '100px', padding: '0.75rem', resize: 'none' }}
                  placeholder="Descreva o motivo desta movimentação..."
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </div>

              {error && (
                <div className="mt-4 p-3 rounded-xl bg-danger-subtle text-danger small fw-bold d-flex align-items-center gap-2">
                  <AlertTriangle size={16} /> {error}
                </div>
              )}
            </form>

            {/* Footer */}
            <div className="p-4 border-top d-flex align-items-center justify-content-end gap-3">
              <button type="button" onClick={onClose} className="btn border-0 fw-bold text-dark">
                Cancelar
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={loading}
                className={`btn py-3 px-4 rounded-xl fw-bold text-white shadow-sm d-flex align-items-center gap-2 border-0 ${mainType === "in" ? "bg-success" : "bg-danger"}`}
                style={mainType === "out" ? { backgroundColor: "#d66b7a" } : {}}
              >
                {loading ? <div className="spinner-border spinner-border-sm" /> : <><Save size={18} /> Confirmar Registro</>}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
