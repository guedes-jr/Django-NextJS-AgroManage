import {z} from 'zod';
import {milkCents} from '../cattle/milkTrendContracts';
export const tankQuerySchema=z.object({farm:z.uuid().optional(),status:z.enum(['all','active','inactive']),page:z.number().int().min(1).max(100000)});
export type TankQuery=z.infer<typeof tankQuerySchema>;
const volume=z.string().regex(/^\d{1,20}\.\d{2}$/);
export const tankSchema=z.object({id:z.uuid(),farm:z.uuid(),farm_name:z.string(),name:z.string(),capacity_liters:volume.refine(v=>/^\d{1,20}\.\d{2}$/.test(v)&&milkCents(v)>0n),balance_liters:volume,is_active:z.boolean(),notes:z.string()});
export type MilkTank=z.infer<typeof tankSchema>;
export const tankPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(tankSchema).max(20)}).refine(v=>new Set(v.results.map(r=>r.id)).size===v.results.length&&v.results.length<=v.count);
export function ensureTankScope<T extends MilkTank>(tank:T,farm?:string,id?:string){if(farm&&tank.farm!==farm||id&&tank.id!==id)throw Error('tank scope');return tank;}
