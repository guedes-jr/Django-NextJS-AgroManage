"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, Search, ShieldCheck, UserCog, UserRoundCheck, UserRoundX, X } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { PLATFORM_STAFF, platformService } from "@/services/platformApi";
import type { PlatformRole, PlatformStaff, PlatformTeamMember, PlatformTeamMemberPayload, PlatformTeamPage } from "@/types/platform";

const roles: Array<{ value: PlatformRole; label: string }> = [
  { value: "platform_owner", label: "Proprietário da plataforma" },
  { value: "platform_admin", label: "Administrador" },
  { value: "platform_finance", label: "Financeiro" },
  { value: "platform_support", label: "Suporte" },
  { value: "platform_developer", label: "Desenvolvedor" },
  { value: "platform_auditor", label: "Auditor" },
];

export default function PlatformTeamPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<PlatformTeamPage | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PlatformTeamMember | null | undefined>(undefined);
  const [currentStaff] = useState<PlatformStaff | null>(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem(PLATFORM_STAFF) || "null"); } catch { return null; }
  });

  const load = useCallback(() => {
    const params: Record<string, string> = {};
    if (query) params.search = query;
    if (role) params.role = role;
    platformService.team(params)
      .then(setData)
      .catch(() => showToast("Não foi possível carregar a equipe interna.", "error"))
      .finally(() => setLoading(false));
  }, [query, role, showToast]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (member: PlatformTeamMember, action: "status" | "sessions") => {
    const description = action === "sessions" ? "encerrar todas as sessões" : member.is_active ? "bloquear" : "reativar";
    if (!window.confirm(`Deseja ${description} para ${member.full_name}?`)) return;
    try {
      if (action === "sessions") await platformService.revokeTeamMemberSessions(member.id);
      else if (member.is_active) await platformService.blockTeamMember(member.id);
      else await platformService.activateTeamMember(member.id);
      showToast(action === "sessions" ? "Sessões encerradas." : "Situação do membro atualizada.", "success");
      load();
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      showToast(detail || "Não foi possível concluir a operação.", "error");
    }
  };

  return <>
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div><div className="platform-label mb-2">Segurança interna</div><h1 className="h2 fw-bold mb-1">Equipe da plataforma</h1><p className="text-muted mb-0">Gerencie funções, acesso, sessões e exigência de MFA.</p></div>
      <button className="btn btn-dark d-flex align-items-center gap-2" onClick={() => setEditing(null)}><Plus size={17} />Novo membro</button>
    </div>
    <div className="row g-3 mb-4">
      <div className="col-sm-4"><Metric label="Membros" value={data?.count || 0} icon={UserCog} /></div>
      <div className="col-sm-4"><Metric label="Ativos" value={data?.results.filter((item) => item.is_active).length || 0} icon={UserRoundCheck} /></div>
      <div className="col-sm-4"><Metric label="MFA obrigatório" value={data?.results.filter((item) => item.mfa_required).length || 0} icon={ShieldCheck} /></div>
    </div>
    <div className="platform-card overflow-hidden">
      <div className="p-3 border-bottom"><form className="row g-2" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
        <div className="col-md"><div className="input-group"><span className="input-group-text bg-white"><Search size={17} /></span><input className="form-control" placeholder="Nome ou e-mail" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
        <div className="col-md-4"><select className="form-select" value={role} onChange={(event) => setRole(event.target.value)}><option value="">Todas as funções</option>{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        <div className="col-auto"><button className="btn btn-dark">Buscar</button></div>
      </form></div>
      <div className="table-responsive"><table className="table platform-table mb-0">
        <thead><tr><th>Membro</th><th>Função</th><th>MFA</th><th>Status</th><th>Último login</th><th className="text-end">Ações</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={6} className="text-center py-5"><span className="spinner-border spinner-border-sm text-success" /></td></tr> : data?.results.length ? data.results.map((member) => <tr key={member.id}>
          <td><div className="fw-semibold">{member.full_name}</div><div className="text-muted small">{member.email}{member.id === currentStaff?.id && " · Você"}</div></td>
          <td><span className="badge text-bg-light">{member.role_display}</span></td>
          <td><span className={`platform-status ${member.mfa_required ? "active" : "suspended"}`}>{member.mfa_required ? "Obrigatório" : "Dispensado"}</span></td>
          <td><span className={`platform-status ${member.is_active ? "active" : "suspended"}`}>{member.is_active ? "Ativo" : "Bloqueado"}</span></td>
          <td className="small text-muted">{member.last_login ? new Date(member.last_login).toLocaleString("pt-BR") : "Nunca acessou"}</td>
          <td className="text-end"><button className="btn btn-sm btn-outline-secondary me-2" title="Editar" onClick={() => setEditing(member)}><Pencil size={15} /></button><button className="btn btn-sm btn-outline-secondary me-2" title="Encerrar sessões" onClick={() => void runAction(member, "sessions")}><KeyRound size={15} /></button><button className={`btn btn-sm ${member.is_active ? "btn-outline-danger" : "btn-outline-success"}`} disabled={member.id === currentStaff?.id} title={member.is_active ? "Bloquear" : "Reativar"} onClick={() => void runAction(member, "status")}>{member.is_active ? <UserRoundX size={15} /> : <UserRoundCheck size={15} />}</button></td>
        </tr>) : <tr><td colSpan={6} className="text-center text-muted py-5">Nenhum membro encontrado.</td></tr>}</tbody>
      </table></div>
    </div>
    {editing !== undefined && <TeamMemberModal member={editing} currentRole={currentStaff?.role} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); showToast(`Membro ${editing ? "atualizado" : "criado"} com sucesso.`, "success"); load(); }} />}
  </>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof UserCog }) {
  return <div className="platform-card p-3 h-100 d-flex align-items-center gap-3"><div className="platform-icon"><Icon size={19} /></div><div><div className="fs-4 fw-bold">{value}</div><div className="platform-label">{label}</div></div></div>;
}

