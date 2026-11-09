import {z} from 'zod';
import type {User} from '../auth/contracts';
import {productionSchema,matchesProduction,type Production} from '../cattle/contracts';
export function canReadDailyFeeding(user:User){return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only&&(!['operator','feeder'].includes(user.access.role)||!!user.access.livestock_species?.includes('bovinos'));}
export function canWriteDailyFeeding(user:User){return canReadDailyFeeding(user)&&!user.access.read_only&&['admin','manager','feeder'].includes(user.access.role);}
const decimal=z.string().regex(/^\d+(\.\d{1,2})?$/);
export const feedingBatchSchema=z.object({id:z.uuid(),batch_code:z.string(),name:z.string(),farm:z.uuid(),farm_name:z.string(),production:z.string(),head_count:z.number().int().positive(),supplied_kg:decimal});
export const feedingProductSchema=z.object({id:z.uuid(),name:z.string(),unit:z.literal('kg')});
export const feedingFormulaSchema=z.object({id:z.uuid(),name:z.string(),item:z.uuid(),item_name:z.string()});
export const deliverySchema=z.object({id:z.uuid(),batch:z.uuid(),quantity_kg:decimal,item:z.uuid(),item_name:z.string(),recorded_by:z.string(),created_at:z.iso.datetime({offset:true}),notes:z.string()});
const page=<T extends z.ZodType>(row:T)=>z.object({date:z.iso.date(),timezone:z.string().min(1),count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(row)});
export const feedingBatchPage=page(feedingBatchSchema),feedingProductPage=page(feedingProductSchema),feedingFormulaPage=page(feedingFormulaSchema),deliveryPage=page(deliverySchema);
export const feedingQuerySchema=z.object({production:productionSchema,resource:z.enum(['batches','products','formulas','deliveries']).default('batches'),farm:z.uuid().optional(),batch:z.uuid().optional(),page:z.number().int().min(1).max(100000).default(1),search:z.string().trim().max(100).default('')}).refine(v=>v.resource!=='deliveries'||!!v.batch);
export type FeedingQuery=z.infer<typeof feedingQuerySchema>;
export type FeedingBatch=z.infer<typeof feedingBatchSchema>;
export type FeedingProduct=z.infer<typeof feedingProductSchema>;
export type FeedingFormula=z.infer<typeof feedingFormulaSchema>;
export const feedingDraftSchema=z.object({quantity_kg:z.string().trim().regex(/^\d{1,8}([.,]\d{1,2})?$/).refine(v=>Number(v.replace(',','.'))>0),notes:z.string().trim().max(1000)});
export type FeedingDraft=z.infer<typeof feedingDraftSchema>;
export const feedingCommandSchema=z.object({production:productionSchema,farm:z.uuid(),batch:z.uuid(),item:z.uuid(),formula:z.uuid().nullable(),date:z.iso.date(),quantity_kg:decimal.refine(v=>Number(v)>0&&Number(v)<=99999999.99),notes:z.string().trim().max(1000),request_key:z.uuid()});
export type FeedingCommand=z.infer<typeof feedingCommandSchema>;
export function feedingCommand(batch:FeedingBatch,production:Production,day:string,draft:FeedingDraft,selection:FeedingProduct|FeedingFormula,key:string):FeedingCommand{
 if(!matchesProduction(batch.production,production))throw Error('scope');const v=feedingDraftSchema.parse(draft);
 return feedingCommandSchema.parse({production,farm:batch.farm,batch:batch.id,item:'item' in selection?selection.item:selection.id,formula:'item' in selection?selection.id:null,date:day,quantity_kg:Number(v.quantity_kg.replace(',','.')).toFixed(2),notes:v.notes,request_key:key});
}
export function feedingPayload(command:FeedingCommand){const v=feedingCommandSchema.parse(command);return {production:v.production,farm:v.farm,batch:v.batch,item:v.item,formula:v.formula,date:v.date,quantity_kg:v.quantity_kg,notes:v.notes,request_key:v.request_key};}
export const feedingReceiptSchema=z.object({id:z.uuid(),date:z.iso.date(),quantity_kg:z.union([decimal,z.number().finite().positive()]).transform(v=>Number(v).toFixed(2))});
