"use client";

import { useEffect, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import { platformService } from "@/services/platformApi";
import type { OrganizationSegment, OrganizationSegmentOverview } from "@/types/platform";
import { PriceSummary } from "@/components/platform/OrganizationDiscountsSection";

const money = (value: string | null) => value === null ? "Sob consulta" : Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function SegmentRow({ segment, canManage, busy, onChange }: {
  segment: OrganizationSegment; canManage: boolean; busy: boolean;
  onChange: (payload: { segment_code: string; contracted: boolean; tier?: string; quantity?: number | null; final_monthly_price?: string | null; reason?: string }) => Promise<void>;
}) {
  const [tier, setTier] = useState(segment.item?.tier || segment.tiers[0]?.id || "");
  const [quantity, setQuantity] = useState("");
  const pickByQuantity = (value: string) => {
    setQuantity(value);
    const amount = Number(value);
    if (!value || Number.isNaN(amount)) return;
    const match = segment.tiers.find(row => (row.minimum_quantity === null || amount >= row.minimum_quantity) && (row.maximum_quantity === null || amount <= row.maximum_quantity));
    if (match) setTier(match.id);
  };
  const [price, setPrice] = useState(segment.item?.final_monthly_price ?? "");
  const [reason, setReason] = useState("");
  const selectedTier = segment.tiers.find(row => row.id === tier);
  const submit = (contracted: boolean) => {
    if (!contracted && !window.confirm(`Remover ${segment.name} da assinatura? Os usuários perdem o acesso a esta área imediatamente; os dados são preservados.`)) return;
    void onChange({ segment_code: segment.code, contracted, tier, quantity: quantity === "" ? null : Number(quantity), final_monthly_price: price.trim() === "" ? null : price.replace(",", "."), reason: reason.trim() }).then(() => setReason(""));
  };
  return <div className="platform-segment-row">
    <div>
      <h3>{segment.name}</h3>
      <div className="small mb-2">{segment.subtitle}</div>
      <span className={`platform-pill ${segment.contracted ? "success" : ""}`}>{segment.contracted ? "Contratado" : "Não contratado"}</span>
      {segment.item && <div className="small mt-2 tabular-nums">{segment.item.tier_label} · {money(segment.item.final_monthly_price)}/mês</div>}
    </div>
    {canManage ? <div className="platform-segment-controls">
      {segment.metric_label && <div>
        <label className="form-label small mb-1" htmlFor={`quantity-${segment.code}`}>Quantidade ({segment.metric_label})</label>
        <input id={`quantity-${segment.code}`} type="number" min={0} className="form-control form-control-sm tabular-nums" value={quantity} disabled={busy} onChange={event => pickByQuantity(event.target.value)}/>
      </div>}
      <div>
        <label className="form-label small mb-1" htmlFor={`tier-${segment.code}`}>Faixa</label>
        <select id={`tier-${segment.code}`} className="form-select form-select-sm" value={tier} disabled={busy || !segment.tiers.length} onChange={event => setTier(event.target.value)}>
          {segment.tiers.length ? segment.tiers.map(row => <option key={row.id} value={row.id}>{row.label} · {money(row.monthly_price)}</option>) : <option value="">Sem faixa ativa</option>}
        </select>
      </div>
      <div>
        <label className="form-label small mb-1" htmlFor={`price-${segment.code}`}>Valor mensal negociado (R$)</label>
        <input id={`price-${segment.code}`} className="form-control form-control-sm tabular-nums" inputMode="decimal" placeholder={selectedTier?.monthly_price ?? "Sob consulta"} value={price} disabled={busy} onChange={event => setPrice(event.target.value)}/>
      </div>
      <div style={{ flexBasis: "100%" }}>
        <label className="form-label small mb-1" htmlFor={`reason-${segment.code}`}>Motivo (registrado na auditoria)</label>
        <input id={`reason-${segment.code}`} className="form-control form-control-sm" maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)}/>
      </div>
      <div className="d-flex gap-2" style={{ flex: "0 0 auto", minWidth: 0 }}>
        <button type="button" className="btn btn-sm btn-success" disabled={busy || !tier} onClick={() => submit(true)}>{segment.contracted ? "Atualizar" : "Contratar"}</button>
        {segment.contracted && <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => submit(false)}>Remover</button>}
      </div>
    </div> : <p className="small text-muted mb-0">Somente administradores da plataforma alteram os segmentos contratados.</p>}
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

  const change = async (payload: Parameters<typeof platformService.changeOrganizationSegment>[1]) => {
    setBusy(true);
    try {
      setData(await platformService.changeOrganizationSegment(organizationId, payload));
      showToast(payload.contracted ? "Segmento contratado/atualizado. O acesso já está liberado para a organização." : "Segmento removido da assinatura.", "success");
    } catch (cause) {
      showToast(getOrganizationErrorMessage(cause, "Não foi possível alterar o segmento."), "error");
      throw cause;
    } finally { setBusy(false); }
  };

  if (error) return <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div>;
  if (!data) return <div className="py-4 text-center" role="status"><div className="spinner-border spinner-border-sm text-success"/><span className="ms-2">Carregando segmentos…</span></div>;

  return <section>
    <div className="platform-section-title"><h2>Segmentos contratados</h2><p>Liberam as áreas do sistema (ex.: Área do veterinário) para a organização.</p></div>
    <PriceSummary price={data.price}/>
    {!data.subscription ? <div className="alert alert-warning">A organização não possui assinatura. Crie a assinatura antes de contratar segmentos.</div> : <>
      <p className="small text-muted">Assinatura: {data.subscription.status_display}. Segmentos só ficam disponíveis com a assinatura em teste, ativa ou com pagamento pendente. A organização mantém ao menos um segmento; o valor mensal é a soma dos segmentos menos os descontos. Ao remover um segmento, os membros perdem o acesso a ele.</p>
      <div className="platform-card">{data.segments.length ? data.segments.map(segment => <SegmentRow key={`${segment.code}-${segment.item?.tier ?? "none"}-${segment.item?.final_monthly_price ?? ""}`} segment={segment} canManage={canManage} busy={busy} onChange={payload => change(payload).catch(() => undefined)}/>) : <p className="p-3 text-muted mb-0">Nenhum segmento ativo no catálogo.</p>}</div>
    </>}
  </section>;
}
