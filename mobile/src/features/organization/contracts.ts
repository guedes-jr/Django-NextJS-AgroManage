import {z} from 'zod';
import type {User} from '../auth/contracts';

/** Operators only receive name/language from the API; admins and managers see the full record, only admins edit. */
export function canReadOrganization(user:User){return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only&&['admin','manager'].includes(user.access.role);}
export function canEditOrganization(user:User){return canReadOrganization(user)&&user.access.role==='admin'&&!user.access.read_only;}
const s=z.string().nullable().optional();
const money=z.union([z.string(),z.number()]).nullable().optional();
export const organizationSchema=z.object({
 id:z.uuid(),name:z.string(),document:s,plan_display:s,language:z.string(),status_display:s,email:s,phone:s,address:s,farms_count:z.number().nullable().optional(),storage_used:z.number().nullable().optional(),
 contacts:z.array(z.object({id:z.string(),label:s,tipo:s,kind:s,value:s,valor:s}).passthrough()).optional().default([]),
 addresses:z.array(z.object({id:z.string()}).passthrough()).optional().default([]),
 subscription:z.object({status:s,items:z.array(z.object({id:z.string(),segment_name:s,tier_label:s,final_monthly_price:money}).passthrough()).optional().default([])}).passthrough().nullable().optional(),
});
export type Organization=z.infer<typeof organizationSchema>;
/** Plan invoices (GET organizations/me/invoices/): admin and manager, same as the web Plan panel. */
export const planInvoicesSchema=z.object({subscription_status:s,results:z.array(z.object({
 id:z.string(),number:z.string(),status:z.string(),due_date:z.string(),total:z.string(),balance:z.string(),overdue:z.boolean(),payment_url:z.string().optional().default(''),notes:z.string().optional().default(''),
}).passthrough())});
export type PlanInvoices=z.infer<typeof planInvoicesSchema>;
export const paymentMethods=['pix','boleto','credit_card'] as const;
export type PaymentMethod=typeof paymentMethods[number];
/** GET organizations/me/invoices/<id>/payment/?method=: links and codes from the gateway. */
export const invoicePaymentSchema=z.object({method:z.enum(paymentMethods),amount:z.string(),payment_url:z.string().optional().default(''),bank_slip_url:z.string().optional().default(''),
 digitable_line:z.string().optional().default(''),due_date:z.string().optional().default(''),pix_copy_paste:z.string().optional().default(''),pix_qr_image:z.string().optional().default(''),expires_at:z.string().optional().default('')}).passthrough();
export type InvoicePayment=z.infer<typeof invoicePaymentSchema>;
export type InvoiceState='open'|'overdue'|'paid'|'void';
export function invoiceState(row:PlanInvoices['results'][number]):InvoiceState{return row.status==='paid'?'paid':row.overdue?'overdue':row.status==='void'||row.status==='uncollectible'?'void':'open';}
/** Only gateway links on https are opened outside the app. */
export function safePaymentUrl(value:string){try{const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch{return null;}}
export const organizationUpdateSchema=z.object({name:z.string().trim().min(2).max(255),email:z.union([z.literal(''),z.email()]),phone:z.string().trim().max(30)});
export type OrganizationUpdate=z.input<typeof organizationUpdateSchema>;
/** Human-readable line for an address returned by the API, whatever its naming. */
export function addressLine(row:Record<string,unknown>){
 const pick=(...keys:string[])=>keys.map(k=>row[k]).find(v=>typeof v==='string'&&v.trim()) as string|undefined;
 return [pick('street','logradouro'),pick('number','numero'),pick('district','bairro'),pick('city','cidade'),pick('state','estado'),pick('zip_code','cep')].filter(Boolean).join(' · ');
}
