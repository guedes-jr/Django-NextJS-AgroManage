"use client";

import { useState, useMemo, useEffect } from "react";
import { InventoryFormModal, type InventoryCategory } from "@/components/dashboard/InventoryFormModal";
import { QuickMovementModal } from "@/components/dashboard/QuickMovementModal";
import { apiClient } from "@/services/api";
import Link from "next/link";
import {
  ChevronRight,
  Package,
  Search,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Settings,
  Plus,
  Wheat,
  Activity,
  Droplets,
  Syringe,
  Box,
  Wallet,
  Calendar,
  Warehouse,
  History,
  FileText,
  RefreshCw,
  Truck,
  Bell,
  ArrowDownLeft
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line
} from "recharts";
import { Badge } from "@/components/ui/Badge";
import "@/app/home/estoque/estoque.css";

const COLORS = ["oklch(0.65 0.15 145)", "oklch(0.55 0.16 230)", "oklch(0.78 0.15 85)", "oklch(0.7 0.18 290)", "oklch(0.8 0.05 240)"];

export function InventoryDashboard() {
  const [modalConfig, setModalConfig] = useState<{ open: boolean; category?: InventoryCategory }>({ open: false });
  const [quickModal, setQuickModal] = useState<{ open: boolean; type: "in" | "out" }>({ open: false, type: "in" });
  const [stats, setStats] = useState({ total_items: 0, total_value: "0", total_qty: 0, estoque_baixo: 0, itens_vencidos: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [period, setPeriod] = useState("30");
  const [chartType, setChartType] = useState("area");
  const [chartFilter, setChartFilter] = useState<"all" | "entrada" | "saida">("all");
  const [chartData, setChartData] = useState<{ day: string; entrada: number; saida: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [lowStockItems, setLowStockItems] = useState<{ id: string; nome: string; estoque_atual: string; estoque_minimo: string; unidade_medida: string }[]>([]);
  const [recentMovements, setRecentMovements] = useState<{
    id: number;
    tipo: string;
    item: {
      nome: string;
    };
    quantidade: string;
    custo_total?: string | null;
    data_movimentacao: string;
    observacao?: string | null;
  }[]>([]);
  const [categoryData, setCategoryData] = useState<{ name: string; value: number }[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);

  const periodOptions = [
    { value: "5", label: "Últimos 5 dias" },
    { value: "15", label: "Últimos 15 dias" },
    { value: "30", label: "Últimos 30 dias" },
    { value: "90", label: "Últimos 3 meses" },
    { value: "180", label: "Últimos 6 meses" },
    { value: "365", label: "Últimos 12 meses" },
  ];

  const chartTypeOptions = [
    { value: "area", label: "Área" },
    { value: "bar", label: "Barras" },
    { value: "line", label: "Linha" },
  ];

  const chartFilterOptions = [
    { value: "all", label: "Todos" },
    { value: "entrada", label: "Apenas Entradas" },
    { value: "saida", label: "Apenas Saídas" },
  ];

  const loadStats = async () => {
    try {
      setStatsLoading(true);
      const { data } = await apiClient.get("/inventory/items/stats/");
      setStats(data);
    } catch (error) {
      console.error("Erro ao buscar estatísticas:", error);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchData = async () => {
    await loadStats();

    try {
      const { data } = await apiClient.get("/inventory/movimentacoes/", {
        params: { page_size: 5 },
      });

      const formatted = (data.results || []).map((m: any) => ({
        ...m,
        quantidade: parseFloat(m.quantidade).toLocaleString("pt-BR", {
          maximumFractionDigits: 2,
        }),
        data_movimentacao: new Date(m.data_movimentacao).toLocaleString("pt-BR"),
      }));

      setRecentMovements(formatted);
    } catch (error) {
      console.error("Erro ao buscar movimentações:", error);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    const fetchChartData = async () => {
      setChartLoading(true);
      try {
        const { data } = await apiClient.get("/inventory/movimentacoes/stats/", {
          params: { period },
        });
        setChartData(data.chart_data || []);
      } catch (error) {
        console.error("Erro ao buscar dati do gráfico:", error);
      } finally {
        setChartLoading(false);
      }
    };
    fetchChartData();
  }, [period, chartType, chartFilter]);

  useEffect(() => {
    const fetchLowStock = async () => {
      try {
        const { data } = await apiClient.get("/inventory/items/low_stock/");
        setLowStockItems(data || []);
      } catch (error) {
        console.error("Erro ao buscar itens com estoque baixo:", error);
      }
    };
    fetchLowStock();
  }, []);

  useEffect(() => {
    const fetchRecentMovements = async () => {
      try {
        const { data } = await apiClient.get("/inventory/movimentacoes/", {
          params: { page_size: 5 },
        });
        const formatted = (data.results || []).map((m: any) => ({
          ...m,
          quantidade: parseFloat(m.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
          data_movimentacao: new Date(m.data_movimentacao).toLocaleString("pt-BR"),
        }));
        setRecentMovements(formatted);
      } catch (error) {
        console.error("Erro ao buscar movimentações:", error);
      }
    };
    fetchRecentMovements();
  }, []);

  useEffect(() => {
    const fetchCategoryData = async () => {
      try {
        const { data } = await apiClient.get("/inventory/items/by_category/");
        setCategoryData(data || []);
      } catch (error) {
        console.error("Erro ao buscar dados de categoria:", error);
      }
    };
    fetchCategoryData();
  }, []);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const { data } = await apiClient.get("/inventory/alertas/");
        setActiveAlerts(Array.isArray(data) ? data.slice(0, 5) : []);
      } catch (error) {
        console.error("Erro ao buscar alertas:", error);
      }
    };
    fetchAlerts();
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
    await loadStats();
  };

  return (
    <div className="inventory-container pb-5">
      {/* Header */}
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-4">
          <Link href="/home" className="text-decoration-none text-muted-foreground hover-text-primary">Estoque</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Resumo</span>
        </nav>

        <div className="row align-items-end g-4">
          <div className="col">
            <h1 className="fw-black mb-1" style={{ fontSize: '2.25rem', letterSpacing: '-0.04em', color: "var(--foreground)" }}>
              Estoque
            </h1>
            <p className="mb-0 text-muted-foreground fw-medium">
              Controle completo dos produtos, rações, medicamentos e materiais da sua granja.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="row g-4 mb-4">
        <div className="col-12 col-md-3">
          <div className="dashboard-card p-4">
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-xl d-flex align-items-center justify-content-center" style={{ width: 44, height: 44, background: 'color-mix(in srgb, oklch(0.65 0.15 145), transparent 90%)', color: 'oklch(0.65 0.15 145)' }}>
                <Wallet />
              </div>
              <div className="flex-grow-1">
                <div className="text-muted-foreground small fw-bold text-uppercase mb-1" style={{ letterSpacing: '0.02em', fontSize: '0.65rem' }}>VALOR TOTAL EM ESTOQUE</div>
                <div className="fw-black text-foreground" style={{ fontSize: '1.25rem' }}>{statsLoading ? "..." : `R$ ${(parseFloat(stats.total_value) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}</div>
                <div className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>Valor de custo total</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-3">
          <div className="dashboard-card p-4">
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-xl d-flex align-items-center justify-content-center" style={{ width: 44, height: 44, background: 'color-mix(in srgb, oklch(0.65 0.16 240), transparent 90%)', color: 'oklch(0.65 0.16 240)' }}>
                <Package />
              </div>
              <div className="flex-grow-1">
                <div className="text-muted-foreground small fw-bold text-uppercase mb-1" style={{ letterSpacing: '0.02em', fontSize: '0.65rem' }}>ITENS CADASTRADOS</div>
                <div className="fw-black text-foreground" style={{ fontSize: '1.25rem' }}>{statsLoading ? "..." : stats.total_items}</div>
                <div className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>Todos os itens ativos</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-3">
          <div className="dashboard-card p-4">
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-xl d-flex align-items-center justify-content-center" style={{ width: 44, height: 44, background: 'color-mix(in srgb, oklch(0.7 0.18 85), transparent 90%)', color: 'oklch(0.7 0.18 85)' }}>
                <AlertTriangle />
              </div>
              <div className="flex-grow-1">
                <div className="text-muted-foreground small fw-bold text-uppercase mb-1" style={{ letterSpacing: '0.02em', fontSize: '0.65rem' }}>ESTOQUE BAIXO</div>
                <div className="fw-black text-foreground" style={{ fontSize: '1.25rem' }}>{statsLoading ? "..." : stats.estoque_baixo}</div>
                <div className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>Itens abaixo do mínimo</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-3">
          <div className="dashboard-card p-4">
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-xl d-flex align-items-center justify-content-center" style={{ width: 44, height: 44, background: 'color-mix(in srgb, oklch(0.7 0.22 25), transparent 90%)', color: 'oklch(0.7 0.22 25)' }}>
                <Calendar />
              </div>
              <div className="flex-grow-1">
                <div className="text-muted-foreground small fw-bold text-uppercase mb-1" style={{ letterSpacing: '0.02em', fontSize: '0.65rem' }}>ITENS VENCIDOS</div>
                <div className="fw-black text-foreground" style={{ fontSize: '1.25rem' }}>{statsLoading ? "..." : stats.itens_vencidos}</div>
                <div className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>Requer atenção imediata</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      {activeAlerts.length > 0 && (
        <div className="alert-banner mb-5">
          <div className="d-flex align-items-center gap-3">
            <AlertTriangle className="text-warning" size={24} />
            <div className="fw-bold text-orange-950">
              Atenção! Existem {activeAlerts.length} alertas pendentes.
              O mais crítico: "{activeAlerts[0].titulo}"
            </div>
          </div>
          <Link href="/home/estoque/alertas" className="btn btn-sm btn-white border border-warning/30 bg-white shadow-sm px-4 fw-bold text-decoration-none">Ver todos os alertas</Link>
        </div>
      )}

      {/* Main Grid */}
      <div className="row g-4 mb-5">
        <div className="col-12 col-xl-8">
          <div className="dashboard-card p-4">
            <div className="d-flex justify-content-between align-items-start mb-4">
              <div>
                <h3 className="fw-bold mb-1" style={{ fontSize: '1.1rem' }}>Movimentações (Entradas e Saídas)</h3>
                <p className="text-muted-foreground small">Resumo das movimentações</p>
              </div>
              <div className="d-flex gap-2">
                <select
                  className="form-select form-select-sm w-auto border-border bg-transparent small fw-bold"
                  value={chartFilter}
                  onChange={(e) => setChartFilter(e.target.value as any)}
                >
                  {chartFilterOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  className="form-select form-select-sm w-auto border-border bg-transparent small fw-bold"
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value)}
                >
                  {chartTypeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  className="form-select form-select-sm w-auto border-border bg-transparent small fw-bold"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  {periodOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ height: '300px', width: '100%' }}>
              <ResponsiveContainer>
                {chartType === "area" ? (
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorEntrada" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.65 0.15 145)" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="oklch(0.65 0.15 145)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorSaida" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.6 0.18 25)" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="oklch(0.6 0.18 25)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-elegant)' }} />
                    {(chartFilter === "all" || chartFilter === "entrada") && <Area type="monotone" dataKey="entrada" stroke="oklch(0.65 0.15 145)" strokeWidth={3} fillOpacity={1} fill="url(#colorEntrada)" name="Entradas" />}
                    {(chartFilter === "all" || chartFilter === "saida") && <Area type="monotone" dataKey="saida" stroke="oklch(0.6 0.18 25)" strokeWidth={3} fillOpacity={1} fill="url(#colorSaida)" name="Saídas" />}
                  </AreaChart>
                ) : chartType === "bar" ? (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-elegant)' }} />
                    {(chartFilter === "all" || chartFilter === "entrada") && <Bar dataKey="entrada" fill="oklch(0.65 0.15 145)" name="Entradas" radius={[4, 4, 0, 0]} />}
                    {(chartFilter === "all" || chartFilter === "saida") && <Bar dataKey="saida" fill="oklch(0.6 0.18 25)" name="Saídas" radius={[4, 4, 0, 0]} />}
                  </BarChart>
                ) : (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-elegant)' }} />
                    {(chartFilter === "all" || chartFilter === "entrada") && <Line type="monotone" dataKey="entrada" stroke="oklch(0.65 0.15 145)" strokeWidth={3} name="Entradas" />}
                    {(chartFilter === "all" || chartFilter === "saida") && <Line type="monotone" dataKey="saida" stroke="oklch(0.6 0.18 25)" strokeWidth={3} name="Saídas" />}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            <div className="row g-4 mt-2">
              {(chartFilter === "all" || chartFilter === "entrada") && (
                <div className="col-12 col-md-6">
                  <div className="p-3 rounded-xl border border-border bg-emerald-50/10">
                    <div className="text-muted-foreground small fw-bold mb-1">Entradas</div>
                    <div className="d-flex align-items-baseline gap-2">
                      <span className="fw-black fs-4">{chartLoading ? "..." : `${chartData.reduce((a, b) => a + (b.entrada || 0), 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} unid.`}</span>
                    </div>
                  </div>
                </div>
              )}
              {(chartFilter === "all" || chartFilter === "saida") && (
                <div className="col-12 col-md-6">
                  <div className="p-3 rounded-xl border border-border bg-rose-50/10">
                    <div className="text-muted-foreground small fw-bold mb-1">Saídas</div>
                    <div className="d-flex align-items-baseline gap-2">
                      <span className="fw-black fs-4">{chartLoading ? "..." : `${chartData.reduce((a, b) => a + (b.saida || 0), 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} unid.`}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <div className="dashboard-card p-4 h-100 flex-column d-flex">
            <div className="mb-4">
              <h3 className="fw-bold mb-1" style={{ fontSize: '1.1rem' }}>Itens com Estoque Baixo</h3>
              <p className="text-muted-foreground small">Itens que estão abaixo do estoque mínimo definido</p>
            </div>

            <div className="flex-grow-1 overflow-auto pe-1">
              {lowStockItems.length === 0 ? (
                <div className="text-center text-muted-foreground py-4">Nenhum item com estoque baixo</div>
              ) : (
                lowStockItems.map((item, i) => (
                  <div key={item.id || i} className="stock-item-row">
                    <div className="d-flex align-items-center gap-3">
                      <div className="rounded-lg d-flex align-items-center justify-content-center p-2" style={{ background: 'var(--inv-accent-soft)', color: 'var(--primary)' }}>
                        <Box size={18} />
                      </div>
                      <div className="flex-grow-1">
                        <div className="fw-bold small text-foreground">{item.nome}</div>
                        <div className="d-flex gap-3 mt-1">
                          <div className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>Esq. atual: <span className="fw-bold text-dark">{parseFloat(item.estoque_atual).toLocaleString("pt-BR")} {item.unidade_medida}</span></div>
                          <div className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>Mínimo: <span className="fw-bold text-dark">{parseFloat(item.estoque_minimo).toLocaleString("pt-BR")} {item.unidade_medida}</span></div>
                        </div>
                      </div>
                      <span className="badge-status atencao">Atenção</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button className="btn btn-sm btn-outline-secondary border-border w-100 mt-4 fw-bold py-2">Ver todos os itens com estoque baixo</button>
          </div>
        </div>
      </div>

      {/* Row 2: Recent and Categories */}
      <div className="row g-4 mb-5">
        <div className="col-12 col-xl-8">
          <div className="dashboard-card p-0 h-100 overflow-hidden">
            <div className="p-4 border-bottom border-border">
              <h3 className="fw-bold mb-1" style={{ fontSize: '1.1rem' }}>Últimas Movimentações</h3>
              <p className="text-muted-foreground small mb-0">Movimentações mais recentes do estoque</p>
            </div>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">TIPO</th>
                    <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">PRODUTO</th>
                    <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">QUANTIDADE</th>
                    <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">VALOR</th>
                    <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">DATA/HORA</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMovements.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-4 text-muted-foreground">Nenhuma movimentação encontrada</td>
                    </tr>
                  ) : (
                    recentMovements.map((move, i) => (
                      <tr key={move.id || i} className="border-bottom border-border last-border-0">
                        <td className="px-4 py-3">
                          <div className="d-flex align-items-center gap-2">
                            {move.tipo === 'entrada' ? (
                              <ArrowUpRight size={16} className="text-emerald-500" />
                            ) : (
                              <ArrowDownRight size={16} className="text-rose-500" />
                            )}
                            <span className={`small fw-bold ${move.tipo === 'entrada' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {move.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 small fw-bold text-foreground">
                          <div className="d-flex align-items-center gap-2">
                            {move.item?.nome}
                            {(move.observacao && (move.observacao.includes("produção de") || move.observacao.includes("Entrada por produção"))) && (
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
                                Ração - {new Date(move.data_movimentacao).toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 small fw-bold">{move.quantidade}</td>
                        <td className="px-4 py-3 small text-muted-foreground">
                          {move.custo_total ? `R$ ${parseFloat(move.custo_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-"}
                        </td>
                        <td className="px-4 py-3 small text-muted-foreground fw-medium">{move.data_movimentacao}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-muted/10 border-top border-border text-center">
              <button className="btn btn-sm btn-link text-muted-foreground small text-decoration-none fw-bold">Ver todas as movimentações</button>
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <div className="dashboard-card p-4 h-100">
            <div className="mb-4">
              <h3 className="fw-bold mb-1" style={{ fontSize: '1.1rem' }}>Estoque por Categoria</h3>
              <p className="text-muted-foreground small">Distribuição do valor do estoque por categoria</p>
            </div>

            <div style={{ height: '220px', width: '100%' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={categoryData}
                    innerRadius={60}
                    outerRadius={90}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-elegant)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 inv-chart-legend">
              {categoryData.length === 0 ? (
                <div className="text-center text-muted-foreground py-4">Sem dados</div>
              ) : (
                categoryData.map((cat, i) => (
                  <div key={i} className="legend-item">
                    <div className="d-flex align-items-center gap-2">
                      <div className="rounded-circle" style={{ width: 10, height: 10, background: COLORS[i % COLORS.length] }}></div>
                      <span className="fw-medium text-muted-foreground">{cat.name}</span>
                    </div>
                    <span className="fw-bold text-foreground">R$ {cat.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                ))
              )}
            </div>

            <button className="btn btn-sm btn-outline-secondary border-border w-100 mt-4 fw-bold py-2">Ver relatório completo</button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <h3 className="fw-bold mb-3 mt-5" style={{ fontSize: '1.1rem' }}>Ações Rápidas</h3>
      <div className="row g-3">
        {[
          { title: "Nova Entrada", desc: "Registrar entrada no estoque", icon: <ArrowUpRight />, color: "oklch(0.65 0.15 145)" },
          { title: "Nova Saída", desc: "Registrar saída no estoque", icon: <ArrowDownRight />, color: "oklch(0.6 0.18 25)" },
          { title: "Transferência", desc: "Transferir entre setores", icon: <RefreshCw />, color: "oklch(0.7 0.15 85)" },
          { title: "Inventário", desc: "Realizar inventário físico", icon: <History />, color: "oklch(0.65 0.16 230)" },
          { title: "Relatórios", desc: "Ver relatórios de estoque", icon: <FileText />, color: "oklch(0.6 0.05 240)" },
        ].map((action, i) => (
          <div key={i} className="col">
            <button 
              className="inv-quick-action"
              onClick={() => {
                if (action.title === "Nova Entrada") setQuickModal({ open: true, type: "in" });
                else if (action.title === "Nova Saída") setQuickModal({ open: true, type: "out" });
              }}
            >
              <div className="qa-icon-sm" style={{ background: `color-mix(in srgb, ${action.color}, transparent 85%)`, color: action.color }}>
                {action.icon}
              </div>
              <div className="text-start">
                <div className="fw-bold small text-foreground">{action.title}</div>
                <div className="text-muted-foreground text-xs" style={{ fontSize: '0.65rem' }}>{action.desc}</div>
              </div>
            </button>
          </div>
        ))}
      </div>

      <QuickMovementModal
        isOpen={quickModal.open}
        onClose={() => {
          setQuickModal({ ...quickModal, open: false });
          fetchData();
        }}
        type={quickModal.type}
      />

      <InventoryFormModal
        isOpen={modalConfig.open}
        onClose={() => setModalConfig({ open: false })}
        category={modalConfig.category}
        onSave={handleSaveItems}
      />
    </div>
  );
}
