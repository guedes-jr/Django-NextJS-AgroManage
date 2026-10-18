"use client";
import { useEffect, useState } from "react";
import { platformService } from "@/services/platformApi";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import { adoptionLabels } from "@/components/platform/OrganizationAdoptionSection";
import type { OrganizationDossierSection, OrganizationOperations, PlatformOrganization } from "@/types/platform";

const issueLabels: Record<string, string> = {
  organization_blocked: "Organização com acesso bloqueado", without_responsible: "Sem responsável designado", inactive_responsible: "Responsável inativo",
  without_admin: "Sem administrador ativo", invitation_pending: "Envio do convite pendente", invitation_sent: "Convite aguardando aceite",
  invitation_failed: "Falha no envio do convite", invitation_expired: "Convite expirado", without_subscription: "Sem assinatura cadastrada",
  subscription_attention: "Assinatura requer acompanhamento", overdue_invoices: "Há faturas vencidas com saldo",
  quota_limit: "Cota atingida ou ultrapassada", quota_warning: "Consumo próximo de uma cota", storage_attention: "Armazenamento requer reconciliação",
  adoption_pending: "Adoção aguardando cálculo", adoption_unknown: "Histórico de uso desconhecido", without_use: "Cliente sem uso recente ou sem primeiro acesso",
  onboarding_pending: "Implantação com itens pendentes", tickets_awaiting_team: "Chamados aguardando a equipe", tickets_unassigned: "Chamados sem atendente",
};
const dates = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Sem registro observado";
const quotaLabels = { users: "Vagas de usuários", farms: "Fazendas ativas", storage: "Armazenamento" };
const quotaStatus = {normal: "Dentro da cota", warning: "Próximo ao limite", at_limit: "No limite", over_limit: "Acima do limite"};

