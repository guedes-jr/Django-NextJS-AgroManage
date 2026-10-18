import type { AxiosInstance } from "axios";
import type { PaginatedResponse } from "@/types";
import apiClient from "./api";
import { platformApi } from "./platformApi";

export const ticketStatuses = { open: "Aberto", in_progress: "Em atendimento", waiting_customer: "Aguardando cliente", resolved: "Resolvido", closed: "Fechado" };
export const ticketCategories = { access: "Acesso", billing: "Cobrança", technical: "Problema técnico", question: "Dúvida", other: "Outro" };
export const ticketPriorities = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" };
export type TicketStatus = keyof typeof ticketStatuses;
export type TicketCategory = keyof typeof ticketCategories;
export type TicketPriority = keyof typeof ticketPriorities;
export interface SupportTicket {
  id: string; organization_id: string; organization_name: string; requester_id: string; requester_name: string;
  assignee_id?: string | null; assignee_name: string | null; subject: string; category: TicketCategory; priority: TicketPriority;
  status: TicketStatus; version: number; shared_context: string; first_response_at: string | null; first_resolved_at: string | null;
  resolved_at: string | null; closed_at: string | null; created_at: string; updated_at: string;
}
export interface TicketAttachment { id: string; filename: string; size: number; created_at: string }
export interface TicketMessage {
  id: string; author_name: string; body: string; from_team: boolean; is_internal?: boolean;
  attachments: TicketAttachment[]; can_attach: boolean; created_at: string;
}
export interface TicketEvent { id: string; actor_name: string; kind: string; description: string; changes: Record<string, unknown>; is_internal?: boolean; created_at: string }
export interface OpenTicket { subject: string; body: string; category: TicketCategory; priority: TicketPriority; creation_key: string; conversation_id?: string; shared_context?: string }
export interface TicketMetadata { expected_version: number; assignee_id?: string | null; priority?: TicketPriority; category?: TicketCategory }

function service(client: AxiosInstance, base: string) {
  return {
    list: async (params: Record<string, string | number> = {}) => (await client.get<PaginatedResponse<SupportTicket>>(base, { params })).data,
    detail: async (id: string) => (await client.get<SupportTicket>(`${base}${id}/`)).data,
    open: async (payload: OpenTicket) => (await client.post<SupportTicket>(base, payload)).data,
    messages: async (id: string, page = 1) => (await client.get<PaginatedResponse<TicketMessage>>(`${base}${id}/messages/`, { params: { page } })).data,
    history: async (id: string, page = 1) => (await client.get<PaginatedResponse<TicketEvent>>(`${base}${id}/history/`, { params: { page } })).data,
    reply: async (id: string, payload: { body: string; request_key: string; expected_version: number; is_internal?: boolean }) => (await client.post<{ticket: SupportTicket; message: TicketMessage}>(`${base}${id}/messages/`, payload)).data,
    transition: async (id: string, status: TicketStatus, expected_version: number) => (await client.post<SupportTicket>(`${base}${id}/transition/`, { status, expected_version })).data,
    metadata: async (id: string, payload: TicketMetadata) => (await client.patch<SupportTicket>(`${base}${id}/`, payload)).data,
    upload: async (id: string, messageId: string, file: File, expectedVersion: number, requestKey: string) => {
      const form = new FormData(); form.append("file", file); form.append("expected_version", String(expectedVersion)); form.append("request_key", requestKey);
      return (await client.post<{ticket: SupportTicket; attachment: TicketAttachment}>(`${base}${id}/messages/${messageId}/attachments/`, form, { headers: { "Content-Type": undefined } })).data;
    },
    download: async (id: string, attachmentId: string) => (await client.get<Blob>(`${base}${id}/attachments/${attachmentId}/download/`, { responseType: "blob" })).data,
  };
}
export const customerTickets = service(apiClient, "/support/tickets/");
export const teamTickets = service(platformApi, "/platform/support/tickets/");
export const supportAssignees = async (search = "") => (await platformApi.get<PaginatedResponse<{id: string; full_name: string}>>("/platform/support/tickets/assignees/", { params: { search, page_size: 100 } })).data;
