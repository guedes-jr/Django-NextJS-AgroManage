import {z} from 'zod';
import {milkCents} from '../cattle/milkTrendContracts';
export const tankMovementKinds=['production','collection','discard'] as const;
export const tankMovementQuerySchema=z.object({tank:z.uuid(),farm:z.uuid(),kind:z.enum(['all',...tankMovementKinds]),date:z.union([z.literal(''),z.iso.date()]),page:z.number().int().min(1).max(100000)});
export type TankMovementQuery=z.infer<typeof tankMovementQuerySchema>;
export const tankMovementSchema=z.object({id:z.uuid(),timezone:z.string().refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}}),farm:z.uuid(),tank:z.uuid(),tank_name:z.string(),farm_name:z.string(),kind:z.enum(tankMovementKinds),date:z.iso.date(),liters:z.string().regex(/^\d{1,20}\.\d{2}$/).refine(v=>/^\d{1,20}\.\d{2}$/.test(v)&&milkCents(v)>0n),buyer:z.string(),driver:z.string(),vehicle:z.string(),document:z.string(),reason:z.string(),notes:z.string(),recorded_by:z.string(),cancelled_at:z.iso.datetime({offset:true}).nullable(),cancellation_reason:z.string()});
export type TankMovement=z.infer<typeof tankMovementSchema>;
export const tankMovementPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(tankMovementSchema).max(20)}).refine(v=>v.results.length<=v.count&&new Set(v.results.map(r=>r.id)).size===v.results.length);
export function ensureTankMovementScope(row:TankMovement,query:Pick<TankMovementQuery,'tank'|'farm'>,id?:string){if(row.tank!==query.tank||row.farm!==query.farm||id&&row.id!==id)throw Error('tank movement scope');return row;}
