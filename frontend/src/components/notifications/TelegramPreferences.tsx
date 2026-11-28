"use client";

import { useEffect, useState } from "react";
import { useOrganizationLocale } from "@/lib/locale";
import notificationService, { type TelegramConnection } from "@/services/notificationService";

export default function TelegramPreferences({ enabled, onChange }: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const { t } = useOrganizationLocale();
  const [connection, setConnection] = useState<TelegramConnection | null>(null);
  const [link, setLink] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void notificationService.getTelegramConnection(controller.signal)
      .then(setConnection)
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);

  async function run(action: () => Promise<TelegramConnection>) {
    setBusy(true);
    setFailed(false);
    try {
      const result = await action();
      setConnection(result);
      if (result.status !== "awaiting_telegram" || result.link) setLink(result.link);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const status = connection?.status;
  if (status === "unavailable") return null;
  const canStart = status === "disconnected" || status === "awaiting_telegram";
  const canOpen = status === "awaiting_telegram" && link && /^https:\/\/t\.me\/[a-z0-9_]{5,32}\?start=[\w-]{43}$/.test(link);

  return (
    <section className="dashboard-card p-4 border-dashed mb-4" aria-label="Telegram" aria-busy={busy}>
      <h4 className="fw-bold small mb-1">Telegram</h4>
      <p className="small text-muted mb-2" role="status">
        {status ? t(`notificationTelegram.${status}`) : busy && t("notificationTelegram.loading")}
      </p>
      {connection?.requires_phone_verification && <p className="small text-muted">{t("notificationTelegram.awaiting_phone")}</p>}
      {failed && <p className="small text-danger" role="alert">{t("notificationTelegram.failed")}</p>}
      {status === "connected" && <label className="form-check form-switch mb-2">
        <input className="form-check-input" type="checkbox" checked={enabled} onChange={event => onChange(event.target.checked)} />
        {t("notificationTelegram.enableAlerts")}
      </label>}
      <div className="d-flex flex-wrap gap-2">
        {canStart && <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => void run(notificationService.startTelegramConnection)}>
          {t(status === "disconnected" ? "notificationTelegram.connect" : "notificationTelegram.newLink")}
        </button>}
        {canOpen && !busy && <a className="btn btn-sm btn-outline-secondary" href={link} target="_blank" rel="noopener noreferrer">
          {t("notificationTelegram.open")}
        </a>}
        {status === "ready_to_confirm" && <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => void run(notificationService.confirmTelegramConnection)}>
          {t("notificationTelegram.confirm")}
        </button>}
        {status && status !== "disconnected" && <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => void run(notificationService.removeTelegramConnection)}>
          {t(status === "connected" ? "notificationTelegram.disconnect" : "notificationTelegram.cancel")}
        </button>}
        {(failed || status === "awaiting_telegram" || status === "awaiting_phone" || status === "connected") && <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => void run(notificationService.getTelegramConnection)}>
          {t("notificationTelegram.refresh")}
        </button>}
      </div>
    </section>
  );
}
