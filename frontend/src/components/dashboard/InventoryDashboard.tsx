"use client";

import { useState, useMemo } from "react";
import { InventoryFormModal, type InventoryCategory } from "@/components/dashboard/InventoryFormModal";
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
  RefreshCw
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
  Cell
} from "recharts";
import { Badge } from "@/components/ui/Badge";
import "@/app/home/estoque/estoque.css";

// Mock Data
const movementData = [
  { day: "01/05", entrada: 800, saida: 400 },
  { day: "05/05", entrada: 1200, saida: 600 },
  { day: "10/05", entrada: 900, saida: 800 },
  { day: "15/05", entrada: 1100, saida: 900 },
  { day: "20/05", entrada: 1400, saida: 850 },
  { day: "25/05", entrada: 1300, saida: 1100 },
  { day: "30/05", entrada: 700, saida: 500 },
];

const categoryData = [
  { name: "Rações / Grãos", value: 65450, color: "oklch(0.65 0.15 145)", percent: "52,0%" },
  { name: "Núcleo / Premix", value: 28750, color: "oklch(0.55 0.16 230)", percent: "22,8%" },
  { name: "Medicamentos", value: 15320, color: "oklch(0.78 0.15 85)", percent: "12,2%" },
  { name: "Vacinas", value: 8750, color: "oklch(0.7 0.18 290)", percent: "7,0%" },
  { name: "Outros", value: 7570, color: "oklch(0.8 0.05 240)", percent: "6,0%" },
];

const lowStockItems = [
  { name: "Milho", current: "380,00 kg", min: "500,00 kg", status: "atencao", label: "Atenção" },
  { name: "Núcleo Gestação", current: "45,00 kg", min: "100,00 kg", status: "critico", label: "Crítico" },
  { name: "Sulfaguiinoxalina 20%", current: "2,50 kg", min: "5,00 kg", status: "critico", label: "Crítico" },
  { name: "Vacina Mycoplasma", current: "15 doses", min: "20 doses", status: "atencao", label: "Atenção" },
  { name: "Premix Suíno", current: "8,00 kg", min: "10,00 kg", status: "atencao", label: "Atenção" },
];

const recentMovements = [
  { type: "entrada", product: "Milho", qty: "2.000,00 kg", value: "R$ 2.800,00", time: "31/05/2025 10:30" },
  { type: "saida", product: "Ração Creche", qty: "500,00 kg", value: "R$ 875,00", time: "31/05/2025 08:15" },
  { type: "entrada", product: "Núcleo Gestação", qty: "100,00 kg", value: "R$ 450,00", time: "30/05/2025 16:45" },
  { type: "saida", product: "Medicamento", qty: "2,00 kg", value: "R$ 120,00", time: "30/05/2025 14:20" },
  { type: "entrada", product: "Soja", qty: "1.500,00 kg", value: "R$ 2.550,00", time: "30/05/2025 09:30" },
];

