"use client";

import { useEffect, useRef, useState } from "react";
import type { PaginatedResponse } from "@/types";
import { organizationExportService, type OrganizationExport } from "@/services/organizationExportService";
import { organizationRecoveryService, type OrganizationRecovery } from "@/services/organizationRecoveryService";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";

const statuses = {queued: "Na fila", running: "Processando", ready: "Ensaio concluído · aguardando revisão", applied: "Aplicada na organização original", rolled_back: "Rollback concluído", failed: "Falha no ensaio"};
const operations = {rehearse: "Ensaio isolado", refresh: "Atualização da prévia", apply: "Aplicação na origem", rollback: "Rollback"};

function Conference({org, job}: {org: string; job: OrganizationRecovery}) {
  const entities = Object.entries(job.preview.source_counts || {}).filter(([, count]) => count > 0).map(([label]) => label);
  const [entity, setEntity] = useState(entities[0] || "farms.farm");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResponse<Record<string, unknown>> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    organizationRecoveryService.records(org, job.id, entity, page).then(value => {if (active) {setData(value); setError("");}})
      .catch(reason => {if (active) setError(getOrganizationErrorMessage(reason, "Não foi possível carregar os registros."));})
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [org, job.id, entity, page, attempt]);
  return <div className="border rounded p-3 mt-3">
    <h4 className="h6">Conferência dos registros do pacote</h4>
    <p className="small text-muted">O ensaio usa novos IDs e usuários inativos. Arquivos ficam em quarentena no pacote privado; a conferência mostra os valores do pacote (source) ao lado dos registros restaurados (restored). Catálogos e cobranças aparecem apenas como referência.</p>
    <label className="w-100">Entidade<select className="form-select" value={entity} onChange={event => {setEntity(event.target.value); setPage(1); setLoading(true);}}>{entities.map(label => <option key={label}>{label}</option>)}</select></label>
    {loading ? <p role="status">Carregando registros…</p> : error ? <p className="text-danger" role="alert">{error}<button className="btn btn-link" onClick={() => {setLoading(true); setAttempt(value => value + 1);}}>Tentar novamente</button></p> : <><div className="overflow-auto mt-3" style={{maxHeight: 400}}><pre className="small mb-0">{JSON.stringify(data?.results || [], null, 2)}</pre></div><div className="d-flex align-items-center gap-2 mt-2"><button className="btn btn-sm btn-outline-secondary" disabled={!data?.previous} onClick={() => {setPage(value => value - 1); setLoading(true);}}>Anterior</button><span>Página {page}</span><button className="btn btn-sm btn-outline-secondary" disabled={!data?.next} onClick={() => {setPage(value => value + 1); setLoading(true);}}>Próxima</button></div></>}
  </div>;
}

