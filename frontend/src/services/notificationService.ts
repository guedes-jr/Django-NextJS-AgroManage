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
  created_at: string;
}

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
  getAll: async (): Promise<Notification[]> => {
    const response = await apiClient.get<Notification[]>("/notifications/");
    return response.data;
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