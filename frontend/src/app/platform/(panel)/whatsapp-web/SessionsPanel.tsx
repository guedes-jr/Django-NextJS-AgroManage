"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Activity, AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, RotateCcw, Square } from "lucide-react";
import { platformService, type WhatsAppSessionList } from "@/services/platformApi";
import styles from "./page.module.css";

const labels: Record<string, string> = {
  CLOSED: "Encerrada", INITIALIZING: "Iniciando navegador", STARTING: "Iniciando",
  CONNECTING: "Conectando", SYNCING: "Sincronizando", qrReadSuccess: "Sincronizando",
  QRCODE: "Aguardando leitura do QR", notLogged: "Aguardando pareamento",
  CONNECTED: "Conectada", isLogged: "Conectada", DISCONNECTED: "Desconectada", unavailable: "Indisponível",
};
function elapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}min`;
}
function errorDetail(error: unknown) {
  if (axios.isAxiosError<{detail?: string}>(error) && error.response?.data.detail) return error.response.data.detail;
  return "Não foi possível concluir a operação. Atualize as sessões antes de tentar novamente.";
}

type Confirmation = {operation: "close"; name: string} | {operation: "restart"};
export default function SessionsPanel({disabled, onBusyChange, onChanged}: {
  disabled: boolean; onBusyChange: (busy: boolean) => void; onChanged: () => void;
}) {
  const [data, setData] = useState<WhatsAppSessionList | null>(null);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    if (pending || disabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      setLoading(true);
      try {
        const result = await platformService.whatsappSessions(page);
        if (active) { setData(result); setLoadError(""); }
      } catch (err) { if (active) setLoadError(errorDetail(err)); }
      finally {
        if (active) { setLoading(false); timer = setTimeout(() => void load(), 15000); }
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [page, refresh, pending, disabled]);

  const operate = async (operation: "close" | "reconnect" | "restart", name?: string) => {
    if (lock.current || disabled) return;
    lock.current = true; setPending(true); onBusyChange(true);
    setError(""); setFeedback(""); setConfirmation(null);
    try {
      const result = operation === "restart" ? await platformService.restartWhatsappService()
        : await platformService.manageWhatsappSession(name!, operation);
      setFeedback(result.detail); onChanged();
    } catch (err) { setError(errorDetail(err)); }
    finally {
      lock.current = false; setPending(false); onBusyChange(false); setRefresh(value => value + 1);
    }
  };
  const blocked = pending || disabled;
  return <section className={styles.card}>
    <div className={styles.cardHeader}><div className={styles.title}><span className={styles.icon}><Activity size={20} /></span><div><h2>Sessões do WhatsApp</h2><p>Identifique demoras persistentes e recupere as conexões</p></div></div><button className={styles.secondary} disabled={blocked || loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} className={loading ? styles.spin : ""} />Atualizar sessões</button></div>
    <p className={styles.muted}>O tempo indica há quanto tempo o estado foi observado pelo sistema. A espera pela leitura do QR não é considerada travamento.</p>
    {loadError && <div className={styles.error} role="alert">{loadError}</div>}
    {data?.detail && <p className={styles.muted}>{data.detail}</p>}
    {error && <div className={styles.error} role="alert">{error}</div>}
    {feedback && <div className={styles.success} role="status">{feedback}</div>}
    {loading && !data && <p className={styles.muted} role="status">Consultando sessões…</p>}
    {pending && <p className={styles.muted} role="status">Executando operação. Aguarde a atualização do serviço…</p>}
    {data && <div className={styles.tableScroll} aria-busy={loading || pending}><table className={styles.table}><thead><tr><th>Sessão</th><th>Estado observado</th><th>Tempo no estado</th><th>Ações</th></tr></thead><tbody>{data.results.map(session => <tr key={session.name}><td><strong>{session.name}</strong>{session.configured_session && <span>Sessão usada para os alertas</span>}{(session.last_error || session.detail) && <details><summary>Último erro</summary><p>{session.detail || session.last_error}</p></details>}</td><td><span className={`${styles.badge} ${session.suspected_stuck || session.status === "unavailable" ? styles.failed : ["CONNECTED", "isLogged"].includes(session.status) ? styles.sent : styles.pending}`}>{labels[session.status] || session.status}</span>{session.suspected_stuck && <div className={styles.stuckHint}><AlertTriangle size={13} />Possível travamento</div>}</td><td>{elapsed(session.elapsed_seconds)}<span>Desde {new Date(session.state_since).toLocaleTimeString("pt-BR")}</span></td><td><div className={styles.sessionActions}><button className={styles.secondary} disabled={blocked || loading || Boolean(loadError) || !session.can_reconnect} onClick={() => void operate("reconnect", session.name)}><RotateCcw size={14} />Reconectar</button><button className={styles.dangerButton} disabled={blocked || loading || Boolean(loadError) || !session.can_close} onClick={() => setConfirmation({operation:"close",name:session.name})}><Square size={13} />Encerrar</button></div></td></tr>)}</tbody></table></div>}
    {!loading && !loadError && data?.results.length === 0 && <p className={styles.muted}>Nenhuma sessão disponível.</p>}
    <div className={styles.recoveryBar}><div><strong>Recuperação do serviço</strong><p>Use quando o navegador estiver bloqueado ou o encerramento normal falhar. A reinicialização interrompe todas as sessões e preserva o pareamento.</p>{data && !data.recovery_enabled && <span>A recuperação pela página não está habilitada neste servidor.</span>}</div><button className={styles.dangerButton} disabled={blocked || !data?.recovery_enabled} onClick={() => setConfirmation({operation:"restart"})}><RotateCcw size={16} />Reiniciar WPPConnect</button></div>
    {confirmation && <div className={styles.warning} role="alert"><AlertTriangle size={18} /><div><strong>{confirmation.operation === "restart" ? "Reiniciar o serviço de todas as sessões?" : `Encerrar a sessão ${confirmation.name}?`}</strong><p>{confirmation.operation === "restart" ? "Todas as conexões e os envios serão interrompidos durante a reinicialização. Os dados de pareamento serão mantidos." : "O navegador desta sessão será encerrado. O número continuará pareado, e você poderá reconectar depois."}</p><div className={styles.actions}><button className={styles.dangerButton} disabled={blocked} onClick={() => void (confirmation.operation === "restart" ? operate("restart") : operate("close", confirmation.name))}>Confirmar {confirmation.operation === "restart" ? "reinicialização" : "encerramento"}</button><button className={styles.secondary} disabled={pending} onClick={() => setConfirmation(null)}>Cancelar</button></div></div></div>}
    <footer className={styles.historyFooter}><span>{data ? `${data.count} sessão(ões) · Atualizado às ${new Date(data.checked_at).toLocaleTimeString("pt-BR")}` : "Atualização automática a cada 15 segundos"}</span><div><button className={styles.secondary} aria-label="Página anterior de sessões" disabled={blocked || loading || page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={15} /></button><span>Página {page}</span><button className={styles.secondary} aria-label="Próxima página de sessões" disabled={blocked || loading || !data?.has_next} onClick={() => setPage(value => value + 1)}><ChevronRight size={15} /></button></div></footer>
  </section>;
}
