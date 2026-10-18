"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { PaginatedResponse } from "@/types";
import { customerTickets, teamTickets, ticketStatuses, ticketCategories, ticketPriorities, type SupportTicket, type TicketCategory, type TicketPriority } from "@/services/ticketService";
import { platformService } from "@/services/platformApi";
import { supportError, supportService } from "@/services/supportService";

export function SupportTicketList({ platform = false, conversationId, organizationId, onSelectTicket }: { platform?: boolean; conversationId?: string; organizationId?: string; onSelectTicket?: (id: string) => void }) {
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
      .catch(reason => { if (active) { setData(null); setError(supportError(reason)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, filters, page, attempt, platform, organizationId]);
  const refresh = () => { setLoading(true); setAttempt(value => value + 1); };
  const submitFilters = (event: FormEvent) => { event.preventDefault(); setLoading(true); setPage(1); setFilters(Object.fromEntries(Object.entries(draftFilters).filter(([, value]) => value))); };
  const prepareSummary = async () => {
    if (!conversationId) return;
    setBusy(true); setError("");
    try { setSummary((await supportService.handoff(conversationId)).summary); setShare(true); creationKey.current = ""; }
    catch (reason) { setError(supportError(reason)); }
    finally { setBusy(false); }
  };
  const open = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    creationKey.current ||= crypto.randomUUID();
    try {
      const ticket = await api.open({ subject, body, category, priority, creation_key: creationKey.current, ...(share && conversationId ? { conversation_id: conversationId, shared_context: summary } : {}) });
      router.push(`/home/suporte/chamados/${ticket.id}`);
    } catch (reason) { setError(supportError(reason)); }
    finally { setBusy(false); }
  };
  const updateFilter = (key: string, value: string) => setDraftFilters(current => ({ ...current, [key]: value }));
  return <section className="d-flex flex-column gap-3" aria-label={platform ? "Fila de chamados" : "Atendimento humano"}>
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2"><div><h2 className="h4 mb-1">{platform ? "Fila de chamados" : "Atendimento humano"}</h2><p className="text-muted small mb-0">{platform ? "Acompanhe clientes, atribuições e respostas." : "Abra e acompanhe chamados. Administradores também podem consultar os chamados públicos da organização."}</p></div>{!platform && <button className="btn btn-success" onClick={() => setCreating(value => !value)}>{creating ? "Fechar formulário" : "Abrir chamado"}</button>}</div>
    {error && <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={refresh}>Atualizar consulta</button></div>}
    {creating && !platform && <form className="border rounded p-3 bg-body d-flex flex-column gap-3" onSubmit={open} onChange={() => { creationKey.current = ""; }}><h3 className="h5">Novo chamado</h3><label>Assunto<input className="form-control" value={subject} onChange={event => setSubject(event.target.value)} minLength={3} maxLength={200} required disabled={busy}/></label><div className="row g-3"><label className="col-sm-6">Categoria<select className="form-select" value={category} onChange={event => setCategory(event.target.value as TicketCategory)} disabled={busy}>{Object.entries(ticketCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="col-sm-6">Prioridade<select className="form-select" value={priority} onChange={event => setPriority(event.target.value as TicketPriority)} disabled={busy}>{Object.entries(ticketPriorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label>Descreva o problema<textarea className="form-control" rows={5} value={body} onChange={event => setBody(event.target.value)} minLength={3} maxLength={10000} required disabled={busy}/><small className="text-muted">Informe a tela, o que tentou e o resultado. Não envie senhas nem códigos de acesso.</small></label>
      {conversationId && <div className="border rounded p-3"><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => void prepareSummary()}>Preparar resumo desta conversa da IA</button><label className="d-flex gap-2 mt-2"><input type="checkbox" checked={share} onChange={event => setShare(event.target.checked)} disabled={busy}/>Vincular a conversa e compartilhar somente o resumo revisado abaixo</label>{share && <label className="d-block mt-2">Resumo a compartilhar<textarea className="form-control" rows={5} required maxLength={4000} value={summary} onChange={event => setSummary(event.target.value)} disabled={busy}/><small>A conversa original permanece privada. Confira o texto antes de abrir o chamado.</small></label>}</div>}
      <button className="btn btn-success align-self-start" disabled={busy}>Registrar chamado</button>
    </form>}
    <form className="row g-2 align-items-end" onSubmit={submitFilters}><label className="col-md">Buscar<input className="form-control" value={draftFilters.search || ""} onChange={event => updateFilter("search", event.target.value)} maxLength={200} placeholder={platform ? "Assunto, cliente ou solicitante" : "Assunto"}/></label><label className="col-sm-6 col-md-2">Estado<select className="form-select" value={draftFilters.status || ""} onChange={event => updateFilter("status", event.target.value)}><option value="">Todos</option>{Object.entries(ticketStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="col-sm-6 col-md-2">Prioridade<select className="form-select" value={draftFilters.priority || ""} onChange={event => updateFilter("priority", event.target.value)}><option value="">Todas</option>{Object.entries(ticketPriorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{platform && <label className="col-md-2">Atribuição<select className="form-select" value={draftFilters.unassigned || ""} onChange={event => updateFilter("unassigned", event.target.value)}><option value="">Todas</option><option value="true">Sem atendente</option><option value="false">Com atendente</option></select></label>}{platform && <label className="col-auto d-flex gap-2 align-items-center pb-2"><input type="checkbox" checked={draftFilters.mine === "true"} onChange={event => updateFilter("mine", event.target.checked ? "true" : "")}/>Somente meus chamados</label>}<div className="col-auto"><button className="btn btn-outline-secondary">Filtrar</button></div><div className="col-auto"><button type="button" className="btn btn-outline-secondary" onClick={refresh} disabled={loading}>Atualizar</button></div></form>
    {loading ? <p role="status">Carregando chamados…</p> : data?.results.length ? <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Chamado</th>{platform && <th>Cliente</th>}<th>Estado</th><th>Prioridade</th><th>Atendente</th><th>Atualização</th></tr></thead><tbody>{data.results.map(ticket => <tr key={ticket.id}><td><Link href={`${platform ? "/platform/tickets" : "/home/suporte/chamados"}/${ticket.id}`} onClick={event => { if (onSelectTicket && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onSelectTicket(ticket.id); } }}>{ticket.subject}</Link><div className="small text-muted">{ticketCategories[ticket.category]} · {ticket.requester_name}</div></td>{platform && <td>{ticket.organization_name}</td>}<td>{ticketStatuses[ticket.status]}</td><td>{ticketPriorities[ticket.priority]}</td><td>{ticket.assignee_name || "Sem atribuição"}</td><td className="small">{new Date(ticket.updated_at).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div> : !error && <p className="text-muted">Nenhum chamado encontrado.</p>}
    {data && <div className="d-flex align-items-center gap-2"><button className="btn btn-sm btn-outline-secondary" disabled={loading || !data.previous} onClick={() => { setLoading(true); setPage(value => value - 1); }}>Anterior</button><span className="small">Página {page} de {data.total_pages || 1} · {data.count} chamados</span><button className="btn btn-sm btn-outline-secondary" disabled={loading || !data.next} onClick={() => { setLoading(true); setPage(value => value + 1); }}>Próxima</button></div>}
  </section>;
}
