"use client";

import "@/app/home/settings/settings.css";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, ShieldCheck, UserRound } from "lucide-react";

import OperatorScopeOptions, { VETERINARY_SEGMENT, emptyOperatorScope, scopedRoles } from "@/components/auth/OperatorScopeOptions";
import UserContacts, { initialContacts, type UserContact } from "@/components/auth/UserContacts";
import WhatsAppContactOptions from "@/components/auth/WhatsAppContactOptions";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { type TranslationKey, useOrganizationLocale } from "@/lib/locale";
import { apiClient } from "@/services/api";
import { type Member, type UserRole, canManageMembers, memberError, roleLabels } from "@/services/memberService";

const roles = Object.keys(roleLabels) as UserRole[];
const roleLabelKey: Record<UserRole, TranslationKey> = {
  admin: "role.admin", manager: "role.manager", operator: "role.operator", veterinarian: "users.role.veterinarian",
};
const roleDescKey: Record<UserRole, TranslationKey> = {
  admin: "members.roleDesc.admin", manager: "members.roleDesc.manager", operator: "members.roleDesc.operator", veterinarian: "members.roleDesc.veterinarian",
};
type Filter = "active" | "inactive" | "all";
type FormState = {
  email: string; full_name: string; phone: string; phone_is_whatsapp: boolean; phone_is_telegram: boolean; contacts: UserContact[] | null; receive_system_alerts: boolean;
  role: UserRole; segments: string[]; operator_read_only: boolean; password: string; password_confirm: string;
};
const emptyForm: FormState = {
  email: "", full_name: "", phone: "", phone_is_whatsapp: false, phone_is_telegram: false, contacts: null, receive_system_alerts: false, role: "operator",
  ...emptyOperatorScope, password: "", password_confirm: "",
};

