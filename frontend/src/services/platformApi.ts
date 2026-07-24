import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

import type {
  PlatformDashboard,
  PlatformOrganization,
  PlatformOrganizationPage,
  PlatformStaff,
  PlatformUser,
  PlatformUserPage,
  PlatformPlan,
  PlatformPlanPage,
  PlatformSubscriptionPage,
  PlatformFinanceDashboard,
  PlatformInvoicePage,
  PlatformHealth,
  PlatformTaskRunPage,
  PlatformFeatureFlag,
  PlatformAnnouncement,
  PlatformMaintenance,
  SqlHistoryPage,
  SqlQueryResult,
  ApprovedQuery,
  SqlExplainResult,
  SandboxGrant,
  SandboxGrantPage,
  SandboxExecutionResult,
  SandboxStatus,
  SandboxExecutionPage,
  OrganizationFormPayload,
  PlatformTeamMember,
  PlatformTeamMemberPayload,
  PlatformTeamPage,
  PlatformAuditLogPage,
  PlatformSupportAccess,
  PlatformSupportAccessPage,
} from "@/types/platform";

const envUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
const baseURL = envUrl.endsWith("/") ? envUrl : `${envUrl}/`;

export const PLATFORM_ACCESS_TOKEN = "platform_access_token";
export const PLATFORM_REFRESH_TOKEN = "platform_refresh_token";
export const PLATFORM_STAFF = "platform_staff";

export const platformApi = axios.create({
  baseURL,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  timeout: 15000,
});

platformApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(PLATFORM_ACCESS_TOKEN);
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshing = false;
let waiting: Array<(token: string | null) => void> = [];

platformApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status !== 401 || !request || request._retry) {
      return Promise.reject(error);
    }

    request._retry = true;
    if (refreshing) {
      return new Promise<string | null>((resolve) => waiting.push(resolve)).then((token) => {
        if (!token) return Promise.reject(error);
        request.headers.Authorization = `Bearer ${token}`;
        return platformApi(request);
      });
    }

    const refresh = localStorage.getItem(PLATFORM_REFRESH_TOKEN);
    if (!refresh) {
      clearPlatformSession();
      window.location.href = "/platform/login";
      return Promise.reject(error);
    }

    refreshing = true;
    try {
      const { data } = await axios.post<{ access: string }>(`${baseURL}auth/token/refresh/`, { refresh });
      localStorage.setItem(PLATFORM_ACCESS_TOKEN, data.access);
      waiting.forEach((resolve) => resolve(data.access));
      request.headers.Authorization = `Bearer ${data.access}`;
      return platformApi(request);
    } catch (refreshError) {
      waiting.forEach((resolve) => resolve(null));
      clearPlatformSession();
      window.location.href = "/platform/login";
      return Promise.reject(refreshError);
    } finally {
      waiting = [];
      refreshing = false;
    }
  },
);

export function clearPlatformSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PLATFORM_ACCESS_TOKEN);
  localStorage.removeItem(PLATFORM_REFRESH_TOKEN);
  localStorage.removeItem(PLATFORM_STAFF);
}

