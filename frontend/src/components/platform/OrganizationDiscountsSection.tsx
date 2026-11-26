"use client";

import { FormEvent, useEffect, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import { platformService } from "@/services/platformApi";
import type { DiscountKind, OrganizationDiscountOverview, PriceBreakdown } from "@/types/platform";

export const segmentNames: Record<string, string> = { plantacoes: "Plantações", suinocultura: "Suinocultura", "gado-de-corte": "Gado de corte", "pecuaria-leiteira": "Pecuária leiteira", "area-veterinario": "Área do veterinário" };
export const discountKinds: Record<DiscountKind, string> = { percentage: "Percentual (%)", fixed_amount: "Valor em reais", fixed_price: "Preço final fixo", exemption: "Isenção total" };
const money = (value: string | number | null | undefined) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "Sem prazo";
const emptyForm = { kind: "percentage" as DiscountKind, value: "", segment_code: "", description: "", source: "manual" as "manual" | "campaign", duration: "indefinite" as "indefinite" | "months" | "until", months: "3", ends_at: "" };

export function PriceSummary({ price }: { price: PriceBreakdown | null | undefined }) {
  if (!price) return null;
  return <div className="platform-card mb-3">
    <div className="table-responsive"><table className="table platform-table mb-0">
      <caption className="visually-hidden">Composição do valor mensal</caption>
      <thead><tr><th>Segmento</th><th>Faixa</th><th className="text-end">Preço</th><th className="text-end">Após descontos do segmento</th></tr></thead>
      <tbody>{price.lines.map(line => <tr key={line.segment_code || line.name}><td className="fw-semibold">{segmentNames[line.segment_code] || line.name}</td><td className="small text-muted">{line.tier_label}</td><td className="text-end tabular-nums">{line.on_request ? "Sob consulta" : money(line.base)}</td><td className="text-end tabular-nums">{money(line.total)}</td></tr>)}</tbody>
      <tfoot>
        <tr><th colSpan={3}>Soma dos segmentos</th><td className="text-end tabular-nums">{money(price.gross)}</td></tr>
        <tr><th colSpan={3}>Descontos aplicados</th><td className="text-end tabular-nums">− {money(price.discount_total)}</td></tr>
        <tr><th colSpan={3}>Total mensal</th><td className="text-end tabular-nums fw-bold">{money(price.total)}</td></tr>
      </tfoot>
    </table></div>
  </div>;
}

export function OrganizationDiscountsSection({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const { showToast } = useToast();
  const [data, setData] = useState<OrganizationDiscountOverview | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    let active = true;
    platformService.organizationDiscounts(organizationId)
      .then(result => { if (active) { setData(result); setError(""); } })
      .catch(cause => { if (active) setError(getOrganizationErrorMessage(cause, "Não foi possível carregar os descontos.")); });
    return () => { active = false; };
  }, [organizationId, attempt]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      setData(await platformService.addOrganizationDiscount(organizationId, {
        kind: form.kind, value: form.kind === "exemption" ? "0" : form.value.replace(",", "."), segment_code: form.segment_code,
        description: form.description.trim(), source: form.source,
        months: form.duration === "months" ? Number(form.months) : null,
        ends_at: form.duration === "until" && form.ends_at ? new Date(`${form.ends_at}T23:59:59`).toISOString() : null,
      }));
      setForm(emptyForm); setFormOpen(false);
      showToast("Desconto aplicado. O valor mensal já foi recalculado.", "success");
    } catch (cause) {
      showToast(getOrganizationErrorMessage(cause, "Não foi possível aplicar o desconto."), "error");
    } finally { setBusy(false); }
  };
  const revoke = async (discountId: string, description: string) => {
    if (!window.confirm(`Encerrar o desconto "${description}" agora? O valor mensal volta a ser calculado sem ele.`)) return;
    setBusy(true);
    try { setData(await platformService.revokeOrganizationDiscount(organizationId, discountId)); showToast("Desconto encerrado.", "success"); }
    catch (cause) { showToast(getOrganizationErrorMessage(cause, "Não foi possível encerrar o desconto."), "error"); }
    finally { setBusy(false); }
  };

  if (error) return <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div>;
  if (!data) return <div className="py-4 text-center" role="status"><div className="spinner-border spinner-border-sm text-success"/><span className="ms-2">Carregando descontos…</span></div>;
  if (!data.subscription) return <div className="alert alert-warning">A organização não possui assinatura.</div>;
  const contracted = data.price?.lines.map(line => line.segment_code).filter(Boolean) || [];
  const needsValue = form.kind !== "exemption";

  return <section>
    <div className="platform-section-title"><h2>Descontos</h2><p>Somados em ordem: preço fixo do segmento → descontos do segmento → % da assinatura → valor da assinatura. Nunca fica negativo.</p></div>
    <PriceSummary price={data.price}/>
    {canManage && <div className="mb-3">{formOpen ? <form className="platform-card platform-form-card" onSubmit={submit}>
      <h2>Novo desconto</h2>
      <p>Manual ou de campanha. Cupons e indicações são aplicados automaticamente pelos próprios fluxos.</p>
      <div className="row g-3">
        <div className="col-md-4"><label className="form-label" htmlFor="discount-kind">Tipo</label><select id="discount-kind" className="form-select" value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value as DiscountKind })}>{Object.entries(discountKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        {needsValue && <div className="col-md-4"><label className="form-label" htmlFor="discount-value">{form.kind === "percentage" ? "Percentual" : form.kind === "fixed_price" ? "Preço final (R$)" : "Valor (R$)"}</label><input id="discount-value" className="form-control tabular-nums" inputMode="decimal" required value={form.value} onChange={event => setForm({ ...form, value: event.target.value })}/></div>}
        <div className="col-md-4"><label className="form-label" htmlFor="discount-scope">Aplicar em</label><select id="discount-scope" className="form-select" value={form.segment_code} onChange={event => setForm({ ...form, segment_code: event.target.value })}><option value="">Assinatura inteira</option>{contracted.map(code => <option key={code} value={code}>{segmentNames[code] || code}</option>)}</select></div>
        <div className="col-md-4"><label className="form-label" htmlFor="discount-duration">Duração</label><select id="discount-duration" className="form-select" value={form.duration} onChange={event => setForm({ ...form, duration: event.target.value as typeof form.duration })}><option value="indefinite">Sem prazo</option><option value="months">Por meses</option><option value="until">Até uma data</option></select></div>
        {form.duration === "months" && <div className="col-md-4"><label className="form-label" htmlFor="discount-months">Meses</label><input id="discount-months" type="number" min={1} max={120} className="form-control" value={form.months} onChange={event => setForm({ ...form, months: event.target.value })}/></div>}
        {form.duration === "until" && <div className="col-md-4"><label className="form-label" htmlFor="discount-until">Termina em</label><input id="discount-until" type="date" required className="form-control" value={form.ends_at} onChange={event => setForm({ ...form, ends_at: event.target.value })}/></div>}
        <div className="col-md-4"><label className="form-label" htmlFor="discount-source">Origem</label><select id="discount-source" className="form-select" value={form.source} onChange={event => setForm({ ...form, source: event.target.value as "manual" | "campaign" })}><option value="manual">Manual</option><option value="campaign">Campanha</option></select></div>
        <div className="col-12"><label className="form-label" htmlFor="discount-description">Motivo (aparece para o cliente e na auditoria)</label><input id="discount-description" className="form-control" required maxLength={255} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })}/></div>
      </div>
      <div className="platform-form-footer"><button type="button" className="btn btn-outline-secondary" onClick={() => setFormOpen(false)} disabled={busy}>Cancelar</button><button className="btn btn-success" disabled={busy || !form.description.trim() || (needsValue && !form.value.trim())}>{busy ? "Aplicando…" : "Aplicar desconto"}</button></div>
    </form> : <button className="btn btn-success btn-sm" onClick={() => setFormOpen(true)}>Novo desconto</button>}</div>}
    <div className="platform-card overflow-hidden">
      {data.discounts.length ? <div className="table-responsive"><table className="table platform-table mb-0">
        <thead><tr><th>Desconto</th><th>Tipo</th><th>Alcance</th><th>Vigência</th><th>Situação</th><th/></tr></thead>
        <tbody>{data.discounts.map(row => <tr key={row.id}>
          <td><div className="fw-semibold">{row.description}</div><div className="small text-muted">{row.source_display}{row.coupon_code ? ` · ${row.coupon_code}` : ""}{!row.cumulative ? " · não cumulativo" : ""}{row.created_by_name ? ` · por ${row.created_by_name}` : ""}</div></td>
          <td className="tabular-nums">{row.kind === "percentage" ? `${Number(row.value)}%` : row.kind === "exemption" ? "Isenção" : `${row.kind === "fixed_price" ? "Fixo " : "− "}${money(row.value)}`}</td>
          <td>{row.segment_code ? segmentNames[row.segment_code] || row.segment_code : "Assinatura"}</td>
          <td className="small tabular-nums">{date(row.starts_at)} → {date(row.ends_at)}</td>
          <td><span className={`platform-pill ${row.is_active ? "success" : ""}`}>{row.revoked_at ? "Encerrado" : row.is_active ? "Em vigor" : "Fora de vigência"}</span></td>
          <td className="text-end">{canManage && !row.revoked_at && <button className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => void revoke(row.id, row.description)}>Encerrar</button>}</td>
        </tr>)}</tbody>
      </table></div> : <p className="p-3 mb-0 text-muted">Nenhum desconto cadastrado.</p>}
    </div>
  </section>;
}
