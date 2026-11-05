"use client";

import WhatsAppContactOptions from "@/components/auth/WhatsAppContactOptions";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, getMediaUrl } from "@/services/api";
import { useToast } from "@/components/ui/Toast";
import { User, Mail, Phone, Shield, Calendar, Edit2, Camera, Check, X, Trash2 } from "lucide-react";
import { type TranslationKey, useOrganizationLocale } from "@/lib/locale";

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string;
  phone_is_whatsapp: boolean;
  receive_system_alerts: boolean;
  avatar: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const roleLabels: Record<string, TranslationKey> = {
  admin: "users.role.admin",
  manager: "users.role.manager",
  operator: "users.role.operator",
};

export default function ProfilePage() {
  const router = useRouter();
  const { language, t } = useOrganizationLocale();
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
    phone_is_whatsapp: false,
    receive_system_alerts: false,
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
        phone_is_whatsapp: userData.phone_is_whatsapp ?? false,
        receive_system_alerts: userData.receive_system_alerts ?? true,
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
          phone_is_whatsapp: res.data.phone_is_whatsapp ?? false,
          receive_system_alerts: res.data.receive_system_alerts ?? true,
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
      const formDataNew = new FormData();
      formDataNew.append("full_name", formData.full_name);
      formDataNew.append("email", formData.email);
      formDataNew.append("phone", formData.phone);
      formDataNew.append("phone_is_whatsapp", String(formData.phone_is_whatsapp));
      formDataNew.append("receive_system_alerts", String(formData.receive_system_alerts));
      
      if (avatarFile) {
        formDataNew.append("avatar", avatarFile);
      } else if (user?.avatar && !avatarPreview) {
        formDataNew.append("avatar", "");
      }
      
      const { data: userData } = await apiClient.patch("/auth/me/", formDataNew);
      setUser(userData as UserProfile);
      localStorage.setItem("user", JSON.stringify(userData));
      setEditing(false);
      setAvatarPreview(null);
      setAvatarFile(null);
      showToast(t("profile.saved"), "success", 15000);
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      showToast(t("profile.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!confirm(t("profile.removeAvatarConfirm"))) return;
    
    setSaving(true);
    try {
      const formDataNew = new FormData();
      formDataNew.append("full_name", formData.full_name);
      formDataNew.append("email", formData.email);
      formDataNew.append("phone", formData.phone);
      formDataNew.append("avatar", "");
      
      const { data: userData } = await apiClient.patch("/auth/me/", formDataNew);
      setUser(userData as UserProfile);
      localStorage.setItem("user", JSON.stringify(userData));
    } catch (error) {
      console.error("Erro ao remover avatar:", error);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const recentActivity: Array<{ action: TranslationKey; detail: TranslationKey; date: TranslationKey }> = [
    { action: "profile.activity.profileUpdated", detail: "profile.activity.profileDetails", date: "profile.activity.twoHours" },
    { action: "profile.activity.passwordChanged", detail: "profile.activity.passwordDetails", date: "profile.activity.fiveDays" },
    { action: "profile.activity.newLogin", detail: "profile.activity.loginDetails", date: "profile.activity.oneWeek" },
    { action: "profile.activity.accountCreated", detail: "profile.activity.accountDetails", date: "profile.activity.twoWeeks" },
  ];

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "60vh" }}>
        <span className="text-muted">{t("profile.loading")}</span>
      </div>
    );
  }

  return (
    <>
      <div className="mb-5">
        <h1 className="fw-black mb-1" style={{ color: "var(--foreground)", fontSize: '1.875rem', letterSpacing: '-0.02em' }}>
          {t("profile.title")}
        </h1>
        <p className="mb-0 text-muted-foreground fw-medium">{t("profile.description")}</p>
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
                      alt={user?.full_name || t("profile.avatar")}
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
                              title={t("profile.save")}
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
                              title={t("profile.cancel")}
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
                              title={t("profile.changePhoto")}
                            >
                              <Edit2 size={20} className="text-white" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); handleRemoveAvatar(); }}
                              className="rounded-circle d-flex align-items-center justify-content-center"
                              style={{ border: '2px solid #22c55e', width: '44px', height: '44px' }}
                              title={t("profile.removePhoto")}
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
                      title={t("profile.addPhoto")}
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
              <h3 className="fw-bold mb-0" style={{ fontSize: "1.125rem" }}>{t("profile.personalInfo")}</h3>
              {!editing ? (
                <button
                  className="btn d-flex align-items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{ border: '1px solid var(--border)', background: 'var(--foreground)', color: 'var(--background)' }}
                  onClick={() => setEditing(true)}
                >
                  <Edit2 size={16} />
                  {t("profile.edit")}
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
                        phone_is_whatsapp: user?.phone_is_whatsapp ?? false,
                        receive_system_alerts: user?.receive_system_alerts ?? true,
                      });
                    }}
                  >
                    {t("profile.cancel")}
                  </button>
                  <button
                    className="btn text-white px-3 py-1.5 rounded-lg"
                    style={{ background: 'var(--primary)' }}
                    onClick={handleSave}
                  >
                    {t("profile.save")}
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
                    <div className="text-muted-foreground small fw-medium">{t("profile.fullName")}</div>
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
                    <div className="text-muted-foreground small fw-medium">{t("profile.email")}</div>
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
                    <div className="text-muted-foreground small fw-medium">{t("profile.phone")}</div>
                    {editing ? (
                      <input
                        type="text"
                        className="w-100 fw-bold"
                        style={{ height: '32px', padding: '0 0.75rem', border: '1.5px solid var(--border)', borderRadius: '8px' }}
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    ) : (
                      <div className="fw-bold" style={{ color: 'var(--foreground)' }}>{user?.phone || t("profile.notProvided")}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-12">
                <WhatsAppContactOptions value={editing ? formData : { phone_is_whatsapp: user?.phone_is_whatsapp ?? false, receive_system_alerts: user?.receive_system_alerts ?? true }} disabled={!editing || saving} onChange={value => setFormData({ ...formData, ...value })} />
              </div>

              <div className="col-12 col-md-6">
                <div className="d-flex align-items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--background)' }}>
                  <div className="rounded-lg d-flex align-items-center justify-content-center" style={{ background: '#e8f5e9', borderRadius: '10px', width: '40px', height: '40px' }}>
                    <Shield size={20} style={{ color: '#22c55e' }} />
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="text-muted-foreground small fw-medium">{t("profile.role")}</div>
                    <div className="fw-bold" style={{ color: 'var(--foreground)' }}>{roleLabels[user?.role || "operator"] ? t(roleLabels[user?.role || "operator"]) : user?.role}</div>
                  </div>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div className="d-flex align-items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--background)' }}>
                  <div className="rounded-lg d-flex align-items-center justify-content-center" style={{ background: '#e8f5e9', borderRadius: '10px', width: '40px', height: '40px' }}>
                    <Calendar size={20} style={{ color: '#22c55e' }} />
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="text-muted-foreground small fw-medium">{t("profile.memberSince")}</div>
                    <div className="fw-bold" style={{ color: 'var(--foreground)' }}>{user?.created_at ? formatDate(user.created_at) : "-"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="dashboard-card p-4">
            <h3 className="fw-bold mb-4" style={{ fontSize: "1.125rem" }}>{t("profile.lastChanges")}</h3>
            <div className="d-flex flex-column gap-3">
              {recentActivity.map((item, idx) => (
                <div key={idx} className="d-flex align-items-center gap-3 py-2">
                  <div className="text-muted-foreground small flex-shrink-0" style={{ width: '100px' }}>{t(item.date)}</div>
                  <div className="flex-grow-1">
                    <div className="fw-medium" style={{ color: 'var(--foreground)' }}>{t(item.action)}</div>
                  </div>
                  <div className="text-muted-foreground small">{t(item.detail)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}