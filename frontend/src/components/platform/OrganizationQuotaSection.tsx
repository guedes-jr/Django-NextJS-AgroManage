"use client";

import { FormEvent, useEffect, useState } from "react";
import { platformService } from "@/services/platformApi";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import type { OrganizationQuotaOverrides, OrganizationQuotaResource, OrganizationQuotaUsage, PlatformOrganization } from "@/types/platform";

const resources: {key: OrganizationQuotaResource; field: "max_users" | "max_farms" | "max_storage_mb"; label: string}[] = [
  {key: "users", field: "max_users", label: "Usuários e convites"},
  {key: "farms", field: "max_farms", label: "Fazendas ativas"},
  {key: "storage", field: "max_storage_mb", label: "Armazenamento"},
];
const amount = (value: number, storage: boolean) => storage ? `${(value / (1024 * 1024)).toLocaleString("pt-BR", {maximumFractionDigits: 2})} MB` : value.toLocaleString("pt-BR");
const statuses = {normal: "Disponível", warning: "Próximo do limite", at_limit: "Limite atingido", over_limit: "Acima do limite"};
type Mode = "plan" | "custom" | "unlimited";

function QuotaEditor({ id, usage, saved, cancel }: {id: string; usage: OrganizationQuotaUsage; saved: (usage: OrganizationQuotaUsage) => void; cancel: () => void}) {
  const [modes, setModes] = useState<Record<OrganizationQuotaResource, Mode>>(() => Object.fromEntries(resources.map(({key}) => [key, usage.resources[key].source === "plan" ? "plan" : usage.resources[key].limit === null ? "unlimited" : "custom"])) as Record<OrganizationQuotaResource, Mode>);
  const [values, setValues] = useState(() => Object.fromEntries(resources.map(({key}) => [key, String(usage.resources[key].limit ?? 0)])) as Record<OrganizationQuotaResource, string>);
  const [threshold, setThreshold] = useState(String(usage.warning_threshold_percent));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const payload: OrganizationQuotaOverrides = {inherit: []};
    for (const {key, field} of resources) {
      if (modes[key] === "plan") payload.inherit!.push(field);
      else payload[field] = modes[key] === "unlimited" ? null : Number(values[key]);
    }
    if (Number(threshold) !== usage.warning_threshold_percent) payload.warning_threshold_percent = Number(threshold);
    setSaving(true);
    setError("");
    try { saved(await platformService.updateOrganizationLimits(id, payload)); }
    catch (reason) { setError(getOrganizationErrorMessage(reason, "Não foi possível salvar as cotas.")); }
    finally { setSaving(false); }
  };
  return <form className="platform-card p-4" onSubmit={submit}>
    <h3 className="h5">Exceções desta organização</h3><p className="text-muted">Reduzir uma cota preserva os registros existentes e impede apenas novos aumentos de consumo.</p>
    <fieldset disabled={saving}>
      {resources.map(({key, label}) => <div className="row g-2 mb-3" key={key}><div className="col-md-6"><label className="form-label" htmlFor={`quota-mode-${key}`}>{label}</label><select className="form-select" id={`quota-mode-${key}`} value={modes[key]} onChange={event => setModes({...modes, [key]: event.target.value as Mode})}><option value="plan">Herdar do plano</option><option value="custom">Limite específico</option><option value="unlimited">Sem limite</option></select></div>{modes[key] === "custom" && <div className="col-md-6"><label className="form-label" htmlFor={`quota-value-${key}`}>{key === "storage" ? "Limite em MB" : "Quantidade"}</label><input className="form-control" id={`quota-value-${key}`} type="number" min={0} max={2147483647} step={1} required value={values[key]} onChange={event => setValues({...values, [key]: event.target.value})}/></div>}</div>)}
      <label className="form-label" htmlFor="quota-threshold">Avisar a partir de (%)</label><input id="quota-threshold" type="number" min={1} max={100} step={1} required className="form-control mb-3" value={threshold} onChange={event => setThreshold(event.target.value)}/>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="d-flex gap-2"><button className="btn btn-success">{saving ? "Salvando…" : "Salvar exceções"}</button><button type="button" className="btn btn-outline-secondary" onClick={cancel}>Cancelar</button></div>
    </fieldset>
  </form>;
}

