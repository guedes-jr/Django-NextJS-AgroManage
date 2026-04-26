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
} from "lucide-react";

const TIPO_COLORS: Record<string, { color: string; label: string }> = {
  compra: { color: "text-emerald-600", label: "Compra" },
  venda: { color: "text-blue-600", label: "Venda" },
  consumo: { color: "text-rose-600", label: "Consumo" },
  perda: { color: "text-orange-600", label: "Perda" },
};

import { apiClient } from "@/services/api";
import { Badge } from "@/components/ui/Badge";
import { MovimentacaoFormModalWithHeader } from "@/components/dashboard/MovimentacaoFormModal";
import "@/app/home/estoque/estoque.css";

type InventoryItem = {
  id: number;
  nome: string;
  categoria: string;
  categoria_display: string;
  unidade_medida: string;
  estoque_atual: string;
};

type Movimentacao = {
  id: number;
  item: { id: number; nome: string };
  item_nome: string;
  tipo: string;
  tipo_display: string;
  quantidade: string;
  data_movimentacao: string;
  responsavel_nome: string;
  observacao: string;
  lote?: { id: number; numero_lote: string };
};

type PaginatedResponse<T> = {
  count: number;
  total_pages: number;
  results: T[];
};

const CATEGORY_COLORS: Record<string, string> = {
  racao: "oklch(0.7 0.15 85)",
  nucleo: "oklch(0.65 0.16 230)",
  medicamento: "oklch(0.7 0.18 25)",
  vaccina: "oklch(0.7 0.22 290)",
  material: "oklch(0.6 0.05 240)",
};

