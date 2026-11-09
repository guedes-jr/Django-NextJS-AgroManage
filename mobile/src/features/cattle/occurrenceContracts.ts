import {z} from 'zod';
import {canReadCattle,productionSchema,matchesProduction} from './contracts';
import type {User} from '../auth/contracts';
import {operationSchema} from './operationContracts';
export function canWriteOccurrence(user:User){return canReadCattle(user)&&!user.access.read_only;}
export const occurrenceKinds=['animal','water','fence','pasture','other'] as const;
export const occurrenceMemberSchema=z.object({id:z.uuid(),full_name:z.string()});
export type OccurrenceMember=z.infer<typeof occurrenceMemberSchema>;
export const occurrenceMemberPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(occurrenceMemberSchema)});
export const occurrenceOptionsSchema=z.object({farm:z.object({id:z.uuid(),name:z.string()}),production:productionSchema,today:z.iso.date(),timezone:z.string().min(1),actor:occurrenceMemberSchema});
export type OccurrenceOptions=z.infer<typeof occurrenceOptionsSchema>;
export const occurrenceTargetSchema=z.object({id:z.uuid(),kind:z.enum(['animals','batches']),identifier:z.string(),farm:z.uuid(),purpose:z.enum(['beef','dairy','dual']),status:z.string(),version:z.iso.datetime({offset:true})});
export type OccurrenceTarget=z.infer<typeof occurrenceTargetSchema>;
export const occurrenceTargetPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(occurrenceTargetSchema)});
export const occurrenceFormSchema=z.object({kind:z.enum(occurrenceKinds),date:z.iso.date(),due_date:z.iso.date(),description:z.string().trim().min(1).max(1000)}).refine(v=>v.due_date>=v.date);
export type OccurrenceForm=z.infer<typeof occurrenceFormSchema>;
export const occurrenceInputSchema=occurrenceFormSchema.safeExtend({farm:z.uuid(),production:productionSchema,assigned_to:z.uuid(),target_kind:z.enum(['farm','animals','batches']),target:z.uuid().nullable(),target_version:z.iso.datetime({offset:true}).nullable()}).refine(v=>v.target_kind==='farm'?v.target===null&&v.target_version===null:!!v.target&&!!v.target_version);
export type OccurrenceInput=z.infer<typeof occurrenceInputSchema>;
export function occurrencePayload(values:OccurrenceForm,options:OccurrenceOptions,assignee:OccurrenceMember,kind:'farm'|'animals'|'batches',target?:OccurrenceTarget){if(values.date>options.today||kind!=='farm'&&(!target||target.kind!==kind||target.farm!==options.farm.id||!matchesProduction(target.purpose,options.production)))throw Error('occurrence context');return occurrenceInputSchema.parse({...values,farm:options.farm.id,production:options.production,assigned_to:assignee.id,target_kind:kind,target:kind==='farm'?null:target?.id,target_version:kind==='farm'?null:target?.version});}
export const occurrenceResolutionOptionsSchema=z.object({task:z.uuid(),record:operationSchema.refine(row=>row.tab==='occurrences'&&!row.resolved_at&&row.can_resolve),context_token:z.string().min(1).max(60000)});
export type OccurrenceResolutionOptions=z.infer<typeof occurrenceResolutionOptionsSchema>;
export const occurrenceResolutionInputSchema=z.object({farm:z.uuid(),production:productionSchema,context_token:z.string().min(1).max(60000),resolution:z.string().trim().min(1).max(1000)});
export type OccurrenceResolutionInput=z.infer<typeof occurrenceResolutionInputSchema>;
