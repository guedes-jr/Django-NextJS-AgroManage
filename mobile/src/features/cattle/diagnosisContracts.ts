import {z} from 'zod';
import {matchesProduction,type Production} from './contracts';
export const diagnosisOptionsSchema=z.object({today:z.iso.date(),timezone:z.string().min(1),animal:z.object({id:z.uuid(),identifier:z.string(),farm:z.uuid(),farm_name:z.string(),cattle_purpose:z.string(),version:z.iso.datetime({offset:true})}),mating:z.object({id:z.uuid(),date:z.iso.date(),version:z.iso.datetime({offset:true}),expected_birth_date:z.iso.date().nullable()}),allowed_results:z.array(z.enum(['positive','negative'])).min(1)});
export type DiagnosisOptions=z.infer<typeof diagnosisOptionsSchema>;
export const diagnosisInputSchema=z.object({expected_farm:z.uuid(),expected_mating:z.uuid(),animal_version:z.iso.datetime({offset:true}),mating_version:z.iso.datetime({offset:true}),diagnosis_date:z.iso.date(),result:z.enum(['positive','negative'])});
export type DiagnosisInput=z.infer<typeof diagnosisInputSchema>;
export function ensureDiagnosisScope(options:DiagnosisOptions,id:string,production:Production,farm?:string){if(options.animal.id!==id||farm&&options.animal.farm!==farm||!matchesProduction(options.animal.cattle_purpose,production))throw Error('diagnosis scope');return options;}
export function matchesDiagnosis(options:DiagnosisOptions,input:DiagnosisInput){return options.animal.farm===input.expected_farm&&options.mating.id===input.expected_mating&&options.animal.version===input.animal_version&&options.mating.version===input.mating_version&&options.allowed_results.includes(input.result)&&options.mating.date<=input.diagnosis_date&&input.diagnosis_date<=options.today;}
