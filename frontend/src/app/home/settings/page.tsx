"use client";

import WhatsAppContactOptions from "@/components/auth/WhatsAppContactOptions";
import SegmentFeaturesPanel from "@/components/settings/SegmentFeaturesPanel";
import type { Member } from "@/services/memberService";
import { MembersPanel } from "@/components/settings/MembersPanel";
import { SubscriptionPanel, type PriceBreakdown } from "@/components/settings/SubscriptionPanel";

import { useState, useEffect, useMemo } from "react";
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
  Download,
  Mail,
  Phone,
  Lock,
  User,
  Sun,
  Moon,
  Contrast,
  Languages,
  ChevronDown,
  SlidersHorizontal
} from "lucide-react";
import { apiClient } from "@/services/api";
import { isAxiosError } from "axios";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Theme } from "@/lib/theme";
import "@/components/dashboard/dashboard.css";
import "./settings.css";
import { organizationLanguages, useOrganizationLocale, type TranslationKey } from "@/lib/locale";

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
  language: string;
  addresses?: OrganizationAddress[];
  contacts?: OrganizationContact[];
  farms_count?: number;
  storage_used?: number;
  subscription?: {
    plan_name: string;
    plan_code: string;
    status: string;
    billing_cycle: "monthly" | "yearly";
    current_period_ends_at: string | null;
    monthly_total: string;
    billing_total: string;
    items: Array<{ id: string; tier_id: string; segment_code: string; segment_name: string; segment_subtitle: string; tier_label: string; final_monthly_price: string | null }>;
    price?: PriceBreakdown;
  } | null;
}

type PlanCatalogSegment = { code: string; name: string; subtitle: string; description: string; accent: "green" | "wine"; annual_discount_percent: string; tiers: Array<{ id: string; label: string; monthly_price: string | null; requires_quote: boolean }> };
type ChangePreview = { quote: { public_token: string; billing_cycle: "monthly" | "yearly"; monthly_subtotal: string; monthly_discount: string; monthly_total: string; billing_total: string; requires_contact: boolean }; current_monthly_total: string; new_monthly_total: string; monthly_difference: string; prorated_difference: string; remaining_days: number; effective_at: "immediately" | "next_renewal";
  added_segments?: string[];
  /** Removing a segment: its finance launches are archived for good, operational data is kept. */
  removed_segments?: { segment_code: string; segment_name: string; finance: { count: number; revenue: string; expense: string } }[];
  requires_finance_confirmation?: boolean };

type Tab = "organization" | "members" | "subscription" | "security" | "preferences" | "segmentFeatures";

interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  theme?: Theme;
  email_notifications?: boolean;
  stock_alerts?: boolean;
  default_unit?: string;
  min_stock_alert?: number;
}

type UserPreferences = {
  theme: Theme;
  email_notifications: boolean;
  stock_alerts: boolean;
  default_unit: string;
  min_stock_alert: number;
};

const themeOptions: Array<{
  value: Theme;
  icon: typeof Sun;
  description: string;
}> = [
  {
    value: "light",
    icon: Sun,
    description: "Visual atual, claro e limpo para uso geral.",
  },
  {
    value: "dark",
    icon: Moon,
    description: "Interface escura para reduzir brilho em ambientes internos.",
  },
  {
    value: "contrast",
    icon: Contrast,
    description: "Cores mais fortes para leitura em campo e telas difíceis.",
  },
];

