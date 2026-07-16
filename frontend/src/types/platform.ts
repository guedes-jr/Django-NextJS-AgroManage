import { OrgPlan, PaginatedResponse } from "@/types";

export type PlatformRole =
  | "platform_owner"
  | "platform_admin"
  | "platform_finance"
  | "platform_support"
  | "platform_developer"
  | "platform_auditor";

export interface PlatformStaff {
  id: string;
  email: string;
  full_name: string;
  role: PlatformRole;
  role_display: string;
  mfa_required: boolean;
}

export interface PlatformDashboard {
  organizations: {
    total: number;
    active: number;
    suspended: number;
    created_last_30_days: number;
    by_plan: Array<{ plan: OrgPlan; total: number }>;
  };
  users: {
    total: number;
    active: number;
    created_last_30_days: number;
    without_organization: number;
  };
  platform_team: { total: number; active: number };
}

export interface PlatformOrganization {
  id: string;
  name: string;
  slug: string;
  document: string;
  plan: OrgPlan;
  is_active: boolean;
  email: string;
  phone: string;
  users_count: number;
  active_users_count?: number;
  farms_count: number;
  transactions_count?: number;
  planting_cycles_count?: number;
  inventory_items_count?: number;
  address?: string;
  created_at: string;
  updated_at: string;
}

export type PlatformOrganizationPage = PaginatedResponse<PlatformOrganization>;

export interface PlatformUser {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: "owner" | "admin" | "manager" | "operator" | "viewer";
  role_display: string;
  organization_id: string | null;
  organization_name: string | null;
  is_active: boolean;
  force_password_change: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export type PlatformUserPage = PaginatedResponse<PlatformUser>;

export interface PlatformPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  monthly_price: string;
  yearly_price: string;
  trial_days: number;
  max_users: number | null;
  max_farms: number | null;
  max_storage_mb: number | null;
  max_reports_per_month: number | null;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  subscriptions_count: number;
  created_at: string;
  updated_at: string;
}

export type PlatformPlanPage = PaginatedResponse<PlatformPlan>;

export interface PlatformSubscription {
  id: string;
  organization: string;
  organization_name: string;
  plan: string;
  plan_name: string;
  plan_code: string;
  status: "trialing" | "active" | "past_due" | "suspended" | "cancelled";
  status_display: string;
  billing_cycle: "monthly" | "yearly" | "custom";
  billing_cycle_display: string;
  started_at: string;
  current_period_ends_at: string | null;
}

export type PlatformSubscriptionPage = PaginatedResponse<PlatformSubscription>;

export interface PlatformFinanceDashboard { mrr:string; arr:string; received_month:string; outstanding:string; active_subscriptions:number; open_invoices:number; overdue_invoices:number; failed_payments:number; }
export interface PlatformInvoice { id:string; number:string; organization:string; organization_name:string; plan_name:string; status:string; status_display:string; total:string; amount_paid:string; amount_due:string; due_date:string; paid_at:string|null; created_at:string; }
export type PlatformInvoicePage = PaginatedResponse<PlatformInvoice>;
export interface PlatformHealth { status:string; checked_at:string; environment:string; checks:Record<string,{status:string;engine?:string;pending?:number}>; }
export interface PlatformTaskRun { id:string; task_id:string; task_name:string; status:string; status_display:string; started_at:string|null; finished_at:string|null; duration_ms:number|null; result_summary:string; error_class:string; error_message:string; can_retry:boolean; created_at:string; }
export type PlatformTaskRunPage = PaginatedResponse<PlatformTaskRun>;
export interface PlatformFeatureFlag {id:string;key:string;name:string;description:string;is_enabled:boolean;rollout_percentage:number;allowed_plans:string[];}
export interface PlatformAnnouncement {id:string;title:string;message:string;level:string;level_display:string;is_active:boolean;starts_at:string;ends_at:string|null;}
export interface PlatformMaintenance {id:string;title:string;message:string;is_active:boolean;starts_at:string;ends_at:string|null;is_in_effect:boolean;}

export interface SqlQueryResult {
  execution_id: string;
  columns: string[];
  rows: unknown[][];
  row_count: number;
  truncated: boolean;
  was_truncated: boolean;
  duration_ms: number;
}

export interface SqlExplainResult {
  execution_id: string;
  database: string;
  plan: unknown;
  duration_ms: number;
}

export interface SqlHistory {
  id: string;
  operator_email: string;
  query_text: string;
  status: "success" | "rejected" | "error";
  status_display: string;
  duration_ms: number;
  row_count: number;
  was_truncated: boolean;
  error_message: string;
  created_at: string;
}

export type SqlHistoryPage = PaginatedResponse<SqlHistory>;

export interface ApprovedQuery {
  key: string;
  name: string;
  description: string;
  requires_organization: boolean;
}

export interface SandboxGrant {
  id: string;
  requester: string;
  requester_name: string;
  approver: string | null;
  approver_name: string | null;
  justification: string;
  requested_minutes: number;
  status: "pending" | "approved" | "rejected" | "revoked";
  status_display: string;
  approved_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  decision_reason: string;
  is_valid: boolean;
  created_at: string;
}

export type SandboxGrantPage = PaginatedResponse<SandboxGrant>;

export interface SandboxStatus {
  enabled: boolean;
  available: boolean;
  active_grant: { id: string; expires_at: string } | null;
}

export interface SandboxExecutionResult {
  execution_id: string;
  status: "success" | "error" | "timeout" | "service_error";
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

export interface SandboxExecutionRecord {
  id: string;
  grant: string;
  operator: string;
  operator_name: string;
  code_sha256: string;
  status: "running" | "success" | "error" | "timeout" | "service_error";
  status_display: string;
  duration_ms: number;
  exit_code: number | null;
  stdout_bytes: number;
  stderr_bytes: number;
  error_message: string;
  created_at: string;
}

export type SandboxExecutionPage = PaginatedResponse<SandboxExecutionRecord>;
