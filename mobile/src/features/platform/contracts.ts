import {z} from 'zod';
import type {User} from '../auth/contracts';
import {attachmentSchema} from '../support/attachments';

/** Platform team member returned by platform/me/ (backoffice, no organization). */
export const platformStaffSchema=z.object({id:z.string(),email:z.string(),full_name:z.string(),role:z.string(),role_display:z.string().optional().default(''),mfa_required:z.boolean().optional().default(false)});
export type PlatformStaff=z.infer<typeof platformStaffSchema>;
export type PlatformSession={user:User;staff:PlatformStaff};
/** Owner and administrator change customer data; support/auditor/developer only consult (the API enforces it). */
export const canManagePlatform=(staff:PlatformStaff)=>staff.role==='platform_owner'||staff.role==='platform_admin';

const n=z.number().optional().default(0);
const money=z.union([z.string(),z.number()]).transform(String).optional().default('0');
const page=<T extends z.ZodTypeAny>(row:T)=>z.object({count:z.number(),next:z.string().nullable().optional(),previous:z.string().nullable().optional(),results:z.array(row)});

export const platformDashboardSchema=z.object({
 organizations:z.object({total:n,active:n,suspended:n,created_last_30_days:n}).passthrough(),
 users:z.object({total:n,active:n,created_last_30_days:n,without_organization:n}).passthrough(),
 finance:z.object({mrr:money,active_subscriptions:n,trialing_subscriptions:n,open_invoices:n,overdue_invoices:n,outstanding:money}).passthrough(),
 support:z.object({active:n,awaiting_team:n,unassigned:n,urgent:n}).passthrough().nullable().optional(),
 commercial:z.object({open_leads:n,scheduled_demos:n}).passthrough().optional(),
}).passthrough();
export type PlatformDashboard=z.infer<typeof platformDashboardSchema>;

export const organizationStatuses=['active','suspended','archived'] as const;
export const platformOrganizationSchema=z.object({
 id:z.string(),name:z.string(),slug:z.string().optional().default(''),document:z.string().nullable().optional(),email:z.string().nullable().optional(),
 status:z.enum(organizationStatuses),status_display:z.string().optional().default(''),plan:z.string().optional().default(''),
 users_count:n,farms_count:n,created_at:z.string().optional(),status_reason:z.string().nullable().optional(),
 responsible:z.object({id:z.string(),full_name:z.string().optional().default(''),email:z.string(),is_active:z.boolean()}).nullable().optional(),
 can_manage:z.boolean().optional().default(false),
}).passthrough();
export type PlatformOrganization=z.infer<typeof platformOrganizationSchema>;
export const platformOrganizationPageSchema=page(platformOrganizationSchema);

export const segmentOverviewSchema=z.object({
 subscription:z.object({status:z.string(),status_display:z.string()}).nullable(),
 price:z.object({gross:z.string(),discount_total:z.string(),total:z.string(),lines:z.array(z.object({segment_code:z.string(),name:z.string(),tier_label:z.string(),on_request:z.boolean().optional().default(false),total:z.string()}))}).passthrough().nullable(),
 segments:z.array(z.object({code:z.string(),name:z.string(),contracted:z.boolean(),active:z.boolean().optional().default(false)}).passthrough()),
}).passthrough();
export type SegmentOverview=z.infer<typeof segmentOverviewSchema>;
export const discountOverviewSchema=z.object({
 discounts:z.array(z.object({id:z.string(),description:z.string(),kind:z.string(),kind_display:z.string(),value:z.string(),segment_code:z.string(),source_display:z.string(),ends_at:z.string().nullable(),revoked_at:z.string().nullable(),is_active:z.boolean()}).passthrough()),
}).passthrough();
export type DiscountOverview=z.infer<typeof discountOverviewSchema>;

export const platformRoles=['admin','manager','operator','veterinarian'] as const;
export const platformUserSchema=z.object({
 id:z.string(),email:z.string(),full_name:z.string(),phone:z.string().nullable().optional(),role:z.enum(platformRoles),role_display:z.string().optional().default(''),
 organization_id:z.string().nullable().optional(),organization_name:z.string().nullable().optional(),is_active:z.boolean(),organization_responsible:z.boolean().optional().default(false),
 phone_is_whatsapp:z.boolean().optional().default(false),force_password_change:z.boolean().optional().default(false),last_login:z.string().nullable().optional(),
 segments:z.array(z.string()).optional().default([]),contracted_segments:z.array(z.string()).optional().default([]),operator_read_only:z.boolean().optional().default(false),
}).passthrough();
export type PlatformUser=z.infer<typeof platformUserSchema>;
export const platformUserPageSchema=page(platformUserSchema);

/** Body for PATCH platform/users/{id}/ (segments only for scoped roles). */
export type PlatformUserDraft={full_name:string;email:string;phone:string;role:PlatformUser['role'];segments:string[];operator_read_only:boolean};
export const platformUserDraft=(user:PlatformUser):PlatformUserDraft=>({full_name:user.full_name,email:user.email,phone:user.phone??'',role:user.role,segments:user.segments.filter(code=>code!=='area-veterinario'||user.role!=='veterinarian'),operator_read_only:user.operator_read_only});
export function platformUserPayload(draft:PlatformUserDraft,{roleLocked}:{roleLocked:boolean}){
 const scoped=draft.role==='operator'||draft.role==='veterinarian';
 const body:Record<string,unknown>={full_name:draft.full_name.trim(),email:draft.email.trim().toLowerCase(),phone:draft.phone.trim()};
 if(!roleLocked)body.role=draft.role;
 if(scoped){body.segments=draft.segments;body.operator_read_only=draft.operator_read_only;}
 return body;
}
export const passwordResetSchema=z.object({new_password:z.string().min(8),new_password_confirm:z.string(),force_password_change:z.boolean(),revoke_sessions:z.boolean()}).refine(v=>v.new_password===v.new_password_confirm,{path:['new_password_confirm']});
export type PasswordReset=z.infer<typeof passwordResetSchema>;
/** Suspend/archive/reactivate: reason is recorded in the organization history. */
export const statusActions={suspended:'suspend',archived:'archive',active:'activate'} as const;

