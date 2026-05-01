"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Plus,
  Bell,
  BellOff,
  CheckCircle2,
  AlertOctagon,
  Search,
  Filter,
  Package,
  Shield,
  Scale,
  Hash,
  AlertCircle
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
  prioridade: string;
  prioridade_display: string;
  estoque_baixo: boolean;
  categoria: string;
};

const priorityOptions = [
  { value: 'baixa', label: 'Baixa', color: '#10B981' },
  { value: 'media', label: 'Média', color: '#F59E0B' },
  { value: 'alta', label: 'Alta', color: '#F97316' },
  { value: 'critica', label: 'Crítica', color: '#EF4444' },
];

const getPriorityDetails = (prioridade: string) =>
  priorityOptions.find(opt => opt.value === prioridade) || priorityOptions[1];

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
    item_id: "",
    nome: "",
    estoque_minimo: "",
    unidade_medida: "kg",
    prioridade: "media",
  });
  const formRef = useRef<HTMLFormElement>(null);
  const [suggestions, setSuggestions] = useState<{ id: string, nome: string, unidade_medida: string, prioridade: string, estoque_minimo: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  const fetchAlertas = async () => {
    setLoading(true);
    try {
      // Fetch all items that have a minimum stock configured
      const { data } = await apiClient.get<AlertaItem[]>("/inventory/items/all_items/");
      // Filter only those with threshold > 0 or that are explicitly marked for monitoring
      const monitored = Array.isArray(data) ? data.filter(item => parseFloat(item.estoque_minimo) > 0) : [];
      setAlertas(monitored);
    } catch (error) {
      console.error("Erro ao buscar monitoramento:", error);
      setAlertas([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      // In this new mode, 'resolve' could mean acknowledging the alert 
      // or we can keep it as is if there's a specific AlertaEstoque record.
      // For now, let's refresh the list.
      fetchAlertas();
      showToast("Alerta verificado!", "success");
    } catch (error) {
      showToast("Erro ao processar", "error");
    }
  };

  useEffect(() => {
    fetchAlertas();
  }, []);

  const filteredAlertas = useMemo(() => {
    return alertas.filter((item) => {
      const matchesSearch = item.nome.toLowerCase().includes(searchTerm.toLowerCase());

      const atual = parseFloat(String(item.estoque_atual));
      const minimo = parseFloat(String(item.estoque_minimo));
      const isBaixo = atual < minimo;

      const matchesStatus = statusFilter === "todas" ||
        (statusFilter === "baixo" && isBaixo) ||
        (statusFilter === "vencimento" && item.categoria === "medicamento");

      return matchesSearch && matchesStatus;
    });
  }, [alertas, searchTerm, statusFilter]);

  const stats = useMemo((): DashboardStats => {
    const total = alertas.length;
    const critica = alertas.filter(a => {
      const atual = parseFloat(String(a.estoque_atual));
      const minimo = parseFloat(String(a.estoque_minimo));
      return atual <= minimo * 0.5;
    }).length;
    const pendentes = alertas.filter(a => {
      const atual = parseFloat(String(a.estoque_atual));
      const minimo = parseFloat(String(a.estoque_minimo));
      return atual < minimo;
    }).length;

    return {
      total_alertas: total,
      critica,
      atendidas: total - pendentes,
      pendentes,
    };
  }, [alertas]);

  const fetchProdutos = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    setIsLoadingSuggestions(true);
    try {
      const { data } = await apiClient.get("/inventory/items/", {
        params: { search: query, page_size: 10 },
      });

      const items = Array.isArray(data?.results) ? data.results : [];

      setSuggestions(
        items.map((item: any) => ({
          id: item.id,
          nome: item.nome,
          unidade_medida: item.unidade_medida,
          categoria: item.categoria,
          prioridade: item.prioridade,
          estoque_minimo: item.estoque_minimo,
        }))
      );
      setShowSuggestions(true);
    } catch (error) {
      console.error("Erro ao buscar produtos:", error);
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  const handleProdutoSearch = (value: string) => {
    setFormData({ ...formData, nome: value });
    if (searchTimeout) clearTimeout(searchTimeout);
    if (value.length >= 3) {
      const timeout = setTimeout(() => fetchProdutos(value), 300);
      setSearchTimeout(timeout);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectProduto = (produto: {
    id: string;
    nome: string;
    unidade_medida: string;
    prioridade?: string;
    estoque_minimo?: string;
  }) => {
    setFormData({ ...formData, nome: produto.nome, unidade_medida: produto.unidade_medida });
    setShowSuggestions(false);
  };

  useEffect(() => {
    return () => {
      if (searchTimeout) clearTimeout(searchTimeout);
    };
  }, [searchTimeout]);

  const handleSubmitAlerta = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (formData.item_id) {
        // Update existing item thresholds
        await apiClient.patch(`/inventory/items/${formData.item_id}/`, {
          estoque_minimo: parseFloat(formData.estoque_minimo),
          prioridade: formData.prioridade
        });
      } else {
        // Create new item with thresholds
        await apiClient.post("/inventory/items/", {
          nome: formData.nome,
          estoque_minimo: parseFloat(formData.estoque_minimo),
          unidade_medida: formData.unidade_medida,
          prioridade: formData.prioridade,
          categoria: "material",
          ativo: true,
        });
      }

      setModalOpen(false);
      setFormData({ item_id: "", nome: "", estoque_minimo: "", unidade_medida: "kg", prioridade: "media" });

      // Trigger alert generation after saving
      await apiClient.post("/inventory/alertas/gerar_alertas/");
      fetchAlertas();

      showToast("Configuração de alerta salva!", "success");
    } catch (error: any) {
      console.error("Erro ao salvar alerta:", error.response?.data || error);
      showToast("Erro ao salvar alerta.", "error");
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
              <span>Novo alerta</span>
            </button>
            <button
              className="btn h-100 px-3 d-flex align-items-center gap-2 rounded-xl border-0 shadow-sm bg-white"
              style={{ background: "white" }}
              onClick={fetchAlertas}
            >
              <RefreshCw size={18} strokeWidth={3} className="text-muted-foreground" />
              <span className="text-muted-foreground">Atualizar</span>
            </button>
          </div>
        </div>
        <p className="mb-0 text-muted-foreground fw-medium">
          Itens que precisam de reposição para manter o estoque mínimo.
        </p>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12 col-md-3">
          <div className="dashboard-card p-4">
            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle shadow-sm"
                style={{ width: "48px", height: "48px", background: "oklch(0.65 0.15 145 / 0.15)", color: "oklch(0.65 0.15 145)" }}
              >
                <Bell size={24} strokeWidth={2.5} />
              </div>
              <div>
                <div className="text-muted-foreground small fw-black text-uppercase mb-1" style={{ letterSpacing: '0.05em', fontSize: '0.65rem' }}>TOTAL ALERTAS</div>
                <div className="fw-black text-foreground" style={{ fontSize: "1.5rem", lineHeight: 1 }}>{stats.total_alertas}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-3">
          <div className="dashboard-card p-4">
            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle shadow-sm"
                style={{ width: "48px", height: "48px", background: "oklch(0.5 0.2 15 / 0.15)", color: "oklch(0.5 0.2 15)" }}
              >
                <AlertOctagon size={24} strokeWidth={2.5} />
              </div>
              <div>
                <div className="text-rose-600 small fw-black text-uppercase mb-1" style={{ letterSpacing: '0.05em', fontSize: '0.65rem' }}>CRÍTICOS</div>
                <div className="fw-black text-rose-700" style={{ fontSize: "1.5rem", lineHeight: 1 }}>{stats.critica}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-3">
          <div className="dashboard-card p-4">
            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle shadow-sm"
                style={{ width: "48px", height: "48px", background: "oklch(0.6 0.18 25 / 0.15)", color: "oklch(0.6 0.18 25)" }}
              >
                <AlertTriangle size={24} strokeWidth={2.5} />
              </div>
              <div>
                <div className="text-orange-600 small fw-black text-uppercase mb-1" style={{ letterSpacing: '0.05em', fontSize: '0.65rem' }}>PENDENTES</div>
                <div className="fw-black text-orange-700" style={{ fontSize: "1.5rem", lineHeight: 1 }}>{stats.pendentes}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-3">
          <div className="dashboard-card p-4">
            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle shadow-sm"
                style={{ width: "48px", height: "48px", background: "oklch(0.65 0.15 145 / 0.15)", color: "oklch(0.65 0.15 145)" }}
              >
                <CheckCircle2 size={24} strokeWidth={2.5} />
              </div>
              <div>
                <div className="text-emerald-600 small fw-black text-uppercase mb-1" style={{ letterSpacing: '0.05em', fontSize: '0.65rem' }}>ESTÁVEIS</div>
                <div className="fw-black text-emerald-700" style={{ fontSize: "1.5rem", lineHeight: 1 }}>{stats.atendidas}</div>
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
              <option value="vencimento">Vencimento</option>
            </select>
          </div>
          <div className="col-6 col-lg-3">
            <button className="btn w-100" style={{ background: "var(--primary)", color: "white" }} onClick={fetchAlertas}>
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
                  <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">PRODUTO MONITORADO</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">NÍVEL DE ESTOQUE</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">CONFIGURAÇÃO</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">PRIORIDADE</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground text-end">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlertas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-5 text-muted-foreground">
                      Nenhum item configurado para monitoramento.
                    </td>
                  </tr>
                ) : (
                  filteredAlertas.map((item) => {
                    const priority = getPriorityDetails(item.prioridade);
                    const atual = parseFloat(String(item.estoque_atual));
                    const minimo = parseFloat(String(item.estoque_minimo));
                    const isBaixo = atual < minimo;
                    const isCritico = atual <= minimo * 0.5;

                    // Calcular porcentagem para a barra de progresso (limitar a 100%)
                    const porcentagem = minimo > 0 ? Math.min((atual / minimo) * 100, 100) : 100;

                    return (
                      <tr key={item.id} className="border-bottom border-border hover-bg-muted/10 transition-colors">
                        <td className="px-4 py-3">
                          <div className="fw-bold text-foreground">{item.nome}</div>
                          <div className="text-xs text-muted-foreground d-flex align-items-center gap-1">
                            <span className="text-uppercase">{item.categoria}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="d-flex flex-column gap-1" style={{ width: '120px' }}>
                            <div className="d-flex justify-content-between align-items-baseline">
                              <span className={`fw-black fs-5 ${isCritico ? 'text-rose-600' : isBaixo ? 'text-orange-600' : 'text-emerald-600'}`}>
                                {atual}
                              </span>
                              <span className="text-xs text-muted-foreground fw-bold">{item.unidade_medida}</span>
                            </div>
                            <div className="progress" style={{ height: '6px', background: 'var(--border)', borderRadius: '3px' }}>
                              <div
                                className="progress-bar shadow-sm"
                                style={{
                                  width: `${porcentagem}%`,
                                  background: isCritico ? 'oklch(0.5 0.2 15)' : isBaixo ? 'oklch(0.6 0.18 25)' : 'oklch(0.65 0.15 145)',
                                  borderRadius: '3px',
                                  transition: 'width 0.5s ease-in-out'
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-xs text-muted-foreground mb-1 fw-medium">Meta {">"} </div>
                          <div className="fw-black small text-foreground">{minimo} {item.unidade_medida}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className="badge rounded-pill border shadow-sm"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${priority.color}, transparent 92%)`,
                              color: priority.color,
                              borderColor: `color-mix(in srgb, ${priority.color}, transparent 60%)`,
                              fontSize: '0.65rem',
                              padding: '0.4em 0.8em',
                              fontWeight: '800',
                              letterSpacing: '0.02em'
                            }}
                          >
                            {item.prioridade_display || item.prioridade}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-end">
                          {isCritico ? (
                            <div
                              className="d-inline-flex align-items-center gap-2 px-3 py-2 text-white fw-black small shadow-sm"
                              style={{
                                borderRadius: '9999px',
                                background: 'linear-gradient(135deg, oklch(0.5 0.2 15), oklch(0.6 0.2 20))',
                                boxShadow: '0 4px 12px color-mix(in srgb, oklch(0.5 0.2 15), transparent 60%)'
                              }}
                            >
                              <AlertOctagon size={16} />
                              CRÍTICO
                            </div>
                          ) : isBaixo ? (
                            <div
                              className="d-inline-flex align-items-center gap-2 px-3 py-2 text-white fw-black small shadow-sm"
                              style={{
                                borderRadius: '9999px',
                                background: 'linear-gradient(135deg, oklch(0.6 0.18 25), oklch(0.7 0.2 30))',
                                boxShadow: '0 4px 12px color-mix(in srgb, oklch(0.6 0.18 25), transparent 60%)'
                              }}
                            >
                              <AlertTriangle size={16} />
                              BAIXO
                            </div>
                          ) : (
                            <div
                              className="d-inline-flex align-items-center gap-2 px-3 py-2 text-emerald-700 fw-black small border-2"
                              style={{
                                borderRadius: '9999px',
                                background: 'oklch(0.98 0.05 145)',
                                borderColor: 'oklch(0.65 0.15 145 / 0.3)'
                              }}
                            >
                              <CheckCircle2 size={16} className="text-emerald-500" />
                              ESTÁVEL
                            </div>
                          )}
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
        title="Configurar Monitoramento"
        description="Defina as regras de alerta para este item de estoque."
        maxWidth="max-w-md"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100 p-3 bg-muted/10 rounded-b-3xl">
            <button
              type="button"
              className="btn px-4 py-2 rounded-xl fw-bold transition-all"
              style={{ background: "transparent", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
              onClick={() => setModalOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn px-4 py-2 rounded-xl d-flex align-items-center gap-2 fw-black shadow-sm transition-all"
              style={{ background: "var(--primary)", color: "white", border: "none" }}
              onClick={() => {
                if (formRef.current) formRef.current.requestSubmit();
              }}
            >
              Salvar Configuração
            </button>
          </div>
        }
      >
        <form ref={formRef} onSubmit={handleSubmitAlerta} className="p-3">
          {/* Seção: Identificação */}
          <div className="mb-4">
            <div className="d-flex align-items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Package size={18} />
              </div>
              <h6 className="mb-0 fw-black text-uppercase small" style={{ letterSpacing: '0.05em' }}>Identificação do Produto</h6>
            </div>

            <div className="mb-3 position-relative">
              <label className="form-label text-xs fw-bold text-muted-foreground mb-1 ml-1">NOME DO PRODUTO</label>
              <div className="input-group-custom position-relative">
                <div className="position-absolute h-100 d-flex align-items-center px-3 text-muted-foreground" style={{ zIndex: 10 }}>
                  <Package size={16} />
                </div>
                <input
                  type="text"
                  className="form-control rounded-xl py-2 ps-5 border-2 bg-muted/5 focus-ring"
                  placeholder="Ex: Ração Inicial, Vacina A..."
                  value={formData.nome}
                  onChange={(e) => handleProdutoSearch(e.target.value)}
                  onFocus={() => formData.nome.length >= 3 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  required
                  autoComplete="off"
                  style={{ fontSize: '0.9rem' }}
                />

                {showSuggestions && (
                  <div className="position-absolute w-100 mt-2 bg-white border border-border rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2" style={{ zIndex: 1050, maxHeight: "220px", overflowY: "auto" }}>
                    {isLoadingSuggestions ? (
                      <div className="p-4 text-center">
                        <RefreshCw size={20} className="animate-spin text-primary mx-auto mb-2" />
                        <div className="text-xs text-muted-foreground fw-bold">Buscando produtos...</div>
                      </div>
                    ) : suggestions.length > 0 ? (
                      suggestions.map((produto) => (
                        <div
                          key={produto.id}
                          className="p-3 cursor-pointer hover-bg-primary/5 transition-colors border-bottom border-border last-border-0 d-flex align-items-center gap-3"
                          style={{ cursor: "pointer" }}
                          onMouseDown={() => handleSelectProduto(produto)}
                        >
                          <div className="p-2 rounded-lg bg-muted/10 text-muted-foreground">
                            <Package size={14} />
                          </div>
                          <div>
                            <div className="fw-bold text-foreground small">{produto.nome}</div>
                            <div className="text-xs text-muted-foreground">{produto.categoria || 'Sem categoria'}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-muted-foreground">
                        <AlertCircle size={20} className="mx-auto mb-2 opacity-20" />
                        <div className="text-xs fw-bold">Nenhum produto encontrado</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <hr className="my-4 opacity-10" />

          {/* Seção: Regras de Alerta */}
          <div className="mb-3">
            <div className="d-flex align-items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                <Shield size={18} />
              </div>
              <h6 className="mb-0 fw-black text-uppercase small" style={{ letterSpacing: '0.05em' }}>Regras de Monitoramento</h6>
            </div>

            <div className="row g-3 mb-4">
              <div className="col-7">
                <label className="form-label text-xs fw-bold text-muted-foreground mb-1 ml-1">ESTOQUE MÍNIMO</label>
                <div className="position-relative">
                  <div className="position-absolute h-100 d-flex align-items-center px-3 text-muted-foreground" style={{ zIndex: 10 }}>
                    <Hash size={16} />
                  </div>
                  <input
                    type="number"
                    className="form-control rounded-xl py-2 ps-5 border-2 bg-muted/5 focus-ring"
                    placeholder="0.00"
                    value={formData.estoque_minimo}
                    onChange={(e) => setFormData({ ...formData, estoque_minimo: e.target.value })}
                    required
                    style={{ fontSize: '0.9rem' }}
                  />
                </div>
              </div>
              <div className="col-5">
                <label className="form-label text-xs fw-bold text-muted-foreground mb-1 ml-1">UNIDADE</label>
                <div className="position-relative">
                  <div className="position-absolute h-100 d-flex align-items-center px-3 text-muted-foreground" style={{ zIndex: 10 }}>
                    <Scale size={16} />
                  </div>
                  <select
                    className="form-select rounded-xl py-2 ps-5 border-2 bg-muted/5 focus-ring"
                    value={formData.unidade_medida}
                    onChange={(e) => setFormData({ ...formData, unidade_medida: e.target.value })}
                    disabled={!!formData.item_id}
                    style={{ fontSize: '0.9rem' }}
                  >
                    <option value="kg">Quilo (kg)</option>
                    <option value="saco">Saco</option>
                    <option value="l">Litro (l)</option>
                    <option value="un">Unidade (un)</option>
                    <option value="cx">Caixa (cx)</option>
                    <option value="dose">Dose</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mb-2">
              <label className="form-label text-xs fw-bold text-muted-foreground mb-2 d-block ml-1">NÍVEL DE PRIORIDADE</label>
              <div className="d-flex flex-wrap gap-2 p-2 rounded-2xl bg-muted/5 border border-dashed">
                {priorityOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, prioridade: opt.value })}
                    className={`btn btn-sm rounded-pill px-3 py-1 transition-all d-flex align-items-center gap-1 border-2`}
                    style={{
                      backgroundColor: formData.prioridade === opt.value ? opt.color : 'transparent',
                      color: formData.prioridade === opt.value ? 'white' : opt.color,
                      borderColor: opt.color,
                      fontWeight: '800',
                      fontSize: '0.65rem',
                      opacity: formData.prioridade === opt.value ? 1 : 0.6,
                      boxShadow: formData.prioridade === opt.value ? `0 4px 10px ${opt.color}40` : 'none'
                    }}
                  >
                    {formData.prioridade === opt.value && <div className="rounded-circle bg-white" style={{ width: 4, height: 4 }} />}
                    {opt.label.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 p-3 rounded-2xl bg-orange-50 border border-orange-100 d-flex gap-3">
              <div className="text-orange-500 mt-1">
                <AlertCircle size={18} />
              </div>
              <div className="text-xs text-orange-800 leading-relaxed">
                Um alerta será gerado automaticamente assim que o estoque atual for <strong>menor</strong> que o mínimo definido.
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}