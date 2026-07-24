"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Clock3, ExternalLink, Eye, History, ShieldCheck, Ticket, UserRound, XCircle } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { PLATFORM_STAFF, platformService } from "@/services/platformApi";
import type { PlatformOrganization, PlatformStaff, PlatformSupportAccess } from "@/types/platform";

export default function SupportAccessPage() {
  const { showToast } = useToast();
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>([]);
  const [activeAccesses, setActiveAccesses] = useState<PlatformSupportAccess[]>([]);
  const [history, setHistory] = useState<PlatformSupportAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [currentStaff] = useState<PlatformStaff | null>(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem(PLATFORM_STAFF) || "null"); } catch { return null; }
  });
  const [form, setForm] = useState(() => {
    let organization = "";
    if (typeof window !== "undefined") organization = new URLSearchParams(window.location.search).get("organization") || "";
    return { organization_id: organization, ticket_reference: "", justification: "", duration_minutes: 30 };
  });

  const load = useCallback(() => {
    Promise.all([
      platformService.supportAccesses({ status: "active", page_size: 100 }),
      platformService.supportAccesses({ page_size: 100 }),
      platformService.organizations({ is_active: true, page_size: 200 }),
    ]).then(([active, all, organizationPage]) => {
      setActiveAccesses(active.results);
      setHistory(all.results.filter((grant) => !grant.is_valid));
      setOrganizations(organizationPage.results);
    }).catch(() => showToast("Não foi possível carregar os acessos assistidos.", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const persistAndOpen = (result: { access: string; grant: PlatformSupportAccess }, targetWindow: Window | null) => {
    localStorage.setItem("support_access_token", result.access);
    localStorage.setItem("support_context", JSON.stringify(result.grant));
    if (targetWindow) targetWindow.location.href = "/home";
    else window.open("/home", "_blank", "noopener,noreferrer");
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const targetWindow = window.open("", "_blank");
    setCreating(true);
    try {
      const result = await platformService.createSupportAccess(form);
      persistAndOpen(result, targetWindow);
      showToast("Acesso assistido iniciado em uma nova aba.", "success");
      setForm((current) => ({ ...current, ticket_reference: "", justification: "" }));
      load();
    } catch (error) {
      targetWindow?.close();
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      showToast(detail || "Não foi possível iniciar o acesso assistido.", "error");
    } finally { setCreating(false); }
  };

  const openExisting = async (grant: PlatformSupportAccess) => {
    const targetWindow = window.open("", "_blank");
    try {
      persistAndOpen(await platformService.openSupportAccess(grant.id), targetWindow);
    } catch (error) {
      targetWindow?.close();
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      showToast(detail || "Não foi possível abrir o acesso.", "error");
    }
  };

  const revoke = async (grant: PlatformSupportAccess) => {
    if (!window.confirm(`Revogar o acesso ao chamado ${grant.ticket_reference || "sem referência"}?`)) return;
    try {
      await platformService.revokeSupportAccess(grant.id);
      showToast("Acesso revogado imediatamente.", "success");
      load();
    } catch { showToast("Não foi possível revogar o acesso.", "error"); }
  };

  return <>
    <div className="mb-4"><div className="platform-label mb-2">Suporte controlado</div><h1 className="h2 fw-bold mb-1">Acesso assistido</h1><p className="text-muted mb-0">Acesso temporário e somente leitura, sempre vinculado a um chamado e uma justificativa.</p></div>

    <div className="alert alert-warning d-flex gap-3 align-items-start"><ShieldCheck size={22} className="flex-shrink-0" /><div><strong>Proteção dos dados do cliente</strong><div className="small">O acesso expira automaticamente, não permite alterações e todas as aberturas e revogações são auditadas.</div></div></div>

    <form className="platform-card p-4 mb-4" onSubmit={create}>
      <h2 className="h5 fw-bold mb-3">Iniciar novo acesso</h2>
      <div className="row g-3">
        <div className="col-lg-4"><label className="form-label fw-semibold">Organização</label><select required className="form-select" value={form.organization_id} onChange={(event) => setForm({ ...form, organization_id: event.target.value })}><option value="">Selecione a organização</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></div>
        <div className="col-md-6 col-lg-3"><label className="form-label fw-semibold">Chamado / protocolo</label><div className="input-group"><span className="input-group-text bg-white"><Ticket size={16} /></span><input required minLength={3} className="form-control" placeholder="Ex.: SUP-2026-0012" value={form.ticket_reference} onChange={(event) => setForm({ ...form, ticket_reference: event.target.value })} /></div></div>
        <div className="col-md-6 col-lg-2"><label className="form-label fw-semibold">Duração</label><select className="form-select" value={form.duration_minutes} onChange={(event) => setForm({ ...form, duration_minutes: Number(event.target.value) })}>{[5, 15, 30, 45, 60].map((minutes) => <option value={minutes} key={minutes}>{minutes} minutos</option>)}</select></div>
        <div className="col-lg-3 d-flex align-items-end"><button className="btn btn-success w-100 d-flex align-items-center justify-content-center gap-2" disabled={creating}><Eye size={17} />{creating ? "Iniciando..." : "Iniciar acesso"}</button></div>
        <div className="col-12"><label className="form-label fw-semibold">Justificativa detalhada</label><textarea required minLength={10} rows={3} className="form-control" placeholder="Descreva o problema relatado e por que o acesso aos dados é necessário." value={form.justification} onChange={(event) => setForm({ ...form, justification: event.target.value })} /></div>
      </div>
    </form>

    <section className="platform-card overflow-hidden mb-4">
      <div className="p-4 border-bottom"><h2 className="h5 fw-bold mb-1">Acessos ativos</h2><div className="text-muted small">{activeAccesses.length} concessões dentro do prazo.</div></div>
      <div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th>Chamado</th><th>Organização</th><th>Responsável</th><th>Justificativa</th><th>Validade</th><th>Último uso</th><th /></tr></thead><tbody>
        {loading ? <tr><td colSpan={7} className="text-center py-5"><span className="spinner-border spinner-border-sm text-success" /></td></tr> : activeAccesses.length ? activeAccesses.map((grant) => <tr key={grant.id}>
          <td><span className="badge text-bg-light">{grant.ticket_reference || "Sem protocolo"}</span></td><td className="fw-semibold">{grant.organization_name}</td><td>{grant.operator_name}</td><td><div className="text-truncate" style={{ maxWidth: 300 }} title={grant.justification}>{grant.justification}</div></td><td className="small"><Clock3 size={14} /> {new Date(grant.expires_at).toLocaleString("pt-BR")}</td><td className="small text-muted">{grant.last_used_at ? new Date(grant.last_used_at).toLocaleString("pt-BR") : "Ainda não utilizado"}</td>
          <td className="text-end"><div className="d-flex justify-content-end gap-2">{grant.operator === currentStaff?.id && <button className="btn btn-sm btn-outline-success d-flex align-items-center gap-1" onClick={() => void openExisting(grant)}><ExternalLink size={14} />Abrir</button>}<button className="btn btn-sm btn-outline-danger" onClick={() => void revoke(grant)}>Revogar</button></div></td>
        </tr>) : <tr><td colSpan={7} className="text-center text-muted py-5">Nenhum acesso ativo.</td></tr>}
      </tbody></table></div>
    </section>

    <section className="platform-card overflow-hidden">
      <div className="p-4 border-bottom"><h2 className="h5 fw-bold mb-1"><History size={19} /> Histórico</h2><div className="text-muted small">Acessos expirados e revogados, preservados para auditoria.</div></div>
      <div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th>Chamado</th><th>Organização</th><th>Responsável</th><th>Criado em</th><th>Encerramento</th><th>Último uso</th></tr></thead><tbody>
        {history.length ? history.map((grant) => <tr key={grant.id}><td>{grant.ticket_reference || "—"}</td><td>{grant.organization_name}</td><td><UserRound size={14} /> {grant.operator_name}</td><td className="small">{new Date(grant.created_at).toLocaleString("pt-BR")}</td><td><span className={`platform-status ${grant.revoked_at ? "suspended" : ""}`}><XCircle size={13} />{grant.revoked_at ? `Revogado em ${new Date(grant.revoked_at).toLocaleString("pt-BR")}` : `Expirou em ${new Date(grant.expires_at).toLocaleString("pt-BR")}`}</span></td><td className="small text-muted">{grant.last_used_at ? new Date(grant.last_used_at).toLocaleString("pt-BR") : "Não utilizado"}</td></tr>) : <tr><td colSpan={6} className="text-center text-muted py-5">Nenhum acesso encerrado no histórico.</td></tr>}
      </tbody></table></div>
    </section>
  </>;
}
