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
export const organizationUpdateSchema=z.object({name:z.string().trim().min(2).max(255),email:z.union([z.literal(''),z.email()]),phone:z.string().trim().max(30)});
export type OrganizationUpdate=z.input<typeof organizationUpdateSchema>;
/** Human-readable line for an address returned by the API, whatever its naming. */
export function addressLine(row:Record<string,unknown>){
 const pick=(...keys:string[])=>keys.map(k=>row[k]).find(v=>typeof v==='string'&&v.trim()) as string|undefined;
 return [pick('street','logradouro'),pick('number','numero'),pick('district','bairro'),pick('city','cidade'),pick('state','estado'),pick('zip_code','cep')].filter(Boolean).join(' · ');
}
