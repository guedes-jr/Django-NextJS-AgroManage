"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/services/api";
import { useRouter } from "next/navigation";
import { 
  BarChart3, 
  Package, 
  Wallet, 
  Beef,
  TrendingUp,
  TrendingDown,
  Calendar,
  ArrowRight
} from "lucide-react";

interface DashboardData {
  kpis: {
    total_revenue: number;
    total_expenses: number;
    net_result: number;
    total_animals: number;
    total_inventory_value: number;
    low_stock_count: number;
  };
  monthly_revenue: { month: string; value: number }[];
  monthly_expenses: { month: string; value: number }[];
  expense_by_category: { category: string; total: number }[];
}

export default function RelatoriosPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<DashboardData>("/reports/dashboard/")
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '50vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Carregando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Relatórios</h4>
          <p className="text-muted mb-0">Visão geral dos relatórios da fazenda</p>
        </div>
        <div className="d-flex gap-2">
          <span className="badge bg-light text-dark border">
            <Calendar size={14} className="me-1" />
            {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="d-flex align-items-center gap-3 mb-3">
                <div className="rounded-circle bg-success bg-opacity-10 p-3">
                  <TrendingUp size={24} className="text-success" />
                </div>
                <div>
                  <div className="text-muted small">Receita Total</div>
                  <div className="fw-bold fs-5">{formatCurrency(data?.kpis.total_revenue || 0)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="d-flex align-items-center gap-3 mb-3">
                <div className="rounded-circle bg-danger bg-opacity-10 p-3">
                  <TrendingDown size={24} className="text-danger" />
                </div>
                <div>
                  <div className="text-muted small">Despesas Totais</div>
                  <div className="fw-bold fs-5">{formatCurrency(data?.kpis.total_expenses || 0)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="d-flex align-items-center gap-3 mb-3">
                <div className="rounded-circle bg-primary bg-opacity-10 p-3">
                  <BarChart3 size={24} className="text-primary" />
                </div>
                <div>
                  <div className="text-muted small">Resultado Líquido</div>
                  <div className={`fw-bold fs-5 ${(data?.kpis.net_result || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                    {formatCurrency(data?.kpis.net_result || 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="d-flex align-items-center gap-3 mb-3">
                <div className="rounded-circle bg-warning bg-opacity-10 p-3">
                  <Package size={24} className="text-warning" />
                </div>
                <div>
                  <div className="text-muted small">Estoque Total</div>
                  <div className="fw-bold fs-5">{formatCurrency(data?.kpis.total_inventory_value || 0)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-md-6">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white border-0 py-3">
              <h6 className="fw-bold mb-0">Relatórios Disponíveis</h6>
            </div>
            <div className="card-body p-0">
              <div className="list-group list-group-flush">
                <button 
                  className="list-group-item list-group-item-action d-flex align-items-center gap-3 py-3 border-0"
                  onClick={() => router.push('/home/relatorios/estoque')}
                >
                  <div className="rounded bg-primary bg-opacity-10 p-2">
                    <Package size={20} className="text-primary" />
                  </div>
                  <div className="flex-grow-1 text-start">
                    <div className="fw-medium">Relatório de Estoque</div>
                    <div className="text-muted small">Movimentação, níveis mínimos e vencimentos</div>
                  </div>
                  <ArrowRight size={16} className="text-muted" />
                </button>
                
                <button 
                  className="list-group-item list-group-item-action d-flex align-items-center gap-3 py-3 border-0"
                  onClick={() => router.push('/home/relatorios/financeiro')}
                >
                  <div className="rounded bg-success bg-opacity-10 p-2">
                    <Wallet size={20} className="text-success" />
                  </div>
                  <div className="flex-grow-1 text-start">
                    <div className="fw-medium">Relatório Financeiro</div>
                    <div className="text-muted small">Fluxo de caixa, DRE e análise por categoria</div>
                  </div>
                  <ArrowRight size={16} className="text-muted" />
                </button>
                
                <button 
                  className="list-group-item list-group-item-action d-flex align-items-center gap-3 py-3 border-0"
                  onClick={() => router.push('/home/relatorios/rebanho')}
                >
                  <div className="rounded bg-warning bg-opacity-10 p-2">
                    <Beef size={20} className="text-warning" />
                  </div>
                  <div className="flex-grow-1 text-start">
                    <div className="fw-medium">Relatório de Rebanho</div>
                    <div className="text-muted small">Inventário, entrada e saída de animais</div>
                  </div>
                  <ArrowRight size={16} className="text-muted" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white border-0 py-3">
              <h6 className="fw-bold mb-0">Alertas</h6>
            </div>
            <div className="card-body">
              {data?.kpis.low_stock_count ? (
                <div className="d-flex align-items-center gap-3 p-3 bg-warning bg-opacity-10 rounded">
                  <Package size={24} className="text-warning" />
                  <div>
                    <div className="fw-medium">Estoque Baixo</div>
                    <div className="text-muted small">{data.kpis.low_stock_count} itens abaixo do mínimo</div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted py-4">
                  <Package size={40} className="mb-2 opacity-50" />
                  <div>Nenhum alerta no momento</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}