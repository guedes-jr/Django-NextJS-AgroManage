"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import type { PaginatedResponse } from "@/types";
import { SupportTicketList } from "@/components/support/SupportTicketList";
import { SupportTicketDetail } from "@/components/support/SupportTicketDetail";
import { OrganizationRecoverySection } from "@/components/platform/OrganizationRecoverySection";
import { OrganizationExportSection } from "@/components/platform/OrganizationExportSection";
import { OrganizationOperationsSection } from "@/components/platform/OrganizationOperationsSection";
import { OrganizationAdoptionSection } from "@/components/platform/OrganizationAdoptionSection";
import { OrganizationQuotaSection } from "@/components/platform/OrganizationQuotaSection";
import { platformService } from "@/services/platformApi";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import type { OrganizationDossierSection, PlatformOrganization } from "@/types/platform";

const date = (value: string | null | undefined, time = false) => {
  if (!value) return "Não informado";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return time ? parsed.toLocaleString("pt-BR") : parsed.toLocaleDateString("pt-BR");
};
const money = (value: string, currency = "BRL") => Number(value).toLocaleString("pt-BR", { style: "currency", currency });

function Failure({ message, retry }: { message: string; retry: () => void }) {
  return <div className="alert alert-danger" role="alert">{message}<button className="btn btn-link" onClick={retry}>Tentar novamente</button></div>;
}

