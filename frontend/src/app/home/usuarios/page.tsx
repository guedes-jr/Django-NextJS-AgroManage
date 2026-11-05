"use client";

import OperatorScopeOptions, {emptyOperatorScope, type OperatorScope} from "@/components/auth/OperatorScopeOptions";
import { memberError } from "@/services/memberService";
import WhatsAppContactOptions from "@/components/auth/WhatsAppContactOptions";

import { useCallback, useEffect, useState } from "react";
import { apiClient, getMediaUrl } from "@/services/api";
import { useToast } from "@/components/ui/Toast";
import { Pencil, Plus, Search, X, Mail, Lock, User, Phone } from "lucide-react";
import { type TranslationKey, useOrganizationLocale } from "@/lib/locale";

interface UserData extends OperatorScope {
  organization_responsible: boolean;
  phone_is_whatsapp: boolean;
  receive_system_alerts: boolean;
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string;
  avatar: string | null;
  is_active: boolean;
  created_at: string;
}

const roleConfig: Record<string, { label: TranslationKey; color: string; bg: string }> = {
  admin: { label: "users.role.admin", color: "#1e40af", bg: "#dbeafe" },
  manager: { label: "users.role.manager", color: "#166534", bg: "#dcfce7" },
  operator: { label: "users.role.operator", color: "#374151", bg: "#f3f4f6" },
};

