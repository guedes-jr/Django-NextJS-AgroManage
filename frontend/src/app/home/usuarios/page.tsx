"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { apiClient, getMediaUrl } from "@/services/api";
import { MoreVertical, Plus, Search, X, Mail, Lock, User, Phone } from "lucide-react";

interface UserData {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string;
  avatar: string | null;
  is_active: boolean;
  created_at: string;
}

const roleLabels: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gerente",
  operator: "Operador",
  viewer: "Visualizador",
};

export default function UsuariosPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "operator",
    password: "",
    password_confirm: "",
  });

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data } = await apiClient.get("/auth/users/");
        setUsers(data.results || data);
      } catch (error) {
        console.error("Erro ao buscar usuários:", error);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [router]);

  const filteredUsers = users.filter((user) =>
    user.full_name.toLowerCase().includes(search.toLowerCase()) ||
    user.email.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handleCreateUser = async () => {
    if (formData.password !== formData.password_confirm) {
      alert("As senhas não conferem");
      return;
    }
    try {
      await apiClient.post("/auth/register/", {
        email: formData.email,
        full_name: formData.full_name,
        phone: formData.phone,
        role: formData.role,
        password: formData.password,
        password_confirm: formData.password_confirm,
      });
      setShowModal(false);
      setFormData({
        full_name: "",
        email: "",
        phone: "",
        role: "operator",
        password: "",
        password_confirm: "",
      });
      const { data } = await apiClient.get("/auth/users/");
      setUsers(data.results || data);
    } catch (error) {
      console.error("Erro ao criar usuário:", error);
      alert("Erro ao criar usuário");
    }
  };

  if (loading) {
    return (
      <div className="d-flex" style={{ minHeight: "100vh" }}>
        <AppSidebar />
        <div className="flex-grow-1 d-flex flex-column" style={{ background: "var(--background)" }}>
          <TopBar />
          <main className="flex-grow-1 d-flex align-items-center justify-content-center">
            <span className="text-muted">Carregando...</span>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex" style={{ minHeight: "100vh" }}>
      <AppSidebar />
      <div className="flex-grow-1 d-flex flex-column" style={{ background: "var(--background)" }}>
        <TopBar />
        <main className="flex-grow-1 p-4 p-lg-5 overflow-auto">
          <div className="d-flex justify-content-between align-items-center mb-5">
            <div>
              <h1 className="fw-black mb-1" style={{ color: "var(--foreground)", fontSize: '1.875rem', letterSpacing: '-0.02em' }}>
                Usuários
              </h1>
              <p className="mb-0 text-muted-foreground fw-medium">Gerencie os usuários da equipe</p>
            </div>
            <button className="btn d-flex align-items-center gap-2 px-4 py-2 rounded-xl" style={{ background: 'var(--primary)', color: 'white' }} onClick={() => setShowModal(true)}>
              <Plus size={20} />
              Novo Usuário
            </button>
          </div>

          <div className="dashboard-card">
            <div className="p-3 border-bottom">
              <div className="d-flex align-items-center gap-2" style={{ maxWidth: '300px' }}>
                <Search size={18} className="text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar usuários..."
                  className="border-0 bg-transparent w-100"
                  style={{ outline: 'none' }}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr className="text-start text-muted-foreground" style={{ fontSize: '0.75rem' }}>
                    <th className="px-4 py-3 fw-medium border-0">Usuário</th>
                    <th className="px-4 py-3 fw-medium border-0">Função</th>
                    <th className="px-4 py-3 fw-medium border-0">Status</th>
                    <th className="px-4 py-3 fw-medium border-0">Criado em</th>
                    <th className="px-4 py-3 fw-medium border-0"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="align-middle" style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-4 py-3">
                        <div className="d-flex align-items-center gap-3">
                          {user.avatar ? (
                            <img src={getMediaUrl(user.avatar)} alt={user.full_name} className="rounded-circle object-fit-cover" style={{ width: '40px', height: '40px' }} />
                          ) : (
                            <div className="rounded-circle bg-primary d-flex align-items-center justify-content-center text-white fw-bold" style={{ width: '40px', height: '40px', fontSize: '0.875rem' }}>
                              {user.full_name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="fw-bold" style={{ color: 'var(--foreground)' }}>{user.full_name}</div>
                            <div className="text-muted-foreground" style={{ fontSize: '0.8rem' }}>{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-pill" style={{ background: 'var(--background)', fontSize: '0.75rem' }}>
                          {roleLabels[user.role] || user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="d-flex align-items-center gap-2">
                          <div className="rounded-circle" style={{ width: '8px', height: '8px', background: user.is_active ? '#22c55e' : '#ef4444' }} />
                          <span style={{ fontSize: '0.875rem', color: user.is_active ? '#22c55e' : '#ef4444' }}>
                            {user.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" style={{ fontSize: '0.875rem' }}>
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <button className="btn p-2 hover-bg-muted rounded-circle">
                          <MoreVertical size={16} className="text-muted-foreground" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredUsers.length === 0 && (
              <div className="p-5 text-center text-muted-foreground">
                Nenhum usuário encontrado
              </div>
            )}
          </div>
        </main>
      </div>

      {showModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 100 }}>
          <div className="bg-white rounded-4 p-4" style={{ width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h2 className="fw-bold mb-0" style={{ fontSize: '1.25rem' }}>Novo Usuário</h2>
              <button className="btn p-0 border-0 bg-transparent" onClick={() => setShowModal(false)}>
                <X size={24} className="text-muted" />
              </button>
            </div>

            <div className="d-flex flex-column gap-3">
              <div>
                <label className="small fw-medium text-muted-foreground mb-1 d-block">Nome completo</label>
                <div className="position-relative">
                  <User size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                  <input type="text" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="João da Silva" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="small fw-medium text-muted-foreground mb-1 d-block">E-mail</label>
                <div className="position-relative">
                  <Mail size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                  <input type="email" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="joao@exemplo.com.br" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="small fw-medium text-muted-foreground mb-1 d-block">Telefone</label>
                <div className="position-relative">
                  <Phone size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                  <input type="text" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="(00) 00000-0000" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="small fw-medium text-muted-foreground mb-1 d-block">Função</label>
                <select className="w-100" style={{ height: '48px', padding: '0 1rem', border: '1.5px solid var(--border)', borderRadius: '12px', background: 'white' }} value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                  <option value="owner">Proprietário</option>
                  <option value="admin">Administrador</option>
                  <option value="manager">Gerente</option>
                  <option value="operator">Operador</option>
                  <option value="viewer">Visualizador</option>
                </select>
              </div>

              <div>
                <label className="small fw-medium text-muted-foreground mb-1 d-block">Senha</label>
                <div className="position-relative">
                  <Lock size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                  <input type="password" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="small fw-medium text-muted-foreground mb-1 d-block">Confirmar senha</label>
                <div className="position-relative">
                  <Lock size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                  <input type="password" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="••••••••" value={formData.password_confirm} onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })} />
                </div>
              </div>

              <div className="d-flex gap-2 mt-2">
                <button className="btn flex-grow-1 py-3 rounded-xl" style={{ border: '1.5px solid var(--border)' }} onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="btn flex-grow-1 py-3 rounded-xl text-white" style={{ background: 'var(--primary)' }} onClick={handleCreateUser}>Criar Usuário</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}