"use client";

import Link from "next/link";
import { useState } from "react";
import { useNotificationContext } from "./NotificationProvider";
import MarketingContent from "./MarketingContent";

export default function CampaignAlertBanner() {
  const { notifications, markAsRead } = useNotificationContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = notifications.filter(item => item.promotion && !item.is_read && !item.is_archived);
  const current = pending[0];
  if (!current?.promotion) return null;

  const acknowledge = async () => {
    setBusy(true);
    setError("");
    try { await markAsRead(current.id); }
    catch { setError("Não foi possível confirmar a leitura. Tente novamente."); }
    finally { setBusy(false); }
  };

  return <section className="alert alert-info mb-4" aria-label="Comunicados pendentes" aria-live="polite">
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
      <strong>{current.category === "marketing" ? "Nova divulgação" : "Comunicado da plataforma"}</strong>
      <span className="small">{pending.length} comunicado(s) não lido(s)</span>
    </div>
    {current.title && <h2 className="h5">{current.title}</h2>}
    <MarketingContent {...current.promotion}/>
    {error && <p role="alert" className="text-danger mt-2">{error}</p>}
    <div className="d-flex flex-wrap gap-2 mt-3">
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void acknowledge()}>{busy ? "Confirmando…" : "Li este comunicado"}</button>
      <Link href="/home/notifications" className="btn btn-outline-primary btn-sm">Ver todas as notificações</Link>
    </div>
  </section>;
}
