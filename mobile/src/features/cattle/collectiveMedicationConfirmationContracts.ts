import {z} from 'zod';
import {sanitaryReviewSchema} from './sanitaryConfirmationContracts';
import {medicationLotSchema} from '../clinic/medicationContracts';
import {medicationTotal} from './collectiveMedicationContracts';
const decimal=z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/);
const minor=(v:string)=>{const [whole,fraction='']=v.split('.');return BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'));};
export const collectiveMedicationReviewSchema=z.object({...sanitaryReviewSchema.shape,treatment_type:z.literal('medication'),lot:medicationLotSchema,quantity:decimal,total_quantity:decimal,remaining:decimal,minimum_withdrawal:z.iso.date().nullable()}).refine(v=>{try{return v.participant_count===v.entries.length&&new Set(v.entries.map(e=>e.animal)).size===v.entries.length&&minor(medicationTotal(v.quantity,v.participant_count))===minor(v.total_quantity)&&minor(v.lot.balance)-minor(v.total_quantity)===minor(v.remaining)&&[v.next_procedure_date,v.milk_withdrawal_until,v.meat_withdrawal_until].every(date=>!date||date>=v.date)&&(!v.minimum_withdrawal||!!v.milk_withdrawal_until&&!!v.meat_withdrawal_until&&v.milk_withdrawal_until>=v.minimum_withdrawal&&v.meat_withdrawal_until>=v.minimum_withdrawal);}catch{return false;}});
export type CollectiveMedicationReview=z.infer<typeof collectiveMedicationReviewSchema>;
export function ensureCollectiveMedicationReview(review:CollectiveMedicationReview,id:string,farm:string,production:string){if(review.id!==id||review.farm!==farm||review.production!==production)throw Error('collective medication review scope');return review;}
export type CollectiveMedicationReviewEntry=CollectiveMedicationReview['entries'][number];