function useSection<T>(id: string, load: (id: string) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    load(id).then(result => { if (active) { setData(result); setError(""); } })
      .catch(reason => { if (active) setError(getOrganizationErrorMessage(reason, "Não foi possível carregar esta seção.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, load, attempt]);
  const retry = () => { setLoading(true); setAttempt(value => value + 1); };
  return { data, loading, error, retry };
}

function RecordList<T extends { id: string }>({ id, label, load, columns, render }: {
  id: string;
  label: string;
  load: (id: string, page: number, search: string) => Promise<PaginatedResponse<T>>;
  columns: string[];
  render: (row: T) => ReactNode;
}) {
  const [data, setData] = useState<PaginatedResponse<T> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    load(id, page, query).then(result => { if (active) { setData(result); setError(""); } })
      .catch(reason => { if (active) { setData(null); setError(getOrganizationErrorMessage(reason, "Não foi possível carregar os registros.")); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, load, page, query, attempt]);
  const retry = () => { setLoading(true); setAttempt(value => value + 1); };
  const submit = (event: FormEvent) => { event.preventDefault(); setLoading(true); setPage(1); setQuery(search.trim()); setAttempt(value => value + 1); };
  return <div className="platform-card overflow-hidden">
    <div className="p-3 border-bottom"><h2 className="h5">{label}</h2><form className="d-flex gap-2" onSubmit={submit}><input className="form-control" aria-label={`Buscar em ${label}`} placeholder="Buscar nesta seção" value={search} onChange={event => setSearch(event.target.value)}/><button className="btn btn-outline-secondary">Buscar</button><button type="button" className="btn btn-outline-secondary" onClick={retry} disabled={loading}>Atualizar</button></form></div>
    {loading ? <p className="p-4 mb-0" role="status">Carregando {label.toLowerCase()}…</p> : error ? <div className="p-3"><Failure message={error} retry={retry}/></div> : !data?.results.length ? <p className="p-4 mb-0 text-muted">Nenhum registro encontrado nesta organização para esta busca.</p> : <div className="table-responsive"><table className="table platform-table mb-0"><caption className="visually-hidden">{label} da organização</caption><thead><tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{data.results.map(row => <tr key={row.id}>{render(row)}</tr>)}</tbody></table></div>}
    {data && !loading && <div className="d-flex flex-wrap align-items-center gap-2 border-top p-3"><button className="btn btn-sm btn-outline-secondary" disabled={!data.previous} onClick={() => { setLoading(true); setPage(value => value - 1); }}>Anterior</button><span className="small">Página {page} de {data.total_pages || 1} · {data.count} registros</span><button className="btn btn-sm btn-outline-secondary" disabled={!data.next} onClick={() => { setLoading(true); setPage(value => value + 1); }}>Próxima</button></div>}
  </div>;
}

function Registration({ id }: { id: string }) {
  const { data, loading, error, retry } = useSection(id, platformService.organizationRegistration);
  if (loading) return <p role="status">Carregando cadastro…</p>;
  if (error) return <Failure message={error} retry={retry}/>;
  if (!data) return <p>Cadastro indisponível.</p>;
  const fields = [["Nome", data.name], ["Identificador", data.slug], ["CPF/CNPJ", data.document], ["E-mail", data.email], ["Telefone", data.phone], ["Endereço principal", data.address], ["Cadastro", date(data.created_at, true)], ["Atualização", date(data.updated_at, true)]];
  return <div className="d-flex flex-column gap-4">
    <section className="platform-card p-4"><h2 className="h5 mb-3">Dados cadastrais</h2><dl className="row mb-0">{fields.map(([label, value]) => <div className="col-md-6 mb-3" key={label}><dt className="small text-muted">{label}</dt><dd className="mb-0 text-break">{value || "Não informado"}</dd></div>)}</dl></section>
    <section className="platform-card p-4"><h2 className="h5">Endereços</h2>{data.addresses.length ? <div className="row g-3 mt-1">{data.addresses.map(address => <article className="col-md-6" key={address.id}><strong>{address.label}{address.is_main ? " · Principal" : ""}</strong><div>{address.street}{address.number && `, ${address.number}`}{address.complement && ` · ${address.complement}`}</div><div>{address.neighborhood && `${address.neighborhood} · `}{address.city}/{address.state}</div><small className="text-muted">CEP {address.postal_code || "não informado"}</small></article>)}</div> : <p className="text-muted mb-0">Nenhum endereço adicional cadastrado.</p>}</section>
    <section className="platform-card p-4"><h2 className="h5">Contatos</h2>{data.contacts.length ? <div className="row g-3 mt-1">{data.contacts.map(contact => <article className="col-md-6" key={contact.id}><strong>{contact.name}{contact.is_main ? " · Principal" : ""}</strong><div className="text-break">{contact.contact_type_display}: {contact.value}</div></article>)}</div> : <p className="text-muted mb-0">Nenhum contato adicional cadastrado.</p>}</section>
  </div>;
}

function Subscription({ id }: { id: string }) {
  const { data, loading, error, retry } = useSection(id, platformService.organizationSubscription);
  if (loading) return <p role="status">Carregando assinatura…</p>;
  if (error) return <Failure message={error} retry={retry}/>;
  if (!data) return <div className="platform-card p-4 text-muted">Esta organização não possui assinatura cadastrada.</div>;
  const fields = [["Plano", data.plan_name], ["Estado comercial", data.status_display], ["Ciclo de cobrança", data.billing_cycle_display], ["Início", date(data.started_at)], ["Fim do período atual", date(data.current_period_ends_at)], ["Fim do teste", date(data.trial_ends_at)], ["Cancelamento agendado", data.cancel_at_period_end ? "Ao fim do período atual" : "Não"], ["Cancelada em", date(data.cancelled_at)]];
  return <section className="platform-card p-4"><h2 className="h5 mb-3">Assinatura</h2><dl className="row">{fields.map(([label, value]) => <div className="col-md-6 mb-3" key={label}><dt className="small text-muted">{label}</dt><dd className="mb-0">{value}</dd></div>)}</dl>
    <h3 className="h6">Desconto</h3>{data.discount_type ? <><p className="mb-1">{data.discount_type === "percentage" ? `${Number(data.discount_value)}%` : money(data.discount_value)} · {data.has_active_discount ? "Em vigor" : "Fora de vigência"}</p><p className="small text-muted">De {data.discount_starts_at ? date(data.discount_starts_at) : "sem data inicial"} até {data.discount_ends_at ? date(data.discount_ends_at) : "sem data final"}</p></> : <p className="text-muted">Nenhum desconto cadastrado.</p>}
    {data.notes && <><h3 className="h6">Observações</h3><p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>{data.notes}</p></>}
  </section>;
}

function OrganizationTickets({ id }: { id: string }) {
  const [ticketId, setTicketId] = useState<string | null>(null);
  return ticketId ? <SupportTicketDetail key={ticketId} id={ticketId} platform onBack={() => setTicketId(null)}/> : <SupportTicketList platform organizationId={id} onSelectTicket={setTicketId}/>;
}

export function OrganizationDossierSection({ organization, section, onNavigate }: { organization: PlatformOrganization; section: Exclude<OrganizationDossierSection, "summary">; onNavigate?: (section: OrganizationDossierSection) => void }) {
  const id = organization.id;
  switch (section) {
    case "recovery": return <OrganizationRecoverySection id={id} name={organization.name}/>;
    case "exports": return <OrganizationExportSection id={id}/>;
    case "tickets": return <OrganizationTickets id={id}/>;
    case "operation": return <OrganizationOperationsSection organization={organization} onNavigate={onNavigate}/>;
    case "adoption": return <OrganizationAdoptionSection id={id}/>;
    case "consumption": return <OrganizationQuotaSection organization={organization}/>;
    case "registration": return <Registration id={id}/>;
    case "subscription": return <Subscription id={id}/>;
    case "users": return <RecordList id={id} label="Usuários" load={platformService.organizationUsers} columns={["Usuário", "Cargo", "Acesso", "Último login", "Cadastro"]} render={row => <><td><strong>{row.full_name || row.email}</strong><div className="small text-muted">{row.email}</div>{row.phone && <div className="small text-muted">{row.phone}</div>}{row.id === organization.responsible?.id && <span className="badge text-bg-light">Responsável</span>}</td><td>{row.role_display}</td><td>{row.is_active ? "Ativo" : "Inativo"}{row.force_password_change && <div className="small text-muted">Troca de senha pendente</div>}</td><td>{row.last_login ? date(row.last_login, true) : "Sem registro"}</td><td>{date(row.created_at)}</td></>}/>;
    case "invoices": return <RecordList id={id} label="Faturas" load={platformService.organizationInvoices} columns={["Fatura", "Plano", "Estado", "Vencimento", "Total", "Pago", "Saldo"]} render={row => <><td>{row.number}</td><td>{row.plan_name || "Não informado"}</td><td>{row.effective_status === "overdue" ? "Vencida" : row.status_display}</td><td>{date(row.due_date)}</td><td>{money(row.total, row.currency)}</td><td>{money(row.amount_paid, row.currency)}</td><td>{money(row.amount_due, row.currency)}</td></>}/>;
    case "payments": return <RecordList id={id} label="Pagamentos" load={platformService.organizationPayments} columns={["Fatura", "Valor", "Estado", "Forma", "Pagamento", "Observações"]} render={row => <><td>{row.invoice_number}</td><td>{money(row.amount, row.currency)}</td><td>{row.status_display}</td><td>{row.payment_method || "Não informada"}</td><td>{date(row.paid_at, true)}</td><td style={{ maxWidth: 360, whiteSpace: "pre-wrap" }}>{row.notes || "—"}</td></>}/>;
    case "history": return <RecordList id={id} label="Histórico administrativo" load={platformService.organizationHistory} columns={["Data", "Responsável pela ação", "Registro", "Ação"]} render={row => <><td>{date(row.created_at, true)}</td><td>{row.actor_name || "Sistema"}</td><td style={{ minWidth: 240, whiteSpace: "pre-wrap" }}>{row.description || "Sem descrição"}{typeof row.extra_data.reason === "string" && row.extra_data.reason && <div className="small text-muted">Motivo: {row.extra_data.reason}</div>}{typeof row.extra_data.new_responsible_name === "string" && <div className="small text-muted">Novo responsável: {row.extra_data.new_responsible_name}</div>}</td><td>{row.action}</td></>}/>;
    case "support-access": return <RecordList id={id} label="Acessos assistidos" load={platformService.organizationSupportAccesses} columns={["Atendente", "Início", "Validade", "Último uso", "Estado"]} render={row => <><td>{row.operator_name}</td><td>{date(row.created_at, true)}</td><td>{date(row.expires_at, true)}</td><td>{row.last_used_at ? date(row.last_used_at, true) : "Não utilizado"}</td><td>{row.revoked_at ? `Revogado em ${date(row.revoked_at, true)}` : row.is_valid ? "Ativo" : "Expirado"}</td></>}/>;
  }
}
