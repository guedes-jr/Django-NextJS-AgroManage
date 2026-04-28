"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Plus,
  Bell,
  BellOff,
} from "lucide-react";
import { apiClient } from "@/services/api";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import "@/app/home/estoque/estoque.css";

type AlertaItem = {
  id: string;
  nome: string;
  estoque_atual: string;
  estoque_minimo: string;
  unidade_medida: string;
};

type DashboardStats = {
  total_alertas: number;
  critica: number;
  atendidas: number;
  pendentes: number;
};

export function AlertasDashboard() {
  const { showToast } = useToast();
  const [alertas, setAlertas] = useState<AlertaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todas");
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    estoque_minimo: "",
    unidade_medida: "kg",
  });

  const fetchAlertas = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<AlertaItem[]>("/inventory/items/low_stock/");
      setAlertas(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Erro ao buscar alertas:", error);
      setAlertas([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlertas();
  }, []);

  const filteredAlertas = useMemo(() => {
    return alertas.filter((item) => {
      const matchesSearch = item.nome.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [alertas, searchTerm]);

  const stats = useMemo((): DashboardStats => {
    const total = alertas.length;
    const critica = alertas.filter((item) => {
      const atual = parseFloat(String(item.estoque_atual).replace(",", "."));
      const minimo = parseFloat(String(item.estoque_minimo).replace(",", "."));
      return atual <= minimo * 0.5;
    }).length;
    return {
      total_alertas: total,
      critica,
      atendidas: 0,
      pendentes: total,
    };
  }, [alertas]);

  const handleSubmitAlerta = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post("/inventory/items/", {
        nome: formData.nome,
        estoque_minimo: parseFloat(formData.estoque_minimo),
        unidade_medida: formData.unidade_medida,
        categoria: "material",
        ativo: true,
      });
      setModalOpen(false);
      setFormData({ nome: "", estoque_minimo: "", unidade_medida: "kg" });
      fetchAlertas();
      showToast({ type: "success", message: "Alerta criado com sucesso!" });
    } catch (error) {
      console.error("Erro ao criar alerta:", error);
      showToast({ type: "error", message: "Erro ao criar alerta" });
    }
  };

  return (
    <div className="inventory-container pb-5">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-4">
          <Link href="/home/estoque/resumo" className="text-decoration-none text-muted-foreground hover-text-primary">
            Estoque
          </Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Alertas</span>
        </nav>

        <div className="d-flex align-items-center justify-content-between mb-1">
          <h1 className="fw-black mb-0" style={{ fontSize: "2.25rem", letterSpacing: "-0.04em", color: "var(--foreground)" }}>
            Alertas de Estoque
          </h1>
          <div className="d-flex gap-2">
            <button
              className="btn h-100 px-3 d-flex align-items-center gap-2 rounded-xl border-0 shadow-sm"
              style={{ background: "var(--primary)", color: "white" }}
              onClick={() => setModalOpen(true)}
            >
              <Plus size={18} strokeWidth={3} />
              <span className="fw-bold">Novo alerta</span>
            </button>
            <button
              className="btn h-100 px-3 d-flex align-items-center gap-2 rounded-xl border-0 shadow-sm bg-white"
              style={{ background: "white" }}
              onClick={fetchAlertas}
            >
              <RefreshCw size={18} strokeWidth={3} className="text-muted-foreground" />
              <span className="fw-semibold text-muted-foreground">Atualizar</span>
            </button>
          </div>
        </div>
        <p className="mb-0 text-muted-foreground fw-medium">
          Itens que precisam de reposição para manter o estoque mínimo.
        </p>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12 col-md-4">
          <div className="dashboard-card p-4">
            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle"
                style={{ width: "48px", height: "48px", background: "oklch(0.62 0.18 150)", opacity: 0.15 }}
              >
                <Bell className="text-success" size={24} />
              </div>
              <div>
                <div className="text-muted-foreground small fw-bold text-uppercase mb-1">Total de Alertas</div>
                <div className="fw-black text-success" style={{ fontSize: "1.5rem" }}>{stats.total_alertas}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="dashboard-card p-4">
            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle"
                style={{ width: "48px", height: "48px", background: "oklch(0.55 0.18 20)", opacity: 0.15 }}
              >
                <AlertTriangle className="text-danger" size={24} />
              </div>
              <div>
                <div className="text-muted-foreground small fw-bold text-uppercase mb-1">Crítico</div>
                <div className="fw-black text-danger" style={{ fontSize: "1.5rem" }}>{stats.critica}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="dashboard-card p-4">
            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle"
                style={{ width: "48px", height: "48px", background: "oklch(0.6 0.22 45)", opacity: 0.15 }}
              >
                <BellOff className="text-warning" size={24} />
              </div>
              <div>
                <div className="text-muted-foreground small fw-bold text-uppercase mb-1">Pendente</div>
                <div className="fw-black text-warning" style={{ fontSize: "1.5rem" }}>{stats.pendentes}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="alert-banner mb-4">
        <div className="d-flex align-items-center gap-3">
          <AlertTriangle className="text-warning" size={22} />
          <div className="fw-bold text-orange-950">
            {(stats.critica > 0) 
              ? `${stats.critica} item${stats.critica === 1 ? '' : 's'} em nível crítico de estoque!`
              : `Você possui ${stats.total_alertas} ${stats.total_alertas === 1 ? 'alerta' : 'alertas'} de estoque baixo.`
            }
          </div>
        </div>
      </div>

      <div className="dashboard-card p-3 mb-3">
        <div className="row g-3 align-items-center">
          <div className="col-12 col-lg-4">
            <div className="position-relative">
              <AlertTriangle size={16} className="position-absolute text-muted-foreground" style={{ left: "10px", top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                className="form-control ps-5"
                placeholder="Buscar alerta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="todas">Todos os tipos</option>
              <option value="baixo">Estoque baixo</option>
              <option value="critico">Crítico</option>
            </select>
          </div>
          <div className="col-6 col-lg-3">
            <button className="btn w-100 fw-semibold" style={{ background: "var(--primary)", color: "white" }} onClick={fetchAlertas}>
              <RefreshCw size={16} className="me-1" />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-card p-0 overflow-hidden">
        {loading ? (
          <div className="p-5 text-center text-muted-foreground">Carregando alertas...</div>
        ) : (
          <div className="table-responsive">
            <table className="table mb-0 align-middle">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">PRODUTO</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">ESTOQUE ATUAL</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">ESTOQUE MÍNIMO</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">UNIDADE</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">NÍVEL</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlertas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-5 text-muted-foreground">
                      Nenhum alerta encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredAlertas.map((item) => {
                    const atual = parseFloat(String(item.estoque_atual).replace(",", "."));
                    const minimo = parseFloat(String(item.estoque_minimo).replace(",", "."));
                    const percentual = minimo > 0 ? (atual / minimo) * 100 : 0;
                    const isCritico = percentual <= 50;
                    return (
                      <tr key={item.id} className="border-bottom border-border">
                        <td className="px-4 py-3 fw-semibold">{item.nome}</td>
                        <td className="px-3 py-3">{item.estoque_atual}</td>
                        <td className="px-3 py-3">{item.estoque_minimo}</td>
                        <td className="px-3 py-3">{item.unidade_medida}</td>
                        <td className="px-3 py-3">
                          <Badge variant={isCritico ? "destructive" : "warning"} className="text-xs">
                            {isCritico ? "Crítico" : "Baixo"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo Alerta de Estoque"
        description="Cadastre um novo item para monitoramento de estoque mínimo."
        maxWidth="max-w-xs"
        footer={
          <>
            <Button variant="outline-secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="success" onClick={(e: any) => {
              const form = e.target.closest("form");
              if (form) form.requestSubmit();
            }}>
              <Plus size={16} className="me-1" />
              Criar alerta
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitAlerta} className="p-4">
          <div className="mb-3">
            <label className="form-label fw-semibold">Nome do produto</label>
            <input
              type="text"
              className="form-control"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              placeholder="Ex: Ração Premium 25kg"
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label fw-semibold">Estoque mínimo</label>
            <input
              type="number"
              className="form-control"
              value={formData.estoque_minimo}
              onChange={(e) => setFormData({ ...formData, estoque_minimo: e.target.value })}
              placeholder="Quantidade mínima para alerta"
              step="0.01"
              required
            />
          </div>
          <div className="mb-0">
            <label className="form-label fw-semibold">Unidade</label>
            <select
              className="form-select"
              value={formData.unidade_medida}
              onChange={(e) => setFormData({ ...formData, unidade_medida: e.target.value })}
            >
              <option value="kg">kg</option>
              <option value="saco">saco</option>
              <option value="l">Litro</option>
              <option value="un">Unidade</option>
              <option value="cx">Caixa</option>
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
}