"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, RefreshCw } from "lucide-react";
import { platformService } from "@/services/platformApi";

type Contact = { id: string; name: string; phone: string; organization: string };
const statusLabels: Record<string, string> = {
  CLOSED: "Desconectada", DISCONNECTED: "Desconectada", INITIALIZING: "Iniciando sessão",
  STARTING: "Iniciando sessão", QRCODE: "Aguardando leitura do QR Code",
  CONNECTING: "Conectando", SYNCING: "Sincronizando", unavailable: "Indisponível",
};

export default function Page() {
  const [status, setStatus] = useState("Carregando");
  const [connected, setConnected] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    platformService.whatsappContacts().then(data => { if (active) setContacts(data); })
      .catch(() => { if (active) setError("Não foi possível carregar os contatos."); });
    const poll = async () => {
      const current = generation.current;
      try {
        const session = await platformService.whatsappWebStatus();
        if (!active || current !== generation.current) return;
        setConnected(Boolean(session.connected));
        if (session.connected) {
          setStatus("Conectada");
          setQr(null);
        } else if (session.status === "unavailable" || !session.configured) {
          setStatus(session.detail || "Integração indisponível");
          setQr(null);
        } else {
          const result = await platformService.whatsappWebQrCode();
          if (!active || current !== generation.current) return;
          setQr(result.qrcode || null);
          setStatus(result.qrcode ? "Aguardando leitura do QR Code" : statusLabels[result.status || ""] || result.status || "Desconectada");
        }
      } catch {
        if (active && current === generation.current) {
          setConnected(false);
          setQr(null);
          setStatus("Não foi possível consultar a sessão. Tentando novamente…");
        }
      } finally {
        if (active) timer = setTimeout(() => void poll(), 4000);
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, []);

  const start = async () => {
    generation.current += 1;
    setBusy(true); setError(""); setFeedback(""); setQr(null); setStatus("Iniciando sessão…");
    try {
      const result = await platformService.startWhatsappWeb();
      setQr(result.qrcode || null);
      setStatus(result.qrcode ? "Aguardando leitura do QR Code" : "Preparando conexão…");
    } catch {
      setStatus("Indisponível");
      setError("Não foi possível iniciar a sessão do WhatsApp. Verifique o serviço e tente novamente.");
    } finally { setBusy(false); }
  };

  const send = async () => {
    setBusy(true); setError(""); setFeedback("");
    try {
      await platformService.sendWhatsappMessage(phone, msg);
      setFeedback("Mensagem enviada com sucesso."); setMsg("");
    } catch { setError("Não foi possível enviar a mensagem. Confira o número e a conexão."); }
    finally { setBusy(false); }
  };

  return <>
    <header className="mb-4"><div className="platform-label mb-2">Integrações</div><h1 className="h2 fw-bold"><MessageCircle size={28} /> WhatsApp Web</h1><p className="text-muted">Pareie o número empresarial para enviar mensagens e alertas reprodutivos aos usuários com essa preferência ativada.</p></header>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {feedback && <div className="alert alert-success" role="status">{feedback}</div>}
    <section className="platform-card p-4">
      <div className="d-flex flex-wrap gap-3 justify-content-between"><div><h2 className="h5">Sessão WhatsApp</h2><p aria-live="polite">Status: <strong>{status}</strong></p></div><button className="btn btn-success" disabled={busy || connected} onClick={() => void start()}><RefreshCw size={16} /> {busy ? "Aguarde…" : "Gerar QR Code"}</button></div>
      {qr && <div className="text-center border-top pt-4"><p>WhatsApp → Dispositivos conectados → Conectar dispositivo</p><img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR Code para conectar o WhatsApp" width={280} height={280} style={{ maxWidth: "100%", height: "auto" }} /><p className="text-muted small mt-2">O QR Code e o status são atualizados automaticamente.</p></div>}
    </section>
    <section className="platform-card p-4 mt-4"><h2 className="h5">Enviar mensagem individual</h2>
      <select aria-label="Contato WhatsApp" className="form-select mb-2" value={phone} onChange={e => setPhone(e.target.value)}><option value="">Escolha um contato WhatsApp cadastrado</option>{contacts.map(c => <option key={c.id} value={c.phone}>{c.name} · {c.organization}</option>)}</select>
      <input aria-label="Telefone" className="form-control mb-2" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ou informe 55DDDNUMERO" />
      <textarea aria-label="Mensagem" className="form-control mb-2" value={msg} maxLength={4096} onChange={e => setMsg(e.target.value)} placeholder="Mensagem" />
      <button className="btn btn-success" disabled={!connected || !phone || !msg.trim() || busy} onClick={() => void send()}>Enviar</button>
    </section>
  </>;
}
