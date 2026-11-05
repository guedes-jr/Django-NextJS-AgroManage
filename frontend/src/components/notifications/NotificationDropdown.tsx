"use client";

import { Bell, CheckCheck, Trash2, Loader2, Package, Beef, Receipt, FileText } from "lucide-react";
import Link from "next/link";
import { newestAlerts, ALERT_PREVIEW_LIMIT, ALERTS_PAGE } from "@/services/operationalAlertPresentation";
import { useState } from "react";
import useNotifications from "@/hooks/useNotifications";
import { useOrganizationLocale } from "@/lib/locale";

interface Props {
  onClose: () => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  system: <Bell size={16} />,
  stock: <Package size={16} />,
  animal: <Beef size={16} />,
  finance: <Receipt size={16} />,
  report: <FileText size={16} />,
};

export default function NotificationDropdown({ onClose }: Props) {
  const { language, t } = useOrganizationLocale();
  const {
    operationalAlerts,
    confirmOperationalAlert,
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [alertError, setAlertError] = useState("");
  const activeNotifications = notifications.filter(notification => !notification.is_archived);

  return (
    <>
      <div
        className="position-fixed"
        style={{ inset: 0, zIndex: 999 }}
        onClick={onClose}
      />
      <div
        className="position-absolute end-0 mt-2 rounded-3 shadow-lg border bg-white"
        style={{ width: "360px", zIndex: 1000, maxHeight: "480px", overflow: "hidden" }}
      >
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
          <h6 className="fw-bold mb-0">{t("notifications.title")}</h6>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="btn btn-link btn-sm p-0 text-decoration-none small text-success"
            >
              <CheckCheck size={14} className="me-1" />
              {t("notifications.markAllRead")}
            </button>
          )}
        </div>

        <div style={{ overflowY: "auto", maxHeight: "380px" }}>
          {alertError && <p className="text-danger p-3" role="alert">{alertError}</p>}
          {newestAlerts(operationalAlerts).slice(0, ALERT_PREVIEW_LIMIT).map(alert => <div key={alert.alert_key} className="p-3 border-bottom notification-unread"><div className="d-flex align-items-start gap-2"><Beef size={18}/><div className="flex-grow-1"><p className="small fw-bold mb-1">{alert.text}</p><small>{t("notifications.animalCycles")}{alert.time ? ` · ${alert.time}` : ""}</small></div><button type="button" className="btn btn-sm btn-success" disabled={confirming !== null} onClick={async () => { setConfirming(alert.alert_key); setAlertError(""); try { await confirmOperationalAlert(alert); } catch { setAlertError(t("notifications.confirmAlertFailed")); } finally { setConfirming(null); } }}>{confirming === alert.alert_key ? "…" : "OK"}</button></div></div>)}
          {operationalAlerts.length > 0 && <Link href={ALERTS_PAGE} onClick={onClose} className="d-block p-3 small fw-semibold">{t("notifications.viewAllAlerts")}</Link>}
          {loading ? (
            <div className="d-flex justify-content-center align-items-center py-5">
              <Loader2 className="animate-spin text-success" size={24} />
            </div>
          ) : activeNotifications.length === 0 && operationalAlerts.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <Bell size={32} className="mb-2 opacity-50" />
              <p className="small mb-0">{t("notifications.none")}</p>
            </div>
          ) : (
            activeNotifications.slice(0, 20).map((notification) => (
              <div
                key={notification.id}
                className={`p-3 border-bottom notification-item ${!notification.is_read ? "notification-unread" : ""}`}
                style={{ cursor: "pointer" }}
                onClick={() => !notification.is_read && markAsRead(notification.id)}
              >
                <div className="d-flex gap-2">
                  <div className="mt-1 notification-icon">
                    {typeIcons[notification.type] || <Bell size={16} />}
                  </div>
                  <div className="flex-grow-1 overflow-hidden">
                    <div className="d-flex justify-content-between align-items-start">
                      <p className={`small fw-bold mb-1 ${!notification.is_read ? "text-dark" : "text-muted"}`}>
                        {notification.title}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                        className="btn btn-link btn-sm p-0 text-muted"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="small text-muted mb-1 text-truncate" style={{ maxWidth: "280px" }}>
                      {notification.message}
                    </p>
                    {notification.promotion && <Link href="/home/notifications" className="small text-success" onClick={onClose}>{t("notifications.viewFullCampaign")}</Link>}
                    <p className="extra-small text-muted-foreground mb-0">
                      {new Date(notification.created_at).toLocaleDateString(language, {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-2 border-top text-center">
          <Link href="/home/notifications" onClick={onClose} className="small text-decoration-none text-success">
            {t("notifications.viewAll")}
          </Link>
        </div>
      </div>

      <style jsx>{`
        .notification-item:hover {
          background: oklch(0.98 0.02 145);
        }
        .notification-unread {
          background: oklch(0.97 0.035 145);
        }
        .notification-icon {
          color: #176b3a;
        }
      `}</style>
    </>
  );
}
