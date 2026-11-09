import {z} from 'zod';
import {matchesProduction,type Production} from './contracts';
export const matingTypes=['natural','ai','iatf'] as const;
export const matingAnimalSchema=z.object({id:z.uuid(),identifier:z.string(),farm:z.uuid(),farm_name:z.string(),version:z.iso.datetime({offset:true}),cattle_purpose:z.string()});
export type MatingAnimal=z.infer<typeof matingAnimalSchema>;
export const matingOptionsSchema=z.object({animal:matingAnimalSchema,today:z.iso.date(),timezone:z.string().min(1),earliest_date:z.iso.date().nullable(),types:z.array(z.enum(matingTypes)).min(1)});
export type MatingOptions=z.infer<typeof matingOptionsSchema>;
export const matingSiresSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(matingAnimalSchema)});
export const matingInputSchema=z.object({expected_farm:z.uuid(),animal_version:z.iso.datetime({offset:true}),mating_date:z.iso.date(),mating_type:z.enum(matingTypes),sire:z.uuid().nullable(),expected_sire_farm:z.uuid().nullable(),sire_version:z.iso.datetime({offset:true}).nullable(),sire_info:z.string().trim().max(100),expected_diagnosis_date:z.iso.date().nullable(),notes:z.string().trim().max(2000)}).refine(v=>v.mating_type==='natural'?!!v.sire&&!!v.expected_sire_farm&&!!v.sire_version&&!v.sire_info:!!v.sire_info&&!v.sire&&!v.expected_sire_farm&&!v.sire_version).refine(v=>!v.expected_diagnosis_date||v.expected_diagnosis_date>=v.mating_date);
export type MatingInput=z.infer<typeof matingInputSchema>;
export const matingReviewSchema=z.object({animal:matingAnimalSchema,sire:matingAnimalSchema.nullable(),expected_birth_date:z.iso.date(),mating_date:z.iso.date(),mating_type:z.enum(matingTypes),command:matingInputSchema,preview_token:z.string().min(1).max(60000)});
export type MatingReview=z.infer<typeof matingReviewSchema>;
export function matingKey(value:MatingInput){return JSON.stringify(matingInputSchema.parse(value));}
export function ensureMatingScope<T extends {animal:MatingAnimal}>(value:T,id:string,production:Production,farm?:string){if(value.animal.id!==id||farm&&value.animal.farm!==farm||!matchesProduction(value.animal.cattle_purpose,production))throw Error('mating scope');return value;}
export function validateMatingReview(review:MatingReview,input:MatingInput){if(matingKey(review.command)!==matingKey(input)||review.animal.farm!==input.expected_farm||review.animal.version!==input.animal_version||review.mating_date!==input.mating_date||review.mating_type!==input.mating_type||input.sire&&(review.sire?.id!==input.sire||review.sire?.farm!==input.expected_sire_farm||review.sire?.version!==input.sire_version)||!input.sire&&review.sire!==null)throw Error('mating review scope');return review;}