export function InventoryDashboard() {
  const [modalConfig, setModalConfig] = useState<{ open: boolean; category?: InventoryCategory }>({ open: false });

  const handleSaveItems = async (items: any[]) => {
    try {
      const payload = items.map(row => ({
        nome: row.nome,
        codigo: row.codigo || undefined,
        categoria: row.categoria,
        unidade_medida: row.unidade_medida,
        descricao: row.descricao,
        marca: row.marca,
        fabricante: row.fabricante,
        especie_animal: row.especie_animal || undefined,
        estoque_minimo: row.estoque_minimo ? parseFloat(row.estoque_minimo) : 0,
        principio_ativo: row.principio_ativo,
        concentracao: row.concentracao,
        via_aplicacao: row.via_aplicacao || undefined,
        carencia_dias: row.carencia_dias ? parseInt(row.carencia_dias) : undefined,
        registro_mapa: row.registro_mapa,
        exige_receituario: row.exige_receituario,
        medicamento_controlado: row.medicamento_controlado,
        temperatura_minima: row.temperatura_minima ? parseFloat(row.temperatura_minima) : undefined,
        temperatura_maxima: row.temperatura_maxima ? parseFloat(row.temperatura_maxima) : undefined,
        doses_por_embalagem: row.doses_por_embalagem ? parseInt(row.doses_por_embalagem) : undefined,
        volume_por_dose: row.volume_por_dose,
        composicao: row.composicao,
        indicacao_uso: row.indicacao_uso,
        modo_uso: row.modo_uso,
        peso_embalagem: row.peso_embalagem ? parseFloat(row.peso_embalagem) : undefined,
        quantidade_inicial: row.quantidade_inicial ? parseFloat(row.quantidade_inicial) : undefined,
        custo_unitario: row.custo_unitario ? parseFloat(row.custo_unitario) : undefined,
        numero_lote: row.numero_lote,
        data_validade: row.data_validade || undefined,
        data_fabricacao: row.data_fabricacao || undefined,
        local_armazenamento: row.local_armazenamento || undefined,
        fornecedor: row.fornecedor,
        nota_fiscal: row.nota_fiscal,
        observacao_lote: row.observacao_lote,
      }));
      await apiClient.post("inventory/items/bulk_create/", payload);
    } catch (err) {
      console.error("Erro ao salvar itens:", err);
      throw err;
    }
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
                    Controle completo dos insumos, rações, medicamentos e materiais da sua granja.
                </p>
            </div>
        </div>
      </div>

      {/* Category Row */}
      <div className="mb-5">
        <div className="d-flex align-items-center justify-content-between mb-4">
            <h3 className="fw-bold mb-0" style={{ fontSize: '1.1rem' }}>Cadastre novos insumos</h3>
            <span className="text-muted-foreground small fw-medium">Mantenha seu estoque sempre atualizado.</span>
        </div>
        <div className="row g-3">
          <div className="col-auto">
            <button
              className="btn h-100 px-4 d-flex flex-column align-items-center justify-content-center gap-2 rounded-xl border-0 shadow-sm transition-all"
              style={{ minWidth: '140px', background: 'var(--primary)', color: 'white' }}
              onClick={() => setModalConfig({ open: true })}
            >
                <Plus size={24} strokeWidth={3} />
                <span className="fw-bold">Novo Insumo</span>
            </button>
          </div>
          {[
            { title: "Rações / Grãos", desc: "Milho, Soja, Farelo...", icon: <Wheat size={24} />, color: "oklch(0.7 0.15 85)", category: "racao" as InventoryCategory },
            { title: "Núcleo / Premix", desc: "Núcleo, Suplementos...", icon: <Box size={24} />, color: "oklch(0.65 0.16 230)", category: "nucleo" as InventoryCategory },
            { title: "Medicamentos", desc: "Antibióticos, Vitaminas...", icon: <Activity size={24} />, color: "oklch(0.7 0.18 25)", category: "medicamento" as InventoryCategory },
            { title: "Vacinas", desc: "Vacinas, Injetáveis...", icon: <Syringe size={24} />, color: "oklch(0.7 0.22 290)", category: "vacina" as InventoryCategory },
            { title: "Outros Materiais", desc: "Materiais, Equipamentos...", icon: <Package size={24} />, color: "oklch(0.6 0.05 240)", category: "material" as InventoryCategory },
          ].map((cat, i) => (
            <div key={i} className="col">
              <div className="inv-category-card" onClick={() => setModalConfig({ open: true, category: cat.category })}>
                <div className="inv-category-icon" style={{ background: `color-mix(in srgb, ${cat.color}, transparent 85%)`, color: cat.color }}>
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

      {/* KPI Row */}
      <div className="row g-4 mb-4">
        {[
          { label: "Valor Total em Estoque", value: "R$ 125.840,50", sub: "Valor de custo total", icon: <Wallet />, color: "oklch(0.65 0.15 145)" },
          { label: "Itens Cadastrados", value: "87", sub: "Todos os itens ativos", icon: <Package />, color: "oklch(0.65 0.16 240)" },
          { label: "Estoque Baixo", value: "12", sub: "Itens abaixo do mínimo", icon: <AlertTriangle />, color: "oklch(0.7 0.18 85)" },
          { label: "Itens Vencidos", value: "3", sub: "Requer atenção imediata", icon: <Calendar />, color: "oklch(0.7 0.22 25)" },
        ].map((kpi, i) => (
          <div key={i} className="col-12 col-md-3">
            <div className="dashboard-card p-4">
              <div className="d-flex align-items-center gap-3">
                <div className="rounded-xl d-flex align-items-center justify-content-center" style={{ width: 44, height: 44, background: `color-mix(in srgb, ${kpi.color}, transparent 90%)`, color: kpi.color }}>
                  {kpi.icon}
                </div>
                <div className="flex-grow-1">
                    <div className="text-muted-foreground small fw-bold text-uppercase mb-1" style={{ letterSpacing: '0.02em', fontSize: '0.65rem' }}>{kpi.label}</div>
                    <div className="fw-black text-foreground" style={{ fontSize: '1.25rem' }}>{kpi.value}</div>
                    <div className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>{kpi.sub}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Warning Banner */}
      <div className="alert-banner mb-5">
        <div className="d-flex align-items-center gap-3">
            <AlertTriangle className="text-warning" size={24} />
            <div className="fw-bold text-orange-950">Atenção! Você possui 12 itens com estoque abaixo do mínimo e 3 itens vencidos.</div>
        </div>
        <button className="btn btn-sm btn-white border border-warning/30 bg-white shadow-sm px-4 fw-bold">Ver todos os alertas</button>
      </div>

      {/* Main Grid */}
      <div className="row g-4 mb-5">
        <div className="col-12 col-xl-8">
            <div className="dashboard-card p-4">
                <div className="d-flex justify-content-between align-items-start mb-4">
                    <div>
                        <h3 className="fw-bold mb-1" style={{ fontSize: '1.1rem' }}>Movimentações (Entradas e Saídas)</h3>
                        <p className="text-muted-foreground small">Resumo dos últimos 30 dias</p>
                    </div>
                    <select className="form-select form-select-sm w-auto border-border bg-transparent small fw-bold">
                        <option>Últimos 30 dias</option>
                    </select>
                </div>
                
                <div style={{ height: '300px', width: '100%' }}>
                    <ResponsiveContainer>
                        <AreaChart data={movementData}>
                            <defs>
                                <linearGradient id="colorEntrada" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="oklch(0.65 0.15 145)" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="oklch(0.65 0.15 145)" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorSaida" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="oklch(0.6 0.18 25)" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="oklch(0.6 0.18 25)" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: 'var(--muted-foreground)', fontSize: 11}} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--muted-foreground)', fontSize: 11}} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-elegant)' }} />
                            <Area type="monotone" dataKey="entrada" stroke="oklch(0.65 0.15 145)" strokeWidth={3} fillOpacity={1} fill="url(#colorEntrada)" name="Entradas (kg)" />
                            <Area type="monotone" dataKey="saida" stroke="oklch(0.6 0.18 25)" strokeWidth={3} fillOpacity={1} fill="url(#colorSaida)" name="Saídas (kg)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                
                <div className="row g-4 mt-2">
                    <div className="col-12 col-md-6">
                        <div className="p-3 rounded-xl border border-border bg-emerald-50/10">
                            <div className="text-muted-foreground small fw-bold mb-1">Entradas</div>
                            <div className="d-flex align-items-baseline gap-2">
                                <span className="fw-black fs-4">18.450 kg</span>
                                <span className="text-muted-foreground small fw-medium">R$ 78.650,00</span>
                            </div>
                        </div>
                    </div>
                    <div className="col-12 col-md-6">
                        <div className="p-3 rounded-xl border border-border bg-rose-50/10">
                            <div className="text-muted-foreground small fw-bold mb-1">Saídas</div>
                            <div className="d-flex align-items-baseline gap-2">
                                <span className="fw-black fs-4">15.230 kg</span>
                                <span className="text-muted-foreground small fw-medium">R$ 65.320,00</span>
                            </div>
                        </div>
                    </div>
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
                    {lowStockItems.map((item, i) => (
                        <div key={i} className="stock-item-row">
                            <div className="d-flex align-items-center gap-3">
                                <div className="rounded-lg d-flex align-items-center justify-content-center p-2" style={{ background: 'var(--inv-accent-soft)', color: 'var(--primary)' }}>
                                    <Box size={18} />
                                </div>
                                <div className="flex-grow-1">
                                    <div className="fw-bold small text-foreground">{item.name}</div>
                                    <div className="d-flex gap-3 mt-1">
                                        <div className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>Esq. atual: <span className="fw-bold text-dark">{item.current}</span></div>
                                        <div className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>Mínimo: <span className="fw-bold text-dark">{item.min}</span></div>
                                    </div>
                                </div>
                                <span className={`badge-status ${item.status}`}>{item.label}</span>
                            </div>
                        </div>
                    ))}
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
                            {recentMovements.map((move, i) => (
                                <tr key={i} className="border-bottom border-border last-border-0">
                                    <td className="px-4 py-3">
                                        <div className="d-flex align-items-center gap-2">
                                            {move.type === 'entrada' ? (
                                                <ArrowUpRight size={16} className="text-emerald-500" />
                                            ) : (
                                                <ArrowDownRight size={16} className="text-rose-500" />
                                            )}
                                            <span className={`small fw-bold ${move.type === 'entrada' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {move.type === 'entrada' ? 'Entrada' : 'Saída'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 small fw-bold text-foreground">{move.product}</td>
                                    <td className="px-4 py-3 small fw-bold">{move.qty}</td>
                                    <td className="px-4 py-3 small fw-bold">{move.value}</td>
                                    <td className="px-4 py-3 small text-muted-foreground fw-medium">{move.time}</td>
                                </tr>
                            ))}
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
                                    <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-elegant)' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                
                <div className="mt-4 inv-chart-legend">
                    {categoryData.map((cat, i) => (
                        <div key={i} className="legend-item">
                            <div className="d-flex align-items-center gap-2">
                                <div className="rounded-circle" style={{ width: 10, height: 10, background: cat.color }}></div>
                                <span className="fw-medium text-muted-foreground">{cat.name}</span>
                            </div>
                            <div className="d-flex align-items-center gap-3">
                                <span className="fw-bold text-foreground">R$ {cat.value.toLocaleString('pt-BR')}</span>
                                <span className="small text-muted-foreground fw-bold" style={{ width: '45px', textAlign: 'right' }}>{cat.percent}</span>
                            </div>
                        </div>
                    ))}
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
            <button className="inv-quick-action">
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

      <InventoryFormModal
        isOpen={modalConfig.open}
        onClose={() => setModalConfig({ open: false })}
        category={modalConfig.category}
        onSave={handleSaveItems}
      />
    </div>
  );
}
