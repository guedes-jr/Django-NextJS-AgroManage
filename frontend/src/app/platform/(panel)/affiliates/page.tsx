"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { BadgeDollarSign, Handshake, MousePointerClick, Pencil, Plus, Power, UserCheck, UserPlus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { platformService } from "@/services/platformApi";
import type {
  PlatformAffiliate, PlatformAffiliateCommission, PlatformAffiliateDashboard,
  PlatformAffiliateReferral, PlatformUser,
} from "@/types/platform";

type Tab = "affiliates" | "referrals" | "commissions";
const money=(value:string)=>Number(value).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const displayDate=(value:string|null)=>value?new Date(value).toLocaleDateString("pt-BR"):"—";
const affiliateEmailFromName=(name:string)=>{
  const localPart=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/[^a-z0-9]+/g,".").replace(/^\.+|\.+$/g,"");
  return localPart?`${localPart}.afiliado!@agro.com`:"";
};

export default function PlatformAffiliatesPage(){
  const {showToast}=useToast();
  const [dashboard,setDashboard]=useState<PlatformAffiliateDashboard|null>(null);
  const [affiliates,setAffiliates]=useState<PlatformAffiliate[]>([]);
  const [referrals,setReferrals]=useState<PlatformAffiliateReferral[]>([]);
  const [commissions,setCommissions]=useState<PlatformAffiliateCommission[]>([]);
  const [users,setUsers]=useState<PlatformUser[]>([]);
  const [tab,setTab]=useState<Tab>("affiliates");
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState<PlatformAffiliate|null>(null);
  const [accountMode,setAccountMode]=useState<"dedicated"|"existing">("dedicated");
  const [form,setForm]=useState({user_id:"",full_name:"",email:"",initial_password:"",commission_type:"percentage",commission_value:"10.00",currency:"BRL"});

  const load=useCallback(()=>{
    Promise.all([
      platformService.affiliateDashboard(), platformService.affiliates({page_size:100}),
      platformService.affiliateReferrals({page_size:100}), platformService.affiliateCommissions({page_size:100}),
      platformService.users({page_size:100,is_active:true}),
    ]).then(([summary,affiliatePage,referralPage,commissionPage,userPage])=>{
      setDashboard(summary);setAffiliates(affiliatePage.results);setReferrals(referralPage.results);
      setCommissions(commissionPage.results);setUsers(userPage.results);
    }).catch(()=>showToast("Não foi possível carregar o programa de afiliados.","error"));
  },[showToast]);
  useEffect(()=>{load();},[load]);

  const openCreate=()=>{setEditing(null);setAccountMode("dedicated");setForm({user_id:"",full_name:"",email:"",initial_password:"",commission_type:"percentage",commission_value:"10.00",currency:"BRL"});setShowForm(true);};
  const openEdit=(affiliate:PlatformAffiliate)=>{setEditing(affiliate);setAccountMode(affiliate.portal_access_only?"dedicated":"existing");setForm({user_id:affiliate.user_id,full_name:affiliate.full_name,email:affiliate.email,initial_password:"",commission_type:affiliate.commission_type,commission_value:affiliate.commission_value,currency:affiliate.currency});setShowForm(true);};
  const fillAffiliateEmail=()=>{if(!form.email.trim()){const generated=affiliateEmailFromName(form.full_name);if(generated)setForm(current=>({...current,email:generated}));}};
  const save=async(event:FormEvent)=>{event.preventDefault();try{if(editing)await platformService.updateAffiliate(editing.id,{commission_type:form.commission_type,commission_value:form.commission_value,currency:form.currency});else if(accountMode==="dedicated")await platformService.createAffiliate({full_name:form.full_name,email:form.email,initial_password:form.initial_password,portal_access_only:true,commission_type:form.commission_type,commission_value:form.commission_value,currency:form.currency});else await platformService.createAffiliate({user_id:form.user_id,portal_access_only:false,commission_type:form.commission_type,commission_value:form.commission_value,currency:form.currency});showToast(editing?"Comissão atualizada.":"Afiliado cadastrado.","success");setShowForm(false);load();}catch{showToast("Não foi possível salvar o afiliado.","error");}};
  const toggle=async(item:PlatformAffiliate)=>{try{await platformService.setAffiliateActive(item.id,item.status!=="active");showToast("Status atualizado.","success");load();}catch{showToast("Não foi possível alterar o status.","error");}};
  const transition=async(item:PlatformAffiliateCommission,action:"approve"|"mark-paid"|"cancel")=>{const reason=window.prompt("Informe o motivo desta alteração");if(!reason)return;try{await platformService.transitionAffiliateCommission(item.id,action,reason);showToast("Comissão atualizada.","success");load();}catch{showToast("Transição não permitida ou inválida.","error");}};
  const eligibleUsers=users.filter(user=>!affiliates.some(affiliate=>affiliate.user_id===user.id));
  const metrics=dashboard?[
    {label:"Afiliados ativos",value:`${dashboard.active_affiliates}/${dashboard.affiliates}`,icon:Handshake},
    {label:"Cliques",value:String(dashboard.clicks),icon:MousePointerClick},
    {label:"Cadastros",value:String(dashboard.registrations),icon:UserPlus},
    {label:"Convertidos",value:String(dashboard.conversions),icon:UserCheck},
    {label:"Comissões geradas",value:money(dashboard.commissions.generated),icon:BadgeDollarSign},
  ]:[];

  return <>
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4"><div><div className="platform-label mb-2">Programa comercial</div><h1 className="h2 fw-bold mb-1">Afiliados e vendedores</h1><p className="text-muted mb-0">Gerencie indicações, conversões e pagamentos de comissão.</p></div><button className="btn btn-dark d-flex gap-2" onClick={openCreate}><Plus size={17}/>Novo afiliado</button></div>
    <div className="row g-3 mb-4">{metrics.map(metric=><div className="col-sm-6 col-xl" key={metric.label}><div className="platform-card platform-metric h-100"><div className="d-flex justify-content-between"><div className="platform-label">{metric.label}</div><div className="platform-icon"><metric.icon size={18}/></div></div><div className="fs-4 fw-bold mt-3">{metric.value}</div></div></div>)}</div>
    {showForm&&<form className="platform-card p-4 mb-4" onSubmit={save}><div className="d-flex justify-content-between mb-3"><h2 className="h5 fw-bold mb-0">{editing?"Editar comissão":"Cadastrar afiliado"}</h2><button type="button" className="btn-close" onClick={()=>setShowForm(false)}/></div>{!editing&&<div className="btn-group mb-3"><button type="button" className={`btn ${accountMode==="dedicated"?"btn-dark":"btn-outline-secondary"}`} onClick={()=>setAccountMode("dedicated")}>Acesso dedicado</button><button type="button" className={`btn ${accountMode==="existing"?"btn-dark":"btn-outline-secondary"}`} onClick={()=>setAccountMode("existing")}>Usuário existente</button></div>}<div className="row g-3">{!editing&&accountMode==="dedicated"?<><div className="col-md-4"><label className="form-label">Nome do vendedor</label><input className="form-control" required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} onBlur={fillAffiliateEmail}/></div><div className="col-md-4"><label className="form-label">E-mail de acesso</label><input className="form-control" type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div><div className="col-md-4"><label className="form-label">Senha inicial</label><input className="form-control" type="password" minLength={8} required value={form.initial_password} onChange={e=>setForm({...form,initial_password:e.target.value})}/></div></>:<div className="col-md-5"><label className="form-label">Usuário</label><select className="form-select" required disabled={!!editing} value={form.user_id} onChange={e=>setForm({...form,user_id:e.target.value})}><option value="">Selecione</option>{editing&&<option value={editing.user_id}>{editing.full_name} — {editing.email}</option>}{eligibleUsers.map(user=><option key={user.id} value={user.id}>{user.full_name} — {user.email}</option>)}</select></div>}<div className="col-md-3"><label className="form-label">Tipo</label><select className="form-select" value={form.commission_type} onChange={e=>setForm({...form,commission_type:e.target.value})}><option value="percentage">Percentual</option><option value="fixed_amount">Valor fixo</option></select></div><div className="col-md-2"><label className="form-label">Comissão</label><input className="form-control" type="number" min="0" max={form.commission_type==="percentage"?"100":undefined} step="0.01" required value={form.commission_value} onChange={e=>setForm({...form,commission_value:e.target.value})}/></div><div className="col-md-2 d-flex align-items-end"><button className="btn btn-success w-100">Salvar</button></div></div>{!editing&&accountMode==="dedicated"&&<div className="alert alert-light border mt-3 mb-0 small">A conta terá acesso somente em <strong>/afiliados/login</strong> e não será vinculada a uma organização.</div>}</form>}
    <div className="d-flex gap-2 mb-3">{(["affiliates","referrals","commissions"] as Tab[]).map(value=><button key={value} className={`btn ${tab===value?"btn-dark":"btn-outline-secondary"}`} onClick={()=>setTab(value)}>{value==="affiliates"?"Afiliados":value==="referrals"?"Indicações":"Comissões"}</button>)}</div>
    {tab==="affiliates"&&<div className="platform-card overflow-hidden"><div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th>Afiliado</th><th>Código</th><th>Comissão</th><th>Funil</th><th>Total gerado</th><th>Status</th><th/></tr></thead><tbody>{affiliates.map(item=><tr key={item.id}><td><div className="fw-semibold">{item.full_name}</div><div className="text-muted small">{item.email}</div><span className="badge text-bg-light mt-1">{item.portal_access_only?"Acesso dedicado":"Usuário vinculado"}</span></td><td><code>{item.code}</code></td><td>{item.commission_type==="percentage"?`${Number(item.commission_value)}%`:money(item.commission_value)}</td><td className="small">{item.clicks} cliques · {item.registrations} cadastros · {item.conversions} conversões</td><td>{money(item.commissions_total)}</td><td><span className={`platform-status ${item.status==="active"?"active":"suspended"}`}>{item.status==="active"?"Ativo":"Inativo"}</span></td><td><div className="d-flex gap-1 justify-content-end"><button className="btn btn-outline-secondary btn-sm" onClick={()=>openEdit(item)} title="Editar"><Pencil size={14}/></button><button className={`btn btn-sm ${item.status==="active"?"btn-outline-danger":"btn-outline-success"}`} onClick={()=>toggle(item)} title="Alterar status"><Power size={14}/></button></div></td></tr>)}{!affiliates.length&&<tr><td colSpan={7} className="text-center text-muted py-5">Nenhum afiliado cadastrado.</td></tr>}</tbody></table></div></div>}
    {tab==="referrals"&&<div className="platform-card overflow-hidden"><div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th>Afiliado</th><th>Cliente</th><th>Organização</th><th>Plano</th><th>Entrada</th><th>Status</th></tr></thead><tbody>{referrals.map(item=><tr key={item.id}><td>{item.affiliate_name}<div className="text-muted small">{item.affiliate_code}</div></td><td>{item.customer_name||"Visitante"}<div className="text-muted small">{item.customer_email}</div></td><td>{item.organization_name||"—"}</td><td>{item.plan_name||"—"}</td><td>{displayDate(item.attributed_at)}</td><td><span className={`platform-status ${item.status==="converted"?"active":"suspended"}`}>{item.status_display}</span></td></tr>)}{!referrals.length&&<tr><td colSpan={6} className="text-center text-muted py-5">Nenhuma indicação encontrada.</td></tr>}</tbody></table></div></div>}
    {tab==="commissions"&&<div className="platform-card overflow-hidden"><div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th>Afiliado</th><th>Cliente</th><th>Plano/Fatura</th><th>Contratação</th><th>Comissão</th><th>Status</th><th/></tr></thead><tbody>{commissions.map(item=><tr key={item.id}><td>{item.affiliate_name}<div className="text-muted small">{item.affiliate_code}</div></td><td>{item.customer_name}<div className="text-muted small">{item.organization_name}</div></td><td>{item.plan_name}<div className="text-muted small">{item.invoice_number}</div></td><td>{money(item.transaction_amount)}</td><td className="fw-semibold">{money(item.commission_amount)}</td><td><span className={`platform-status ${item.status==="paid"?"active":"suspended"}`}>{item.status_display}</span></td><td><div className="d-flex gap-1 justify-content-end">{item.status==="pending"&&<><button className="btn btn-outline-success btn-sm" onClick={()=>transition(item,"approve")}>Aprovar</button><button className="btn btn-outline-danger btn-sm" onClick={()=>transition(item,"cancel")}>Cancelar</button></>}{item.status==="approved"&&<><button className="btn btn-success btn-sm" onClick={()=>transition(item,"mark-paid")}>Marcar paga</button><button className="btn btn-outline-danger btn-sm" onClick={()=>transition(item,"cancel")}>Cancelar</button></>}</div></td></tr>)}{!commissions.length&&<tr><td colSpan={7} className="text-center text-muted py-5">Nenhuma comissão encontrada.</td></tr>}</tbody></table></div></div>}
  </>;
}
