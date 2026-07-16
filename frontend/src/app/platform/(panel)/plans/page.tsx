"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Pencil, Plus, Tags } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { platformService } from "@/services/platformApi";
import type { PlatformPlan, PlatformSubscriptionPage } from "@/types/platform";

const emptyForm = {
  code: "", name: "", description: "", monthly_price: "0.00", yearly_price: "0.00",
  trial_days: 0, max_users: "", max_farms: "", max_storage_mb: "",
  max_reports_per_month: "", is_active: true, is_public: true,
};

export default function PlatformPlansPage() {
  const { showToast } = useToast();
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<PlatformSubscriptionPage | null>(null);
  const [editing, setEditing] = useState<PlatformPlan | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(() => {
    Promise.all([platformService.plans(), platformService.subscriptions({ page_size: 100 })])
      .then(([planPage, subscriptionPage]) => { setPlans(planPage.results); setSubscriptions(subscriptionPage); })
      .catch(() => showToast("Não foi possível carregar planos e assinaturas.", "error"));
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (plan: PlatformPlan) => {
    setEditing(plan);
    setForm({
      code: plan.code, name: plan.name, description: plan.description,
      monthly_price: plan.monthly_price, yearly_price: plan.yearly_price,
      trial_days: plan.trial_days, max_users: plan.max_users?.toString() ?? "",
      max_farms: plan.max_farms?.toString() ?? "", max_storage_mb: plan.max_storage_mb?.toString() ?? "",
      max_reports_per_month: plan.max_reports_per_month?.toString() ?? "",
      is_active: plan.is_active, is_public: plan.is_public,
    });
    setShowForm(true);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    const numberOrNull = (value: string) => value ? Number(value) : null;
    const payload = { ...form, max_users:numberOrNull(form.max_users), max_farms:numberOrNull(form.max_farms), max_storage_mb:numberOrNull(form.max_storage_mb), max_reports_per_month:numberOrNull(form.max_reports_per_month) };
    try {
      if (editing) await platformService.updatePlan(editing.id, payload);
      else await platformService.createPlan(payload);
      showToast(`Plano ${editing ? "atualizado" : "criado"} com sucesso.`, "success");
      setShowForm(false); load();
    } catch (error) {
      const status = (error as {response?:{status?:number}}).response?.status;
      showToast(status === 403 ? "Seu papel não permite editar planos." : "Não foi possível salvar o plano.", "error");
    } finally { setSaving(false); }
  };
  const changePlan = async (subscriptionId: string, planId: string, cycle: string) => {
    try { await platformService.changeSubscriptionPlan(subscriptionId, planId, cycle); showToast("Assinatura atualizada.", "success"); load(); }
    catch { showToast("Não foi possível alterar a assinatura.", "error"); }
  };

  return <>
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4"><div><div className="platform-label mb-2">Oferta comercial</div><h1 className="h2 fw-bold mb-1">Planos e assinaturas</h1><p className="text-muted mb-0">Configure preços, limites e o plano de cada organização.</p></div><button className="btn btn-dark d-flex gap-2 align-items-center" onClick={openCreate}><Plus size={17}/>Novo plano</button></div>
    <div className="row g-3 mb-4">{plans.map((plan) => <div className="col-md-6 col-xl-3" key={plan.id}><div className="platform-card p-4 h-100"><div className="d-flex justify-content-between mb-3"><div className="platform-icon"><Tags size={19}/></div><button className="btn btn-sm btn-outline-secondary" onClick={() => openEdit(plan)}><Pencil size={14}/></button></div><div className="d-flex gap-2 mb-2"><span className={`platform-status ${plan.is_active ? "active" : "suspended"}`}>{plan.is_active ? "Ativo" : "Inativo"}</span>{plan.is_public && <span className="badge text-bg-light">Público</span>}</div><h2 className="h4 fw-bold mb-1">{plan.name}</h2><div className="text-muted small mb-3">{plan.description || plan.code}</div><div className="fs-3 fw-bold">R$ {Number(plan.monthly_price).toLocaleString("pt-BR",{minimumFractionDigits:2})}<span className="fs-6 text-muted fw-normal">/mês</span></div><div className="border-top mt-3 pt-3 small"><div className="d-flex justify-content-between"><span className="text-muted">Clientes</span><strong>{plan.subscriptions_count}</strong></div><div className="d-flex justify-content-between"><span className="text-muted">Usuários</span><strong>{plan.max_users ?? "Ilimitado"}</strong></div><div className="d-flex justify-content-between"><span className="text-muted">Fazendas</span><strong>{plan.max_farms ?? "Ilimitado"}</strong></div></div></div></div>)}</div>
    {showForm && <div className="platform-card p-4 mb-4"><div className="d-flex justify-content-between mb-3"><h2 className="h5 fw-bold">{editing ? `Editar ${editing.name}` : "Novo plano"}</h2><button className="btn-close" onClick={() => setShowForm(false)} /></div><form onSubmit={submit}><div className="row g-3"><div className="col-md-4"><label className="form-label small fw-semibold">Código</label><input className="form-control" value={form.code} onChange={(e)=>setForm({...form,code:e.target.value})} required /></div><div className="col-md-8"><label className="form-label small fw-semibold">Nome</label><input className="form-control" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} required /></div><div className="col-12"><label className="form-label small fw-semibold">Descrição</label><textarea className="form-control" rows={2} value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/></div>{[["monthly_price","Preço mensal"],["yearly_price","Preço anual"],["max_users","Máx. usuários"],["max_farms","Máx. fazendas"],["max_storage_mb","Armazenamento MB"],["max_reports_per_month","Relatórios/mês"]].map(([key,label])=><div className="col-md-4" key={key}><label className="form-label small fw-semibold">{label}</label><input className="form-control" type="number" min="0" step={key.includes("price")?"0.01":"1"} value={String(form[key as keyof typeof form])} onChange={(e)=>setForm({...form,[key]:e.target.value})}/></div>)}</div><div className="d-flex gap-4 my-3"><label className="form-check"><input className="form-check-input" type="checkbox" checked={form.is_active} onChange={(e)=>setForm({...form,is_active:e.target.checked})}/> <span className="form-check-label">Ativo</span></label><label className="form-check"><input className="form-check-input" type="checkbox" checked={form.is_public} onChange={(e)=>setForm({...form,is_public:e.target.checked})}/> <span className="form-check-label">Público</span></label></div><button className="btn btn-success d-flex gap-2 align-items-center" disabled={saving}><Check size={16}/>{saving?"Salvando...":"Salvar plano"}</button></form></div>}
    <div className="platform-card overflow-hidden"><div className="p-4 border-bottom"><h2 className="h5 fw-bold mb-1">Assinaturas das organizações</h2><p className="text-muted small mb-0">{subscriptions?.count ?? 0} assinaturas cadastradas.</p></div><div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th>Organização</th><th>Plano</th><th>Ciclo</th><th>Status</th><th>Alterar plano</th></tr></thead><tbody>{subscriptions?.results.map((subscription)=><tr key={subscription.id}><td><div className="fw-semibold">{subscription.organization_name}</div></td><td>{subscription.plan_name}</td><td>{subscription.billing_cycle_display}</td><td><span className={`platform-status ${subscription.status === "active" ? "active":"suspended"}`}>{subscription.status_display}</span></td><td><div className="d-flex gap-2"><select className="form-select form-select-sm" defaultValue={subscription.plan} id={`plan-${subscription.id}`}>{plans.filter(p=>p.is_active).map(plan=><option value={plan.id} key={plan.id}>{plan.name}</option>)}</select><button className="btn btn-outline-secondary btn-sm" onClick={()=>{const select=document.getElementById(`plan-${subscription.id}`) as HTMLSelectElement; void changePlan(subscription.id,select.value,subscription.billing_cycle);}}>Aplicar</button></div></td></tr>)}</tbody></table></div></div>
  </>;
}
