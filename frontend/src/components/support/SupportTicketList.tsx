"use client";
import { getTicketLabels } from "@/services/ticketPresentation";
import { useInterfaceLocale } from "@/lib/interfaceLocale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { PaginatedResponse } from "@/types";
import { customerTickets, teamTickets, type SupportTicket, type TicketCategory, type TicketPriority } from "@/services/ticketService";
import { platformService } from "@/services/platformApi";
import { supportError, supportService } from "@/services/supportService";

export function SupportTicketList({ platform = false, conversationId, organizationId, onSelectTicket }: { platform?: boolean; conversationId?: string; organizationId?: string; onSelectTicket?: (id: string) => void }) {
  const { language, t } = useInterfaceLocale();
  const { ticketStatuses, ticketCategories, ticketPriorities } = getTicketLabels(t);
  const api = platform ? teamTickets : customerTickets;
  const router = useRouter();
  const [data, setData] = useState<PaginatedResponse<SupportTicket> | null>(null);
  const [draftFilters, setDraftFilters] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<TicketCategory>("question");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [share, setShare] = useState(false);
  const [summary, setSummary] = useState("");
  const creationKey = useRef("");
  useEffect(() => {
    let active = true;
    const request = platform && organizationId ? platformService.organizationTickets(organizationId, { ...filters, page }) : api.list({ ...filters, page });
    request.then(result => { if (active) { setData(result); setError(""); } })
      .catch(reason => { if (active) { setData(null); setError(supportError(reason, language)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, filters, page, attempt, platform, organizationId, language]);
  const refresh = () => { setLoading(true); setAttempt(value => value + 1); };
  const submitFilters = (event: FormEvent) => { event.preventDefault(); setLoading(true); setPage(1); setFilters(Object.fromEntries(Object.entries(draftFilters).filter(([, value]) => value))); };
  const prepareSummary = async () => {
    if (!conversationId) return;
    setBusy(true); setError("");
    try { setSummary((await supportService.handoff(conversationId)).summary); setShare(true); creationKey.current = ""; }
    catch (reason) { setError(supportError(reason, language)); }
    finally { setBusy(false); }
  };
  const open = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    creationKey.current ||= crypto.randomUUID();
    try {
      const ticket = await api.open({ subject, body, category, priority, creation_key: creationKey.current, ...(share && conversationId ? { conversation_id: conversationId, shared_context: summary } : {}) });
      router.push(`/home/suporte/chamados/${ticket.id}`);
    } catch (reason) { setError(supportError(reason, language)); }
    finally { setBusy(false); }
  };
  const updateFilter = (key: string, value: string) => setDraftFilters(current => ({ ...current, [key]: value }));
  return <section className="d-flex flex-column gap-3" aria-label={platform ? "Fila de chamados" : "Atendimento humano"}>
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2"><div><h2 className="h4 mb-1">{platform ? t("workspace.ticketQueue") : t("workspace.humanSupport")}</h2><p className="text-muted small mb-0">{platform ? t("workspace.trackCustomersAssignmentsAndReplies") : t("workspace.openAndTrackTicketsAdministratorsCanAlsoViewTheOrganization")}</p></div>{!platform && <button className="btn btn-success" onClick={() => setCreating(value => !value)}>{creating ? t("workspace.closeForm") : t("workspace.openTicket")}</button>}</div>
    {error && <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={refresh}>{t("workspace.refreshResults")}</button></div>}
    {creating && !platform && <form className="border rounded p-3 bg-body d-flex flex-column gap-3" onSubmit={open} onChange={() => { creationKey.current = ""; }}><h3 className="h5">{t("workspace.newTicket")}</h3><label>{t("workspace.subject")}<input className="form-control" value={subject} onChange={event => setSubject(event.target.value)} minLength={3} maxLength={200} required disabled={busy}/></label><div className="row g-3"><label className="col-sm-6">{t("lotReport.category")}<select className="form-select" value={category} onChange={event => setCategory(event.target.value as TicketCategory)} disabled={busy}>{Object.entries(ticketCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="col-sm-6">{t("notifications.priority")}<select className="form-select" value={priority} onChange={event => setPriority(event.target.value as TicketPriority)} disabled={busy}>{Object.entries(ticketPriorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label>{t("workspace.describeTheProblem")}<textarea className="form-control" rows={5} value={body} onChange={event => setBody(event.target.value)} minLength={3} maxLength={10000} required disabled={busy}/><small className="text-muted">{t("workspace.describeTheScreenWhatYouTriedAndTheResultDo")}</small></label>
      {conversationId && <div className="border rounded p-3"><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => void prepareSummary()}>{t("workspace.prepareASummaryOfThisAiConversation")}</button><label className="d-flex gap-2 mt-2"><input type="checkbox" checked={share} onChange={event => setShare(event.target.checked)} disabled={busy}/>{t("workspace.linkTheConversationAndShareOnlyTheReviewedSummaryBelow")}</label>{share && <label className="d-block mt-2">{t("workspace.summaryToShare")}<textarea className="form-control" rows={5} required maxLength={4000} value={summary} onChange={event => setSummary(event.target.value)} disabled={busy}/><small>{t("workspace.theOriginalConversationRemainsPrivateReviewTheTextBeforeOpening")}</small></label>}</div>}
      <button className="btn btn-success align-self-start" disabled={busy}>{t("workspace.createTicket")}</button>
    </form>}
    <form className="row g-2 align-items-end" onSubmit={submitFilters}><label className="col-md">{t("swine.search")}<input className="form-control" value={draftFilters.search || ""} onChange={event => updateFilter("search", event.target.value)} maxLength={200} placeholder={platform ? "Assunto, cliente ou solicitante" : "Assunto"}/></label><label className="col-sm-6 col-md-2">{t("workspace.status")}<select className="form-select" value={draftFilters.status || ""} onChange={event => updateFilter("status", event.target.value)}><option value="">{t("crops.allFields")}</option>{Object.entries(ticketStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="col-sm-6 col-md-2">{t("notifications.priority")}<select className="form-select" value={draftFilters.priority || ""} onChange={event => updateFilter("priority", event.target.value)}><option value="">{t("notifications.all")}</option>{Object.entries(ticketPriorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{platform && <label className="col-md-2">{t("workspace.assignment")}<select className="form-select" value={draftFilters.unassigned || ""} onChange={event => updateFilter("unassigned", event.target.value)}><option value="">{t("notifications.all")}</option><option value="true">{t("workspace.unassigned")}</option><option value="false">{t("workspace.assigned")}</option></select></label>}{platform && <label className="col-auto d-flex gap-2 align-items-center pb-2"><input type="checkbox" checked={draftFilters.mine === "true"} onChange={event => updateFilter("mine", event.target.checked ? "true" : "")}/>{t("workspace.onlyMyTickets")}</label>}<div className="col-auto"><button className="btn btn-outline-secondary">{t("plantations.filter")}</button></div><div className="col-auto"><button type="button" className="btn btn-outline-secondary" onClick={refresh} disabled={loading}>{t("inventory.alerts.refresh")}</button></div></form>
    {loading ? <p role="status">{t("workspace.loadingTickets")}</p> : data?.results.length ? <div className="table-responsive"><table className="table align-middle"><thead><tr><th>{t("workspace.ticket")}</th>{platform && <th>{t("workspace.customer")}</th>}<th>{t("workspace.status")}</th><th>{t("notifications.priority")}</th><th>{t("workspace.supportAgent")}</th><th>{t("workspace.update")}</th></tr></thead><tbody>{data.results.map(ticket => <tr key={ticket.id}><td><Link href={`${platform ? "/platform/tickets" : "/home/suporte/chamados"}/${ticket.id}`} onClick={event => { if (onSelectTicket && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onSelectTicket(ticket.id); } }}>{ticket.subject}</Link><div className="small text-muted">{ticketCategories[ticket.category]} · {ticket.requester_name}</div></td>{platform && <td>{ticket.organization_name}</td>}<td>{ticketStatuses[ticket.status]}</td><td>{ticketPriorities[ticket.priority]}</td><td>{ticket.assignee_name || t("workspace.unassignedLabel")}</td><td className="small">{new Date(ticket.updated_at).toLocaleString(language)}</td></tr>)}</tbody></table></div> : !error && <p className="text-muted">{t("workspace.noTicketsFound")}</p>}
    {data && <div className="d-flex align-items-center gap-2"><button className="btn btn-sm btn-outline-secondary" disabled={loading || !data.previous} onClick={() => { setLoading(true); setPage(value => value - 1); }}>{t("notifications.previous")}</button><span className="small">{t("workspace.page")} {page} {t("workspace.of")} {data.total_pages || 1} · {data.count} {t("workspace.tickets")}</span><button className="btn btn-sm btn-outline-secondary" disabled={loading || !data.next} onClick={() => { setLoading(true); setPage(value => value + 1); }}>{t("notifications.next")}</button></div>}
  </section>;
}
