"use client";

import { useState, useEffect } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign,
  Calendar,
  Filter,
  Clock
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { apiClient } from "@/services/api";

const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

export function FinanceDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await apiClient.get("/finance/transactions/stats/");
      setStats(response.data);
    } catch (err) {
      console.error("Error fetching finance stats:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return <div className="p-5 text-center">Carregando indicadores financeiros...</div>;
  }

  const { summary, cash_flow, expenses_by_category } = stats;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* KPI Cards */}
      <div className="row g-3">
        <div className="col-12 col-md-6 col-lg-3">
          <div className="dashboard-card p-3 border border-border bg-background shadow-sm h-100">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Wallet size={20} />
              </div>
              <span className="text-success small fw-bold d-flex align-items-center">
                <ArrowUpRight size={14} className="me-1" /> Ativo
              </span>
            </div>
            <div className="text-muted-foreground small fw-medium mb-1">Saldo em Contas</div>
            <div className="h4 fw-bold text-foreground mb-0">
              R$ {summary.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="col-12 col-md-6 col-lg-3">
          <div className="dashboard-card p-3 border border-border bg-background shadow-sm h-100">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div className="p-2 rounded-lg bg-success/10 text-success">
                <TrendingUp size={20} />
              </div>
              <span className="text-muted-foreground small fw-medium">Este Mês</span>
            </div>
            <div className="text-muted-foreground small fw-medium mb-1">Total Recebido</div>
            <div className="h4 fw-bold text-success mb-0">
              R$ {summary.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="col-12 col-md-6 col-lg-3">
          <div className="dashboard-card p-3 border border-border bg-background shadow-sm h-100">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div className="p-2 rounded-lg bg-danger/10 text-danger">
                <TrendingDown size={20} />
              </div>
              <span className="text-muted-foreground small fw-medium">Este Mês</span>
            </div>
            <div className="text-muted-foreground small fw-medium mb-1">Total Pago</div>
            <div className="h4 fw-bold text-danger mb-0">
              R$ {summary.total_expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="col-12 col-md-6 col-lg-3">
          <div className="dashboard-card p-3 border border-border bg-background shadow-sm h-100">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div className="p-2 rounded-lg bg-warning/10 text-warning">
                <Clock size={20} className="lucide-icon" />
              </div>
              <span className="text-muted-foreground small fw-medium">Pendentes</span>
            </div>
            <div className="text-muted-foreground small fw-medium mb-1">A Pagar Próx. 7 dias</div>
            <div className="h4 fw-bold text-warning mb-0">
              R$ {summary.payable.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mt-3">
        {/* Cash Flow Chart */}
        <div className="col-12 col-xl-8">
          <div className="dashboard-card p-4 border border-border bg-background shadow-sm h-100">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h4 className="fw-bold text-foreground mb-1">Fluxo de Caixa</h4>
                <p className="text-muted-foreground small mb-0">Entradas e saídas nos últimos 30 dias</p>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-2 border-light-subtle bg-white">
                  <Calendar size={14} /> 30 Dias
                </button>
              </div>
            </div>
            
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <AreaChart data={cash_flow}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: 'var(--muted-foreground)', fontSize: 11}}
                    tickFormatter={(str) => new Date(str).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: 'var(--muted-foreground)', fontSize: 11}}
                    tickFormatter={(value) => `R$ ${value}`}
                  />
                  <Tooltip 
                    contentStyle={{backgroundColor: 'var(--background)', borderColor: 'var(--border)', borderRadius: '12px', boxShadow: 'var(--shadow-elegant)'}}
                    labelStyle={{color: 'var(--foreground)', fontWeight: 'bold'}}
                  />
                  <Area type="monotone" dataKey="revenue" name="Entradas" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRev)" />
                  <Area type="monotone" dataKey="expense" name="Saídas" stroke="#ef4444" strokeWidth={2.5} fillOpacity={1} fill="url(#colorExp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Expenses by Category */}
        <div className="col-12 col-xl-4">
          <div className="dashboard-card p-4 border border-border bg-background shadow-sm h-100">
            <h4 className="fw-bold text-foreground mb-1">Gastos por Categoria</h4>
            <p className="text-muted-foreground small mb-4">Distribuição das despesas pagas</p>

            <div style={{ width: '100%', height: 240 }} className="mb-4">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={expenses_by_category}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {expenses_by_category.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-elegant)'}}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-3">
              {expenses_by_category.slice(0, 4).map((item: any, idx: number) => (
                <div key={idx} className="d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2">
                    <div className="rounded-circle" style={{width: 8, height: 8, backgroundColor: COLORS[idx % COLORS.length]}}></div>
                    <span className="small text-muted-foreground fw-medium">{item.name}</span>
                  </div>
                  <span className="small fw-bold text-foreground">
                    R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
              {expenses_by_category.length === 0 && (
                <div className="text-center py-4 text-muted-foreground small">Nenhum gasto registrado</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
