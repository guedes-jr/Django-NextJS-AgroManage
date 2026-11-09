import { z } from 'zod';
import { canCreateCattle,cattleCategories,type CattleBatch,type Production } from './contracts';
import type { User } from '../auth/contracts';
export const batchPhases=['creche','crescimento','engorda','reproducao'] as const;
export const batchOrigins=['purchased','born','donated'] as const;
export const batchGenders=['F','M','Misto'] as const;
const optionalDay=z.union([z.literal(''),z.iso.date()]);
const weight=z.union([z.literal(''),z.string().trim().regex(/^\d{1,6}([.,]\d{1,2})?$/).refine(v=>/[1-9]/.test(v))]);
export const batchInput=z.object({batch_code:z.string().trim().min(1).max(50),name:z.string().trim().max(100),category:z.enum(cattleCategories),gender:z.enum(batchGenders),phase:z.enum(batchPhases),origin:z.enum(batchOrigins),quantity:z.string().regex(/^[1-9]\d{0,9}$/).refine(v=>Number(v)<=2147483647),birth_date:optionalDay,entry_date:z.iso.date(),avg_weight_kg:weight,notes:z.string()});
export type BatchInput=z.infer<typeof batchInput>;
export function batchInputSchema(today:string){return batchInput.refine(v=>v.entry_date<=today&&(!v.birth_date||v.birth_date<=v.entry_date),{path:['birth_date'],message:'date'});}
export function batchPayload(v:BatchInput,creation?:{farm:string;production:Production}){
 const base={batch_code:v.batch_code,name:v.name,birth_date:v.birth_date||null,notes:v.notes};
 return creation?{...base,farm_id:z.uuid().parse(creation.farm),cattle_purpose:creation.production,category:v.category,gender:v.gender,phase:v.phase,origin:v.origin,quantity:Number(v.quantity),entry_date:v.entry_date,...(v.avg_weight_kg?{avg_weight_kg:v.avg_weight_kg.replace(',','.')}: {})}:base;
}
export function canEditBatch(user:User,batch:CattleBatch){return canCreateCattle(user)&&['admin','manager'].includes(user.access.role)&&batch.status==='active';}
export function canTransfer(user:User){return canCreateCattle(user)&&['admin','manager'].includes(user.access.role)&&user.access.can_view_financial;}
export const transferInput=z.object({source:z.uuid(),destination:z.uuid(),quantity:z.number().int().min(1).max(2147483647),animals:z.array(z.uuid()).max(1000),date:z.iso.date(),reason:z.string().trim().min(1).max(300),request_key:z.uuid()}).refine(v=>v.source!==v.destination&&new Set(v.animals).size===v.animals.length&&(!v.animals.length||v.quantity===v.animals.length));
export type TransferInput=z.infer<typeof transferInput>;
export const transferPreviewSchema=z.object({source:z.uuid(),destination:z.uuid(),source_code:z.string(),destination_code:z.string(),farm:z.uuid(),quantity:z.number().int().positive(),source_before:z.number().int().nonnegative(),source_after:z.number().int().nonnegative(),destination_before:z.number().int().nonnegative(),destination_after:z.number().int().nonnegative(),animals:z.array(z.uuid()),date:z.iso.date(),reason:z.string()}).refine(v=>v.source_after===v.source_before-v.quantity&&v.destination_after===v.destination_before+v.quantity);
export type TransferPreview=z.infer<typeof transferPreviewSchema>;
export function matchesPreview(input:TransferInput,preview:TransferPreview,farm:string){return preview.farm===farm&&preview.source===input.source&&preview.destination===input.destination&&preview.quantity===input.quantity&&preview.date===input.date&&preview.reason===input.reason&&[...preview.animals].sort().join() === [...input.animals].sort().join();}
const decimal=z.union([z.string().regex(/^\d+(\.\d+)?$/),z.number().nonnegative().finite()]).transform(String);
export const cattleOverviewSchema=z.object({total_head:z.number().int().nonnegative(),identified_animals:z.number().int().nonnegative(),active_batches:z.number().int().nonnegative(),pregnant_females:z.number().int().nonnegative(),lactating_females:z.number().int().nonnegative(),average_identified_weight:decimal.nullable(),categories:z.array(z.object({category:z.string(),quantity:z.number().int().nonnegative()}))});
