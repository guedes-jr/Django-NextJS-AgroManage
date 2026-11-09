import {z} from 'zod';
import {productionSchema} from './contracts';
export const sanitaryReviewEntrySchema=z.object({animal:z.uuid(),identifier:z.string(),cattle_purpose:z.enum(['unknown','beef','dairy','dual'])});
export type SanitaryReviewEntry=z.infer<typeof sanitaryReviewEntrySchema>;
export const sanitaryReviewSchema=z.object({id:z.uuid(),farm:z.uuid(),farm_name:z.string(),production:productionSchema,description:z.string(),responsible:z.string(),notes:z.string(),date:z.iso.date(),treatment_type:z.enum(['exam','surgery','other']),next_procedure_date:z.iso.date().nullable(),milk_withdrawal_until:z.iso.date().nullable(),meat_withdrawal_until:z.iso.date().nullable(),participant_count:z.number().int().min(1).max(1000),entries:z.array(sanitaryReviewEntrySchema).min(1).max(1000),preview_token:z.string().min(1).max(60000)}).refine(value=>[value.next_procedure_date,value.milk_withdrawal_until,value.meat_withdrawal_until].every(date=>!date||date>=value.date)&&value.participant_count===value.entries.length&&new Set(value.entries.map(row=>row.animal)).size===value.entries.length);
export type SanitaryReview=z.infer<typeof sanitaryReviewSchema>;
export function ensureSanitaryReview(review:SanitaryReview,id:string,farm:string,production:string){if(review.id!==id||review.farm!==farm||review.production!==production)throw Error('sanitary review scope');return review;}
