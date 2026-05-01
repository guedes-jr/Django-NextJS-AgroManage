"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/services/api";
import { Beef, TrendingUp, TrendingDown, ArrowDown, ArrowUp } from "lucide-react";

interface LivestockReport {
  total_animals: number;
  items: {
    id: string;
    farm: string;
    species: string;
    breed: string | null;
    batch_code: string;
    quantity: number;
    status: string;
    entry_date: string | null;
    avg_weight: number | null;
  }[];
  by_species: { species: string; total: number; batches: number }[];
  by_farm: { farm: string; total: number; batches: number }[];
  by_status: { status: string; total: number; batches: number }[];
}

export default function RebanhoReportsPage() {
  const [data, setData] = useState<LivestockReport | null>(null);
  const [activeTab, setActiveTab] = useState<'inventario' | 'movimentacao'>('inventario');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get("/reports/livestock/inventory/")
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

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
          <h4 className="fw-bold mb-1">Relatório de Rebanho</h4>
          <p className="text-muted mb-0">Análise do rebanho da fazenda</p>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body d-flex align-items-center gap-3">
              <div className="rounded bg-primary bg-opacity-10 p-2">
                <Beef size={20} className="text-primary" />
              </div>
              <div>
                <div className="text-muted small">Total Animais</div>
                <div className="fw-bold">{data?.total_animals || 0}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body d-flex align-items-center gap-3">
              <div className="rounded bg-success bg-opacity-10 p-2">
                <ArrowUp size={20} className="text-success" />
              </div>
              <div>
                <div className="text-muted small">Espécies</div>
                <div className="fw-bold">{data?.by_species?.length || 0}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body d-flex align-items-center gap-3">
              <div className="rounded bg-warning bg-opacity-10 p-2">
                <TrendingUp size={20} className="text-warning" />
              </div>
              <div>
                <div className="text-muted small">Fazendas</div>
                <div className="fw-bold">{data?.by_farm?.length || 0}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <ul className="nav nav-pills">
          <li className="nav-item">
            <button 
              className={`nav-link ${activeTab === 'inventario' ? 'active' : ''}`}
              onClick={() => setActiveTab('inventario')}
            >
              Inventário
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
        </ul>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          {activeTab === 'inventario' && (
            <div className="row">
              <div className="col-md-6">
                <h6 className="fw-bold mb-3">Por Espécie</h6>
                {data?.by_species?.map(s => (
                  <div key={s.species} className="d-flex justify-content-between mb-2 p-2 bg-light rounded">
                    <span>{s.species}</span>
                    <span className="fw-bold">{s.total}</span>
                  </div>
                ))}
                {(!data?.by_species || data.by_species.length === 0) && (
                  <p className="text-muted">Nenhum animal registrado</p>
                )}
              </div>
              <div className="col-md-6">
                <h6 className="fw-bold mb-3">Por Fazendas</h6>
                {data?.by_farm?.map(f => (
                  <div key={f.farm} className="d-flex justify-content-between mb-2 p-2 bg-light rounded">
                    <span>{f.farm}</span>
                    <span className="fw-bold">{f.total}</span>
                  </div>
                ))}
                {(!data?.by_farm || data.by_farm.length === 0) && (
                  <p className="text-muted">Nenhuma fazenda encontrada</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'movimentacao' && (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Fazenda</th>
                    <th>Espécie</th>
                    <th>Lote</th>
                    <th className="text-end">Quantidade</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items?.map(item => (
                    <tr key={item.id}>
                      <td className="fw-medium">{item.farm}</td>
                      <td>{item.species}</td>
                      <td>{item.batch_code}</td>
                      <td className="text-end">{item.quantity}</td>
                      <td>
                        <span className="badge bg-success">{item.status}</span>
                      </td>
                    </tr>
                  ))}
                  {(!data?.items || data.items.length === 0) && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        Nenhum lote encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}