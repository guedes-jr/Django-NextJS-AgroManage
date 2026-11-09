import {z} from 'zod';
import {productionSchema,matchesProduction} from './contracts';
export const operationTabs=['occurrences','purpose-history','transfers'] as const;
export const operationQuerySchema=z.object({production:productionSchema,tab:z.enum(operationTabs),farm:z.uuid().optional(),search:z.string().trim().max(100),status:z.enum(['all','open','done']),page:z.number().int().min(1).max(100000)});
export type CattleOperationQuery=z.infer<typeof operationQuerySchema>;
const purpose=z.enum(['unknown','beef','dairy','dual']);
const target=z.object({id:z.uuid(),kind:z.enum(['animals','batches']),identifier:z.string(),purpose});
const base=z.object({id:z.uuid(),farm:z.uuid(),farm_name:z.string(),date:z.iso.date(),author:z.string(),timezone:z.string().min(1)});
export const operationSchema=z.discriminatedUnion('tab',[
 base.extend({tab:z.literal('occurrences'),can_resolve:z.boolean().default(false),target:target.nullable(),kind:z.enum(['animal','water','fence','pasture','other']),description:z.string(),due_date:z.iso.date().nullable(),assigned_to:z.string(),status:z.enum(['open','in_progress','done','cancelled']),resolution:z.string(),resolved_at:z.iso.datetime({offset:true}).nullable()}),
 base.extend({tab:z.literal('purpose-history'),target,previous:purpose,purpose}),
 base.extend({tab:z.literal('transfers'),source:target.extend({kind:z.literal('batches')}),destination:target.extend({kind:z.literal('batches')}),quantity:z.number().int().positive(),reason:z.string()})
]);
export type CattleOperation=z.infer<typeof operationSchema>;
export const operationPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(operationSchema)});
export function ensureOperationScope(row:CattleOperation,query:CattleOperationQuery,id?:string){if(row.tab!==query.tab||query.farm&&row.farm!==query.farm||id&&row.id!==id)throw Error('operation scope');const matches=(value:string)=>matchesProduction(value,query.production);if(row.tab==='purpose-history'&&!matches(row.previous)&&!matches(row.purpose)||row.tab==='transfers'&&!matches(row.source.purpose)&&!matches(row.destination.purpose)||row.tab==='occurrences'&&row.target&&!matches(row.target.purpose)||row.tab==='occurrences'&&query.status!=='all'&&(row.resolved_at===null)!==(query.status==='open'))throw Error('operation segment');return row;}
