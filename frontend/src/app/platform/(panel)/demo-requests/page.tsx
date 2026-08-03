"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Clock3, Mail, Phone, Search, X } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { PLATFORM_STAFF, platformService } from "@/services/platformApi";
import type { PlatformDemoRequest, PlatformDemoRequestPage, PlatformStaff } from "@/types/platform";

export default function DemoRequestsPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<PlatformDemoRequestPage | null>(null);
  const [selected, setSelected] = useState<PlatformDemoRequest | null>(null);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [canDecide] = useState(() => {
    try { const role = (JSON.parse(localStorage.getItem(PLATFORM_STAFF) || "{}") as PlatformStaff).role; return role === "platform_owner" || role === "platform_admin"; }
    catch { return false; }
  });
  const load = useCallback(() => {
    const params: Record<string,string|number> = { page_size:50 };
    if (status) params.status = status;
    if (query) params.search = query;
    platformService.demoRequests(params).then(setData).catch(() => showToast("Não foi possível carregar as solicitações.","error")).finally(()=>setLoading(false));
  },[query,status,showToast]);
  useEffect(()=>{load();},[load]);
  const submit=(event:FormEvent)=>{event.preventDefault();setLoading(true);setQuery(search.trim());};
  const decide=async(decision:"approve"|"reject")=>{
    if(!selected)return;
    if(!window.confirm(`${decision === "approve" ? "Aprovar" : "Rejeitar"} a solicitação de ${selected.organization_name}?`))return;
    setDeciding(true);
    try{await platformService.decideDemoRequest(selected.id,decision,notes);showToast(`Solicitação ${decision === "approve" ? "aprovada" : "rejeitada"}.`,"success");setSelected(null);setNotes("");load();}
    catch{showToast("Não foi possível registrar a decisão.","error");}
    finally{setDeciding(false);}
  };
  return <><div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4"><div><div className="platform-label mb-2">Comercial</div><h1 className="h2 fw-bold mb-1">Solicitações de demonstração</h1><p className="text-muted mb-0">Analise os contatos recebidos pela landing page.</p></div><div className="platform-status active"><Clock3 size={14}/>{data?.count ?? 0} registros</div></div>
    <div className="platform-card overflow-hidden"><div className="p-3 border-bottom"><form className="row g-2" onSubmit={submit}><div className="col-md"><div className="input-group"><span className="input-group-text"><Search size={16}/></span><input className="form-control" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome, e-mail ou organização"/></div></div><div className="col-md-3"><select className="form-select" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos os status</option><option value="pending">Pendentes</option><option value="approved">Aprovadas</option><option value="rejected">Rejeitadas</option></select></div><div className="col-auto"><button className="btn btn-dark">Buscar</button></div></form></div>
      <div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th>Contato</th><th>Organização</th><th>Perfil</th><th>Recebida em</th><th>Status</th><th/></tr></thead><tbody>{loading?<tr><td colSpan={6} className="text-center py-5"><div className="spinner-border spinner-border-sm"/></td></tr>:data?.results.length?data.results.map(item=><tr key={item.id}><td><div className="fw-semibold">{item.name}</div><div className="text-muted small">{item.email}</div></td><td>{item.organization_name}</td><td>{item.operation_profile}</td><td className="small text-muted">{new Date(item.created_at).toLocaleString("pt-BR")}</td><td><span className={`platform-status ${item.status === "approved" ? "active" : item.status === "rejected" ? "suspended" : ""}`}>{item.status_display}</span></td><td className="text-end"><button className="btn btn-outline-secondary btn-sm" onClick={()=>{setSelected(item);setNotes(item.decision_notes);}}>Analisar</button></td></tr>):<tr><td colSpan={6} className="text-center text-muted py-5">Nenhuma solicitação encontrada.</td></tr>}</tbody></table></div></div>
    {selected&&<div className="position-fixed top-0 start-0 w-100 h-100 d-grid place-items-center p-3" style={{zIndex:1100,background:"rgba(15,23,42,.55)"}} onMouseDown={()=>setSelected(null)}><div className="platform-card p-4 w-100" style={{maxWidth:680}} onMouseDown={e=>e.stopPropagation()}><div className="d-flex justify-content-between gap-3 mb-4"><div><div className="platform-label mb-2">{selected.operation_profile}</div><h2 className="h4 fw-bold mb-1">{selected.organization_name}</h2><div className="text-muted">{selected.name}</div></div><button className="btn-close" onClick={()=>setSelected(null)}/></div><div className="d-flex flex-wrap gap-3 mb-4"><a href={`mailto:${selected.email}`} className="text-decoration-none"><Mail size={15}/> {selected.email}</a><a href={`tel:${selected.phone}`} className="text-decoration-none"><Phone size={15}/> {selected.phone}</a></div><div className="bg-light rounded p-3 mb-3" style={{whiteSpace:"pre-wrap"}}>{selected.message}</div><label className="form-label fw-semibold">Observação da decisão</label><textarea className="form-control mb-3" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} disabled={!canDecide||selected.status!=="pending"}/>{selected.status === "pending"&&canDecide?<div className="d-flex justify-content-end gap-2"><button className="btn btn-outline-danger d-flex gap-2 align-items-center" disabled={deciding} onClick={()=>decide("reject")}><X size={16}/>Rejeitar</button><button className="btn btn-success d-flex gap-2 align-items-center" disabled={deciding} onClick={()=>decide("approve")}><Check size={16}/>Aprovar</button></div>:<div className="alert alert-secondary mb-0">{selected.status_display}{selected.decided_by_name?` por ${selected.decided_by_name}`:""}{selected.decided_at?` em ${new Date(selected.decided_at).toLocaleString("pt-BR")}`:""}.</div>}</div></div>}
  </>;
}
