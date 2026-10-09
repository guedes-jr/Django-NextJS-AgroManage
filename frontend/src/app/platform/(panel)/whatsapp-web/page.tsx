"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import axios from "axios";
import { Activity, ArrowRight, BellRing, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Link2, MessageCircle, QrCode, RefreshCw, Send, ShieldCheck, Smartphone, Unplug, Users, WifiOff } from "lucide-react";
import { platformService, type WhatsAppAccount, type WhatsAppAlerts, type WhatsAppDeliveryStatus, type WhatsAppSession } from "@/services/platformApi";
import styles from "./page.module.css";

type Contact = { id: string; name: string; phone: string; organization: string };
const labels: Record<string, string> = {
  CLOSED: "Desconectado", DISCONNECTED: "Desconectado", INITIALIZING: "Preparando QR", STARTING: "Preparando QR",
  QRCODE: "Aguardando leitura", CONNECTING: "Conectando", SYNCING: "Sincronizando", isLogged: "Sincronizando",
  qrReadSuccess: "Sincronizando", inChat: "Sincronizando", notLogged: "Aguardando leitura", browserClose: "Desconectado",
  autocloseCalled: "Sessão encerrada", unavailable: "Indisponível",
};
const deliveryLabels: Record<WhatsAppDeliveryStatus, string> = { pending: "Pendente", sent: "Enviado", failed: "Falhou", skipped: "Não enviado" };
const testMessage = "Olá! Esta é uma mensagem de teste da integração WhatsApp do Fazenda Mais.";
function digits(value: string) { return value.replace(/\D/g, ""); }
function normalizedPhone(value: string) { const number = digits(value); if (value.trim().startsWith("+") && !number.startsWith("55")) return number; return number.length === 10 || number.length === 11 ? `55${number}` : number; }
function formatPhone(value: string) {
  const number = normalizedPhone(value);
  if (!/^55\d{10,11}$/.test(number)) return value;
  return `+55 (${number.slice(2, 4)}) ${number.slice(4, -4)}-${number.slice(-4)}`;
}
function date(value: string | null, timeOnly = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", timeOnly ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function errorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<{detail?: string}>(error) && error.response?.data.detail) return error.response.data.detail;
  return fallback;
}

