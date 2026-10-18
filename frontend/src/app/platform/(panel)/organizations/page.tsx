"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Building2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { adoptionLabels } from "@/components/platform/OrganizationAdoptionSection";
import { OrganizationFormModal } from "@/components/platform/OrganizationFormModal";
import { OrganizationBatchPanel, batchActions } from "@/components/platform/OrganizationBatchPanel";
import { PLATFORM_STAFF, platformService } from "@/services/platformApi";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import type { PaginatedResponse } from "@/types";
import type { OrganizationBatch, OrganizationBatchAction, PlatformOrganizationPage, PlatformStaff } from "@/types/platform";

export default function PlatformOrganizationsPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const [data, setData] = useState<PlatformOrganizationPage | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [allMatching, setAllMatching] = useState(false);
  const [action, setAction] = useState<OrganizationBatchAction>("export");
  const [reason, setReason] = useState("");
  const [batch, setBatch] = useState<OrganizationBatch | null>(null);
  const [history, setHistory] = useState<PaginatedResponse<OrganizationBatch> | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyError, setHistoryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [canManage] = useState(() => {
    if (typeof window === "undefined") return false;
    try { const role = (JSON.parse(localStorage.getItem(PLATFORM_STAFF) || "{}") as PlatformStaff).role; return role === "platform_owner" || role === "platform_admin"; }
    catch { return false; }
  });
  const refresh = useCallback(() => { setRefreshKey(value => value + 1); }, []);
  useEffect(() => {
    let active = true;
    platformService.organizations({ ...filters, page }).then(result => { if (active) { setData(result); setError(""); } })
      .catch(cause => { if (active) { setData(null); setError(getOrganizationErrorMessage(cause, "Não foi possível carregar as organizações.")); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, page, refreshKey]);
  useEffect(() => {
    let active = true;
    platformService.organizationBatches(historyPage).then(result => { if (active) { setHistory(result); setHistoryError(""); } })
      .catch(() => { if (active) setHistoryError("Não foi possível carregar o histórico de lotes."); });
    return () => { active = false; };
  }, [historyPage, refreshKey]);
  const submit = (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setPage(1); setSelected([]); setAllMatching(false);
    setFilters(Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value !== "")));
  };
  const prepare = async () => {
    setBusy(true); setError("");
    try {
      setBatch(await platformService.prepareOrganizationBatch({ action, reason, ...(allMatching ? { all_matching: true, filters } : { ids: selected }) }));
      refresh();
    } catch (cause) { setError(getOrganizationErrorMessage(cause, "Não foi possível preparar o lote.")); }
    finally { setBusy(false); }
  };
  const input = (key: string, label: string, type = "text") => <div className="col-sm-6 col-lg-3"><label className="form-label small" htmlFor={`org-${key}`}>{label}</label><input id={`org-${key}`} className="form-control" type={type} value={draft[key] || ""} onChange={event => setDraft(value => ({ ...value, [key]: event.target.value }))}/></div>;
  const choice = (key: string, label: string, options: Record<string, string>) => <div className="col-sm-6 col-lg-3"><label className="form-label small" htmlFor={`org-${key}`}>{label}</label><select id={`org-${key}`} className="form-select" value={draft[key] || ""} onChange={event => setDraft(value => ({ ...value, [key]: event.target.value }))}><option value="">Todos</option>{Object.entries(options).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></div>;
  const pageIds = data?.results.map(row => row.id) || [];
  const checked = pageIds.length > 0 && pageIds.every(id => selected.includes(id));
  const count = allMatching ? data?.count || 0 : selected.length;
  const changePage = (next: number) => { setLoading(true); setPage(next); };
  return <>
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4"><div><div className="platform-label mb-2">Clientes</div><h1 className="h2 fw-bold mb-1">Organizações</h1><p className="text-muted mb-0">Localize clientes e acompanhe ações individuais ou em lote.</p></div><div className="d-flex align-items-center gap-2"><div className="platform-status active"><Building2 size={14}/>{data?.count ?? 0} organizações</div>{canManage && <button className="btn btn-dark d-flex align-items-center gap-2" onClick={() => setShowForm(true)}><Plus size={17}/>Nova organização</button>}</div></div>
    <section className="platform-card p-3 mb-3"><form className="row g-3" onSubmit={submit}>
      {input("search", "Nome, documento, slug ou e-mail")}{input("plan", "Código do plano")}
      {choice("status", "Estado", {active: "Ativas", suspended: "Suspensas", archived: "Arquivadas"})}
      {choice("adoption", "Adoção", {...adoptionLabels, pending: "Aguardando cálculo"})}
      {choice("unused_days", "Sem uso há pelo menos", {"7": "7 dias", "15": "15 dias", "30": "30 dias"})}
      {choice("trial", "Em teste", {true: "Sim", false: "Não"})}
      {choice("financial_pending", "Pendência financeira vencida", {true: "Sim", false: "Não"})}
      {choice("without_admin", "Sem administrador ativo", {true: "Sim", false: "Não"})}
      {choice("without_responsible", "Sem responsável ativo", {true: "Sim", false: "Não"})}
      {choice("near_limit", "Próximo ou acima de uma cota", {true: "Sim", false: "Não"})}
      {input("created_from", "Cadastro a partir de", "date")}{input("created_to", "Cadastro até", "date")}
      <div className="col-12 d-flex gap-2"><button className="btn btn-dark">Aplicar filtros</button><button type="button" className="btn btn-outline-secondary" onClick={() => { setDraft({}); setFilters({}); setPage(1); setSelected([]); setAllMatching(false); setLoading(true); }}>Limpar filtros</button></div>
      <p className="small text-muted mb-0">Uso e proximidade de cotas seguem o último cálculo horário. Cotas ainda não calculadas ficam fora desse filtro. Alterar os filtros limpa a seleção; a seleção individual é mantida entre páginas. Máximo de 10.000 organizações por lote.</p>
    </form></section>
    {error && <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={() => { setLoading(true); refresh(); }}>Atualizar consulta</button></div>}
    <section className="platform-card p-3 mb-3" aria-label="Ações em lote"><div className="d-flex flex-wrap align-items-end gap-2">
      <div><label htmlFor="batch-action" className="form-label small">Ação</label><select id="batch-action" className="form-select" value={action} onChange={event => setAction(event.target.value as OrganizationBatchAction)}>{Object.entries(batchActions).filter(([value]) => canManage || value === "export").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {(action === "suspend" || action === "activate") && <div className="flex-grow-1"><label htmlFor="batch-reason" className="form-label small">Motivo obrigatório</label><input id="batch-reason" className="form-control" maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}/></div>}
      <button className="btn btn-dark" disabled={busy || loading || count === 0 || ((action === "suspend" || action === "activate") && !reason.trim())} onClick={() => void prepare()}>Revisar {count} selecionadas</button><button className="btn btn-outline-secondary" onClick={() => { setAllMatching(false); setSelected([]); }}>Limpar seleção</button>
    </div><div className="small mt-3">{allMatching ? `Todos os ${data?.count || 0} resultados dos filtros aplicados selecionados.` : `${selected.length} selecionadas entre páginas.`} {!allMatching && !!data?.count && <button className="btn btn-link btn-sm" disabled={loading} onClick={() => { setAllMatching(true); setSelected([]); }}>Selecionar explicitamente todos os {data.count} resultados</button>}</div></section>
    {batch && <OrganizationBatchPanel key={batch.id} batch={batch} onClose={() => setBatch(null)} onCompleted={refresh}/>}
    <div className="platform-card overflow-hidden mb-4"><div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th><input type="checkbox" aria-label="Selecionar esta página" checked={allMatching || checked} disabled={allMatching || loading || !pageIds.length} onChange={event => setSelected(value => event.target.checked ? [...new Set([...value, ...pageIds])] : value.filter(id => !pageIds.includes(id)))}/></th><th>Organização</th><th>Plano</th><th>Usuários</th><th>Fazendas</th><th>Estado</th><th>Adoção</th><th>Cadastro</th><th/></tr></thead><tbody>{loading ? <tr><td colSpan={9} className="text-center py-5" role="status">Carregando organizações…</td></tr> : data?.results.length ? data.results.map(organization => <tr key={organization.id}><td><input type="checkbox" aria-label={`Selecionar ${organization.name}`} checked={allMatching || selected.includes(organization.id)} disabled={allMatching} onChange={event => setSelected(value => event.target.checked ? [...value, organization.id] : value.filter(id => id !== organization.id))}/></td><td><div className="fw-semibold">{organization.name}</div><div className="text-muted small">{organization.document || organization.email || organization.slug}</div></td><td>{organization.subscription_plan_code || organization.plan}{organization.quota_snapshot && <div className="small text-muted">{organization.quota_snapshot.near_limit ? "Atenção à cota" : "Cota normal"} · {new Date(organization.quota_snapshot.calculated_at).toLocaleString("pt-BR")}</div>}</td><td>{organization.users_count}</td><td>{organization.farms_count}</td><td>{organization.status_display}</td><td className="small">{organization.adoption ? <>{adoptionLabels[organization.adoption.status]}<div className="text-muted">Cálculo: {new Date(organization.adoption.calculated_at).toLocaleString("pt-BR")}</div></> : "Aguardando cálculo"}</td><td className="small">{new Date(organization.created_at).toLocaleDateString("pt-BR")}</td><td><Link href={`/platform/organizations/${organization.id}`} className="btn btn-outline-secondary btn-sm">Detalhes</Link></td></tr>) : <tr><td colSpan={9} className="text-center text-muted py-5">{error ? "Consulta indisponível." : "Nenhuma organização encontrada."}</td></tr>}</tbody></table></div>
      {data && <div className="d-flex gap-2 align-items-center p-3 border-top"><button className="btn btn-sm btn-outline-secondary" disabled={loading || !data.previous} onClick={() => changePage(page - 1)}>Anterior</button><span className="small">Página {page} de {data.total_pages || 1}</span><button className="btn btn-sm btn-outline-secondary" disabled={loading || !data.next} onClick={() => changePage(page + 1)}>Próxima</button></div>}
    </div>
    <section className="platform-card p-3"><h2 className="h5">Meus lotes recentes</h2>{historyError && <div className="alert alert-danger" role="alert">{historyError}<button className="btn btn-link" onClick={refresh}>Tentar novamente</button></div>}{history?.results.length ? <><div className="table-responsive"><table className="table"><thead><tr><th>Ação</th><th>Quantidade</th><th>Estado</th><th>Cadastro</th><th/></tr></thead><tbody>{history.results.map(row => <tr key={row.id}><td>{batchActions[row.action]}</td><td>{row.total}</td><td>{row.status === "completed" ? `Concluído · ${row.failed} falhas` : row.status === "draft" ? "Revisão pendente" : "Em processamento"}</td><td>{new Date(row.created_at).toLocaleString("pt-BR")}</td><td><button className="btn btn-sm btn-outline-secondary" onClick={() => setBatch(row)}>Abrir</button></td></tr>)}</tbody></table></div><div className="d-flex gap-2 align-items-center"><button className="btn btn-sm btn-outline-secondary" disabled={!history.previous} onClick={() => setHistoryPage(value => value - 1)}>Anterior</button><span className="small">Página {historyPage} de {history.total_pages || 1}</span><button className="btn btn-sm btn-outline-secondary" disabled={!history.next} onClick={() => setHistoryPage(value => value + 1)}>Próxima</button></div></> : !historyError && <p className="text-muted mb-0">Nenhum lote preparado por você.</p>}</section>
    {showForm && <OrganizationFormModal onClose={() => setShowForm(false)} onSaved={result => { setShowForm(false); refresh(); showToast(result.administrator_invitation?.state === "failed" ? "Organização criada; consulte o envio do convite nos detalhes." : "Organização e responsável criados.", "success"); router.push(`/platform/organizations/${result.id}`); }}/>}
  </>;
}
