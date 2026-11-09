import { z } from 'zod';
import type { User } from '../auth/contracts';
export const productionSchema=z.enum(['beef','dairy']);
export type Production=z.infer<typeof productionSchema>;
export const cattleKinds=['animals','batches'] as const;
export type CattleKind=typeof cattleKinds[number];
export const cattleQuerySchema=z.object({production:productionSchema,kind:z.enum(cattleKinds),farm:z.uuid().optional(),batch:z.uuid().optional(),search:z.string().trim().max(100).default(''),status:z.enum(['all','active','sold','dead','finished']).default('active'),page:z.number().int().min(1).max(100000).default(1)});
export type CattleQuery=z.infer<typeof cattleQuerySchema>;
const decimal=z.string().regex(/^\d+(\.\d+)?$/);
export const animalSchema=z.object({id:z.uuid(),identifier:z.string(),name:z.string().optional(),farm:z.uuid(),farm_name:z.string(),cattle_purpose:z.string(),gender:z.string(),category:z.string(),status:z.string(),breed_name:z.string().optional(),batch:z.uuid().nullable().optional(),batch_code:z.string().optional(),birth_date:z.iso.date().nullable(),entry_date:z.iso.date().nullable(),current_weight_kg:decimal.nullable(),reproductive_status:z.string(),is_lactating:z.boolean(),milk_withdrawal_until:z.iso.date().nullable(),meat_withdrawal_until:z.iso.date().nullable(),notes:z.string()});
export const batchSchema=z.object({id:z.uuid(),batch_code:z.string(),name:z.string().nullable().transform(v=>v??''),farm_id:z.uuid(),farm_name:z.string(),cattle_purpose:z.string(),category:z.string(),status:z.string(),phase:z.string(),quantity:z.number().int().nonnegative(),gender:z.string(),entry_date:z.iso.date().nullable(),birth_date:z.iso.date().nullable(),avg_weight_kg:decimal.nullable(),notes:z.string()});
export const historySchema=z.object({type:z.string(),date:z.iso.date().nullable(),title:z.string(),subtitle:z.string()});
export type CattleAnimal=z.infer<typeof animalSchema>;
export type CattleBatch=z.infer<typeof batchSchema>;
export const animalPageSchema=z.object({count:z.number().int().nonnegative(),results:z.array(animalSchema),next:z.string().nullable(),previous:z.string().nullable()});
export const batchPageSchema=z.object({count:z.number().int().nonnegative(),results:z.array(batchSchema),next:z.string().nullable(),previous:z.string().nullable()});
export const historyPageSchema=z.object({count:z.number().int().nonnegative(),results:z.array(historySchema),next:z.string().nullable(),previous:z.string().nullable()});
export function canReadCattle(user:User){return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only&&user.access.role!=='feeder'&&(user.access.role!=='operator'||!!user.access.livestock_species?.includes('bovinos'));}
export function matchesProduction(actual:string,selected:Production){return actual===selected||actual==='dual';}

export function ensureCattleScope<T extends CattleAnimal|CattleBatch>(record:T,production:Production,farm?:string):T {
  if(!matchesProduction(record.cattle_purpose,production)||(farm&&('farm' in record?record.farm:record.farm_id)!==farm))throw new Error('invalid cattle scope');
  return record;
}

export const cattleCategories=['Bezerro','Garrote','Novilha','Touro','Matriz','Vaca','Terminação','Reprodutor'] as const;
const optionalDate=z.union([z.literal(''),z.iso.date()]);
const positiveWeight=(scale:number,integers:number)=>z.string().trim().regex(new RegExp(`^\\d{1,${integers}}([.,]\\d{1,${scale}})?$`)).refine(value=>/[1-9]/.test(value));
const animalInput=z.object({identifier:z.string().trim().min(1).max(50),name:z.string().trim().max(100),gender:z.enum(['F','M']),category:z.enum(cattleCategories),birth_date:optionalDate,entry_date:z.iso.date(),notes:z.string(),breed_name_input:z.string().trim().max(100),initial_weight_kg:z.union([z.literal(''),positiveWeight(2,6)])});
export type AnimalInput=z.infer<typeof animalInput>;
export function animalInputSchema(today:string){return animalInput.superRefine((value,ctx)=>{
  if(value.entry_date>today||(value.birth_date&&value.birth_date>today))ctx.addIssue({code:'custom',path:['entry_date'],message:'date'});
  if(value.birth_date&&value.birth_date>value.entry_date)ctx.addIssue({code:'custom',path:['birth_date'],message:'chronology'});
  if((['Vaca','Matriz','Novilha'].includes(value.category)&&value.gender!=='F')||(['Touro','Reprodutor'].includes(value.category)&&value.gender!=='M'))ctx.addIssue({code:'custom',path:['category'],message:'gender'});
});}
export const editableAnimalKeys=['identifier','name','gender','category','birth_date','entry_date','notes'] as const;
export function animalPayload(values:AnimalInput,creation?:{farm:string;production:Production}){
  const base={identifier:values.identifier,name:values.name,gender:values.gender,category:values.category,birth_date:values.birth_date||null,entry_date:values.entry_date,notes:values.notes};
  return creation?{...base,farm_id:z.uuid().parse(creation.farm),cattle_purpose:productionSchema.parse(creation.production),species_code_input:'bovinos',...(values.breed_name_input?{breed_name_input:values.breed_name_input}:{}),...(values.initial_weight_kg?{initial_weight_kg:values.initial_weight_kg.replace(',','.')}:{} )}:base;
}
export const weightInput=z.object({weight_kg:positiveWeight(2,6),weighing_date:z.iso.date(),notes:z.string()});
export type WeightInput=z.infer<typeof weightInput>;
export function weightInputSchema(today:string,entry?:string|null){return weightInput.refine(value=>value.weighing_date<=today&&(!entry||value.weighing_date>=entry),{path:['weighing_date'],message:'date'});}
export function canCreateCattle(user:User){return canReadCattle(user)&&!user.access.read_only;}
export function canEditCattle(user:User,record:CattleAnimal){return canCreateCattle(user)&&['admin','manager'].includes(user.access.role)&&record.status==='active';}
export function canWeighCattle(user:User,record:CattleAnimal|CattleBatch){return canCreateCattle(user)&&record.status==='active';}
