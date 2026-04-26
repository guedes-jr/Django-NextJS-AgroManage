"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, getMediaUrl } from "@/services/api";
import { useToast } from "@/components/ui/Toast";
import { User, Mail, Phone, Shield, Calendar, Edit2, Camera, Check, X, Trash2 } from "lucide-react";

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
  const { showToast } = useToast();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
  });
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      const userData = JSON.parse(userStr);
      setUser(userData as UserProfile);
      setFormData({
        full_name: userData.full_name || "",
        email: userData.email || "",
        phone: userData.phone || "",
      });
    }

    apiClient
      .get("/auth/me/")
      .then((res) => {
        setUser(res.data as UserProfile);
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
    setSaving(true);
    try {
      const accessToken = localStorage.getItem("access_token");
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
      
      const formDataNew = new FormData();
      formDataNew.append("full_name", formData.full_name);
      formDataNew.append("email", formData.email);
      formDataNew.append("phone", formData.phone);
      
      if (avatarFile) {
        formDataNew.append("avatar", avatarFile);
      } else if (user?.avatar && !avatarPreview) {
        formDataNew.append("avatar", "");
      }
      
      const response = await fetch(`${baseUrl}/auth/me/`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
        body: formDataNew,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log("Error:", errorText);
        showToast("Erro ao salvar perfil. Tente novamente.", "error", 15000);
        return;
      }
      
      const userData = await response.json();
      setUser(userData as UserProfile);
      localStorage.setItem("user", JSON.stringify(userData));
      setEditing(false);
      setAvatarPreview(null);
      setAvatarFile(null);
      showToast("Perfil salvo com sucesso! 🎉", "success", 15000);
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!confirm("Tem certeza que deseja remover a foto?")) return;
    
    setSaving(true);
    try {
      const accessToken = localStorage.getItem("access_token");
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
      
      const formDataNew = new FormData();
      formDataNew.append("full_name", formData.full_name);
      formDataNew.append("email", formData.email);
      formDataNew.append("phone", formData.phone);
      formDataNew.append("avatar", "");
      
      const response = await fetch(`${baseUrl}/auth/me/`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
        body: formDataNew,
      });
      
      if (!response.ok) {
        showToast("Erro ao remover avatar. Tente novamente.", "error", 15000);
        return;
      }
      
      const userData = await response.json();
      setUser(userData as UserProfile);
      localStorage.setItem("user", JSON.stringify(userData));
    } catch (error) {
      console.error("Erro ao remover avatar:", error);
    } finally {
      setSaving(false);
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
<label 
              htmlFor="avatar-upload" 
              className="position-relative d-inline-block mb-3" 
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              {(avatarPreview || (user?.avatar && getMediaUrl(user.avatar))) ? (
                <div className="d-flex flex-column align-items-center gap-3">
                  <div className="position-relative">
                    <img
                      src={avatarPreview || (user?.avatar ? getMediaUrl(user.avatar) : "")}
                      alt={user?.full_name || "Avatar"}
                      className="rounded-circle object-fit-cover"
                      style={{ width: '150px', height: '150px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
                    />
                    {isHovered && (
                      <div className="position-absolute top-0 start-0 w-100 h-100 rounded-circle d-flex align-items-center justify-content-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
                        {avatarPreview ? (
                          <div className="d-flex gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSave(); }}
                              disabled={saving}
                              className="rounded-circle d-flex align-items-center justify-content-center"
                              style={{ border: '2px solid #22c55e', width: '44px', height: '44px' }}
                              title="Salvar"
                            >
                              {saving ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : (
                                <Check size={20} className="text-white" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAvatarPreview(null); setAvatarFile(null); }}
                              className="rounded-circle d-flex align-items-center justify-content-center"
                              style={{ border: '2px solid #22c55e', width: '44px', height: '44px' }}
                              title="Cancelar"
                            >
                              <X size={20} className="text-white" />
                            </button>
                          </div>
                        ) : (
                          <div className="d-flex gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); document.getElementById('avatar-upload')?.click(); }}
                              className="rounded-circle d-flex align-items-center justify-content-center"
                              style={{ border: '2px solid #22c55e', width: '44px', height: '44px' }}
                              title="Alterar foto"
                            >
                              <Edit2 size={20} className="text-white" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); handleRemoveAvatar(); }}
                              className="rounded-circle d-flex align-items-center justify-content-center"
                              style={{ border: '2px solid #22c55e', width: '44px', height: '44px' }}
                              title="Remover foto"
                            >
                              <Trash2 size={20} className="text-white" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="d-flex flex-column align-items-center gap-3">
                  <div
                    className="rounded-circle bg-primary d-flex align-items-center justify-content-center text-white fw-bold"
                    style={{ width: '150px', height: '150px', fontSize: '3rem', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
                  >
                    {user?.full_name ? user.full_name.charAt(0).toUpperCase() : "U"}
                  </div>
                  {isHovered && (
                    <label
                      htmlFor="avatar-upload"
                      className="rounded-circle d-flex align-items-center justify-content-center"
                      style={{ border: '2px solid #22c55e', width: '40px', height: '40px', cursor: 'pointer' }}
                      title="Adicionar foto"
                    >
                      <Camera size={18} className="text-white" />
                    </label>
                  )}
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