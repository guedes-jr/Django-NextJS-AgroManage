"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useNotificationContext } from "./NotificationProvider";
import MarketingContent from "./MarketingContent";
import styles from "./CampaignAlertBanner.module.css";

export default function CampaignAlertBanner() {
  const { notifications, markAsRead } = useNotificationContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = notifications.filter(item => item.promotion && !item.is_read && !item.is_archived && !dismissed.includes(item.id));
  const current = pending[0];
  const currentId = current?.id;

  useEffect(() => {
    if (!currentId || !dialog.current) return;
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!element.open) element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [currentId]);

  if (!current?.promotion) return null;

  const dismiss = () => {
    setDismissed(previous => [...previous, ...pending.map(item => item.id)]);
    setError("");
  };
  const acknowledge = async () => {
    setBusy(true);
    setError("");
    try { await markAsRead(current.id); }
    catch { setError("Não foi possível confirmar a leitura. Tente novamente."); }
    finally { setBusy(false); }
  };

  return <dialog ref={dialog} className={styles.dialog} aria-label="Comunicados pendentes" aria-labelledby="campaign-alert-title" onCancel={event => {event.preventDefault(); if (!busy) dismiss();}}>
    <header className={styles.header}>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
      <strong>{current.category === "marketing" ? "Nova divulgação" : "Comunicado da plataforma"}</strong>
      <span className="small">{pending.length} comunicado(s) não lido(s)</span>
      </div>
      <h2 id="campaign-alert-title" className="h4 mb-0">{current.title || "Mensagem da plataforma"}</h2>
    </header>
    <div className={styles.content}>
      {!!current.promotion.images.length && <div className={styles.media}>{current.promotion.images.map(image => <Image key={image.id} unoptimized src={image.image} width={1600} height={1000} alt={current.title || "Imagem do comunicado"} className={styles.image}/>)}</div>}
      {(current.promotion.body || current.promotion.link_url) && <div className={styles.text}><MarketingContent body={current.promotion.body} link_url={current.promotion.link_url} link_label={current.promotion.link_label}/></div>}
    </div>
    <footer className={styles.footer}>
      {error && <p role="alert" className="text-danger mb-2">{error}</p>}
      <div className="d-flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={() => void acknowledge()}>{busy ? "Confirmando…" : "Li este comunicado"}</button>
        <button className="btn btn-outline-secondary" disabled={busy} onClick={dismiss}>Ver depois</button>
        <Link href="/home/notifications" onClick={dismiss} className="btn btn-link">Ver todas as notificações</Link>
      </div>
    </footer>
  </dialog>;
}
