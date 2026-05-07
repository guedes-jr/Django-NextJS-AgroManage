"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Filter,
  Wheat,
  Box,
  Activity,
  Syringe,
  Package,
  ShoppingCart,
  TrendingDown,
  Utensils,
  AlertTriangle,
  Pencil,
  Trash2,
  ArrowRightLeft,
  History as HistoryIcon,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { apiClient } from "@/services/api";
import { Badge } from "@/components/ui/Badge";
import { QuickMovementModal } from "@/components/dashboard/QuickMovementModal";
import "@/app/home/estoque/estoque.css";

type InventoryItem = {
  id: string;
  nome: string;
  categoria: string;
  categoria_display: string;
  unidade_medida: string;
  unidade_display: string;
  estoque_atual: number;
  estoque_minimo: number;
  estoque_baixo: boolean;
  prioridade: string;
};

type Movimentacao = {
  id: string;
  item: { id: string; nome: string };
  item_nome: string;
  tipo: string;
  tipo_display: string;
  quantidade: string;
  data_movimentacao: string;
  responsavel_nome: string;
  observacao: string;
  lote?: { id: string; numero_lote: string };
};

const TIPO_COLORS: Record<string, { color: string; label: string }> = {
  compra: { color: "text-emerald-600", label: "Compra" },
  entrada: { color: "text-emerald-600", label: "Entrada" },
  venda: { color: "text-blue-600", label: "Venda" },
  consumo: { color: "text-rose-600", label: "Consumo" },
  perda: { color: "text-orange-600", label: "Perda" },
  ajuste: { color: "text-slate-600", label: "Ajuste" },
};

