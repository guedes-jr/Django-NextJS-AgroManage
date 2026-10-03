import apiClient from "./api";
import { platformApi } from "./platformApi";
import type { AxiosInstance } from "axios";
export type SupportConfig = { whatsapp_number: string; ai_enabled: boolean; daily_question_limit: number; welcome_message: string };
export type SupportArticle = { id: string; title: string; kind: "faq" | "tutorial"; category: string; content: string; video_url: string; is_published: boolean; position: number; updated_at?: string };
export type ArticleDraft = Omit<SupportArticle, "id" | "updated_at">;
export type SupportMessage = { id: string; role: "user" | "assistant"; content: string; status: string };
export type SupportConversation = { id: string; title: string; is_active: boolean; messages: SupportMessage[] };
export type SupportHandoff = { summary: string; whatsapp_url: string | null };
async function allPages<T>(client: AxiosInstance, url: string, signal?: AbortSignal): Promise<T[]> {
  const result: T[] = [];
  let next: string | null = url;
  while (next) {
    const { data }: { data: T[] | { results: T[]; next: string | null } } = await client.get(next, { signal });
    if (Array.isArray(data)) return [...result, ...data];
    result.push(...data.results);
    next = data.next;
  }
  return result;
}
export function supportError(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = error.response as { data?: Record<string, unknown> };
    const detail = response.data?.detail;
    if (typeof detail === "string") return detail;
    if (response.data) {
      const messages = Object.values(response.data).flatMap(value => typeof value === "string" ? [value] : Array.isArray(value) ? value.filter(item => typeof item === "string") : []);
      if (messages.length) return messages.join(" ");
    }
  }
  return "Não foi possível concluir a solicitação. Tente novamente.";
}
export const supportService = {
  config: async (signal?: AbortSignal) => (await apiClient.get<SupportConfig>("/support/configuration/", { signal })).data,
  articles: (signal?: AbortSignal) => allPages<SupportArticle>(apiClient, "/support/articles/", signal),
  conversations: (signal?: AbortSignal) => allPages<SupportConversation>(apiClient, "/support/conversations/", signal),
  create: async () => (await apiClient.post<SupportConversation>("/support/conversations/", {})).data,
  conversation: async (id: string) => (await apiClient.get<SupportConversation>(`/support/conversations/${id}/`)).data,
  ask: async (id: string, question: string) => (await apiClient.post<{ message: SupportMessage }>(`/support/conversations/${id}/ask/`, { question })).data,
  resolve: async (id: string) => (await apiClient.post<SupportConversation>(`/support/conversations/${id}/resolve/`, {})).data,
  handoff: async (id: string, summary?: string) => (await apiClient.post<SupportHandoff>(`/support/conversations/${id}/handoff/`, summary ? { summary } : {})).data,
};
export const supportAdminService = {
  config: async () => (await platformApi.get<SupportConfig>("/platform/support/configuration/")).data,
  saveConfig: async (config: SupportConfig) => (await platformApi.patch<SupportConfig>("/platform/support/configuration/", config)).data,
  articles: () => allPages<SupportArticle>(platformApi, "/platform/support/articles/"),
  saveArticle: async (draft: ArticleDraft, id?: string) => (id ? await platformApi.patch<SupportArticle>(`/platform/support/articles/${id}/`, draft) : await platformApi.post<SupportArticle>("/platform/support/articles/", draft)).data,
  deleteArticle: async (id: string) => { await platformApi.delete(`/platform/support/articles/${id}/`); },
};
