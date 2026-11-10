import {z} from 'zod';
import {productionSchema,matchesProduction} from './contracts';
export const protocolKinds=['protocols','protocol-runs'] as const;
export const protocolQuerySchema=z.object({kind:z.enum(protocolKinds),production:productionSchema,farm:z.uuid().optional(),search:z.string().trim().max(100),page:z.number().int().min(1).max(100000)});
export type ProtocolQuery=z.infer<typeof protocolQuerySchema>;
const definition=z.object({name:z.string(),day:z.number().int().min(0).max(365)});
export const protocolSchema=z.object({id:z.uuid(),name:z.string(),version:z.number().int().positive(),steps:z.array(definition).min(1).max(30)});
export const protocolRunSchema=z.object({id:z.uuid(),farm:z.uuid(),farm_name:z.string(),animal:z.object({id:z.uuid(),identifier:z.string(),purpose:z.enum(['beef','dairy','dual'])}),protocol:z.object({id:z.uuid(),name:z.string(),version:z.number().int().positive()}),start_date:z.iso.date(),total:z.number().int().min(1).max(30),completed:z.number().int().nonnegative()}).refine(v=>v.completed<=v.total);
const execution=z.object({mating:z.object({id:z.uuid(),date:z.iso.date(),kind:z.enum(['natural','ai','iatf'])}).nullable().default(null),stock:z.object({lot:z.uuid(),name:z.string(),number:z.string(),quantity:z.string(),unit:z.string()}).nullable().default(null),can_execute_documentary:z.boolean().default(false),id:z.uuid(),number:z.number().int().min(0).max(29),name:z.string(),day:z.number().int().min(0).max(365),due_date:z.iso.date(),executed_date:z.iso.date().nullable(),status:z.enum(['done','pending','overdue','cancelled']),assigned_to:z.string(),executed_by:z.string(),notes:z.string()}).refine(v=>(v.status==='done')===(v.executed_date!==null));
export const protocolRunDetailSchema=protocolRunSchema.safeExtend({timezone:z.string().min(1),steps:z.array(execution).min(1).max(30)}).refine(v=>v.steps.length===v.total&&v.steps.filter(s=>s.status==='done').length===v.completed&&v.steps.every((s,i)=>s.number===i)&&new Set(v.steps.map(s=>s.id)).size===v.steps.length);
export type Protocol=z.infer<typeof protocolSchema>;
export type ProtocolRun=z.infer<typeof protocolRunSchema>;
export type ProtocolRunDetail=z.infer<typeof protocolRunDetailSchema>;
const page=<T extends z.ZodType>(schema:T)=>z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(schema)});
export const protocolPageSchema=page(protocolSchema),protocolRunPageSchema=page(protocolRunSchema);
export function ensureProtocolScope(row:ProtocolRun,query:ProtocolQuery,id?:string){if(query.farm&&query.farm!==row.farm||id&&row.id!==id||!matchesProduction(row.animal.purpose,query.production))throw Error('protocol scope');return row;}
