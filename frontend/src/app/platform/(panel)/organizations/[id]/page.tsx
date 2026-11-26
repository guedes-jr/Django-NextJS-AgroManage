"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Activity, Archive, BadgePercent, Trash2, ArrowLeft, Boxes, Building2, ClipboardList, CreditCard, DatabaseBackup, Download, Eye, FileText, Gauge, History, Layers, LayoutDashboard, LifeBuoy, Pencil, RefreshCcw, PauseCircle, Receipt, ShieldCheck, Sprout, Users, WalletCards, type LucideIcon } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { OrganizationDossierSection as DossierSection } from "@/components/platform/OrganizationDossierSections";
import { OrganizationOperationsSection } from "@/components/platform/OrganizationOperationsSection";
import { OrganizationResponsibleModal } from "@/components/platform/OrganizationResponsibleModal";
import { OrganizationFormModal } from "@/components/platform/OrganizationFormModal";
import { OrganizationSegmentsSection } from "@/components/platform/OrganizationSegmentsSection";
import { OrganizationDiscountsSection } from "@/components/platform/OrganizationDiscountsSection";
import { OrganizationDeleteForm } from "@/components/platform/OrganizationDeleteForm";
import { usePlatformIsOwner } from "@/components/platform/usePlatformRole";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import { platformService } from "@/services/platformApi";
import type { OrganizationDossierSection, OrganizationStatus, PlatformOrganization } from "@/types/platform";

