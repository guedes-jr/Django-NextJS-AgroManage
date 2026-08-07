"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CalendarPlus, CircleDollarSign, Clock3, ExternalLink, Mail, Phone, Search, Target, UserCheck } from "lucide-react";

import { platformService } from "@/services/platformApi";
import type { CommercialDashboard, PlatformDemoRequest, PlatformDemoRequestPage } from "@/types/platform";

const stages = [
  ["new", "Novo"], ["contacted", "Contato realizado"], ["scheduled", "Demo agendada"],
  ["proposal", "Proposta enviada"], ["negotiation", "Negociação"], ["won", "Convertido"], ["lost", "Perdido"],
] as const;

const money = (value:string|number) => Number(value||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

export default function DemoRequestsPage() {
  const [data,setData]=useState<PlatformDemoRequestPage|null>(null);
  const [dashboard,setDashboard]=useState<CommercialDashboard|null>(null);
  const [selected,setSelected]=useState<PlatformDemoRequest|null>(null);
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [form,setForm]=useState({status:"new",estimated_value:"0",next_action_at:"",internal_notes:"",loss_reason:""});
  const [schedule,setSchedule]=useState({starts_at:"",duration_minutes:45,meeting_url:"",notes:""});

  const load=useCallback(async()=>{setLoading(true);setError("");try{const [leads,metrics]=await Promise.all([platformService.demoRequests({page_size:100,search:query}),platformService.commercialDashboard()]);setData(leads);setDashboard(metrics);}catch{setError("Não foi possível carregar o CRM comercial.");}finally{setLoading(false);}},[query]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);
  const open=(lead:PlatformDemoRequest)=>{setSelected(lead);setForm({status:lead.status,estimated_value:lead.estimated_value||"0",next_action_at:lead.next_action_at?.slice(0,16)||"",internal_notes:lead.internal_notes||"",loss_reason:lead.loss_reason||""});};
  const save=async()=>{if(!selected)return;try{const updated=await platformService.updateDemoPipeline(selected.id,{...form,next_action_at:form.next_action_at?new Date(form.next_action_at).toISOString():null});setSelected(updated);await load();}catch{setError("Não foi possível atualizar o lead.");}};
  const addSchedule=async()=>{if(!selected||!schedule.starts_at)return;try{await platformService.scheduleDemo(selected.id,{...schedule,starts_at:new Date(schedule.starts_at).toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});setSchedule({starts_at:"",duration_minutes:45,meeting_url:"",notes:""});const refreshed=(await platformService.demoRequests({page_size:100,search:selected.email})).results[0];setSelected(refreshed);await load();}catch{setError("Não foi possível agendar a demonstração.");}};
  const submit=(e:FormEvent)=>{e.preventDefault();void load();};

  return <>
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4"><div><div className="platform-label mb-2">Comercial</div><h1 className="h2 fw-bold mb-1">CRM de demonstrações</h1><p className="text-muted mb-0">Do primeiro contato à conversão, com agenda, valor e histórico.</p></div><form className="d-flex" onSubmit={submit}><input className="form-control" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar lead"/><button className="btn btn-dark"><Search size={16}/></button></form></div>
    {error&&<div className="alert alert-danger">{error}</div>}
    <div className="row g-3 mb-4">
      <Metric icon={Target} label="Leads" value={dashboard?.summary.total_leads||0}/><Metric icon={Clock3} label="Em aberto" value={dashboard?.summary.open_leads||0}/><Metric icon={CalendarPlus} label="Agendadas" value={dashboard?.summary.scheduled||0}/><Metric icon={CircleDollarSign} label="Pipeline" value={money(dashboard?.summary.estimated_pipeline||0)}/>
    </div>
    <div className="platform-card p-3 mb-4"><div className="d-flex flex-wrap gap-2">{stages.map(([key,label])=><span className="badge text-bg-light p-2" key={key}>{label}: {dashboard?.by_status[key]||0}</span>)}</div></div>
    <div className="platform-card overflow-hidden"><div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th>Lead</th><th>Etapa</th><th>Origem</th><th>Próxima ação</th><th>Valor</th><th/></tr></thead><tbody>{loading?<tr><td colSpan={6} className="text-center py-5"><div className="spinner-border spinner-border-sm"/></td></tr>:data?.results.length?data.results.map(lead=><tr key={lead.id}><td><strong>{lead.organization_name}</strong><div className="small text-muted">{lead.name} · {lead.email}</div></td><td><span className={`platform-status ${lead.status==="won"?"active":lead.status==="lost"?"suspended":""}`}>{lead.status_display}</span></td><td><div>{lead.utm_source||"Direto"}</div><small className="text-muted">{lead.utm_campaign||lead.landing_path}</small></td><td className="small">{lead.next_action_at?new Date(lead.next_action_at).toLocaleString("pt-BR"):"Não definida"}</td><td>{money(lead.estimated_value)}</td><td className="text-end"><button className="btn btn-outline-secondary btn-sm" onClick={()=>open(lead)}>Gerenciar</button></td></tr>):<tr><td colSpan={6} className="text-center text-muted py-5">Nenhum lead encontrado.</td></tr>}</tbody></table></div></div>
    {selected&&<div className="position-fixed top-0 start-0 w-100 h-100 overflow-auto p-3" style={{zIndex:1100,background:"rgba(15,23,42,.6)"}} onMouseDown={()=>setSelected(null)}><div className="platform-card p-4 mx-auto my-3" style={{maxWidth:900}} onMouseDown={e=>e.stopPropagation()}>
      <div className="d-flex justify-content-between mb-4"><div><div className="platform-label">{selected.operation_profile} · {selected.selected_plan||"Plano não definido"}</div><h2 className="h4 fw-bold mb-1">{selected.organization_name}</h2><div className="text-muted">{selected.name}</div></div><button className="btn-close" onClick={()=>setSelected(null)}/></div>
      <div className="d-flex flex-wrap gap-3 mb-3"><a href={`mailto:${selected.email}`}><Mail size={15}/> {selected.email}</a><a href={`tel:${selected.phone}`}><Phone size={15}/> {selected.phone}</a></div>
      <div className="bg-light rounded p-3 mb-4" style={{whiteSpace:"pre-wrap"}}>{selected.message}</div>
      <div className="row g-3"><div className="col-md-6"><label className="form-label">Etapa</label><select className="form-select" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{stages.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></div><div className="col-md-6"><label className="form-label">Valor estimado</label><input className="form-control" type="number" min="0" step="0.01" value={form.estimated_value} onChange={e=>setForm({...form,estimated_value:e.target.value})}/></div><div className="col-md-6"><label className="form-label">Próxima ação</label><input className="form-control" type="datetime-local" value={form.next_action_at} onChange={e=>setForm({...form,next_action_at:e.target.value})}/></div>{form.status==="lost"&&<div className="col-md-6"><label className="form-label">Motivo da perda</label><input className="form-control" value={form.loss_reason} onChange={e=>setForm({...form,loss_reason:e.target.value})}/></div>}<div className="col-12"><label className="form-label">Notas internas</label><textarea className="form-control" rows={3} value={form.internal_notes} onChange={e=>setForm({...form,internal_notes:e.target.value})}/></div><div className="col-12 text-end"><button className="btn btn-success" onClick={()=>void save()}>Salvar lead</button></div></div>
      <hr className="my-4"/><h3 className="h6 fw-bold"><CalendarPlus size={17}/> Agendar demonstração</h3><div className="row g-2"><div className="col-md-5"><input className="form-control" type="datetime-local" value={schedule.starts_at} onChange={e=>setSchedule({...schedule,starts_at:e.target.value})}/></div><div className="col-md-2"><input className="form-control" type="number" value={schedule.duration_minutes} onChange={e=>setSchedule({...schedule,duration_minutes:Number(e.target.value)})}/></div><div className="col-md-5"><input className="form-control" placeholder="Link da reunião" value={schedule.meeting_url} onChange={e=>setSchedule({...schedule,meeting_url:e.target.value})}/></div><div className="col-12 text-end"><button className="btn btn-outline-success" onClick={()=>void addSchedule()}>Adicionar à agenda</button></div></div>
      {!!selected.appointments?.length&&<div className="mt-3">{selected.appointments.map(item=><div className="border rounded p-2 small mb-2" key={item.id}><strong>{new Date(item.starts_at).toLocaleString("pt-BR")}</strong> · {item.duration_minutes} min {item.meeting_url&&<a className="ms-2" href={item.meeting_url} target="_blank"><ExternalLink size={13}/> reunião</a>}<a className="ms-2" href={item.google_calendar_url} target="_blank">Google Calendar</a><a className="ms-2" href={item.outlook_calendar_url} target="_blank">Outlook</a></div>)}</div>}
      {!!selected.activities?.length&&<><hr className="my-4"/><h3 className="h6 fw-bold">Histórico</h3>{selected.activities.map(item=><div className="border-start ps-3 py-2 small" key={item.id}><strong>{item.description}</strong><div className="text-muted">{new Date(item.created_at).toLocaleString("pt-BR")} {item.actor_name&&`· ${item.actor_name}`}</div></div>)}</>}
    </div></div>}
  </>;
}

function Metric({icon:Icon,label,value}:{icon:typeof UserCheck;label:string;value:string|number}){return <div className="col-sm-6 col-xl-3"><div className="platform-card p-3 h-100 d-flex gap-3 align-items-center"><div className="platform-icon"><Icon size={18}/></div><div><div className="platform-label">{label}</div><div className="fs-4 fw-bold">{value}</div></div></div></div>}