export const platformService = {
  async login(email: string, password: string) {
    const { data } = await axios.post<{
      access: string;
      refresh: string;
    }>(`${baseURL}auth/login/`, { email, password });
    localStorage.setItem(PLATFORM_ACCESS_TOKEN, data.access);
    localStorage.setItem(PLATFORM_REFRESH_TOKEN, data.refresh);
    try {
      const staff = await this.me();
      localStorage.setItem(PLATFORM_STAFF, JSON.stringify(staff));
      return staff;
    } catch (error) {
      clearPlatformSession();
      throw error;
    }
  },
  async me() {
    const { data } = await platformApi.get<PlatformStaff>("platform/me/");
    return data;
  },
  async dashboard() {
    const { data } = await platformApi.get<PlatformDashboard>("platform/dashboard/");
    return data;
  },
  async organizations(params?: Record<string, string | number | boolean>) {
    const { data } = await platformApi.get<PlatformOrganizationPage>("platform/organizations/", { params });
    return data;
  },
  async organization(id: string) {
    const { data } = await platformApi.get<PlatformOrganization>(`platform/organizations/${id}/`);
    return data;
  },
  async createOrganization(payload: OrganizationFormPayload) {
    const { data } = await platformApi.post<PlatformOrganization>("platform/organizations/", payload);
    return data;
  },
  async updateOrganization(id: string, payload: OrganizationFormPayload) {
    const { data } = await platformApi.patch<PlatformOrganization>(`platform/organizations/${id}/`, payload);
    return data;
  },
  async archiveOrganization(id: string) {
    await platformApi.post(`platform/organizations/${id}/archive/`);
  },
  async suspendOrganization(id: string) {
    await platformApi.post(`platform/organizations/${id}/suspend/`);
  },
  async activateOrganization(id: string) {
    await platformApi.post(`platform/organizations/${id}/activate/`);
  },
  async users(params?: Record<string, string | number | boolean>) {
    const { data } = await platformApi.get<PlatformUserPage>("platform/users/", { params });
    return data;
  },
  async team(params?: Record<string, string | number | boolean>) {
    const { data } = await platformApi.get<PlatformTeamPage>("platform/team/", { params });
    return data;
  },
  async createTeamMember(payload: PlatformTeamMemberPayload) {
    const { data } = await platformApi.post<PlatformTeamMember>("platform/team/", payload);
    return data;
  },
  async updateTeamMember(id: string, payload: Partial<PlatformTeamMemberPayload>) {
    const { data } = await platformApi.patch<PlatformTeamMember>(`platform/team/${id}/`, payload);
    return data;
  },
  async blockTeamMember(id: string) {
    await platformApi.post(`platform/team/${id}/block/`);
  },
  async activateTeamMember(id: string) {
    await platformApi.post(`platform/team/${id}/activate/`);
  },
  async revokeTeamMemberSessions(id: string) {
    await platformApi.post(`platform/team/${id}/revoke-sessions/`);
  },
  async auditLogs(params?: Record<string, string | number>) {
    const { data } = await platformApi.get<PlatformAuditLogPage>("platform/audit-logs/", { params });
    return data;
  },
  async auditOptions() {
    const { data } = await platformApi.get<{ actions: string[] }>("platform/audit-logs/options/");
    return data;
  },
  async exportAuditLogs(params?: Record<string, string | number>) {
    const { data } = await platformApi.get<Blob>("platform/audit-logs/export/", { params, responseType: "blob" });
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `auditoria-plataforma-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
  async user(id: string) {
    const { data } = await platformApi.get<PlatformUser>(`platform/users/${id}/`);
    return data;
  },
  async blockUser(id: string) {
    await platformApi.post(`platform/users/${id}/block/`);
  },
  async activateUser(id: string) {
    await platformApi.post(`platform/users/${id}/activate/`);
  },
  async revokeUserSessions(id: string) {
    await platformApi.post(`platform/users/${id}/revoke-sessions/`);
  },
  async plans() {
    const { data } = await platformApi.get<PlatformPlanPage>("platform/plans/", { params: { page_size: 100 } });
    return data;
  },
  async createPlan(payload: Partial<PlatformPlan>) {
    const { data } = await platformApi.post<PlatformPlan>("platform/plans/", payload);
    return data;
  },
  async updatePlan(id: string, payload: Partial<PlatformPlan>) {
    const { data } = await platformApi.patch<PlatformPlan>(`platform/plans/${id}/`, payload);
    return data;
  },
  async subscriptions(params?: Record<string, string | number>) {
    const { data } = await platformApi.get<PlatformSubscriptionPage>("platform/subscriptions/", { params });
    return data;
  },
  async changeSubscriptionPlan(id: string, planId: string, billingCycle: string) {
    await platformApi.post(`platform/subscriptions/${id}/change-plan/`, {
      plan_id: planId,
      billing_cycle: billingCycle,
    });
  },
  async financeDashboard() {
    const { data } = await platformApi.get<PlatformFinanceDashboard>("platform/finance/dashboard/");
    return data;
  },
  async invoices(params?: Record<string, string | number>) {
    const { data } = await platformApi.get<PlatformInvoicePage>("platform/invoices/", { params });
    return data;
  },
  async createInvoice(payload: {organization_id:string; due_date:string; description:string; amount:string}) {
    await platformApi.post("platform/invoices/", payload);
  },
  async recordInvoicePayment(id:string, amount:string, paymentMethod:string) {
    await platformApi.post(`platform/invoices/${id}/record-payment/`, {amount, payment_method:paymentMethod});
  },
  async supportAccesses(params?: Record<string, string | number>) {
    const { data } = await platformApi.get<PlatformSupportAccessPage>("platform/support-access/", { params });
    return data;
  },
  async createSupportAccess(payload: { organization_id: string; ticket_reference: string; justification: string; duration_minutes: number }) {
    const {data}=await platformApi.post<{access:string;grant:PlatformSupportAccess}>("platform/support-access/", payload);
    return data;
  },
  async openSupportAccess(id: string) {
    const { data } = await platformApi.post<{ access: string; grant: PlatformSupportAccess }>(`platform/support-access/${id}/open/`);
    return data;
  },
  async revokeSupportAccess(id: string) {
    await platformApi.post(`platform/support-access/${id}/revoke/`);
  },
  async operationsHealth(){ const {data}=await platformApi.get<PlatformHealth>("platform/operations/health/"); return data; },
  async taskRuns(params?:Record<string,string|number>){const {data}=await platformApi.get<PlatformTaskRunPage>("platform/task-runs/",{params});return data;},
  async retryTask(id:string){await platformApi.post(`platform/task-runs/${id}/retry/`);},
  async featureFlags(){const {data}=await platformApi.get<{results:PlatformFeatureFlag[]}>("platform/feature-flags/",{params:{page_size:100}});return data.results;},
  async saveFeatureFlag(payload:Partial<PlatformFeatureFlag>){if(payload.id)await platformApi.patch(`platform/feature-flags/${payload.id}/`,payload);else await platformApi.post("platform/feature-flags/",payload);},
  async announcements(){const {data}=await platformApi.get<{results:PlatformAnnouncement[]}>("platform/announcements/",{params:{page_size:100}});return data.results;},
  async createAnnouncement(payload:Partial<PlatformAnnouncement>){await platformApi.post("platform/announcements/",payload);},
  async maintenance(){const {data}=await platformApi.get<{results:PlatformMaintenance[]}>("platform/maintenance/",{params:{page_size:100}});return data.results;},
  async createMaintenance(payload:Partial<PlatformMaintenance>){await platformApi.post("platform/maintenance/",payload);},
  async executeSql(query: string) {
    const { data } = await platformApi.post<SqlQueryResult>("platform/operations/sql/execute/", { query });
    return data;
  },
  async explainSql(query: string) {
    const { data } = await platformApi.post<SqlExplainResult>("platform/operations/sql/explain/", { query });
    return data;
  },
  async sqlHistory() {
    const { data } = await platformApi.get<SqlHistoryPage>("platform/sql-history/", { params: { page_size: 20 } });
    return data;
  },
  async approvedQueries() {
    const { data } = await platformApi.get<{ results: ApprovedQuery[] }>("platform/operations/approved-queries/");
    return data.results;
  },
  async runApprovedQuery(key: string, organizationId?: string) {
    const { data } = await platformApi.post<SqlQueryResult>("platform/operations/approved-queries/", {
      key,
      organization_id: organizationId || undefined,
    });
    return data;
  },
  async sandboxGrants() {
    const { data } = await platformApi.get<SandboxGrantPage>("platform/sandbox-grants/", { params: { page_size: 50 } });
    return data;
  },
  async requestSandboxGrant(justification: string, requestedMinutes: number) {
    const { data } = await platformApi.post<SandboxGrant>("platform/sandbox-grants/", {
      justification,
      requested_minutes: requestedMinutes,
    });
    return data;
  },
  async approveSandboxGrant(id: string) {
    const { data } = await platformApi.post<SandboxGrant>(`platform/sandbox-grants/${id}/approve/`);
    return data;
  },
  async rejectSandboxGrant(id: string, reason: string) {
    const { data } = await platformApi.post<SandboxGrant>(`platform/sandbox-grants/${id}/reject/`, { reason });
    return data;
  },
  async revokeSandboxGrant(id: string) {
    const { data } = await platformApi.post<SandboxGrant>(`platform/sandbox-grants/${id}/revoke/`);
    return data;
  },
  async sandboxStatus() {
    const { data } = await platformApi.get<SandboxStatus>("platform/operations/sandbox/status/");
    return data;
  },
  async executeSandboxCode(grantId: string, code: string) {
    const { data } = await platformApi.post<SandboxExecutionResult>("platform/operations/sandbox/execute/", {
      grant_id: grantId,
      code,
    });
    return data;
  },
  async sandboxExecutions() {
    const { data } = await platformApi.get<SandboxExecutionPage>("platform/sandbox-executions/", {
      params: { page_size: 30 },
    });
    return data;
  },
};
