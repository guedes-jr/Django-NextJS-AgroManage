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
import { useOrganizationLocale } from "@/lib/locale";
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

export function FeedConsumptionDashboard({ 
  species, 
  showHeader = true, 
  initialCategory = "lotes",
  hideInternalTabs = false,
  categories,
  showForm: externalShowForm,
  onToggleForm,
  onSubmitSuccess
}: FeedConsumptionDashboardProps = {}) {
  const { language, t } = useOrganizationLocale();
  const resolvedCategories = categories ?? [
    { id: "lotes", label: t("livestock.feed.tabs.lots"), icon: "🐖" },
    { id: "matrizes", label: t("livestock.feed.tabs.breeders"), icon: "🐖" },
    { id: "marras", label: t("swineReproduction.gilts"), icon: "🐖" },
    { id: "reprodutores", label: t("livestock.registration.reproducers"), icon: "🐖" },
  ];
  const number = (value: number, options: Intl.NumberFormatOptions = {}) => new Intl.NumberFormat(language, options).format(value);
  const money = (value: number) => new Intl.NumberFormat(language, { style: "currency", currency: "BRL" }).format(value);
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
        apiClient.get(`/livestock/batches/?include_maternity=true${species ? '&especie=' + species : ''}`),
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
      const selectedBatch = batches.find(batch => String(batch.id) === String(formData.lote_animal));
      const phaseMapping: Record<string, string> = {
        gestacao_maternidade: "maternidade",
        maternidade: "maternidade",
        creche: "creche",
        crescimento: "crescimento",
        engorda: "engorda",
      };
      await apiClient.post("/inventory/consumos/", {
        ...formData,
        categoria_destino: "lotes",
        fase_destino: phaseMapping[selectedBatch?.phase] || selectedBatch?.phase,
      });
      alert(t("livestock.feedConsumption.saved"));
      if (onToggleForm) onToggleForm();
      else setInternalShowForm(false);
      
      fetchData();
      if (onSubmitSuccess) onSubmitSuccess();
    } catch (err: any) {
      alert(err.response?.data?.error || t("livestock.feedConsumption.saveFailed"));
    }
  };

  if (loading && !stats) return <div className="p-5 text-center">{t("livestock.loading")}</div>;

  return (
    <div className="pb-5">
      {/* Header (Optional) */}
      {showHeader && (
        <div className="d-flex align-items-center justify-content-between mb-4">
          <div>
            <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-2">
              <Link href="/home" className="text-decoration-none text-muted-foreground">Fazenda Mais</Link>
              <ChevronRight size={14} />
              <span className="fw-semibold text-foreground">{t("livestock.feed.consumptionTitle")}</span>
            </nav>
            <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>{t("livestock.feed.consumptionTitle")}</h1>
            <p className="text-muted-foreground mb-0">{t("livestock.feed.consumptionDescription")}</p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-light fw-semibold d-flex align-items-center gap-2 border-border shadow-sm">
              <History size={18} /> {t("livestock.feed.history")}
            </button>
            <button 
              onClick={() => onToggleForm ? onToggleForm() : setInternalShowForm(!internalShowForm)}
              className="btn btn-primary fw-bold d-flex align-items-center gap-2 shadow-sm border-0"
              style={{ background: "var(--primary)" }}
            >
              <Plus size={18} /> {t("livestock.feed.newEntry")}
            </button>
          </div>
        </div>
      )}

      {/* Tabs (Estilo Imagem) */}

      {!hideInternalTabs && (
        <div className="d-flex align-items-center gap-2 mb-4 p-1 bg-muted/30 rounded-2xl w-fit border border-border/50">
          {resolvedCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-xl fw-bold d-flex align-items-center gap-2 transition-all border-0 ${
                activeCategory === cat.id 
                  ? "bg-card text-primary shadow-sm" 
                  : "bg-transparent text-muted-foreground hover-bg-muted"
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
              <h5 className="fw-bold mb-4 text-foreground">{t("livestock.feedConsumption.newEntry")}</h5>
              <form onSubmit={handleSave}>
                <div className="row g-3 mb-4">
                  {/* Linha 1 */}
                  <div className="col-12 col-md-3">
                    <label className="small fw-bold mb-1 text-foreground">{t("livestock.feedConsumption.selectBatch")}</label>
                    <div className="input-group">
                      <span className="input-group-text bg-card border-end-0 text-muted"><Users size={16} /></span>
                      <select 
                        className="form-select border-start-0 ps-0" 
                        required 
                        value={formData.lote_animal}
                        onChange={e => setFormData({...formData, lote_animal: e.target.value})}
                      >
                        <option value="">{t("livestock.feedConsumption.selectBatchPlaceholder")}</option>
                        {filteredBatches.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.batch_code} - {b.name || b.category} ({b.phase === "gestacao_maternidade" ? t("livestock.labor.sector.maternity") : b.phase})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="col-12 col-md-3">
                    <label className="small fw-bold mb-1 text-foreground">{t("livestock.feedConsumption.period")}</label>
                    <div className="d-flex align-items-center gap-2">
                      <div className="input-group input-group-sm">
                        <span className="input-group-text bg-card border-end-0 text-muted" style={{fontSize: '0.7rem'}}>{t("livestock.feedConsumption.from")}</span>
                        <input 
                          type="date" 
                          className="form-control border-start-0 ps-1 text-muted" 
                          style={{fontSize: '0.85rem'}}
                          value={formData.data_inicio}
                          onChange={e => setFormData({...formData, data_inicio: e.target.value})}
                        />
                      </div>
                      <div className="input-group input-group-sm">
                        <span className="input-group-text bg-card border-end-0 text-muted" style={{fontSize: '0.7rem'}}>{t("livestock.feedConsumption.to")}</span>
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
                    <label className="small fw-bold mb-1 text-foreground">{t("livestock.feedConsumption.feedType")}</label>
                    <div className="input-group">
                      <span className="input-group-text bg-card border-end-0 text-muted"><Scale size={16} /></span>
                      <select 
                        className="form-select border-start-0 ps-0" 
                        required
                        value={formData.item_estoque}
                        onChange={e => setFormData({...formData, item_estoque: e.target.value})}
                      >
                        <option value="">{t("livestock.feedConsumption.selectFeed")}</option>
                        {inventoryItems.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.nome} ({t("livestock.feedConsumption.balance")}: {number(parseFloat(item.estoque_atual))} {item.unidade_display})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="col-12 col-md-3">
                    <label className="small fw-bold mb-1 text-foreground">{t("livestock.feedConsumption.entryMode")}</label>
                    <select 
                      className="form-select"
                      value={formData.tipo_registro}
                      onChange={e => setFormData({...formData, tipo_registro: e.target.value})}
                    >
                      <option value="total_periodo">{t("livestock.feedConsumption.periodTotal")}</option>
                      <option value="diario">{t("livestock.feedConsumption.daily")}</option>
                    </select>
                    <div className="small text-muted mt-1" style={{fontSize: '0.7rem'}}>{t("livestock.feedConsumption.entryModeHelp")}</div>
                  </div>
                </div>

                <div className="row g-3 mb-4">
                  {/* Linha 2 */}
                  <div className="col-12 col-md-4">
                    <label className="small fw-bold mb-1 text-foreground">{t("livestock.feedConsumption.quantity")}</label>
                    <div className="input-group">
                      <input 
                        type="number" 
                        step="0.01" 
                        className="form-control fw-bold text-foreground border-end-0" 
                        required
                        value={formData.quantidade}
                        onChange={e => setFormData({...formData, quantidade: Number(e.target.value)})}
                      />
                      <span className="input-group-text bg-card fw-bold text-muted border-start-0">kg</span>
                    </div>
                    <div className="small text-success mt-1 fw-medium" style={{fontSize: '0.75rem'}}>
                      <Info size={12} className="me-1" /> {t("livestock.feedConsumption.periodDays")}
                    </div>
                  </div>

                  <div className="col-12 col-md-4">
                    <label className="small fw-bold mb-1 text-foreground">{t("livestock.feedConsumption.costKg")}</label>
                    <div className="input-group">
                      <span className="input-group-text bg-muted/20 text-muted fw-bold">{money(0).replace(/[\d.,\s]/g, "")}</span>
                      <input 
                        type="text" 
                        className="form-control bg-muted/20 text-muted fw-bold" 
                        value={number(2.85, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        readOnly
                      />
                      <span className="input-group-text bg-muted/20 text-muted"><Lock size={14} /></span>
                    </div>
                    <div className="small text-muted mt-1" style={{fontSize: '0.7rem'}}>{t("livestock.feedConsumption.stockCost")}</div>
                  </div>

                  <div className="col-12 col-md-4">
                    <label className="small fw-bold mb-1 text-foreground">{t("livestock.feedConsumption.totalCost")}</label>
                    <div className="input-group">
                      <span className="input-group-text bg-muted/20 text-muted fw-bold">{money(0).replace(/[\d.,\s]/g, "")}</span>
                      <input 
                        type="text" 
                        className="form-control bg-muted/20 text-muted fw-bold" 
                        value={number(598.5, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        readOnly
                      />
                      <span className="input-group-text bg-muted/20 text-muted"><Lock size={14} /></span>
                    </div>
                    <div className="small text-muted mt-1" style={{fontSize: '0.7rem'}}>{t("livestock.feedConsumption.systemCost")}</div>
                  </div>
                </div>

                <div className="d-flex align-items-center justify-content-between">
                  <div className="alert alert-primary mb-0 py-2 px-3 d-flex align-items-center gap-2 border-0 bg-primary/10 text-primary w-100 me-3" style={{fontSize: '0.85rem'}}>
                    <Info size={16} /> {t("livestock.feedConsumption.costLocked")}
                  </div>
                  <button type="submit" className="btn btn-primary px-4 fw-bold flex-shrink-0 shadow-sm border-0" style={{ background: "#054f31" }}>
                    {t("livestock.feedConsumption.save")}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* History Table */}
          <div className="dashboard-card p-4 border shadow-sm">
            <h5 className="fw-bold mb-4 text-foreground">{t("livestock.feed.history")}</h5>
            
            <div className="row g-2 mb-4">
              <div className="col-12 col-md-3">
                <label className="small text-muted mb-1" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.period")}</label>
                <select className="form-select form-select-sm text-foreground bg-card">
                  <option>{t("livestock.feedConsumption.last30Days")}</option>
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="small text-muted mb-1" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.entryMode")}</label>
                <select className="form-select form-select-sm text-foreground bg-card">
                  <option>{t("inventory.suppliers.all")}</option>
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="small text-muted mb-1" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.feedType")}</label>
                <select className="form-select form-select-sm text-foreground bg-card">
                  <option>{t("inventory.suppliers.all")}</option>
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="small text-muted mb-1" style={{fontSize: '0.75rem'}}>{t("livestock.registration.category")}</label>
                <div className="d-flex gap-2">
                  <select className="form-select form-select-sm text-foreground bg-card flex-grow-1">
                    <option>{t("inventory.suppliers.all")}</option>
                  </select>
                  <button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1 bg-card flex-shrink-0 px-3">
                    <Filter size={14} /> {t("livestock.labor.filter")}
                  </button>
                </div>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead className="bg-card">
                  <tr>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>{t("livestock.labor.startDate")}</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>{t("livestock.labor.endDate")}</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>{t("livestock.registration.category")}</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>{t("livestock.registration.identifier")}</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.location")}</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>{t("inventory.feed.feed")}</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.quantity")} (kg)</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.costKg")}</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.totalCost")}</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.entryMode")}</th>
                    <th className="border-bottom small text-muted fw-semibold py-3" style={{fontSize: '0.75rem'}}>{t("inventory.feed.user")}</th>
                    <th className="border-bottom"></th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.latest_entries.map((entry: any) => (
                    <tr key={entry.id}>
                      <td className="fw-medium text-foreground">{new Date(entry.data_inicio).toLocaleDateString(language)}</td>
                      <td className="fw-medium text-foreground">{new Date(entry.data_fim).toLocaleDateString(language)}</td>
                      <td>
                        <span className="badge bg-success/20 text-success rounded-pill px-2 py-1">{t("livestock.feed.tabs.lots")}</span>
                      </td>
                      <td className="fw-bold text-foreground">{entry.lote_codigo}</td>
                      <td className="text-foreground small">Setor 02 - Baia 03</td>
                      <td className="fw-medium text-foreground small">{entry.item_nome}</td>
                      <td className="text-foreground small">{number(Number(entry.quantidade))}</td>
                      <td className="text-foreground small">{money(Number(entry.custo_unitario))}</td>
                      <td className="text-foreground small">{money(Number(entry.custo_total))}</td>
                      <td className="text-foreground small">{t("livestock.feedConsumption.periodTotal")}</td>
                      <td className="text-foreground small">{t("users.role.admin")}</td>
                      <td className="text-end">
                        <button className="btn btn-link text-danger p-0 ms-2"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {stats?.latest_entries.length === 0 && (
                    <tr>
                      <td colSpan={12} className="text-center py-5 text-muted-foreground">{t("livestock.feedConsumption.noEntries")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="d-flex justify-content-between align-items-center mt-3 border-top pt-3">
              <span className="small text-muted">{t("livestock.feedConsumption.showing", { count: (stats?.latest_entries.length || 0).toLocaleString(language) })}</span>
            </div>
          </div>
          
          {/* Dicas Importantes */}
          <div className="row g-3 mt-4">
            <h5 className="fw-bold mb-2 text-foreground">{t("livestock.feedConsumption.tips")}</h5>
            <div className="col-12 col-md-4">
              <div className="p-3 rounded-3 d-flex gap-3 h-100 border border-border shadow-sm" style={{ background: "var(--card)" }}>
                <div className="d-flex align-items-center justify-content-center rounded-2 flex-shrink-0" style={{ width: 36, height: 36, background: "color-mix(in srgb, var(--primary), transparent 88%)", color: "var(--primary)" }}>
                  <Calendar size={18} />
                </div>
                <div>
                  <div className="fw-bold small text-foreground">{t("livestock.feedConsumption.tipPeriod")}</div>
                  <div className="small text-muted" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.tipPeriodText")}</div>
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="p-3 rounded-3 d-flex gap-3 h-100 border border-border shadow-sm" style={{ background: "var(--card)" }}>
                <div className="d-flex align-items-center justify-content-center rounded-2 flex-shrink-0" style={{ width: 36, height: 36, background: "color-mix(in srgb, var(--primary), transparent 88%)", color: "var(--primary)" }}>
                  <Lock size={18} />
                </div>
                <div>
                  <div className="fw-bold small text-foreground">{t("livestock.feedConsumption.tipCost")}</div>
                  <div className="small text-muted" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.tipCostText")}</div>
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="p-3 rounded-3 d-flex gap-3 h-100 border border-border shadow-sm" style={{ background: "var(--card)" }}>
                <div className="d-flex align-items-center justify-content-center rounded-2 flex-shrink-0" style={{ width: 36, height: 36, background: "color-mix(in srgb, var(--primary), transparent 88%)", color: "var(--primary)" }}>
                  <TrendingDown size={18} />
                </div>
                <div>
                  <div className="fw-bold small text-foreground">{t("livestock.feedConsumption.tipResults")}</div>
                  <div className="small text-muted" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.tipResultsText")}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar Layout */}
        <div className="col-12 col-xl-3">
          {/* Resumo do Período */}
          <div className="dashboard-card p-4 mb-4 shadow-sm border">
            <h6 className="fw-bold mb-1 text-foreground">{t("livestock.feedConsumption.summary")}</h6>
            <div className="small text-muted mb-4" style={{fontSize: '0.75rem'}}>26/05/2025 até 01/06/2025</div>
            
            <div className="row g-3">
              <div className="col-12 col-sm-6">
                <div className="p-3 rounded-2 bg-muted/20">
                  <div className="small text-muted fw-semibold mb-1" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.totalConsumed")}</div>
                  <div className="h5 fw-black mb-1 text-foreground">{number(stats?.total_qty || 0)} kg</div>
                  <div className="small text-muted" style={{fontSize: '0.7rem'}}>~ 30,00 kg/dia (média)</div>
                </div>
              </div>
              <div className="col-12 col-sm-6">
                <div className="p-3 rounded-2 bg-muted/20 h-100">
                  <div className="small text-muted fw-semibold mb-1" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.totalCost")}</div>
                  <div className="h5 fw-black mb-0 text-foreground">{money(stats?.total_cost || 0)}</div>
                </div>
              </div>
              <div className="col-12 col-sm-6">
                <div className="p-3 rounded-2 bg-muted/20 border border-light-subtle">
                  <div className="small text-muted fw-semibold mb-1" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.averageCost")}</div>
                  <div className="h6 fw-bold mb-0 text-foreground">{money(stats?.avg_cost_kg || 0)}</div>
                </div>
              </div>
              <div className="col-12 col-sm-6">
                <div className="p-3 rounded-2 bg-muted/20 border border-light-subtle">
                  <div className="small text-muted fw-semibold mb-1" style={{fontSize: '0.75rem'}}>{t("livestock.feedConsumption.perAnimal")}</div>
                  <div className="h6 fw-bold mb-0 text-foreground">1,75 kg/animal</div>
                </div>
              </div>
            </div>
          </div>

          {/* Consumo por Tipo de Ração */}
          <div className="dashboard-card p-4 mb-4 shadow-sm border">
            <h6 className="fw-bold mb-1 text-foreground">{t("livestock.feedConsumption.byFeed")}</h6>
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
                    <span className="small fw-semibold text-foreground" style={{fontSize: '0.75rem'}}>{item.value} kg</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Últimos Lançamentos */}
          <div className="dashboard-card p-4 shadow-sm border">
            <h6 className="fw-bold mb-3 text-foreground">{t("livestock.feedConsumption.latest")}</h6>
            
            <div className="d-flex flex-column gap-3">
              {stats?.latest_entries.map((entry: any) => (
                <div key={entry.id} className="d-flex gap-3 align-items-start border-bottom border-light pb-3">
                  <div className="p-2 rounded-2 bg-success/10 text-success">
                    <History size={16} />
                  </div>
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="fw-bold small text-foreground" style={{fontSize: '0.8rem'}}>{entry.lote_codigo} - {entry.item_nome}</div>
                      <div className="fw-bold small text-foreground" style={{fontSize: '0.8rem'}}>{entry.quantidade} kg</div>
                    </div>
                    <div className="d-flex justify-content-between align-items-center mt-1">
                      <div className="small text-muted" style={{fontSize: '0.7rem'}}>{new Date(entry.data_inicio).toLocaleDateString(language)} – {new Date(entry.data_fim).toLocaleDateString(language)}</div>
                      <div className="fw-semibold small text-success" style={{fontSize: '0.75rem'}}>{money(Number(entry.custo_total))}</div>
                    </div>
                  </div>
                </div>
              ))}
              {stats?.latest_entries.length === 0 && (
                <div className="text-center py-3 text-muted small">{t("livestock.feedConsumption.noneRecent")}</div>
              )}
            </div>
            
            <div className="mt-3 text-center">
              <button className="btn btn-link text-success text-decoration-none small fw-bold p-0">{t("livestock.feedConsumption.viewAll")} <ChevronRight size={14}/></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
