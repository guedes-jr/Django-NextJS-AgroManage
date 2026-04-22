"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, getMediaUrl } from "@/services/api";
import { User, Mail, Phone, Shield, Calendar, Edit2, Camera, Check, X } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string;
  avatar: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const roleLabels: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gerente",
  operator: "Operador",
  viewer: "Visualizador",
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      const parsed = JSON.parse(userData);
      setUser(parsed);
      setFormData({
        full_name: parsed.full_name || "",
        email: parsed.email || "",
        phone: parsed.phone || "",
      });
    }

    apiClient
      .get("/auth/me/")
      .then((res) => {
        setUser(res.data);
        localStorage.setItem("user", JSON.stringify(res.data));
        setFormData({
          full_name: res.data.full_name || "",
          email: res.data.email || "",
          phone: res.data.phone || "",
        });
      })
      .catch(() => {
        router.push("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleSave = async () => {
    try {
      // TODO: Implementar upload de avatar no backend
      const { data } = await apiClient.patch("/auth/me/", {
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
      });
      setUser(data);
      localStorage.setItem("user", JSON.stringify(data));
      setEditing(false);
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };
  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "60vh" }}>
        <span className="text-muted">Carregando...</span>
      </div>
    );
  }

  return (
    <>
      <div className="mb-5">
        <h1 className="fw-black mb-1" style={{ color: "var(--foreground)", fontSize: '1.875rem', letterSpacing: '-0.02em' }}>
          Meu Perfil
        </h1>
        <p className="mb-0 text-muted-foreground fw-medium">Gerencie suas informações pessoais</p>
      </div>

      <div className="row g-4">
        <div className="col-12">
          <div className="text-center">
            <input
              type="file"
              id="avatar-upload"
              accept="image/*"
              className="d-none"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const previewUrl = URL.createObjectURL(file);
                  setAvatarPreview(previewUrl);
                  setAvatarFile(file);
                }
              }}
            />
            <label htmlFor="avatar-upload" className="position-relative d-inline-block mb-3" style={{ cursor: 'pointer' }} onMouseEnter={(e) => { if (!avatarPreview) (e.currentTarget.querySelector('.camera-icon') as HTMLElement).style.opacity = '1'; }} onMouseLeave={(e) => { if (!avatarPreview) (e.currentTarget.querySelector('.camera-icon') as HTMLElement).style.opacity = '0'; }}>
              {avatarPreview || user?.avatar ? (
                <img
                  src={avatarPreview ? avatarPreview : getMediaUrl(user?.avatar || "")}
                  alt={user?.full_name}
                  className="rounded-circle object-fit-cover"
                  style={{ width: '150px', height: '150px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
                />
              ) : (
                <div
                  className="rounded-circle bg-primary d-flex align-items-center justify-content-center text-white fw-bold"
                  style={{ width: '150px', height: '150px', fontSize: '3rem', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
                >
                  {user?.full_name?.charAt(0) || "U"}
                </div>
              )}
              <div
                className="camera-icon position-absolute bottom-0 end-0 bg-white rounded-circle d-flex align-items-center justify-content-center"
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)', width: '40px', height: '40px', opacity: 0, transition: 'opacity 0.2s' }}
              >
                <Camera size={18} className="text-muted" />
              </div>
              {avatarPreview && (
                <div className="position-absolute top-0 start-0 w-100 h-100 rounded-circle" style={{ background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', zIndex: 10 }}>
                  <button
                    className="bg-white rounded-circle p-2 border-0 d-flex align-items-center justify-content-center"
                    style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)', width: '44px', height: '44px' }}
                  >
                    <Check size={20} style={{ color: '#22c55e' }} />
                  </button>
                  <button
                    className="bg-white rounded-circle p-2 border-0 d-flex align-items-center justify-content-center"
                    style={{ boxShadow: 'var(--card-premium-shadow)', width: '36px', height: '36px' }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAvatarPreview(null);
                      setAvatarFile(null);
                    }}
                  >
                    <X size={20} style={{ color: '#ef4444' }} />
                  </button>
                </div>
              )}
            </label>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-12">
          <div className="dashboard-card p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h3 className="fw-bold mb-0" style={{ fontSize: "1.125rem" }}>Informações Pessoais</h3>
              {!editing ? (
                <button
                  className="btn d-flex align-items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{ border: '1px solid var(--border)', background: 'var(--foreground)', color: 'var(--background)' }}
                  onClick={() => setEditing(true)}
                >
                  <Edit2 size={16} />
                  Editar
                </button>
              ) : (
                <div className="d-flex gap-2">
                  <button
                    className="btn px-3 py-1.5 rounded-lg"
                    style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
                    onClick={() => {
                      setEditing(false);
                      setFormData({
                        full_name: user?.full_name || "",
                        email: user?.email || "",
                        phone: user?.phone || "",
                      });
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn text-white px-3 py-1.5 rounded-lg"
                    style={{ background: 'var(--primary)' }}
                    onClick={handleSave}
                  >
                    Salvar
                  </button>
                </div>
              )}
            </div>

            <div className="row g-4">
              <div className="col-12 col-md-6">
                <div className="d-flex align-items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--background)' }}>
                  <div className="rounded-lg d-flex align-items-center justify-content-center" style={{ background: '#e8f5e9', borderRadius: '10px', width: '40px', height: '40px' }}>
                    <User size={20} style={{ color: '#22c55e' }} />
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="text-muted-foreground small fw-medium">Nome Completo</div>
                    {editing ? (
                      <input
                        type="text"
                        className="w-100 fw-bold"
                        style={{ height: '32px', padding: '0 0.75rem', border: '1.5px solid var(--border)', borderRadius: '8px' }}
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      />
                    ) : (
                      <div className="fw-bold" style={{ color: 'var(--foreground)' }}>{user?.full_name}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div className="d-flex align-items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--background)' }}>
                  <div className="rounded-lg d-flex align-items-center justify-content-center" style={{ background: '#e8f5e9', borderRadius: '10px', width: '40px', height: '40px' }}>
                    <Mail size={20} style={{ color: '#22c55e' }} />
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="text-muted-foreground small fw-medium">E-mail</div>
                    {editing ? (
                      <input
                        type="email"
                        className="w-100 fw-bold"
                        style={{ height: '32px', padding: '0 0.75rem', border: '1.5px solid var(--border)', borderRadius: '8px' }}
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    ) : (
                      <div className="fw-bold" style={{ color: 'var(--foreground)' }}>{user?.email}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div className="d-flex align-items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--background)' }}>
                  <div className="rounded-lg d-flex align-items-center justify-content-center" style={{ background: '#e8f5e9', borderRadius: '10px', width: '40px', height: '40px' }}>
                    <Phone size={20} style={{ color: '#22c55e' }} />
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="text-muted-foreground small fw-medium">Telefone</div>
                    {editing ? (
                      <input
                        type="text"
                        className="w-100 fw-bold"
                        style={{ height: '32px', padding: '0 0.75rem', border: '1.5px solid var(--border)', borderRadius: '8px' }}
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    ) : (
                      <div className="fw-bold" style={{ color: 'var(--foreground)' }}>{user?.phone || "Não informado"}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div className="d-flex align-items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--background)' }}>
                  <div className="rounded-lg d-flex align-items-center justify-content-center" style={{ background: '#e8f5e9', borderRadius: '10px', width: '40px', height: '40px' }}>
                    <Shield size={20} style={{ color: '#22c55e' }} />
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="text-muted-foreground small fw-medium">Função</div>
                    <div className="fw-bold" style={{ color: 'var(--foreground)' }}>{roleLabels[user?.role || "viewer"] || user?.role}</div>
                  </div>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div className="d-flex align-items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--background)' }}>
                  <div className="rounded-lg d-flex align-items-center justify-content-center" style={{ background: '#e8f5e9', borderRadius: '10px', width: '40px', height: '40px' }}>
                    <Calendar size={20} style={{ color: '#22c55e' }} />
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="text-muted-foreground small fw-medium">Membro desde</div>
                    <div className="fw-bold" style={{ color: 'var(--foreground)' }}>{user?.created_at ? formatDate(user.created_at) : "-"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="dashboard-card p-4">
            <h3 className="fw-bold mb-4" style={{ fontSize: "1.125rem" }}>Últimas Alterações</h3>
            <div className="d-flex flex-column gap-3">
              {[
                { action: "Perfil atualizado", detail: "Dados pessoais foram alterados", date: "2 horas atrás", icon: "user" },
                { action: "Senha alterada", detail: "Sua senha foi atualizada com sucesso", date: "5 dias atrás", icon: "lock" },
                { action: "Novo acesso", detail: "Login realizado em novo dispositivo", date: "1 semana atrás", icon: "login" },
                { action: "Conta criada", detail: "Sua conta foi registrada no sistema", date: "2 semanas atrás", icon: "add" },
              ].map((item, idx) => (
                <div key={idx} className="d-flex align-items-center gap-3 py-2">
                  <div className="text-muted-foreground small flex-shrink-0" style={{ width: '100px' }}>{item.date}</div>
                  <div className="flex-grow-1">
                    <div className="fw-medium" style={{ color: 'var(--foreground)' }}>{item.action}</div>
                  </div>
                  <div className="text-muted-foreground small">{item.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}