import { platformApi } from "./platformApi";

export type CategoryPolicy = {
  category: string; label: string; enabled: boolean; in_app_enabled: boolean; email_enabled: boolean;
  repeat_cooldown_minutes: number; group_similar_minutes: number; max_per_day: number; push_enabled: boolean; whatsapp_enabled: boolean; updated_at: string | null; count: number;
};
export type NotificationHistory = {
  count: number; next: string | null; previous: string | null;
  results: { id: string; category: string; category_display: string; title: string; priority: string;
    deliveries: {channel: string; status: string; attempts: number}[];
    created_at: string; recipient: string; organization: string; show_in_app: boolean; is_read: boolean; is_archived: boolean }[];
};
export const platformNotificationService = {
  async categories() { return (await platformApi.get<{results: CategoryPolicy[]}>("platform/notifications/categories/")).data.results; },
  async update(category: string, data: Pick<CategoryPolicy, "enabled" | "in_app_enabled" | "email_enabled" | "push_enabled" | "whatsapp_enabled" | "repeat_cooldown_minutes" | "group_similar_minutes" | "max_per_day">) {
    return (await platformApi.patch<CategoryPolicy>(`platform/notifications/categories/${encodeURIComponent(category)}/`, data)).data;
  },
  async history(category: string, page: number) { return (await platformApi.get<NotificationHistory>("platform/notifications/history/", { params: { category, page } })).data; },
};

export type NotificationMetrics = {days: number; notifications: number; in_app: number; read: number; statuses: Record<string, number>; success_rate: number | null; average_seconds: number | null; stale_pending: number; channels: {channel: string; status: string; total: number}[]; categories: {notification__category: string; status: string; total: number}[]; daily: {day: string; status: string; total: number}[]; noise: {duplicates: number | null; grouped: number | null; limited: number | null}};
export async function getNotificationMetrics(days: number, category: string, channel: string) {return (await platformApi.get<NotificationMetrics>('platform/notifications/metrics/', {params: {days, category, channel}})).data;}