export function MovimentacoesDashboard() {
  const [items, setItems] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoFilter, setTipoFilter] = useState("todos");
  const [produtoFilter, setProdutoFilter] = useState<number | null>(null);
  const [produtos, setProdutos] = useState<InventoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCategoria, setModalCategoria] = useState<string | null>(null);

  const categorias = [
    { key: "racao", title: "Ração / Grãos", desc: "Milho, soja, farelo...", icon: <Wheat size={20} />, color: "oklch(0.7 0.15 85)" },
    { key: "nucleo", title: "Núcleo / Premix", desc: "Núcleo, suplementos...", icon: <Box size={20} />, color: "oklch(0.65 0.16 230)" },
    { key: "medicamento", title: "Medicamentos", desc: "Antibióticos, vitaminas...", icon: <Activity size={20} />, color: "oklch(0.7 0.18 25)" },
    { key: "vacina", title: "Vacinas", desc: "Vacinas, injetáveis...", icon: <Syringe size={20} />, color: "oklch(0.7 0.22 290)" },
    { key: "material", title: "Outros Materiais", desc: "Materiais e equipamentos...", icon: <Package size={20} />, color: "oklch(0.6 0.05 240)" },
  ];

  const fetchProdutos = async () => {
    try {
      const { data } = await apiClient.get<PaginatedResponse<InventoryItem>>("/inventory/items/", {
        params: { page_size: 500 },
      });
      setProdutos(data.results || []);
    } catch (error) {
      console.error("Erro ao buscar produtos:", error);
    }
  };

  const fetchItems = async (targetPage = 1) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page: targetPage, page_size: 20 };
      if (tipoFilter !== "todos") {
        params.tipo = tipoFilter;
      }
      if (produtoFilter) {
        params.item_id = produtoFilter;
      }
      const { data } = await apiClient.get<PaginatedResponse<Movimentacao>>("/inventory/movimentacoes/", {
        params,
      });
      setItems(data.results || []);
      setTotalPages(data.total_pages || 1);
      setTotalCount(data.count || 0);
      setPage(targetPage);
    } catch (error) {
      console.error("Erro ao buscar movimentações:", error);
      setItems([]);
      setTotalPages(1);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProdutos();
  }, []);

  useEffect(() => {
    fetchItems(1);
  }, [tipoFilter, produtoFilter]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = item.item_nome?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTipo = tipoFilter === "todos" || item.tipo === tipoFilter;
      const matchesProduto = !produtoFilter || item.item?.id === produtoFilter;
      return matchesSearch && matchesTipo && matchesProduto;
    });
  }, [items, searchTerm, tipoFilter, produtoFilter]);

  return (
    <div className="inventory-container pb-5">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-4">
          <Link href="/home/estoque/resumo" className="text-decoration-none text-muted-foreground hover-text-primary">
            Estoque
          </Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Movimentações</span>
        </nav>

        <div className="d-flex justify-content-between align-items-end mb-4">
          <div>
            <h1 className="fw-black mb-1" style={{ fontSize: "2.25rem", letterSpacing: "-0.04em", color: "var(--foreground)" }}>
              Movimentações
            </h1>
            <p className="mb-0 text-muted-foreground fw-medium">
              Registro de entradas e saídas de estoque.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h3 className="fw-bold mb-0" style={{ fontSize: "1.1rem" }}>Nova Movimentação</h3>
        </div>
        <div className="row g-3">
          {categorias.map((cat) => (
            <div key={cat.key} className="col-auto">
              <div 
                className="inv-category-card" 
                onClick={() => { setModalCategoria(cat.key); setModalOpen(true); }}
                style={{ cursor: "pointer" }}
              >
                <div
                  className="inv-category-icon"
                  style={{
                    background: `color-mix(in srgb, ${cat.color}, transparent 85%)`,
                    color: cat.color,
                  }}
                >
                  {cat.icon}
                </div>
                <div>
                  <div className="inv-category-title">{cat.title}</div>
                  <div className="inv-category-desc">{cat.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard-card p-3 mb-3">
        <div className="row g-3 align-items-center">
          <div className="col-12 col-lg-4">
            <div className="position-relative">
              <Search size={16} className="position-absolute text-muted-foreground" style={{ left: "10px", top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                className="form-control ps-5"
                placeholder="Buscar movimentação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="col-6 col-lg-2">
            <select className="form-select" value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}>
              <option value="todos">Todos os tipos</option>
              <option value="compra">Compras</option>
              <option value="venda">Vendas</option>
              <option value="consumo">Consumo</option>
              <option value="perda">Perda</option>
            </select>
          </div>
          <div className="col-6 col-lg-2">
            <select 
              className="form-select" 
              value={produtoFilter || ""} 
              onChange={(e) => setProdutoFilter(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">Todos os produtos</option>
              {produtos
                .map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))
              }
            </select>
          </div>
          <div className="col-6 col-lg-2">
            <button 
              className="btn w-100 fw-semibold" 
              style={{ background: "var(--primary)", color: "white" }}
              onClick={() => setModalOpen(true)}
            >
              <Plus size={16} className="me-1" />
              Nova
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-card p-0 overflow-hidden">
        {loading ? (
          <div className="p-5 text-center text-muted-foreground">Carregando movimentações...</div>
        ) : (
          <div className="table-responsive">
            <table className="table mb-0 align-middle">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">TIPO</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">PRODUTO</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">QUANTIDADE</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">DATA</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">RESPONSÁVEL</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-5 text-muted-foreground">
                      Nenhuma movimentação encontrada.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="border-bottom border-border">
                      <td className="px-4 py-3">
                        <div className="d-flex align-items-center gap-2">
                          {item.tipo === "compra" && <ShoppingCart size={16} className="text-emerald-500" />}
                          {item.tipo === "venda" && <TrendingDown size={16} className="text-blue-500" />}
                          {item.tipo === "consumo" && <Utensils size={16} className="text-rose-500" />}
                          {item.tipo === "perda" && <AlertTriangle size={16} className="text-orange-500" />}
                          <span className={`small fw-bold ${TIPO_COLORS[item.tipo]?.color || ""}`}>
                            {item.tipo_display}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 fw-semibold">{item.item_nome}</td>
                      <td className="px-3 py-3">{parseFloat(item.quantidade).toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {item.data_movimentacao ? new Date(item.data_movimentacao).toLocaleString("pt-BR") : "-"}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{item.responsavel_nome || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="d-flex align-items-center justify-content-between mt-3">
        <div className="text-muted-foreground small">Mostrando página {page} de {totalPages} ({totalCount} itens)</div>
        <div className="d-flex gap-2">
          <button className="btn btn-light btn-sm" disabled={page <= 1} onClick={() => fetchItems(page - 1)}>
            <ChevronLeft size={14} />
          </button>
          <button className="btn btn-light btn-sm" disabled={page >= totalPages} onClick={() => fetchItems(page + 1)}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <MovimentacaoFormModalWithHeader
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        categoria={modalCategoria || undefined}
        produtos={produtos}
      />
    </div>
  );
}