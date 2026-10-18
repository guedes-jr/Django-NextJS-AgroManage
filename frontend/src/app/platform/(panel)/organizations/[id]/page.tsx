"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState, type KeyboardEvent } from "react";
import { Archive, ArrowLeft, Boxes, Building2, Eye, Pencil, RefreshCcw, PauseCircle, Sprout, Users, WalletCards } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { OrganizationDossierSection as DossierSection } from "@/components/platform/OrganizationDossierSections";
import { OrganizationOperationsSection } from "@/components/platform/OrganizationOperationsSection";
import { OrganizationResponsibleModal } from "@/components/platform/OrganizationResponsibleModal";
import { OrganizationFormModal } from "@/components/platform/OrganizationFormModal";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import { platformService } from "@/services/platformApi";
import type { OrganizationDossierSection, OrganizationStatus, PlatformOrganization } from "@/types/platform";

const sectionLabels: Record<OrganizationDossierSection, string> = {
  summary: "Resumo", operation: "Operação e pendências", tickets: "Chamados", exports: "Exportação de dados", recovery: "Recuperação de dados", registration: "Cadastro", users: "Usuários", subscription: "Assinatura",
  invoices: "Faturas", payments: "Pagamentos", consumption: "Consumo e limites", adoption: "Adoção e uso", history: "Histórico", "support-access": "Acessos assistidos",
};

