import type { PaginatedResponse } from "@/types";
import { platformApi } from "./platformApi";

export interface OrganizationRecovery {
  id: string; source: string; status: "queued" | "running" | "ready" | "applied" | "rolled_back" | "failed";
  operation: "rehearse" | "refresh" | "apply" | "rollback"; progress: number; created_at: string; completed_at: string | null;
  isolated_organization: string | null; preview_digest: string; applied_digest: string;
  source_sha256: string; before_sha256: string; error_code: string; error_message: string;
  preview: { policy?: "merge"; source_snapshot_at?: string; previewed_at?: string; files?: number;
    entities?: Record<string, { create: number; update: number; preserve: number; reference: number }>;
    source_counts?: Record<string, number>; verified_rehearsal_counts?: Record<string, number>;
    newer_records_preserved?: Record<string, number> };
}
const base = (organizationId: string) => `platform/organizations/${organizationId}/recoveries/`;
export const organizationRecoveryService = {
  list: async (org: string, page = 1) => (await platformApi.get<PaginatedResponse<OrganizationRecovery>>(base(org), {params: {page}})).data,
  create: async (org: string, source_id: string, request_key: string) => (await platformApi.post<OrganizationRecovery>(base(org), {source_id, request_key})).data,
  refresh: async (org: string, id: string) => (await platformApi.post<OrganizationRecovery>(`${base(org)}${id}/refresh/`, {})).data,
  confirm: async (org: string, job: OrganizationRecovery, operation: "apply" | "rollback", confirmation: string) => (await platformApi.post<OrganizationRecovery>(`${base(org)}${job.id}/${operation}/`, {digest: operation === "apply" ? job.preview_digest : job.applied_digest, confirmation})).data,
  records: async (org: string, id: string, entity: string, page = 1) => (await platformApi.get<PaginatedResponse<Record<string, unknown>>>(`${base(org)}${id}/records/`, {params: {entity, page}})).data,
  download: async (org: string, id: string, kind: "source" | "before") => (await platformApi.get<Blob>(`${base(org)}${id}/download/`, {params: {kind}, responseType: "blob", timeout: 0})).data,
};
