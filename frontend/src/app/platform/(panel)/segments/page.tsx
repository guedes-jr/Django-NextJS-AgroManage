"use client";

import { useEffect, useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { usePlatformCanManage } from "@/components/platform/usePlatformRole";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import { platformService } from "@/services/platformApi";
import type { SegmentCatalogEntry, SegmentCatalogTier } from "@/types/platform";

const money = (value: string | null) => value === null || value === "" ? "Sob consulta" : Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const blankTier = (): SegmentCatalogTier => ({ label: "", minimum_quantity: null, maximum_quantity: null, monthly_price: "", requires_quote: false, is_active: true });
const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);

function SegmentEditor({ segment, canManage, onSaved }: { segment: SegmentCatalogEntry; canManage: boolean; onSaved: (segment: SegmentCatalogEntry) => void }) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState(segment);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(segment);
  const setTier = (index: number, patch: Partial<SegmentCatalogTier>) => setDraft(current => ({ ...current, tiers: current.tiers.map((tier, position) => position === index ? { ...tier, ...patch } : tier) }));

  const save = async () => {
    setSaving(true);
    try {
      const saved = await platformService.saveSegmentCatalog(segment.id, {
        name: draft.name, subtitle: draft.subtitle, metric_label: draft.metric_label, annual_discount_percent: draft.annual_discount_percent,
        is_public: draft.is_public,
        tiers: draft.tiers.map((tier, index) => ({ ...tier, sort_order: (index + 1) * 10, monthly_price: tier.requires_quote || tier.monthly_price === "" ? null : String(tier.monthly_price).replace(",", ".") })),
      });
      onSaved(saved); setDraft(saved);
      showToast(`Preços de ${saved.name} atualizados. Novas contratações usam a tabela nova; contratos existentes mantêm o valor até serem atualizados.`, "success");
    } catch (error) {
      showToast(getOrganizationErrorMessage(error, "Não foi possível salvar o segmento."), "error");
    } finally { setSaving(false); }
  };

  return <section className="platform-card platform-form-card mb-3" aria-labelledby={`segment-${segment.code}`}>
    <div className="d-flex flex-wrap justify-content-between gap-2 mb-2">
      <div><h2 id={`segment-${segment.code}`}>{segment.name}</h2><p className="mb-0">{segment.contracted_count} contrato(s) usam este segmento · código <code>{segment.code}</code></p></div>
      <span className={`platform-pill ${segment.is_public ? "success" : ""}`}>{segment.is_public ? "Na landing page" : "Oculto na landing page"}</span>
    </div>
    <div className="row g-3 mt-1">
      <div className="col-md-4"><label className="form-label" htmlFor={`name-${segment.code}`}>Nome</label><input id={`name-${segment.code}`} className="form-control" value={draft.name} disabled={!canManage} onChange={event => setDraft({ ...draft, name: event.target.value })}/></div>
      <div className="col-md-4"><label className="form-label" htmlFor={`metric-${segment.code}`}>Unidade da quantidade</label><input id={`metric-${segment.code}`} className="form-control" placeholder="animais, matrizes, hectares" value={draft.metric_label} disabled={!canManage} onChange={event => setDraft({ ...draft, metric_label: event.target.value })}/></div>
      <div className="col-md-2"><label className="form-label" htmlFor={`annual-${segment.code}`}>Desconto anual (%)</label><input id={`annual-${segment.code}`} className="form-control tabular-nums" inputMode="decimal" value={draft.annual_discount_percent} disabled={!canManage} onChange={event => setDraft({ ...draft, annual_discount_percent: event.target.value })}/></div>
      <div className="col-md-2 d-flex align-items-end"><div className="form-check"><input id={`public-${segment.code}`} type="checkbox" className="form-check-input" checked={draft.is_public} disabled={!canManage} onChange={event => setDraft({ ...draft, is_public: event.target.checked })}/><label htmlFor={`public-${segment.code}`} className="form-check-label">Mostrar na landing</label></div></div>
    </div>
    <h3 className="h6 fw-bold mt-4 mb-2">Faixas de preço por quantidade de {draft.metric_label || "unidades"}</h3>
    <div className="table-responsive"><table className="table platform-table mb-0">
      <thead><tr><th>Faixa</th><th>De</th><th>Até</th><th>Preço mensal (R$)</th><th>Sob consulta</th><th>Ativa</th><th/></tr></thead>
      <tbody>{draft.tiers.map((tier, index) => <tr key={tier.id || `new-${index}`}>
        <td><input aria-label="Nome da faixa" className="form-control form-control-sm" value={tier.label} disabled={!canManage} placeholder="Ex.: 51 a 200 animais" onChange={event => setTier(index, { label: event.target.value })}/></td>
        <td><input aria-label="Quantidade mínima" type="number" min={0} className="form-control form-control-sm tabular-nums" value={tier.minimum_quantity ?? ""} disabled={!canManage} onChange={event => setTier(index, { minimum_quantity: numberOrNull(event.target.value) })}/></td>
        <td><input aria-label="Quantidade máxima" type="number" min={0} className="form-control form-control-sm tabular-nums" placeholder="sem limite" value={tier.maximum_quantity ?? ""} disabled={!canManage} onChange={event => setTier(index, { maximum_quantity: numberOrNull(event.target.value) })}/></td>
        <td><input aria-label="Preço mensal" className="form-control form-control-sm tabular-nums" inputMode="decimal" value={tier.requires_quote ? "" : tier.monthly_price ?? ""} disabled={!canManage || tier.requires_quote} placeholder={tier.requires_quote ? "Sob consulta" : "0,00"} onChange={event => setTier(index, { monthly_price: event.target.value })}/></td>
        <td><input aria-label="Sob consulta" type="checkbox" className="form-check-input" checked={tier.requires_quote} disabled={!canManage} onChange={event => setTier(index, { requires_quote: event.target.checked })}/></td>
        <td><input aria-label="Faixa ativa" type="checkbox" className="form-check-input" checked={tier.is_active} disabled={!canManage} onChange={event => setTier(index, { is_active: event.target.checked })}/></td>
        <td className="text-end">{canManage && <button type="button" className="btn btn-outline-danger btn-sm" aria-label={`Remover faixa ${tier.label}`} onClick={() => setDraft({ ...draft, tiers: draft.tiers.filter((_, position) => position !== index) })}><Trash2 size={14}/></button>}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="small text-muted mt-2 mb-0">Faixas usadas em contratos são desativadas em vez de apagadas. Prévia: {draft.tiers.filter(tier => tier.is_active).map(tier => `${tier.label || "sem nome"} ${money(tier.requires_quote ? null : String(tier.monthly_price ?? ""))}`).join(" · ") || "nenhuma faixa ativa"}.</p>
    {canManage && <div className="platform-form-footer">
      <button type="button" className="btn btn-outline-secondary" onClick={() => setDraft({ ...draft, tiers: [...draft.tiers, blankTier()] })}><Plus size={15}/>Adicionar faixa</button>
      <button type="button" className="btn btn-outline-secondary" disabled={!dirty || saving} onClick={() => setDraft(segment)}>Descartar</button>
      <button type="button" className="btn btn-success" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Salvando…" : "Salvar preços"}</button>
    </div>}
  </section>;
}

export default function PlatformSegmentsPage() {
  const canManage = usePlatformCanManage();
  const [segments, setSegments] = useState<SegmentCatalogEntry[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    platformService.segmentCatalog()
      .then(result => { if (active) { setSegments(result); setError(""); } })
      .catch(cause => { if (active) setError(getOrganizationErrorMessage(cause, "Não foi possível carregar os segmentos.")); });
    return () => { active = false; };
  }, [attempt]);

  return <div className="platform-management">
    <div className="platform-page-header">
      <div><div className="platform-label">Oferta comercial</div><h1>Segmentos e preços</h1><p>Cada segmento tem faixas de preço pela quantidade (animais, matrizes, hectares). A landing page e a ficha das organizações usam esta tabela.</p></div>
      <span className="platform-pill success"><Layers size={14}/>{segments?.length ?? 0} segmentos</span>
    </div>
    {!canManage && <div className="alert alert-info py-2 small">Somente leitura: administradores da plataforma alteram os preços.</div>}
    {error ? <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div>
      : !segments ? <div className="py-5 text-center" role="status"><div className="spinner-border text-success"/></div>
      : segments.map(segment => <SegmentEditor key={segment.id} segment={segment} canManage={canManage} onSaved={saved => setSegments(list => list?.map(item => item.id === saved.id ? saved : item) || null)}/>)}
  </div>;
}
