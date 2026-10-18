"use client";

import { useEffect, useState } from "react";
import type { PaginatedResponse } from "@/types";
import type { OrganizationBatch, OrganizationBatchItem } from "@/types/platform";
import { platformService } from "@/services/platformApi";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";

export const batchActions = { export: "Exportar listagem", suspend: "Suspender", activate: "Reativar suspensas", resend_invitation: "Reenviar convite" };
const stateLabels = { draft: "Revisão pendente", queued: "Na fila", running: "Em execução", completed: "Concluído", pending: "Pendente", delivery_pending: "Conferindo envio", succeeded: "Sucesso", failed: "Falha", skipped: "Ignorado" };

export function OrganizationBatchPanel({ batch: initial, onClose, onCompleted }: { batch: OrganizationBatch; onClose: () => void; onCompleted: () => void }) {
  const [batch, setBatch] = useState(initial);
  const [items, setItems] = useState<PaginatedResponse<OrganizationBatchItem> | null>(null);
  const [page, setPage] = useState(1);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const refresh = () => { setLoading(true); setAttempt(value => value + 1); };
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [current, rows] = await Promise.all([platformService.organizationBatch(batch.id), platformService.organizationBatchItems(batch.id, page, onlyFailed ? "failed" : "")]);
        if (active) { setBatch(current); setItems(rows); setError(""); }
      } catch (reason) { if (active) setError(getOrganizationErrorMessage(reason, "Não foi possível consultar o lote.")); }
      finally { if (active) setLoading(false); }
    };
    void load();
    const timer = batch.status === "queued" || batch.status === "running" ? setInterval(() => { void load(); }, 3000) : undefined;
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [batch.id, batch.status, page, onlyFailed, attempt]);
  useEffect(() => { if (batch.status === "completed") onCompleted(); }, [batch.status, onCompleted]);
  const execute = async () => {
    setBusy(true); setError("");
    try { setBatch(await platformService.confirmOrganizationBatch(batch.id, batch.total)); refresh(); }
    catch (reason) { setError(getOrganizationErrorMessage(reason, "Não foi possível confirmar o lote.")); }
    finally { setBusy(false); }
  };
  const retryFailed = async () => {
    setBusy(true); setError("");
    try { setBatch(await platformService.retryOrganizationBatch(batch.id)); setPage(1); setOnlyFailed(false); refresh(); }
    catch (reason) { setError(getOrganizationErrorMessage(reason, "Não foi possível preparar a nova tentativa.")); }
    finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true); setError("");
    try {
      const blob = await platformService.downloadOrganizationBatch(batch.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `organizacoes-${batch.id}.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(getOrganizationErrorMessage(reason, "Não foi possível baixar a listagem.")); }
    finally { setBusy(false); }
  };
  return <section className="platform-card p-3 mb-4" aria-label="Revisão e acompanhamento do lote">
    <div className="d-flex flex-wrap justify-content-between gap-2"><h2 className="h5">{batchActions[batch.action]} · {batch.total} organizações</h2><button className="btn btn-sm btn-outline-secondary" onClick={onClose}>Fechar acompanhamento</button></div>
    <p className="mb-1"><strong>{stateLabels[batch.status]}</strong> · {batch.succeeded} sucessos · {batch.failed} falhas · {batch.skipped} ignorados</p>
    {batch.reason && <p className="small mb-1">Motivo: {batch.reason}</p>}
    <p className="small text-muted text-break">Seleção congelada em {new Date(batch.created_at).toLocaleString("pt-BR")}. Filtros: {Object.keys(batch.filters).length ? JSON.stringify(batch.filters) : "Seleção individual"}.</p>
    {batch.status === "draft" && <div className="alert alert-warning"><p>Confira a quantidade e as organizações antes de executar. A elegibilidade será verificada novamente em cada item. A revisão expira em {new Date(batch.expires_at).toLocaleString("pt-BR")}.</p>{batch.action === "suspend" && <p>A suspensão encerra as sessões e bloqueia o acesso das organizações elegíveis.</p>}{batch.action === "resend_invitation" && <p>Somente convites pendentes elegíveis serão reenviados. Os links anteriores serão invalidados.</p>}<button className="btn btn-dark" disabled={busy || loading} onClick={() => void execute()}>Confirmar {batchActions[batch.action].toLowerCase()} de {batch.total} organizações</button></div>}
    {(batch.status === "queued" || batch.status === "running") && <p role="status">Processamento em segundo plano. Você pode fechar e voltar pelo histórico.</p>}
    {error && <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={refresh}>Atualizar consulta</button></div>}
    <div className="d-flex flex-wrap gap-2 mb-3"><button className="btn btn-sm btn-outline-secondary" onClick={refresh} disabled={busy}>Atualizar</button>{batch.status === "completed" && batch.failed > 0 && <button className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => void retryFailed()}>Revisar nova tentativa apenas das falhas</button>}{batch.status === "completed" && batch.action === "export" && <button className="btn btn-sm btn-dark" disabled={busy} onClick={() => void download()}>Baixar CSV ({batch.succeeded} registros)</button>}<label className="d-flex gap-2 align-items-center small"><input type="checkbox" checked={onlyFailed} onChange={event => { setOnlyFailed(event.target.checked); setPage(1); setLoading(true); }}/>Somente falhas</label></div>
    {loading ? <p role="status">Carregando itens…</p> : items?.results.length ? <div className="table-responsive"><table className="table"><thead><tr><th>Organização revisada</th><th>Estado revisado</th><th>Resultado</th><th>Detalhe</th></tr></thead><tbody>{items.results.map(item => <tr key={item.id}><td>{item.snapshot.name}<div className="small text-muted">{item.organization_id}</div></td><td>{item.snapshot.status}</td><td>{stateLabels[item.status]}</td><td>{item.message || "Aguardando execução"}</td></tr>)}</tbody></table></div> : !error && <p>Nenhum item para este filtro.</p>}
    {items && <div className="d-flex gap-2 align-items-center"><button className="btn btn-sm btn-outline-secondary" disabled={loading || !items.previous} onClick={() => { setPage(value => value - 1); setLoading(true); }}>Anterior</button><span className="small">Página {page} de {items.total_pages || 1}</span><button className="btn btn-sm btn-outline-secondary" disabled={loading || !items.next} onClick={() => { setPage(value => value + 1); setLoading(true); }}>Próxima</button></div>}
  </section>;
}
