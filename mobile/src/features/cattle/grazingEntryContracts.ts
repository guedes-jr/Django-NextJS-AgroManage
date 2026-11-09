import {z} from 'zod';
import type {User} from '../auth/contracts';
import {canReadCattle} from './contracts';
export function canEnterPasture(user:User){return canReadCattle(user)&&!user.access.read_only&&['admin','manager'].includes(user.access.role);}
export const entryScopeSchema=z.object({farm:z.uuid(),pasture:z.uuid()});
export type EntryScope=z.infer<typeof entryScopeSchema>;
const version=z.iso.datetime({offset:true});
export const entryPastureSchema=z.object({id:z.uuid(),farm:z.uuid(),farm_name:z.string(),name:z.string(),version,availability:z.enum(['unknown','available'])});
export const entryOptionsSchema=z.object({pasture:entryPastureSchema,today:z.iso.date(),timezone:z.string().min(1)});
export type EntryOptions=z.infer<typeof entryOptionsSchema>;
export const entryBatchSchema=z.object({id:z.uuid(),batch_code:z.string(),farm:z.uuid(),cattle_purpose:z.enum(['unknown','beef','dairy','dual']),quantity:z.number().int().positive(),entry_date:z.iso.date(),version,last_exit_date:z.iso.date().nullable()});
export type EntryBatch=z.infer<typeof entryBatchSchema>;
export const entryBatchPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(entryBatchSchema)});
export const entryInputSchema=entryScopeSchema.extend({pasture_version:version,batch:z.uuid(),batch_version:version,entry_date:z.iso.date(),notes:z.string().trim().max(2000)});
export type EntryInput=z.infer<typeof entryInputSchema>;
export const entryReviewSchema=z.object({pasture:entryPastureSchema,batch:entryBatchSchema,earliest_date:z.iso.date(),command:entryInputSchema,preview_token:z.string().min(1).max(60000)});
export type EntryReview=z.infer<typeof entryReviewSchema>;
export function entryKey(input:EntryInput){return JSON.stringify(entryInputSchema.parse(input));}
export function validateEntryReview(review:EntryReview,input:EntryInput){if(entryKey(review.command)!==entryKey(input)||review.pasture.id!==input.pasture||review.pasture.farm!==input.farm||review.pasture.version!==input.pasture_version||review.batch.id!==input.batch||review.batch.farm!==input.farm||review.batch.version!==input.batch_version||input.entry_date<review.earliest_date)throw Error('entry review');return review;}
