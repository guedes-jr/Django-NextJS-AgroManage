import {z} from 'zod';
export const pastureQuerySchema=z.object({farm:z.uuid().optional(),search:z.string().trim().max(100),page:z.number().int().min(1).max(100000)});
export type PastureQuery=z.infer<typeof pastureQuerySchema>;
// Method-field decimals are JSON numbers on the existing endpoint; model fields are strings.
const amount=z.union([z.string().regex(/^\d+(\.\d+)?$/),z.number().finite().nonnegative()]).transform(String);
const count=z.number().int().nonnegative();
export const pastureStates=['unknown','available','resting','blocked','occupied'] as const;
export const pastureSchema=z.object({id:z.uuid(),farm:z.uuid(),farm_name:z.string(),name:z.string(),area_ha:amount,max_stocking_ua_ha:amount.nullable(),notes:z.string(),availability:z.enum(['unknown','available','resting','blocked']),availability_reason:z.string(),occupancy:z.object({heads:count,missing_weight_heads:count,live_weight_kg:amount,stocking_ua_ha:amount.nullable(),occupied_days:count.nullable(),last_exit_date:z.iso.date().nullable(),empty_days:count.nullable(),state:z.enum(pastureStates),capacity_percent:amount.nullable()})});
export type Pasture=z.infer<typeof pastureSchema>;
export const pasturePageSchema=z.object({count,next:z.string().nullable(),previous:z.string().nullable(),results:z.array(pastureSchema)});
export function ensurePastureScope<T extends Pasture>(row:T,farm?:string,id?:string){if(farm&&row.farm!==farm||id&&row.id!==id)throw Error('pasture scope');return row;}