export function OrganizationRecoverySection({id, name}: {id: string; name: string}) {
  const [data, setData] = useState<PaginatedResponse<OrganizationRecovery> | null>(null);
  const [sources, setSources] = useState<OrganizationExport[]>([]);
  const [sourcePage, setSourcePage] = useState(1);
  const [hasMoreSources, setHasMoreSources] = useState(false);
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<Record<string, string>>({});
  const [conference, setConference] = useState("");
  const key = useRef("");
  const pending = data?.results.some(job => job.status === "queued" || job.status === "running") || false;
  useEffect(() => {
    let active = true;
    const load = () => organizationRecoveryService.list(id, page).then(value => {if (active) setData(value);})
      .catch(reason => {if (active) setError(getOrganizationErrorMessage(reason, "Não foi possível carregar as recuperações."));})
      .finally(() => {if (active) setLoading(false);});
    void load(); const timer = pending ? setInterval(() => {void load();}, 5000) : undefined;
    return () => {active = false; if (timer) clearInterval(timer);};
  }, [id, page, attempt, pending]);
  useEffect(() => {
    let active = true;
    organizationExportService.list(id, sourcePage).then(value => {if (active) {setSources(value.results.filter(item => item.format === "recovery" && item.download_allowed)); setHasMoreSources(Boolean(value.next));}})
      .catch(reason => {if (active) setError(getOrganizationErrorMessage(reason, "Não foi possível carregar os pacotes técnicos."));});
    return () => {active = false;};
  }, [id, sourcePage, attempt]);
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(""); setNotice("");
    try {await action(); setNotice(message); setAttempt(value => value + 1);}
    catch (reason) {setError(getOrganizationErrorMessage(reason, "Não foi possível concluir a solicitação."));}
    finally {setBusy(false);}
  };
  const create = () => {key.current ||= crypto.randomUUID(); void run(async () => {await organizationRecoveryService.create(id, source, key.current); key.current = ""; setPage(1);}, "Ensaio solicitado. A organização original será preservada.");};
  const download = (job: OrganizationRecovery, kind: "source" | "before") => void run(async () => {
    const blob = await organizationRecoveryService.download(id, job.id, kind);
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `recuperacao-${job.id}-${kind}.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "Download encaminhado ao navegador.");
  return <section className="d-flex flex-column gap-3" aria-label="Recuperação da organização">
    <div className="platform-card p-4"><h2 className="h5">Recuperar dados da organização</h2><p>Primeiro, restaure um pacote técnico em uma organização isolada para conferência. Depois, revise o impacto para aplicar os dados na organização original.</p><p className="small text-muted">A recuperação atualiza registros do pacote e preserva os criados depois dele. Contas existentes mantêm credenciais e permissões; novas contas ficam inativas. Cobranças são apenas referência e agendamentos recuperados ficam desativados.</p><label className="w-100">Pacote técnico disponível<select className="form-select" value={source} disabled={busy} onChange={event => {setSource(event.target.value); key.current = "";}}><option value="">Selecione um pacote</option>{sources.map(item => <option value={item.id} key={item.id}>{new Date(item.created_at).toLocaleString("pt-BR")} · {item.summary.records || 0} registros</option>)}</select></label><div className="d-flex flex-wrap gap-2 mt-3"><button className="btn btn-dark" disabled={busy || !source} onClick={create}>Criar ensaio isolado</button><button className="btn btn-outline-secondary" disabled={busy || loading} onClick={() => {setError(""); setAttempt(value => value + 1);}}>Atualizar</button><button className="btn btn-outline-secondary" disabled={sourcePage === 1 || busy} onClick={() => setSourcePage(value => value - 1)}>Pacotes anteriores</button><button className="btn btn-outline-secondary" disabled={!hasMoreSources || busy} onClick={() => setSourcePage(value => value + 1)}>Mais pacotes</button></div>{!sources.length && <p className="small text-muted mt-2 mb-0">Nenhum pacote técnico disponível nesta página. Gere uma exportação técnica ou consulte as demais páginas.</p>}</div>
    {error && <p className="alert alert-danger" role="alert">{error}</p>}{notice && <p className="alert alert-info" role="status">{notice}</p>}
    {loading ? <p role="status">Carregando histórico…</p> : !data?.results.length ? <p className="text-muted">Nenhuma recuperação solicitada.</p> : data.results.map(job => <article className="platform-card p-4" key={job.id}>
      <div className="d-flex flex-wrap justify-content-between gap-2"><h3 className="h6">{statuses[job.status]}</h3><small>{new Date(job.created_at).toLocaleString("pt-BR")}</small></div><p className="small text-muted">{operations[job.operation]}{job.preview.source_snapshot_at && ` · Dados de ${new Date(job.preview.source_snapshot_at).toLocaleString("pt-BR")}`}</p>
      {(job.status === "queued" || job.status === "running") && <progress className="w-100" value={job.progress} max={100} aria-label="Progresso da recuperação"/>}
      {job.error_message && <p className="alert alert-warning">{job.error_message}</p>}
      {job.preview.entities && <details><summary>Prévia de impacto e conferência</summary><p className="small mt-2">{job.preview.files || 0} arquivos no pacote privado. Os registros criados após a exportação permanecem na organização. A aplicação bloqueia escritas enquanto valida e confirma os dados; uma falha reverte a transação.</p><div className="table-responsive"><table className="table table-sm"><caption className="visually-hidden">Impacto por entidade</caption><thead><tr><th>Entidade</th><th>Criar</th><th>Atualizar</th><th>Preservar</th><th>Referência</th><th>Posteriores preservados</th></tr></thead><tbody>{Object.entries(job.preview.entities).filter(([label, counts]) => Object.values(counts).some(Boolean) || Boolean(job.preview.newer_records_preserved?.[label])).map(([label, counts]) => <tr key={label}><td>{label}</td><td>{counts.create}</td><td>{counts.update}</td><td>{counts.preserve}</td><td>{counts.reference}</td><td>{job.preview.newer_records_preserved?.[label] || 0}</td></tr>)}</tbody></table></div><button className="btn btn-sm btn-outline-secondary" onClick={() => setConference(value => value === job.id ? "" : job.id)}>Conferir registros</button>{conference === job.id && <Conference org={id} job={job}/>}</details>}
      <div className="d-flex flex-wrap gap-2 mt-3">{job.isolated_organization && <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => download(job, "source")}>Baixar pacote conferido</button>}{job.before_sha256 && <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => download(job, "before")}>Baixar cópia anterior</button>}{job.status === "ready" && <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => void run(() => organizationRecoveryService.refresh(id, job.id), "Atualização da prévia solicitada.")}>Atualizar prévia</button>}</div>
      {(job.status === "ready" || job.status === "applied") && <div className="border rounded p-3 mt-3"><p>{job.status === "ready" ? "Aplicar os dados conferidos na organização original. Uma cópia anterior será criada antes da alteração." : "Desfazer esta aplicação e voltar à cópia anterior. Se houver alterações posteriores, o rollback será bloqueado."}</p><label className="w-100">Digite {name} para confirmar<input className="form-control" value={confirmation[job.id] || ""} disabled={busy} onChange={event => setConfirmation(value => ({...value, [job.id]: event.target.value}))}/></label><button className="btn btn-danger mt-2" disabled={busy || confirmation[job.id] !== name || (job.status === "ready" && !job.preview_digest)} onClick={() => void run(async () => {await organizationRecoveryService.confirm(id, job, job.status === "ready" ? "apply" : "rollback", confirmation[job.id]); setConfirmation(value => ({...value, [job.id]: ""}));}, "Operação confirmada e enviada para processamento.")}>{job.status === "ready" ? "Confirmar aplicação na origem" : "Confirmar rollback"}</button></div>}
    </article>)}
    {data && <div className="d-flex align-items-center gap-2"><button className="btn btn-sm btn-outline-secondary" disabled={loading || !data.previous} onClick={() => {setPage(value => value - 1); setLoading(true);}}>Anterior</button><span>Página {page} de {data.total_pages || 1}</span><button className="btn btn-sm btn-outline-secondary" disabled={loading || !data.next} onClick={() => {setPage(value => value + 1); setLoading(true);}}>Próxima</button></div>}
  </section>;
}
