import type { PaginatedResponse } from "@/types";
import { platformApi } from "./platformApi";

export interface OrganizationExport {
  id: string; format: "customer" | "recovery"; status: "queued" | "running" | "ready" | "failed" | "expired";
  progress: number; created_at: string; started_at: string | null; completed_at: string | null; expires_at: string | null;
  archive_size: number; archive_sha256: string; error_code: string; error_message: string; download_allowed: boolean; parent: string | null;
  summary: {format_version?: number; snapshot_at?: string; records?: number; files?: number; entity_counts?: Record<string, number>};
}
const base = (organizationId: string) => `platform/organizations/${organizationId}/exports/`;
export const organizationExportService = {
  list: async (organizationId: string, page = 1) => (await platformApi.get<PaginatedResponse<OrganizationExport>>(base(organizationId), {params: {page}})).data,
  create: async (organizationId: string, format: OrganizationExport["format"], request_key: string) => (await platformApi.post<OrganizationExport>(base(organizationId), {format, request_key})).data,
  retry: async (organizationId: string, id: string, request_key: string) => (await platformApi.post<OrganizationExport>(`${base(organizationId)}${id}/retry/`, {request_key})).data,
  download: async (organizationId: string, id: string) => (await platformApi.get<Blob>(`${base(organizationId)}${id}/download/`, {responseType: "blob", timeout: 0})).data,
  saveToStream: async (organizationId: string, id: string, destination: WritableStream<Uint8Array>) => {
    try {
      const response = await platformApi.get<ReadableStream<Uint8Array>>(`${base(organizationId)}${id}/download/`, {adapter: "fetch", responseType: "stream", timeout: 0});
      await response.data.pipeTo(destination);
    } catch (error) {
      try { await destination.abort(); } catch { /* pipeTo already closes/aborts the destination. */ }
      throw error;
    }
  },
};
