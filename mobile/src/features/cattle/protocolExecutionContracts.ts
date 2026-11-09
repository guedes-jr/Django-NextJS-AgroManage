import {z} from 'zod';
import {productionSchema} from './contracts';
export const protocolExecutionScopeSchema=z.object({farm:z.uuid(),production:productionSchema,step:z.uuid()});
export type ProtocolExecutionScope=z.infer<typeof protocolExecutionScopeSchema>;
export const protocolExecutionInputSchema=protocolExecutionScopeSchema.extend({date:z.iso.date(),notes:z.string().trim().max(1000),documentary:z.literal(true)});
export type ProtocolExecutionInput=z.infer<typeof protocolExecutionInputSchema>;
export const protocolExecutionOptionsSchema=protocolExecutionScopeSchema.extend({run:z.uuid(),animal:z.object({id:z.uuid(),identifier:z.string()}),name:z.string(),number:z.number().int().min(0).max(29),due_date:z.iso.date(),earliest_date:z.iso.date(),today:z.iso.date(),timezone:z.string().min(1)});
export type ProtocolExecutionOptions=z.infer<typeof protocolExecutionOptionsSchema>;
export const protocolExecutionReviewSchema=protocolExecutionOptionsSchema.extend({command:protocolExecutionInputSchema,preview_token:z.string().min(1).max(60000)});
export type ProtocolExecutionReview=z.infer<typeof protocolExecutionReviewSchema>;
export const protocolExecutionKey=(input:ProtocolExecutionInput)=>JSON.stringify(protocolExecutionInputSchema.parse(input));
export function validateProtocolExecution(review:ProtocolExecutionReview,input:ProtocolExecutionInput){if(protocolExecutionKey(review.command)!==protocolExecutionKey(input)||review.step!==input.step||review.farm!==input.farm||review.production!==input.production||input.date<review.earliest_date||input.date>review.today)throw Error('execution review');return review;}
