import {z} from 'zod';
import type {User} from '../auth/contracts';
import {canReadInventory} from '../inventory/contracts';
import {canReadCattle} from '../cattle/contracts';

export const reportKinds=['low-stock','expiry','herd'] as const;
export type ReportKind=typeof reportKinds[number];
export function canReadReport(user:User,kind:ReportKind){
 if(user.force_password_change||user.is_platform_staff||user.affiliate_portal_only)return false;
 if(kind==='herd')return ['admin','manager'].includes(user.access.role)&&canReadCattle(user);
 return canReadInventory(user);
}
export function canUseReports(user:User){return reportKinds.some(kind=>canReadReport(user,kind));}
const n=z.number();
export const lowStockSchema=z.object({items:z.array(z.object({id:z.string(),name:z.string(),category:z.string().optional(),unit:z.string().optional(),current_quantity:n,min_stock:n,needed:n,urgency:z.enum(['critical','warning'])})),total:n,critical:n,warning:n});
const lotRow=z.object({id:z.string(),item_id:z.string().optional(),item_name:z.string(),lote_code:z.string().optional(),quantity:n,expiry_date:z.iso.date(),days_until_expiry:n.optional(),total_value:n.optional(),urgency:z.string().optional()});
export const expirySchema=z.object({expiring:z.array(lotRow),expired:z.array(lotRow),total_expiring:n,total_expired:n,total_expiring_value:n.optional(),total_expired_value:n.optional()});
const group=z.object({total:n.nullable(),batches:n.nullable()});
export const herdInventorySchema=z.object({items:z.array(z.object({id:z.string(),farm:z.string(),species:z.string(),batch_code:z.string(),name:z.string().nullable().optional(),category:z.string().nullable().optional(),quantity:n,status_display:z.string().optional(),avg_weight:n.nullable().optional()})),by_species:z.array(group.extend({species:z.string()})),by_farm:z.array(group.extend({farm:z.string()}))});
export type LowStockReport=z.infer<typeof lowStockSchema>;
export type ExpiryReport=z.infer<typeof expirySchema>;
export type HerdInventoryReport=z.infer<typeof herdInventorySchema>;