function TeamMemberModal({ member, currentRole, onClose, onSaved }: { member: PlatformTeamMember | null; currentRole?: PlatformRole; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<PlatformTeamMemberPayload>({
    email: member?.email || "",
    full_name: member?.full_name || "",
    role: member?.role || "platform_support",
    mfa_required: member?.mfa_required ?? true,
    initial_password: "",
  });
  const availableRoles = currentRole === "platform_owner" ? roles : roles.filter((item) => item.value !== "platform_owner");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const payload = { ...form };
      if (member && !payload.initial_password) delete payload.initial_password;
      if (member) await platformService.updateTeamMember(member.id, payload);
      else await platformService.createTeamMember(payload);
      onSaved();
    } catch (requestError) {
      const data = (requestError as { response?: { data?: Record<string, string | string[]> } }).response?.data;
      const message = data && Object.values(data).flat(2).find((value) => typeof value === "string");
      setError(String(message || "Não foi possível salvar o membro."));
    } finally { setSaving(false); }
  };
  return <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3" style={{ zIndex: 1100, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)" }} onMouseDown={onClose}><div className="platform-card w-100" style={{ maxWidth: 680 }} onMouseDown={(event) => event.stopPropagation()}>
    <div className="p-4 border-bottom d-flex justify-content-between"><div><h2 className="h4 fw-bold mb-1">{member ? "Editar membro" : "Novo membro interno"}</h2><div className="text-muted small">A senha inicial deverá ser alterada no primeiro acesso.</div></div><button className="btn btn-sm btn-light" onClick={onClose}><X size={18} /></button></div>
    <form onSubmit={submit}><div className="p-4">{error && <div className="alert alert-danger py-2">{error}</div>}<div className="row g-3">
      <div className="col-md-6"><label className="form-label fw-semibold">Nome completo</label><input required className="form-control" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></div>
      <div className="col-md-6"><label className="form-label fw-semibold">E-mail corporativo</label><input required type="email" className="form-control" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
      <div className="col-md-6"><label className="form-label fw-semibold">Função</label><select className="form-select" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as PlatformRole })}>{availableRoles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
      <div className="col-md-6"><label className="form-label fw-semibold">{member ? "Nova senha (opcional)" : "Senha inicial"}</label><input required={!member} minLength={8} type="password" className="form-control" autoComplete="new-password" value={form.initial_password || ""} onChange={(event) => setForm({ ...form, initial_password: event.target.value })} /></div>
      <div className="col-12"><label className="form-check"><input type="checkbox" className="form-check-input" checked={form.mfa_required} onChange={(event) => setForm({ ...form, mfa_required: event.target.checked })} /><span className="form-check-label fw-semibold">Exigir autenticação multifator (MFA)</span></label><div className="form-text">A exigência será acompanhada no perfil interno.</div></div>
    </div></div><div className="p-3 border-top d-flex justify-content-end gap-2"><button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-success" disabled={saving}>{saving ? "Salvando..." : "Salvar membro"}</button></div></form>
  </div></div>;
}
