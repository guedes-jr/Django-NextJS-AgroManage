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

export interface PlatformPaymentGateway {
  id: string;
  provider: string;
  display_name: string;
  environment: "sandbox" | "production";
  environment_display: string;
  is_enabled: boolean;
  is_default: boolean;
  credential_configured: boolean;
  credential_fields: string[];
  supported_methods: string[];
  settings: Record<string, unknown>;
  last_health_status: "unknown" | "healthy" | "error";
  last_health_message: string;
  last_health_check_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformTeamMember extends PlatformStaff {
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export type PlatformTeamPage = PaginatedResponse<PlatformTeamMember>;

export interface PlatformTeamMemberPayload {
  email: string;
  full_name: string;
  role: PlatformRole;
  mfa_required: boolean;
  initial_password?: string;
}

export interface PlatformAuditLog {
  id: string;
  actor: string | null;
  actor_name: string;
  actor_email: string;
  organization: string | null;
  organization_name: string;
  action: string;
  object_type: string;
  object_id: string;
  description: string;
  ip_address: string | null;
  user_agent: string;
  request_id: string;
  extra_data: Record<string, unknown>;
  created_at: string;
}

export type PlatformAuditLogPage = PaginatedResponse<PlatformAuditLog>;

export interface PlatformDemoRequest {
  id: string; name: string; email: string; phone: string;
  organization_name: string; operation_profile: string; message: string;
  selected_plan: string; landing_path: string; utm_source: string; utm_medium: string; utm_campaign: string;
  ab_variant: string;
  status: "new" | "contacted" | "scheduled" | "proposal" | "negotiation" | "won" | "lost" | "pending" | "approved" | "rejected"; status_display: string;
  assigned_to: string | null; assigned_to_name: string; next_action_at: string | null;
  estimated_value: string; internal_notes: string; loss_reason: string; converted_at: string | null;
  appointments: PlatformDemoAppointment[]; activities: PlatformDemoActivity[];
  decided_by: string | null; decided_by_name: string; decided_at: string | null;
  decision_notes: string; created_at: string; updated_at: string;
}
export type PlatformDemoRequestPage = PaginatedResponse<PlatformDemoRequest>;

export interface PlatformDemoAppointment { id:string; starts_at:string; duration_minutes:number; timezone:string; meeting_url:string; status:string; status_display:string; notes:string; google_calendar_url:string; outlook_calendar_url:string; created_by_name:string; }
export interface PlatformDemoActivity { id:string; actor_name:string; action:string; description:string; metadata:Record<string,unknown>; created_at:string; }
export interface CommercialDashboard { summary:{total_leads:number;open_leads:number;scheduled:number;won:number;estimated_pipeline:string;conversion_rate:number;page_views:number;lead_conversion_rate:number};by_status:Record<string,number>;by_source:Array<{utm_source:string;total:number}>;events:Array<{event_name:string;total:number}>;web_vitals:Array<{event_name:string;average:number;samples:number}>; }

export interface PlatformSupportAccess {
  id: string;
  operator: string;
  operator_name: string;
  organization: string;
  organization_name: string;
  ticket_reference: string;
  justification: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  is_valid: boolean;
  created_at: string;
}

export type PlatformSupportAccessPage = PaginatedResponse<PlatformSupportAccess>;

export interface PlatformDashboard {
  support: OrganizationSupportMetrics | null;
  adoption: { by_status: Partial<Record<OrganizationAdoption["status"], number>>; pending: number; oldest_calculated_at: string | null };
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
  segments: Array<{
    code: string; name: string; organizations: number; active_organizations: number;
    users: number; active_users: number; farms: number; active_subscriptions: number;
    trialing_subscriptions: number; mrr: string;
  }>;
  commercial: { open_leads: number; won_leads: number; scheduled_demos: number; pipeline_value: string };
  finance: { mrr: string; active_subscriptions: number; trialing_subscriptions: number; open_invoices: number; overdue_invoices: number; outstanding: string };
  recent_activities: Array<{ id:string; action:string; description:string; actor_name:string; organization_name:string; object_type:string; created_at:string }>;
}

export interface AdministratorInvitation {
  id: string;
  email: string;
  full_name: string;
  state: "pending" | "sent" | "failed" | "expired" | "accepted" | "revoked";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  delivery_attempts: number;
  last_attempt_at: string | null;
  last_sent_at: string | null;
  delivery_error: string;
}

export type OrganizationStatus = "active" | "suspended" | "archived";

export interface OrganizationResponsible {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "manager" | "operator";
  role_display: string;
  is_active: boolean;
}

export type OrganizationResponsiblePage = PaginatedResponse<OrganizationResponsible>;

export type OrganizationDossierSection = "summary" | "registration" | "users" | "subscription" | "invoices" | "payments" | "history" | "support-access" | "consumption" | "adoption" | "operation" | "tickets" | "exports" | "recovery";

export interface OrganizationRegistration {
  id: string; name: string; slug: string; document: string; email: string; phone: string; address: string;
  created_at: string; updated_at: string;
  addresses: {id: string; label: string; postal_code: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string; is_main: boolean}[];
  contacts: {id: string; name: string; contact_type: string; contact_type_display: string; value: string; is_main: boolean}[];
}

export interface OrganizationAdoption {
  status: "active" | "inactive_7" | "inactive_15" | "inactive_30" | "never" | "unknown";
  observed_since: string; calculated_at: string; history_complete: boolean;
  last_customer_login_at: string | null; last_operation_at: string | null; days_without_use: number | null;
  active_users_7d: number; active_users_30d: number; period_7d_complete: boolean; period_30d_complete: boolean;
  checklist: { responsible_activated: boolean; first_farm: boolean; first_operation: boolean | null };
}

export interface PlatformOrganization {
  quota_snapshot: { near_limit: boolean; calculated_at: string } | null;
  subscription_plan_code: string | null;
  adoption: OrganizationAdoption | null;
  id: string;
  available_sections?: OrganizationDossierSection[];
  can_manage?: boolean;
  name: string;
  slug: string;
  document: string;
  plan: OrgPlan;
  is_active: boolean;
  status: OrganizationStatus;
  status_display: string;
  status_reason: string;
  status_changed_at: string;
  email: string;
  phone: string;
  users_count: number;
  active_users_count?: number;
  farms_count: number;
  transactions_count?: number;
  planting_cycles_count?: number;
  inventory_items_count?: number;
  address?: string;
  responsible: OrganizationResponsible | null;
  administrator_invitation?: AdministratorInvitation | null;
  subscription_plan_id?: string | null;
  billing_cycle?: "monthly" | "yearly" | "custom";
  created_at: string;
  updated_at: string;
}

export type PlatformOrganizationPage = PaginatedResponse<PlatformOrganization>;

export interface OrganizationFormPayload {
  name: string;
  slug: string;
  document: string;
  email: string;
  phone: string;
  address: string;
  plan_id: string;
  billing_cycle: "monthly" | "yearly" | "custom";
}

export interface OrganizationCreatePayload extends OrganizationFormPayload {
  administrator: { full_name: string; email: string };
}

export interface PlatformUser {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: "admin" | "manager" | "operator";
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

export interface PlatformAffiliate {
  id: string; user_id: string; full_name: string; email: string; code: string;
  status: "active" | "inactive"; commission_type: "percentage" | "fixed_amount";
  portal_access_only:boolean;
  commission_duration:"first_payment"|"first_three_payments"|"permanent";
  commission_type_display: string; commission_value: string; currency: string;
  activated_at: string | null; deactivated_at: string | null; clicks: number;
  registrations: number; conversions: number; commissions_total: string;
  created_at: string; updated_at: string;
}
export type PlatformAffiliatePage = PaginatedResponse<PlatformAffiliate>;
export interface PlatformAffiliateDashboard {
  affiliates:number; active_affiliates:number; clicks:number; registrations:number; conversions:number;
  commissions:{generated:string;pending:string;approved:string;paid:string}; reversed_total:string;
}
export interface PlatformAffiliateReferral {
  id:string; affiliate:string; affiliate_name:string; affiliate_code:string; customer_name:string;
  customer_email:string; organization:string|null; organization_name:string; plan_name:string;
  status:string; status_display:string; attributed_at:string; registered_at:string|null; converted_at:string|null;
}
export type PlatformAffiliateReferralPage = PaginatedResponse<PlatformAffiliateReferral>;
export interface PlatformAffiliateCommission {
  id:string; affiliate:string; affiliate_name:string; affiliate_code:string; customer_name:string;
  customer_email:string; organization:string; organization_name:string; plan:string; plan_name:string;
  invoice:string; invoice_number:string; transaction_amount:string; commission_type_snapshot:string;
  commission_rate_snapshot:string; commission_amount:string; currency:string; conversion_at:string;
  commission_duration_snapshot:"first_payment"|"first_three_payments"|"permanent";
  status:"pending"|"approved"|"paid"|"cancelled"; status_display:string; status_reason:string;
  approved_at:string|null; paid_at:string|null; cancelled_at:string|null; reversed_amount:string; created_at:string;
}
export type PlatformAffiliateCommissionPage = PaginatedResponse<PlatformAffiliateCommission>;

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
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  notes: string;
  current_period_ends_at: string | null;
  discount_type: "percentage" | "fixed_amount" | "";
  discount_value: string;
  discount_starts_at: string | null;
  discount_ends_at: string | null;
  has_active_discount: boolean;
}

export type PlatformSubscriptionPage = PaginatedResponse<PlatformSubscription>;

export interface PlatformFinanceDashboard { mrr:string; arr:string; received_month:string; outstanding:string; active_subscriptions:number; open_invoices:number; overdue_invoices:number; failed_payments:number; received_period:string; overdue_amount:string; billed:string; overdue_rate:number; invoice_count:number; distribution:{status:string;count:number;total:string}[]; receipts:{month:string;amount:string}[]; }
export interface PlatformAIOrganization { id:string; name:string; plan:string; enabled:boolean; limit:number|null; used:number; remaining:number|null; users:number; input_tokens:number; output_tokens:number; cost_usd:number; }
export interface PlatformAIIncident { id:string; organization:string; subject:string; role:string; status:"blocked"|"failed"; error_code:string; created_at:string; }
export interface PlatformAIConsumption {
  requests:number; answers:number; blocked_answers:number; input_tokens:number; output_tokens:number;
  cached_tokens:number; reasoning_tokens:number; cost_usd:number|null; reported_cost_usd:number|null;
  estimated_cost_usd:number|null; recorded_cost_requests:number; unknown_cost_requests:number;
  zero_cost_requests:number; paid_requests:number;
}
export interface PlatformAIModelOperations {
  catalog:{providers:number;enabled_providers:number;models:number;available_free_models:number;enabled_free_models:number;primary_models:number;is_stale:boolean;stale_after_days:number;last_sync_at:string|null;last_success_at:string|null};
  routing:{completed_answers:number;fallback_answers:number;fallback_total:number;fallback_rate:number;paid_fallback_allowed:boolean};
  model_usage:(PlatformAIConsumption & {provider:string;model:string;average_latency_ms:number;fallback_answers:number;fallback_total:number})[];
  consumption:PlatformAIConsumption; daily_usage:(PlatformAIConsumption & {date:string})[];
  alerts:{code:string;severity:"critical"|"warning"|"info";message:string}[];
}
export interface PlatformAIDashboard { period:{start:string;end:string}; metrics:{questions:number;input_tokens:number;output_tokens:number;cost_usd:number;active_users:number;active_organizations:number;completed_answers:number;blocked:number;failed:number;feedback_total:number;helpful:number;helpful_rate:number}; subjects:{subject:string;label:string;total:number}[]; organizations:PlatformAIOrganization[]; incidents:PlatformAIIncident[]; model_operations:PlatformAIModelOperations; }
export interface PlatformAIProvider { id:string; provider:string; display_name:string; base_url:string; is_enabled:boolean; is_default:boolean; timeout_seconds:number; prefer_free_models:boolean; allow_paid_models:boolean; max_model_attempts:number; max_output_tokens:number; credential_configured:boolean; last_health_status:"unknown"|"healthy"|"degraded"|"unavailable"; health_status_display:string; last_health_check_at:string|null; last_health_message:string; created_at:string; updated_at:string; }
export interface PlatformAIModel { id:string; provider:string; provider_name:string; provider_code:string; external_id:string; display_name:string; endpoint_type:"chat_completions"|"responses"; endpoint_type_display:string; is_free:boolean; is_available:boolean; is_enabled:boolean; is_primary:boolean; priority:number; supports_streaming:boolean; supports_tools:boolean; input_price:string|null; output_price:string|null; context_window:number|null; first_seen_at:string|null; last_seen_at:string|null; last_verified_at:string|null; created_at:string; updated_at:string; }
export interface PlatformAIModelSyncRun { id:string; provider:string; provider_name:string; status:"running"|"success"|"failure"; status_display:string; trigger:"scheduled"|"manual"; trigger_display:string; started_at:string; finished_at:string|null; models_found:number; free_models_found:number; models_created:number; models_updated:number; models_unavailable:number; added_model_ids:string[]; unavailable_model_ids:string[]; error_class:string; error_message:string; response_summary:Record<string,unknown>; created_at:string; }
export interface PlatformInvoice { currency?:string; effective_status:string; id:string; number:string; organization:string; organization_name:string; plan_name:string; status:string; status_display:string; total:string; amount_paid:string; amount_due:string; due_date:string; paid_at:string|null; created_at:string; }
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

export interface PlatformPayment { currency?:string; created_at?:string; id:string; invoice:string; invoice_number:string; organization_name:string; amount:string; status:string; status_display:string; payment_method:string; paid_at:string|null; notes:string; }
export interface PlatformFinanceReport { dashboard:PlatformFinanceDashboard; invoices:PlatformInvoice[]; payments:PlatformPayment[]; generated_at:string; generated_by:string; }
export interface PlatformInvoiceDetails { invoice:PlatformInvoice; items:{description:string;quantity:string;unit_amount:string;total:string}[]; payments:PlatformPayment[]; }


export type OrganizationQuotaResource = "users" | "farms" | "storage";
export interface OrganizationQuotaMetric {
  limit: number | null;
  plan_limit: number | null;
  source: "plan" | "override";
  used: number;
  capacity: number | null;
  remaining: number | null;
  percent: number | null;
  status: "normal" | "warning" | "at_limit" | "over_limit";
}
export interface OrganizationQuotaUsage {
  plan_name: string | null;
  warning_threshold_percent: number;
  resources: Record<OrganizationQuotaResource, OrganizationQuotaMetric>;
  active_users: number;
  reserved_users: number;
  storage: {reconciled_at: string; unknown_files: number; missing_files: number};
}
export interface OrganizationQuotaOverrides {
  max_users?: number | null;
  max_farms?: number | null;
  max_storage_mb?: number | null;
  warning_threshold_percent?: number;
  inherit?: ("max_users" | "max_farms" | "max_storage_mb" | "warning_threshold_percent")[];
}

export type OrganizationBatchAction = "export" | "suspend" | "activate" | "resend_invitation";
export interface OrganizationBatch {
  id: string; action: OrganizationBatchAction; reason: string; filters: Record<string, string | number | boolean>;
  status: "draft" | "queued" | "running" | "completed"; total: number; succeeded: number; failed: number; skipped: number;
  expires_at: string; confirmed_at: string | null; completed_at: string | null; created_at: string; parent: string | null;
}
export interface OrganizationBatchItem {
  id: string; organization_id: string; snapshot: {name: string; slug: string; status: string; plan: string};
  status: "pending" | "delivery_pending" | "succeeded" | "failed" | "skipped"; message: string; completed_at: string | null;
}
export interface OrganizationBatchSelection {
  action: OrganizationBatchAction; reason: string; filters?: Record<string, string>; ids?: string[]; all_matching?: boolean;
}


export interface OrganizationSupportMetrics {
  total: number; active: number; awaiting_team: number; waiting_customer: number;
  unassigned: number; urgent: number; without_first_response: number;
}
export interface OrganizationOperations {
  calculated_at: string;
  responsible: {id: string; full_name: string; email: string; is_active: boolean} | null;
  has_active_admin: boolean;
  usage: OrganizationQuotaUsage;
  adoption: OrganizationAdoption | null;
  billing: { unpaid_count: number; overdue_count: number; overdue_amounts: {currency: string; outstanding: string}[] };
  support: OrganizationSupportMetrics | null;
  issues: {code: string; severity: "warning" | "info"; section: OrganizationDossierSection}[];
}