/** PL05 — team support queue (platform/support/tickets/). */
export const teamTicketStatuses=['open','in_progress','waiting_customer','resolved','closed'] as const;
export const teamTicketSchema=z.object({
 id:z.string(),subject:z.string(),category:z.string(),priority:z.string(),status:z.enum(teamTicketStatuses),version:z.number().int().min(1),
 organization_name:z.string().nullable().optional(),requester_name:z.string().nullable().optional(),assignee_id:z.string().nullable().optional(),assignee_name:z.string().nullable().optional(),
 created_at:z.string(),updated_at:z.string(),
}).passthrough();
export type TeamTicket=z.infer<typeof teamTicketSchema>;
export const teamTicketPageSchema=page(teamTicketSchema);
export const teamMessageSchema=z.object({id:z.string(),author_name:z.string(),body:z.string(),from_team:z.boolean(),is_internal:z.boolean().optional().default(false),attachments:z.array(attachmentSchema).optional().default([]),can_attach:z.boolean().optional().default(false),created_at:z.string()}).passthrough();
export type TeamMessage=z.infer<typeof teamMessageSchema>;
export const teamMessagePageSchema=page(teamMessageSchema);
export const teamReplySchema=z.object({body:z.string().trim().min(1).max(10000),request_key:z.uuid(),expected_version:z.number().int().min(1),is_internal:z.boolean()});
export type TeamReply=z.infer<typeof teamReplySchema>;
/** Next statuses the team can set from the app (the server validates transitions and versions). */
export const nextStatuses=(status:TeamTicket['status']):TeamTicket['status'][]=>status==='closed'?['open']:status==='resolved'?['open','closed']:['in_progress','waiting_customer','resolved'].filter(value=>value!==status) as TeamTicket['status'][];
/** Only owner, administrator and support answer tickets (TeamSupportPermission). */
export const canAnswerTickets=(staff:PlatformStaff)=>['platform_owner','platform_admin','platform_support'].includes(staff.role);

/** PL06 — SaaS finance. */
export const financeSummarySchema=z.object({mrr:money,arr:money,received_month:money,outstanding:money,overdue_amount:money,open_invoices:n,overdue_invoices:n,active_subscriptions:n}).passthrough();
export type FinanceSummary=z.infer<typeof financeSummarySchema>;
export const invoiceSchema=z.object({id:z.string(),number:z.string(),organization_name:z.string().nullable().optional(),status:z.string(),status_display:z.string().optional().default(''),effective_status:z.string().optional().default(''),total:money,amount_due:money,due_date:z.string(),plan_name:z.string().nullable().optional()}).passthrough();
export type PlatformInvoice=z.infer<typeof invoiceSchema>;
export const invoicePageSchema=page(invoiceSchema);
export const paymentInputSchema=z.object({amount:z.string().trim().regex(/^\d+([.,]\d{1,2})?$/).transform(v=>v.replace(',','.')).refine(v=>Number(v)>0),payment_method:z.string().trim().min(1).max(40),notes:z.string().max(2000)});
export type PaymentInput=z.input<typeof paymentInputSchema>;
/** Recording payments is restricted to owner and administrator (IsPlatformAdmin). */
export const canRecordPayment=canManagePlatform;

/** PL07 — catalog (read-only in the app). */
export const couponRowSchema=z.object({id:z.string(),code:z.string(),description:z.string().optional().default(''),kind_display:z.string().optional().default(''),value:z.string(),kind:z.string(),segment_code:z.string().optional().default(''),is_active:z.boolean(),redemptions:n,max_redemptions:z.number().nullable().optional(),valid_until:z.string().nullable().optional()}).passthrough();
export const couponPageSchema=page(couponRowSchema);
export const catalogSchema=z.array(z.object({id:z.string(),code:z.string(),name:z.string(),metric_label:z.string().optional().default(''),is_active:z.boolean(),contracted_count:n,
 tiers:z.array(z.object({label:z.string(),minimum_quantity:z.number().nullable(),maximum_quantity:z.number().nullable(),monthly_price:z.string().nullable(),requires_quote:z.boolean(),is_active:z.boolean()}))}).passthrough());

/** PL08 — audit trail and service health. */
export const auditRowSchema=z.object({id:z.string(),action:z.string(),actor_name:z.string().nullable().optional(),organization_name:z.string().nullable().optional(),description:z.string().optional().default(''),created_at:z.string()}).passthrough();
export const auditPageSchema=page(auditRowSchema);
export const healthSchema=z.object({status:z.string(),checked_at:z.string(),checks:z.record(z.string(),z.object({status:z.string()}).passthrough())}).passthrough();
export const canReadAudit=(staff:PlatformStaff)=>['platform_owner','platform_admin','platform_auditor'].includes(staff.role);
export const canReadHealth=(staff:PlatformStaff)=>['platform_owner','platform_admin','platform_developer'].includes(staff.role);
/** Audit action codes become readable labels: "organization.deleted" → "Organization deleted". */
export const actionLabel=(action:string)=>{const text=action.replace(/[._]/g,' ').trim();return text.charAt(0).toUpperCase()+text.slice(1);};
