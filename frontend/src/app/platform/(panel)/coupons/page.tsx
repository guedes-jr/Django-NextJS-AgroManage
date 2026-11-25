"use client";

import { FormEvent, useEffect, useState } from "react";
import { BadgePercent, Plus } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { discountKinds, segmentNames } from "@/components/platform/OrganizationDiscountsSection";
import { platformErrorFields, usePlatformCanManage } from "@/components/platform/usePlatformRole";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import { platformService } from "@/services/platformApi";
import type { DiscountKind, PlatformCoupon } from "@/types/platform";

type Form = { code: string; description: string; kind: DiscountKind; value: string; segment_code: string; duration_months: string; valid_from: string; valid_until: string; max_redemptions: string; first_contract_only: boolean; cumulative: boolean; is_active: boolean };
const emptyForm: Form = { code: "", description: "", kind: "percentage", value: "", segment_code: "", duration_months: "", valid_from: "", valid_until: "", max_redemptions: "", first_contract_only: false, cumulative: true, is_active: true };
const money = (value: string) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const describe = (coupon: PlatformCoupon) => coupon.kind === "percentage" ? `${Number(coupon.value)}%` : coupon.kind === "exemption" ? "Isenção" : coupon.kind === "fixed_price" ? `Preço fixo ${money(coupon.value)}` : `− ${money(coupon.value)}`;
const dateInput = (value: string | null) => value ? value.slice(0, 10) : "";

