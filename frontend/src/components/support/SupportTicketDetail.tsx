"use client";
import { getTicketLabels } from "@/services/ticketPresentation";
import { useInterfaceLocale } from "@/lib/interfaceLocale";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { PaginatedResponse } from "@/types";
import { customerTickets, teamTickets, supportAssignees, type SupportTicket, type TicketMessage, type TicketEvent, type TicketAttachment, type TicketStatus, type TicketCategory, type TicketPriority, type TicketMetadata } from "@/services/ticketService";
import { supportError } from "@/services/supportService";

const date = (value: string | null, language = "pt-BR") => value ? new Date(value).toLocaleString(language) : "Ainda não registrada";
const states: Record<TicketStatus, TicketStatus[]> = { open: ["in_progress", "waiting_customer", "resolved"], in_progress: ["waiting_customer", "resolved"], waiting_customer: ["in_progress", "resolved"], resolved: ["closed", "open"], closed: ["open"] };

function MetadataEditor({ ticket, onSaved }: { ticket: SupportTicket; onSaved: () => void }) {
  const { language, t } = useInterfaceLocale();
  const { ticketCategories, ticketPriorities } = getTicketLabels(t);
  const [assignee, setAssignee] = useState(ticket.assignee_id || "");
  const [priority, setPriority] = useState(ticket.priority);
  const [category, setCategory] = useState(ticket.category);
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<{id: string; full_name: string}[]>([]);
  const [peopleError, setPeopleError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      supportAssignees(search).then(data => { if (active) { setPeople(data.results); setPeopleError(""); } })
        .catch(reason => { if (active) setPeopleError(supportError(reason, language)); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, language]);
  const altered = assignee !== (ticket.assignee_id || "") || priority !== ticket.priority || category !== ticket.category;
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    const payload: TicketMetadata = { expected_version: ticket.version };
    if (assignee !== (ticket.assignee_id || "")) payload.assignee_id = assignee || null;
    if (priority !== ticket.priority) payload.priority = priority;
    if (category !== ticket.category) payload.category = category;
    try { await teamTickets.metadata(ticket.id, payload); onSaved(); }
    catch (reason) { setError(supportError(reason, language)); }
    finally { setBusy(false); }
  };
  return <form className="border rounded p-3 bg-body d-flex flex-column gap-2" onSubmit={save}><h2 className="h6">{t("workspace.supportManagement")}</h2>{error && <div className="alert alert-danger" role="alert">{error}</div>}{peopleError && <p className="text-danger" role="alert">{peopleError}</p>}<label>{t("workspace.searchSupportAgents")}<input className="form-control" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} disabled={busy}/></label><label>{t("workspace.supportAgent")}<select className="form-select" value={assignee} onChange={event => setAssignee(event.target.value)} disabled={busy}><option value="">{t("workspace.unassignedLabel")}</option>{ticket.assignee_id && !people.some(person => person.id === ticket.assignee_id) && <option value={ticket.assignee_id}>{ticket.assignee_name || t("workspace.currentAgent")}</option>}{people.map(person => <option value={person.id} key={person.id}>{person.full_name || t("workspace.supportAgent")}</option>)}</select></label><label>{t("lotReport.category")}<select className="form-select" value={category} onChange={event => setCategory(event.target.value as TicketCategory)} disabled={busy}>{Object.entries(ticketCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>{t("notifications.priority")}<select className="form-select" value={priority} onChange={event => setPriority(event.target.value as TicketPriority)} disabled={busy}>{Object.entries(ticketPriorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="btn btn-outline-success mt-2" disabled={!altered || busy}>{t("workspace.saveSupportDetails")}</button></form>;
}

function MessageFiles({ ticket, message, platform, onChanged }: { ticket: SupportTicket; message: TicketMessage; platform: boolean; onChanged: () => void }) {
  const { language, t } = useInterfaceLocale();
  const api = platform ? teamTickets : customerTickets;
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef("");
  const input = useRef<HTMLInputElement>(null);
  const download = async (attachment: TicketAttachment) => {
    setBusy(true); setError("");
    try {
      const data = await api.download(ticket.id, attachment.id);
      const url = URL.createObjectURL(data); const link = document.createElement("a"); link.href = url; link.download = attachment.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(supportError(reason, language)); }
    finally { setBusy(false); }
  };
  const upload = async () => {
    if (!file) return;
    setBusy(true); setError(""); key.current ||= crypto.randomUUID();
    try {
      await api.upload(ticket.id, message.id, file, ticket.version, key.current);
      setFile(null); key.current = ""; if (input.current) input.current.value = ""; onChanged();
    } catch (reason) { setError(supportError(reason, language)); }
    finally { setBusy(false); }
  };
  return <div className="mt-2">{message.attachments.length > 0 && <ul className="list-unstyled mb-2">{message.attachments.map(attachment => <li key={attachment.id}><button className="btn btn-link btn-sm text-break p-0" disabled={busy} onClick={() => void download(attachment)}>{attachment.filename} ({(attachment.size / 1024).toLocaleString(language, {maximumFractionDigits: 1})} KB)</button></li>)}</ul>}{message.can_attach && message.attachments.length < 5 && <div className="d-flex flex-wrap gap-2 align-items-end"><label className="small flex-grow-1">{t("workspace.attachToThisMessage")}<input ref={input} type="file" className="form-control form-control-sm" accept=".pdf,.txt,.csv,.png,.jpg,.jpeg,.webp,.xlsx,.docx,.zip" disabled={busy} onChange={event => { setFile(event.target.files?.[0] || null); key.current = ""; setError(""); }}/></label><button className="btn btn-sm btn-outline-secondary" disabled={busy || !file} onClick={() => void upload()}>{t("workspace.uploadAttachment")}</button><small className="text-muted w-100">{t("workspace.upTo10MbPerFileAndFiveFilesPer")}</small></div>}{error && <p className="text-danger small mt-2" role="alert">{error}</p>}</div>;
}

export function SupportTicketDetail({ id, platform = false, onBack }: { id: string; platform?: boolean; onBack?: () => void }) {
  const { language, t } = useInterfaceLocale();
  const { ticketStatuses, ticketCategories, ticketPriorities } = getTicketLabels(t);
  const api = platform ? teamTickets : customerTickets;
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<PaginatedResponse<TicketMessage> | null>(null);
  const [history, setHistory] = useState<PaginatedResponse<TicketEvent> | null>(null);
  const [messagePage, setMessagePage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [notice, setNotice] = useState("");
  const requestKey = useRef("");
  useEffect(() => {
    let active = true;
    Promise.all([api.detail(id), api.messages(id, messagePage), api.history(id, historyPage)])
      .then(([current, rows, events]) => { if (active) { setTicket(current); setMessages(rows); setHistory(events); setError(""); } })
      .catch(reason => { if (active) { setTicket(null); setMessages(null); setHistory(null); setError(supportError(reason, language)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, id, messagePage, historyPage, attempt, language]);
  const refresh = () => { setLoading(true); setAttempt(value => value + 1); };
  const reply = async (event: FormEvent) => {
    event.preventDefault(); if (!ticket) return;
    setBusy(true); setError(""); setNotice(""); requestKey.current ||= crypto.randomUUID();
    try {
      await api.reply(id, { body, request_key: requestKey.current, expected_version: ticket.version, ...(platform ? { is_internal: internal } : {}) });
      setBody(""); requestKey.current = ""; setMessagePage(1); setNotice(internal ? "Nota interna registrada." : "Mensagem enviada."); refresh();
    } catch (reason) { setError(supportError(reason, language)); }
    finally { setBusy(false); }
  };
  const transition = async (status: TicketStatus) => {
    if (!ticket) return;
    setBusy(true); setError(""); setNotice("");
    try { await api.transition(id, status, ticket.version); setNotice("Estado atualizado."); refresh(); }
    catch (reason) { setError(supportError(reason, language)); }
    finally { setBusy(false); }
  };
  const back = platform ? "/platform/tickets" : "/home/suporte/chamados";
  return <main className="container-fluid py-3">{onBack ? <button className="btn btn-outline-secondary btn-sm mb-3" onClick={onBack}>{t("workspace.backToThisOrganizationSTickets")}</button> : <Link href={back} className="btn btn-outline-secondary btn-sm mb-3">{t("workspace.backToTickets")}</Link>}{error && <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={refresh}>{t("workspace.refreshTicket")}</button></div>}{notice && <p className="alert alert-success" role="status">{notice}</p>}{loading && <p role="status">{t("workspace.loadingTicket")}</p>}{ticket && <>
    <header className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3"><div><h1 className="h3 text-break">{ticket.subject}</h1><p className="mb-1">{ticketStatuses[ticket.status]} · {ticketCategories[ticket.category]} {t("workspace.priority")} {ticketPriorities[ticket.priority].toLowerCase()}</p><p className="small text-muted mb-0">{ticket.organization_name} {t("workspace.requester")} {ticket.requester_name} {t("workspace.agent")} {ticket.assignee_name || t("workspace.awaitingAssignment")}</p></div><button className="btn btn-outline-secondary" onClick={refresh} disabled={loading || busy}>{t("inventory.alerts.refresh")}</button></header>
    <div className="row g-3"><div className="col-lg-8 d-flex flex-column gap-3">
      {ticket.shared_context && <section className="border rounded bg-body p-3"><h2 className="h6">{t("workspace.summarySharedByTheCustomer")}</h2><p className="mb-0" style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>{ticket.shared_context}</p></section>}
      {!["resolved", "closed"].includes(ticket.status) ? <form onSubmit={reply} className="border rounded bg-body p-3"><h2 className="h5">{internal ? t("workspace.addInternalNote") : t("workspace.replyToTicket")}</h2>{platform && <label className="d-flex align-items-center gap-2 mb-2"><input type="checkbox" checked={internal} disabled={busy} onChange={event => { setInternal(event.target.checked); requestKey.current = ""; }}/>{t("workspace.internalNoteVisibleOnlyToTheTeam")}</label>}<label className="d-block">{internal ? t("workspace.note") : t("workspace.message")}<textarea className="form-control" rows={4} maxLength={10000} required value={body} disabled={busy} onChange={event => { setBody(event.target.value); requestKey.current = ""; }}/></label><button className={`btn mt-2 ${internal ? "btn-outline-dark" : "btn-success"}`} disabled={busy || loading || !body.trim()}>{internal ? t("workspace.saveInternalNote") : t("workspace.sendPublicMessage")}</button></form> : <p className="alert alert-info mb-0">{t("workspace.reopenTheTicketToSendNewMessagesOrAttachments")}</p>}
      <section aria-label={t("workspace.ticketMessages")}><h2 className="h5">{t("workspace.latestMessages")}</h2>{messages?.results.map(message => <article key={message.id} className={`border rounded bg-body p-3 mb-3 ${message.is_internal ? "border-warning border-2" : ""}`}><div className="d-flex flex-wrap justify-content-between gap-2"><strong>{message.author_name || (message.from_team ? t("workspace.supportTeam") : t("workspace.customer"))}{message.is_internal && <span className="badge text-bg-warning ms-2">{t("workspace.internalNote")}</span>}</strong><small className="text-muted">{date(message.created_at, language)}</small></div><p className="mt-2 mb-1" style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>{message.body}</p><MessageFiles ticket={ticket} message={message} platform={platform} onChanged={refresh}/></article>)}{messages && <div className="d-flex align-items-center gap-2"><button className="btn btn-sm btn-outline-secondary" disabled={loading || !messages.previous} onClick={() => { setMessagePage(value => value - 1); setLoading(true); }}>{t("plantations.mostRecent")}</button><span className="small">{t("workspace.page")} {messagePage} {t("workspace.of")} {messages.total_pages || 1}</span><button className="btn btn-sm btn-outline-secondary" disabled={loading || !messages.next} onClick={() => { setMessagePage(value => value + 1); setLoading(true); }}>{t("workspace.older")}</button></div>}</section>
    </div><aside className="col-lg-4 d-flex flex-column gap-3">
      <section className="border rounded bg-body p-3"><h2 className="h6">{t("workspace.ticketStatus")}</h2><div className="d-flex flex-wrap gap-2">{states[ticket.status].filter(status => platform || ["open", "resolved", "closed"].includes(status)).map(status => <button key={status} className="btn btn-sm btn-outline-secondary" disabled={busy || loading} onClick={() => void transition(status)}>{status === "open" ? t("workspace.reopen") : ticketStatuses[status]}</button>)}</div></section>
      {platform && <MetadataEditor key={ticket.version} ticket={ticket} onSaved={refresh}/>}
      <section className="border rounded bg-body p-3"><h2 className="h6">{t("swine.insights.heading")}</h2><dl className="small mb-0"><dt>{t("workspace.opened")}</dt><dd>{date(ticket.created_at, language)}</dd><dt>{t("workspace.firstHumanResponse")}</dt><dd>{date(ticket.first_response_at, language)}</dd><dt>{t("workspace.firstResolution")}</dt><dd>{date(ticket.first_resolved_at, language)}</dd><dt>{t("workspace.currentResolution")}</dt><dd>{date(ticket.resolved_at, language)}</dd><dt>{t("workspace.closedLabelLabel")}</dt><dd>{date(ticket.closed_at, language)}</dd></dl></section>
      <section className="border rounded bg-body p-3"><h2 className="h6">{t("swineReproduction.history")}</h2>{history?.results.map(item => <article className="border-bottom py-2 small" key={item.id}><div>{item.description}{item.is_internal && <span className="badge text-bg-warning ms-1">{t("workspace.internal")}</span>}</div>{typeof item.changes.from === "string" && typeof item.changes.to === "string" && item.kind === "status_changed" && <div>{ticketStatuses[item.changes.from as TicketStatus]} → {ticketStatuses[item.changes.to as TicketStatus]}</div>}<small className="text-muted">{item.actor_name} · {date(item.created_at, language)}</small></article>)}{history && <div className="d-flex gap-2 mt-2"><button className="btn btn-sm btn-outline-secondary" disabled={loading || !history.previous} onClick={() => { setHistoryPage(value => value - 1); setLoading(true); }}>{t("notifications.previous")}</button><span className="small">{historyPage}/{history.total_pages || 1}</span><button className="btn btn-sm btn-outline-secondary" disabled={loading || !history.next} onClick={() => { setHistoryPage(value => value + 1); setLoading(true); }}>{t("notifications.next")}</button></div>}</section>
    </aside></div>
  </>}</main>;
}