export default function PlatformOrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [organization, setOrganization] = useState<PlatformOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [statusAction, setStatusAction] = useState<OrganizationStatus | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [resending, setResending] = useState(false);
  const [showResponsible, setShowResponsible] = useState(false);
  const canManage = organization?.can_manage === true;
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [requestedSection, setRequestedSection] = useState(() => typeof window === "undefined" ? "summary" : new URLSearchParams(window.location.search).get("tab") || "summary");


  useEffect(() => {
    let active = true;
    platformService.organization(id)
      .then((result) => { if (active) { setOrganization(result); setLoadError(""); } })
      .catch(error => { if (active) setLoadError(getOrganizationErrorMessage(error, "Não foi possível carregar a organização.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, loadAttempt]);

  const statusLabels: Record<OrganizationStatus, string> = { active: "Reativar", suspended: "Suspender", archived: "Arquivar" };
  const changeStatus = async (event: FormEvent) => {
    event.preventDefault();
    if (!organization || !statusAction) return;
    setChanging(true);
    try {
      const actions = {
        active: platformService.activateOrganization,
        suspended: platformService.suspendOrganization,
        archived: platformService.archiveOrganization,
      };
      await actions[statusAction](organization.id, statusReason.trim());
      setStatusAction(null);
      setStatusReason("");
      setOrganization(await platformService.organization(id));
      showToast("Estado da organização atualizado com sucesso.", "success");
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      showToast(detail || "Não foi possível atualizar o estado. Recarregue a organização e tente novamente.", "error");
    } finally { setChanging(false); }
  };

  const resendInvitation = async () => {
    if (loadError) return <div className="alert alert-danger" role="alert">{loadError}<button className="btn btn-link" onClick={() => { setLoading(true); setLoadAttempt(value => value + 1); }}>Tentar novamente</button></div>;
  if (!organization) return;
    setResending(true);
    try {
      const result = await platformService.resendAdministratorInvitation(organization.id);
      setOrganization(result);
      if (result.administrator_invitation?.state === "failed") {
        showToast(result.administrator_invitation.delivery_error, "error");
      } else {
        showToast("Novo convite solicitado. O link anterior foi invalidado.", "success");
      }
    } catch (error) {
      showToast(getOrganizationErrorMessage(error, "Não foi possível reenviar o convite."), "error");
    } finally { setResending(false); }
  };
  const invitationLabels = { pending: "Envio pendente", sent: "Convite enviado", failed: "Falha no envio", expired: "Convite expirado", accepted: "Convite aceito", revoked: "Convite invalidado" };

  if (loading || (!loadError && organization?.id !== id)) return <div className="py-5 text-center"><div className="spinner-border text-success" /></div>;
  if (!organization) return <div className="alert alert-danger">Organização não encontrada.</div>;

  const sections = organization.available_sections || ["summary"];
  const selectedSection = sections.find(section => section === requestedSection) || "summary";
  const selectSection = (section: OrganizationDossierSection) => {
    setRequestedSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", section);
    window.history.replaceState(null, "", url);
  };
  const tabKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    let index = sections.indexOf(selectedSection);
    if (event.key === "ArrowRight") index = (index + 1) % sections.length;
    else if (event.key === "ArrowLeft") index = (index - 1 + sections.length) % sections.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = sections.length - 1;
    else return;
    event.preventDefault();
    selectSection(sections[index]);
    document.getElementById(`organization-tab-${sections[index]}`)?.focus();
  };

  const metrics = [
    {label:"Usuários", value:organization.users_count, icon:Users},
    {label:"Fazendas", value:organization.farms_count, icon:Building2},
    {label:"Ciclos de plantio", value:organization.planting_cycles_count ?? 0, icon:Sprout},
    {label:"Itens de estoque", value:organization.inventory_items_count ?? 0, icon:Boxes},
    {label:"Transações", value:organization.transactions_count ?? 0, icon:WalletCards},
  ];

  return <>
    <Link href="/platform/organizations" className="text-decoration-none text-muted d-inline-flex align-items-center gap-2 mb-3"><ArrowLeft size={16}/> Voltar às organizações</Link>
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4"><div><div className="d-flex align-items-center gap-2 mb-2"><span className={`platform-status ${organization.status}`}>{organization.status_display}</span><span className="badge text-bg-dark text-uppercase">{organization.plan}</span></div><h1 className="h2 fw-bold mb-1">{organization.name}</h1><p className="text-muted mb-0">{organization.document || "Documento não informado"} · {organization.slug}</p></div><div className="d-flex flex-wrap gap-2"><button className="btn btn-outline-secondary" disabled={changing || resending} onClick={() => { setLoading(true); setLoadAttempt(value => value + 1); }}>Atualizar ficha</button>{organization.status === "active" && sections.includes("support-access") && <Link className="btn btn-outline-dark d-flex align-items-center gap-2" href={`/platform/support-access?organization=${organization.id}`}><Eye size={16}/>Acesso assistido</Link>}{canManage && <button className="btn btn-outline-secondary d-flex align-items-center gap-2" onClick={() => setShowEdit(true)}><Pencil size={16}/>Editar</button>}{canManage && organization.status === "active" && <button className="btn btn-outline-warning d-flex align-items-center gap-2" onClick={() => { setStatusReason(""); setStatusAction("suspended"); }} disabled={changing}><PauseCircle size={16}/>Suspender</button>}{canManage && organization.status !== "archived" && <button className="btn btn-outline-danger d-flex align-items-center gap-2" onClick={() => { setStatusReason(""); setStatusAction("archived"); }} disabled={changing}><Archive size={16}/>Arquivar</button>}{canManage && organization.status !== "active" && <button className="btn btn-success d-flex align-items-center gap-2" onClick={() => { setStatusReason(""); setStatusAction("active"); }} disabled={changing}><RefreshCcw size={16}/>Reativar organização</button>}</div></div>
    {canManage && statusAction && <form className="platform-card p-4 mb-4" onSubmit={changeStatus} aria-label="Alterar estado da organização">
      <h2 className="h5">{statusLabels[statusAction]} {organization.name}?</h2>
      <p className="text-muted">{statusAction === "active" ? "O acesso será liberado e os usuários precisarão entrar novamente." : "Os dados serão preservados. O acesso será bloqueado e as sessões dos usuários e do suporte serão encerradas."}</p>
      <label htmlFor="organization-status-reason" className="form-label">Motivo (opcional)</label>
      <textarea id="organization-status-reason" className="form-control mb-3" maxLength={1000} rows={2} value={statusReason} onChange={event => setStatusReason(event.target.value)} disabled={changing}/>
      <div className="d-flex gap-2"><button className="btn btn-dark" disabled={changing}>{changing ? "Processando..." : `Confirmar: ${statusLabels[statusAction]}`}</button><button type="button" className="btn btn-outline-secondary" onClick={() => setStatusAction(null)} disabled={changing}>Cancelar</button></div>
    </form>}
    <div role="tablist" aria-label="Ficha da organização" className="d-flex gap-2 overflow-auto border-bottom mb-4 pb-2">{sections.map(section => <button key={section} type="button" role="tab" id={`organization-tab-${section}`} aria-selected={selectedSection === section} aria-controls="organization-section" tabIndex={selectedSection === section ? 0 : -1} className={`btn text-nowrap ${selectedSection === section ? "btn-dark" : "btn-outline-secondary"}`} onClick={() => selectSection(section)} onKeyDown={tabKeyboard}>{sectionLabels[section]}</button>)}</div>
    {requestedSection !== selectedSection && <p className="alert alert-info">Esta seção não está disponível para seu perfil. O resumo da organização está aberto.</p>}
    <div id="organization-section" tabIndex={0} role="tabpanel" aria-labelledby={`organization-tab-${selectedSection}`}>
      {selectedSection === "summary" ? <>
    <div className="platform-card p-3 mb-4"><strong>Estado: {organization.status_display}</strong><div className="text-muted small">Última alteração: {new Date(organization.status_changed_at).toLocaleString("pt-BR")}</div>{organization.status_reason && <p className="mb-0 mt-2">Motivo: {organization.status_reason}</p>}</div>
    <section className="platform-card p-4 mb-4"><div className="d-flex flex-wrap justify-content-between gap-3"><div><h2 className="h5">Responsável pela organização</h2>{organization.responsible ? <><strong>{organization.responsible.full_name}</strong><div>{organization.responsible.email}</div><span className={`platform-status mt-2 ${organization.responsible.is_active ? "active" : "suspended"}`}>{organization.responsible.is_active ? "Usuário ativo" : "Usuário inativo"}</span></> : <p className="text-muted mb-0">Nenhum responsável definido.</p>}</div>{canManage && <div><button className="btn btn-outline-secondary" onClick={() => setShowResponsible(true)}>{organization.responsible ? "Transferir responsável" : "Definir responsável"}</button></div>}</div>{organization.administrator_invitation && !organization.administrator_invitation.accepted_at && !organization.administrator_invitation.revoked_at && <div className="small mt-3">Convite: {invitationLabels[organization.administrator_invitation.state]} <button type="button" className="btn btn-link btn-sm" onClick={() => selectSection("users")}>Ver convite</button></div>}</section>
    <OrganizationOperationsSection organization={organization} onNavigate={selectSection}/>
    <div className="row g-3 mb-4 mt-1">{metrics.map((metric) => <div className="col-6 col-lg" key={metric.label}><div className="platform-card p-3 h-100"><div className="platform-icon mb-3"><metric.icon size={19}/></div><div className="fs-4 fw-bold">{metric.value}</div><div className="text-muted small">{metric.label}</div></div></div>)}</div>
      </> : <>
        {selectedSection === "users" && <>
    {organization.administrator_invitation && <section className="platform-card p-4 mb-4">
      <div className="d-flex flex-wrap justify-content-between gap-3">
        <div><h2 className="h5">Primeiro administrador</h2><strong>{organization.administrator_invitation.full_name}</strong><div>{organization.administrator_invitation.email}</div></div>
        <div><span className="badge text-bg-light">{invitationLabels[organization.administrator_invitation.state]}</span></div>
      </div>
      <div className="small text-muted mt-3">Tentativas de envio: {organization.administrator_invitation.delivery_attempts}{organization.administrator_invitation.last_attempt_at && <> · Última tentativa: {new Date(organization.administrator_invitation.last_attempt_at).toLocaleString("pt-BR")}</>}</div>
      {organization.administrator_invitation.accepted_at ? <div className="small text-muted">Aceito em {new Date(organization.administrator_invitation.accepted_at).toLocaleString("pt-BR")}</div> : organization.administrator_invitation.revoked_at ? <div className="small text-muted mt-2">Convite invalidado em {new Date(organization.administrator_invitation.revoked_at).toLocaleString("pt-BR")}.</div> : <>
        <div className="small text-muted">Validade: {new Date(organization.administrator_invitation.expires_at).toLocaleString("pt-BR")}</div>
        {organization.administrator_invitation.delivery_error && <div className="alert alert-warning mt-3 mb-0" role="alert">{organization.administrator_invitation.delivery_error}</div>}
        {canManage && organization.status === "active" && <button className="btn btn-outline-success mt-3" disabled={resending} onClick={() => void resendInvitation()}>{resending ? "Enviando…" : "Reenviar convite"}</button>}
      </>}
    </section>}
        </>}
        <DossierSection key={`${organization.id}-${selectedSection}-${organization.updated_at}`} organization={organization} section={selectedSection} onNavigate={selectSection}/>
      </>}
    </div>
    {showResponsible && <OrganizationResponsibleModal organization={organization} onClose={() => setShowResponsible(false)} onSaved={result => { setOrganization(result); setShowResponsible(false); showToast("Responsável atualizado com sucesso.", "success"); }}/>}
    {showEdit && <OrganizationFormModal organization={organization} onClose={() => setShowEdit(false)} onSaved={(updated) => { setOrganization(updated); setShowEdit(false); showToast("Organização atualizada com sucesso.", "success"); }} />}
  </>;
}