export function MovimentacoesDashboard() {
  const [view, setView] = useState<"stock" | "history">("stock");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<Movimentacao[]>([]);
  const [selectedMovementIds, setSelectedMovementIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Pagination for history
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modal State
  const [quickModal, setQuickModal] = useState<{
    open: boolean;
    item?: InventoryItem;
    type: "in" | "out";
  }>({ open: false, type: "in" });

  const fetchStock = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/inventory/items/all_items/");
      setItems(Array.isArray(data) ? data : data.results || []);
    } catch (error) {
      console.error("Erro ao buscar estoque:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (targetPage = 1) => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/inventory/movimentacoes/", {
        params: { page: targetPage, page_size: 15 }
      });
      setMovements(data.results || []);
      setSelectedMovementIds([]);
      setTotalPages(data.total_pages || 1);
      setTotalCount(data.count || 0);
      setPage(targetPage);
    } catch (error) {
      console.error("Erro ao buscar histórico:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view === "stock") fetchStock();
    else fetchHistory(1);
  }, [view]);

  const filteredStock = useMemo(() => {
    return items.filter(i => 
      i.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.categoria_display.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm]);

  const handleDeleteMovement = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir este registro? O estoque será revertido.")) return;
    try {
      await apiClient.delete(`/inventory/movimentacoes/${id}/`);
      fetchHistory(page);
    } catch (error) {
      console.error("Erro ao excluir:", error);
    }
  };

  const currentPageMovementIds = useMemo(() => {
    return movements.map((movement) => movement.id);
  }, [movements]);

  const allCurrentPageSelected = useMemo(() => {
    return (
      currentPageMovementIds.length > 0 &&
      currentPageMovementIds.every((id) => selectedMovementIds.includes(id))
    );
  }, [currentPageMovementIds, selectedMovementIds]);

  const toggleMovementSelection = (id: string) => {
    setSelectedMovementIds((previous) => {
      if (previous.includes(id)) {
        return previous.filter((selectedId) => selectedId !== id);
      }

      return [...previous, id];
    });
  };

  const toggleAllCurrentPageMovements = () => {
    if (allCurrentPageSelected) {
      setSelectedMovementIds([]);
      return;
    }

    setSelectedMovementIds(currentPageMovementIds);
  };

  const handleBulkDeleteMovements = async () => {
    if (selectedMovementIds.length === 0) return;

    const confirmed = window.confirm(
      `Deseja realmente excluir ${selectedMovementIds.length} movimentação(ões)? O estoque será revertido.`
    );

    if (!confirmed) return;

    try {
      await apiClient.post("/inventory/movimentacoes/bulk-delete/", {
        ids: selectedMovementIds,
      });

      setSelectedMovementIds([]);
      fetchHistory(page);
    } catch (error) {
      console.error("Erro ao excluir movimentações:", error);
    }
  };

  return (
    <div className="inventory-container pb-5">
      {/* Header & Navigation */}
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-4">
          <Link href="/home/estoque/resumo" className="text-decoration-none text-muted-foreground hover-text-primary">
            Estoque
          </Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Movimentações</span>
        </nav>

        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-4 mb-4">
          <div>
            <h1 className="fw-black mb-1" style={{ fontSize: "2.25rem", letterSpacing: "-0.04em", color: "var(--foreground)" }}>
              Movimentações de Estoque
            </h1>
            <p className="mb-0 text-muted-foreground fw-medium">
              Gerencie entradas, saídas e acompanhe o histórico completo de movimentações.
            </p>
          </div>
          <div className="d-flex gap-3">
            <button 
              onClick={() => setQuickModal({ open: true, type: "in" })}
              className="btn btn-primary d-flex align-items-center gap-2 rounded-xl px-4 py-3 fw-bold shadow-sm transition-all hover-scale"
              style={{ background: "oklch(0.65 0.14 145)", border: "none" }}
            >
              <Plus size={20} strokeWidth={3} /> Nova Entrada
            </button>
            <button 
              onClick={() => setQuickModal({ open: true, type: "out" })}
              className="btn btn-danger d-flex align-items-center gap-2 rounded-xl px-4 py-3 fw-bold shadow-sm transition-all hover-scale"
              style={{ background: "oklch(0.65 0.14 15)", border: "none" }}
            >
              <Plus size={20} strokeWidth={3} /> Nova Saída
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs (Bootstrap Style) */}
      <ul className="nav nav-tabs mb-4 border-bottom w-100">
        <li className="nav-item">
          <button
            onClick={() => setView("stock")}
            className={`nav-link d-flex align-items-center gap-2 py-3 px-4 fw-bold border-0 border-bottom border-3 rounded-0 transition-all ${
              view === "stock" 
                ? "active text-success border-success bg-transparent" 
                : "text-muted border-transparent hover-bg-light"
            }`}
            style={{ fontSize: '0.95rem', marginBottom: '-1px' }}
          >
            <Layers size={20} className={view === "stock" ? "text-success" : "text-muted"} />
            Operações
          </button>
        </li>
        <li className="nav-item">
          <button
            onClick={() => setView("history")}
            className={`nav-link d-flex align-items-center gap-2 py-3 px-4 fw-bold border-0 border-bottom border-3 rounded-0 transition-all ${
              view === "history" 
                ? "active text-success border-success bg-transparent" 
                : "text-muted border-transparent hover-bg-light"
            }`}
            style={{ fontSize: '0.95rem', marginBottom: '-1px' }}
          >
            <HistoryIcon size={20} className={view === "history" ? "text-success" : "text-muted"} />
            Histórico
          </button>
        </li>
      </ul>

      {/* Search & Filter Bar */}
      <div className="dashboard-card p-3 mb-4 border-0 shadow-sm">
        <div className="row g-3 align-items-center">
          <div className="col-12 col-lg-6">
            <div className="position-relative">
              <Search size={18} className="position-absolute text-muted-foreground" style={{ left: "12px", top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                className="form-control ps-5 border-0 bg-muted/30 fw-medium"
                style={{ height: '48px', borderRadius: '12px' }}
                placeholder={view === "stock" ? "Buscar por produto ou categoria..." : "Buscar no histórico..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          {view === "stock" && (
            <div className="col-12 col-lg-6 d-flex justify-content-lg-end">
              <div className="d-flex gap-2">
                <Badge className="bg-rose-50 text-rose-600 border-rose-100 px-3 py-2 rounded-lg fw-bold">
                  {items.filter(i => i.estoque_baixo).length} Itens com estoque baixo
                </Badge>
              </div>
            </div>
          )}
          {view === "history" && selectedMovementIds.length > 0 && (
            <div className="col-12 col-lg-6 d-flex justify-content-lg-end">
              <button
                onClick={handleBulkDeleteMovements}
                className="btn btn-danger d-flex align-items-center gap-2 rounded-xl px-4 py-3 fw-bold shadow-sm"
              >
                <Trash2 size={18} />
                Excluir selecionadas ({selectedMovementIds.length})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area with AnimatePresence */}
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          <div className="dashboard-card p-0 overflow-hidden border-0 shadow-sm">
            {loading ? (
              <div className="p-5 text-center">
                <div className="spinner-border text-primary mb-3" role="status" />
                <div className="text-muted-foreground fw-medium">Carregando dados...</div>
              </div>
            ) : view === "stock" ? (
              /* STOCK VIEW - Action Oriented */
              <div className="table-responsive">
                <table className="table mb-0 align-middle table-hover">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">PRODUTO</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">CATEGORIA</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">SALDO ATUAL</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground text-center">AÇÕES RÁPIDAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStock.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-5 text-muted-foreground">Nenhum produto encontrado.</td></tr>
                    ) : (
                      filteredStock.map(item => (
                        <tr key={item.id} className="border-bottom border-border/50">
                          <td className="px-4 py-3">
                            <div className="fw-bold text-foreground">{item.nome}</div>
                            <div className="small text-muted-foreground">Mínimo: {item.estoque_minimo} {item.unidade_display}</div>
                          </td>
                          <td className="px-3 py-3">
                            <Badge className="bg-muted text-muted-foreground border-0 fw-bold">{item.categoria_display}</Badge>
                          </td>
                          <td className="px-3 py-3">
                            <div className={`fw-black fs-5 ${item.estoque_baixo ? 'text-rose-500' : 'text-foreground'}`}>
                              {item.estoque_atual} <span className="small fw-medium text-muted-foreground">{item.unidade_display}</span>
                            </div>
                            {item.estoque_baixo && (
                              <div className="d-flex align-items-center gap-1 text-rose-500 small fw-bold">
                                <AlertTriangle size={12} /> Estoque Baixo
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="d-flex justify-content-center gap-2">
                              <button 
                                onClick={() => setQuickModal({ open: true, item, type: "in" })}
                                className="btn btn-sm d-flex align-items-center gap-2 px-3 py-2 rounded-xl fw-bold border-0 transition-all hover-scale"
                                style={{ background: "oklch(0.65 0.14 145 / 0.1)", color: "oklch(0.65 0.14 145)" }}
                              >
                                <ArrowUpRight size={18} /> Entrada
                              </button>
                              <button 
                                onClick={() => setQuickModal({ open: true, item, type: "out" })}
                                className="btn btn-sm d-flex align-items-center gap-2 px-3 py-2 rounded-xl fw-bold border-0 transition-all hover-scale"
                                style={{ background: "oklch(0.65 0.14 15 / 0.1)", color: "oklch(0.65 0.14 15)" }}
                                disabled={Number(item.estoque_atual) <= 0}
                              >
                                <ArrowDownRight size={18} /> Saída
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* HISTORY VIEW - List Oriented */
              <div className="table-responsive">
                <table className="table mb-0 align-middle table-hover">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-4 py-3 border-0" style={{ width: "48px" }}>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={allCurrentPageSelected}
                          onChange={toggleAllCurrentPageMovements}
                        />
                      </th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">TIPO</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">PRODUTO</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">QUANTIDADE</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">DATA</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground text-end">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-5 text-muted-foreground">Nenhum registro encontrado.</td></tr>
                    ) : (
                      movements.map(m => (
                        <tr key={m.id} className="border-bottom border-border/50">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={selectedMovementIds.includes(m.id)}
                              onChange={() => toggleMovementSelection(m.id)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <div className="d-flex align-items-center gap-2">
                              <div className={`p-1 rounded-md ${TIPO_COLORS[m.tipo]?.color.replace('text-', 'bg-').replace('600', '100')} ${TIPO_COLORS[m.tipo]?.color}`}>
                                {m.tipo === 'compra' || m.tipo === 'entrada' ? <Plus size={14} /> : <TrendingDown size={14} />}
                              </div>
                              <span className={`small fw-bold ${TIPO_COLORS[m.tipo]?.color || ""}`}>
                                {m.tipo_display}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3 fw-bold">
                            <div className="d-flex align-items-center gap-2">
                              {m.item_nome}
                              {(m.observacao && (m.observacao.includes("produção de") || m.observacao.includes("Entrada por produção"))) && (
                                <span 
                                  className="badge rounded-pill" 
                                  style={{ 
                                    background: "oklch(0.95 0.05 145)", 
                                    color: "oklch(0.5 0.15 145)", 
                                    fontSize: "0.6rem",
                                    padding: "2px 8px",
                                    border: "1px solid oklch(0.9 0.05 145)"
                                  }}
                                >
                                  Ração - {new Date(m.data_movimentacao).toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' })}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 fw-black">{parseFloat(m.quantidade).toLocaleString("pt-BR")}</td>
                          <td className="px-3 py-3 text-muted-foreground small">
                            <div className="d-flex align-items-center gap-1">
                              <Clock size={12} />
                              {new Date(m.data_movimentacao).toLocaleString("pt-BR")}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-end">
                            <button 
                              onClick={() => handleDeleteMovement(m.id)}
                              className="btn btn-sm p-2 hover-bg-rose-50 text-muted-foreground hover-text-rose-600 rounded-lg transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Pagination for History */}
      {view === "history" && totalPages > 1 && (
        <div className="d-flex align-items-center justify-content-between mt-4">
          <div className="text-muted-foreground small fw-medium">Mostrando {movements.length} de {totalCount} registros</div>
          <div className="d-flex gap-2">
            <button className="btn btn-light rounded-xl px-3 border border-border shadow-sm" disabled={page <= 1} onClick={() => fetchHistory(page - 1)}>
              <ChevronLeft size={18} />
            </button>
            <button className="btn btn-light rounded-xl px-3 border border-border shadow-sm" disabled={page >= totalPages} onClick={() => fetchHistory(page + 1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {quickModal.open && (
        <QuickMovementModal
          isOpen={quickModal.open}
          onClose={() => { 
            setQuickModal({ ...quickModal, open: false }); 
            if (view === "stock") fetchStock();
            else fetchHistory(1);
          }}
          item={quickModal.item}
          type={quickModal.type}
        />
      )}
    </div>
  );
}