export function OrganizationQuotaSection({organization}: {organization: PlatformOrganization}) {
  const [usage, setUsage] = useState<OrganizationQuotaUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    platformService.organizationUsage(organization.id).then(value => {if (active) {setUsage(value); setError("");}})
      .catch(reason => {if (active) setError(getOrganizationErrorMessage(reason, "Não foi possível carregar o consumo."));})
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [organization.id, attempt]);
  const reconcile = async () => {
    setBusy(true); setError(""); setNotice("");
    try {setUsage(await platformService.reconcileOrganizationStorage(organization.id)); setNotice("Armazenamento reconciliado.");}
    catch (reason) {setError(getOrganizationErrorMessage(reason, "Não foi possível reconciliar o armazenamento."));}
    finally {setBusy(false);}
  };
  const reset = async () => {
    setBusy(true); setError(""); setNotice("");
    try {setUsage(await platformService.updateOrganizationLimits(organization.id, {inherit: ["max_users", "max_farms", "max_storage_mb", "warning_threshold_percent"]})); setNotice("Cotas restauradas para os valores do plano.");}
    catch (reason) {setError(getOrganizationErrorMessage(reason, "Não foi possível restaurar as cotas."));}
    finally {setBusy(false);}
  };
  if (loading) return <p role="status">Carregando consumo e limites…</p>;
  return <div className="d-flex flex-column gap-3">
    {error && <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={() => {setLoading(true); setAttempt(value => value + 1);}}>Tentar novamente</button></div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    {usage && <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2"><div><h2 className="h5">Consumo e limites</h2><div className="small text-muted">Plano: {usage.plan_name || "Não cadastrado"} · Aviso a partir de {usage.warning_threshold_percent}%</div></div><div className="d-flex flex-wrap gap-2"><button className="btn btn-outline-secondary" disabled={busy || editing} onClick={() => {setLoading(true); setAttempt(value => value + 1);}}>Atualizar</button>{organization.can_manage && <><button className="btn btn-outline-secondary" disabled={busy || editing} onClick={() => setEditing(true)}>Configurar exceções</button><button className="btn btn-outline-secondary" disabled={busy || editing} onClick={() => void reset()}>Herdar cotas do plano</button></>}</div></div>
      <div className="row g-3">{resources.map(({key, label}) => {
        const metric = usage.resources[key];
        return <div className="col-lg-4" key={key}><article className="platform-card p-4 h-100"><h3 className="h6">{label}</h3><div className="fs-4 fw-bold">{amount(metric.used, key === "storage")} <span className="fs-6 text-muted">/ {metric.capacity === null ? "Sem limite" : amount(metric.capacity, key === "storage")}</span></div><div className="small text-muted my-2">{metric.source === "override" ? "Exceção da organização" : "Limite do plano"}</div><div className={`badge ${metric.status === "normal" ? "text-bg-success" : metric.status === "warning" ? "text-bg-warning" : "text-bg-danger"}`}>{statuses[metric.status]}</div>{metric.percent !== null && <div className="progress mt-3" role="progressbar" aria-label={`Consumo de ${label}`} aria-valuenow={Math.min(metric.percent,100)} aria-valuemin={0} aria-valuemax={100}><div className={`progress-bar ${metric.status === "normal" ? "bg-success" : "bg-warning"}`} style={{width: `${Math.min(metric.percent,100)}%`}}/></div>}{key === "users" && <p className="small text-muted mb-0 mt-3">{usage.active_users} ativos + {usage.reserved_users} convites reservados. Equipe interna excluída.</p>}</article></div>;
      })}</div>
      <p className="small text-muted mb-0">Usuários ativos e convites válidos ocupam vagas. A expiração ou revogação libera a reserva do convite. Fazendas inativas não ocupam cota. Arquivos permanecem contabilizados enquanto estiverem vinculados aos registros.</p>
      <section className="platform-card p-3"><h3 className="h6">Conferência do armazenamento</h3><p className="small text-muted">Última reconciliação: {new Date(usage.storage.reconciled_at).toLocaleString("pt-BR")}</p>{usage.storage.unknown_files > 0 && <p className="text-danger">{usage.storage.unknown_files} arquivos não puderam ser medidos. Novos aumentos de armazenamento com cota definida aguardam reconciliação.</p>}{usage.storage.missing_files > 0 && <p className="text-warning">{usage.storage.missing_files} referências apontam para arquivos ausentes na última conferência.</p>}{organization.can_manage && <button className="btn btn-outline-secondary" disabled={busy || editing} onClick={() => void reconcile()}>{busy ? "Processando…" : "Reconciliar armazenamento"}</button>}</section>
      {editing && <QuotaEditor id={organization.id} usage={usage} cancel={() => setEditing(false)} saved={value => {setUsage(value); setEditing(false); setNotice("Exceções de cotas atualizadas.");}}/>}
    </>}
  </div>;
}
