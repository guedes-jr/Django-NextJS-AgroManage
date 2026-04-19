"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { apiClient } from "@/services/api";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface StatCard {
  title: string;
  value: string;
  change: string;
  positive: boolean;
}

const stats: StatCard[] = [
  { title: "Total de Animais", value: "1.248", change: "+12%", positive: true },
  { title: "Hectares Plantados", value: "842", change: "+8%", positive: true },
  { title: "Receita Mensal", value: "R$ 125.000", change: "+23%", positive: true },
  { title: "Estoque Insumos", value: "156 itens", change: "-3%", positive: false },
];

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    } else {
      apiClient
        .get("/auth/me/")
        .then((res) => {
          setUser(res.data);
          localStorage.setItem("user", JSON.stringify(res.data));
        })
        .catch(() => {
          router.push("/login");
        });
    }
  }, [router]);

  return (
    <div className="d-flex">
      <AppSidebar />
      <div className="flex-grow-1 d-flex flex-column">
        <TopBar />
        <main className="flex-grow-1 p-4 bg-light">
          <div className="mb-4">
            <h4 className="fw-bold mb-1">Dashboard</h4>
            <p className="text-muted mb-0">Visão geral da sua propriedade</p>
          </div>

          <div className="row g-4 mb-4">
            {stats.map((stat, index) => (
              <div key={index} className="col-md-6 col-lg-3">
                <div className="card h-100 border-0 shadow-sm">
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <small className="text-muted text-uppercase">{stat.title}</small>
                      <span className={`badge bg-${stat.positive ? 'success' : 'danger'}`}>
                        {stat.change}
                      </span>
                    </div>
                    <h4 className="fw-bold mb-0">{stat.value}</h4>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="row g-4">
            <div className="col-lg-8">
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-white border-0">
                  <h5 className="mb-0">Atividades Recentes</h5>
                </div>
                <div className="card-body p-0">
                  <div className="table-responsive">
                    <table className="table table-hover mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Data</th>
                          <th>Descrição</th>
                          <th>Tipo</th>
                          <th>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>19/04/2026</td>
                          <td>Vacinação Bovinos</td>
                          <td><span className="badge bg-info">Sanidade</span></td>
                          <td>R$ 2.500,00</td>
                        </tr>
                        <tr>
                          <td>18/04/2026</td>
                          <td>Compra de Adubo</td>
                          <td><span className="badge bg-warning">Insumo</span></td>
                          <td>R$ 8.750,00</td>
                        </tr>
                        <tr>
                          <td>17/04/2026</td>
                          <td>Venda de Milho</td>
                          <td><span className="badge bg-success">Receita</span></td>
                          <td>R$ 45.000,00</td>
                        </tr>
                        <tr>
                          <td>16/04/2026</td>
                          <td>Transferência Rebanho</td>
                          <td><span className="badge bg-primary">Movimentação</span></td>
                          <td>-</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-white border-0">
                  <h5 className="mb-0">Ações Rápidas</h5>
                </div>
                <div className="card-body">
                  <div className="d-grid gap-2">
                    <Link href="/home/rebanho/nova-entrada" className="btn btn-outline-success">
                      + Nova Entrada de Animais
                    </Link>
                    <Link href="/home/estoque/nova-movimentacao" className="btn btn-outline-warning">
                      + Registrar Insumo
                    </Link>
                    <Link href="/home/financeiro/nova-transacao" className="btn btn-outline-primary">
                      + Nova Transação
                    </Link>
                    <Link href="/home/tarefas/nova" className="btn btn-outline-secondary">
                      + Nova Tarefa
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}