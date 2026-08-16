"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ServerCog, ShieldCheck, XCircle } from "lucide-react";

import { platformService } from "@/services/platformApi";

type UpdateStatus = "idle" | "running" | "success" | "failed";

const statusCopy: Record<UpdateStatus, { label: string; className: string }> = {
  idle: { label: "Aguardando", className: "text-bg-secondary" },
  running: { label: "Atualização em andamento", className: "text-bg-warning" },
  success: { label: "Atualização concluída", className: "text-bg-success" },
  failed: { label: "Atualização interrompida", className: "text-bg-danger" },
};

export default function SystemUpdatePage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const terminalRef = useRef<HTMLPreElement>(null);

  const loadStatus = useCallback(async () => {
    const data = await platformService.systemUpdateStatus();
    setStatus(data.status);
    setProgress(data.progress);
    setLogs(data.logs);
    return data.status;
  }, []);

  useEffect(() => {
    let active = true;
    platformService.me()
      .then(async (staff) => {
        const canUpdate = ["platform_owner", "platform_admin"].includes(staff.role);
        if (!active) return;
        setAuthorized(canUpdate);
        if (!canUpdate) return;
        try {
          await loadStatus();
        } catch (requestError: any) {
          if (active) setError(requestError?.response?.data?.detail || "Não foi possível consultar o estado da atualização.");
        }
      })
      .catch(() => active && setAuthorized(false));
    return () => { active = false; };
  }, [loadStatus]);

  useEffect(() => {
    if (status !== "running" || !authorized) return;
    let active = true;
    let timeout: number | undefined;
    const poll = async () => {
      try {
        await loadStatus();
        if (active) setError("");
      } catch {
        if (active) setError("O servidor está reiniciando. A conexão será restabelecida automaticamente.");
      } finally {
        if (active) timeout = window.setTimeout(poll, 2000);
      }
    };
    timeout = window.setTimeout(poll, 2000);
    return () => {
      active = false;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [authorized, loadStatus, status]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  const startUpdate = async () => {
    const confirmed = window.confirm(
      "Confirmar a atualização do sistema? As conexões podem ser interrompidas por alguns instantes durante a reinicialização.",
    );
    if (!confirmed) return;

    setStarting(true);
    setError("");
    setStatus("running");
    setProgress(5);
    setLogs("Solicitando atualização ao servidor...");
    try {
      await platformService.startSystemUpdate();
      await loadStatus();
    } catch (requestError: any) {
      setStatus("failed");
      setError(requestError?.response?.data?.detail || "Não foi possível iniciar a atualização do sistema.");
    } finally {
      setStarting(false);
    }
  };

  if (authorized === null) {
    return <div className="platform-card p-5 text-center"><Loader2 className="animate-spin text-success" /></div>;
  }

  if (!authorized) {
    return (
      <div className="platform-card p-5 text-center">
        <ShieldCheck size={42} className="text-danger mb-3" />
        <h1 className="h4 fw-bold">Acesso restrito</h1>
        <p className="text-muted mb-0">Somente administradores da plataforma podem atualizar o sistema.</p>
      </div>
    );
  }

  const StatusIcon = status === "success" ? CheckCircle2 : status === "failed" ? XCircle : RefreshCw;

  return (
    <>
      <div className="mb-4">
        <div className="platform-label mb-2">Administração da plataforma</div>
        <h1 className="h2 fw-bold mb-1">Atualização do sistema</h1>
        <p className="text-muted mb-0">Instale a versão mais recente e acompanhe o processo de implantação.</p>
      </div>

      {error && <div className="alert alert-danger d-flex align-items-center gap-2"><AlertTriangle size={18} />{error}</div>}

      <div className="row g-4">
        <div className="col-xl-4">
          <section className="platform-card p-4 h-100">
            <div className="d-flex align-items-start justify-content-between gap-3 mb-4">
              <div className="platform-icon"><ServerCog size={22} /></div>
              <span className={`badge rounded-pill ${statusCopy[status].className}`}>{statusCopy[status].label}</span>
            </div>
            <h2 className="h5 fw-bold">Implantar nova versão</h2>
            <p className="text-muted small">Busca o código mais recente, aplica as migrações, gera o frontend e reinicia os serviços.</p>
            <div className="alert alert-warning small d-flex align-items-start gap-2 mt-4">
              <AlertTriangle size={17} className="flex-shrink-0 mt-1" />
              <span>Faça esta operação em um período seguro. Usuários conectados podem ficar temporariamente sem acesso.</span>
            </div>
            <button
              type="button"
              className="btn btn-danger w-100 d-flex align-items-center justify-content-center gap-2 mt-3"
              onClick={startUpdate}
              disabled={starting || status === "running"}
            >
              {starting || status === "running" ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
              {status === "running" ? "Atualização em andamento" : "Atualizar sistema"}
            </button>
            <div className="small text-muted text-center mt-3 d-flex align-items-center justify-content-center gap-1">
              <ShieldCheck size={14} /> Disponível somente para administradores
            </div>
          </section>
        </div>

        <div className="col-xl-8">
          <section className="platform-card overflow-hidden h-100">
            <div className="p-4 border-bottom">
              <div className="d-flex justify-content-between align-items-center gap-3 mb-2">
                <div className="d-flex align-items-center gap-2 fw-bold"><StatusIcon size={18} /> Progresso da atualização</div>
                <strong>{progress}%</strong>
              </div>
              <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} style={{ height: 9 }}>
                <div className={`progress-bar ${status === "failed" ? "bg-danger" : "bg-success"} ${status === "running" ? "progress-bar-striped progress-bar-animated" : ""}`} style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div style={{ background: "#0f172a" }}>
              <div className="d-flex align-items-center gap-2 px-4 py-2 border-bottom border-secondary text-secondary small">
                <span className="rounded-circle bg-danger" style={{ width: 10, height: 10 }} />
                <span className="rounded-circle bg-warning" style={{ width: 10, height: 10 }} />
                <span className="rounded-circle bg-success" style={{ width: 10, height: 10 }} />
                <span className="ms-2">registro da implantação</span>
              </div>
              <pre ref={terminalRef} className="m-0 p-4" style={{ minHeight: 360, maxHeight: 500, overflowY: "auto", color: "#86efac", fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {logs || "Nenhuma atualização executada nesta instalação."}
              </pre>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