export function MembersPanel({ embedded = false }: { embedded?: boolean }) {
  const { t } = useOrganizationLocale();
  const { showToast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([apiClient.get<Member[]>("/auth/members/"), apiClient.get<{ id: string; role: string }>("/auth/me/")])
      .then(([list, current]) => { if (active) { setMembers(list.data); setMe(current.data); setLoadError(""); } })
      .catch(() => { if (active) setLoadError(t("members.loadError")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, t]);

  const canManage = canManageMembers(me?.role);
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return members
      .filter(member => filter === "all" || member.is_active === (filter === "active"))
      .filter(member => !query || member.full_name.toLocaleLowerCase().includes(query) || member.email.toLocaleLowerCase().includes(query));
  }, [filter, members, search]);
  const counts = useMemo(() => ({ active: members.filter(m => m.is_active).length, inactive: members.filter(m => !m.is_active).length, all: members.length }), [members]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormError(""); setFormOpen(true); };
  const openEdit = (member: Member) => {
    setEditing(member);
    setForm({
      ...emptyForm, email: member.email, full_name: member.full_name, phone: member.phone || "", phone_is_whatsapp: member.phone_is_whatsapp ?? false, phone_is_telegram: member.phone_is_telegram ?? false, contacts: member.contacts ?? null,
      receive_system_alerts: member.receive_system_alerts ?? true, role: member.role, segments: member.segments || [], operator_read_only: member.operator_read_only,
    });
    setFormError(""); setFormOpen(true);
  };
  const roleLocked = !!editing && (editing.organization_responsible || editing.id === me?.id);
  const setRole = (role: UserRole) => setForm(current => ({ ...current, role, ...(scopedRoles.includes(role) ? {} : emptyOperatorScope) }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing && form.password !== form.password_confirm) { setFormError(t("members.form.passwordMismatch")); return; }
    setSaving(true); setFormError("");
    const scope = scopedRoles.includes(form.role)
      ? { segments: form.role === "veterinarian" ? form.segments.filter(code => code !== VETERINARY_SEGMENT) : form.segments, operator_read_only: form.operator_read_only }
      : {};
    const common = { full_name: form.full_name.trim(), phone: form.phone.trim(), phone_is_whatsapp: form.phone_is_whatsapp, phone_is_telegram: form.contacts === null && form.phone_is_telegram, ...(form.contacts === null ? {} : {contacts: form.contacts}), receive_system_alerts: form.receive_system_alerts, ...scope };
    try {
      if (editing) {
        const { data } = await apiClient.patch<Member>(`/auth/members/${editing.id}/`, { ...common, ...(roleLocked ? {} : { role: form.role }) });
        setMembers(list => list.map(item => item.id === data.id ? data : item));
        showToast(t("members.saved"), "success");
      } else {
        const { data } = await apiClient.post<Member>("/auth/members/create/", { ...common, role: form.role, email: form.email.trim(), password: form.password, password_confirm: form.password_confirm });
        setMembers(list => [...list, data]);
        showToast(t("members.created"), "success");
      }
      setFormOpen(false);
    } catch (error) {
      setFormError(memberError(error, t("members.saveError")));
    } finally { setSaving(false); }
  };

  const toggleActive = async (member: Member) => {
    if (member.is_active && !window.confirm(t("members.confirmDeactivate", { name: member.full_name }))) return;
    try {
      const { data } = await apiClient.patch<Member>(`/auth/members/${member.id}/`, { is_active: !member.is_active });
      setMembers(list => list.map(item => item.id === data.id ? data : item));
      showToast(t("members.statusChanged"), "success");
    } catch (error) {
      showToast(memberError(error, t("members.saveError")), "error");
    }
  };

  const segmentChips = (member: Member) => {
    if (!scopedRoles.includes(member.role)) return <span className="member-chip is-all">{t("members.allSegments")}</span>;
    const codes = member.role === "veterinarian" ? [VETERINARY_SEGMENT, ...(member.segments || []).filter(code => code !== VETERINARY_SEGMENT)] : member.segments || [];
    if (!codes.length) return <span className="member-chip is-empty">{t("members.noSegments")}</span>;
    return <>{codes.map(code => <span key={code} className="member-chip">{t(`segment.${code}` as TranslationKey)}</span>)}{member.operator_read_only && <span className="member-chip is-muted">{t("members.readOnly")}</span>}</>;
  };
  const retry = useCallback(() => { setLoading(true); setAttempt(value => value + 1); }, []);

  return <section className="settings-section" aria-labelledby="members-title">
    <header className="settings-section-header">
      <div className={embedded ? "visually-hidden" : undefined}>
        <h2 id="members-title">{t("members.title")}</h2>
        <p>{t("members.description")}</p>
      </div>
      <div className="settings-section-actions">
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setGuideOpen(true)}><ShieldCheck size={16}/>{t("members.rolesGuide")}</button>
        {canManage && <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}><Plus size={16}/>{t("members.new")}</button>}
      </div>
    </header>
    {!loading && !canManage && !loadError && <p className="settings-note">{t("members.adminOnly")}</p>}

    <div className="settings-toolbar">
      <div className="settings-chips" role="group" aria-label={t("members.title")}>
        {(["active", "inactive", "all"] as Filter[]).map(value => <button key={value} type="button" className={`settings-chip ${filter === value ? "is-active" : ""}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>
          {t(`members.filter.${value}` as TranslationKey)} <span className="tabular-nums">{counts[value]}</span>
        </button>)}
      </div>
      <label className="settings-search">
        <Search size={16} aria-hidden="true"/>
        <span className="visually-hidden">{t("members.search")}</span>
        <input type="search" value={search} placeholder={t("members.search")} onChange={event => setSearch(event.target.value)}/>
      </label>
    </div>

    {loading ? <div className="settings-state" role="status">{t("operatorScope.loading")}</div>
      : loadError ? <div className="settings-state is-error" role="alert">{loadError}<button type="button" className="btn btn-link btn-sm" onClick={retry}>{t("members.retry")}</button></div>
      : !visible.length ? <div className="settings-state">{members.length ? t("members.emptyFilter") : t("members.empty")}</div>
      : <ul className="member-list">
        {visible.map(member => <li key={member.id} className={`member-row ${member.is_active ? "" : "is-inactive"}`}>
          <div className="member-avatar" aria-hidden="true">{(member.full_name || member.email)[0]?.toUpperCase()}</div>
          <div className="member-main">
            <div className="member-meta">{member.email}</div>
            <div className="member-name">{member.full_name}{member.id === me?.id && <span className="member-tag">{t("members.you")}</span>}{member.organization_responsible && <span className="member-tag">{t("members.responsible")}</span>}</div>
            <div className="member-chips">{segmentChips(member)}</div>
          </div>
          <div className="member-side">
            <span className="member-role">{t(roleLabelKey[member.role] || "role.operator")}</span>
            <span className={`member-status ${member.is_active ? "is-on" : "is-off"}`}>{member.is_active ? t("members.active") : t("members.inactive")}</span>
            {canManage && <div className="member-actions">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => openEdit(member)}>{t("members.edit")}</button>
              {member.id !== me?.id && !member.organization_responsible && <button type="button" className={`btn btn-sm ${member.is_active ? "btn-outline-danger" : "btn-outline-success"}`} onClick={() => void toggleActive(member)}>{member.is_active ? t("members.deactivate") : t("members.activate")}</button>}
            </div>}
          </div>
        </li>)}
      </ul>}

    <Modal isOpen={formOpen} onClose={() => !saving && setFormOpen(false)} title={editing ? t("members.form.editTitle") : t("members.form.createTitle")} maxWidth="max-w-2xl"
      footer={<div className="d-flex justify-content-end gap-2 w-100">
        <button type="button" className="btn btn-outline-secondary" onClick={() => setFormOpen(false)} disabled={saving}>{t("members.form.cancel")}</button>
        <button type="submit" form="member-form" className="btn btn-primary" disabled={saving}>{saving ? t("operatorScope.loading") : editing ? t("members.form.save") : t("members.form.create")}</button>
      </div>}>
      <form id="member-form" className="member-form" onSubmit={save} noValidate>
        {formError && <div className="alert alert-danger py-2 small" role="alert">{formError}</div>}
        <fieldset>
          <legend><UserRound size={16}/>{t("members.form.identity")}</legend>
          <div className="row g-3">
            <div className="col-md-6"><label className="form-label" htmlFor="member-name">{t("members.form.name")}</label><input id="member-name" className="form-control" required maxLength={150} value={form.full_name} onChange={event => setForm({ ...form, full_name: event.target.value })}/></div>
            <div className="col-md-6"><label className="form-label" htmlFor="member-email">{t("members.form.email")}</label><input id="member-email" type="email" className="form-control" required disabled={!!editing} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></div>
            <div className="col-md-6"><label className="form-label" htmlFor="member-phone">{t("members.form.phone")}</label><input id="member-phone" type="tel" className="form-control" maxLength={30} value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })}/></div>
            <div className="col-12"><WhatsAppContactOptions showPhoneOptions={form.contacts === null} value={form} onChange={value => setForm({ ...form, ...value })}/></div>
            <div className="col-12"><UserContacts contacts={form.contacts} defaults={() => initialContacts(form.email, form.phone, form.phone_is_whatsapp, form.phone_is_telegram)} onChange={contacts => setForm({...form, contacts})} /></div>
          </div>
        </fieldset>
        <fieldset>
          <legend><ShieldCheck size={16}/>{t("members.form.role")}</legend>
          {roleLocked && <p className="settings-note">{t("members.form.lockedRole")}</p>}
          <div className="role-cards" role="radiogroup" aria-label={t("members.form.role")}>
            {roles.map(role => <label key={role} className={`role-card ${form.role === role ? "is-selected" : ""}`}>
              <input type="radio" name="member-role" value={role} checked={form.role === role} disabled={roleLocked} onChange={() => setRole(role)}/>
              <span><strong>{t(roleLabelKey[role])}</strong><small>{t(roleDescKey[role])}</small></span>
            </label>)}
          </div>
        </fieldset>
        {scopedRoles.includes(form.role) && <OperatorScopeOptions role={form.role} value={form} disabled={saving} onChange={value => setForm({ ...form, ...value })}/>}
        {!editing && <fieldset>
          <legend>{t("members.form.password")}</legend>
          <p className="settings-note">{t("members.form.passwordHint")}</p>
          <div className="row g-3">
            <div className="col-md-6"><label className="form-label" htmlFor="member-password">{t("members.form.newPassword")}</label><input id="member-password" type="password" autoComplete="new-password" minLength={8} required className="form-control" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></div>
            <div className="col-md-6"><label className="form-label" htmlFor="member-password-confirm">{t("members.form.confirmPassword")}</label><input id="member-password-confirm" type="password" autoComplete="new-password" required className="form-control" value={form.password_confirm} onChange={event => setForm({ ...form, password_confirm: event.target.value })}/></div>
          </div>
        </fieldset>}
      </form>
    </Modal>

    <Modal isOpen={guideOpen} onClose={() => setGuideOpen(false)} title={t("members.rolesGuide")}>
      <div className="d-grid gap-2">{roles.map(role => <article key={role} className="role-card is-static"><span><strong>{t(roleLabelKey[role])}</strong><small>{t(roleDescKey[role])}</small></span></article>)}</div>
    </Modal>
  </section>;
}
