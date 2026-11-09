import {z} from 'zod';
import {productionSchema,matchesProduction} from './contracts';
import {occurrenceOptionsSchema,occurrenceMemberSchema} from './occurrenceContracts';
export {canWriteOccurrence as canStartProtocol} from './occurrenceContracts';
export const protocolStartOptionsSchema=occurrenceOptionsSchema;
export type ProtocolStartOptions=z.infer<typeof protocolStartOptionsSchema>;
export const protocolStartAnimalSchema=z.object({id:z.uuid(),farm:z.uuid(),identifier:z.string(),purpose:z.enum(['beef','dairy','dual']),entry_date:z.iso.date().nullable(),version:z.iso.datetime({offset:true})});
export type ProtocolStartAnimal=z.infer<typeof protocolStartAnimalSchema>;
export const protocolStartInputSchema=z.object({farm:z.uuid(),production:productionSchema,animal:z.uuid(),animal_version:z.iso.datetime({offset:true}),protocol:z.uuid(),protocol_version:z.number().int().positive(),start_date:z.iso.date(),assigned_to:z.uuid(),request_key:z.uuid()});
export type ProtocolStartInput=z.infer<typeof protocolStartInputSchema>;
export const protocolStartReviewSchema=z.object({farm:z.object({id:z.uuid(),name:z.string()}),production:productionSchema,animal:protocolStartAnimalSchema,protocol:z.object({id:z.uuid(),name:z.string(),version:z.number().int().positive()}),assigned_to:occurrenceMemberSchema,start_date:z.iso.date(),steps:z.array(z.object({number:z.number().int().nonnegative(),name:z.string(),day:z.number().int().min(0).max(365),due_date:z.iso.date()})).min(1).max(30),command:protocolStartInputSchema,preview_token:z.string().min(1).max(60000)}).refine(v=>v.steps.every((s,i)=>s.number===i&&s.due_date===new Date(new Date(`${v.start_date}T12:00:00Z`).getTime()+s.day*86400000).toISOString().slice(0,10)&&(i===0||s.day>=v.steps[i-1]!.day)));
export type ProtocolStartReview=z.infer<typeof protocolStartReviewSchema>;
export const protocolStartKey=(value:ProtocolStartInput)=>JSON.stringify(protocolStartInputSchema.parse(value));
export function validateProtocolStart(review:ProtocolStartReview,input:ProtocolStartInput){if(!matchesProduction(review.animal.purpose,input.production)||protocolStartKey(review.command)!==protocolStartKey(input)||review.farm.id!==input.farm||review.animal.farm!==input.farm||review.production!==input.production||review.animal.id!==input.animal||review.animal.version!==input.animal_version||review.protocol.id!==input.protocol||review.protocol.version!==input.protocol_version||review.assigned_to.id!==input.assigned_to||review.start_date!==input.start_date||review.animal.entry_date&&input.start_date<review.animal.entry_date)throw Error('protocol review');return review;}
