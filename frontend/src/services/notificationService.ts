import apiClient from "./api";

export interface Notification {
  id: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  occurrence_count: number;
  last_occurred_at: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
}

type NotificationPage = { count: number; next: string | null; previous: string | null; results: Notification[] };

export interface NotificationPreference {
  id: string;
  stock_alerts: boolean;
  animal_alerts: boolean;
  financial_alerts: boolean;
  report_alerts: boolean;
  email_notifications: boolean;
  push_notifications: boolean;
  frequency: string;
  updated_at: string;
}

export const notificationService = {
  getAll: async (params?: Record<string, string | number | boolean>): Promise<Notification[]> => {
    const response = await apiClient.get<NotificationPage | Notification[]>("/notifications/", { params });
    if (Array.isArray(response.data)) return response.data;
    return Array.isArray(response.data?.results) ? response.data.results : [];
  },

  getUnreadCount: async (): Promise<{ unread_count: number }> => {
    const response = await apiClient.get<{ unread_count: number }>("/notifications/unread-count/");
    return response.data;
  },

  markAsRead: async (id: string): Promise<void> => {
    await apiClient.patch(`/notifications/${id}/`, { is_read: true });
  },

  markAllAsRead: async (): Promise<void> => {
    await apiClient.post("/notifications/mark-all-read/");
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/notifications/${id}/`);
  },

  archive: async (id: string): Promise<Notification> => {
    const response = await apiClient.post<Notification>(`/notifications/${id}/archive/`);
    return response.data;
  },

  unarchive: async (id: string): Promise<Notification> => {
    const response = await apiClient.post<Notification>(`/notifications/${id}/unarchive/`);
    return response.data;
  },

  archiveRead: async (): Promise<void> => { await apiClient.post("/notifications/archive-read/"); },

  getPushConfig: async (): Promise<{ public_key: string }> => (await apiClient.get("/notifications/web-push-config/")).data,
  savePushSubscription: async (data: { endpoint: string; p256dh: string; auth: string }): Promise<void> => { await apiClient.post("/notifications/push-subscriptions/", data); },

  getPreferences: async (): Promise<NotificationPreference> => {
    const response = await apiClient.get<NotificationPreference>("/notifications/preferences/");
    return response.data;
  },

  updatePreferences: async (data: Partial<NotificationPreference>): Promise<NotificationPreference> => {
    const response = await apiClient.patch<NotificationPreference>("/notifications/preferences/", data);
    return response.data;
  },
};

export default notificationService;
