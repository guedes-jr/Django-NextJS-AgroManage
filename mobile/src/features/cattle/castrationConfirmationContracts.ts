import {z} from 'zod';
import {productionSchema} from './contracts';
export const castrationReviewEntrySchema=z.object({animal:z.uuid(),identifier:z.string(),cattle_purpose:z.enum(['unknown','beef','dairy','dual']),gender:z.literal('M'),is_castrated:z.literal(false)});
export type CastrationReviewEntry=z.infer<typeof castrationReviewEntrySchema>;
export const castrationReviewSchema=z.object({id:z.uuid(),farm:z.uuid(),farm_name:z.string(),production:productionSchema,description:z.string(),responsible:z.string(),notes:z.string(),date:z.iso.date(),participant_count:z.number().int().min(1).max(1000),entries:z.array(castrationReviewEntrySchema).min(1).max(1000),preview_token:z.string().min(1).max(60000)}).refine(value=>value.participant_count===value.entries.length&&new Set(value.entries.map(row=>row.animal)).size===value.entries.length);
export type CastrationReview=z.infer<typeof castrationReviewSchema>;
export function ensureCastrationReview(review:CastrationReview,id:string,farm:string,production:string){if(review.id!==id||review.farm!==farm||review.production!==production)throw Error('castration review scope');return review;}
