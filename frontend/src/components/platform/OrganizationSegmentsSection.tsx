"use client";

import { useEffect, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import { platformService } from "@/services/platformApi";
import type { OrganizationSegment, OrganizationSegmentOverview } from "@/types/platform";
import { PriceSummary } from "@/components/platform/OrganizationDiscountsSection";

const money = (value: string | null) => value === null ? "Sob consulta" : Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type SegmentChange = { segment_code: string; contracted: boolean; active?: boolean | null; tier?: string; quantity?: number | null; final_monthly_price?: string | null; reason?: string; confirm_finance_removal?: boolean };

function SegmentRow({ segment, canManage, busy, onChange }: {
  segment: OrganizationSegment; canManage: boolean; busy: boolean;
  onChange: (payload: SegmentChange) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [tier, setTier] = useState(segment.item?.tier || segment.tiers[0]?.id || "");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState(segment.item?.final_monthly_price ?? "");
  const [reason, setReason] = useState("");
  const selectedTier = segment.tiers.find(row => row.id === tier);
  const state = !segment.contracted ? "Não contratado" : segment.active ? "Ativo" : "Inativo";
  const pickByQuantity = (value: string) => {
    setQuantity(value);
    const amount = Number(value);
    if (!value || Number.isNaN(amount)) return;
    const match = segment.tiers.find(row => (row.minimum_quantity === null || amount >= row.minimum_quantity) && (row.maximum_quantity === null || amount <= row.maximum_quantity));
    if (match) setTier(match.id);
  };
  const save = async () => {
    const ok = await onChange({ segment_code: segment.code, contracted: true, tier, quantity: quantity === "" ? null : Number(quantity), final_monthly_price: price.trim() === "" ? null : price.replace(",", "."), reason: reason.trim() });
    if (ok) { setEditing(false); setReason(""); }
  };
  const toggle = async (active: boolean) => {
    if (!active && !window.confirm(`Inativar ${segment.name}? A área some para a organização, ninguém registra dados nela e deixa de ser cobrada. Os lançamentos financeiros do segmento são arquivados DEFINITIVAMENTE (só a auditoria os vê; não voltam ao reativar). Animais, plantações e manejos ficam guardados.`)) return;
    await onChange({ segment_code: segment.code, contracted: true, active, reason: reason.trim(), confirm_finance_removal: !active });
  };
  const remove = async () => {
    if (!window.confirm(`Remover ${segment.name} da assinatura? Os membros perdem a liberação desta área, o valor negociado é descartado e os lançamentos financeiros do segmento são arquivados DEFINITIVAMENTE. Os dados operacionais ficam guardados. Para pausar mantendo o preço, prefira Inativar.`)) return;
    await onChange({ segment_code: segment.code, contracted: false, reason: reason.trim(), confirm_finance_removal: true });
  };
  return <div className={`platform-segment-row ${segment.contracted && !segment.active ? "is-inactive" : ""}`}>
    <div className="platform-segment-summary">
      <div>
        <h3>{segment.name}</h3>
        <div className="small">{segment.subtitle}</div>
      </div>
      <span className={`platform-pill ${segment.active ? "success" : segment.contracted ? "warning" : ""}`}>{state}</span>
      <div className="small tabular-nums">{segment.item ? `${segment.item.tier_label} · ${money(segment.item.final_monthly_price)}/mês` : "—"}{segment.item?.deactivated_at && <div className="text-muted">Inativo desde {new Date(segment.item.deactivated_at).toLocaleDateString("pt-BR")}</div>}</div>
      {canManage && <div className="platform-actions justify-content-end">
        {segment.contracted && <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} aria-expanded={editing} onClick={() => setEditing(value => !value)}>{editing ? "Fechar" : "Editar"}</button>}
        {segment.contracted && segment.active && <button type="button" className="btn btn-sm btn-outline-warning" disabled={busy} onClick={() => void toggle(false)}>Inativar</button>}
        {segment.contracted && !segment.active && <button type="button" className="btn btn-sm btn-success" disabled={busy} onClick={() => void toggle(true)}>Reativar</button>}
        {!segment.contracted && <button type="button" className="btn btn-sm btn-success" disabled={busy} onClick={() => setEditing(true)}>Contratar</button>}
      </div>}
    </div>
    {canManage && editing && <div className="platform-segment-controls">
      {segment.metric_label && <div>
        <label className="form-label small mb-1" htmlFor={`quantity-${segment.code}`}>Quantidade ({segment.metric_label})</label>
        <input id={`quantity-${segment.code}`} type="number" min={0} className="form-control form-control-sm tabular-nums" value={quantity} disabled={busy} onChange={event => pickByQuantity(event.target.value)}/>
      </div>}
      <div className="platform-segment-tier">
        <label className="form-label small mb-1" htmlFor={`tier-${segment.code}`}>Faixa</label>
        <select id={`tier-${segment.code}`} className="form-select form-select-sm" value={tier} disabled={busy || !segment.tiers.length} onChange={event => setTier(event.target.value)}>
          {segment.tiers.length ? segment.tiers.map(row => <option key={row.id} value={row.id}>{row.label} · {money(row.monthly_price)}</option>) : <option value="">Sem faixa ativa</option>}
        </select>
      </div>
      <div>
        <label className="form-label small mb-1" htmlFor={`price-${segment.code}`}>Valor negociado (R$/mês)</label>
        <input id={`price-${segment.code}`} className="form-control form-control-sm tabular-nums" inputMode="decimal" placeholder={selectedTier?.monthly_price ?? "Sob consulta"} value={price} disabled={busy} onChange={event => setPrice(event.target.value)}/>
      </div>
      <div style={{ flexBasis: "100%" }}>
        <label className="form-label small mb-1" htmlFor={`reason-${segment.code}`}>Motivo (registrado na auditoria)</label>
        <input id={`reason-${segment.code}`} className="form-control form-control-sm" maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)}/>
      </div>
      <div className="platform-actions">
        <button type="button" className="btn btn-sm btn-success" disabled={busy || !tier} onClick={() => void save()}>{segment.contracted ? "Salvar" : "Contratar"}</button>
        {segment.contracted && <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => void remove()}>Remover da assinatura</button>}
      </div>
    </div>}
  </div>;
}

