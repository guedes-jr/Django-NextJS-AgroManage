import { z } from 'zod';
const volume=z.union([z.string().regex(/^\d+(\.\d+)?$/),z.number().finite().nonnegative()]).transform(String);
export const milkSummarySchema=z.object({produced_liters:volume,discarded_liters:volume,usable_liters:volume,milked_cows:z.number().int().nonnegative().nullable(),expected_cows:z.number().int().nonnegative(),pending_cows:z.number().int().nonnegative().nullable(),average_per_milked_cow:volume.nullable(),aggregate_mode:z.boolean()});
export const milkCowSchema=z.object({id:z.uuid(),identifier:z.string(),name:z.string(),farm:z.uuid(),farm_name:z.string(),is_lactating:z.boolean(),liters:volume.nullable(),entry_status:z.enum(['pending','recorded','total'])});
export const milkRecordSchema=z.object({id:z.uuid(),animal:z.uuid(),identifier:z.string(),farm_name:z.string(),date:z.iso.date(),session:z.enum(['morning','afternoon','evening']),liters:volume,discarded_liters:volume,discard_reason:z.string(),notes:z.string()});
export const milkTotalSchema=z.object({id:z.uuid(),farm:z.uuid(),farm_name:z.string(),date:z.iso.date(),liters:volume,discarded_liters:volume,discard_reason:z.string(),notes:z.string()});
const page=<T extends z.ZodType>(row:T)=>z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(row)});
export const milkCowPageSchema=page(milkCowSchema),milkRecordPageSchema=page(milkRecordSchema),milkTotalPageSchema=page(milkTotalSchema);
export type MilkCow=z.infer<typeof milkCowSchema>;export type MilkRecord=z.infer<typeof milkRecordSchema>;export type MilkTotal=z.infer<typeof milkTotalSchema>;
export const milkKinds=['cows','records','totals'] as const;
export const milkQuerySchema=z.object({kind:z.enum(milkKinds),date:z.iso.date(),farm:z.uuid().optional(),page:z.number().int().min(1).max(100000),search:z.string().trim().max(100).default('')});
export type MilkQuery=z.infer<typeof milkQuerySchema>;
export const milkCommandSchema=z.discriminatedUnion('mode',[
 z.object({mode:z.literal('individual'),date:z.iso.date(),farm:z.uuid(),animal:z.uuid(),session:z.enum(['morning','afternoon','evening']),id:z.uuid().optional()}),
 z.object({mode:z.literal('total'),date:z.iso.date(),farm:z.uuid(),id:z.uuid().optional()}),
]);
export type MilkCommand=z.infer<typeof milkCommandSchema>;
const units=(value:string)=>{const [whole='',fraction='']=value.replace(',','.').split('.');return Number(whole+fraction.padEnd(2,'0'));};
export function milkValuesSchema(mode:MilkCommand['mode']){
 const decimal=z.string().trim().regex(new RegExp(`^\\d{1,${mode==='total'?9:7}}([.,]\\d{1,2})?$`));
 return z.object({liters:decimal,discarded_liters:decimal,discard_reason:z.string(),notes:z.string()}).superRefine((v,c)=>{
  if(!/[1-9]/.test(v.liters))c.addIssue({code:'custom',path:['liters'],message:'positive'});
  if(units(v.discarded_liters)>units(v.liters))c.addIssue({code:'custom',path:['discarded_liters'],message:'discard'});
  if(units(v.discarded_liters)>0&&!v.discard_reason.trim())c.addIssue({code:'custom',path:['discard_reason'],message:'reason'});
 });
}
export type MilkValues=z.infer<ReturnType<typeof milkValuesSchema>>;
export function milkPayload(values:MilkValues){return {liters:values.liters.replace(',','.'),discarded_liters:values.discarded_liters.replace(',','.'),discard_reason:values.discard_reason.trim(),notes:values.notes};}
