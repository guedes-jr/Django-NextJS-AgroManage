"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  ChevronRight,
  Building2,
  Phone,
  MapPin,
  X,
  Check,
  Mail,
  FileText
} from "lucide-react";
import { motion } from "framer-motion";
import { apiClient, getMediaUrl } from "@/services/api";
import { Badge } from "@/components/ui/Badge";
import { FornecedorModal } from "./FornecedorModal";
import Link from "next/link";

export function FornecedoresDashboard() {
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFornecedor, setSelectedFornecedor] = useState<any>(null);

  const fetchFornecedores = async () => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const { data } = await apiClient.get("inventory/fornecedores/");
      if (process.env.NODE_ENV === "development") {
        console.debug("[DEBUG] Fornecedores response:", data);
      }
      const fornecedoresData = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
          ? data.results
          : [];
      setFornecedores(fornecedoresData);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setFornecedores([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      fetchFornecedores();
    }
  }, []);

  const filteredFornecedores = useMemo(() => {
    return fornecedores.filter((f) => {
      const matchesSearch = f.nome.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "todos" || 
                           (statusFilter === "ativo" && f.ativo) || 
                           (statusFilter === "inativo" && !f.ativo);
      return matchesSearch && matchesStatus;
    });
  }, [fornecedores, searchTerm, statusFilter]);

  const handleEdit = (fornecedor: any) => {
    setSelectedFornecedor(fornecedor);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir este fornecedor?")) {
      try {
        await apiClient.delete(`inventory/fornecedores/${id}/`);
        fetchFornecedores();
      } catch (err) {
        console.error("Erro ao excluir fornecedor:", err);
      }
    }
  };

  const totalAtivos = fornecedores.filter(f => f.ativo).length;
  const totalInativos = fornecedores.filter(f => !f.ativo).length;

  return (
    <div className="inventory-container pb-5">
      {/* Header */}
      <div className="mb-6">
        <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-4">
          <Link href="/home/estoque/resumo" className="text-decoration-none text-muted-foreground hover-text-primary">Estoque</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Fornecedores</span>
        </nav>
        
        <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-4">
            <div>
                <h1 className="fw-black mb-1" style={{ fontSize: '2.25rem', letterSpacing: '-0.04em', color: "var(--foreground)" }}>
                    Fornecedores
                </h1>
                <p className="mb-0 text-muted-foreground fw-medium" style={{ paddingBottom: '16px' }}>
                    Cadastre e gerencie os parceiros e fornecedores da sua granja.
                </p>
            </div>
            <button 
              className="btn px-4 py-2.5 rounded-xl font-bold shadow-lg transition-all d-flex align-items-center gap-2"
              style={{ background: 'oklch(0.55 0.16 145)', color: 'white' }}
              onClick={() => {
                setSelectedFornecedor(null);
                setIsModalOpen(true);
              }}
            >
                <Plus size={20} strokeWidth={3} />
                Novo fornecedor
            </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="row g-4 mb-4">
        <div className="col-12 col-md-4">
          <div className="dashboard-card p-4 d-flex align-items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 d-flex align-items-center justify-content-center">
              <Building2 size={22} className="text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-0">Total</p>
              <h3 className="fw-black text-2xl mb-0" style={{ color: "var(--foreground)" }}>{fornecedores.length}</h3>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="dashboard-card p-4 d-flex align-items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-success/10 d-flex align-items-center justify-content-center">
              <Check size={22} className="text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-0">Ativos</p>
              <h3 className="fw-black text-2xl mb-0 text-success">{totalAtivos}</h3>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="dashboard-card p-4 d-flex align-items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-warning/10 d-flex align-items-center justify-content-center">
              <X size={22} className="text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-0">Inativos</p>
              <h3 className="fw-black text-2xl mb-0 text-warning">{totalInativos}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="dashboard-card p-3 mb-4">
        <div className="d-flex flex-column flex-lg-row align-items-lg-center gap-3">
            <div className="flex-grow-1" style={{ maxWidth: '420px' }}>
                <div className="position-relative">
                    <div className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>
                        <Search size={18} />
                    </div>
                    <input 
                        type="text" 
                        placeholder="Buscar por nome ou contato..."
                        className="w-100"
                        style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px', outline: 'none' }}
                        onFocus={(e) => e.target.style.borderColor = 'oklch(0.48 0.14 145)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            <div className="h-8 w-px bg-border d-none d-lg-block" />
            <div className="d-flex align-items-center gap-2">
                <button 
                    onClick={() => setStatusFilter("todos")}
                    className={`btn px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${statusFilter === 'todos' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Todos
                </button>
                <button 
                    onClick={() => setStatusFilter("ativo")}
                    className={`btn px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${statusFilter === 'ativo' ? 'bg-success text-white' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Ativos
                </button>
                <button 
                    onClick={() => setStatusFilter("inativo")}
                    className={`btn px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${statusFilter === 'inativo' ? 'bg-warning text-white' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Inativos
                </button>
            </div>
        </div>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="d-flex flex-column align-items-center justify-content-center py-5">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-3" />
          <span className="text-sm font-medium text-muted-foreground">Carregando fornecedores...</span>
        </div>
      ) : filteredFornecedores.length === 0 ? (
        <div className="dashboard-card p-5 text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-muted d-flex align-items-center justify-content-center">
            <Building2 size={36} className="text-muted-foreground" />
          </div>
          <h3 className="text-lg fw-bold mb-2">Nenhum fornecedor encontrado</h3>
          <p className="text-sm text-muted-foreground mb-4">Tente ajustar seus filtros ou cadastre um novo parceiro.</p>
          <button 
            className="btn px-4 py-2 rounded-lg font-semibold"
            style={{ background: 'oklch(0.55 0.16 145)', color: 'white' }}
            onClick={() => {
              setSelectedFornecedor(null);
              setIsModalOpen(true);
            }}
          >
            <Plus size={18} className="me-2" />
            Cadastrar fornecedor
          </button>
        </div>
      ) : (
        <div className="dashboard-card p-0 overflow-hidden">
          <div className="table-responsive">
            <table className="table mb-0 align-middle">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">FORNECEDOR</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">CONTATO</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">LOCALIDADE</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">CONTRATO</th>
                  <th className="px-3 py-3 border-0 small fw-bold text-muted-foreground">STATUS</th>
                  <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground text-end">AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {filteredFornecedores.map((fornecedor) => (
                  <motion.tr
                    key={fornecedor.id}
                    layout
                    className="border-bottom border-border last-border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="d-flex align-items-center gap-3">
                        {fornecedor.imagem ? (
                          <img
                            src={getMediaUrl(fornecedor.imagem)}
                            alt={fornecedor.nome}
                            className="rounded-xl object-fit-cover"
                            style={{ width: "44px", height: "44px" }}
                          />
                        ) : (
                          <div
                            className="rounded-xl bg-primary/10 d-flex align-items-center justify-content-center fw-bold text-primary"
                            style={{ width: "44px", height: "44px", fontSize: "14px" }}
                          >
                            {fornecedor.nome.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="fw-bold text-foreground">{fornecedor.nome}</div>
                          {fornecedor.cnpj ? (
                            <div className="small text-muted-foreground d-flex align-items-center gap-1">
                              <FileText size={12} />
                              {fornecedor.cnpj}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="d-flex flex-column gap-1">
                        {fornecedor.telefone ? (
                          <span className="small d-flex align-items-center gap-1">
                            <Phone size={12} className="text-muted-foreground" />
                            {fornecedor.telefone}
                          </span>
                        ) : null}
                        {fornecedor.email ? (
                          <span className="small d-flex align-items-center gap-1 text-muted-foreground">
                            <Mail size={12} />
                            {fornecedor.email}
                          </span>
                        ) : null}
                        {!fornecedor.telefone && !fornecedor.email ? (
                          <span className="small text-muted-foreground">-</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 small">
                      {fornecedor.cidade || fornecedor.estado
                        ? `${fornecedor.cidade || ""}${fornecedor.estado ? ` / ${fornecedor.estado}` : ""}`
                        : "-"}
                    </td>
                    <td className="px-3 py-3 small">
                      {fornecedor.tipo_contrato_display || "-"}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={fornecedor.ativo ? "success" : "warning"} className="text-xs">
                        {fornecedor.ativo ? <Check size={12} className="me-1" /> : <X size={12} className="me-1" />}
                        {fornecedor.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="d-flex align-items-center justify-content-end gap-2">
                        <button
                          onClick={() => handleEdit(fornecedor)}
                          className="btn btn-light d-flex align-items-center justify-content-center p-2 rounded-lg"
                          aria-label="Editar fornecedor"
                          title="Editar fornecedor"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(fornecedor.id)}
                          className="btn d-flex align-items-center justify-content-center p-2 rounded-lg bg-danger/10 text-danger hover:bg-danger/20"
                          aria-label="Excluir fornecedor"
                          title="Excluir fornecedor"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      {!loading && filteredFornecedores.length > 0 && (
        <div className="mt-4 text-center" style={{ paddingTop: '12px', paddingBottom: '12px' }}>
          <span className="text-sm fw-medium text-muted-foreground">
            Mostrando {filteredFornecedores.length} de {fornecedores.length} fornecedores
          </span>
        </div>
      )}

      <FornecedorModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={fetchFornecedores}
        fornecedorInitial={selectedFornecedor}
      />
    </div>
  );
}