const sectionLabels: Record<OrganizationDossierSection, string> = {
  summary: "Resumo", operation: "Operação e pendências", tickets: "Chamados", exports: "Exportação de dados", recovery: "Recuperação de dados", registration: "Cadastro", users: "Usuários", subscription: "Assinatura",
  segments: "Segmentos contratados", discounts: "Descontos", invoices: "Faturas", payments: "Pagamentos", consumption: "Consumo e limites", adoption: "Adoção e uso", history: "Histórico", "support-access": "Acessos assistidos",
};
const sectionIcons: Record<OrganizationDossierSection, LucideIcon> = {
  summary: LayoutDashboard, operation: ClipboardList, adoption: Activity, consumption: Gauge, users: Users, "support-access": ShieldCheck, tickets: LifeBuoy,
  subscription: CreditCard, segments: Layers, discounts: BadgePercent, invoices: FileText, payments: Receipt, registration: Building2, exports: Download, recovery: DatabaseBackup, history: History,
};
const sectionGroups: { label: string; sections: OrganizationDossierSection[] }[] = [
  { label: "Visão geral", sections: ["summary", "operation", "adoption", "consumption"] },
  { label: "Pessoas e suporte", sections: ["users", "support-access", "tickets"] },
  { label: "Comercial", sections: ["subscription", "segments", "discounts", "invoices", "payments"] },
  { label: "Dados", sections: ["registration", "exports", "recovery", "history"] },
];

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
  const isOwner = usePlatformIsOwner();
  const [showDelete, setShowDelete] = useState(false);
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

  if (loading || (!loadError && organization?.id !== id)) return <div className="py-5 text-center" role="status"><div className="spinner-border text-success" /><span className="visually-hidden">Carregando organização…</span></div>;
  if (loadError || !organization) return <div className="alert alert-danger d-flex flex-wrap align-items-center gap-2" role="alert">{loadError || "Organização não encontrada."}<button className="btn btn-sm btn-outline-danger" onClick={() => { setLoading(true); setLoadAttempt(value => value + 1); }}>Tentar novamente</button><Link href="/platform/organizations" className="btn btn-sm btn-link">Voltar às organizações</Link></div>;

  const sections = organization.available_sections || ["summary"];
  const selectedSection = sections.find(section => section === requestedSection) || "summary";
  const selectSection = (section: OrganizationDossierSection) => {
    setRequestedSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", section);
    window.history.replaceState(null, "", url);
  };
  const metrics = [
    {label:"Usuários", value:organization.users_count, icon:Users},
    {label:"Fazendas", value:organization.farms_count, icon:Building2},
    {label:"Ciclos de plantio", value:organization.planting_cycles_count ?? 0, icon:Sprout},
    {label:"Itens de estoque", value:organization.inventory_items_count ?? 0, icon:Boxes},
    {label:"Transações", value:organization.transactions_count ?? 0, icon:WalletCards},
  ];

  const visibleGroups = sectionGroups.map(group => ({ ...group, sections: group.sections.filter(section => sections.includes(section)) })).filter(group => group.sections.length);
  const openStatus = (next: OrganizationStatus) => { setStatusReason(""); setStatusAction(next); };

  return <div className="platform-management">
    <Link href="/platform/organizations" className="platform-back"><ArrowLeft size={15}/>Voltar às organizações</Link>
    <header className="platform-card p-3 mb-3">
      <div className="platform-page-header mb-0">
        <div>
          <div className="platform-badges">
            <span className={`platform-pill ${organization.status === "active" ? "success" : organization.status === "suspended" ? "danger" : ""}`}>{organization.status_display}</span>
            <span className="platform-pill text-uppercase">{organization.subscription_plan_code || organization.plan}</span>
          </div>
          <h1>{organization.name}</h1>
          <p>{organization.document || "Documento não informado"} · {organization.slug}{organization.responsible && <> · Responsável: {organization.responsible.full_name}</>}</p>
        </div>
        <div className="platform-actions">
          <button className="btn btn-sm btn-outline-secondary" disabled={changing || resending} onClick={() => { setLoading(true); setLoadAttempt(value => value + 1); }}><RefreshCcw size={15}/>Atualizar</button>
          {organization.status === "active" && sections.includes("support-access") && <Link className="btn btn-sm btn-outline-dark" href={`/platform/support-access?organization=${organization.id}`}><Eye size={15}/>Acesso assistido</Link>}
          {canManage && <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowEdit(true)}><Pencil size={15}/>Editar cadastro</button>}
          {canManage && organization.status === "active" && <button className="btn btn-sm btn-outline-warning" onClick={() => openStatus("suspended")} disabled={changing}><PauseCircle size={15}/>Suspender</button>}
          {canManage && organization.status !== "archived" && <button className="btn btn-sm btn-outline-danger" onClick={() => openStatus("archived")} disabled={changing}><Archive size={15}/>Arquivar</button>}
          {canManage && organization.status !== "active" && <button className="btn btn-sm btn-success" onClick={() => openStatus("active")} disabled={changing}><RefreshCcw size={15}/>Reativar</button>}
          {isOwner && organization.status === "archived" && <button className="btn btn-sm btn-danger" onClick={() => setShowDelete(true)} disabled={changing}><Trash2 size={15}/>Excluir definitivamente</button>}
        </div>
      </div>
      <div className="platform-kpis mt-3">{metrics.map(metric => <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div>
    </header>
    {canManage && statusAction && <form className="platform-card platform-form-card mb-3" onSubmit={changeStatus} aria-label="Alterar estado da organização">
      <h2>{statusLabels[statusAction]} {organization.name}?</h2>
      <p>{statusAction === "active" ? "O acesso será liberado e os usuários precisarão entrar novamente." : "Os dados serão preservados. O acesso será bloqueado e as sessões dos usuários e do suporte serão encerradas."}</p>
      <label htmlFor="organization-status-reason" className="form-label">Motivo (opcional)</label>
      <textarea id="organization-status-reason" className="form-control" maxLength={1000} rows={2} value={statusReason} onChange={event => setStatusReason(event.target.value)} disabled={changing}/>
      <div className="platform-form-footer"><button type="button" className="btn btn-outline-secondary" onClick={() => setStatusAction(null)} disabled={changing}>Cancelar</button><button className="btn btn-dark" disabled={changing}>{changing ? "Processando..." : `Confirmar: ${statusLabels[statusAction]}`}</button></div>
    </form>}
    {isOwner && showDelete && <OrganizationDeleteForm organizationId={organization.id} name={organization.name} onCancel={() => setShowDelete(false)}/>}
    <div className="platform-dossier">
      <nav className="platform-card platform-dossier-nav" aria-label="Ficha da organização">
        {visibleGroups.map(group => <div className="platform-dossier-group" key={group.label} role="group" aria-label={group.label}>
          <div className="platform-dossier-caption">{group.label}</div>
          {group.sections.map(section => { const Icon = sectionIcons[section]; return <button key={section} type="button" aria-current={selectedSection === section ? "page" : undefined} aria-controls="organization-section" onClick={() => selectSection(section)}><Icon size={16}/>{sectionLabels[section]}</button>; })}
        </div>)}
      </nav>
      <div className="platform-dossier-body" id="organization-section" aria-label={sectionLabels[selectedSection]}>
        {requestedSection !== selectedSection && <p className="alert alert-info py-2 small">Esta seção não está disponível para seu perfil. O resumo da organização está aberto.</p>}
        {selectedSection === "summary" ? <>
          <div className="platform-card p-3 mb-3"><strong>Estado: {organization.status_display}</strong><div className="text-muted small">Última alteração: {new Date(organization.status_changed_at).toLocaleString("pt-BR")}</div>{organization.status_reason && <p className="mb-0 mt-2">Motivo: {organization.status_reason}</p>}</div>
          <section className="platform-card p-3 mb-3"><div className="d-flex flex-wrap justify-content-between gap-3"><div><h2 className="h6 fw-bold">Responsável pela organização</h2>{organization.responsible ? <><strong>{organization.responsible.full_name}</strong><div>{organization.responsible.email}</div><span className={`platform-pill mt-2 ${organization.responsible.is_active ? "success" : "danger"}`}>{organization.responsible.is_active ? "Usuário ativo" : "Usuário inativo"}</span></> : <p className="text-muted mb-0">Nenhum responsável definido.</p>}</div><div className="platform-actions align-items-start">{organization.responsible && <Link className="btn btn-sm btn-outline-secondary" href={`/platform/users/${organization.responsible.id}`}>Gerenciar usuário</Link>}{canManage && <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowResponsible(true)}>{organization.responsible ? "Transferir responsável" : "Definir responsável"}</button>}</div></div>{organization.administrator_invitation && !organization.administrator_invitation.accepted_at && !organization.administrator_invitation.revoked_at && <div className="small mt-3">Convite: {invitationLabels[organization.administrator_invitation.state]} <button type="button" className="btn btn-outline-secondary btn-sm platform-section-action" onClick={() => selectSection("users")}>Ver convite</button></div>}</section>
          <OrganizationOperationsSection organization={organization} onNavigate={selectSection}/>
        </> : selectedSection === "segments" ? <OrganizationSegmentsSection organizationId={organization.id} canManage={canManage}/> : selectedSection === "discounts" ? <OrganizationDiscountsSection organizationId={organization.id} canManage={canManage}/> : <>
          {selectedSection === "users" && <>
            {organization.administrator_invitation && <section className="platform-card p-3 mb-3">
              <div className="d-flex flex-wrap justify-content-between gap-3">
                <div><h2 className="h6 fw-bold">Primeiro administrador</h2><strong>{organization.administrator_invitation.full_name}</strong><div>{organization.administrator_invitation.email}</div></div>
                <div><span className="platform-pill">{invitationLabels[organization.administrator_invitation.state]}</span></div>
              </div>
              <div className="small text-muted mt-3">Tentativas de envio: {organization.administrator_invitation.delivery_attempts}{organization.administrator_invitation.last_attempt_at && <> · Última tentativa: {new Date(organization.administrator_invitation.last_attempt_at).toLocaleString("pt-BR")}</>}</div>
              {organization.administrator_invitation.accepted_at ? <div className="small text-muted">Aceito em {new Date(organization.administrator_invitation.accepted_at).toLocaleString("pt-BR")}</div> : organization.administrator_invitation.revoked_at ? <div className="small text-muted mt-2">Convite invalidado em {new Date(organization.administrator_invitation.revoked_at).toLocaleString("pt-BR")}.</div> : <>
                <div className="small text-muted">Validade: {new Date(organization.administrator_invitation.expires_at).toLocaleString("pt-BR")}</div>
                {organization.administrator_invitation.delivery_error && <div className="alert alert-warning mt-3 mb-0" role="alert">{organization.administrator_invitation.delivery_error}</div>}
                {canManage && organization.status === "active" && <button className="btn btn-sm btn-outline-success mt-3" disabled={resending} onClick={() => void resendInvitation()}>{resending ? "Enviando…" : "Reenviar convite"}</button>}
              </>}
            </section>}
          </>}
          <DossierSection key={`${organization.id}-${selectedSection}-${organization.updated_at}`} organization={organization} section={selectedSection} onNavigate={selectSection}/>
        </>}
      </div>
    </div>
    {showResponsible && <OrganizationResponsibleModal organization={organization} onClose={() => setShowResponsible(false)} onSaved={result => { setOrganization(result); setShowResponsible(false); showToast("Responsável atualizado com sucesso.", "success"); }}/>}
    {showEdit && <OrganizationFormModal organization={organization} onClose={() => setShowEdit(false)} onSaved={(updated) => { setOrganization(updated); setShowEdit(false); showToast("Organização atualizada com sucesso.", "success"); }} />}
  </div>;
}
