"use client";

<<<<<<< HEAD:frontend/src/components/dashboard/InsumosDashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
=======
import React, { useEffect, useMemo, useState, ReactNode } from "react";
>>>>>>> e4562cbbdbe73139f8623476b533fb875b608bf5:frontend/src/components/dashboard/ProdutosDashboard.tsx
import Link from "next/link";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Package,
  Plus,
  Search,
  Syringe,
  Wheat,
  Box,
  Activity,
  RefreshCw,
} from "lucide-react";
import { apiClient } from "@/services/api";
import { InventoryFormModal, type InventoryCategory } from "@/components/dashboard/InventoryFormModal";
import { Badge } from "@/components/ui/Badge";
import "@/app/home/estoque/estoque.css";

type InventoryItem = {
  id: string;
  nome: string;
  categoria: string;
  categoria_display: string;
  unidade_medida: string;
  estoque_atual: string;
  estoque_minimo: string;
  ativo: boolean;
};

type PaginatedResponse<T> = {
  count: number;
  total_pages: number;
  results: T[];
};

const CATEGORY_MODAL_MAP: Record<string, InventoryCategory> = {
  racao: "racao",
  nucleo: "nucleo",
  medicamento: "medicamento",
  vacina: "vacina",
  material: "material",
};

<<<<<<< HEAD:frontend/src/components/dashboard/InsumosDashboard.tsx
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
=======
const CATEGORY_ICONS: Record<string, ReactNode> = {
>>>>>>> e4562cbbdbe73139f8623476b533fb875b608bf5:frontend/src/components/dashboard/ProdutosDashboard.tsx
  racao: <Wheat size={16} />,
  nucleo: <Box size={16} />,
  medicamento: <Activity size={16} />,
  vacina: <Syringe size={16} />,
};

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ProdutosDashboard() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [modalConfig, setModalConfig] = useState<{ open: boolean; category?: InventoryCategory; initialData?: any }>({ open: false });
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const fetchItems = async (targetPage = 1) => {
    const accessToken = localStorage.getItem("access_token");

    if (!accessToken) {
      console.warn("Sem access_token ao buscar produtos.");
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data } = await apiClient.get<PaginatedResponse<InventoryItem>>("/inventory/items/", {
        params: { page: targetPage, page_size: 20 },
      });

      setItems(Array.isArray(data?.results) ? data.results : []);
      setTotalPages(data?.total_pages || 1);
      setTotalCount(data?.count || 0);
      setPage(targetPage);
    } catch (error: any) {
      console.error("Erro ao buscar produtos:", {
        message: error?.message,
        code: error?.code,
        status: error?.response?.status,
        response: error?.response?.data,
        requestUrl: error?.config?.url,
        baseURL: error?.config?.baseURL,
        params: error?.config?.params,
        headers: error?.config?.headers,
      });

      setItems([]);
      setTotalPages(1);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = async (query: string) => {
    setSearchTerm(query);
    if (query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);
    setShowSuggestions(true);
    try {
      const { data } = await apiClient.get("/inventory/items/all_items/", {
        params: { search: query, limit: 5 }
      });
      setSuggestions(data || []);
    } catch (err) {
      console.error("Erro ao buscar sugestões:", err);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleSelectSuggestion = (produto: any) => {
    setSearchTerm("");
    setShowSuggestions(false);
    setModalConfig({
      open: true,
      category: CATEGORY_MODAL_MAP[produto.categoria] || "outro",
      initialData: {
        nome: produto.name,
        categoria: produto.categoria,
        unidade_medida: produto.unidade_medida,
        marca: produto.marca,
        fabricante: produto.fabricante,
        especie_animal: produto.especie_animal,
        item_id: produto.id,
        ultimo_custo: produto.ultimo_custo
      }
    });
  };

  useEffect(() => {
    fetchItems(1);
  }, []);

  const handleSaveItems = async (newItems: any[]) => {
    const payload = newItems.map((row) => ({
      nome: row.nome,
      categoria: row.categoria,
      unidade_medida: row.unidade_medida,
      codigo: row.codigo || "",
      marca: row.marca || "",
      fabricante: row.fabricante || "",
      especie_animal: row.especie_animal || "",
      composicao: row.composicao || "",
      lote_numero: row.lote_numero || "",
      data_validade: row.data_validade || null,
      local_armazenamento: row.local_armazenamento || "",
      fornecedor: row.fornecedor || null,
      estoque_minimo: parseFloat(row.estoque_minimo) || 0,
      quantidade_inicial: parseFloat(row.quantidade_inicial) || 0,
      custo_unitario: parseFloat(row.custo_unitario) || 0,
      carencia_dias: parseInt(row.carencia_dias, 10) || 0,
      temperatura_minima: row.temperatura_minima ? parseFloat(row.temperatura_minima) : undefined,
      temperatura_maxima: row.temperatura_maxima ? parseFloat(row.temperatura_maxima) : undefined,
      doses_por_embalagem: row.doses_por_embalagem ? parseInt(row.doses_por_embalagem, 10) : undefined,
      peso_embalagem: row.peso_embalagem ? parseFloat(row.peso_embalagem) : undefined,
      volume_por_dose: row.volume_por_dose ? parseFloat(row.volume_por_dose) : undefined,
    }));
    await apiClient.post("/inventory/items/bulk_create/", payload);
    await fetchItems(1);
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = item.nome.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === "todas" || item.categoria === categoryFilter;
      const estoqueAtual = toNumber(item.estoque_atual);
      const estoqueMinimo = toNumber(item.estoque_minimo);
      const isBaixo = estoqueAtual <= estoqueMinimo;
      const matchesStatus =
        statusFilter === "todos" ||
        (statusFilter === "baixo" && isBaixo) ||
        (statusFilter === "normal" && !isBaixo);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [items, searchTerm, categoryFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const baixos = items.filter((item) => toNumber(item.estoque_atual) <= toNumber(item.estoque_minimo)).length;
    const totalEstoque = items.reduce((acc, item) => acc + toNumber(item.estoque_atual), 0);
    return { total, baixos, totalEstoque };
  }, [items]);

  return (
    <div className="inventory-container pb-5">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-4">
          <Link href="/home/estoque/resumo" className="text-decoration-none text-muted-foreground hover-text-primary">
            Estoque
          </Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Produtos</span>
        </nav>

        <h1 className="fw-black mb-1" style={{ fontSize: "2.25rem", letterSpacing: "-0.04em", color: "var(--foreground)" }}>
          Produtos
        </h1>
        <p className="mb-0 text-muted-foreground fw-medium">
          Controle completo dos produtos, rações, medicamentos e materiais da sua granja.
        </p>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12 col-md-4">
          <div className="dashboard-card p-4">
            <div className="text-muted-foreground small fw-bold text-uppercase mb-1">Itens Cadastrados</div>
            <div className="fw-black text-foreground" style={{ fontSize: "1.5rem" }}>{stats.total}</div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="dashboard-card p-4">
            <div className="text-muted-foreground small fw-bold text-uppercase mb-1">Estoque Total (unid.)</div>
            <div className="fw-black text-foreground" style={{ fontSize: "1.5rem" }}>{stats.totalEstoque.toFixed(2)}</div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="dashboard-card p-4">
            <div className="text-muted-foreground small fw-bold text-uppercase mb-1">Estoque Baixo</div>
            <div className="fw-black text-warning" style={{ fontSize: "1.5rem" }}>{stats.baixos}</div>
          </div>
        </div>
      </div>

      <div className="alert-banner mb-4">
        <div className="d-flex align-items-center gap-3">
          <AlertTriangle className="text-warning" size={22} />
          <div className="fw-bold text-orange-950">
            Atenção! Você possui {stats.baixos} {stats.baixos === 1 ? "item com estoque baixo" : "itens com estoque baixo"}.
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h3 className="fw-bold mb-0" style={{ fontSize: "1.1rem" }}>Cadastre novos produtos</h3>
        </div>
        <div className="row g-3">
          <div className="col-auto">
            <button
              className="btn h-100 px-4 d-flex flex-column align-items-center justify-content-center gap-2 rounded-xl border-0 shadow-sm"
              style={{ minWidth: "140px", background: "var(--primary)", color: "white" }}
              onClick={() => setModalConfig({ open: true })}
            >
              <Plus size={24} strokeWidth={3} />
              <span className="fw-bold">Novo produto</span>
            </button>
          </div>
          {[
            { key: "racao", title: "Ração / Grãos", desc: "Milho, soja, farelo...", color: "oklch(0.7 0.15 85)" },
            { key: "nucleo", title: "Núcleo / Premix", desc: "Núcleo, suplementos...", color: "oklch(0.65 0.16 230)" },
            { key: "medicamento", title: "Medicamentos", desc: "Antibióticos, vitaminas...", color: "oklch(0.7 0.18 25)" },
            { key: "vacina", title: "Vacinas", desc: "Vacinas, injetáveis...", color: "oklch(0.7 0.22 290)" },
            { key: "material", title: "Outros Materiais", desc: "Materiais e equipamentos...", color: "oklch(0.6 0.05 240)" },
          ].map((cat) => (
            <div key={cat.key} className="col">
              <div className="inv-category-card" onClick={() => setModalConfig({ open: true, category: CATEGORY_MODAL_MAP[cat.key] })}>
                <div
                  className="inv-category-icon"
                  style={{
                    background: `color-mix(in srgb, ${cat.color}, transparent 85%)`,
                    color: cat.color,
                  }}
                >
                  {CATEGORY_ICONS[cat.key] || <Package size={16} />}
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
          <div className="col-12 col-lg-4 position-relative">
            <div className="position-relative">
              <Search size={16} className="position-absolute text-muted-foreground" style={{ left: "12px", top: "50%", transform: "translateY(-50%)", zIndex: 10 }} />
              <input
                type="text"
                className="form-control ps-5 rounded-xl border-2 transition-all focus-ring"
                placeholder="Buscar ou cadastrar lote rápido..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              />
              {isLoadingSuggestions && (
                <RefreshCw size={14} className="position-absolute animate-spin text-primary" style={{ right: "12px", top: "50%", transform: "translateY(-50%)" }} />
              )}
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div className="position-absolute w-100 mt-2 bg-white border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2" style={{ zIndex: 1100 }}>
                <div className="p-2 bg-muted/10 text-xs fw-black text-muted-foreground text-uppercase border-bottom" style={{ letterSpacing: '0.05em' }}>
                  Resultados Encontrados
                </div>
                {suggestions.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 cursor-pointer hover-bg-primary/5 transition-colors d-flex align-items-center justify-content-between border-bottom last-border-0"
                    onClick={() => handleSelectSuggestion(p)}
                  >
                    <div className="d-flex align-items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted/20 text-muted-foreground">
                        <Package size={16} />
                      </div>
                      <div>
                        <div className="fw-bold text-foreground small">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.categoria_display} • {p.unidade_medida}</div>
                      </div>
                    </div>
                    <div className="badge bg-primary/10 text-primary text-xs rounded-pill px-2 py-1">
                      Selecionar
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="col-6 col-lg-3">
            <select className="form-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="todas">Todas as categorias</option>
              <option value="racao">Ração / Grãos</option>
              <option value="nucleo">Núcleo / Premix</option>
              <option value="medicamento">Medicamento</option>
              <option value="vacina">Vacina</option>
              <option value="material">Material</option>
            </select>
          </div>
          <div className="col-6 col-lg-3">
            <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="todos">Todos os status</option>
              <option value="normal">Normal</option>
              <option value="baixo">Estoque baixo</option>
            </select>
          </div>
          <div className="col-12 col-lg-2">
            <button className="btn w-100 fw-semibold" style={{ background: "var(--primary)", color: "white" }} onClick={() => setModalConfig({ open: true })}>
              <Plus size={16} className="me-1" />
              Novo
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-card p-0 overflow-hidden">
        {loading ? (
          <div className="p-5 text-center text-muted-foreground">Carregando produtos...</div>
        ) : (
          <div className="table-responsive">
            <table className="table mb-0 align-middle">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">INSUMO</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">CATEGORIA</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">ESTOQUE ATUAL</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">UNIDADE</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">ESTOQUE MÍNIMO</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-5 text-muted-foreground">
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const baixo = toNumber(item.estoque_atual) <= toNumber(item.estoque_minimo);
                    return (
                      <tr key={item.id} className="border-bottom border-border">
                        <td className="px-4 py-3 fw-semibold">{item.nome}</td>
                        <td className="px-3 py-3">
                          <Badge variant="default" className="text-xs">{item.categoria_display}</Badge>
                        </td>
                        <td className="px-3 py-3">{toNumber(item.estoque_atual).toFixed(2)}</td>
                        <td className="px-3 py-3">{item.unidade_medida}</td>
                        <td className="px-3 py-3">{toNumber(item.estoque_minimo).toFixed(2)}</td>
                        <td className="px-3 py-3">
                          <Badge variant={baixo ? "warning" : "success"} className="text-xs">
                            {baixo ? "Baixo" : "Normal"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
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

      <InventoryFormModal
        isOpen={modalConfig.open}
        onClose={() => setModalConfig({ open: false })}
        category={modalConfig.category}
        onSave={handleSaveItems}
        initialData={modalConfig.initialData}
      />
    </div>
  );
}