export function OrganizationSegmentsSection({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const { showToast } = useToast();
  const [data, setData] = useState<OrganizationSegmentOverview | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    platformService.organizationSegments(organizationId)
      .then(result => { if (active) { setData(result); setError(""); } })
      .catch(cause => { if (active) setError(getOrganizationErrorMessage(cause, "Não foi possível carregar os segmentos.")); });
    return () => { active = false; };
  }, [organizationId, attempt]);

  const change = async (payload: SegmentChange) => {
    setBusy(true);
    try {
      setData(await platformService.changeOrganizationSegment(organizationId, payload));
      showToast(payload.active === false ? "Segmento inativado. Não aparece mais nem é cobrado." : payload.active ? "Segmento reativado com a faixa e o valor anteriores." : payload.contracted ? "Segmento salvo. O acesso segue o contrato." : "Segmento removido da assinatura.", "success");
      return true;
    } catch (cause) {
      showToast(getOrganizationErrorMessage(cause, "Não foi possível alterar o segmento."), "error");
      return false;
    } finally { setBusy(false); }
  };

  if (error) return <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div>;
  if (!data) return <div className="py-4 text-center" role="status"><div className="spinner-border spinner-border-sm text-success"/><span className="ms-2">Carregando segmentos…</span></div>;

  return <section>
    <div className="platform-section-title"><h2>Segmentos contratados</h2><p>Liberam as áreas do sistema (ex.: Área do veterinário) para a organização.</p></div>
    <PriceSummary price={data.price}/>
    {!data.subscription ? <div className="alert alert-warning">A organização não possui assinatura. Crie a assinatura antes de contratar segmentos.</div> : <>
      <p className="small text-muted">Assinatura: {data.subscription.status_display}. Segmentos só ficam disponíveis com a assinatura em teste, ativa ou com pagamento pendente. A organização mantém ao menos um segmento; o valor mensal é a soma dos segmentos menos os descontos. Ao remover um segmento, os membros perdem o acesso a ele.</p>
      <div className="platform-card">{data.segments.length ? data.segments.map(segment => <SegmentRow key={`${segment.code}-${segment.item?.tier ?? "none"}-${segment.item?.final_monthly_price ?? ""}-${segment.active}`} segment={segment} canManage={canManage} busy={busy} onChange={change}/>) : <p className="p-3 text-muted mb-0">Nenhum segmento ativo no catálogo.</p>}</div>
      {!!data.events?.length && <div className="platform-card mt-3">
        <h3 className="h6 fw-bold mb-2">Histórico de segmentos (auditoria)</h3>
        <ul className="list-unstyled small mb-0">{data.events.map(event => <li key={`${event.segment_code}-${event.occurred_at}`} className="py-1 border-bottom">
          <strong>{data.segments.find(row => row.code === event.segment_code)?.name ?? event.segment_code}</strong> · {event.action === "deactivated" ? "Removido" : "Ativado"} em {new Date(event.occurred_at).toLocaleString("pt-BR")}{event.actor ? ` por ${event.actor}` : ""}
          {event.action === "deactivated" && <span className="text-muted"> · {event.archived_transactions} lançamento(s) arquivado(s) (receitas {money(event.archived_revenue)}; despesas {money(event.archived_expense)}){event.invoice_adjustment === "kept_gateway" ? " · fatura já enviada ao gateway: ajustar manualmente" : event.invoice_adjustment ? ` · próxima fatura: ${event.invoice_adjustment}` : ""}</span>}
        </li>)}</ul>
      </div>}
    </>}
  </section>;
}
