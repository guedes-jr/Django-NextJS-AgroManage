import {z} from 'zod';
import {exitOptionsSchema,exitOccupationSchema} from './grazingExitContracts';
import {entryPastureSchema,entryScopeSchema} from './grazingEntryContracts';
import {ensureGrazingScope} from './grazingContracts';
export const transferOptionsSchema=exitOptionsSchema.extend({batch_version:z.iso.datetime({offset:true})}).refine(v=>v.occupation.batch_status==='active'&&v.occupation.current_quantity>0);
export type TransferOptions=z.infer<typeof transferOptionsSchema>;
export const transferInputSchema=entryScopeSchema.extend({grazing_version:z.iso.datetime({offset:true}),batch_version:z.iso.datetime({offset:true}),destination:z.uuid(),destination_version:z.iso.datetime({offset:true}),date:z.iso.date(),notes:z.string().trim().max(2000)}).refine(v=>v.pasture!==v.destination);
export type TransferInput=z.infer<typeof transferInputSchema>;
export const transferDestinationPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(entryPastureSchema)});
export type TransferDestination=z.infer<typeof entryPastureSchema>;
export const transferReviewSchema=z.object({occupation:exitOccupationSchema,destination:entryPastureSchema,batch_version:z.iso.datetime({offset:true}),earliest_date:z.iso.date(),command:transferInputSchema,preview_token:z.string().min(1).max(60000)});
export type TransferReview=z.infer<typeof transferReviewSchema>;
export const transferKey=(input:TransferInput)=>JSON.stringify(transferInputSchema.parse(input));
export function validateTransferReview(review:TransferReview,input:TransferInput,id:string){ensureGrazingScope(review.occupation,input,id);if(transferKey(review.command)!==transferKey(input)||review.occupation.version!==input.grazing_version||review.batch_version!==input.batch_version||review.destination.id!==input.destination||review.destination.farm!==input.farm||review.destination.version!==input.destination_version||review.occupation.batch_status!=='active'||review.occupation.current_quantity<1||input.date<review.earliest_date||input.date<review.occupation.entry_date)throw Error('transfer review');return review;}
