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
  Clock,
  Leaf,
  Sprout
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { financeError } from "@/services/financeService";
import { useToast } from "@/components/ui/Toast";
import { apiClient } from "@/services/api";
import { Badge } from "@/components/ui/Badge";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { StockAdjustmentModal } from "@/components/dashboard/StockAdjustmentModal";
import { QuickMovementModal } from "@/components/dashboard/QuickMovementModal";
import { useOrganizationLocale } from "@/lib/locale";
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
  cattle_delivery?: string | null;
  id: string;
  item: { id: string; nome: string };
  item_nome: string;
  tipo: string;
  tipo_display: string;
  quantidade: string;
  data_movimentacao: string;
  responsavel_nome: string;
  destino?: string;
  observacao: string;
  custo_unitario_movimento?: string | number | null;
  custo_total?: string | number | null;
  lote?: { id: string; numero_lote: string };
};

const OUT_MOVEMENT_TYPES = new Set(["saida", "consumo", "venda", "perda", "vencimento"]);

function numericValue(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const trimmed = String(value).trim();
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDestinationBadgeConfig(destination?: string | null) {
  const normalized = (destination || "").toLowerCase();

  if (normalized.includes("plant")) {
    return {
      label: destination || "Plantio",
      icon: Leaf,
      background: "oklch(0.94 0.05 145)",
      color: "oklch(0.42 0.14 145)",
      border: "oklch(0.86 0.07 145)",
    };
  }

  if (normalized.includes("suí") || normalized.includes("sui")) {
    return {
      label: destination || "Suínos",
      icon: Activity,
      background: "oklch(0.95 0.04 315)",
      color: "oklch(0.48 0.14 315)",
      border: "oklch(0.88 0.06 315)",
    };
  }

  if (normalized.includes("bovin")) {
    return {
      label: destination || "Bovinos",
      icon: Box,
      background: "oklch(0.95 0.04 235)",
      color: "oklch(0.45 0.14 235)",
      border: "oklch(0.87 0.06 235)",
    };
  }

  if (normalized.includes("avic")) {
    return {
      label: destination || "Avicultura",
      icon: Activity,
      background: "oklch(0.96 0.05 85)",
      color: "oklch(0.48 0.12 75)",
      border: "oklch(0.88 0.07 85)",
    };
  }

  if (normalized.includes("almox") || normalized.includes("depósito") || normalized.includes("deposito")) {
    return {
      label: destination || "Almoxarifado",
      icon: Layers,
      background: "oklch(0.95 0.02 250)",
      color: "oklch(0.42 0.06 250)",
      border: "oklch(0.87 0.03 250)",
    };
  }

  if (normalized.includes("ração") || normalized.includes("racao")) {
    return {
      label: destination || "Produção de ração",
      icon: Wheat,
      background: "oklch(0.96 0.05 95)",
      color: "oklch(0.46 0.12 85)",
      border: "oklch(0.88 0.07 95)",
    };
  }

  return {
    label: destination || "-",
    icon: Sprout,
    background: "oklch(0.96 0.01 250)",
    color: "oklch(0.42 0.04 250)",
    border: "oklch(0.88 0.02 250)",
  };
}

function DestinationBadge({ destination }: { destination?: string | null }) {
  if (!destination) return <span className="small text-muted-foreground">-</span>;
  const config = getDestinationBadgeConfig(destination);
  const Icon = config.icon;

  return (
    <span
      className="d-inline-flex align-items-center gap-2 fw-bold"
      style={{
        background: config.background,
        color: config.color,
        border: `1px solid ${config.border}`,
        borderRadius: "8px",
        padding: "0.42rem 0.7rem",
        fontSize: "0.78rem",
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={15} strokeWidth={2.4} />
      {config.label}
    </span>
  );
}

const TIPO_COLORS: Record<string, { color: string; key: string }> = {
  compra: { color: "text-emerald-600", key: "inventory.movements.purchase" },
  entrada: { color: "text-emerald-600", key: "inventory.movements.entry" },
  venda: { color: "text-blue-600", key: "inventory.movements.sale" },
  consumo: { color: "text-rose-600", key: "inventory.movements.consumption" },
  perda: { color: "text-orange-600", key: "inventory.movements.loss" },
  ajuste: { color: "text-slate-600", key: "inventory.movements.adjustment" },
};

export function MovimentacoesDashboard() {
  const { language, t } = useOrganizationLocale();
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

  const { showToast } = useToast();
  const access = useOrganizationAccess();
  const canAdjust = !!access && !access.read_only && ["admin", "manager"].includes(access.role);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);

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
      i.nome.toLocaleLowerCase(language).includes(searchTerm.toLocaleLowerCase(language)) ||
      i.categoria_display.toLocaleLowerCase(language).includes(searchTerm.toLocaleLowerCase(language))
    );
  }, [items, searchTerm, language]);

  const handleDeleteMovement = async (id: string) => {
    if (!window.confirm(t("inventory.movements.deleteConfirm"))) return;
    try {
      await apiClient.delete(`/inventory/movimentacoes/${id}/`);
      fetchHistory(page);
    } catch (error) {
      showToast(financeError(error), "error");
    }
  };

  const currentPageMovementIds = useMemo(() => {
    return movements.filter((movement) => movement.tipo !== "ajuste" && !movement.cattle_delivery).map((movement) => movement.id);
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
      t("inventory.movements.bulkDeleteConfirm", { count: selectedMovementIds.length.toLocaleString(language) })
    );

    if (!confirmed) return;

    try {
      await apiClient.post("/inventory/movimentacoes/bulk-delete/", {
        ids: selectedMovementIds,
      });

      setSelectedMovementIds([]);
      fetchHistory(page);
    } catch (error) {
      showToast(financeError(error), "error");
    }
  };

  return (
    <div className="inventory-container pb-5">
      {/* Header & Navigation */}
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-4">
          <Link href="/home/estoque/resumo" className="text-decoration-none text-muted-foreground hover-text-primary">
            {t("inventory.home.title")}
          </Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">{t("inventory.home.movements")}</span>
        </nav>

        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-4 mb-4">
          <div>
            <h1 className="fw-black mb-1" style={{ fontSize: "2.25rem", letterSpacing: "-0.04em", color: "var(--foreground)" }}>
              {t("inventory.movements.title")}
            </h1>
            <p className="mb-0 text-muted-foreground fw-medium">
              {t("inventory.movements.description")}
            </p>
          </div>
          <div className="d-flex flex-wrap gap-3">
            {canAdjust && <button className="btn btn-outline-primary" onClick={() => { fetchStock(); setAdjustmentOpen(true); }}>{t("inventory.movements.stockAdjustment")}</button>}
            <button 
              onClick={() => setQuickModal({ open: true, type: "in" })}
              className="btn btn-primary d-flex align-items-center gap-2 rounded-xl px-4 py-3 fw-bold shadow-sm transition-all hover-scale"
              style={{ background: "oklch(0.65 0.14 145)", border: "none" }}
            >
              <Plus size={20} strokeWidth={3} /> {t("inventory.movements.newEntry")}
            </button>
            <button 
              onClick={() => setQuickModal({ open: true, type: "out" })}
              className="btn btn-danger d-flex align-items-center gap-2 rounded-xl px-4 py-3 fw-bold shadow-sm transition-all hover-scale"
              style={{ background: "oklch(0.65 0.14 15)", border: "none" }}
            >
              <Plus size={20} strokeWidth={3} /> {t("inventory.movements.newExit")}
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
            {t("inventory.movements.operations")}
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
            {t("inventory.movements.history")}
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
                placeholder={view === "stock" ? t("inventory.movements.searchStock") : t("inventory.movements.searchHistory")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          {view === "stock" && (
            <div className="col-12 col-lg-6 d-flex justify-content-lg-end">
              <div className="d-flex gap-2">
                <Badge className="bg-rose-50 text-rose-600 border-rose-100 px-3 py-2 rounded-lg fw-bold">
                  {items.filter(i => i.estoque_baixo).length.toLocaleString(language)} {t("inventory.movements.lowStockItems")}
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
                {t("inventory.movements.deleteSelected", { count: selectedMovementIds.length.toLocaleString(language) })}
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
                <div className="text-muted-foreground fw-medium">{t("inventory.movements.loading")}</div>
              </div>
            ) : view === "stock" ? (
              /* STOCK VIEW - Action Oriented */
              <div className="table-responsive">
                <table className="table mb-0 align-middle table-hover">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">{t("inventory.products.product").toLocaleUpperCase(language)}</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">{t("stock.category").toLocaleUpperCase(language)}</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">{t("inventory.movements.currentBalance").toLocaleUpperCase(language)}</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground text-center">{t("inventory.movements.quickActions").toLocaleUpperCase(language)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStock.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-5 text-muted-foreground">{t("inventory.movements.noProducts")}</td></tr>
                    ) : (
                      filteredStock.map(item => (
                        <tr key={item.id} className="border-bottom border-border/50">
                          <td className="px-4 py-3">
                            <div className="fw-bold text-foreground">{item.nome}</div>
                            <div className="small text-muted-foreground">{t("inventory.products.minimum")}: {numericValue(item.estoque_minimo).toLocaleString(language)} {item.unidade_display}</div>
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
                                <AlertTriangle size={12} /> {t("inventory.products.lowStock")}
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
                                <ArrowUpRight size={18} /> {t("inventory.movements.entry")}
                              </button>
                              <button 
                                onClick={() => setQuickModal({ open: true, item, type: "out" })}
                                className="btn btn-sm d-flex align-items-center gap-2 px-3 py-2 rounded-xl fw-bold border-0 transition-all hover-scale"
                                style={{ background: "oklch(0.65 0.14 15 / 0.1)", color: "oklch(0.65 0.14 15)" }}
                                disabled={Number(item.estoque_atual) <= 0}
                              >
                                <ArrowDownRight size={18} /> {t("inventory.movements.exit")}
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
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">{t("inventory.movements.type").toLocaleUpperCase(language)}</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">{t("inventory.products.product").toLocaleUpperCase(language)}</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">{t("inventory.movements.quantity").toLocaleUpperCase(language)}</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">{t("stock.unitValue").toLocaleUpperCase(language)}</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">{t("inventory.movements.destination").toLocaleUpperCase(language)}</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">{t("inventory.movements.date").toLocaleUpperCase(language)}</th>
                      <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground text-end">{t("inventory.products.actions").toLocaleUpperCase(language)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-5 text-muted-foreground">{t("inventory.movements.noRecords")}</td></tr>
                    ) : (
                      movements.map(m => (
                        <tr key={m.id} className="border-bottom border-border/50">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              disabled={m.tipo === "ajuste" || !!m.cattle_delivery}
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
                                {TIPO_COLORS[m.tipo] ? t(TIPO_COLORS[m.tipo].key as Parameters<typeof t>[0]) : m.tipo_display}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3 fw-bold">
                            <div className="d-flex align-items-center gap-2">
                              {m.item_nome}
                              {m.tipo === "ajuste" && <small className="fw-normal text-muted">{m.observacao} · {m.responsavel_nome}</small>}
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
                                  {t("inventory.movements.feed")} - {new Date(m.data_movimentacao).toLocaleDateString(language, { day: '2-digit', month: '2-digit' })}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 fw-black">{numericValue(m.quantidade).toLocaleString(language)}</td>
                          <td className="px-3 py-3">
                            <div className="fw-bold text-foreground">{numericValue(m.custo_total).toLocaleString(language, { style: "currency", currency: "BRL" })}</div>
                            <div className="small text-muted-foreground">{numericValue(m.custo_unitario_movimento).toLocaleString(language, { style: "currency", currency: "BRL" })} / {t("inventory.movements.unitShort")}</div>
                          </td>
                          <td className="px-3 py-3">
                            {OUT_MOVEMENT_TYPES.has(m.tipo) ? <DestinationBadge destination={m.destino} /> : <span className="small text-muted-foreground">-</span>}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground small">
                            <div className="d-flex align-items-center gap-1">
                              <Clock size={12} />
                              {new Date(m.data_movimentacao).toLocaleString(language)}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-end">
                            {m.tipo !== "ajuste" && !m.cattle_delivery && <button
                              onClick={() => handleDeleteMovement(m.id)}
                              className="btn btn-sm p-2 hover-bg-rose-50 text-muted-foreground hover-text-rose-600 rounded-lg transition-all"
                            >
                              <Trash2 size={16} />
                            </button>}
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
          <div className="text-muted-foreground small fw-medium">{t("inventory.movements.showing", { shown: movements.length.toLocaleString(language), total: totalCount.toLocaleString(language) })}</div>
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

      {adjustmentOpen && <StockAdjustmentModal items={items} onClose={() => setAdjustmentOpen(false)} onSaved={() => { setAdjustmentOpen(false); if (view === "stock") fetchStock(); else fetchHistory(1); }} />}

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
