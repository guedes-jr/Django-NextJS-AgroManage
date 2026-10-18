"use client";
import { useEffect, useRef, useState } from "react";
import type { PaginatedResponse } from "@/types";
import { organizationExportService, type OrganizationExport } from "@/services/organizationExportService";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";

const statuses = {queued: "Na fila", running: "Gerando pacote", ready: "Disponível", failed: "Falha", expired: "Expirado"};
const formats = {customer: "Cliente · CSV, JSON e arquivos", recovery: "Técnico · JSON, relações e arquivos"};
type SavePicker = (options: {suggestedName: string; types: {description: string; accept: Record<string, string[]>}[]}) => Promise<{createWritable: () => Promise<WritableStream<Uint8Array>>}>;

export function OrganizationExportSection({ id }: { id: string }) {
  const [data, setData] = useState<PaginatedResponse<OrganizationExport> | null>(null);
  const [format, setFormat] = useState<OrganizationExport["format"]>("customer");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestKey = useRef("");
  const retryKeys = useRef<Record<string, string>>({});
  const running = data?.results.some(job => job.status === "queued" || job.status === "running") || false;
  useEffect(() => {
    let active = true;
    const load = () => organizationExportService.list(id, page).then(value => { if (active) { setData(value); setError(""); } })
      .catch(reason => { if (active) setError(getOrganizationErrorMessage(reason, "Não foi possível consultar as exportações.")); })
      .finally(() => { if (active) setLoading(false); });
    void load();
    const timer = running ? setInterval(() => { void load(); }, 5000) : undefined;
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [id, page, attempt, running]);
  const refresh = () => { setLoading(true); setAttempt(value => value + 1); };
  const create = async () => {
    setBusy(true); setError(""); setNotice(""); requestKey.current ||= crypto.randomUUID();
    try {
      await organizationExportService.create(id, format, requestKey.current);
      requestKey.current = ""; setPage(1); setNotice("Exportação solicitada. O pacote aparecerá no histórico quando estiver pronto."); refresh();
    } catch (reason) { setError(getOrganizationErrorMessage(reason, "Não foi possível solicitar a exportação.")); }
    finally { setBusy(false); }
  };
  const retry = async (job: OrganizationExport) => {
    setBusy(true); setError(""); retryKeys.current[job.id] ||= crypto.randomUUID();
    try {
      await organizationExportService.retry(id, job.id, retryKeys.current[job.id]);
      setPage(1); setNotice("Nova tentativa solicitada. A exportação anterior permanece no histórico."); refresh();
    } catch (reason) { setError(getOrganizationErrorMessage(reason, "Não foi possível solicitar nova tentativa.")); }
    finally { setBusy(false); }
  };
  const download = async (job: OrganizationExport) => {
    setBusy(true); setError(""); setNotice("Preparando download…");
    try {
      const name = `organizacao-${id}-${job.format}.zip`;
      const picker = (window as Window & {showSaveFilePicker?: SavePicker}).showSaveFilePicker;
      if (picker) {
        const handle = await picker.call(window, {suggestedName: name, types: [{description: "Pacote ZIP", accept: {"application/zip": [".zip"]}}]});
        await organizationExportService.saveToStream(id, job.id, await handle.createWritable());
      } else {
        const blob = await organizationExportService.download(id, job.id);
        const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice("Download do pacote concluído ou encaminhado ao navegador.");
    } catch (reason) {
      if ((reason as {name?: string}).name === "AbortError") setNotice("Download cancelado.");
      else { setNotice(""); setError(getOrganizationErrorMessage(reason, "Não foi possível baixar o pacote.")); }
    } finally { setBusy(false); }
  };
  return <section className="d-flex flex-column gap-3" aria-label="Exportação completa da organização">
    <div className="platform-card p-4"><h2 className="h5">Exportar dados da organização</h2><p>Gere um pacote privado com dados, arquivos referenciados, manifesto, contagens e verificações de integridade.</p><p className="small text-muted">Inclui dados privados dos usuários do cliente, como conversas de IA. Credenciais, sessões, configurações de provedores e notas internas de suporte ficam de fora. Atores internos são anonimizados.</p><div className="d-flex flex-wrap align-items-end gap-2"><label className="flex-grow-1">Modalidade<select className="form-select" value={format} disabled={busy} onChange={event => { setFormat(event.target.value as OrganizationExport["format"]); requestKey.current = ""; }}>{Object.entries(formats).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="btn btn-dark" disabled={busy} onClick={() => void create()}>Gerar pacote</button><button className="btn btn-outline-secondary" disabled={loading || busy} onClick={refresh}>Atualizar histórico</button></div><p className="small text-muted mb-0 mt-2">O formato cliente inclui tabelas CSV. O formato técnico preserva IDs, relações e metadados de estrutura para recuperação compatível. O processamento ocorre em segundo plano; a validade do download aparece em cada pacote.</p></div>
    {error && <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={refresh}>Tentar novamente</button></div>}{notice && <p className="alert alert-info mb-0" role="status">{notice}</p>}
    {loading ? <p role="status">Carregando exportações…</p> : !data?.results.length ? !error && <p className="text-muted">Nenhuma exportação solicitada para esta organização.</p> : data.results.map(job => <article key={job.id} className="platform-card p-3"><div className="d-flex flex-wrap justify-content-between gap-2"><div><h3 className="h6 mb-1">{formats[job.format]}</h3><small className="text-muted">Solicitada em {new Date(job.created_at).toLocaleString("pt-BR")}</small></div><strong>{statuses[job.status]}</strong></div>{(job.status === "queued" || job.status === "running") && <div className="mt-3"><progress className="w-100" value={job.progress} max={100} aria-label="Progresso da exportação"/><small>{job.progress}% · {job.progress < 70 ? "Aguardando ou capturando dados e arquivos" : "Preparando e conferindo o pacote"}</small></div>}{job.summary.snapshot_at && <p className="small mt-2 mb-1">Captura: {new Date(job.summary.snapshot_at).toLocaleString("pt-BR")} · {job.summary.records?.toLocaleString("pt-BR")} registros · {job.summary.files?.toLocaleString("pt-BR")} arquivos</p>}{job.error_message && <p className="alert alert-warning mt-2 mb-1">{job.error_message}</p>}{job.download_allowed && <><p className="small mt-2 mb-1">{(job.archive_size / 1048576).toLocaleString("pt-BR", {maximumFractionDigits: 2})} MB · Disponível até {job.expires_at && new Date(job.expires_at).toLocaleString("pt-BR")}</p><details className="small mb-2"><summary>Integridade e conteúdo</summary><p className="text-break">SHA-256: {job.archive_sha256}</p>{job.summary.entity_counts && <ul>{Object.entries(job.summary.entity_counts).filter(([, count]) => count > 0).map(([entity, count]) => <li key={entity}>{entity}: {count}</li>)}</ul>}</details><button className="btn btn-sm btn-success" disabled={busy} onClick={() => void download(job)}>Baixar pacote privado</button></>}{(job.status === "failed" || job.status === "expired") && <button className="btn btn-sm btn-outline-secondary mt-2" disabled={busy} onClick={() => void retry(job)}>Solicitar nova tentativa</button>}</article>)}
    {data && <div className="d-flex align-items-center gap-2"><button className="btn btn-sm btn-outline-secondary" disabled={loading || !data.previous} onClick={() => { setPage(value => value - 1); setLoading(true); }}>Anterior</button><span className="small">Página {page} de {data.total_pages || 1}</span><button className="btn btn-sm btn-outline-secondary" disabled={loading || !data.next} onClick={() => { setPage(value => value + 1); setLoading(true); }}>Próxima</button></div>}
  </section>;
}
