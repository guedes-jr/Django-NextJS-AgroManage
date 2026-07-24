"use client";

import { FormEvent, useEffect, useState } from "react";
import { Building2, Save, X } from "lucide-react";

import { platformService } from "@/services/platformApi";
import type { OrganizationFormPayload, PlatformOrganization, PlatformPlan } from "@/types/platform";

export function OrganizationFormModal({
  organization,
  onClose,
  onSaved,
}: {
  organization?: PlatformOrganization | null;
  onClose: () => void;
  onSaved: (organization: PlatformOrganization) => void;
}) {
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<OrganizationFormPayload>({
    name: organization?.name || "",
    slug: organization?.slug || "",
    document: organization?.document || "",
    email: organization?.email || "",
    phone: organization?.phone || "",
    address: organization?.address || "",
    plan_id: organization?.subscription_plan_id || "",
    billing_cycle: organization?.billing_cycle || "monthly",
  });

  useEffect(() => {
    platformService.plans()
      .then(({ results }) => {
        const activePlans = results.filter((plan) => plan.is_active);
        setPlans(activePlans);
        setForm((current) => ({ ...current, plan_id: current.plan_id || activePlans[0]?.id || "" }));
      })
      .catch(() => setError("Não foi possível carregar os planos disponíveis."));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = organization
        ? await platformService.updateOrganization(organization.id, form)
        : await platformService.createOrganization(form);
      onSaved(result);
    } catch (requestError) {
      const data = (requestError as { response?: { data?: Record<string, string[] | string> } }).response?.data;
      const firstMessage = data && Object.values(data).flat().find(Boolean);
      setError(firstMessage ? String(firstMessage) : "Não foi possível salvar a organização.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3" style={{ zIndex: 1100, background: "rgba(15, 23, 42, .55)", backdropFilter: "blur(3px)" }} onMouseDown={onClose}>
    <div className="platform-card w-100 overflow-auto" style={{ maxWidth: 820, maxHeight: "calc(100vh - 32px)" }} onMouseDown={(event) => event.stopPropagation()}>
      <div className="p-4 border-bottom d-flex justify-content-between align-items-start">
        <div className="d-flex gap-3 align-items-center"><div className="platform-icon"><Building2 size={20} /></div><div><h2 className="h4 fw-bold mb-1">{organization ? "Editar organização" : "Nova organização"}</h2><p className="text-muted small mb-0">Dados cadastrais, contato e assinatura comercial.</p></div></div>
        <button type="button" className="btn btn-sm btn-light" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      </div>
      <form onSubmit={submit}>
        <div className="p-4">
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <div className="row g-3">
            <div className="col-md-8"><label className="form-label fw-semibold">Nome da organização</label><input required className="form-control" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-semibold">Identificador (slug)</label><input className="form-control" placeholder="Gerado automaticamente" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-semibold">CNPJ ou CPF</label><input className="form-control" value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-semibold">E-mail</label><input type="email" className="form-control" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-semibold">Telefone</label><input className="form-control" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
            <div className="col-12"><label className="form-label fw-semibold">Endereço</label><textarea rows={2} className="form-control" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></div>
            <div className="col-md-7"><label className="form-label fw-semibold">Plano</label><select required className="form-select" value={form.plan_id} onChange={(event) => setForm({ ...form, plan_id: event.target.value })}><option value="">Selecione um plano</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — R$ {Number(plan.monthly_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês</option>)}</select></div>
            <div className="col-md-5"><label className="form-label fw-semibold">Ciclo de cobrança</label><select className="form-select" value={form.billing_cycle} onChange={(event) => setForm({ ...form, billing_cycle: event.target.value as OrganizationFormPayload["billing_cycle"] })}><option value="monthly">Mensal</option><option value="yearly">Anual</option><option value="custom">Personalizado</option></select></div>
          </div>
        </div>
        <div className="p-3 border-top d-flex justify-content-end gap-2"><button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-success d-flex align-items-center gap-2" disabled={saving || !form.plan_id}><Save size={16} />{saving ? "Salvando..." : "Salvar organização"}</button></div>
      </form>
    </div>
  </div>;
}
