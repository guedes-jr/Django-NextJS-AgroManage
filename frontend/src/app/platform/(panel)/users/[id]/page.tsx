"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Ban, Building2, KeyRound, LogOut, RefreshCcw, Save, ShieldCheck, UserRound } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { platformErrorFields, usePlatformCanManage } from "@/components/platform/usePlatformRole";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import { platformService } from "@/services/platformApi";
import type { PlatformUserDetail, PlatformUserFormOptions, PlatformUserRole, PlatformUserUpdate } from "@/types/platform";

type Tab = "profile" | "access" | "security";
const tabs: { id: Tab; label: string; icon: typeof UserRound }[] = [
  { id: "profile", label: "Dados pessoais", icon: UserRound },
  { id: "access", label: "Papel e permissões", icon: ShieldCheck },
  { id: "security", label: "Senha e sessões", icon: KeyRound },
];
const scopedRoles: PlatformUserRole[] = ["operator", "feeder"];
const formatDate = (value: string | null, time = false) => value ? (time ? new Date(value).toLocaleString("pt-BR") : new Date(value).toLocaleDateString("pt-BR")) : "—";

function toForm(user: PlatformUserDetail): Required<PlatformUserUpdate> {
  return {
    email: user.email, full_name: user.full_name, phone: user.phone || "", phone_is_whatsapp: user.phone_is_whatsapp,
    role: user.role, can_operate_crops: user.can_operate_crops, operator_read_only: user.operator_read_only,
    allowed_livestock: user.allowed_livestock, receive_system_alerts: user.receive_system_alerts, force_password_change: user.force_password_change,
  };
}

