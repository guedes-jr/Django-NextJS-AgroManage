import { isAxiosError } from "axios";
import apiClient from "./api";

export type Subject = "general" | "crops" | "livestock" | "feeding" | "management";
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "pending" | "completed" | "blocked" | "failed";
  latency_ms: number | null;
  created_at: string;
}
export interface Conversation {
  id: string;
  title: string;
  subject: Subject;
  is_active: boolean;
  updated_at: string;
  messages?: Message[];
}
export interface Quota {
  enabled: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  renews_at: string;
}

export function aiAssistantError(error: unknown): string {
  if (isAxiosError(error)) {
    if (typeof error.response?.data?.detail === "string") return error.response.data.detail;
    if (Array.isArray(error.response?.data?.question)) return error.response.data.question.join(" ");
    if (error.code === "ECONNABORTED") return "A resposta demorou mais que o esperado. Confira o histórico antes de tentar novamente.";
  }
  return "Não foi possível concluir a solicitação. Tente novamente.";
}

export const aiAssistantService = {
  conversations: async () => {
    const { data } = await apiClient.get<{ results: Conversation[] }>("/ai/conversations/");
    return data.results.filter(item => item.is_active);
  },
  quota: async () => (await apiClient.get<Quota>("/ai/usage/")).data,
  conversation: async (id: string) => (await apiClient.get<Conversation>(`/ai/conversations/${id}/`)).data,
  create: async (subject: Subject) => (await apiClient.post<Conversation>("/ai/conversations/", { subject })).data,
  ask: async (id: string, question: string) => (await apiClient.post<{ message: Message; quota: Quota }>(`/ai/conversations/${id}/ask/`, { question }, { timeout: 120000 })).data,
  rename: async (id: string, title: string) => (await apiClient.patch<Conversation>(`/ai/conversations/${id}/`, { title })).data,
  remove: async (id: string) => { await apiClient.delete(`/ai/conversations/${id}/`); },
};