export function OrganizationOperationsSection({ organization, onNavigate }: { organization: PlatformOrganization; onNavigate?: (section: OrganizationDossierSection) => void }) {
  const [data, setData] = useState<OrganizationOperations | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    platformService.organizationOperations(organization.id).then(value => { if (active) { setData(value); setError(""); } })
      .catch(reason => { if (active) { setData(null); setError(getOrganizationErrorMessage(reason, "Não foi possível carregar a visão operacional.")); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organization.id, organization.updated_at, attempt]);
  const refresh = () => { setLoading(true); setAttempt(value => value + 1); };
  const action = (section: OrganizationDossierSection, label: string) => {
    if (!organization.available_sections?.includes(section)) return null;
    return onNavigate ? <button type="button" className="btn btn-link btn-sm px-0" onClick={() => onNavigate(section)}>{label}</button> : <a className="btn btn-link btn-sm px-0" href={`/platform/organizations/${organization.id}?tab=${section}`}>{label}</a>;
  };
  if (loading) return <p role="status">Carregando operação e pendências…</p>;
  if (error) return <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={refresh}>Tentar novamente</button></div>;
  if (!data) return <p>Visão operacional indisponível.</p>;
  return <section className="d-flex flex-column gap-3 mb-4" aria-label="Operação e pendências da organização">
    <header className="d-flex flex-wrap justify-content-between align-items-start gap-2"><div><h2 className="h5 mb-1">Operação e pendências</h2><small className="text-muted">Consultado em {dates(data.calculated_at)}. Adoção usa a data de cálculo indicada abaixo.</small></div><button className="btn btn-sm btn-outline-secondary" onClick={refresh}>Atualizar indicadores</button></header>
    <div className="platform-card p-3"><h3 className="h6">Pontos de atenção</h3>{data.issues.length ? <ul className="list-unstyled mb-0">{data.issues.map(issue => <li key={issue.code} className="d-flex flex-wrap align-items-center gap-2"><span className={`badge ${issue.severity === "warning" ? "text-bg-warning" : "text-bg-light"}`}>{issue.severity === "warning" ? "Atenção" : "Informação"}</span><span>{issueLabels[issue.code] || "Pendência identificada"}</span>{action(issue.section, "Consultar")}</li>)}</ul> : <p className="mb-0 text-muted">Nenhuma pendência detectada nestes indicadores.</p>}</div>
    <div className="row g-3"><div className="col-md-6"><section className="platform-card p-3 h-100"><h3 className="h6">Acesso e implantação</h3><p className="mb-1">{data.has_active_admin ? "Há administrador ativo" : "Sem administrador ativo"}</p><p className="mb-1">Responsável: {data.responsible ? `${data.responsible.full_name || data.responsible.email} · ${data.responsible.is_active ? "ativo" : "inativo"}` : "não definido"}</p>{data.adoption && <p className="small mb-1">Implantação: {Object.values(data.adoption.checklist).filter(value => value === true).length}/3 etapas observadas</p>}{action("users", "Consultar usuários e convite")}</section></div>
    <div className="col-md-6"><section className="platform-card p-3 h-100"><h3 className="h6">Uso recente</h3>{data.adoption ? <><strong>{adoptionLabels[data.adoption.status]}</strong><p className="small mb-1 mt-1">Último login: {dates(data.adoption.last_customer_login_at)}<br/>Última operação: {dates(data.adoption.last_operation_at)}</p><p className="mb-1">{data.adoption.active_users_7d} usuários em 7 dias · {data.adoption.active_users_30d} em 30 dias</p><small className="text-muted">Cálculo: {dates(data.adoption.calculated_at)}{(!data.adoption.period_7d_complete || !data.adoption.period_30d_complete) && " · Período de observação parcial"}{!data.adoption.history_complete && " · Histórico anterior desconhecido"}</small></> : <p className="text-muted">Aguardando o primeiro cálculo. Ausência de histórico não comprova falta de uso.</p>}<div>{action("adoption", "Consultar adoção e checklist")}</div></section></div>
    <div className="col-md-6"><section className="platform-card p-3 h-100"><h3 className="h6">Cobrança</h3><p className="mb-1">{data.billing.overdue_count} faturas vencidas com saldo · {data.billing.unpaid_count} faturas com saldo em aberto</p>{data.billing.overdue_amounts.map(amount => <p className="mb-1" key={amount.currency}>Saldo vencido: {Number(amount.outstanding).toLocaleString("pt-BR", {style: "currency", currency: amount.currency})}</p>)}{action("invoices", "Consultar faturas")}<span className="mx-2"/>{action("subscription", "Consultar assinatura")}</section></div>
    {data.support && <div className="col-md-6"><section className="platform-card p-3 h-100"><h3 className="h6">Atendimento</h3><p className="mb-1">{data.support.active} chamados em aberto · {data.support.awaiting_team} aguardando a equipe</p><p className="mb-1">{data.support.waiting_customer} aguardando cliente · {data.support.unassigned} sem atendente</p><p className="mb-1">{data.support.urgent} urgentes · {data.support.without_first_response} sem primeira resposta humana</p>{action("tickets", "Acompanhar chamados nesta ficha")}</section></div>}
    <div className="col-12"><section className="platform-card p-3"><h3 className="h6">Consumo e limites</h3><div className="row g-3">{(Object.keys(quotaLabels) as (keyof typeof quotaLabels)[]).map(resource => {
      const metric = data.usage.resources[resource];
      const format = (value: number) => resource === "storage" ? `${(value / 1048576).toLocaleString("pt-BR", {maximumFractionDigits: 2})} MB` : value.toLocaleString("pt-BR");
      return <div className="col-sm-4" key={resource}><strong>{quotaLabels[resource]}</strong><div>{format(metric.used)} / {metric.capacity === null ? "ilimitado" : format(metric.capacity)}</div><small className={metric.status === "normal" ? "text-muted" : "text-danger"}>{quotaStatus[metric.status]}</small></div>;
    })}</div><p className="small text-muted mt-2 mb-0">Usuários incluem contas ativas e vagas reservadas por convites elegíveis. Equipe interna não consome vagas.</p>{action("consumption", "Consultar limites e armazenamento")}</section></div></div>
  </section>;
}
