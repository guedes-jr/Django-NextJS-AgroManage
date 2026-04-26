"use client";

import { useEffect, useState } from "react";
import { apiClient, getMediaUrl } from "@/services/api";
import { useToast } from "@/components/ui/Toast";
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

const roleConfig: Record<string, { label: string; color: string; bg: string }> = {
  owner: { label: "Proprietário", color: "#92400e", bg: "#fef3c7" },
  admin: { label: "Administrador", color: "#1e40af", bg: "#dbeafe" },
  manager: { label: "Gerente", color: "#166534", bg: "#dcfce7" },
  operator: { label: "Operador", color: "#374151", bg: "#f3f4f6" },
  viewer: { label: "Consultor", color: "#155e75", bg: "#ecfeff" },
};

export default function UsuariosPage() {
  const { showToast } = useToast();
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
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const handleCreateUser = async () => {
    try {
      await apiClient.post("/auth/register/", formData);
      showToast("Usuário cadastrado com sucesso! 🎉", "success", 15000);
      setShowModal(false);
      setFormData({
        full_name: "",
        email: "",
        phone: "",
        role: "operator",
        password: "",
        password_confirm: "",
      });
      // Refresh list
      const { data } = await apiClient.get("/auth/users/");
      setUsers(data.results || data);
    } catch (error: any) {
      console.error("Erro ao criar usuário:", error);
      
      // Extract error message from response
      let errorMessage = "Erro ao cadastrar usuário. Tente novamente.";
      
      if (error.response?.data?.non_field_errors) {
        errorMessage = error.response.data.non_field_errors[0];
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.data?.email?.[0]) {
        errorMessage = error.response.data.email[0];
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showToast(errorMessage, "error", 15000);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR");
  };

  const filteredUsers = users.filter(u => 
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-4 mb-5">
        <div>
          <h1 className="fw-bold mb-1" style={{ fontSize: '2rem', color: "var(--foreground)" }}>Gestão de Usuários</h1>
          <p className="text-muted-foreground mb-0">Controle de acessos e permissões da plataforma</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="btn btn-primary d-flex align-items-center gap-2 px-4 py-2.5 rounded-pill fw-bold shadow-sm"
          style={{ background: 'var(--primary)', border: 'none' }}
        >
          <Plus size={20} />
          Convidar Usuário
        </button>
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="p-4 border-bottom border-border">
          <div className="position-relative" style={{ maxWidth: '400px' }}>
            <Search size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
            <input 
              type="text" 
              className="w-100" 
              style={{ height: '44px', padding: '0 1rem 0 2.5rem', border: '1.5px solid var(--border)', borderRadius: '12px', background: 'transparent', color: 'var(--foreground)' }} 
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="table mb-0">
            <thead style={{ background: 'oklch(0.98 0.01 200 / 0.5)' }}>
              <tr>
                <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">USUÁRIO</th>
                <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">FUNÇÃO</th>
                <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">STATUS</th>
                <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">CADASTRADO EM</th>
                <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground w-px-50"></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const role = roleConfig[user.role?.toLowerCase()] || { label: user.role, color: "#374151", bg: "#f3f4f6" };
                return (
                  <tr key={user.id} className="border-bottom border-border">
                    <td className="px-4 py-3">
                      <div className="d-flex align-items-center gap-3">
                        {user.avatar ? (
                          <img src={getMediaUrl(user.avatar)} alt={user.full_name} className="rounded-circle object-fit-cover" style={{ width: '40px', height: '40px' }} />
                        ) : (
                          <div className="rounded-circle bg-primary/10 d-flex align-items-center justify-content-center text-primary fw-bold" style={{ width: '40px', height: '40px', fontSize: '0.875rem' }}>
                            {user.full_name?.charAt(0) || 'U'}
                          </div>
                        )}
                        <div>
                          <div className="fw-bold" style={{ color: 'var(--foreground)' }}>{user.full_name}</div>
                          <div className="text-muted-foreground" style={{ fontSize: '0.8rem' }}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span 
                        className="rounded-pill fw-bold" 
                        style={{ 
                          fontSize: '0.7rem', 
                          backgroundColor: role.bg, 
                          color: role.color,
                          padding: '4px 14px', 
                          display: 'inline-block',
                          lineHeight: '1'
                        }}
                      >
                        {role.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="d-flex align-items-center gap-2">
                        <div className="rounded-circle" style={{ width: '8px', height: '8px', background: user.is_active ? '#10b981' : '#f43f5e' }} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: user.is_active ? '#10b981' : '#f43f5e' }}>
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
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && !loading && (
          <div className="p-5 text-center text-muted-foreground fw-medium">
            Nenhum usuário encontrado para sua busca
          </div>
        )}
      </div>

      {showModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center px-3" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1100, backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-4 p-4 shadow-xl" style={{ width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h2 className="fw-bold mb-0" style={{ fontSize: '1.25rem' }}>Convidar Novo Integrante</h2>
              <button className="btn p-0 border-0 bg-transparent hover-opacity-70" onClick={() => setShowModal(false)}>
                <X size={24} className="text-muted" />
              </button>
            </div>

            <div className="d-flex flex-column gap-3">
              <div>
                <label className="small fw-bold text-muted-foreground mb-1 d-block">Nome completo</label>
                <div className="position-relative">
                  <User size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input type="text" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="Ex: João da Silva" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="small fw-bold text-muted-foreground mb-1 d-block">E-mail Corporativo</label>
                <div className="position-relative">
                  <Mail size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input type="email" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="nome@empresa.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="small fw-bold text-muted-foreground mb-1 d-block">WhatsApp / Telefone</label>
                <div className="position-relative">
                  <Phone size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input type="text" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="(00) 00000-0000" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="small fw-bold text-muted-foreground mb-1 d-block">Atribuição / Função</label>
                <select className="w-100" style={{ height: '48px', padding: '0 1rem', border: '1.5px solid var(--border)', borderRadius: '12px', background: 'white' }} value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                  {Object.entries(roleConfig).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>

              <div className="border-top border-border pt-3 mt-1">
                <label className="small fw-bold text-muted-foreground mb-1 d-block">Senha de acesso temporária</label>
                <div className="position-relative">
                  <Lock size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input type="password" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="small fw-bold text-muted-foreground mb-1 d-block">Confirme a senha</label>
                <div className="position-relative">
                  <Lock size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input type="password" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="••••••••" value={formData.password_confirm} onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })} />
                </div>
              </div>

              <div className="d-flex gap-2 mt-4">
                <button className="btn flex-grow-1 py-3 rounded-xl fw-bold text-muted-foreground hover-bg-muted" style={{ border: '1.5px solid var(--border)' }} onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="btn flex-grow-1 py-3 rounded-xl text-white fw-bold shadow-sm" style={{ background: 'var(--primary)' }} onClick={handleCreateUser}>Convidar Integrante</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
