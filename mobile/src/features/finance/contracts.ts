import {z} from 'zod';
import type {User} from '../auth/contracts';

/** Same gate as the web module and the financial Home: admin/manager with financial visibility. */
export function canReadFinance(user:User){return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only&&user.access.can_view_financial&&['admin','manager'].includes(user.access.role);}
/** Settlement/reversal/creation follow the API write roles; read-only accounts never write. */
export function canWriteFinance(user:User){return canReadFinance(user)&&!user.access.read_only;}

const money=z.union([z.string(),z.number()]).transform(v=>String(v)).pipe(z.string().regex(/^-?\d+(\.\d+)?$/));
const day=z.iso.date();
export const financeStatuses=['pending','overdue','paid','cancelled'] as const;
export const financeKinds=['revenue','expense'] as const;
export const paymentMethods=['pix','boleto','transfer','cash','credit_card'] as const;
export type FinanceKind=typeof financeKinds[number];
export type FinanceStatus=typeof financeStatuses[number];
export type PaymentMethod=typeof paymentMethods[number];

export const paymentEventSchema=z.object({id:z.uuid(),kind:z.enum(['payment','reversal']),amount:money,bank_account:z.uuid().nullable(),bank_account_name:z.string().optional(),payment_date:day,payment_method:z.string(),reason:z.string(),reverses:z.uuid().nullable(),created_by_name:z.string().optional(),created_at:z.string()});
export const transactionSchema=z.object({
 id:z.uuid(),description:z.string(),amount:money,category:z.uuid(),category_name:z.string(),category_type:z.enum(financeKinds),
 due_date:day,payment_date:day.nullable(),status:z.enum(financeStatuses),reference:z.string(),notes:z.string(),
 payment_method:z.string().nullable().optional(),bank_account:z.uuid().nullable(),bank_account_name:z.string().optional(),
 farm:z.uuid().nullable(),farm_name:z.string().optional(),species_name:z.string().optional(),animal_batch_name:z.string().optional(),planting_cycle_name:z.string().optional(),
 payment_events:z.array(paymentEventSchema),series_kind:z.string().nullable().optional(),series_number:z.number().int().nullable().optional(),series_count:z.number().int().nullable().optional(),
});
export type FinanceTransaction=z.infer<typeof transactionSchema>;
export type PaymentEvent=z.infer<typeof paymentEventSchema>;
export const transactionPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(transactionSchema)});
export const categorySchema=z.object({id:z.uuid(),name:z.string(),category_type:z.enum(financeKinds),parent:z.uuid().nullable().optional(),is_active:z.boolean()});
export const accountSchema=z.object({id:z.uuid(),name:z.string(),account_type:z.string(),initial_balance:money,current_balance:money,is_active:z.boolean()});
export type FinanceCategory=z.infer<typeof categorySchema>;
export type FinanceAccount=z.infer<typeof accountSchema>;
/** Catalog endpoints may answer a list or a DRF page. */
export const listOrPage=<T extends z.ZodType>(row:T)=>z.union([z.array(row),z.object({results:z.array(row),next:z.string().nullable()})]);

export const statsSchema=z.object({
 summary:z.object({balance:z.number(),total_revenue:z.number(),total_expense:z.number(),receivable:z.number(),payable:z.number()}),
 cash_flow:z.array(z.object({date:day,revenue:z.number(),expense:z.number()})),
 expenses_by_category:z.array(z.object({name:z.string(),value:z.number()})),
});
export type FinanceStats=z.infer<typeof statsSchema>;
const amount=z.union([z.string(),z.number()]).transform(Number);
export const projectionSchema=z.object({start_date:day,end_date:day,opening_balance:amount,closing_balance:amount,first_negative_date:day.nullable(),included_titles:z.number().int(),unassigned_titles:z.number().int(),include_overdue:z.boolean(),days:z.array(z.object({date:day,revenue:amount,expense:amount,balance:amount}))});
export type FinanceProjection=z.infer<typeof projectionSchema>;

export const transactionQuerySchema=z.object({type:z.enum(financeKinds),status:z.enum(['',...financeStatuses]).default(''),search:z.string().trim().max(100).default(''),page:z.number().int().min(1).max(100000).default(1),due_date__gte:day.optional(),due_date__lte:day.optional()});
export type TransactionQuery=z.input<typeof transactionQuerySchema>;

const positive=z.string().trim().transform(v=>v.replace(/\./g,'').replace(',','.')).pipe(z.string().regex(/^\d+(\.\d{1,2})?$/)).refine(v=>Number(v)>0);
/** Mobile creation keeps the essential fields; productive links and series stay on the web. */
export const transactionInputSchema=z.object({description:z.string().trim().min(1).max(255),amount:positive,category:z.uuid(),due_date:day,bank_account:z.uuid().nullable(),farm:z.uuid().nullable(),notes:z.string().trim().max(2000)});
export type TransactionInput=z.input<typeof transactionInputSchema>;
export const settlementSchema=z.object({bank_account:z.uuid(),payment_date:day,payment_method:z.enum(paymentMethods),idempotency_key:z.uuid()});
export type SettlementInput=z.infer<typeof settlementSchema>;
export const reversalSchema=z.object({payment:z.uuid().optional(),reason:z.string().trim().min(3).max(1000),idempotency_key:z.uuid()});
export type ReversalInput=z.infer<typeof reversalSchema>;

/** Net settled amount (payments minus reversals) and whether a reversal is still possible. */
export function settledAmount(row:Pick<FinanceTransaction,'payment_events'>){
 return row.payment_events.reduce((sum,event)=>sum+(event.kind==='reversal'?-1:1)*Number(event.amount),0);
}
export function canSettle(row:FinanceTransaction){return row.status==='pending'||row.status==='overdue';}
/** The payment the server expects in a reversal: the one not yet reversed. Legacy paid titles have none. */
export function activePayment(row:FinanceTransaction){const reversed=new Set(row.payment_events.filter(e=>e.kind==='reversal'&&e.reverses).map(e=>e.reverses));return row.payment_events.find(e=>e.kind==='payment'&&!reversed.has(e.id));}
export function canReverse(row:FinanceTransaction){return row.status==='paid';}

/** The title changed on the server (status or active payment) since it was shown; reload before retrying. */
export class FinanceChanged extends Error{constructor(){super('finance changed');this.name='FinanceChanged';}}