export default function PlatformUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const canManage = usePlatformCanManage();
  const [user, setUser] = useState<PlatformUserDetail | null>(null);
  const [options, setOptions] = useState<PlatformUserFormOptions | null>(null);
  const [form, setForm] = useState<Required<PlatformUserUpdate> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "profile";
    const value = new URLSearchParams(window.location.search).get("tab");
    return tabs.some(item => item.id === value) ? value as Tab : "profile";
  });
  const [password, setPassword] = useState({ new_password: "", new_password_confirm: "", force_password_change: true, revoke_sessions: true });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    Promise.all([platformService.user(id), platformService.userFormOptions().catch(() => null)])
      .then(([result, formOptions]) => { if (!active) return; setUser(result); setForm(toForm(result)); setOptions(formOptions); setLoadError(""); })
      .catch(error => { if (active) setLoadError(getOrganizationErrorMessage(error, "Não foi possível carregar o usuário.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, attempt]);

  const changes = useMemo(() => {
    if (!user || !form) return {};
    const original = toForm(user);
    return Object.fromEntries(Object.entries(form).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(original[key as keyof typeof original]))) as PlatformUserUpdate;
  }, [form, user]);
  const dirty = Object.keys(changes).length > 0;

  const selectTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };
  const set = <K extends keyof PlatformUserUpdate>(key: K, value: Required<PlatformUserUpdate>[K]) => setForm(current => current ? { ...current, [key]: value } : current);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !dirty) return;
    const sensitive = "email" in changes || "role" in changes;
    if (sensitive && !window.confirm("Alterar e-mail ou papel encerra as sessões abertas deste usuário. Continuar?")) return;
    setSaving(true); setErrors({});
    try {
      const updated = await platformService.updateUser(user.id, changes);
      setUser(updated); setForm(toForm(updated));
      showToast("Dados do usuário atualizados.", "success");
    } catch (error) {
      setErrors(platformErrorFields(error));
      showToast(getOrganizationErrorMessage(error, "Não foi possível salvar as alterações."), "error");
    } finally { setSaving(false); }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (password.new_password !== password.new_password_confirm) { setPasswordErrors({ new_password_confirm: "As senhas não conferem." }); return; }
    setProcessing(true); setPasswordErrors({});
    try {
      const updated = await platformService.setUserPassword(user.id, password);
      setUser(updated); setForm(toForm(updated));
      setPassword({ new_password: "", new_password_confirm: "", force_password_change: true, revoke_sessions: true });
      showToast("Senha redefinida. Informe a nova senha ao usuário por um canal seguro.", "success");
    } catch (error) {
      setPasswordErrors(platformErrorFields(error));
      showToast(getOrganizationErrorMessage(error, "Não foi possível redefinir a senha."), "error");
    } finally { setProcessing(false); }
  };

  const run = async (action: "status" | "sessions") => {
    if (!user) return;
    const message = action === "sessions" ? "encerrar todas as sessões" : user.is_active ? "bloquear este usuário" : "reativar este usuário";
    if (!window.confirm(`Deseja realmente ${message}?`)) return;
    setProcessing(true);
    try {
      if (action === "sessions") await platformService.revokeUserSessions(user.id);
      else if (user.is_active) await platformService.blockUser(user.id);
      else await platformService.activateUser(user.id);
      showToast(action === "sessions" ? "Sessões encerradas com sucesso." : `Usuário ${user.is_active ? "bloqueado" : "reativado"}.`, "success");
      const updated = await platformService.user(id);
      setUser(updated); setForm(toForm(updated));
    } catch (error) {
      showToast(getOrganizationErrorMessage(error, "Não foi possível concluir a operação."), "error");
    } finally { setProcessing(false); }
  };

  if (loading) return <div className="py-5 text-center" role="status"><div className="spinner-border text-success" /><span className="visually-hidden">Carregando usuário…</span></div>;
  if (loadError || !user || !form) return <div className="alert alert-danger d-flex flex-wrap align-items-center gap-2" role="alert">{loadError || "Usuário não encontrado."}<button className="btn btn-sm btn-outline-danger" onClick={() => { setLoading(true); setAttempt(value => value + 1); }}>Tentar novamente</button><Link href="/platform/users" className="btn btn-sm btn-link">Voltar aos usuários</Link></div>;

  const roles = options?.roles || [{ value: user.role, label: user.role_display }];
  const field = (key: "full_name" | "email" | "phone", label: string, type = "text", extra: Record<string, unknown> = {}) => <div className="col-md-6">
    <label htmlFor={`user-${key}`} className="form-label">{label}</label>
    <input id={`user-${key}`} type={type} className={`form-control ${errors[key] ? "is-invalid" : ""}`} value={form[key]} disabled={!canManage || saving} onChange={event => set(key, event.target.value)} {...extra}/>
    {errors[key] && <div className="invalid-feedback">{errors[key]}</div>}
  </div>;
  const check = (key: "phone_is_whatsapp" | "receive_system_alerts" | "force_password_change" | "can_operate_crops" | "operator_read_only", label: string, disabled = false) => <div className="form-check">
    <input id={`user-${key}`} type="checkbox" className="form-check-input" checked={form[key]} disabled={!canManage || saving || disabled} onChange={event => set(key, event.target.checked)}/>
    <label htmlFor={`user-${key}`} className="form-check-label">{label}</label>
  </div>;
  const footer = canManage && <div className="platform-form-footer">
    <button type="button" className="btn btn-outline-secondary" disabled={!dirty || saving} onClick={() => { setForm(toForm(user)); setErrors({}); }}>Descartar</button>
    <button className="btn btn-success" disabled={!dirty || saving}><Save size={16}/>{saving ? "Salvando…" : "Salvar alterações"}</button>
  </div>;

  return <div className="platform-management">
    <Link href="/platform/users" className="platform-back"><ArrowLeft size={15}/>Voltar aos usuários</Link>
    <header className="platform-card p-3 mb-3">
      <div className="platform-page-header mb-0">
        <div>
          <div className="platform-badges">
            <span className={`platform-pill ${user.is_active ? "success" : "danger"}`}>{user.is_active ? "Ativo" : "Bloqueado"}</span>
            <span className="platform-pill">{user.role_display}</span>
            {user.organization_responsible && <span className="platform-pill info">Responsável pela organização</span>}
            {user.force_password_change && <span className="platform-pill warning">Troca de senha pendente</span>}
          </div>
          <h1>{user.full_name}</h1>
          <p>{user.email} · Último acesso: {user.last_login ? formatDate(user.last_login, true) : "nunca acessou"}</p>
        </div>
        {user.organization_id && <Link className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-2" href={`/platform/organizations/${user.organization_id}?tab=users`}><Building2 size={15}/>{user.organization_name}</Link>}
      </div>
    </header>
    {!canManage && <div className="alert alert-info py-2 small">Somente leitura: seu papel na plataforma permite consultar, mas não alterar contas de clientes.</div>}

    <div className="platform-dossier">
      <nav className="platform-card platform-dossier-nav" aria-label="Seções do usuário">
        <div className="platform-dossier-group">
          <div className="platform-dossier-caption">Conta</div>
          {tabs.map(item => <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined} onClick={() => selectTab(item.id)}><item.icon size={16}/>{item.label}</button>)}
        </div>
      </nav>
      <div className="platform-dossier-body">
        {tab === "profile" && <form className="platform-card platform-form-card" onSubmit={save} noValidate>
          <h2>Dados pessoais</h2>
          <p>Corrija nome, e-mail de acesso e contato. O e-mail é o login do usuário.</p>
          <div className="row g-3">
            {field("full_name", "Nome completo", "text", { maxLength: 255, required: true, autoComplete: "off" })}
            {field("email", "E-mail de acesso", "email", { maxLength: 254, required: true, autoComplete: "off" })}
            {field("phone", "Telefone", "tel", { maxLength: 30, autoComplete: "off" })}
            <div className="col-md-6 d-flex flex-column justify-content-end gap-1">
              {check("phone_is_whatsapp", "Este telefone tem WhatsApp")}
              {check("receive_system_alerts", "Recebe alertas do sistema")}
            </div>
          </div>
          <dl className="platform-kv mt-3 pt-3 border-top">
            <div><dt>Organização</dt><dd>{user.organization_name || "Sem organização"}</dd></div>
            <div><dt>Conta criada</dt><dd>{formatDate(user.created_at)}</dd></div>
            <div><dt>Última alteração</dt><dd>{formatDate(user.updated_at, true)}</dd></div>
          </dl>
          {footer}
        </form>}

        {tab === "access" && <form className="platform-card platform-form-card" onSubmit={save} noValidate>
          <h2>Papel e permissões</h2>
          <p>O papel define o que o usuário vê na organização. Restrições de área valem apenas para operador e tratador.</p>
          <div className="row g-3">
            <div className="col-md-6">
              <label htmlFor="user-role" className="form-label">Papel na organização</label>
              <select id="user-role" className={`form-select ${errors.role ? "is-invalid" : ""}`} value={form.role} disabled={!canManage || saving || user.organization_responsible} onChange={event => set("role", event.target.value as PlatformUserRole)}>
                {roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
              {errors.role && <div className="invalid-feedback">{errors.role}</div>}
              {user.organization_responsible && <div className="form-text">O responsável permanece administrador. Transfira a responsabilidade na ficha da organização para mudar o papel.</div>}
            </div>
          </div>
          {(scopedRoles.includes(form.role) || form.role === "veterinarian") && <div className="mt-3 pt-3 border-top">
            {scopedRoles.includes(form.role) && <div className="platform-check-grid mb-3">
              {check("can_operate_crops", "Pode operar plantações", form.role === "feeder")}
              {check("operator_read_only", "Somente leitura")}
            </div>}
            <div className="form-label">{form.role === "veterinarian" ? "Rebanhos que pode consultar" : "Rebanhos liberados"}</div>
            {options?.species.length ? <div className="platform-check-grid">{options.species.filter(species => form.role !== "feeder" || species.code === "bovinos").map(species => <div className="form-check" key={species.id}>
              <input id={`species-${species.id}`} type="checkbox" className="form-check-input" checked={form.allowed_livestock.includes(species.id)} disabled={!canManage || saving}
                onChange={event => set("allowed_livestock", event.target.checked ? [...form.allowed_livestock, species.id] : form.allowed_livestock.filter(value => value !== species.id))}/>
              <label htmlFor={`species-${species.id}`} className="form-check-label">{species.name}</label>
            </div>)}</div> : <p className="small text-muted mb-0">Nenhuma espécie cadastrada.</p>}
            {errors.non_field_errors && <div className="text-danger small mt-2">{errors.non_field_errors}</div>}
          </div>}
          {footer}
        </form>}

        {tab === "security" && <div className="d-flex flex-column gap-3">
          {canManage && <form className="platform-card platform-form-card" onSubmit={resetPassword} noValidate>
            <h2>Redefinir senha</h2>
            <p>Defina uma nova senha para o usuário. A senha atual deixa de funcionar imediatamente.</p>
            <div className="row g-3">
              <div className="col-md-6">
                <label htmlFor="new-password" className="form-label">Nova senha</label>
                <input id="new-password" type="password" autoComplete="new-password" minLength={8} className={`form-control ${passwordErrors.new_password ? "is-invalid" : ""}`} value={password.new_password} disabled={processing} onChange={event => setPassword(value => ({ ...value, new_password: event.target.value }))}/>
                {passwordErrors.new_password ? <div className="invalid-feedback">{passwordErrors.new_password}</div> : <div className="form-text">Mínimo de 8 caracteres; evite senhas comuns ou parecidas com o e-mail.</div>}
              </div>
              <div className="col-md-6">
                <label htmlFor="new-password-confirm" className="form-label">Confirmar nova senha</label>
                <input id="new-password-confirm" type="password" autoComplete="new-password" className={`form-control ${passwordErrors.new_password_confirm ? "is-invalid" : ""}`} value={password.new_password_confirm} disabled={processing} onChange={event => setPassword(value => ({ ...value, new_password_confirm: event.target.value }))}/>
                {passwordErrors.new_password_confirm && <div className="invalid-feedback">{passwordErrors.new_password_confirm}</div>}
              </div>
              <div className="col-12 platform-check-grid">
                <div className="form-check"><input id="pw-force" type="checkbox" className="form-check-input" checked={password.force_password_change} onChange={event => setPassword(value => ({ ...value, force_password_change: event.target.checked }))}/><label htmlFor="pw-force" className="form-check-label">Exigir troca no próximo acesso</label></div>
                <div className="form-check"><input id="pw-revoke" type="checkbox" className="form-check-input" checked={password.revoke_sessions} onChange={event => setPassword(value => ({ ...value, revoke_sessions: event.target.checked }))}/><label htmlFor="pw-revoke" className="form-check-label">Encerrar sessões abertas</label></div>
              </div>
            </div>
            <div className="platform-form-footer"><button className="btn btn-success" disabled={processing || password.new_password.length < 8 || !password.new_password_confirm}><KeyRound size={16}/>{processing ? "Salvando…" : "Redefinir senha"}</button></div>
          </form>}
          <section className="platform-card platform-form-card">
            <h2>Acesso à conta</h2>
            <dl className="platform-kv mb-3">
              <div><dt>Situação</dt><dd>{user.is_active ? "Ativo" : "Bloqueado"}</dd></div>
              <div><dt>Último acesso</dt><dd>{user.last_login ? formatDate(user.last_login, true) : "Nunca acessou"}</dd></div>
              <div><dt>Troca de senha</dt><dd>{user.force_password_change ? "Pendente no próximo acesso" : "Não exigida"}</dd></div>
            </dl>
            {canManage && <div className="platform-actions">
              <button className="btn btn-outline-secondary" onClick={() => void run("sessions")} disabled={processing}><LogOut size={16}/>Encerrar sessões</button>
              <button className={`btn ${user.is_active ? "btn-outline-danger" : "btn-success"}`} onClick={() => void run("status")} disabled={processing}>{user.is_active ? <><Ban size={16}/>Bloquear usuário</> : <><RefreshCcw size={16}/>Reativar usuário</>}</button>
            </div>}
          </section>
        </div>}
      </div>
    </div>
  </div>;
}