export default function PlatformCouponsPage() {
  const { showToast } = useToast();
  const canManage = usePlatformCanManage();
  const [coupons, setCoupons] = useState<PlatformCoupon[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<PlatformCoupon | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    platformService.coupons({ page_size: 100 })
      .then(result => { if (active) { setCoupons(result.results); setError(""); } })
      .catch(cause => { if (active) setError(getOrganizationErrorMessage(cause, "Não foi possível carregar os cupons.")); });
    return () => { active = false; };
  }, [attempt]);

  const open = (coupon?: PlatformCoupon) => {
    setEditing(coupon || null); setErrors({});
    setForm(coupon ? {
      code: coupon.code, description: coupon.description, kind: coupon.kind, value: coupon.value, segment_code: coupon.segment_code,
      duration_months: coupon.duration_months?.toString() || "", valid_from: dateInput(coupon.valid_from), valid_until: dateInput(coupon.valid_until),
      max_redemptions: coupon.max_redemptions?.toString() || "", first_contract_only: coupon.first_contract_only, cumulative: coupon.cumulative, is_active: coupon.is_active,
    } : emptyForm);
    setFormOpen(true);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setErrors({});
    try {
      const saved = await platformService.saveCoupon({
        code: form.code.trim(), description: form.description.trim(), kind: form.kind, value: form.kind === "exemption" ? "0" : form.value.replace(",", "."),
        segment_code: form.segment_code, duration_months: form.duration_months ? Number(form.duration_months) : null,
        valid_from: form.valid_from ? new Date(`${form.valid_from}T00:00:00`).toISOString() : null,
        valid_until: form.valid_until ? new Date(`${form.valid_until}T23:59:59`).toISOString() : null,
        max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
        first_contract_only: form.first_contract_only, cumulative: form.cumulative, is_active: form.is_active,
      }, editing?.id);
      setCoupons(list => editing ? list?.map(item => item.id === saved.id ? saved : item) || [saved] : [saved, ...(list || [])]);
      setFormOpen(false);
      showToast(`Cupom ${saved.code} ${editing ? "atualizado" : "criado"}.`, "success");
    } catch (cause) {
      setErrors(platformErrorFields(cause));
      showToast(getOrganizationErrorMessage(cause, "Não foi possível salvar o cupom."), "error");
    } finally { setSaving(false); }
  };
  const field = (key: keyof Form, label: string, props: Record<string, unknown> = {}) => <div className="col-md-4">
    <label className="form-label" htmlFor={`coupon-${key}`}>{label}</label>
    <input id={`coupon-${key}`} className={`form-control ${errors[key] ? "is-invalid" : ""}`} value={String(form[key])} disabled={saving} onChange={event => setForm({ ...form, [key]: event.target.value })} {...props}/>
    {errors[key] && <div className="invalid-feedback">{errors[key]}</div>}
  </div>;
  const check = (key: "first_contract_only" | "cumulative" | "is_active", label: string) => <div className="form-check"><input id={`coupon-${key}`} type="checkbox" className="form-check-input" checked={form[key]} disabled={saving} onChange={event => setForm({ ...form, [key]: event.target.checked })}/><label htmlFor={`coupon-${key}`} className="form-check-label">{label}</label></div>;

  return <div className="platform-management">
    <div className="platform-page-header">
      <div><div className="platform-label">Oferta comercial</div><h1>Cupons promocionais</h1><p>O cliente aplica o código em Configurações › Assinatura. O desconto entra no cálculo do valor mensal.</p></div>
      <div className="platform-actions"><span className="platform-pill success"><BadgePercent size={14}/>{coupons?.length ?? 0} cupons</span>{canManage && <button className="btn btn-success" onClick={() => open()}><Plus size={16}/>Novo cupom</button>}</div>
    </div>
    {formOpen && <form className="platform-card platform-form-card mb-3" onSubmit={save} noValidate>
      <h2>{editing ? `Editar cupom ${editing.code}` : "Novo cupom"}</h2>
      <p>Defina o tipo, o alcance e a validade. Sem duração, o desconto vale enquanto a assinatura existir.</p>
      <div className="row g-3">
        {field("code", "Código", { maxLength: 40, required: true, className: `form-control text-uppercase ${errors.code ? "is-invalid" : ""}` })}
        <div className="col-md-4"><label className="form-label" htmlFor="coupon-kind">Tipo</label><select id="coupon-kind" className="form-select" value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value as DiscountKind })}>{Object.entries(discountKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        {form.kind !== "exemption" && field("value", form.kind === "percentage" ? "Percentual" : "Valor (R$)", { inputMode: "decimal", required: true })}
        <div className="col-md-4"><label className="form-label" htmlFor="coupon-segment">Aplicar em</label><select id="coupon-segment" className="form-select" value={form.segment_code} onChange={event => setForm({ ...form, segment_code: event.target.value })}><option value="">Assinatura inteira</option>{Object.entries(segmentNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></div>
        {field("duration_months", "Duração do desconto (meses)", { type: "number", min: 1, placeholder: "sem prazo" })}
        {field("max_redemptions", "Limite de usos", { type: "number", min: 1, placeholder: "ilimitado" })}
        {field("valid_from", "Válido a partir de", { type: "date" })}
        {field("valid_until", "Válido até", { type: "date" })}
        {field("description", "Descrição", { maxLength: 255 })}
        <div className="col-12 platform-check-grid">{check("first_contract_only", "Somente na primeira contratação")}{check("cumulative", "Soma com outros cupons e indicações")}{check("is_active", "Ativo")}</div>
      </div>
      <div className="platform-form-footer"><button type="button" className="btn btn-outline-secondary" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</button><button className="btn btn-success" disabled={saving || !form.code.trim()}>{saving ? "Salvando…" : "Salvar cupom"}</button></div>
    </form>}
    <div className="platform-card overflow-hidden">
      {error ? <div className="alert alert-danger m-3" role="alert">{error}<button className="btn btn-link" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div>
        : !coupons ? <div className="py-5 text-center" role="status"><div className="spinner-border spinner-border-sm text-success"/></div>
        : coupons.length ? <div className="table-responsive"><table className="table platform-table mb-0">
          <thead><tr><th>Cupom</th><th>Desconto</th><th>Alcance</th><th>Validade</th><th>Usos</th><th>Situação</th><th/></tr></thead>
          <tbody>{coupons.map(coupon => <tr key={coupon.id}>
            <td><div className="fw-bold font-monospace">{coupon.code}</div><div className="small text-muted">{coupon.description}</div></td>
            <td className="tabular-nums">{describe(coupon)}<div className="small text-muted">{coupon.duration_months ? `por ${coupon.duration_months} meses` : "sem prazo"}{coupon.cumulative ? "" : " · não cumulativo"}</div></td>
            <td>{coupon.segment_code ? segmentNames[coupon.segment_code] || coupon.segment_code : "Assinatura"}</td>
            <td className="small tabular-nums">{coupon.valid_from ? new Date(coupon.valid_from).toLocaleDateString("pt-BR") : "—"} → {coupon.valid_until ? new Date(coupon.valid_until).toLocaleDateString("pt-BR") : "sem fim"}</td>
            <td className="tabular-nums">{coupon.redemptions}{coupon.max_redemptions ? ` / ${coupon.max_redemptions}` : ""}</td>
            <td><span className={`platform-pill ${coupon.is_active ? "success" : ""}`}>{coupon.is_active ? "Ativo" : "Inativo"}</span></td>
            <td className="text-end">{canManage && <button className="btn btn-outline-secondary btn-sm" onClick={() => open(coupon)}>Editar</button>}</td>
          </tr>)}</tbody>
        </table></div> : <p className="p-3 mb-0 text-muted">Nenhum cupom cadastrado.</p>}
    </div>
  </div>;
}
