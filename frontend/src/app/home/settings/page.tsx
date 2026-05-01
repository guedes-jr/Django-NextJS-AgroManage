"use client";

import { useState, useEffect } from "react";
import { 
  Building2, 
  Users, 
  CreditCard, 
  ShieldCheck, 
  Save, 
  Loader2,
  Trash2,
  FileText,
  Upload,
  X,
  UserPlus,
  Settings,
  Bell,
  Scale,
  AlertTriangle,
  Receipt,
  Download
} from "lucide-react";
import { apiClient } from "@/services/api";
import { Badge } from "@/components/ui/Badge";
import "@/components/dashboard/dashboard.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrganizationAddress {
  id: string;
  label: string;
  street: string;
  number: string;
  city: string;
  state: string;
  is_main: boolean;
}

interface OrganizationContact {
  id: string;
  name: string;
  contact_type: string;
  contact_type_display: string;
  value: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  document: string;
  plan: string;
  plan_display: string;
  logo: string | null;
  address: string;
  phone: string;
  email: string;
  addresses?: OrganizationAddress[];
  contacts?: OrganizationContact[];
  farms_count?: number;
  storage_used?: number;
}

interface Member {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: string;
  role_display: string;
  is_active: boolean;
}

type Tab = "organization" | "members" | "subscription" | "security" | "preferences";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("organization");
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteData, setInviteData] = useState({
    email: '',
    full_name: '',
    role: 'operator',
    phone: ''
  });
  const [subscriptionStats, setSubscriptionStats] = useState({
    farmsCount: 0,
    farmsLimit: 3,
    membersCount: 0,
    membersLimit: 5,
    storageUsed: 0,
    storageLimit: 1
  });
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressModalMode, setAddressModalMode] = useState<'add' | 'edit'>('add');
  const [addressForm, setAddressForm] = useState({
    id: '',
    label: '',
    postal_code: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    is_main: false
  });
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactModalMode, setContactModalMode] = useState<'add' | 'edit'>('add');
  const [contactForm, setContactForm] = useState({
    id: '',
    name: '',
    contact_type: 'phone',
    value: '',
    is_main: false
  });
  const [savingAddress, setSavingAddress] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({
    id: '',
    full_name: '',
    phone: ''
  });
  const [savingMember, setSavingMember] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    new_password_confirm: ''
  });
  const [savingPassword, setSavingPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [preferences, setPreferences] = useState({
    email_notifications: true,
    stock_alerts: true,
    default_unit: 'kg',
    min_stock_alert: 10
  });
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [invoices] = useState([
    { id: '1', date: '2024-04-15', amount: 199.00, status: 'paid', description: 'Plano Pro - Abril 2024' },
    { id: '2', date: '2024-03-15', amount: 199.00, status: 'paid', description: 'Plano Pro - Março 2024' },
    { id: '3', date: '2024-02-15', amount: 199.00, status: 'paid', description: 'Plano Pro - Fevereiro 2024' },
  ]);
  const [paymentMethod] = useState({
    type: 'card',
    last4: '4242',
    brand: 'Visa',
    expiry: '12/26'
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const maskDocument = (val: string) => {
    const v = val.replace(/\D/g, "");
    if (v.length <= 11) {
      return v
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
      return v
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2")
        .slice(0, 18);
    }
  };

  const maskPhone = (val: string) => {
    const v = val.replace(/\D/g, "");
    if (v.length <= 10) {
      return v
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    } else {
      return v
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{5})(\d)/, "$1-$2")
        .slice(0, 15);
    }
  };

  const getPlanLimits = (plan: string) => {
    const limits: Record<string, { farms: number; members: number; storage: number }> = {
      free: { farms: 1, members: 3, storage: 0.5 },
      starter: { farms: 3, members: 5, storage: 1 },
      pro: { farms: 10, members: 20, storage: 10 },
      enterprise: { farms: 999, members: 999, storage: 100 }
    };
    return limits[plan] || limits.free;
  };

  const getPlanPrice = (plan: string) => {
    const prices: Record<string, string> = {
      free: 'Grátis',
      starter: 'R$ 49/mês',
      pro: 'R$ 199/mês',
      enterprise: 'Sob consulta'
    };
    return prices[plan] || prices.free;
  };

  const formatStorage = (gb: number) => {
    if (gb < 1) return `${Math.round(gb * 1024)} MB`;
    return `${gb} GB`;
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "organization") {
        const res = await apiClient.get<Organization>("/organizations/me/");
        const data = res.data;
        setOrg({
          ...data,
          document: maskDocument(data.document || ""),
          phone: maskPhone(data.phone || ""),
        });
      } else if (activeTab === "members") {
        const res = await apiClient.get<Member[]>("/auth/members/");
        setMembers(res.data);
      } else if (activeTab === "subscription") {
        try {
          const orgRes = await apiClient.get<Organization>("/organizations/me/");
          const orgData = orgRes.data;
          
          let membersList: Member[] = [];
          try {
            const membersRes = await apiClient.get<Member[]>("/auth/members/");
            membersList = membersRes.data;
          } catch (membersErr) {
            console.warn("Could not fetch members:", membersErr);
          }
          
          const plan = orgData.plan || 'free';
          const limits = getPlanLimits(plan);
          
          setSubscriptionStats({
            farmsCount: orgData.farms_count ?? 0,
            farmsLimit: limits.farms,
            membersCount: membersList.length,
            membersLimit: limits.members,
            storageUsed: orgData.storage_used ?? 0,
            storageLimit: limits.storage
          });
        } catch (subErr) {
          console.error("Error fetching subscription data:", subErr);
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network')) {
        setError("Erro de conexão. Verifique se o servidor está rodando.");
      } else {
        setError("Erro ao carregar dados.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleUpdateOrg = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!org) return;
    setSaving(true);
    setSuccess(null);
    try {
      const res = await apiClient.patch("/organizations/me/", org);
      setOrg(res.data);
      setSuccess("Organização atualizada com sucesso!");
    } catch {
      setError("Erro ao salvar alterações.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !org) return;
    
    if (!file.type.startsWith('image/')) {
      setError("Por favor, selecione uma imagem.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 2MB.");
      return;
    }

    setUploadingLogo(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      
      const res = await apiClient.patch("/organizations/me/", formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setOrg(res.data);
      setSuccess("Logo atualizado com sucesso!");
    } catch {
      setError("Erro ao fazer upload do logo.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!org) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('logo', '');
      
      const res = await apiClient.patch("/organizations/me/", formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setOrg(res.data);
      setSuccess("Logo removido.");
    } catch {
      setError("Erro ao remover logo.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const openAddressModal = (mode: 'add' | 'edit' = 'add', address?: any) => {
    if (mode === 'edit' && address) {
      setAddressForm({
        id: address.id,
        label: address.label || '',
        postal_code: address.postal_code || '',
        street: address.street || '',
        number: address.number || '',
        complement: address.complement || '',
        neighborhood: address.neighborhood || '',
        city: address.city || '',
        state: address.state || '',
        is_main: address.is_main || false
      });
    } else {
      setAddressForm({
        id: '',
        label: '',
        postal_code: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        is_main: false
      });
    }
    setAddressModalMode(mode);
    setAddressModalOpen(true);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAddress(true);
    setError(null);
    try {
      if (addressModalMode === 'edit' && addressForm.id) {
        const res = await apiClient.patch(`/organizations/addresses/${addressForm.id}/`, addressForm);
        setOrg(prev => prev ? { ...prev, addresses: prev.addresses?.map((a: any) => a.id === addressForm.id ? res.data : a) } : null);
      } else {
        const res = await apiClient.post('/organizations/addresses/', addressForm);
        setOrg(prev => prev ? { ...prev, addresses: [...(prev.addresses || []), res.data] } : null);
      }
      setAddressModalOpen(false);
      setSuccess(addressModalMode === 'edit' ? 'Endereço atualizado!' : 'Endereço adicionado!');
    } catch {
      setError('Erro ao salvar endereço.');
    } finally {
      setSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!confirm('Tem certeza que deseja excluir este endereço?')) return;
    try {
      await apiClient.delete(`/organizations/addresses/${addressId}/`);
      setOrg(prev => prev ? { ...prev, addresses: prev.addresses?.filter((a: any) => a.id !== addressId) } : null);
      setSuccess('Endereço excluído!');
    } catch {
      setError('Erro ao excluir endereço.');
    }
  };

  const openContactModal = (mode: 'add' | 'edit' = 'add', contact?: any) => {
    if (mode === 'edit' && contact) {
      setContactForm({
        id: contact.id,
        name: contact.name || '',
        contact_type: contact.contact_type || 'phone',
        value: contact.value || '',
        is_main: contact.is_main || false
      });
    } else {
      setContactForm({
        id: '',
        name: '',
        contact_type: 'phone',
        value: '',
        is_main: false
      });
    }
    setContactModalMode(mode);
    setContactModalOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingContact(true);
    setError(null);
    try {
      if (contactModalMode === 'edit' && contactForm.id) {
        const res = await apiClient.patch(`/organizations/contacts/${contactForm.id}/`, contactForm);
        setOrg(prev => prev ? { ...prev, contacts: prev.contacts?.map((c: any) => c.id === contactForm.id ? res.data : c) } : null);
      } else {
        const res = await apiClient.post('/organizations/contacts/', contactForm);
        setOrg(prev => prev ? { ...prev, contacts: [...(prev.contacts || []), res.data] } : null);
      }
      setContactModalOpen(false);
      setSuccess(contactModalMode === 'edit' ? 'Contato atualizado!' : 'Contato adicionado!');
    } catch {
      setError('Erro ao salvar contato.');
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Tem certeza que deseja excluir este contato?')) return;
    try {
      await apiClient.delete(`/organizations/contacts/${contactId}/`);
      setOrg(prev => prev ? { ...prev, contacts: prev.contacts?.filter((c: any) => c.id !== contactId) } : null);
      setSuccess('Contato excluído!');
    } catch {
      setError('Erro ao excluir contato.');
    }
  };

  const handleUpdateMemberRole = async (memberId: string, newRole: string) => {
    try {
      await apiClient.patch(`/auth/members/${memberId}/`, { role: newRole });
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
      setSuccess("Cargo atualizado!");
    } catch {
      setError("Erro ao atualizar cargo.");
    }
  };

  const openMemberModal = (member: Member) => {
    setMemberForm({
      id: member.id,
      full_name: member.full_name,
      phone: member.phone || ''
    });
    setMemberModalOpen(true);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMember(true);
    setError(null);
    try {
      const res = await apiClient.patch(`/auth/members/${memberForm.id}/`, {
        full_name: memberForm.full_name,
        phone: memberForm.phone
      });
      setMembers(prev => prev.map(m => m.id === memberForm.id ? { ...m, full_name: memberForm.full_name, phone: memberForm.phone } : m));
      setMemberModalOpen(false);
      setSuccess('Membro atualizado!');
    } catch {
      setError('Erro ao atualizar membro.');
    } finally {
      setSavingMember(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Tem certeza que deseja remover este membro da organização?')) return;
    try {
      await apiClient.delete(`/auth/members/${memberId}/`);
      setMembers(prev => prev.filter(m => m.id !== memberId));
      setSuccess('Membro removido!');
    } catch {
      setError('Erro ao remover membro.');
    }
  };

  const handleToggleMemberStatus = async (memberId: string, currentStatus: boolean) => {
    try {
      const newStatus = !currentStatus;
      await apiClient.patch(`/auth/members/${memberId}/`, { is_active: newStatus });
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, is_active: newStatus } : m));
      setSuccess(newStatus ? 'Membro ativado!' : 'Membro inativado!');
    } catch {
      setError('Erro ao alterar status.');
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setError(null);
    try {
      const res = await apiClient.post("/auth/members/invite/", inviteData);
      setMembers(prev => [...prev, res.data]);
      setInviteModalOpen(false);
      setInviteData({ email: '', full_name: '', role: 'operator', phone: '' });
      setSuccess("Membro convite enviado com sucesso!");
    } catch {
      setError("Erro ao enviar convite. Verifique se o email já está em uso.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.new_password_confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setSavingPassword(true);
    setError(null);
    try {
      await apiClient.post("/auth/change-password/", {
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password,
        new_password_confirm: passwordForm.new_password_confirm
      });
      setPasswordModalOpen(false);
      setPasswordForm({ old_password: '', new_password: '', new_password_confirm: '' });
      setSuccess("Senha alterada com sucesso!");
    } catch (err: any) {
      const msg = err.response?.data?.old_password || err.response?.data?.detail || "Erro ao alterar senha.";
      setError(msg);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleToggle2FA = async () => {
    try {
      if (twoFactorEnabled) {
        await apiClient.post("/auth/disable-2fa/");
        setTwoFactorEnabled(false);
        setSuccess("2FA desativado!");
      } else {
        setSuccess("Configure o 2FA no app autenticador.");
        setTwoFactorEnabled(true);
      }
    } catch {
      setError("Erro ao alterar configuração.");
    }
  };

  const handleSavePreferences = async () => {
    setSavingPreferences(true);
    setError(null);
    try {
      await apiClient.patch("/auth/preferences/", preferences);
      setSuccess("Preferências salvas!");
    } catch {
      setError("Erro ao salvar preferências.");
    } finally {
      setSavingPreferences(false);
    }
  };

  const tabs = [
    { id: "organization", label: "Organização", icon: Building2 },
    { id: "members", label: "Membros", icon: Users },
    { id: "subscription", label: "Assinatura", icon: CreditCard },
    { id: "security", label: "Segurança", icon: ShieldCheck },
    { id: "preferences", label: "Preferências", icon: Settings },
  ];

  return (
    <div className="settings-container">
      <div className="mb-5">
        <h1 className="fw-black mb-1" style={{ color: "var(--foreground)", fontSize: '1.875rem', letterSpacing: '-0.02em' }}>
          Configurações
        </h1>
        <p className="text-muted-foreground fw-medium">Gerencie sua organização e preferências do sistema</p>
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="row g-0">
          {/* Sidebar Tabs */}
          <div className="col-12 col-md-3 border-end" style={{ background: "oklch(0.99 0 0)" }}>
            <div className="p-3 d-flex flex-column gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={`settings-tab-btn d-flex align-items-center gap-3 p-3 rounded-xl border-0 text-start transition-all ${
                    activeTab === tab.id ? "active" : ""
                  }`}
                >
                  <tab.icon size={20} />
                  <span className="fw-bold small">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Content Area */}
          <div className="col-12 col-md-9 p-5">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5">
                <Loader2 className="animate-spin text-primary" size={32} />
              </div>
            ) : (
              <>
                {error && <div className="alert alert-danger border-0 rounded-xl mb-4">{error}</div>}
                {success && <div className="alert alert-success border-0 rounded-xl mb-4">{success}</div>}

                {/* --- Organization Tab --- */}
                {activeTab === "organization" && org && (
                  <div className="fade-in">
                    {/* Logo Upload Section */}
                    <div className="mb-5">
                      <div className="section-header mb-4">
                        <h2 className="fw-bold h5 mb-1">Logo da Empresa</h2>
                        <p className="small text-muted-foreground">Imagem que aparece na interface</p>
                      </div>

                      <div className="d-flex align-items-center gap-4">
                        <div className="logo-preview-container">
                          {org.logo ? (
                            <div className="position-relative">
                              <img 
                                src={org.logo} 
                                alt="Logo" 
                                className="logo-preview rounded-3"
                              />
                              {uploadingLogo && (
                                <div className="logo-loading-overlay">
                                  <Loader2 className="animate-spin text-white" size={24} />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="logo-placeholder rounded-3 d-flex align-items-center justify-content-center">
                              <Building2 size={32} className="text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        <div className="d-flex flex-column gap-2">
                          <label className="btn-primary-elegant btn-sm px-3 py-2 d-flex align-items-center gap-2 cursor-pointer">
                            <Upload size={16} />
                            {uploadingLogo ? 'Enviando...' : 'Selecionar Imagem'}
                            <input 
                              type="file" 
                              accept="image/*"
                              onChange={handleLogoUpload}
                              disabled={uploadingLogo}
                              className="d-none"
                            />
                          </label>
                          {org.logo && (
                            <button 
                              type="button"
                              onClick={handleRemoveLogo}
                              disabled={uploadingLogo}
                              className="btn-sm text-muted-foreground d-flex align-items-center gap-1"
                              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                              <X size={14} />
                              <span className="extra-small">Remover</span>
                            </button>
                          )}
                          <p className="extra-small text-muted-foreground mb-0">
                            PNG, JPG ou GIF. máx 2MB
                          </p>
                        </div>
                      </div>
                    </div>

                    <hr className="my-5" />

                    <form onSubmit={handleUpdateOrg} className="mb-5">
                      <div className="section-header mb-4">
                        <h2 className="fw-bold h5 mb-1">Perfil Básico</h2>
                        <p className="small text-muted-foreground">Identificação principal da empresa</p>
                      </div>

                      <div className="row g-4">
                        <div className="col-12 col-md-6">
                          <label className="form-label small fw-bold">Nome da Empresa</label>
                          <div className="input-group-custom">
                            <Building2 size={18} className="input-icon" />
                            <input
                              type="text"
                              className="form-control-custom"
                              value={org.name}
                              onChange={(e) => setOrg({ ...org, name: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="col-12 col-md-6">
                          <label className="form-label small fw-bold">CNPJ / CPF</label>
                          <div className="input-group-custom">
                            <FileText size={18} className="input-icon" />
                            <input
                              type="text"
                              className="form-control-custom"
                              value={org.document}
                              onChange={(e) => setOrg({ ...org, document: maskDocument(e.target.value) })}
                              placeholder="00.000.000/0001-00"
                              maxLength={18}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 d-flex justify-content-end">
                        <button 
                          type="submit" 
                          disabled={saving}
                          className="btn-primary-elegant px-4 py-2 d-flex align-items-center gap-2"
                        >
                          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                          Salvar Identificação
                        </button>
                      </div>
                    </form>

                    <hr className="my-5" />

                    {/* Endereços Section */}
                    <div className="mb-5">
                      <div className="d-flex justify-content-between align-items-center mb-4">
                        <div>
                          <h2 className="fw-bold h5 mb-1">Endereços</h2>
                          <p className="small text-muted-foreground">Sedes, filiais e locais de operação</p>
                        </div>
                        <button 
                          onClick={() => openAddressModal('add')}
                          className="btn-secondary-elegant py-2 px-3 fw-bold small"
                        >
                          + Adicionar Endereço
                        </button>
                      </div>
                      
                      <div className="table-responsive">
                        <table className="table table-borderless align-middle">
                          <thead className="bg-muted/30">
                            <tr>
                              <th className="small fw-black text-muted-foreground py-3 px-3">Identificação</th>
                              <th className="small fw-black text-muted-foreground py-3">Localização</th>
                              <th className="small fw-black text-muted-foreground py-3">Principal</th>
                              <th className="small fw-black text-muted-foreground py-3 text-end">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {org.addresses && org.addresses.length > 0 ? (
                              org.addresses.map((addr: any) => (
                                <tr key={addr.id} className="border-bottom-dashed">
                                  <td className="py-3 px-3 fw-bold small">{addr.label}</td>
                                  <td className="py-3 small text-muted-foreground">
                                    {addr.street}, {addr.number} - {addr.city}/{addr.state}
                                  </td>
                                  <td className="py-3">
                                    {addr.is_main && <Badge className="bg-success/10 text-success border-0 extra-small fw-bold">SIM</Badge>}
                                  </td>
                                  <td className="py-3 text-end">
                                    <button 
                                      onClick={() => openAddressModal('edit', addr)}
                                      className="btn-icon-muted me-2"
                                    >
                                      <FileText size={14} />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteAddress(addr.id)}
                                      className="btn-icon-danger"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4} className="text-center py-4 text-muted small">Nenhum endereço cadastrado</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <hr className="my-5" />

                    {/* Contatos Section */}
                    <div className="mb-4">
                      <div className="d-flex justify-content-between align-items-center mb-4">
                        <div>
                          <h2 className="fw-bold h5 mb-1">Canais de Contato</h2>
                          <p className="small text-muted-foreground">Emails e telefones dos responsáveis</p>
                        </div>
                        <button 
                          onClick={() => openContactModal('add')}
                          className="btn-secondary-elegant py-2 px-3 fw-bold small"
                        >
                          + Adicionar Contato
                        </button>
                      </div>

                      <div className="table-responsive">
                        <table className="table table-borderless align-middle">
                          <thead className="bg-muted/30">
                            <tr>
                              <th className="small fw-black text-muted-foreground py-3 px-3">Nome / Setor</th>
                              <th className="small fw-black text-muted-foreground py-3">Tipo</th>
                              <th className="small fw-black text-muted-foreground py-3">Valor</th>
                              <th className="small fw-black text-muted-foreground py-3 text-end">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {org.contacts && org.contacts.length > 0 ? (
                              org.contacts.map((contact: any) => (
                                <tr key={contact.id} className="border-bottom-dashed">
                                  <td className="py-3 px-3 fw-bold small">{contact.name}</td>
                                  <td className="py-3">
                                    <Badge className="bg-primary/10 text-primary border-0 extra-small fw-bold">
                                      {contact.contact_type_display}
                                    </Badge>
                                  </td>
                                  <td className="py-3 small text-muted-foreground">{contact.value}</td>
                                  <td className="py-3 text-end">
                                    <button 
                                      onClick={() => openContactModal('edit', contact)}
                                      className="btn-icon-muted me-2"
                                    >
                                      <FileText size={14} />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteContact(contact.id)}
                                      className="btn-icon-danger"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4} className="text-center py-4 text-muted small">Nenhum contato cadastrado</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}


                {/* --- Members Tab --- */}
                {activeTab === "members" && (
                  <div className="fade-in">
                    <div className="d-flex justify-content-between align-items-center mb-4">
                      <div>
                        <h2 className="fw-bold h5 mb-1">Membros da Equipe</h2>
                        <p className="small text-muted-foreground">Gerencie quem tem acesso a esta organização</p>
                      </div>
                      <button 
                        onClick={() => setInviteModalOpen(true)}
                        className="btn-secondary-elegant py-2 px-3 fw-bold small"
                      >
                        + Convidar Membro
                      </button>
                    </div>

                    <div className="table-responsive">
                      <table className="table table-borderless align-middle">
                        <thead>
                          <tr className="border-bottom">
                            <th className="small fw-black text-muted-foreground text-uppercase py-3">Membro</th>
                            <th className="small fw-black text-muted-foreground text-uppercase py-3">Cargo</th>
                            <th className="small fw-black text-muted-foreground text-uppercase py-3">Status</th>
                            <th className="small fw-black text-muted-foreground text-uppercase py-3 text-end">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {members.map((member) => (
                            <tr key={member.id} className="border-bottom-dashed">
                              <td className="py-4">
                                <div className="d-flex align-items-center gap-3">
                                  <div className="avatar-small">
                                    {member.full_name[0]}
                                  </div>
                                  <div>
                                    <div className="fw-bold small">{member.full_name}</div>
                                    <div className="text-muted-foreground extra-small">{member.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <select 
                                  className="form-select-minimal fw-semibold small"
                                  value={member.role}
                                  onChange={(e) => handleUpdateMemberRole(member.id, e.target.value)}
                                >
                                  <option value="owner">Owner</option>
                                  <option value="admin">Admin</option>
                                  <option value="manager">Manager</option>
                                  <option value="operator">Operator</option>
                                  <option value="viewer">Viewer</option>
                                </select>
                              </td>
                              <td>
                                <Badge 
                                  className={`px-2 py-1 border-0 fw-bold extra-small ${
                                    member.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {member.is_active ? "Ativo" : "Inativo"}
                                </Badge>
                              </td>
                              <td className="text-end">
                                <div className="d-flex justify-content-end gap-1">
                                  <button 
                                    onClick={() => openMemberModal(member)}
                                    className="btn-icon-muted"
                                    title="Editar"
                                  >
                                    <FileText size={16} />
                                  </button>
                                  <button 
                                    onClick={() => handleToggleMemberStatus(member.id, member.is_active)}
                                    className={`btn-icon-${member.is_active ? 'warning' : 'success'}`}
                                    title={member.is_active ? "Inativar" : "Ativar"}
                                  >
                                    {member.is_active ? <Trash2 size={16} /> : <Save size={16} />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* --- Preferences Tab --- */}
                {activeTab === "preferences" && (
                  <div className="fade-in">
                    <div className="section-header mb-5">
                      <h2 className="fw-bold h5 mb-1">Preferências do Sistema</h2>
                      <p className="small text-muted-foreground">Configure como o sistema se comporta</p>
                    </div>

                    <div className="dashboard-card p-4 border-dashed mb-4">
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <div className="icon-box bg-primary/10 text-primary rounded-xl p-2">
                          <Bell size={20} />
                        </div>
                        <div>
                          <h4 className="fw-bold small mb-1">Notificações por Email</h4>
                          <p className="extra-small text-muted-foreground mb-0">Receba alertas e relatórios no seu email</p>
                        </div>
                      </div>
                      <div className="form-check form-switch">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="email_notifications"
                          checked={preferences.email_notifications}
                          onChange={e => setPreferences({...preferences, email_notifications: e.target.checked})}
                        />
                        <label className="form-check-label small" htmlFor="email_notifications">
                          Ativar notificações
                        </label>
                      </div>
                    </div>

                    <div className="dashboard-card p-4 border-dashed mb-4">
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <div className="icon-box bg-warning/10 text-warning rounded-xl p-2">
                          <AlertTriangle size={20} />
                        </div>
                        <div>
                          <h4 className="fw-bold small mb-1">Alertas de Estoque</h4>
                          <p className="extra-small text-muted-foreground mb-0">Avise quando produtos atingirem limite mínimo</p>
                        </div>
                      </div>
                      <div className="form-check form-switch mb-3">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="stock_alerts"
                          checked={preferences.stock_alerts}
                          onChange={e => setPreferences({...preferences, stock_alerts: e.target.checked})}
                        />
                        <label className="form-check-label small" htmlFor="stock_alerts">
                          Ativar alertas de estoque
                        </label>
                      </div>
                      {preferences.stock_alerts && (
                        <div className="row align-items-center">
                          <div className="col-auto">
                            <label className="small fw-bold">Limite mínimo:</label>
                          </div>
                          <div className="col-auto">
                            <input
                              type="number"
                              className="form-control-custom"
                              style={{ width: '100px' }}
                              value={preferences.min_stock_alert}
                              onChange={e => setPreferences({...preferences, min_stock_alert: parseInt(e.target.value) || 0})}
                              min={0}
                            />
                          </div>
                          <div className="col-auto">
                            <span className="small text-muted-foreground">unidades</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="dashboard-card p-4 border-dashed mb-4">
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <div className="icon-box bg-success/10 text-success rounded-xl p-2">
                          <Scale size={20} />
                        </div>
                        <div>
                          <h4 className="fw-bold small mb-1">Unidade de Medida Padrão</h4>
                          <p className="extra-small text-muted-foreground mb-0">Unidade usada em cadastros e relatórios</p>
                        </div>
                      </div>
                      <select
                        className="form-control-custom"
                        value={preferences.default_unit}
                        onChange={e => setPreferences({...preferences, default_unit: e.target.value})}
                      >
                        <option value="kg">Quilogramas (kg)</option>
                        <option value="ton">Toneladas (ton)</option>
                        <option value="head">Cabeças (cabeça)</option>
                        <option value="liters">Litros (L)</option>
                      </select>
                    </div>

                    <div className="d-flex justify-content-end mt-4">
                      <button 
                        onClick={handleSavePreferences}
                        disabled={savingPreferences}
                        className="btn-primary-elegant px-4 py-2 d-flex align-items-center gap-2"
                      >
                        {savingPreferences ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        Salvar Preferências
                      </button>
                    </div>
                  </div>
                )}

                {/* --- Subscription Tab --- */}
                {activeTab === "subscription" && (
                  <div className="fade-in py-4">
                    <div className="plan-card p-5 rounded-3xl border d-flex justify-content-between align-items-center" style={{ background: 'var(--primary)', color: 'white' }}>
                      <div>
                        <div className="small fw-bold text-white/70 text-uppercase mb-2">Plano Atual</div>
                        <h3 className="fw-black h1 mb-1">{org?.plan_display || 'FREE'}</h3>
                        <p className="mb-0 text-white/80 fw-medium">{org?.plan === 'free' ? 'Plano gratuito' : 'Faturamento mensal'}</p>
                      </div>
                      <div className="text-end">
                        <div className="h3 fw-black mb-0">{getPlanPrice(org?.plan || 'free')}</div>
                        {org?.plan !== 'enterprise' && (
                          <button className="btn btn-light mt-3 fw-bold rounded-xl px-4 py-2 border-0">Upgrade</button>
                        )}
                      </div>
                    </div>

                    <div className="row g-4 mt-4">
                      <div className="col-md-4">
                        <div className="dashboard-card p-4 text-center border-dashed">
                          <h4 className="small fw-bold text-muted-foreground mb-3">Fazendas</h4>
                          <div className="h3 fw-black">{subscriptionStats.farmsCount} / {subscriptionStats.farmsLimit === 999 ? '∞' : subscriptionStats.farmsLimit}</div>
                          <div className="progress mt-3" style={{ height: '6px' }}>
                            <div className="progress-bar bg-primary" style={{ width: `${Math.min((subscriptionStats.farmsCount / subscriptionStats.farmsLimit) * 100, 100)}%` }}></div>
                          </div>
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="dashboard-card p-4 text-center border-dashed">
                          <h4 className="small fw-bold text-muted-foreground mb-3">Membros</h4>
                          <div className="h3 fw-black">{subscriptionStats.membersCount} / {subscriptionStats.membersLimit === 999 ? '∞' : subscriptionStats.membersLimit}</div>
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="dashboard-card p-4 text-center border-dashed">
                          <h4 className="small fw-bold text-muted-foreground mb-3">Armazenamento</h4>
                          <div className="h3 fw-black">{formatStorage(subscriptionStats.storageUsed)} / {subscriptionStats.storageLimit === 999 ? '∞' : formatStorage(subscriptionStats.storageLimit)}</div>
                          <div className="progress mt-3" style={{ height: '6px' }}>
                            <div className="progress-bar bg-primary" style={{ width: `${Math.min((subscriptionStats.storageUsed / subscriptionStats.storageLimit) * 100, 100)}%` }}></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <hr className="my-5" />

                    {/* Payment Method */}
                    <div className="mb-5">
                      <div className="d-flex justify-content-between align-items-center mb-4">
                        <div>
                          <h2 className="fw-bold h5 mb-1">Método de Pagamento</h2>
                          <p className="small text-muted-foreground">Forma de cobrança da assinatura</p>
                        </div>
                      </div>

                      <div className="dashboard-card p-4 border-dashed">
                        <div className="d-flex align-items-center justify-content-between">
                          <div className="d-flex align-items-center gap-3">
                            <div className="icon-box bg-primary/10 text-primary rounded-xl p-3">
                              <CreditCard size={24} />
                            </div>
                            <div>
                              <h4 className="fw-bold small mb-1">{paymentMethod.brand} •••• {paymentMethod.last4}</h4>
                              <p className="extra-small text-muted-foreground mb-0">Expira {paymentMethod.expiry}</p>
                            </div>
                          </div>
                          <Badge className="bg-success/10 text-success border-0 extra-small fw-bold">Ativo</Badge>
                        </div>
                      </div>
                    </div>

                    {/* Invoice History */}
                    <div>
                      <div className="d-flex justify-content-between align-items-center mb-4">
                        <div>
                          <h2 className="fw-bold h5 mb-1">Histórico de Cobranças</h2>
                          <p className="small text-muted-foreground">Todas as faturas e pagamentos</p>
                        </div>
                      </div>

                      <div className="table-responsive">
                        <table className="table table-borderless align-middle">
                          <thead className="bg-muted/30">
                            <tr>
                              <th className="small fw-black text-muted-foreground py-3 px-3">Data</th>
                              <th className="small fw-black text-muted-foreground py-3">Descrição</th>
                              <th className="small fw-black text-muted-foreground py-3">Valor</th>
                              <th className="small fw-black text-muted-foreground py-3">Status</th>
                              <th className="small fw-black text-muted-foreground py-3 text-end">Ação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoices.map((invoice) => (
                              <tr key={invoice.id} className="border-bottom-dashed">
                                <td className="py-3 px-3 small">{new Date(invoice.date).toLocaleDateString('pt-BR')}</td>
                                <td className="py-3 small text-muted-foreground">{invoice.description}</td>
                                <td className="py-3 small fw-bold">R$ {invoice.amount.toFixed(2)}</td>
                                <td className="py-3">
                                  <Badge className="bg-success/10 text-success border-0 extra-small fw-bold">Pago</Badge>
                                </td>
                                <td className="py-3 text-end">
                                  <button className="btn-icon-muted" title="Baixar PDF">
                                    <Download size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* --- Security Tab --- */}
                {activeTab === "security" && (
                  <div className="fade-in">
                     <div className="section-header mb-5">
                      <h2 className="fw-bold h5 mb-1">Segurança e Acesso</h2>
                      <p className="small text-muted-foreground">Proteja sua conta e monitore acessos</p>
                    </div>

                    <div className="dashboard-card p-4 border-dashed mb-4">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <h4 className="fw-bold small mb-1">Alterar Senha</h4>
                          <p className="extra-small text-muted-foreground mb-0">Recomendamos uma senha forte com símbolos</p>
                        </div>
                        <button 
                          onClick={() => setPasswordModalOpen(true)}
                          className="btn-secondary-elegant py-2 px-4 small fw-bold"
                        >
                          Alterar
                        </button>
                      </div>
                    </div>

                    <div className="dashboard-card p-4 border-dashed">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <h4 className="fw-bold small mb-1">Autenticação de Dois Fatores (2FA)</h4>
                          <p className="extra-small text-muted-foreground mb-0">Adicione uma camada extra de segurança</p>
                        </div>
                        <button 
                          onClick={handleToggle2FA}
                          className={`btn-sm px-3 py-1 fw-bold rounded-xl border-0 ${twoFactorEnabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}
                        >
                          {twoFactorEnabled ? 'Ativado' : 'Desativado'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Invite Member Modal */}
      {inviteModalOpen && (
        <div className="modal-overlay" onClick={() => setInviteModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header d-flex justify-content-between align-items-center mb-4">
              <div>
                <h3 className="fw-bold h5 mb-1">Convidar Membro</h3>
                <p className="small text-muted-foreground mb-0">Adicione um novo membro à sua organização</p>
              </div>
              <button 
                onClick={() => setInviteModalOpen(false)}
                className="btn-icon-muted"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleInviteMember}>
              <div className="mb-3">
                <label className="form-label small fw-bold">Nome Completo</label>
                <input
                  type="text"
                  className="form-control-custom"
                  value={inviteData.full_name}
                  onChange={e => setInviteData({...inviteData, full_name: e.target.value})}
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label small fw-bold">Email</label>
                <input
                  type="email"
                  className="form-control-custom"
                  value={inviteData.email}
                  onChange={e => setInviteData({...inviteData, email: e.target.value})}
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label small fw-bold">Telefone (opcional)</label>
                <input
                  type="text"
                  className="form-control-custom"
                  value={inviteData.phone}
                  onChange={e => setInviteData({...inviteData, phone: e.target.value})}
                />
              </div>

              <div className="mb-4">
                <label className="form-label small fw-bold">Cargo</label>
                <select
                  className="form-control-custom"
                  value={inviteData.role}
                  onChange={e => setInviteData({...inviteData, role: e.target.value})}
                >
                  <option value="operator">Operator</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="d-flex justify-content-end gap-3">
                <button 
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="btn-secondary-elegant px-4 py-2"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={inviteLoading}
                  className="btn-primary-elegant px-4 py-2 d-flex align-items-center gap-2"
                >
                  {inviteLoading ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                  Enviar Convite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Address Modal */}
      {addressModalOpen && (
        <div className="modal-overlay" onClick={() => setAddressModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header d-flex justify-content-between align-items-center mb-4">
              <div>
                <h3 className="fw-bold h5 mb-1">{addressModalMode === 'edit' ? 'Editar Endereço' : 'Novo Endereço'}</h3>
                <p className="small text-muted-foreground mb-0">Endereço da organização</p>
              </div>
              <button onClick={() => setAddressModalOpen(false)} className="btn-icon-muted">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveAddress}>
              <div className="mb-3">
                <label className="form-label small fw-bold">Identificação</label>
                <input
                  type="text"
                  className="form-control-custom"
                  value={addressForm.label}
                  onChange={e => setAddressForm({...addressForm, label: e.target.value})}
                  placeholder="Ex: Sede, Filial, Depósito"
                  required
                />
              </div>
              <div className="row g-3 mb-3">
                <div className="col-4">
                  <label className="form-label small fw-bold">CEP</label>
                  <input
                    type="text"
                    className="form-control-custom"
                    value={addressForm.postal_code}
                    onChange={e => setAddressForm({...addressForm, postal_code: e.target.value})}
                  />
                </div>
                <div className="col-8">
                  <label className="form-label small fw-bold">Rua</label>
                  <input
                    type="text"
                    className="form-control-custom"
                    value={addressForm.street}
                    onChange={e => setAddressForm({...addressForm, street: e.target.value})}
                    required
                  />
                </div>
              </div>
              <div className="row g-3 mb-3">
                <div className="col-3">
                  <label className="form-label small fw-bold">Número</label>
                  <input
                    type="text"
                    className="form-control-custom"
                    value={addressForm.number}
                    onChange={e => setAddressForm({...addressForm, number: e.target.value})}
                  />
                </div>
                <div className="col-9">
                  <label className="form-label small fw-bold">Complemento</label>
                  <input
                    type="text"
                    className="form-control-custom"
                    value={addressForm.complement}
                    onChange={e => setAddressForm({...addressForm, complement: e.target.value})}
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label small fw-bold">Bairro</label>
                <input
                  type="text"
                  className="form-control-custom"
                  value={addressForm.neighborhood}
                  onChange={e => setAddressForm({...addressForm, neighborhood: e.target.value})}
                />
              </div>
              <div className="row g-3 mb-4">
                <div className="col-8">
                  <label className="form-label small fw-bold">Cidade</label>
                  <input
                    type="text"
                    className="form-control-custom"
                    value={addressForm.city}
                    onChange={e => setAddressForm({...addressForm, city: e.target.value})}
                    required
                  />
                </div>
                <div className="col-4">
                  <label className="form-label small fw-bold">UF</label>
                  <input
                    type="text"
                    className="form-control-custom"
                    value={addressForm.state}
                    onChange={e => setAddressForm({...addressForm, state: e.target.value.toUpperCase()})}
                    maxLength={2}
                    required
                  />
                </div>
              </div>
              <div className="form-check mb-4">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="is_main"
                  checked={addressForm.is_main}
                  onChange={e => setAddressForm({...addressForm, is_main: e.target.checked})}
                />
                <label className="form-check-label small" htmlFor="is_main">
                  Endereço principal
                </label>
              </div>
              <div className="d-flex justify-content-end gap-3">
                <button type="button" onClick={() => setAddressModalOpen(false)} className="btn-secondary-elegant px-4 py-2">
                  Cancelar
                </button>
                <button type="submit" disabled={savingAddress} className="btn-primary-elegant px-4 py-2 d-flex align-items-center gap-2">
                  {savingAddress ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {contactModalOpen && (
        <div className="modal-overlay" onClick={() => setContactModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header d-flex justify-content-between align-items-center mb-4">
              <div>
                <h3 className="fw-bold h5 mb-1">{contactModalMode === 'edit' ? 'Editar Contato' : 'Novo Contato'}</h3>
                <p className="small text-muted-foreground mb-0">Canal de contato da organização</p>
              </div>
              <button onClick={() => setContactModalOpen(false)} className="btn-icon-muted">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveContact}>
              <div className="mb-3">
                <label className="form-label small fw-bold">Nome / Setor</label>
                <input
                  type="text"
                  className="form-control-custom"
                  value={contactForm.name}
                  onChange={e => setContactForm({...contactForm, name: e.target.value})}
                  placeholder="Ex: João, Financeiro, Comercial"
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label small fw-bold">Tipo</label>
                <select
                  className="form-control-custom"
                  value={contactForm.contact_type}
                  onChange={e => setContactForm({...contactForm, contact_type: e.target.value})}
                >
                  <option value="phone">Telefone</option>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="form-label small fw-bold">Valor</label>
                <input
                  type="text"
                  className="form-control-custom"
                  value={contactForm.value}
                  onChange={e => setContactForm({...contactForm, value: e.target.value})}
                  placeholder={contactForm.contact_type === 'email' ? 'email@exemplo.com' : '(00) 00000-0000'}
                  required
                />
              </div>
              <div className="form-check mb-4">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="contact_is_main"
                  checked={contactForm.is_main}
                  onChange={e => setContactForm({...contactForm, is_main: e.target.checked})}
                />
                <label className="form-check-label small" htmlFor="contact_is_main">
                  Contato principal
                </label>
              </div>
              <div className="d-flex justify-content-end gap-3">
                <button type="button" onClick={() => setContactModalOpen(false)} className="btn-secondary-elegant px-4 py-2">
                  Cancelar
                </button>
                <button type="submit" disabled={savingContact} className="btn-primary-elegant px-4 py-2 d-flex align-items-center gap-2">
                  {savingContact ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Member Edit Modal */}
      {memberModalOpen && (
        <div className="modal-overlay" onClick={() => setMemberModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header d-flex justify-content-between align-items-center mb-4">
              <div>
                <h3 className="fw-bold h5 mb-1">Editar Membro</h3>
                <p className="small text-muted-foreground mb-0">Atualize os dados do membro</p>
              </div>
              <button onClick={() => setMemberModalOpen(false)} className="btn-icon-muted">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveMember}>
              <div className="mb-3">
                <label className="form-label small fw-bold">Nome Completo</label>
                <input
                  type="text"
                  className="form-control-custom"
                  value={memberForm.full_name}
                  onChange={e => setMemberForm({...memberForm, full_name: e.target.value})}
                  required
                />
              </div>
              <div className="mb-4">
                <label className="form-label small fw-bold">Telefone</label>
                <input
                  type="text"
                  className="form-control-custom"
                  value={memberForm.phone}
                  onChange={e => setMemberForm({...memberForm, phone: e.target.value})}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="d-flex justify-content-end gap-3">
                <button type="button" onClick={() => setMemberModalOpen(false)} className="btn-secondary-elegant px-4 py-2">
                  Cancelar
                </button>
                <button type="submit" disabled={savingMember} className="btn-primary-elegant px-4 py-2 d-flex align-items-center gap-2">
                  {savingMember ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {passwordModalOpen && (
        <div className="modal-overlay" onClick={() => setPasswordModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header d-flex justify-content-between align-items-center mb-4">
              <div>
                <h3 className="fw-bold h5 mb-1">Alterar Senha</h3>
                <p className="small text-muted-foreground mb-0">Crie uma senha forte</p>
              </div>
              <button onClick={() => setPasswordModalOpen(false)} className="btn-icon-muted">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="mb-3">
                <label className="form-label small fw-bold">Senha Atual</label>
                <input
                  type="password"
                  className="form-control-custom"
                  value={passwordForm.old_password}
                  onChange={e => setPasswordForm({...passwordForm, old_password: e.target.value})}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label small fw-bold">Nova Senha</label>
                <input
                  type="password"
                  className="form-control-custom"
                  value={passwordForm.new_password}
                  onChange={e => setPasswordForm({...passwordForm, new_password: e.target.value})}
                  minLength={8}
                  required
                />
              </div>
              <div className="mb-4">
                <label className="form-label small fw-bold">Confirmar Nova Senha</label>
                <input
                  type="password"
                  className="form-control-custom"
                  value={passwordForm.new_password_confirm}
                  onChange={e => setPasswordForm({...passwordForm, new_password_confirm: e.target.value})}
                  minLength={8}
                  required
                />
              </div>
              <div className="d-flex justify-content-end gap-3">
                <button type="button" onClick={() => setPasswordModalOpen(false)} className="btn-secondary-elegant px-4 py-2">
                  Cancelar
                </button>
                <button type="submit" disabled={savingPassword} className="btn-primary-elegant px-4 py-2 d-flex align-items-center gap-2">
                  {savingPassword ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Alterar Senha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .settings-tab-btn {
          color: var(--muted-foreground);
          background: transparent;
        }
        .settings-tab-btn:hover {
          background: oklch(0.96 0.01 145);
          color: var(--primary);
        }
        .settings-tab-btn.active {
          background: white;
          color: var(--primary);
          box-shadow: var(--shadow-sm);
        }
        .form-control-custom {
          width: 100%;
          border: 1px solid var(--border);
          padding: 0.625rem 1rem 0.625rem 2.75rem;
          border-radius: 12px;
          font-weight: 500;
          font-size: 0.875rem;
          transition: all 0.2s;
        }
        .form-control-custom:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 4px oklch(0.5 0.15 145 / 0.1);
        }
        .input-group-custom {
          position: relative;
        }
        .input-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted-foreground);
        }
        .form-select-minimal {
          border: none;
          background: transparent;
          color: var(--foreground);
          cursor: pointer;
          outline: none;
        }
        .avatar-small {
          width: 36px;
          height: 36px;
          background: var(--primary);
          color: white;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 0.75rem;
        }
        .extra-small { font-size: 0.75rem; }
        .border-bottom-dashed { border-bottom: 1px dashed var(--border); }
        .fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .btn-icon-danger {
          background: transparent;
          border: none;
          color: oklch(0.6 0.2 25);
          padding: 8px;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .btn-icon-danger:hover {
          background: oklch(0.95 0.05 25);
        }
        .btn-icon-warning {
          background: transparent;
          border: none;
          color: oklch(0.6 0.2 30);
          padding: 8px;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .btn-icon-warning:hover {
          background: oklch(0.95 0.05 40);
        }
        .btn-icon-success {
          background: transparent;
          border: none;
          color: oklch(0.6 0.2 145);
          padding: 8px;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .btn-icon-success:hover {
          background: oklch(0.9 0.1 145);
        }
        .logo-preview-container {
          width: 80px;
          height: 80px;
          flex-shrink: 0;
        }
        .logo-preview {
          width: 80px;
          height: 80px;
          object-fit: cover;
          border: 1px solid var(--border);
        }
        .logo-placeholder {
          width: 80px;
          height: 80px;
          background: oklch(0.96 0.01 145);
          border: 1px dashed var(--border);
        }
        .logo-loading-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.5);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cursor-pointer { cursor: pointer; }
        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.875rem;
          border-radius: 0.5rem;
        }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(4px);
        }
        .modal-content {
          background: white;
          border-radius: 1rem;
          padding: 1.5rem;
          width: 100%;
          max-width: 480px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          animation: modalIn 0.2s ease-out;
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .btn-icon-muted {
          background: transparent;
          border: none;
          color: var(--muted-foreground);
          padding: 8px;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .btn-icon-muted:hover {
          background: oklch(0.96 0.01 145);
          color: var(--foreground);
        }
      `}</style>
    </div>
  );
}
