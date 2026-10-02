"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import notificationService, { Notification } from "@/services/notificationService";

import { acknowledgeOperationalAlert, getReproductionDashboard } from "@/services/livestockService";

export type OperationalAlert = { alert_key: string; text: string; time?: string; type?: string };
type NotificationContextValue = {
  operationalAlerts: OperationalAlert[];
  confirmOperationalAlert: (alert: OperationalAlert) => Promise<void>;
  fetchOperationalAlerts: () => Promise<void>;
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  archiveNotification: (id: string) => Promise<void>;
  unarchiveNotification: (id: string) => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const confirmedAlerts = useRef(new Set<string>());
  const [operationalAlerts, setOperationalAlerts] = useState<OperationalAlert[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOperationalAlerts = useCallback(async () => {
    try {
      const data = await getReproductionDashboard("suinos");
      setOperationalAlerts((data.alerts || []).filter((item: OperationalAlert) => !confirmedAlerts.current.has(item.alert_key)));
    } catch { /* Retain pending alerts if the refresh fails. */ }
  }, []);
  const confirmOperationalAlert = useCallback(async (alert: OperationalAlert) => {
    await acknowledgeOperationalAlert(alert.alert_key, alert.text);
    confirmedAlerts.current.add(alert.alert_key);
    setOperationalAlerts(current => current.filter(item => item.alert_key !== alert.alert_key));
  }, []);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void fetchOperationalAlerts(); };
    const timeout = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearTimeout(timeout); window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [fetchOperationalAlerts]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeItems, archivedItems, count] = await Promise.all([
        notificationService.getAll({ page_size: 100 }),
        notificationService.getAll({ archived: true, page_size: 100 }),
        notificationService.getUnreadCount(),
      ]);
      setNotifications([...activeItems, ...archivedItems]);
      setUnreadCount(count.unread_count);
    } catch (requestError) {
      console.error("Error fetching notifications:", requestError);
      setError("Erro ao carregar notificações");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await notificationService.getUnreadCount();
      setUnreadCount(count.unread_count);
    } catch (requestError) {
      console.error("Error fetching unread count:", requestError);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchNotifications(), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchNotifications]);

  useEffect(() => {
    // O backend de produção usa workers síncronos. Uma conexão SSE aberta
    // ocupa um worker inteiro e pode bloquear as demais APIs do sistema.
    // A contagem é leve e mantém o indicador atualizado sem conexão persistente.
    const interval = window.setInterval(() => void fetchUnreadCount(), 60_000);
    return () => window.clearInterval(interval);
  }, [fetchUnreadCount]);

  const markAsRead = useCallback(async (id: string) => {
    await notificationService.markAsRead(id);
    const wasUnread = notifications.some(notification => notification.id === id && !notification.is_read);
    setNotifications(current => current.map(notification => notification.id === id
      ? { ...notification, is_read: true, read_at: notification.read_at || new Date().toISOString() }
      : notification));
    if (wasUnread) setUnreadCount(current => Math.max(0, current - 1));
  }, [notifications]);

  const markAllAsRead = useCallback(async () => {
    await notificationService.markAllAsRead();
    const readAt = new Date().toISOString();
    setNotifications(current => current.map(notification => ({ ...notification, is_read: true, read_at: notification.read_at || readAt })));
    setUnreadCount(0);
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    await notificationService.delete(id);
    const wasUnread = notifications.some(notification => notification.id === id && !notification.is_read);
    setNotifications(current => current.filter(notification => notification.id !== id));
    if (wasUnread) setUnreadCount(current => Math.max(0, current - 1));
  }, [notifications]);

  const archiveNotification = useCallback(async (id: string) => {
    const updated = await notificationService.archive(id);
    setNotifications(current => current.map(item => item.id === id ? updated : item));
    if (!updated.is_read) setUnreadCount(current => Math.max(0, current - 1));
  }, []);

  const unarchiveNotification = useCallback(async (id: string) => {
    const updated = await notificationService.unarchive(id);
    setNotifications(current => current.map(item => item.id === id ? updated : item));
    if (!updated.is_read) setUnreadCount(current => current + 1);
  }, []);

  const value = useMemo<NotificationContextValue>(() => ({
    operationalAlerts,
    confirmOperationalAlert,
    fetchOperationalAlerts,
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    archiveNotification,
    unarchiveNotification,
  }), [operationalAlerts, confirmOperationalAlert, fetchOperationalAlerts, notifications, unreadCount, loading, error, fetchNotifications, fetchUnreadCount, markAsRead, markAllAsRead, deleteNotification, archiveNotification, unarchiveNotification]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within NotificationProvider");
  return context;
}
