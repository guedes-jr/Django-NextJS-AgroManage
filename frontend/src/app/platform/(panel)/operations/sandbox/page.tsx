"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Play, RefreshCw, ShieldAlert } from "lucide-react";

import { platformService } from "@/services/platformApi";
import type {
  PlatformStaff,
  SandboxExecutionPage,
  SandboxExecutionResult,
  SandboxGrantPage,
  SandboxStatus,
} from "@/types/platform";

const initialSandbox: SandboxStatus = { enabled: false, available: false, active_grant: null };

export default function SandboxAccessPage() {
  const [staff, setStaff] = useState<PlatformStaff | null>(null);
  const [grants, setGrants] = useState<SandboxGrantPage | null>(null);
  const [history, setHistory] = useState<SandboxExecutionPage | null>(null);
  const [sandbox, setSandbox] = useState<SandboxStatus>(initialSandbox);
  const [justification, setJustification] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [code, setCode] = useState('print("Sandbox AgroManage")');
  const [execution, setExecution] = useState<SandboxExecutionResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [current, grantPage, currentSandbox, executionPage] = await Promise.all([
        platformService.me(),
        platformService.sandboxGrants(),
        platformService.sandboxStatus(),
        platformService.sandboxExecutions(),
      ]);
      setStaff(current);
      setGrants(grantPage);
      setSandbox(currentSandbox);
      setHistory(executionPage);
    } catch {
      setError("Não foi possível carregar o estado do sandbox.");
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const withReload = async (operation: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try { await operation(); await load(); }
    catch { setError(message); }
    finally { setBusy(false); }
  };

  const requestAccess = () => withReload(async () => {
    await platformService.requestSandboxGrant(justification, minutes);
    setJustification("");
  }, "Revise a justificativa e a duração solicitada.");

  const reject = (id: string) => {
    const reason = window.prompt("Motivo da rejeição (mínimo de 10 caracteres):")?.trim();
    if (!reason) return;
    void withReload(
      () => platformService.rejectSandboxGrant(id, reason),
      "Não foi possível rejeitar a solicitação. Verifique o motivo informado.",
    );
  };

  const executeCode = async () => {
    if (!sandbox.active_grant) return;
    setBusy(true);
    setError("");
    setExecution(null);
    try {
      setExecution(await platformService.executeSandboxCode(sandbox.active_grant.id, code));
      await load();
    } catch {
      setError("A execução foi recusada ou o serviço isolado está indisponível.");
      await load();
    } finally { setBusy(false); }
  };

  const canApprove = staff?.role === "platform_owner" || staff?.role === "platform_admin";
  const canExecute = Boolean(
    staff?.role === "platform_developer" && sandbox.enabled && sandbox.available && sandbox.active_grant,
  );
  const blockedReason = !sandbox.enabled
    ? "O ambiente ainda não habilitou o serviço."
    : !sandbox.available
      ? "O socket isolado não respondeu à verificação de saúde."
      : !sandbox.active_grant
        ? "Solicite e aguarde a aprovação de um acesso JIT."
        : "O acesso está restrito ao grant temporário aprovado.";

  return <>
    <div className="d-flex justify-content-between align-items-end mb-4">
      <div><div className="platform-label mb-2">Autorização temporária</div><h1 className="h2 fw-bold mb-1">Acesso JIT ao sandbox</h1><p className="text-muted mb-0">Execução condicionada ao serviço isolado e a uma autorização temporária válida.</p></div>
      <button className="btn btn-outline-secondary d-flex gap-2" disabled={busy} onClick={load}><RefreshCw size={16}/>Atualizar</button>
    </div>

    <div className={`alert d-flex gap-2 ${canExecute ? "alert-success" : "alert-warning"}`}><ShieldAlert size={20}/><div><strong>{canExecute ? "Executor isolado disponível." : "Executor indisponível."}</strong> {blockedReason}</div></div>
    {error && <div className="alert alert-danger">{error}</div>}

    {canExecute && <div className="platform-card p-4 mb-4">
      <h2 className="h5 fw-bold mb-1">Python isolado</h2>
      <div className="text-muted small">Sessão não interativa · expira em {new Date(sandbox.active_grant!.expires_at).toLocaleString("pt-BR")}</div>
      <textarea className="form-control font-monospace mt-3" rows={10} value={code} onChange={(event) => setCode(event.target.value)} maxLength={20000} spellCheck={false}/>
      <button className="btn btn-dark d-flex gap-2 mt-3" disabled={busy || !code.trim()} onClick={executeCode}><Play size={16}/>{busy ? "Executando..." : "Executar no sandbox"}</button>
      {execution && <div className="mt-4"><div className="small text-muted mb-2">{execution.status} · {execution.duration_ms} ms · exit {execution.exit_code ?? "-"}</div>{execution.stdout && <pre className="bg-dark text-light p-3 rounded overflow-auto">{execution.stdout}</pre>}{execution.stderr && <pre className="bg-danger-subtle text-danger p-3 rounded overflow-auto">{execution.stderr}</pre>}</div>}
    </div>}

    {staff?.role === "platform_developer" && <div className="platform-card p-4 mb-4">
      <h2 className="h5 fw-bold">Nova solicitação</h2>
      <label className="form-label">Justificativa e referência do incidente</label>
      <textarea className="form-control" rows={3} value={justification} onChange={(event) => setJustification(event.target.value)} maxLength={2000}/>
      <label className="form-label mt-3">Duração</label>
      <select className="form-select" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}><option value={15}>15 minutos</option><option value={30}>30 minutos</option><option value={60}>60 minutos</option></select>
      <button className="btn btn-dark mt-3" disabled={busy || justification.trim().length < 10} onClick={requestAccess}>Solicitar aprovação</button>
    </div>}

    <div className="platform-card overflow-hidden mb-4">
      <div className="p-4 border-bottom"><h2 className="h5 fw-bold mb-1">Solicitações recentes</h2><div className="text-muted small">Aprovação independente, expiração automática e revogação imediata.</div></div>
      <div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th>Solicitante</th><th>Justificativa</th><th>Status</th><th>Validade</th><th>Ações</th></tr></thead><tbody>
        {grants?.results.length ? grants.results.map((grant) => <tr key={grant.id}><td>{grant.requester_name}</td><td className="small">{grant.justification}{grant.decision_reason && <div className="text-danger mt-1">Motivo: {grant.decision_reason}</div>}</td><td><span className={`platform-status ${grant.is_valid ? "active" : grant.status === "pending" ? "" : "suspended"}`}>{grant.status_display}</span></td><td className="small"><Clock size={14} className="me-1"/>{grant.expires_at ? new Date(grant.expires_at).toLocaleString("pt-BR") : `${grant.requested_minutes} min solicitados`}</td><td><div className="d-flex gap-2">{canApprove && grant.status === "pending" && grant.requester !== staff?.id && <><button className="btn btn-success btn-sm" disabled={busy} onClick={() => void withReload(() => platformService.approveSandboxGrant(grant.id), "Não foi possível aprovar a solicitação.")}>Aprovar</button><button className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => reject(grant.id)}>Rejeitar</button></>}{grant.is_valid && (canApprove || grant.requester === staff?.id) && <button className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => void withReload(() => platformService.revokeSandboxGrant(grant.id), "Não foi possível revogar o acesso.")}>Revogar</button>}</div></td></tr>) : <tr><td colSpan={5} className="text-center text-muted py-4">Nenhuma solicitação registrada.</td></tr>}
      </tbody></table></div>
    </div>

    <div className="platform-card overflow-hidden">
      <div className="p-4 border-bottom"><h2 className="h5 fw-bold mb-1">Histórico de execuções</h2><div className="text-muted small">Metadados auditáveis; código e conteúdo das saídas não são armazenados.</div></div>
      <div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th>Operador</th><th>Status</th><th>Duração</th><th>Saída</th><th>Hash do código</th><th>Data</th></tr></thead><tbody>
        {history?.results.length ? history.results.map((item) => <tr key={item.id}><td>{item.operator_name}</td><td><span className={`platform-status ${item.status === "success" ? "active" : item.status === "running" ? "" : "suspended"}`}>{item.status_display}</span></td><td>{item.duration_ms} ms</td><td className="small">stdout {item.stdout_bytes} B · stderr {item.stderr_bytes} B</td><td><code title={item.code_sha256}>{item.code_sha256.slice(0, 12)}…</code></td><td className="small">{new Date(item.created_at).toLocaleString("pt-BR")}</td></tr>) : <tr><td colSpan={6} className="text-center text-muted py-4">Nenhuma execução registrada.</td></tr>}
      </tbody></table></div>
    </div>
  </>;
}
