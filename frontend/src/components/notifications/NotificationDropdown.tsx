"use client";

import { useEffect } from "react";
import { Bell, CheckCheck, Trash2, Loader2, AlertTriangle, Package, Beef, Receipt, FileText } from "lucide-react";
import useNotifications from "@/hooks/useNotifications";

interface Props {
  onClose: () => void;
  onRefresh: () => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  system: <Bell size={16} />,
  stock: <Package size={16} />,
  animal: <Beef size={16} />,
  finance: <Receipt size={16} />,
  report: <FileText size={16} />,
};

const priorityColors: Record<string, string> = {
  low: "text-muted",
  medium: "text-primary",
  high: "text-warning",
  urgent: "text-danger",
};

export default function NotificationDropdown({ onClose, onRefresh }: Props) {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

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
          <h6 className="fw-bold mb-0">Notificações</h6>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="btn btn-link btn-sm p-0 text-decoration-none small"
            >
              <CheckCheck size={14} className="me-1" />
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div style={{ overflowY: "auto", maxHeight: "380px" }}>
          {loading ? (
            <div className="d-flex justify-content-center align-items-center py-5">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <Bell size={32} className="mb-2 opacity-50" />
              <p className="small mb-0">Nenhuma notificação</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 border-bottom notification-item ${!notification.is_read ? "bg-primary/5" : ""}`}
                style={{ cursor: "pointer" }}
                onClick={() => !notification.is_read && markAsRead(notification.id)}
              >
                <div className="d-flex gap-2">
                  <div className={`mt-1 ${priorityColors[notification.priority]}`}>
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
                    <p className="extra-small text-muted-foreground mb-0">
                      {new Date(notification.created_at).toLocaleDateString("pt-BR", {
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
          <a href="/home/notifications" className="small text-decoration-none">
            Ver todas as notificações
          </a>
        </div>
      </div>

      <style jsx>{`
        .notification-item:hover {
          background: oklch(0.98 0.02 145);
        }
      `}</style>
    </>
  );
}