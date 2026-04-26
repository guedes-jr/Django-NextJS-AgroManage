"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingCart, TrendingDown, Utensils, AlertTriangle, Save } from "lucide-react";
import { apiClient } from "@/services/api";

export type InventoryCategory = "racao" | "nucleo" | "medicamento" | "vacina" | "material" | "suplemento" | "outro";

interface InventoryItem {
  id: number;
  nome: string;
  categoria: string;
  categoria_display: string;
  unidade_medida: string;
}

interface MovimentacaoFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoria?: string;
  produtos: InventoryItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  racao: "Ração / Grãos",
  nucleo: "Núcleo / Premix",
  medicamento: "Medicamento",
  vaccine: "Vacina",
  material: "Material",
};

const TIPO_OPTIONS = [
  { value: "compra", label: "Compra", icon: ShoppingCart, desc: "Entrada por compra" },
  { value: "venda", label: "Venda", desc: "Saída por venda" },
  { value: "consumo", label: "Consumo", desc: "Uso interno" },
  { value: "perda", label: "Perda", desc: "Perda/quebra" },
];

const inputStyle = {
  height: '44px',
  padding: '0 1rem',
  border: '1.5px solid var(--border)',
  borderRadius: '10px',
} as const;

export function MovimentacaoFormModalWithHeader({ isOpen, onClose, categoria, produtos }: MovimentacaoFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState<string>("compra");
  const [itemId, setItemId] = useState<number | "">("");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTipo("compra");
      setItemId("");
      setQuantidade("");
      setObservacao("");
      setError("");
    }
  }, [isOpen]);

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
      await apiClient.post("/inventory/movimentacoes/", {
        item: itemId,
        tipo,
        quantidade: parseFloat(quantidade),
        observacao,
      });
      onClose();
      window.location.reload();
    } catch (err: any) {
      setError(err.response?.data?.error || "Erro ao salvar movimentação");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const catLabel = categoria ? CATEGORY_LABELS[categoria] : null;

  return (
    <AnimatePresence>
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ 
            background: "rgba(0, 0, 0, 0.4)", 
            backdropFilter: "blur(4px)",
            zIndex: 1040 
          }}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        />
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-2 p-md-4 pe-none" style={{ zIndex: 1050, pointerEvents: "none" }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="w-100"
            style={{ maxWidth: "380px", pointerEvents: "auto" }}
          >
            <div className="dashboard-card overflow-hidden shadow-lg border border-border" style={{ maxHeight: "calc(100dvh - 2rem)", display: "flex", flexDirection: "column" }}>
              
              <div className="p-3 p-md-4 border-bottom border-border d-flex justify-content-between align-items-center" style={{ background: "var(--muted)" }}>
                <div>
                  <h2 className="fw-bold mb-1" style={{ fontSize: "1.25rem", color: "var(--foreground)" }}>Nova Movimentação</h2>
                  <p className="text-muted-foreground small mb-0">{catLabel || "Selecione a categoria"}</p>
                </div>
                <button type="button" onClick={onClose} className="btn p-2 border-0 hover-bg-border rounded-circle" style={{ background: "transparent" }}>
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleSubmit}>
                <div className="overflow-auto flex-grow-1" style={{ backgroundColor: "var(--background)", padding: "1.25rem" }}>
                  
                  <div className="mb-4">
                    <h3 className="fw-bold mb-3 text-muted-foreground" style={{ fontSize: "0.875rem" }}>Tipo de Movimentação</h3>
                    <div className="row g-2">
                      {TIPO_OPTIONS.map((opt) => (
                        <div className="col-6" key={opt.value}>
                          <button
                            type="button"
                            onClick={() => setTipo(opt.value)}
                            className={`w-100 p-3 rounded-xl border text-center transition-all ${
                              tipo === opt.value
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:border-muted-foreground'
                            }`}
                            style={{ minHeight: "68px" }}
                          >
                            <span className={`d-block fw-semibold ${tipo === opt.value ? 'text-primary' : ''}`}>
                              {opt.label}
                            </span>
                            <span className="d-block text-xs text-muted-foreground">{opt.desc}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label small fw-bold text-muted-foreground mb-1 d-block">Produto</label>
                    <select 
                      className="w-100"
                      style={{ ...inputStyle }}
                      value={itemId}
                      onChange={(e) => setItemId(e.target.value ? parseInt(e.target.value) : "")}
                    >
                      <option value="">Selecione...</option>
                      {filteredProdutos.map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-3">
                    <label className="form-label small fw-bold text-muted-foreground mb-1 d-block">
                      Quantidade {produtoSelecionado && `(${produtoSelecionado.unidade_medida})`}
                    </label>
                    <input
                      type="number"
                      className="w-100"
                      style={{ ...inputStyle }}
                      placeholder="0"
                      value={quantidade}
                      onChange={(e) => setQuantidade(e.target.value)}
                      step="0.01"
                      min="0"
                    />
                  </div>

                  <div className="mb-0">
                    <label className="form-label small fw-bold text-muted-foreground mb-1 d-block">Observação</label>
                    <textarea
                      className="w-100"
                      style={{ 
                        ...inputStyle, 
                        height: '80px', 
                        padding: '0.75rem 1rem',
                        resize: 'none' 
                      }}
                      rows={3}
                      placeholder="Opcional..."
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                    />
                  </div>

                  {error && (
                    <div className="mt-3 p-2 rounded text-sm" style={{ background: "oklch(0.6 0.15 25 / 0.1)", color: "oklch(0.6 0.15 25)" }}>
                      {error}
                    </div>
                  )}
                </div>

                <div className="p-3 p-md-4 border-top border-border d-flex justify-content-end gap-2" style={{ background: "var(--background)" }}>
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-light px-4 py-2"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn px-4 py-2"
                    style={{ background: 'oklch(0.55 0.16 145)', color: 'white' }}
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save size={16} className="me-2" />
                        Salvar
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      </>
    </AnimatePresence>
  );
}