export default function Page() {
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [account, setAccount] = useState<WhatsAppAccount | null>(null);
  const [accountDetail, setAccountDetail] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsError, setContactsError] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(testMessage);
  const [action, setAction] = useState<"start" | "reconnect" | "disconnect" | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [checking, setChecking] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [slow, setSlow] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [alerts, setAlerts] = useState<WhatsAppAlerts | null>(null);
  const [alertsError, setAlertsError] = useState("");
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<WhatsAppDeliveryStatus | "">("");
  const waitingSince = useRef<number | null>(null);
  const accountCache = useRef<{value: WhatsAppAccount | null; detail: string; at: number} | null>(null);
  const actionLock = useRef(false);
  const sendLock = useRef(false);
  const connected = Boolean(session?.connected);
  const busy = Boolean(action);
  const phoneValid = /^55\d{10,11}$/.test(normalizedPhone(phone));
  const status = action === "disconnect" ? "Desconectando…" : action ? "Preparando conexão…" : connected ? "Conectado" : qr ? "Aguardando leitura" : session ? labels[session.status] || "Conectando" : "Consultando sessão…";
  const unavailable = session?.status === "unavailable";
  const stage = connected ? 3 : qr ? 1 : session && ["CONNECTING", "SYNCING", "isLogged", "qrReadSuccess", "inChat"].includes(session.status) ? 2 : 0;

  useEffect(() => {
    let active = true;
    platformService.whatsappContacts().then(data => { if (active) setContacts(data); })
      .catch(() => { if (active) setContactsError("Os contatos não puderam ser carregados. Você pode informar um telefone abaixo."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (action) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      setChecking(true);
      try {
        const result = await platformService.whatsappWebStatus();
        if (!active) return;
        setSession(result);
        if (result.connected) {
          setQr(null); setSlow(false); waitingSince.current = null;
          if (!accountCache.current || Date.now() - accountCache.current.at > 60000) {
            try {
              const profile = await platformService.whatsappAccount();
              if (!active) return;
              accountCache.current = {value: profile.account, detail: profile.detail, at: Date.now()};
            } catch (err) {
              if (!active) return;
              accountCache.current = {value: null, detail: errorMessage(err, "A conta está conectada, mas seus dados não puderam ser consultados."), at: Date.now()};
            }
          }
          setAccount(accountCache.current.value); setAccountDetail(accountCache.current.detail);
        } else {
          accountCache.current = null; setAccount(null); setAccountDetail("");
          if (result.configured && result.status !== "unavailable") {
            setQr(result.qrcode || null);
            const pending = Boolean(result.qrcode) || !["CLOSED", "DISCONNECTED", "browserClose", "autocloseCalled", ""].includes(result.status || "");
            waitingSince.current = pending ? waitingSince.current ?? Date.now() : null;
            setSlow(waitingSince.current !== null && Date.now() - waitingSince.current > 90000);
          } else { setQr(null); setSlow(false); waitingSince.current = null; }
        }
      } catch (err) {
        if (active) {
          setSession(previous => ({ configured: previous?.configured ?? false, status: "unavailable", connected: false, detail: errorMessage(err, "Não foi possível consultar o WhatsApp. Verifique o serviço e tente atualizar."), checked_at: previous?.checked_at || "" }));
          setQr(null); setAccount(null); accountCache.current = null;
        }
      } finally {
        if (active) { setChecking(false); timer = setTimeout(() => void poll(), 4000); }
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [action, refresh]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      setAlertsLoading(true);
      try {
        const data = await platformService.whatsappAlerts(page, filter);
        if (active) { setAlerts(data); setAlertsError(""); }
      } catch (err) {
        if (active) setAlertsError(errorMessage(err, "Não foi possível carregar o histórico de alertas."));
      } finally {
        if (active) { setAlertsLoading(false); timer = setTimeout(() => void load(), 30000); }
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [page, filter, refresh]);

  const runAction = async (next: NonNullable<typeof action>) => {
    if (actionLock.current || sendLock.current) return;
    actionLock.current = true;
    setAction(next); setError(""); setFeedback(""); setConfirmDisconnect(false); setChecking(false);
    setQr(null); setAccount(null); accountCache.current = null;
    try {
      if (next === "disconnect") {
        await platformService.disconnectWhatsappWeb();
        setSession(previous => previous ? { ...previous, connected: false, status: "CLOSED" } : null);
        waitingSince.current = null; setSlow(false);
        setFeedback("Conta desconectada. Para vincular novamente, gere um novo QR Code.");
      } else {
        const result = next === "reconnect" ? await platformService.reconnectWhatsappWeb() : await platformService.startWhatsappWeb();
        setQr(result.qrcode || null); waitingSince.current = Date.now();
        setSession(previous => ({ configured: true, connected: false, status: result.status || "STARTING", checked_at: previous?.checked_at || "", detail: "" }));
        setFeedback(next === "reconnect" ? "Reconexão solicitada. Aguarde a atualização da sessão." : "Sessão iniciada. O QR aparecerá assim que estiver pronto.");
      }
    } catch (err) { setError(errorMessage(err, "Não foi possível atualizar a sessão. Verifique o serviço do WhatsApp.")); }
    finally { actionLock.current = false; setAction(null); }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!connected || !phoneValid || !message.trim() || sendLock.current || actionLock.current) return;
    sendLock.current = true; setSending(true); setError(""); setFeedback("");
    try {
      await platformService.sendWhatsappMessage(normalizedPhone(phone), message.trim());
      setFeedback(`Mensagem enviada para ${formatPhone(phone)}. Confira o recebimento no celular.`);
    } catch (err) { setError(errorMessage(err, "Não foi possível enviar. Confira o telefone e a conexão.")); }
    finally { sendLock.current = false; setSending(false); }
  };

  const overview = alerts?.overview;
  return <div className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}><Link2 size={14} /> Integrações / Comunicação</span><h1>WhatsApp <span>empresarial</span></h1><p>Conecte sua conta e acompanhe os alertas da fazenda em um só lugar.</p></div><div className={styles.headerNote}><ShieldCheck size={18} /><span>Gerenciamento da plataforma<br /><strong>Alertas com adesão do usuário</strong></span></div></header>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {feedback && <div className={styles.success} role="status"><CheckCircle2 size={18} />{feedback}</div>}
    <div className={styles.metrics}>
      <div className={styles.metric}><span className={styles.metricIcon}><Users size={20} /></span><div><small>Usuários aptos a receber</small><strong>{overview ? overview.eligible_users : "—"}</strong><span>{overview ? `${overview.opted_in_users} com alertas ativados` : "Carregando preferências"}</span></div></div>
      {(["sent", "pending", "failed"] as const).map((value) => <div className={styles.metric} key={value}><span className={`${styles.metricIcon} ${styles[value]}`}>{value === "sent" ? <CheckCircle2 size={20} /> : value === "pending" ? <Clock3 size={20} /> : <WifiOff size={20} />}</span><div><small>Alertas {value === "sent" ? "enviados" : value === "pending" ? "pendentes" : "com falha"}</small><strong>{overview ? overview.counts[value] : "—"}</strong><span>Total registrado no sistema</span></div></div>)}
    </div>
    <div className={styles.grid}>
      <section className={`${styles.card} ${styles.connection}`}>
        <div className={styles.cardHeader}><div className={styles.title}><span className={styles.icon}><MessageCircle size={21} /></span><div><h2>Conexão da conta</h2><p>Um número empresarial para os envios</p></div></div><span className={`${styles.badge} ${connected ? styles.sent : unavailable ? styles.failed : styles.pending}`} aria-live="polite"><span className={styles.dot} />{status}</span></div>
        <ol className={styles.steps}>{["Preparar QR", "Ler no celular", "Sincronizar", "Conectado"].map((label, index) => <li key={label} className={index <= stage ? styles.current : ""} aria-current={index === stage ? "step" : undefined}><span>{index < stage ? <Check size={13} /> : index + 1}</span>{label}</li>)}</ol>
        <div className={styles.pairing}>
          <div className={styles.qrPanel}>{qr && !busy ? <><Image unoptimized src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} width={224} height={224} alt="QR Code para parear o WhatsApp" /><span><RefreshCw size={12} /> Renovado automaticamente</span></> : <><div className={`${styles.qrPlaceholder} ${connected ? styles.ready : ""}`}>{connected ? <CheckCircle2 size={58} strokeWidth={1.3} /> : unavailable ? <WifiOff size={58} strokeWidth={1.3} /> : <QrCode size={68} strokeWidth={1.2} />}</div><strong>{connected ? "Conta conectada" : busy ? "Preparando sessão…" : "Conecte seu WhatsApp"}</strong><span>{connected ? "Pronta para enviar mensagens" : "O QR Code aparecerá aqui"}</span></>}</div>
          <div className={styles.instructions}>{connected ? <><span className={styles.eyebrow}>Conta vinculada</span><h3>{account?.name || "WhatsApp empresarial"}</h3><p className={styles.accountPhone}>{account?.phone ? formatPhone(account.phone) : "Número não disponibilizado pelo serviço"}</p>{accountDetail && <p className={styles.muted}>{accountDetail}</p>}<div className={styles.tip}><ShieldCheck size={18} /><p>Confira o número antes de enviar. Os alertas usam o telefone cadastrado no perfil de cada usuário.</p></div></> : <><h3>Conecte em poucos passos</h3><ol><li>Abra o WhatsApp do número empresarial.</li><li>Acesse <strong>Dispositivos conectados</strong>.</li><li>Toque em <strong>Conectar dispositivo</strong> e leia o QR Code.</li><li>Aguarde a sincronização terminar.</li></ol><p className={styles.muted}>Mantenha a conexão com a internet durante o pareamento. O status é atualizado a cada 4 segundos.</p></>}</div>
        </div>
        {unavailable && <div className={styles.error} role="alert">{session?.detail || "O serviço de conexão está indisponível."}</div>}
        {slow && !connected && !busy && <div className={styles.warning} role="status"><Clock3 size={18} /><div><strong>O pareamento está demorando</strong><p>Se já leu o QR, confira a internet e a lista de dispositivos no celular. Use Reconectar se a sincronização continuar parada.</p></div></div>}
        <div className={styles.actions}><button className={styles.primary} disabled={busy || sending || connected || !session?.configured} onClick={() => void runAction("start")}><QrCode size={16} />{action === "start" ? "Preparando…" : "Gerar QR Code"}</button><button className={styles.secondary} disabled={busy || checking} onClick={() => { accountCache.current = null; setRefresh(value => value + 1); }}><RefreshCw size={16} className={checking ? styles.spin : ""} />Atualizar status</button><button className={styles.secondary} disabled={busy || sending || !session?.configured} onClick={() => void runAction("reconnect")}><Link2 size={16} />Reconectar</button>{connected && <button className={styles.dangerButton} disabled={busy || sending} onClick={() => setConfirmDisconnect(true)}><Unplug size={16} />Desconectar</button>}</div>
        {confirmDisconnect && <div className={styles.warning} role="alert"><div><strong>Desconectar esta conta?</strong><p>Os envios ficarão indisponíveis até um novo pareamento por QR Code.</p><div className={styles.actions}><button className={styles.dangerButton} disabled={busy || sending} onClick={() => void runAction("disconnect")}>Confirmar desconexão</button><button className={styles.secondary} onClick={() => setConfirmDisconnect(false)}>Cancelar</button></div></div></div>}
        <div className={styles.lastCheck}><Activity size={13} />Última consulta: {date(session?.checked_at || null, true)}<span>Atualização automática</span></div>
      </section>
      <section className={styles.card}><div className={styles.title}><span className={styles.icon}><Send size={20} /></span><div><h2>Testar integração</h2><p>Confirme o recebimento no celular</p></div></div><div className={`${styles.testStatus} ${connected ? styles.ready : ""}`}>{connected ? <CheckCircle2 size={16} /> : <Smartphone size={16} />}{connected ? "Conta pronta para o teste" : "Conecte a conta para enviar"}</div>
        <form onSubmit={send} className={styles.form}><label htmlFor="wa-contact">Contato cadastrado</label><select id="wa-contact" value={contacts.some(contact => contact.phone === phone) ? phone : ""} onChange={event => setPhone(event.target.value)}><option value="">Selecione um contato (opcional)</option>{contacts.map(contact => <option key={contact.id} value={contact.phone}>{contact.name} · {contact.organization}</option>)}</select>{contactsError && <p className={styles.muted}>{contactsError}</p>}<label htmlFor="wa-phone">Telefone de destino</label><input id="wa-phone" type="tel" autoComplete="tel" value={phone} placeholder="(81) 99999-0000" maxLength={30} onChange={event => setPhone(event.target.value)} onBlur={() => { if (phoneValid) setPhone(formatPhone(phone)); }} aria-describedby="wa-phone-help" aria-invalid={Boolean(phone && !phoneValid)} /><small id="wa-phone-help">{phone && !phoneValid ? "Informe DDD e número brasileiro válido." : "Aceita DDD e número, com ou sem +55."}</small><label htmlFor="wa-message">Mensagem</label><textarea id="wa-message" rows={4} maxLength={4096} value={message} onChange={event => setMessage(event.target.value)} /><div className={styles.messageMeta}><button type="button" onClick={() => setMessage(testMessage)}>Usar mensagem de teste</button><span>{message.length}/4096</span></div><button type="submit" className={styles.primary} disabled={!connected || !phoneValid || !message.trim() || busy || sending}><Send size={16} />{sending ? "Enviando…" : "Enviar mensagem"}<ArrowRight size={16} /></button></form><p className={styles.testFootnote}>O teste envia uma mensagem real para o telefone informado.</p>
      </section>
    </div>
    <section className={styles.card}><div className={styles.cardHeader}><div className={styles.title}><span className={styles.icon}><BellRing size={20} /></span><div><h2>Alertas automáticos</h2><p>Preferências e entregas do canal WhatsApp</p></div></div><span className={styles.meta}>Atualizado: {date(overview?.checked_at || null, true)} · a cada 30s</span></div>
      <div className={styles.alertInfo}><div><strong>Eventos disponíveis</strong><div className={styles.eventTags}>{(overview?.alert_types || ["Vacinas reprodutivas programadas", "Próxima cobertura"]).map(type => <span key={type}><CheckCircle2 size={14} />{type}</span>)}</div></div><p>Recebem os proprietários e administradores da organização com alertas de animais e WhatsApp ativados e telefone válido. {overview && overview.invalid_phone_users > 0 && <strong>{overview.invalid_phone_users} usuário(s) com adesão precisam corrigir o telefone.</strong>}</p></div>
      <div className={styles.historyToolbar}><h3>Últimas entregas <span>{alerts?.count ?? "—"}</span></h3><label>Filtrar por status<select value={filter} onChange={event => { setFilter(event.target.value as WhatsAppDeliveryStatus | ""); setPage(1); }}><option value="">Todos os status</option>{Object.entries(deliveryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      {alertsError && <div className={styles.error} role="alert">{alertsError}<button className={styles.secondary} onClick={() => setRefresh(value => value + 1)}>Tentar novamente</button></div>}
      {alertsLoading && <p className={styles.muted} role="status">Atualizando entregas…</p>}
      {!alertsLoading && !alertsError && alerts?.results.length === 0 && <div className={styles.empty}><BellRing size={30} /><h3>{filter ? "Nenhuma entrega com este status" : "Nenhum alerta enviado ainda"}</h3><p>{filter ? "Escolha outro filtro para consultar o histórico." : "As entregas aparecerão aqui quando um evento elegível gerar um alerta."}</p></div>}
      {alerts && alerts.results.length > 0 && <div className={styles.tableScroll} aria-busy={alertsLoading}><table className={styles.table}><thead><tr><th>Alerta / destinatário</th><th>Organização</th><th>Status</th><th>Tentativas</th><th>Data</th></tr></thead><tbody>{alerts.results.map(delivery => <tr key={delivery.id}><td><strong>{delivery.title}</strong><span>{delivery.recipient} · {formatPhone(delivery.phone)}</span>{delivery.last_error && <details><summary>Ver motivo</summary><p>{delivery.last_error}</p></details>}</td><td>{delivery.organization || "—"}</td><td><span className={`${styles.badge} ${styles[delivery.status]}`}>{deliveryLabels[delivery.status]}</span></td><td>{delivery.attempts}</td><td><time dateTime={delivery.delivered_at || delivery.created_at}>{date(delivery.delivered_at || delivery.created_at)}</time><span>{delivery.delivered_at ? "Enviado" : "Criado"}</span></td></tr>)}</tbody></table></div>}
      <footer className={styles.historyFooter}><span>“Enviado” indica aceite pelo serviço; a leitura no celular não é confirmada.</span><div><button aria-label="Página anterior" className={styles.secondary} disabled={alertsLoading || page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} /></button><span>Página {page}</span><button aria-label="Próxima página" className={styles.secondary} disabled={alertsLoading || !alerts?.next} onClick={() => setPage(value => value + 1)}><ChevronRight size={16} /></button></div></footer>
    </section>
  </div>;
}
