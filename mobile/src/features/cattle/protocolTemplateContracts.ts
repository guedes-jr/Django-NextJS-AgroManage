import {z} from 'zod';
export const protocolTemplateInputSchema=z.object({name:z.string().trim().min(1).max(100),source:z.uuid().nullable(),steps:z.array(z.object({name:z.string().trim().min(1).max(150),day:z.number().int().min(0).max(365)})).min(1).max(30)}).refine(v=>v.steps.every((s,i)=>i===0||s.day>=v.steps[i-1]!.day));
export type ProtocolTemplateInput=z.infer<typeof protocolTemplateInputSchema>;
export const protocolTemplateReviewSchema=z.object({name:z.string(),source:z.uuid().nullable(),previous_version:z.number().int().nonnegative(),version:z.number().int().positive(),steps:z.array(z.object({name:z.string(),day:z.number().int().min(0).max(365)})).min(1).max(30),command:protocolTemplateInputSchema,preview_token:z.string().min(1).max(60000)}).refine(v=>v.version===v.previous_version+1);
export type ProtocolTemplateReview=z.infer<typeof protocolTemplateReviewSchema>;
export const protocolTemplateKey=(v:ProtocolTemplateInput)=>JSON.stringify(protocolTemplateInputSchema.parse(v));
export function validateProtocolTemplate(review:ProtocolTemplateReview,input:ProtocolTemplateInput){const v=protocolTemplateInputSchema.parse(input);if(protocolTemplateKey(review.command)!==protocolTemplateKey(v)||review.name!==v.name||review.source!==v.source||JSON.stringify(review.steps)!==JSON.stringify(v.steps))throw Error('template review');return review;}
