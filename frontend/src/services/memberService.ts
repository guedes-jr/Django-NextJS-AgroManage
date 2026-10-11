import apiClient from "./api";

export const roleLabels = { admin: "Administrador", manager: "Gerente", operator: "Operador" };
export type UserRole = keyof typeof roleLabels;
export interface Member {
  id: string; email: string; full_name: string; phone?: string; phone_is_whatsapp: boolean; receive_system_alerts: boolean;
  can_operate_crops: boolean; allowed_livestock: string[]; operator_read_only: boolean; organization_responsible: boolean;
  role: UserRole; role_display: string; is_active: boolean;
}
export function canManageMembers(role?: string) { return role === "admin"; }
export function canChangeMemberRole(actor: { id: string; role: string } | null, member: Member) {
  return !!actor && actor.id !== member.id && canManageMembers(actor.role)
    && !member.organization_responsible;
}
export async function updateMemberRole(id: string, role: UserRole) {
  const response = await apiClient.patch<Member>(`/auth/members/${id}/`, { role });
  return response.data;
}
export function memberError(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object" || !("response" in error)) return fallback;
  const data = (error.response as { data?: unknown } | undefined)?.data;
  if (!data || typeof data !== "object") return fallback;
  const payload = data as Record<string, unknown>;
  const detail = payload.detail || (payload.error as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === "string") return detail;
  const fields = typeof detail === "object" && detail ? detail : payload;
  const value = Object.values(fields)[0];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return fallback;
}
