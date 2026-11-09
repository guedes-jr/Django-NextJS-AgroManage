import {z} from 'zod';
import {productionSchema,matchesProduction} from './contracts';
export const reproductionGroups=['heifers','cows','lactating','dry','open','covered','pregnant','suckling','calves'] as const;
export const reproductionQuerySchema=z.object({production:productionSchema,farm:z.uuid().optional(),group:z.enum(['all',...reproductionGroups]),page:z.number().int().min(1).max(100000),search:z.string().trim().max(100)});
export type ReproductionQuery=z.infer<typeof reproductionQuerySchema>;
export const reproductionAnimalSchema=z.object({id:z.uuid(),identifier:z.string(),farm:z.uuid(),farm_name:z.string(),cattle_purpose:z.string(),gender:z.string(),category:z.string(),reproductive_status:z.string(),is_lactating:z.boolean(),last_mating_date:z.iso.date().nullable(),pregnancy_start_date:z.iso.date().nullable(),expected_birth_date:z.iso.date().nullable()});
export type ReproductionAnimal=z.infer<typeof reproductionAnimalSchema>;
export const reproductionDetailSchema=reproductionAnimalSchema.extend({notes:z.string(),entry_date:z.iso.date().nullable(),birth_date:z.iso.date().nullable()});
const count=z.number().int().nonnegative();
export const reproductionPageSchema=z.object({count,next:z.string().nullable(),previous:z.string().nullable(),results:z.array(reproductionAnimalSchema),today:z.iso.date(),timezone:z.string().min(1),groups:z.array(z.enum(reproductionGroups)),summary:z.object({females:count,heifers:count,cows:count,lactating:count,dry:count,open:count,covered:count,pregnant:count,suckling:count,calves:count})});
export function ensureReproductionScope<T extends ReproductionAnimal>(row:T,query:ReproductionQuery){if(!matchesProduction(row.cattle_purpose,query.production)||query.farm&&row.farm!==query.farm)throw Error('reproduction scope');return row;}
