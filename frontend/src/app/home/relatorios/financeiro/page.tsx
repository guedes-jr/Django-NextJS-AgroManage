"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/services/api";
import { Wallet, TrendingUp, TrendingDown, PieChart, ArrowDown, ArrowUp } from "lucide-react";

interface CashflowReport {
  summary: {
    total_revenue: number;
    total_expense: number;
    balance: number;
  };
  monthly: {
    month: string;
    type: string;
    amount: number;
  }[];
  by_category: {
    category: string;
    type: string;
    amount: number;
  }[];
}

export default function FinanceiroReportsPage() {
  const [data, setData] = useState<CashflowReport | null>(null);
  const [activeTab, setActiveTab] = useState<'fluxo' | 'dre' | 'categoria' | 'comparativo'>('fluxo');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get("/reports/finance/cashflow/")
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '50vh' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  const totalIncome = data?.by_category?.filter(c => c.type === 'revenue').reduce((sum, c) => sum + c.amount, 0) || 0;
  const totalExpense = data?.by_category?.filter(c => c.type === 'expense').reduce((sum, c) => sum + c.amount, 0) || 0;

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Relatório Financeiro</h4>
          <p className="text-muted mb-0">Análise financeira da fazenda</p>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body d-flex align-items-center gap-3">
              <div className="rounded bg-success bg-opacity-10 p-2">
                <ArrowUp size={20} className="text-success" />
              </div>
              <div>
                <div className="text-muted small">Receitas</div>
                <div className="fw-bold text-success">{formatCurrency(totalIncome)}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body d-flex align-items-center gap-3">
              <div className="rounded bg-danger bg-opacity-10 p-2">
                <ArrowDown size={20} className="text-danger" />
              </div>
              <div>
                <div className="text-muted small">Despesas</div>
                <div className="fw-bold text-danger">{formatCurrency(totalExpense)}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body d-flex align-items-center gap-3">
              <div className={`rounded ${(data?.summary?.balance || 0) >= 0 ? 'bg-success' : 'bg-danger'} bg-opacity-10 p-2`}>
                {((data?.summary?.balance || 0) >= 0) ? (
                  <TrendingUp size={20} className="text-success" />
                ) : (
                  <TrendingDown size={20} className="text-danger" />
                )}
              </div>
              <div>
                <div className="text-muted small">Resultado</div>
                <div className={`fw-bold ${(data?.summary?.balance || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatCurrency(data?.summary?.balance || 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <ul className="nav nav-pills">
          <li className="nav-item">
            <button 
              className={`nav-link ${activeTab === 'fluxo' ? 'active' : ''}`}
              onClick={() => setActiveTab('fluxo')}
            >
              Fluxo de Caixa
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${activeTab === 'dre' ? 'active' : ''}`}
              onClick={() => setActiveTab('dre')}
            >
              DRE
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${activeTab === 'categoria' ? 'active' : ''}`}
              onClick={() => setActiveTab('categoria')}
            >
              Por Categoria
            </button>
          </li>
        </ul>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          {activeTab === 'fluxo' && (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Tipo</th>
                    <th className="text-end">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.monthly?.map((m, idx) => (
                    <tr key={idx}>
                      <td>{m.month}</td>
                      <td>
                        <span className={`badge ${m.type === 'revenue' ? 'bg-success' : 'bg-danger'}`}>
                          {m.type === 'revenue' ? 'Receita' : 'Despesa'}
                        </span>
                      </td>
                      <td className={`text-end fw-bold ${m.type === 'revenue' ? 'text-success' : 'text-danger'}`}>
                        {formatCurrency(m.amount)}
                      </td>
                    </tr>
                  ))}
                  {(!data?.monthly || data.monthly.length === 0) && (
                    <tr>
                      <td colSpan={3} className="text-center text-muted py-4">
                        Nenhum dado disponível
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'dre' && (
            <div>
              <div className="p-3 bg-light rounded mb-3">
                <h6 className="fw-bold mb-3">Demonstração de Resultado</h6>
                <div className="d-flex justify-content-between mb-2">
                  <span>Receitas Brutas</span>
                  <span className="fw-bold text-success">{formatCurrency(totalIncome)}</span>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span>(-) Despesas Operacionais</span>
                  <span className="fw-bold text-danger">({formatCurrency(totalExpense)})</span>
                </div>
                <hr />
                <div className="d-flex justify-content-between">
                  <span className="fw-bold">Resultado Líquido</span>
                  <span className={`fw-bold ${(data?.summary?.balance || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                    {formatCurrency(data?.summary?.balance || 0)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'categoria' && (
            <div className="row">
              <div className="col-md-6">
                <h6 className="fw-bold mb-3">Receitas por Categoria</h6>
                {data?.by_category?.filter(c => c.type === 'revenue').map(c => (
                  <div key={c.category} className="d-flex justify-content-between mb-2">
                    <span>{c.category}</span>
                    <span className="fw-medium text-success">{formatCurrency(c.amount)}</span>
                  </div>
                ))}
                {(!data?.by_category?.filter(c => c.type === 'revenue').length) && (
                  <p className="text-muted">Nenhuma receita registrada</p>
                )}
              </div>
              <div className="col-md-6">
                <h6 className="fw-bold mb-3">Despesas por Categoria</h6>
                {data?.by_category?.filter(c => c.type === 'expense').map(c => (
                  <div key={c.category} className="d-flex justify-content-between mb-2">
                    <span>{c.category}</span>
                    <span className="fw-medium text-danger">{formatCurrency(c.amount)}</span>
                  </div>
                ))}
                {(!data?.by_category?.filter(c => c.type === 'expense').length) && (
                  <p className="text-muted">Nenhuma despesa registrada</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}