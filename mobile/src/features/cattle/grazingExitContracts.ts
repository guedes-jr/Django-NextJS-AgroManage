import {z} from 'zod';
import {grazingSchema,ensureGrazingScope} from './grazingContracts';
export {canEnterPasture as canExitPasture} from './grazingEntryContracts';
const version=z.iso.datetime({offset:true});
export const exitOccupationSchema=grazingSchema.safeExtend({version}).refine(row=>row.exit_date===null);
export const exitOptionsSchema=z.object({occupation:exitOccupationSchema,today:z.iso.date(),timezone:z.string().min(1)});
export type ExitOptions=z.infer<typeof exitOptionsSchema>;
export const exitInputSchema=z.object({farm:z.uuid(),pasture:z.uuid(),grazing_version:version,exit_date:z.iso.date()});
export type ExitInput=z.infer<typeof exitInputSchema>;
export const exitReviewSchema=z.object({occupation:exitOccupationSchema,command:exitInputSchema,preview_token:z.string().min(1).max(60000)});
export type ExitReview=z.infer<typeof exitReviewSchema>;
export function exitKey(input:ExitInput){return JSON.stringify(exitInputSchema.parse(input));}
export function validateExitReview(review:ExitReview,input:ExitInput,id:string){ensureGrazingScope(review.occupation,input,id);if(exitKey(review.command)!==exitKey(input)||review.occupation.version!==input.grazing_version||input.exit_date<review.occupation.entry_date)throw Error('exit review');return review;}
