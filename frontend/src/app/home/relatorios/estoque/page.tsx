"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/services/api";
import { Package, AlertTriangle, Clock, TrendingUp, TrendingDown } from "lucide-react";

interface StockReport {
  items: {
    id: string;
    code: string;
    name: string;
    category: string;
    unit: string;
    quantity: number;
    avg_cost: number;
    total_value: number;
    min_stock: number;
    is_low_stock: boolean;
  }[];
  total_items: number;
  total_value: number;
  low_stock_count: number;
}

interface MovementReport {
  movements: {
    id: string;
    date: string;
    type: string;
    type_code: string;
    item_name: string;
    item_code: string;
    quantity: number;
    lote_code: string | null;
    created_by: string | null;
    notes: string;
  }[];
}

export default function EstoqueReportsPage() {
  const [stockData, setStockData] = useState<StockReport | null>(null);
  const [movementData, setMovementData] = useState<MovementReport | null>(null);
  const [activeTab, setActiveTab] = useState<'geral' | 'movimentacao' | 'baixo' | 'vencimento'>('geral');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [stockRes, movementRes] = await Promise.all([
          apiClient.get("/reports/stock/general/"),
          apiClient.get("/reports/stock/movement/"),
        ]);
        setStockData(stockRes.data);
        setMovementData(movementRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (date: string) => 
    new Date(date).toLocaleDateString('pt-BR');

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '50vh' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Relatório de Estoque</h4>
          <p className="text-muted mb-0">Análise completa do estoque da fazenda</p>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body d-flex align-items-center gap-3">
              <div className="rounded bg-primary bg-opacity-10 p-2">
                <Package size={20} className="text-primary" />
              </div>
              <div>
                <div className="text-muted small">Total Itens</div>
                <div className="fw-bold">{stockData?.total_items || 0}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body d-flex align-items-center gap-3">
              <div className="rounded bg-success bg-opacity-10 p-2">
                <TrendingUp size={20} className="text-success" />
              </div>
              <div>
                <div className="text-muted small">Valor Total</div>
                <div className="fw-bold">{formatCurrency(stockData?.total_value || 0)}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body d-flex align-items-center gap-3">
              <div className="rounded bg-warning bg-opacity-10 p-2">
                <AlertTriangle size={20} className="text-warning" />
              </div>
              <div>
                <div className="text-muted small">Estoque Baixo</div>
                <div className="fw-bold">{stockData?.low_stock_count || 0}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body d-flex align-items-center gap-3">
              <div className="rounded bg-danger bg-opacity-10 p-2">
                <Clock size={20} className="text-danger" />
              </div>
              <div>
                <div className="text-muted small">Próximos Vencer</div>
                <div className="fw-bold">-</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <ul className="nav nav-pills">
          <li className="nav-item">
            <button 
              className={`nav-link ${activeTab === 'geral' ? 'active' : ''}`}
              onClick={() => setActiveTab('geral')}
            >
              Geral
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${activeTab === 'movimentacao' ? 'active' : ''}`}
              onClick={() => setActiveTab('movimentacao')}
            >
              Movimentação
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${activeTab === 'baixo' ? 'active' : ''}`}
              onClick={() => setActiveTab('baixo')}
            >
              Estoque Baixo
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${activeTab === 'vencimento' ? 'active' : ''}`}
              onClick={() => setActiveTab('vencimento')}
            >
              Vencimento
            </button>
          </li>
        </ul>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          {activeTab === 'geral' && (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Categoria</th>
                    <th className="text-end">Quantidade</th>
                    <th className="text-end">Mínimo</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stockData?.items.map(item => (
                    <tr key={item.id}>
                      <td className="fw-medium">{item.name}</td>
                      <td><span className="badge bg-secondary">{item.category}</span></td>
                      <td className="text-end">{item.quantity} {item.unit}</td>
                      <td className="text-end">{item.min_stock} {item.unit}</td>
                      <td className="text-center">
                        {item.is_low_stock ? (
                          <span className="badge bg-danger">Baixo</span>
                        ) : (
                          <span className="badge bg-success">Normal</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!stockData?.items || stockData.items.length === 0) && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        Nenhum item encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'movimentacao' && (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Item</th>
                    <th>Tipo</th>
                    <th className="text-end">Quantidade</th>
                    <th>Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {movementData?.movements.map(m => (
                    <tr key={m.id}>
                      <td>{formatDate(m.date)}</td>
                      <td className="fw-medium">{m.item_name}</td>
                      <td>
                        <span className={`badge ${m.type_code === 'entry' ? 'bg-success' : 'bg-danger'}`}>
                          {m.type}
                        </span>
                      </td>
                      <td className="text-end">{m.quantity}</td>
                      <td className="text-muted">{m.notes || '-'}</td>
                    </tr>
                  ))}
                  {(!movementData?.movements || movementData.movements.length === 0) && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        Nenhuma movimentação encontrada
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'baixo' && (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Categoria</th>
                    <th className="text-end">Atual</th>
                    <th className="text-end">Mínimo</th>
                    <th className="text-end">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {stockData?.items.filter(i => i.is_low_stock).map(item => (
                    <tr key={item.id}>
                      <td className="fw-medium">{item.name}</td>
                      <td><span className="badge bg-secondary">{item.category}</span></td>
                      <td className="text-end text-danger">{item.quantity} {item.unit}</td>
                      <td className="text-end">{item.min_stock} {item.unit}</td>
                      <td className="text-end text-danger fw-bold">
                        {item.quantity - item.min_stock}
                      </td>
                    </tr>
                  ))}
                  {stockData?.items.filter(i => i.is_low_stock).length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        Nenhum item com estoque baixo
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'vencimento' && (
            <div className="text-center text-muted py-5">
              <Clock size={48} className="mb-3 opacity-50" />
              <p>Use o relatório de validade para ver itens próximos ao vencimento</p>
              <button className="btn btn-outline-primary btn-sm">
                Ver Relatório de Validade
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}