const getStoredCurrentUser = (): CurrentUser | null => {
  if (typeof window === "undefined") return null;

  const userStr = localStorage.getItem("user");
  if (!userStr) return null;

  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

const getInitialPreferences = (): UserPreferences => {
  const storedUser = getStoredCurrentUser();

  return {
    theme: storedUser?.theme || "light",
    email_notifications: storedUser?.email_notifications ?? true,
    stock_alerts: storedUser?.stock_alerts ?? true,
    default_unit: storedUser?.default_unit || "kg",
    min_stock_alert: storedUser?.min_stock_alert ?? 10,
  };
};

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { language, updateLanguage, t } = useOrganizationLocale();
  const themeLabels: Record<Theme, TranslationKey> = {
    light: "settings.preferences.themeLight",
    dark: "settings.preferences.themeDark",
    contrast: "settings.preferences.themeContrast",
  };
  const themeDescriptionKeys: Record<Theme, TranslationKey> = {
    light: "settings.preferences.themeLightDescription",
    dark: "settings.preferences.themeDarkDescription",
    contrast: "settings.preferences.themeContrastDescription",
  };
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "organization";
    const requested = new URLSearchParams(window.location.search).get("tab");
    return (["organization", "members", "subscription", "security", "preferences", "segmentFeatures"] as const).find(tab => tab === requested) || "organization";
  });
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => getStoredCurrentUser());
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [subscriptionStats, setSubscriptionStats] = useState({
    farmsCount: 0,
    farmsLimit: 3,
    membersCount: 0,
    membersLimit: 5,
    storageUsed: 0,
    storageLimit: 1
  });
  const [planSelectorOpen, setPlanSelectorOpen] = useState(false);
  const [planCatalog, setPlanCatalog] = useState<PlanCatalogSegment[]>([]);
  const [selectedTiers, setSelectedTiers] = useState<Record<string, string>>({});
  const [selectedBilling, setSelectedBilling] = useState<"monthly" | "yearly">("monthly");
  const [changePreview, setChangePreview] = useState<ChangePreview | null>(null);
  const [financeAck, setFinanceAck] = useState(false);
  const [planChangeLoading, setPlanChangeLoading] = useState(false);
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

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    new_password_confirm: ''
  });
  const [savingPassword, setSavingPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(() => getInitialPreferences());
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [languageDraft, setLanguageDraft] = useState<typeof language | null>(null);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
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
      } else if (activeTab === "subscription") {
        try {
          const orgRes = await apiClient.get<Organization>("/organizations/me/");
          const orgData = orgRes.data;
          setOrg(orgData);
          
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
      } else if (activeTab === "preferences") {
        const res = await apiClient.get<UserPreferences>("/auth/preferences/");
        const nextPreferences = {
          theme: res.data.theme || theme,
          email_notifications: res.data.email_notifications ?? true,
          stock_alerts: res.data.stock_alerts ?? true,
          default_unit: res.data.default_unit || "kg",
          min_stock_alert: res.data.min_stock_alert ?? 10,
        };
        setPreferences(nextPreferences);
        setTheme(nextPreferences.theme);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network')) {
        setError(t("settings.networkError"));
      } else {
        setError(t("settings.loadError"));
      }
    } finally {
      setLoading(false);
    }
  };

  const openPlanSelector = async () => {
    setPlanChangeLoading(true);
    setChangePreview(null);
    setError(null);
    try {
      const { data } = await apiClient.get<PlanCatalogSegment[]>("/public/plan-segments/");
      setPlanCatalog(data);
      setSelectedTiers(Object.fromEntries((org?.subscription?.items || []).map(item => [item.segment_code, item.tier_id])));
      setSelectedBilling(org?.subscription?.billing_cycle || "monthly");
      setPlanSelectorOpen(true);
    } catch {
      setError(t("settings.plansLoadError"));
    } finally {
      setPlanChangeLoading(false);
    }
  };

  const previewPlanChange = async () => {
    const tierIds = Object.values(selectedTiers);
    if (!tierIds.length) return;
    setPlanChangeLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.post<ChangePreview>("/organizations/me/subscription/change-preview/", { tier_ids: tierIds, billing_cycle: selectedBilling });
      setChangePreview(data);
      setFinanceAck(false);
    } catch {
      setError(t("settings.planPreviewError"));
    } finally {
      setPlanChangeLoading(false);
    }
  };

  const confirmPlanChange = async () => {
    if (!changePreview) return;
    setPlanChangeLoading(true);
    setError(null);
    try {
      if (changePreview.requires_finance_confirmation && !financeAck) { setError(t("segmentRemoval.ackRequired")); return; }
      const { data } = await apiClient.post("/organizations/me/subscription/change/", { quote_token: changePreview.quote.public_token, confirm_finance_removal: financeAck });
      setOrg(current => current ? { ...current, subscription: data.subscription } : current);
      setSuccess(data.detail || t("settings.planUpdated"));
      setPlanSelectorOpen(false);
      setChangePreview(null);
    } catch (requestError: unknown) {
      setError(isAxiosError(requestError) ? requestError.response?.data?.detail || t("settings.planConfirmError") : t("settings.planConfirmError"));
    } finally {
      setPlanChangeLoading(false);
    }
  };

  const money = (value: string | number) => Number(value || 0).toLocaleString(language, { style: "currency", currency: "BRL" });
  const numberFormat = useMemo(() => new Intl.NumberFormat(language), [language]);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleSaveLanguage = async () => {
    setSavingLanguage(true);
    setError(null);
    setSuccess(null);
    try {
      const savedLanguage = await updateLanguage(languageDraft ?? language);
      setLanguageDraft(savedLanguage);
      setSuccess(t("settings.language.saved"));
    } catch (saveError) {
      console.error("Could not save organization language.", saveError);
      setError(t("settings.language.failed"));
    } finally {
      setSavingLanguage(false);
    }
  };

  const handleUpdateOrg = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!org) return;
    setSaving(true);
    setSuccess(null);
    try {
      const res = await apiClient.patch("/organizations/me/", org);
      setOrg(res.data);
      setSuccess(t("settings.org.organizationSaved"));
    } catch {
      setError(t("settings.org.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !org) return;
    
    if (!file.type.startsWith('image/')) {
      setError(t("settings.org.imageOnly"));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError(t("settings.org.imageTooLarge"));
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
      setSuccess(t("settings.org.logoSaved"));
    } catch {
      setError(t("settings.org.logoUploadFailed"));
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
      setSuccess(t("settings.org.logoRemoved"));
    } catch {
      setError(t("settings.org.logoRemoveFailed"));
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
      setSuccess(addressModalMode === 'edit' ? t("settings.org.addressSaved") : t("settings.org.addressAdded"));
    } catch {
      setError(t("settings.org.addressSaveFailed"));
    } finally {
      setSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!confirm(t("settings.org.confirmDeleteAddress"))) return;
    try {
      await apiClient.delete(`/organizations/addresses/${addressId}/`);
      setOrg(prev => prev ? { ...prev, addresses: prev.addresses?.filter((a: any) => a.id !== addressId) } : null);
      setSuccess(t("settings.org.addressDeleted"));
    } catch {
      setError(t("settings.org.addressDeleteFailed"));
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
      setSuccess(contactModalMode === 'edit' ? t("settings.org.contactSaved") : t("settings.org.contactAdded"));
    } catch {
      setError(t("settings.org.contactSaveFailed"));
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm(t("settings.org.confirmDeleteContact"))) return;
    try {
      await apiClient.delete(`/organizations/contacts/${contactId}/`);
      setOrg(prev => prev ? { ...prev, contacts: prev.contacts?.filter((c: any) => c.id !== contactId) } : null);
      setSuccess(t("settings.org.contactDeleted"));
    } catch {
      setError(t("settings.org.contactDeleteFailed"));
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.new_password_confirm) {
      setError(t("settings.passwordsMismatch"));
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
      setSuccess(t("settings.passwordChanged"));
    } catch (err: any) {
      const msg = err.response?.data?.old_password || err.response?.data?.detail || t("settings.passwordChangeError");
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
        setSuccess(t("settings.twoFactorDisabled"));
      } else {
        setSuccess(t("settings.twoFactorSetup"));
        setTwoFactorEnabled(true);
      }
    } catch {
      setError(t("settings.twoFactorError"));
    }
  };

  const handleSavePreferences = async () => {
    setSavingPreferences(true);
    setError(null);
    try {
      const res = await apiClient.patch<UserPreferences>("/auth/preferences/", preferences);
      const nextPreferences = res.data;
      setPreferences(nextPreferences);
      setTheme(nextPreferences.theme);
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const updatedUser = { ...JSON.parse(userStr), ...nextPreferences };
        localStorage.setItem("user", JSON.stringify(updatedUser));
        setCurrentUser(updatedUser);
      }
      setSuccess(t("settings.preferencesSaved"));
    } catch {
      setError(t("settings.preferencesError"));
    } finally {
      setSavingPreferences(false);
    }
  };

  const tabs: { id: Tab; label: string; description: TranslationKey; icon: typeof Building2 }[] = [
    { id: "organization", label: t("settings.tabs.organization"), description: "settings.tabDesc.organization", icon: Building2 },
    { id: "members", label: t("settings.tabs.members"), description: "settings.tabDesc.members", icon: Users },
    { id: "subscription", label: t("settings.tabs.subscription"), description: "settings.tabDesc.subscription", icon: CreditCard },
    { id: "segmentFeatures", label: t("settings.tabs.segmentFeatures"), description: "settings.tabDesc.segmentFeatures", icon: SlidersHorizontal },
    { id: "preferences", label: t("settings.tabs.preferences"), description: "settings.tabDesc.preferences", icon: Settings },
    { id: "security", label: t("settings.tabs.security"), description: "settings.tabDesc.security", icon: ShieldCheck },
  ];
  const selectTab = (next: Tab) => {
    setActiveTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };
  const tabKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    let index = tabs.findIndex(tab => tab.id === activeTab);
    if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") index = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[index].id);
    document.getElementById(`settings-tab-${tabs[index].id}`)?.focus();
  };

  return (
    <div className="settings-container">
      <header className="settings-page-header">
        <h1>{t("settings.title")}</h1>
        <p>{t("settings.description")}</p>
      </header>

      <div className="settings-tabs" role="tablist" aria-label={t("settings.title")}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`settings-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls="settings-panel"
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => selectTab(tab.id as Tab)}
            onKeyDown={tabKeyboard}
            className="settings-tab"
          >
            <tab.icon size={17} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="settings-panel" id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`}>
        {(() => { const current = tabs.find(tab => tab.id === activeTab); return current ? <div className="settings-panel-intro"><span className="settings-panel-icon"><current.icon size={19} aria-hidden="true"/></span><div><h2>{current.label}</h2><p>{t(current.description)}</p></div></div> : null; })()}
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
                  <div className="fade-in preferences-page">
                    {/* Logo Upload Section */}
                    <div className="mb-5">
                      <div className="section-header mb-4">
                        <h2 className="fw-bold h5 mb-1">{t("settings.org.logoTitle")}</h2>
                        <p className="small text-muted-foreground">{t("settings.org.logoDescription")}</p>
                      </div>

                      <div className="d-flex align-items-center gap-4">
                        <div className="logo-preview-container">
                          {org.logo ? (
                            <div className="position-relative">
                              <img 
                                src={org.logo} 
                                alt={t("settings.org.logoTitle")}
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
                            {uploadingLogo ? t("settings.org.uploading") : t("settings.org.selectImage")}
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
                              <span className="extra-small">{t("settings.org.remove")}</span>
                            </button>
                          )}
                          <p className="extra-small text-muted-foreground mb-0">
                            {t("settings.org.logoHelp")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <hr className="my-5" />

                    <form onSubmit={handleUpdateOrg} className="mb-5 organization-profile-form">
                      <div className="section-header mb-4">
                        <h2 className="fw-bold h5 mb-1">{t("settings.org.basicProfile")}</h2>
                        <p className="small text-muted-foreground">{t("settings.org.identificationDescription")}</p>
                      </div>

                      <div className="row g-4">
                        <div className="col-12 col-md-6">
                          <label className="form-label small fw-bold">{t("settings.org.companyName")}</label>
                          <div className="organization-input-group">
                            <Building2 size={18} className="organization-input-icon" />
                            <input
                              type="text"
                              className="organization-input"
                              value={org.name}
                              onChange={(e) => setOrg({ ...org, name: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="col-12 col-md-6">
                          <label className="form-label small fw-bold">{t("settings.org.document")}</label>
                          <div className="organization-input-group">
                            <FileText size={18} className="organization-input-icon" />
                            <input
                              type="text"
                              className="organization-input"
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
                          {t("settings.org.saveIdentification")}
                        </button>
                      </div>
                    </form>

                    <hr className="my-5" />

                    {/* Endereços Section */}
                    <div className="mb-5">
                      <div className="d-flex justify-content-between align-items-center mb-4">
                        <div>
                          <h2 className="fw-bold h5 mb-1">{t("settings.org.addresses")}</h2>
                          <p className="small text-muted-foreground">{t("settings.org.addressDescription")}</p>
                        </div>
                        <button 
                          onClick={() => openAddressModal('add')}
                          className="btn-secondary-elegant py-2 px-3 fw-bold small"
                        >
                          {t("settings.org.addAddress")}
                        </button>
                      </div>
                      
                      <div className="table-responsive">
                        <table className="table table-borderless align-middle">
                          <thead className="bg-muted/30">
                            <tr>
                              <th className="small fw-black text-muted-foreground py-3 px-3">{t("settings.org.identification")}</th>
                              <th className="small fw-black text-muted-foreground py-3">{t("settings.org.location")}</th>
                              <th className="small fw-black text-muted-foreground py-3">{t("settings.org.main")}</th>
                              <th className="small fw-black text-muted-foreground py-3 text-end">{t("settings.org.actions")}</th>
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
                                    {addr.is_main && <Badge className="bg-success/10 text-success border-0 extra-small fw-bold">{t("settings.org.yes")}</Badge>}
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
                                <td colSpan={4} className="text-center py-4 text-muted small">{t("settings.org.noAddress")}</td>
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
                          <h2 className="fw-bold h5 mb-1">{t("settings.org.contacts")}</h2>
                          <p className="small text-muted-foreground">{t("settings.org.contactsDescription")}</p>
                        </div>
                        <button 
                          onClick={() => openContactModal('add')}
                          className="btn-secondary-elegant py-2 px-3 fw-bold small"
                        >
                          {t("settings.org.addContact")}
                        </button>
                      </div>

                      <div className="table-responsive">
                        <table className="table table-borderless align-middle">
                          <thead className="bg-muted/30">
                            <tr>
                              <th className="small fw-black text-muted-foreground py-3 px-3">{t("settings.org.nameSector")}</th>
                              <th className="small fw-black text-muted-foreground py-3">{t("settings.org.type")}</th>
                              <th className="small fw-black text-muted-foreground py-3">{t("settings.org.value")}</th>
                              <th className="small fw-black text-muted-foreground py-3 text-end">{t("settings.org.actions")}</th>
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
                                      title={t("settings.org.editContact")}
                                    >
                                      <FileText size={14} />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteContact(contact.id)}
                                      className="btn-icon-danger"
                                      title={t("settings.org.deleteContact")}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4} className="text-center py-4 text-muted small">{t("settings.org.noContact")}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}


                {/* --- Members Tab --- */}
                {activeTab === "members" && <MembersPanel embedded />}

                {activeTab === "segmentFeatures" && <SegmentFeaturesPanel />}

                {/* --- Preferences Tab --- */}
                {activeTab === "preferences" && (
                  <div className="fade-in">
                    <div className="section-header mb-5">
                      <h2 className="fw-bold h5 mb-1">{t("settings.preferences.title")}</h2>
                      <p className="small text-muted-foreground">{t("settings.preferences.description")}</p>
                    </div>

                    <section className="dashboard-card p-4 border-dashed mb-4">
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <div className="icon-box bg-primary/10 text-primary rounded-xl p-2">
                          <Languages size={20} />
                        </div>
                        <div>
                          <h4 className="fw-bold small mb-1">{t("settings.language.title")}</h4>
                          <p className="extra-small text-muted-foreground mb-0">{t("settings.language.description")}</p>
                        </div>
                      </div>
                      <div className="row g-3 align-items-end">
                        <div className="col-12 col-md-7">
                          <label htmlFor="organization-language" className="form-label small fw-bold">{t("settings.language.label")}</label>
                          <div className="language-picker">
                            <button id="organization-language" type="button" className="language-picker-trigger" aria-haspopup="listbox" aria-expanded={languageMenuOpen} onClick={() => setLanguageMenuOpen(open => !open)} disabled={currentUser?.role !== "admin" || savingLanguage}>
                              <span className="language-flag" data-language={languageDraft ?? language} aria-hidden="true" />
                              <span>{organizationLanguages.find(option => option.value === (languageDraft ?? language))?.label}</span>
                              <ChevronDown size={17} aria-hidden="true" />
                            </button>
                            {languageMenuOpen && <div className="language-picker-menu" role="listbox" aria-labelledby="organization-language">
                              {organizationLanguages.map(option => <button type="button" role="option" aria-selected={option.value === (languageDraft ?? language)} className="language-picker-option" key={option.value} onClick={() => { setLanguageDraft(option.value); setLanguageMenuOpen(false); }}>
                                <span className="language-flag" data-language={option.value} aria-hidden="true" />{option.label}
                              </button>)}
                            </div>}
                          </div>
                        </div>
                        <div className="col-12 col-md-5 d-flex justify-content-md-end">
                          <button type="button" onClick={handleSaveLanguage} disabled={currentUser?.role !== "admin" || savingLanguage || (languageDraft ?? language) === language} className="btn-primary-elegant px-4 py-2 d-flex align-items-center justify-content-center gap-2 w-100 w-md-auto">
                            {savingLanguage ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            {savingLanguage ? t("settings.language.saving") : t("settings.language.save")}
                          </button>
                        </div>
                      </div>
                      {currentUser?.role !== "admin" && <p className="small text-muted-foreground mt-3 mb-0">{t("settings.language.adminOnly")}</p>}
                    </section>

                    <div className="dashboard-card p-4 border-dashed mb-4">
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <div className="icon-box bg-primary/10 text-primary rounded-xl p-2">
                          <Settings size={20} />
                        </div>
                        <div>
                          <h4 className="fw-bold small mb-1">{t("settings.preferences.theme")}</h4>
                          <p className="extra-small text-muted-foreground mb-0">{t("settings.preferences.themeDescription")}</p>
                        </div>
                      </div>

                      <div className="row g-3">
                        {themeOptions.map((option) => {
                          const Icon = option.icon;
                          const selected = preferences.theme === option.value;

                          return (
                            <div className="col-12 col-lg-4" key={option.value}>
                              <button
                                type="button"
                                onClick={() => {
                                  setPreferences(prev => ({ ...prev, theme: option.value }));
                                  setTheme(option.value);
                                }}
                                className={`theme-option-btn w-100 h-100 text-start ${selected ? "active" : ""}`}
                                aria-pressed={selected}
                              >
                                <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
                                  <div className="d-flex align-items-center gap-2">
                                    <span className="theme-option-icon">
                                      <Icon size={18} />
                                    </span>
                                    <span className="fw-bold small">{t(themeLabels[option.value])}</span>
                                  </div>
                                  <span className="theme-option-check" />
                                </div>
                                <p className="extra-small text-muted-foreground mb-0">{t(themeDescriptionKeys[option.value])}</p>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="dashboard-card p-4 border-dashed mb-4">
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <div className="icon-box bg-primary/10 text-primary rounded-xl p-2">
                          <Bell size={20} />
                        </div>
                        <div>
                          <h4 className="fw-bold small mb-1">{t("settings.preferences.email")}</h4>
                          <p className="extra-small text-muted-foreground mb-0">{t("settings.preferences.emailDescription")}</p>
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
                          {t("settings.preferences.enableNotifications")}
                        </label>
                      </div>
                    </div>

                    <div className="dashboard-card p-4 border-dashed mb-4">
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <div className="icon-box bg-warning/10 text-warning rounded-xl p-2">
                          <AlertTriangle size={20} />
                        </div>
                        <div>
                          <h4 className="fw-bold small mb-1">{t("settings.preferences.stockAlerts")}</h4>
                          <p className="extra-small text-muted-foreground mb-0">{t("settings.preferences.stockAlertsDescription")}</p>
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
                          {t("settings.preferences.enableStockAlerts")}
                        </label>
                      </div>
                      {preferences.stock_alerts && (
                        <div className="row align-items-center">
                          <div className="col-auto">
                            <label className="small fw-bold">{t("settings.preferences.minimumLimit")}</label>
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
                            <span className="small text-muted-foreground">{t("settings.preferences.units")}</span>
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
                          <h4 className="fw-bold small mb-1">{t("settings.preferences.defaultUnit")}</h4>
                          <p className="extra-small text-muted-foreground mb-0">{t("settings.preferences.defaultUnitDescription")}</p>
                        </div>
                      </div>
                      <select
                        className="form-control-custom"
                        value={preferences.default_unit}
                        onChange={e => setPreferences({...preferences, default_unit: e.target.value})}
                      >
                        <option value="kg">{t("settings.preferences.kilograms")}</option>
                        <option value="ton">{t("settings.preferences.tons")}</option>
                        <option value="head">{t("settings.preferences.heads")}</option>
                        <option value="liters">{t("settings.preferences.liters")}</option>
                      </select>
                    </div>

                    <div className="d-flex justify-content-end mt-4">
                      <button 
                        onClick={handleSavePreferences}
                        disabled={savingPreferences}
                        className="btn-primary-elegant px-4 py-2 d-flex align-items-center gap-2"
                      >
                        {savingPreferences ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        {t("settings.preferences.save")}
                      </button>
                    </div>
                  </div>
                )}

                {/* --- Subscription Tab --- */}
                {activeTab === "subscription" && (
                  <SubscriptionPanel
                    price={org?.subscription?.price}
                    statusLabel={org?.subscription?.status === "active" ? t("settings.subscription.active") : org?.subscription?.status || "—"}
                    billingCycle={org?.subscription?.billing_cycle}
                    canManage={currentUser?.role === "admin"}
                    changing={planChangeLoading}
                    onChangeSegments={openPlanSelector}
                    onPriceChange={price => setOrg(current => current?.subscription ? { ...current, subscription: { ...current.subscription, price, monthly_total: price.total } } : current)}
                    usage={[
                      { label: t("settings.subscription.farms"), used: numberFormat.format(subscriptionStats.farmsCount), limit: subscriptionStats.farmsLimit === 999 ? "∞" : numberFormat.format(subscriptionStats.farmsLimit), percent: subscriptionStats.farmsLimit === 999 ? null : subscriptionStats.farmsCount / subscriptionStats.farmsLimit * 100 },
                      { label: t("settings.subscription.members"), used: numberFormat.format(subscriptionStats.membersCount), limit: subscriptionStats.membersLimit === 999 ? "∞" : numberFormat.format(subscriptionStats.membersLimit), percent: subscriptionStats.membersLimit === 999 ? null : subscriptionStats.membersCount / subscriptionStats.membersLimit * 100 },
                      { label: t("settings.subscription.storage"), used: formatStorage(subscriptionStats.storageUsed), limit: subscriptionStats.storageLimit === 999 ? "∞" : formatStorage(subscriptionStats.storageLimit), percent: subscriptionStats.storageLimit === 999 ? null : subscriptionStats.storageUsed / subscriptionStats.storageLimit * 100 },
                    ]}
                  />
                )}

                {/* --- Security Tab --- */}
                {activeTab === "security" && (
                  <div className="fade-in">
                     <div className="section-header mb-5">
                      <h2 className="fw-bold h5 mb-1">{t("settings.security.title")}</h2>
                      <p className="small text-muted-foreground">{t("settings.security.description")}</p>
                    </div>

                    <div className="dashboard-card p-4 border-dashed mb-4">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <h4 className="fw-bold small mb-1">{t("settings.security.changePassword")}</h4>
                          <p className="extra-small text-muted-foreground mb-0">{t("settings.security.passwordTip")}</p>
                        </div>
                        <button 
                          onClick={() => setPasswordModalOpen(true)}
                          className="btn-secondary-elegant py-2 px-4 small fw-bold"
                        >
                          {t("settings.security.change")}
                        </button>
                      </div>
                    </div>

                    <div className="dashboard-card p-4 border-dashed">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <h4 className="fw-bold small mb-1">{t("settings.security.twoFactor")}</h4>
                          <p className="extra-small text-muted-foreground mb-0">{t("settings.security.twoFactorDescription")}</p>
                        </div>
                        <button 
                          onClick={handleToggle2FA}
                          className={`btn-sm px-3 py-1 fw-bold rounded-xl border-0 ${twoFactorEnabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}
                        >
                          {twoFactorEnabled ? t("settings.security.enabled") : t("settings.security.disabled")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </>
            )}
      </div>


      {/* Address Modal */}
      {addressModalOpen && (
        <div className="modal-overlay" onClick={() => setAddressModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header d-flex justify-content-between align-items-center mb-4">
              <div>
                <h3 className="fw-bold h5 mb-1">{addressModalMode === 'edit' ? t("settings.org.editAddress") : t("settings.org.newAddress")}</h3>
                <p className="small text-muted-foreground mb-0">{t("settings.org.organizationAddress")}</p>
              </div>
              <button onClick={() => setAddressModalOpen(false)} className="btn-icon-muted">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveAddress}>
              <div className="mb-3">
                <label className="form-label small fw-bold">{t("settings.org.addressLabel")}</label>
                <input
                  type="text"
                  className="form-control-custom"
                  value={addressForm.label}
                  onChange={e => setAddressForm({...addressForm, label: e.target.value})}
                  placeholder={t("settings.org.addressLabelPlaceholder")}
                  required
                />
              </div>
              <div className="row g-3 mb-3">
                <div className="col-4">
                  <label className="form-label small fw-bold">{t("settings.org.postalCode")}</label>
                  <input
                    type="text"
                    className="form-control-custom"
                    value={addressForm.postal_code}
                    onChange={e => setAddressForm({...addressForm, postal_code: e.target.value})}
                  />
                </div>
                <div className="col-8">
                  <label className="form-label small fw-bold">{t("settings.org.street")}</label>
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
                  <label className="form-label small fw-bold">{t("settings.org.number")}</label>
                  <input
                    type="text"
                    className="form-control-custom"
                    value={addressForm.number}
                    onChange={e => setAddressForm({...addressForm, number: e.target.value})}
                  />
                </div>
                <div className="col-9">
                  <label className="form-label small fw-bold">{t("settings.org.complement")}</label>
                  <input
                    type="text"
                    className="form-control-custom"
                    value={addressForm.complement}
                    onChange={e => setAddressForm({...addressForm, complement: e.target.value})}
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label small fw-bold">{t("settings.org.neighborhood")}</label>
                <input
                  type="text"
                  className="form-control-custom"
                  value={addressForm.neighborhood}
                  onChange={e => setAddressForm({...addressForm, neighborhood: e.target.value})}
                />
              </div>
              <div className="row g-3 mb-4">
                <div className="col-8">
                  <label className="form-label small fw-bold">{t("settings.org.city")}</label>
                  <input
                    type="text"
                    className="form-control-custom"
                    value={addressForm.city}
                    onChange={e => setAddressForm({...addressForm, city: e.target.value})}
                    required
                  />
                </div>
                <div className="col-4">
                  <label className="form-label small fw-bold">{t("settings.org.state")}</label>
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
                  {t("settings.org.primaryAddress")}
                </label>
              </div>
              <div className="d-flex justify-content-end gap-3">
                <button type="button" onClick={() => setAddressModalOpen(false)} className="btn-secondary-elegant px-4 py-2">
                  {t("settings.org.cancel")}
                </button>
                <button type="submit" disabled={savingAddress} className="btn-primary-elegant px-4 py-2 d-flex align-items-center gap-2">
                  {savingAddress ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {t("settings.org.save")}
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
                <h3 className="fw-bold h5 mb-1">{contactModalMode === 'edit' ? t("settings.org.editContact") : t("settings.org.newContact")}</h3>
                <p className="small text-muted-foreground mb-0">{t("settings.org.organizationContact")}</p>
              </div>
              <button onClick={() => setContactModalOpen(false)} className="btn-icon-muted">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveContact}>
              <div className="mb-3">
                <label className="form-label small fw-bold">{t("settings.org.contactName")}</label>
                <input
                  type="text"
                  className="form-control-custom"
                  value={contactForm.name}
                  onChange={e => setContactForm({...contactForm, name: e.target.value})}
                  placeholder={t("settings.org.contactNamePlaceholder")}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label small fw-bold">{t("settings.org.type")}</label>
                <select
                  className="form-control-custom"
                  value={contactForm.contact_type}
                  onChange={e => setContactForm({...contactForm, contact_type: e.target.value})}
                >
                  <option value="phone">{t("settings.org.phone")}</option>
                  <option value="email">{t("settings.org.email")}</option>
                  <option value="whatsapp">{t("settings.org.whatsapp")}</option>
                  <option value="telegram">Telegram</option>
                  <option value="other">{t("settings.org.other")}</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="form-label small fw-bold">{t("settings.org.value")}</label>
                <input
                  type="text"
                  className="form-control-custom"
                  value={contactForm.value}
                  onChange={e => setContactForm({...contactForm, value: e.target.value})}
                  placeholder={contactForm.contact_type === 'email' ? t("settings.org.contactValuePlaceholder") : '(00) 00000-0000'}
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
                  {t("settings.org.primaryContact")}
                </label>
              </div>
              <div className="d-flex justify-content-end gap-3">
                <button type="button" onClick={() => setContactModalOpen(false)} className="btn-secondary-elegant px-4 py-2">
                  {t("settings.org.cancel")}
                </button>
                <button type="submit" disabled={savingContact} className="btn-primary-elegant px-4 py-2 d-flex align-items-center gap-2">
                  {savingContact ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {t("settings.org.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Password Change Modal */}
      <Modal
        isOpen={planSelectorOpen}
        onClose={() => setPlanSelectorOpen(false)}
        title={t("settings.plan.changeTitle")}
        description={t("settings.plan.changeDescription")}
        maxWidth="plan-selector-modal"
        footer={<>
          <button type="button" className="btn-secondary-elegant px-4 py-2" onClick={() => { setPlanSelectorOpen(false); setChangePreview(null); }}>{t("settings.plan.cancel")}</button>
          {!changePreview ? <button type="button" className="btn-primary-elegant px-4 py-2" disabled={planChangeLoading || !Object.keys(selectedTiers).length} onClick={previewPlanChange}>{planChangeLoading ? t("settings.plan.calculating") : t("settings.plan.calculate")}</button> : <button type="button" className="btn-primary-elegant px-4 py-2" disabled={planChangeLoading || changePreview.effective_at === "next_renewal" || (!!changePreview.requires_finance_confirmation && !financeAck)} onClick={confirmPlanChange}>{planChangeLoading ? t("settings.plan.confirming") : changePreview.effective_at === "next_renewal" ? t("settings.plan.downgradeRenewal") : t("settings.plan.confirm")}</button>}
        </>}
      >
        <div className="p-3 p-md-4 plan-selector-content">
          <div className="billing-selector mb-4">
            <button className={selectedBilling === "monthly" ? "active" : ""} onClick={() => { setSelectedBilling("monthly"); setChangePreview(null); }}>{t("settings.plan.monthly")}</button>
            <button className={selectedBilling === "yearly" ? "active" : ""} onClick={() => { setSelectedBilling("yearly"); setChangePreview(null); }}>{t("settings.plan.annualDiscount")}</button>
          </div>
          <div className="plan-selector-grid">
            {planCatalog.map(segment => <article className={`plan-segment-option ${segment.accent}`} key={segment.code}>
              <div className="d-flex justify-content-between gap-3"><div><div className="plan-segment-kicker">{segment.name}</div><h3>{segment.subtitle}</h3></div>{selectedTiers[segment.code] && <button className="remove-segment" onClick={() => { setSelectedTiers(current => { const next = { ...current }; delete next[segment.code]; return next; }); setChangePreview(null); }}>{t("settings.plan.remove")}</button>}</div>
              <p>{segment.description}</p>
              <div className="plan-tier-options">{segment.tiers.map(tier => <label className={selectedTiers[segment.code] === tier.id ? "active" : ""} key={tier.id}><input type="radio" name={`settings-${segment.code}`} checked={selectedTiers[segment.code] === tier.id} onChange={() => { setSelectedTiers(current => ({ ...current, [segment.code]: tier.id })); setChangePreview(null); }}/><span>{tier.label}</span><strong>{tier.requires_quote || tier.monthly_price === null ? t("settings.subscription.quote") : `${money(tier.monthly_price)}${t("settings.subscription.perMonth")}`}</strong></label>)}</div>
              {selectedBilling === "yearly" && <small className="annual-discount-note">{t("settings.plan.discount").replace("{percent}", numberFormat.format(Number(segment.annual_discount_percent)))}</small>}
            </article>)}
          </div>
          {changePreview && <section className="change-preview mt-4">
            <h3>{t("settings.plan.summary")}</h3>
            <div><span>{t("settings.subscription.current")}</span><strong>{money(changePreview.current_monthly_total)}{t("settings.subscription.perMonth")}</strong></div>
            <div><span>{t("settings.plan.new")}</span><strong>{money(changePreview.new_monthly_total)}{t("settings.subscription.perMonth")}</strong></div>
            <div><span>{t("settings.plan.difference")}</span><strong>{Number(changePreview.monthly_difference) >= 0 ? "+" : ""}{money(changePreview.monthly_difference)}</strong></div>
            {selectedBilling === "yearly" && <div className="purchase-total"><span>{t("settings.plan.purchaseTotal")}</span><strong>{money(changePreview.quote.billing_total)}</strong></div>}
            {changePreview.effective_at === "immediately" && Number(changePreview.prorated_difference) > 0 && <p>{t("settings.plan.applyNow")} <strong>{money(changePreview.prorated_difference)}</strong>.</p>}
            {changePreview.effective_at === "next_renewal" && <p>{t("settings.plan.nextRenewal")}</p>}
            {!!changePreview.removed_segments?.length && <div className="segment-removal" role="region" aria-label={t("segmentRemoval.title")}>
              <h4>{t("segmentRemoval.title")}</h4>
              <ul>{changePreview.removed_segments.map(row => <li key={row.segment_code}>{row.finance.count
                ? t("segmentRemoval.finance", { segment: row.segment_name, count: row.finance.count, revenue: money(row.finance.revenue), expense: money(row.finance.expense) })
                : t("segmentRemoval.noFinance", { segment: row.segment_name })}</li>)}</ul>
              <p>{t("segmentRemoval.kept")}</p>
              <p>{t("segmentRemoval.billing")}</p>
              {changePreview.requires_finance_confirmation && <label className="segment-removal-ack"><input type="checkbox" className="form-check-input" checked={financeAck} onChange={event => { setFinanceAck(event.target.checked); setError(null); }}/><span>{t("segmentRemoval.ack")}</span></label>}
            </div>}
            {!!changePreview.added_segments?.length && <p>{t("segmentRemoval.added")}</p>}
          </section>}
        </div>
      </Modal>

      {passwordModalOpen && (
        <div className="modal-overlay" onClick={() => setPasswordModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header d-flex justify-content-between align-items-center mb-4">
              <div>
                <h3 className="fw-bold h5 mb-1">{t("settings.password.title")}</h3>
                <p className="small text-muted-foreground mb-0">{t("settings.password.description")}</p>
              </div>
              <button onClick={() => setPasswordModalOpen(false)} className="btn-icon-muted">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="mb-3">
                <label className="form-label small fw-bold">{t("settings.password.current")}</label>
                <input
                  type="password"
                  className="form-control-custom"
                  value={passwordForm.old_password}
                  onChange={e => setPasswordForm({...passwordForm, old_password: e.target.value})}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label small fw-bold">{t("settings.password.new")}</label>
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
                <label className="form-label small fw-bold">{t("settings.password.confirmNew")}</label>
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
                  {t("settings.member.cancel")}
                </button>
                <button type="submit" disabled={savingPassword} className="btn-primary-elegant px-4 py-2 d-flex align-items-center gap-2">
                  {savingPassword ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {t("settings.security.changePassword")}
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
          background: var(--card);
          color: var(--primary);
        }
        .settings-tab-btn.active {
          background: var(--card);
          color: var(--primary);
          box-shadow: var(--shadow-soft);
        }
        :global(.plan-selector-modal) { max-width: 1120px; }
        .billing-selector { display:flex; width:max-content; padding:4px; background:var(--muted); border-radius:12px; }
        .billing-selector button { padding:.65rem 1.1rem; color:var(--muted-foreground); background:transparent; border:0; border-radius:9px; font-size:.8rem; font-weight:800; }
        .billing-selector button.active { color:white; background:var(--primary); }
        .plan-selector-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1rem; align-items:start; }
        .plan-segment-option { padding:1.15rem; background:var(--card); border:1px solid var(--border); border-top:4px solid #26814a; border-radius:16px; }
        .plan-segment-option.wine { border-top-color:#9d3738; }
        .plan-segment-kicker { color:var(--primary); font-size:.68rem; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
        .plan-segment-option h3 { margin:.25rem 0 0; font-size:1.05rem; }
        .plan-segment-option>p { min-height:3.4rem; margin:.8rem 0; color:var(--muted-foreground); font-size:.75rem; }
        .remove-segment { align-self:start; color:#a43b3b; background:transparent; border:0; font-size:.68rem; font-weight:800; }
        .plan-tier-options { display:flex; flex-direction:column; gap:.45rem; }
        .plan-tier-options label { display:grid; grid-template-columns:auto 1fr auto; gap:.5rem; align-items:center; padding:.65rem; border:1px solid var(--border); border-radius:10px; cursor:pointer; font-size:.7rem; }
        .plan-tier-options label.active { border-color:var(--primary); background:color-mix(in srgb,var(--primary) 8%,var(--card)); box-shadow:inset 0 0 0 1px var(--primary); }
        .plan-tier-options label strong { text-align:right; font-size:.69rem; }
        .annual-discount-note { display:block; margin-top:.75rem; padding:.55rem; color:#176d3a; background:#eaf6e5; border-radius:8px; text-align:center; font-weight:800; }
        .change-preview { max-width:620px; margin-inline:auto; padding:1.2rem; background:var(--card); border:1px solid var(--border); border-radius:15px; }
        .change-preview h3 { margin:0 0 .65rem; font-size:1rem; }
        .change-preview>div { display:flex; justify-content:space-between; gap:1rem; padding:.6rem 0; border-bottom:1px solid var(--border); font-size:.78rem; }
        .change-preview .purchase-total { padding:.85rem; margin-top:.55rem; color:#145f35; background:#eaf6e5; border:0; border-radius:9px; font-weight:900; }
        .change-preview p { margin:.75rem 0 0; color:var(--muted-foreground); font-size:.72rem; }
        .segment-removal { margin-top:.85rem; padding:.85rem; border:1px solid var(--warning); border-radius:9px; background:var(--card); }
        .segment-removal h4 { margin:0 0 .4rem; font-size:.85rem; font-weight:800; color:var(--foreground); }
        .segment-removal ul { margin:0; padding-left:1.1rem; font-size:.78rem; color:var(--foreground); }
        .segment-removal p { margin:.5rem 0 0; }
        .segment-removal-ack { display:flex; gap:.5rem; align-items:flex-start; margin-top:.65rem; font-size:.78rem; font-weight:700; color:var(--foreground); cursor:pointer; }
        .segment-removal-ack .form-check-input { flex:none; width:18px; height:18px; margin-top:1px; }
        @media(max-width:900px){.plan-selector-grid{grid-template-columns:1fr}.plan-segment-option>p{min-height:0}}
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
        .organization-profile-form { padding:1.3rem; border:1px solid var(--border); border-radius:14px; background:var(--card); }
        .organization-profile-form .section-header { margin-bottom:1.25rem !important; }
        .organization-input-group { position:relative; }
        .organization-input {
          width:100%; min-height:2.65rem; padding:.6rem .85rem .6rem 2.7rem;
          border:1px solid color-mix(in srgb,var(--border),var(--primary) 9%); border-radius:10px;
          background:var(--background); color:var(--foreground); font-size:.875rem; font-weight:600;
          transition:border-color .2s,box-shadow .2s,background-color .2s;
        }
        .organization-input::placeholder { color:var(--muted-foreground); font-weight:500; }
        .organization-input:hover { border-color:color-mix(in srgb,var(--primary),var(--border) 55%); }
        .organization-input:focus { outline:0; border-color:var(--primary); box-shadow:0 0 0 3px color-mix(in srgb,var(--primary),transparent 88%); }
        .organization-input-icon { position:absolute; z-index:1; left:.85rem; top:50%; width:1rem; height:1rem; transform:translateY(-50%); color:var(--muted-foreground); pointer-events:none; }
        .organization-profile-form .btn-primary-elegant { min-height:2.65rem; border-radius:10px; }
        @media(max-width:767px){.organization-profile-form{padding:1rem}.organization-profile-form .btn-primary-elegant{width:100%}}
        .settings-shell { overflow:visible; }
        .preferences-page { max-width:980px; }
        .preferences-page > .dashboard-card {
          margin:0 !important; padding:1.5rem 0 !important; border:0 !important;
          border-bottom:1px dashed var(--border) !important; border-radius:0 !important;
          background:transparent !important; box-shadow:none !important;
        }
        .preferences-page > .dashboard-card:first-of-type { padding-top:0 !important; }
        .preferences-page > .dashboard-card:last-of-type { border-bottom:0 !important; }
        .preferences-page > .dashboard-card .icon-box { width:2.15rem; height:2.15rem; display:grid; place-items:center; flex:0 0 2.15rem; }
        .preferences-page .language-picker-menu { z-index:50; }
        .language-picker { position:relative; max-width:30rem; }
        .language-picker-trigger,.language-picker-option { display:flex; align-items:center; gap:.7rem; width:100%; border:1px solid var(--border); background:var(--background); color:var(--foreground); font:inherit; text-align:left; }
        .language-picker-trigger { min-height:2.8rem; padding:.55rem .8rem; border-radius:12px; font-size:.875rem; font-weight:700; }
        .language-picker-trigger svg { margin-left:auto; transition:transform .2s; }
        .language-picker-trigger[aria-expanded=true] svg { transform:rotate(180deg); }
        .language-picker-trigger:hover:not(:disabled),.language-picker-trigger:focus-visible { border-color:var(--primary); outline:0; box-shadow:0 0 0 4px oklch(0.5 0.15 145 / .1); }
        .language-picker-trigger:disabled { opacity:.65; cursor:not-allowed; }
        .language-picker-menu { position:absolute; z-index:20; top:calc(100% + .35rem); width:100%; overflow:hidden; border:1px solid var(--border); border-radius:12px; background:var(--card); box-shadow:var(--shadow-elegant); }
        .language-picker-option { min-height:2.7rem; padding:.55rem .8rem; border:0; border-radius:0; font-size:.84rem; cursor:pointer; }
        .language-picker-option:hover,.language-picker-option[aria-selected=true] { background:color-mix(in srgb,var(--primary),transparent 91%); color:var(--primary); }
        .language-flag { display:inline-block; width:1.35rem; height:.9rem; flex:0 0 1.35rem; border:1px solid color-mix(in srgb,var(--foreground),transparent 75%); border-radius:2px; box-shadow:0 1px 2px rgb(0 0 0 / .12); }
        .language-flag[data-language="pt-BR"] { background:radial-gradient(circle,#2d6b35 0 20%,transparent 22%),linear-gradient(35deg,transparent 42%,#f9d54b 43% 57%,transparent 58%),#159447; }
        .language-flag[data-language="en"] { background:linear-gradient(90deg,#b22234 0 14%,#fff 14% 28%,#b22234 28% 42%,#fff 42% 56%,#b22234 56% 70%,#fff 70% 84%,#b22234 84%); }
        .language-flag[data-language="es"] { background:linear-gradient(#aa151b 0 25%,#f1bf00 25% 75%,#aa151b 75%); }
        .language-flag[data-language="pt-PT"] { background:linear-gradient(90deg,#046a38 0 40%,#da291c 40%); }
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
          color: var(--primary-foreground);
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
          background: color-mix(in srgb, var(--destructive), transparent 88%);
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
          background: color-mix(in srgb, var(--warning), transparent 86%);
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
          background: color-mix(in srgb, var(--success), transparent 88%);
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
          background: var(--muted);
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
          background: var(--card);
          color: var(--foreground);
          border: 1px solid var(--border);
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
          background: var(--muted);
          color: var(--foreground);
        }
      `}</style>
    </div>
  );
}
