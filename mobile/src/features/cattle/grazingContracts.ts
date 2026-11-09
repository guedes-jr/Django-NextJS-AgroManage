import {z} from 'zod';
export const grazingQuerySchema=z.object({farm:z.uuid(),pasture:z.uuid(),state:z.enum(['all','open','closed']),search:z.string().trim().max(100),page:z.number().int().min(1).max(100000)});
export type GrazingQuery=z.infer<typeof grazingQuerySchema>;
export const grazingSchema=z.object({id:z.uuid(),farm:z.uuid(),farm_name:z.string(),pasture:z.uuid(),pasture_name:z.string(),batch:z.uuid(),batch_code:z.string(),batch_purpose:z.enum(['unknown','beef','dairy','dual']),batch_status:z.string(),current_quantity:z.number().int().nonnegative(),entry_date:z.iso.date(),exit_date:z.iso.date().nullable(),notes:z.string()}).refine(row=>!row.exit_date||row.exit_date>=row.entry_date);
export type Grazing=z.infer<typeof grazingSchema>;
export const grazingPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(grazingSchema)});
export function ensureGrazingScope<T extends Grazing>(row:T,query:Pick<GrazingQuery,'farm'|'pasture'>,id?:string){if(row.farm!==query.farm||row.pasture!==query.pasture||id&&row.id!==id)throw Error('grazing scope');return row;}
