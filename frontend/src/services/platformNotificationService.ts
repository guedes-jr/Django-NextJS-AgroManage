import { platformApi } from "./platformApi";

export type CategoryPolicy = {
  category: string; label: string; enabled: boolean; in_app_enabled: boolean; email_enabled: boolean;
  push_enabled: boolean; whatsapp_enabled: boolean; updated_at: string | null; count: number;
};
export type NotificationHistory = {
  count: number; next: string | null; previous: string | null;
  results: { id: string; category: string; category_display: string; title: string; priority: string;
    deliveries: {channel: string; status: string; attempts: number}[];
    created_at: string; recipient: string; organization: string; show_in_app: boolean; is_read: boolean; is_archived: boolean }[];
};
export const platformNotificationService = {
  async categories() { return (await platformApi.get<{results: CategoryPolicy[]}>("platform/notifications/categories/")).data.results; },
  async update(category: string, data: Pick<CategoryPolicy, "enabled" | "in_app_enabled" | "email_enabled" | "push_enabled" | "whatsapp_enabled">) {
    return (await platformApi.patch<CategoryPolicy>(`platform/notifications/categories/${encodeURIComponent(category)}/`, data)).data;
  },
  async history(category: string, page: number) { return (await platformApi.get<NotificationHistory>("platform/notifications/history/", { params: { category, page } })).data; },
};
