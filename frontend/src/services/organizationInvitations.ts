import { apiClient } from "@/services/api";

export interface InvitationPreview {
  organization_name: string;
  full_name: string;
  email: string;
  expires_at: string;
}

export const organizationInvitations = {
  async inspect(token: string) {
    const { data } = await apiClient.post<InvitationPreview>("auth/organization-invitations/inspect/", { token });
    return data;
  },
  async accept(token: string, password: string, passwordConfirmation: string) {
    await apiClient.post("auth/organization-invitations/accept/", { token, password, password_confirmation: passwordConfirmation });
  },
};

export function getOrganizationErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  const find = (value: unknown): string | undefined => {
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value)) return value.map(find).find(Boolean);
    if (value && typeof value === "object") {
      const row = value as Record<string, unknown>;
      for (const key of ["error", "detail", "administrator", "email", "password", "password_confirmation"]) {
        const message = find(row[key]);
        if (message) return message;
      }
      return Object.values(row).map(find).find(Boolean);
    }
  };
  return find(data) || fallback;
}