export default function UsuariosPage() {
  const { showToast } = useToast();
  const { language, t } = useOrganizationLocale();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<UserData | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    phone_is_whatsapp: false,
    receive_system_alerts: false,
    role: "operator",
    ...emptyOperatorScope,
    password: "",
    password_confirm: "",
  });

  const loadUsers = useCallback(() => Promise.all([
    apiClient.get<UserData[]>("/auth/members/"),
    apiClient.get<{ id: string }>("/auth/me/"),
  ]).then(([members, profile]) => {
    setUsers(members.data);
    setCurrentUserId(profile.data.id);
    setLoadError("");
  }).catch(() => {
    setLoadError(t("users.loadFailed"));
  }).finally(() => { setLoading(false); }), [t]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const openCreate = () => {
    setEditing(null);
    setFormData({ full_name: "", email: "", phone: "", phone_is_whatsapp: false,
      receive_system_alerts: false, role: "operator", ...emptyOperatorScope,
      password: "", password_confirm: "" });
    setShowModal(true);
  };

  const openEdit = (user: UserData) => {
    setEditing(user);
    setFormData({ full_name: user.full_name, email: user.email, phone: user.phone || "",
      phone_is_whatsapp: user.phone_is_whatsapp, receive_system_alerts: user.receive_system_alerts,
      role: user.role, can_operate_crops: user.can_operate_crops,
      allowed_livestock: user.allowed_livestock, operator_read_only: user.operator_read_only,
      password: "", password_confirm: "" });
    setShowModal(true);
  };

  const handleSaveUser = async () => {
    if (!formData.full_name.trim() || !formData.email.trim()) {
      showToast(t("users.nameAndEmailRequired"), "error");
      return;
    }
    if (!editing && (formData.password.length < 8 || formData.password !== formData.password_confirm)) {
      showToast(t("users.passwordRequired"), "error");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const changes = {
          full_name: formData.full_name, role: formData.role, phone: formData.phone,
          phone_is_whatsapp: formData.phone_is_whatsapp,
          receive_system_alerts: formData.receive_system_alerts,
          can_operate_crops: formData.can_operate_crops,
          allowed_livestock: formData.allowed_livestock,
          operator_read_only: formData.operator_read_only,
        };
        await apiClient.patch(`/auth/members/${editing.id}/`, changes);
      } else {
        await apiClient.post("/auth/members/create/", formData);
      }
      showToast(editing ? t("users.updated") : t("users.created"), "success");
      setShowModal(false);
      await loadUsers();
    } catch (error: unknown) {
      showToast(memberError(error, t("users.saveFailed")), "error", 15000);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language);
  };

  const filteredUsers = users.filter(u => 
    u.full_name?.toLocaleLowerCase(language).includes(search.toLocaleLowerCase(language)) ||
    u.email?.toLocaleLowerCase(language).includes(search.toLocaleLowerCase(language))
  );

  return (
    <>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-4 mb-5">
        <div>
          <h1 className="fw-bold mb-1" style={{ fontSize: '2rem', color: "var(--foreground)" }}>{t("users.title")}</h1>
          <p className="text-muted-foreground mb-0">{t("users.description")}</p>
        </div>
        <button 
          onClick={openCreate}
          className="btn btn-primary d-flex align-items-center gap-2 px-4 py-2.5 rounded-pill fw-bold shadow-sm"
          style={{ background: 'var(--primary)', border: 'none' }}
        >
          <Plus size={20} />
          {t("users.invite")}
        </button>
      </div>

      {loadError && <div className="alert alert-danger" role="alert">{loadError}<button className="btn btn-link" onClick={loadUsers}>{t("users.retry")}</button></div>}
      <div className="dashboard-card overflow-hidden">
        <div className="p-4 border-bottom border-border">
          <div className="position-relative" style={{ maxWidth: '400px' }}>
            <Search size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
            <input 
              type="text" 
              className="w-100" 
              style={{ height: '44px', padding: '0 1rem 0 2.5rem', border: '1.5px solid var(--border)', borderRadius: '12px', background: 'transparent', color: 'var(--foreground)' }} 
              placeholder={t("users.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="table mb-0">
            <thead style={{ background: 'oklch(0.98 0.01 200 / 0.5)' }}>
              <tr>
                <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">{t("users.columnUser")}</th>
                <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">{t("users.columnRole")}</th>
                <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">{t("users.columnStatus")}</th>
                <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground">{t("users.columnCreated")}</th>
                <th className="px-4 py-3 border-0 small fw-bold text-muted-foreground w-px-50"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="text-center p-4" role="status">{t("users.loading")}</td></tr>}
              {filteredUsers.map((user) => {
                const role = roleConfig[user.role?.toLowerCase()];
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
                          backgroundColor: role?.bg || "#f3f4f6",
                          color: role?.color || "#374151",
                          padding: '4px 14px', 
                          display: 'inline-block',
                          lineHeight: '1'
                        }}
                      >
                        {role ? t(role.label) : user.role}
                      </span>
                      {user.role === "operator" && <small className="d-block text-muted mt-2">{[
                        user.can_operate_crops ? t("users.crops") : "",
                        user.allowed_livestock.length ? t("users.livestockCount", { count: user.allowed_livestock.length }) : "",
                      ].filter(Boolean).join(" · ") || t("users.noAreas")}{user.operator_read_only ? ` · ${t("users.readOnly")}` : ""}</small>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="d-flex align-items-center gap-2">
                        <div className="rounded-circle" style={{ width: '8px', height: '8px', background: user.is_active ? '#10b981' : '#f43f5e' }} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: user.is_active ? '#10b981' : '#f43f5e' }}>
                          {user.is_active ? t("users.active") : t("users.inactive")}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" style={{ fontSize: '0.875rem' }}>
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <button className="btn p-2 hover-bg-muted rounded-circle" aria-label={t("users.editAria", { name: user.full_name })} title={t("users.editTitle")} onClick={() => openEdit(user)}>
                        <Pencil size={16} className="text-muted-foreground" />
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
            {t("users.noResults")}
          </div>
        )}
      </div>

      {showModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center px-3" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1100, backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-4 p-4 shadow-xl" style={{ width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h2 className="fw-bold mb-0" style={{ fontSize: '1.25rem' }}>{editing ? t("users.editTitle") : t("users.inviteTitle")}</h2>
              <button className="btn p-0 border-0 bg-transparent hover-opacity-70" onClick={() => setShowModal(false)}>
                <X size={24} className="text-muted" />
              </button>
            </div>

            <div className="d-flex flex-column gap-3">
              <div>
                <label className="small fw-bold text-muted-foreground mb-1 d-block">{t("users.name")}</label>
                <div className="position-relative">
                  <User size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input type="text" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder={t("users.namePlaceholder")} value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="small fw-bold text-muted-foreground mb-1 d-block">{t("users.email")}</label>
                <div className="position-relative">
                  <Mail size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input type="email" disabled={!!editing} className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="nome@empresa.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="small fw-bold text-muted-foreground mb-1 d-block">{t("users.phone")}</label>
                <div className="position-relative">
                  <Phone size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input type="text" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="(00) 00000-0000" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
              </div>

              {formData.role === "operator" && <OperatorScopeOptions value={formData} disabled={saving} onChange={value => setFormData({...formData,...value})}/>}
              <WhatsAppContactOptions value={formData} onChange={value => setFormData({ ...formData, ...value })} />

              <div>
                <label className="small fw-bold text-muted-foreground mb-1 d-block">{t("users.assignment")}</label>
                <select className="w-100" style={{ height: '48px', padding: '0 1rem', border: '1.5px solid var(--border)', borderRadius: '12px', background: 'white' }} value={formData.role} disabled={!!editing && (editing.organization_responsible || editing.id === currentUserId)} onChange={(e) => setFormData({ ...formData, ...(e.target.value !== "operator" ? emptyOperatorScope : {}), role: e.target.value })}>
                  {Object.entries(roleConfig).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>

              {!editing && (<>
              <div className="border-top border-border pt-3 mt-1">
                <label className="small fw-bold text-muted-foreground mb-1 d-block">{t("users.password")}</label>
                <div className="position-relative">
                  <Lock size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input type="password" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="small fw-bold text-muted-foreground mb-1 d-block">{t("users.confirmPassword")}</label>
                <div className="position-relative">
                  <Lock size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input type="password" className="w-100" style={{ height: '48px', padding: '0 1rem 0 2.75rem', border: '1.5px solid var(--border)', borderRadius: '12px' }} placeholder="••••••••" value={formData.password_confirm} onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })} />
                </div>
              </div>

              </>)}
              <div className="d-flex gap-2 mt-4">
                <button className="btn flex-grow-1 py-3 rounded-xl fw-bold text-muted-foreground hover-bg-muted" style={{ border: '1.5px solid var(--border)' }} onClick={() => setShowModal(false)}>{t("users.cancel")}</button>
                <button className="btn flex-grow-1 py-3 rounded-xl text-white fw-bold shadow-sm" style={{ background: 'var(--primary)' }} disabled={saving} onClick={handleSaveUser}>{saving ? t("users.saving") : editing ? t("users.saveChanges") : t("users.inviteMember")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
