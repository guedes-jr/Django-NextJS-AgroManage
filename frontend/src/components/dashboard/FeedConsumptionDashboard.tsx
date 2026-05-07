"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  ChevronRight, 
  Plus, 
  Search, 
  History, 
  Trash2, 
  Calendar, 
  Scale, 
  DollarSign, 
  TrendingDown, 
  AlertCircle,
  Clock,
  Filter,
  Info,
  Users,
  Lock
} from "lucide-react";
import Link from "next/link";
import { apiClient } from "@/services/api";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip 
} from "recharts";

interface ConsumoStats {
  total_qty: number;
  total_cost: number;
  avg_cost_kg: number;
  by_feed: { name: string; value: number }[];
  latest_entries: any[];
}

interface Category {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface FeedConsumptionDashboardProps {
  species?: string;
  showHeader?: boolean;
  initialCategory?: string;
  hideInternalTabs?: boolean;
  categories?: Category[];
  showForm?: boolean;
  onToggleForm?: () => void;
  onSubmitSuccess?: () => void;
}

const COLORS = ["#10b981", "#8b5cf6", "#f59e0b", "#3b82f6", "#ec4899"];

const DEFAULT_CATEGORIES: Category[] = [
  { id: "lotes", label: "Lotes", icon: "🐖" },
  { id: "matrizes", label: "Matrizes", icon: "🐖" },
  { id: "marras", label: "Marrás", icon: "🐖" },
  { id: "reprodutores", label: "Reprodutores", icon: "🐖" },
];

export function FeedConsumptionDashboard({ 
  species, 
  showHeader = true, 
  initialCategory = "lotes",
  hideInternalTabs = false,
  categories = DEFAULT_CATEGORIES,
  showForm: externalShowForm,
  onToggleForm,
  onSubmitSuccess
}: FeedConsumptionDashboardProps = {}) {
  const [activeCategory, setActiveCategory] = useState(initialCategory);

  // Sincronizar categoria ativa com o prop inicial (vindo do pai/tabs)
  useEffect(() => {
    setActiveCategory(initialCategory);
  }, [initialCategory]);

  const [internalShowForm, setInternalShowForm] = useState(false);
  
  const showForm = externalShowForm !== undefined ? externalShowForm : internalShowForm;
  
  // Stats state
  const [stats, setStats] = useState<ConsumoStats | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [batches, setBatches] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    lote_animal: "",
    item_estoque: "",
    data_inicio: new Date().toISOString().split('T')[0],
    data_fim: new Date().toISOString().split('T')[0],
    quantidade: 0,
    tipo_registro: "total_periodo",
    observacao: ""
  });

  useEffect(() => {
    fetchData();
  }, [species, activeCategory]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const mapping: Record<string, string> = {
        matrizes: "Matriz",
        vacas: "Matriz",
        reprodutores: "Cachaço",
        touros: "Touro",
        bezerros: "Bezerro",
        marras: "Marrá",
      };
      
      const categoryParam = mapping[activeCategory] || activeCategory;
      const params = new URLSearchParams();
      if (species) params.append("especie", species);
      if (categoryParam && categoryParam !== "lotes") params.append("categoria", categoryParam);

      const [resStats, resBatches, resItems] = await Promise.all([
        apiClient.get(`/inventory/consumos/stats/?${params.toString()}`),
        apiClient.get(`/livestock/batches/?${species ? 'especie=' + species : ''}`),
        apiClient.get("/inventory/items/all_items/?categoria=racao")
      ]);
      setStats(resStats.data);
      setBatches(resBatches.data.results || resBatches.data || []);
      setInventoryItems(resItems.data || []);
    } catch (err) {
      console.error("Erro ao buscar dados do consumo:", err);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar lotes de acordo com a aba/categoria ativa
  const filteredBatches = useMemo(() => {
    if (!activeCategory || activeCategory === "lotes") {
      // Para "lotes", mostramos tudo que não é matriz/reprodutor ou o que tem "Lote" no nome
      return batches.filter(b => 
        !["matriz", "vaca", "touro", "cachaço"].includes(b.category?.toLowerCase()) || 
        b.category?.toLowerCase().includes("lote") ||
        b.category?.toLowerCase().includes("terminação")
      );
    }
    
    const mapping: Record<string, string[]> = {
      matrizes: ["matriz", "vaca"],
      vacas: ["matriz", "vaca"],
      reprodutores: ["cachaço", "reprodutor", "touro"],
      touros: ["touro", "cachaço"],
      bezerros: ["bezerro", "pinto", "leitão"],
      marras: ["marrá", "novilha"],
    };

    const targetCategories = mapping[activeCategory] || [activeCategory];
    
    return batches.filter(b => 
      targetCategories.some(cat => b.category?.toLowerCase().includes(cat))
    );
  }, [batches, activeCategory]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post("/inventory/consumos/", formData);
      alert("Lançamento de consumo registrado com sucesso!");
      if (onToggleForm) onToggleForm();
      else setInternalShowForm(false);
      
      fetchData();
      if (onSubmitSuccess) onSubmitSuccess();
    } catch (err: any) {
      alert(err.response?.data?.error || "Erro ao salvar lançamento.");
    }
  };

  if (loading && !stats) return <div className="p-5 text-center">Carregando...</div>;

  return (
    <div className="pb-5">
      {/* Header (Optional) */}
      {showHeader && (
        <div className="d-flex align-items-center justify-content-between mb-4">
          <div>
            <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-2">
              <Link href="/home" className="text-decoration-none text-muted-foreground">Gestão Agro</Link>
              <ChevronRight size={14} />
              <span className="fw-semibold text-foreground">Consumo de Ração</span>
            </nav>
            <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>Consumo de Ração</h1>
            <p className="text-muted-foreground mb-0">Lance e acompanhe o consumo de ração dos animais.</p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-light fw-semibold d-flex align-items-center gap-2 border-border shadow-sm">
              <History size={18} /> Histórico de Consumo
            </button>
            <button 
              onClick={() => onToggleForm ? onToggleForm() : setInternalShowForm(!internalShowForm)}
              className="btn btn-primary fw-bold d-flex align-items-center gap-2 shadow-sm border-0"
              style={{ background: "var(--primary)" }}
            >
              <Plus size={18} /> Novo Lançamento
            </button>
          </div>
        </div>
      )}

      {/* Tabs (Estilo Imagem) */}

      {!hideInternalTabs && (
        <div className="d-flex align-items-center gap-2 mb-4 p-1 bg-muted/30 rounded-2xl w-fit border border-border/50">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-xl fw-bold d-flex align-items-center gap-2 transition-all border-0 ${
                activeCategory === cat.id 
                  ? "bg-white text-primary shadow-sm" 
                  : "bg-transparent text-muted-foreground hover-bg-white/50"
              }`}
              style={{ fontSize: '0.9rem' }}
            >
              <span>{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>
      )}




      <div className="row g-4">
        {/* Main Content */}
        <div className="col-12 col-xl-9">
          {showForm && (
            <div className="dashboard-card p-4 mb-4 border animate-fade-in shadow-sm">
              <h5 className="fw-bold mb-4 text-dark">Novo Lançamento de Consumo</h5>
              <form onSubmit={handleSave}>
                <div className="row g-3 mb-4">
                  {/* Linha 1 */}
                  <div className="col-12 col-md-3">
                    <label className="small fw-bold mb-1 text-dark">Selecionar Lote</label>
                    <div className="input-group">
                      <span className="input-group-text bg-white border-end-0 text-muted"><Users size={16} /></span>
                      <select 
                        className="form-select border-start-0 ps-0" 
                        required 
                        value={formData.lote_animal}
                        onChange={e => setFormData({...formData, lote_animal: e.target.value})}
                      >
                        <option value="">Selecione o lote...</option>
                        {filteredBatches.map(b => (
                          <option key={b.id} value={b.id}>{b.batch_code} - {b.name || b.category}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="col-12 col-md-3">
                    <label className="small fw-bold mb-1 text-dark">Período do Consumo</label>
                    <div className="d-flex align-items-center gap-2">
                      <div className="input-group input-group-sm">
                        <span className="input-group-text bg-white border-end-0 text-muted" style={{fontSize: '0.7rem'}}>DE</span>
                        <input 
                          type="date" 
                          className="form-control border-start-0 ps-1 text-muted" 
                          style={{fontSize: '0.85rem'}}
                          value={formData.data_inicio}
                          onChange={e => setFormData({...formData, data_inicio: e.target.value})}
                        />
                      </div>
                      <div className="input-group input-group-sm">
                        <span className="input-group-text bg-white border-end-0 text-muted" style={{fontSize: '0.7rem'}}>ATÉ</span>
                        <input 
                          type="date" 
                          className="form-control border-start-0 ps-1 text-muted" 
                          style={{fontSize: '0.85rem'}}
                          value={formData.data_fim}
                          onChange={e => setFormData({...formData, data_fim: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="col-12 col-md-3">
                    <label className="small fw-bold mb-1 text-dark">Tipo de Ração</label>
                    <div className="input-group">
                      <span className="input-group-text bg-white border-end-0 text-muted"><Scale size={16} /></span>
                      <select 
                        className="form-select border-start-0 ps-0" 
                        required
                        value={formData.item_estoque}
                        onChange={e => setFormData({...formData, item_estoque: e.target.value})}
                      >
                        <option value="">Selecione a ração...</option>
                        {inventoryItems.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.nome} (Saldo: {parseFloat(item.estoque_atual).toLocaleString("pt-BR")} {item.unidade_display})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="col-12 col-md-3">
                    <label className="small fw-bold mb-1 text-dark">Forma de Registro</label>
                    <select 
                      className="form-select"
                      value={formData.tipo_registro}
                      onChange={e => setFormData({...formData, tipo_registro: e.target.value})}
                    >
                      <option value="total_periodo">Total no Período</option>
                      <option value="diario">Consumo Diário</option>
                    </select>
                    <div className="small text-muted mt-1" style={{fontSize: '0.7rem'}}>Informe o total consumido no período selecionado.</div>
                  </div>
                </div>

                <div className="row g-3 mb-4">
                  {/* Linha 2 */}
                  <div className="col-12 col-md-4">
                    <label className="small fw-bold mb-1 text-dark">Quantidade Consumida (total)</label>
                    <div className="input-group">
                      <input 
                        type="number" 
                        step="0.01" 
                        className="form-control fw-bold text-dark border-end-0" 
                        required
                        value={formData.quantidade}
                        onChange={e => setFormData({...formData, quantidade: Number(e.target.value)})}
                      />
                      <span className="input-group-text bg-white fw-bold text-muted border-start-0">kg</span>
                    </div>
                    <div className="small text-success mt-1 fw-medium" style={{fontSize: '0.75rem'}}>
                      <Info size={12} className="me-1" /> Período de 7 dias
                    </div>
                  </div>

                  <div className="col-12 col-md-4">
                    <label className="small fw-bold mb-1 text-dark">Custo por kg (R$)</label>
                    <div className="input-group">
                      <span className="input-group-text bg-light text-muted fw-bold">R$</span>
                      <input 
                        type="text" 
                        className="form-control bg-light text-muted fw-bold" 
                        value="2,85"
                        readOnly
                      />
                      <span className="input-group-text bg-light text-muted"><Lock size={14} /></span>
                    </div>
                    <div className="small text-muted mt-1" style={{fontSize: '0.7rem'}}>Valor obtido automaticamente do estoque.</div>
                  </div>

                  <div className="col-12 col-md-4">
                    <label className="small fw-bold mb-1 text-dark">Custo Total (R$)</label>
                    <div className="input-group">
                      <span className="input-group-text bg-light text-muted fw-bold">R$</span>
                      <input 
                        type="text" 
                        className="form-control bg-light text-muted fw-bold" 
                        value="598,50"
                        readOnly
                      />
                      <span className="input-group-text bg-light text-muted"><Lock size={14} /></span>
                    </div>
                    <div className="small text-muted mt-1" style={{fontSize: '0.7rem'}}>Calculado automaticamente pelo sistema.</div>
                  </div>
                </div>

                <div className="d-flex align-items-center justify-content-between">
                  <div className="alert alert-primary mb-0 py-2 px-3 d-flex align-items-center gap-2 border-0 bg-primary/10 text-primary w-100 me-3" style={{fontSize: '0.85rem'}}>
                    <Info size={16} /> O custo da ração é definido no cadastro de estoque e não pode ser alterado aqui.
                  </div>
                  <button type="submit" className="btn btn-primary px-4 fw-bold flex-shrink-0 shadow-sm border-0" style={{ background: "#054f31" }}>
                    Salvar Lançamento
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* History Table */}
          <div className="dashboard-card p-4 border shadow-sm">
            <h5 className="fw-bold mb-4 text-dark">Histórico de Consumo</h5>
            
            <div className="row g-2 mb-4">
              <div className="col-12 col-md-3">
                <label className="small text-muted mb-1" style={{fontSize: '0.75rem'}}>Período</label>
                <select className="form-select form-select-sm text-dark bg-white">
                  <option>Últimos 30 dias</option>
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="small text-muted mb-1" style={{fontSize: '0.75rem'}}>Tipo de Registro</label>
                <select className="form-select form-select-sm text-dark bg-white">
                  <option>Todos</option>
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="small text-muted mb-1" style={{fontSize: '0.75rem'}}>Tipo de Ração</label>
                <select className="form-select form-select-sm text-dark bg-white">
                  <option>Todos</option>
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="small text-muted mb-1" style={{fontSize: '0.75rem'}}>Categoria</label>
                <div className="d-flex gap-2">
                  <select className="form-select form-select-sm text-dark bg-white flex-grow-1">
                    <option>Todos</option>
                  </select>
                  <button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1 bg-white flex-shrink-0 px-3">
                    <Filter size={14} /> Filtros
                  </button>
                </div>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead className="bg-white">
                  <tr>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>Data Inicial</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>Data Final</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>Categoria</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>Identificação</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>Local / Baia</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>Ração</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>Qtd. Consumida (kg)</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>Custo por kg (R$)</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>Custo Total (R$)</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>Forma de Registro</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>Usuário</th>
                    <th className="border-bottom"></th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.latest_entries.map((entry: any) => (
                    <tr key={entry.id}>
                      <td className="fw-medium text-dark">{new Date(entry.data_inicio).toLocaleDateString()}</td>
                      <td className="fw-medium text-dark">{new Date(entry.data_fim).toLocaleDateString()}</td>
                      <td>
                        <span className="badge bg-success/20 text-success rounded-pill px-2 py-1">Lote</span>
                      </td>
                      <td className="fw-bold text-dark">{entry.lote_codigo}</td>
                      <td className="text-dark small">Setor 02 - Baia 03</td>
                      <td className="fw-medium text-dark small">{entry.item_nome}</td>
                      <td className="text-dark small">{entry.quantidade.toLocaleString()}</td>
                      <td className="text-dark small">{Number(entry.custo_unitario).toFixed(2)}</td>
                      <td className="text-dark small">{Number(entry.custo_total).toFixed(2)}</td>
                      <td className="text-dark small">Total no Período</td>
                      <td className="text-dark small">Administrador</td>
                      <td className="text-end">
                        <button className="btn btn-link text-danger p-0 ms-2"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {stats?.latest_entries.length === 0 && (
                    <tr>
                      <td colSpan={12} className="text-center py-5 text-muted-foreground">Nenhum lançamento encontrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="d-flex justify-content-between align-items-center mt-3 border-top pt-3">
              <span className="small text-muted">Mostrando {stats?.latest_entries.length || 0} registros</span>
            </div>
          </div>
          
          {/* Dicas Importantes */}
          <div className="row g-3 mt-4">
            <h5 className="fw-bold mb-2 text-dark">Dicas importantes</h5>
            <div className="col-12 col-md-4">
              <div className="p-3 bg-light rounded-3 d-flex gap-3">
                <Calendar size={20} className="text-success mt-1" />
                <div>
                  <div className="fw-bold small text-dark">Registre o consumo por período</div>
                  <div className="small text-muted" style={{fontSize: '0.75rem'}}>Você pode lançar o consumo diário, semanal ou mensal.</div>
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="p-3 bg-light rounded-3 d-flex gap-3">
                <Lock size={20} className="text-success mt-1" />
                <div>
                  <div className="fw-bold small text-dark">Custo automático</div>
                  <div className="small text-muted" style={{fontSize: '0.75rem'}}>O custo por kg é obtido do estoque e não pode ser alterado.</div>
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="p-3 bg-light rounded-3 d-flex gap-3">
                <TrendingDown size={20} className="text-success mt-1" />
                <div>
                  <div className="fw-bold small text-dark">Acompanhe os resultados</div>
                  <div className="small text-muted" style={{fontSize: '0.75rem'}}>Consumos regulares ajudam a melhorar o desempenho dos animais.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar Layout */}
        <div className="col-12 col-xl-3">
          {/* Resumo do Período */}
          <div className="dashboard-card p-4 mb-4 shadow-sm border">
            <h6 className="fw-bold mb-1 text-dark">Resumo do Período</h6>
            <div className="small text-muted mb-4" style={{fontSize: '0.75rem'}}>26/05/2025 até 01/06/2025</div>
            
            <div className="row g-3">
              <div className="col-12 col-sm-6">
                <div className="p-3 rounded-2 bg-light">
                  <div className="small text-muted fw-semibold mb-1" style={{fontSize: '0.75rem'}}>Total Consumido</div>
                  <div className="h5 fw-black mb-1 text-dark">{stats?.total_qty.toLocaleString()} kg</div>
                  <div className="small text-muted" style={{fontSize: '0.7rem'}}>~ 30,00 kg/dia (média)</div>
                </div>
              </div>
              <div className="col-12 col-sm-6">
                <div className="p-3 rounded-2 bg-light h-100">
                  <div className="small text-muted fw-semibold mb-1" style={{fontSize: '0.75rem'}}>Custo Total</div>
                  <div className="h5 fw-black mb-0 text-dark">R$ {stats?.total_cost.toLocaleString()}</div>
                </div>
              </div>
              <div className="col-12 col-sm-6">
                <div className="p-3 rounded-2 bg-light border border-light-subtle">
                  <div className="small text-muted fw-semibold mb-1" style={{fontSize: '0.75rem'}}>Custo Médio por kg</div>
                  <div className="h6 fw-bold mb-0 text-dark">R$ {stats?.avg_cost_kg.toFixed(2)}</div>
                </div>
              </div>
              <div className="col-12 col-sm-6">
                <div className="p-3 rounded-2 bg-light border border-light-subtle">
                  <div className="small text-muted fw-semibold mb-1" style={{fontSize: '0.75rem'}}>Consumo por Animal (média)</div>
                  <div className="h6 fw-bold mb-0 text-dark">1,75 kg/animal</div>
                </div>
              </div>
            </div>
          </div>

          {/* Consumo por Tipo de Ração */}
          <div className="dashboard-card p-4 mb-4 shadow-sm border">
            <h6 className="fw-bold mb-1 text-dark">Consumo por Tipo de Ração</h6>
            <div className="small text-muted mb-4" style={{fontSize: '0.75rem'}}>(Últimos 30 dias)</div>
            
            <div className="d-flex align-items-center mb-3">
              <div style={{ width: 120, height: 120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats?.by_feed || []}
                      innerRadius={40}
                      outerRadius={55}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {stats?.by_feed.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              <div className="flex-grow-1 ms-3">
                {stats?.by_feed.map((item, index) => (
                  <div key={item.name} className="d-flex align-items-center justify-content-between mb-2">
                    <div className="d-flex align-items-center gap-2">
                      <div className="rounded-circle" style={{ width: 8, height: 8, background: COLORS[index % COLORS.length] }} />
                      <span className="small text-muted" style={{fontSize: '0.75rem'}}>{item.name}</span>
                    </div>
                    <span className="small fw-semibold text-dark" style={{fontSize: '0.75rem'}}>{item.value} kg</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Últimos Lançamentos */}
          <div className="dashboard-card p-4 shadow-sm border">
            <h6 className="fw-bold mb-3 text-dark">Últimos Lançamentos</h6>
            
            <div className="d-flex flex-column gap-3">
              {stats?.latest_entries.map((entry: any) => (
                <div key={entry.id} className="d-flex gap-3 align-items-start border-bottom border-light pb-3">
                  <div className="p-2 rounded-2 bg-success/10 text-success">
                    <History size={16} />
                  </div>
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="fw-bold small text-dark" style={{fontSize: '0.8rem'}}>{entry.lote_codigo} - {entry.item_nome}</div>
                      <div className="fw-bold small text-dark" style={{fontSize: '0.8rem'}}>{entry.quantidade} kg</div>
                    </div>
                    <div className="d-flex justify-content-between align-items-center mt-1">
                      <div className="small text-muted" style={{fontSize: '0.7rem'}}>{new Date(entry.data_inicio).toLocaleDateString()} a {new Date(entry.data_fim).toLocaleDateString()}</div>
                      <div className="fw-semibold small text-success" style={{fontSize: '0.75rem'}}>R$ {Number(entry.custo_total).toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              ))}
              {stats?.latest_entries.length === 0 && (
                <div className="text-center py-3 text-muted small">Nenhum lançamento recente.</div>
              )}
            </div>
            
            <div className="mt-3 text-center">
              <button className="btn btn-link text-success text-decoration-none small fw-bold p-0">Ver todos os lançamentos <ChevronRight size={14}/></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
