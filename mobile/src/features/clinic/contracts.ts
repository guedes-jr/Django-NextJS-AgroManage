import {z} from 'zod';
import type {User} from '../auth/contracts';
import { isScoped, isVeterinaryOnly } from '../auth/contracts';
export function canReadClinic(user:User){return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only&&!isVeterinaryOnly(user.access)&&(!isScoped(user.access)||!!user.access.livestock_species?.length);}
export function canWriteClinic(user:User){return canReadClinic(user)&&!user.access.read_only;}
/** Exams/treatments and vaccinations. Consultations and sanitary alerts were removed with the web clinic. */
export const clinicKinds=['health','vaccinations'] as const;
export const clinicQuerySchema=z.object({kind:z.enum(clinicKinds),page:z.number().int().min(1).max(100000).default(1),farm:z.uuid().optional(),animal:z.uuid().optional(),batch:z.uuid().optional(),species:z.string().max(30).default(''),search:z.string().trim().max(100).default(''),start:z.union([z.literal(''),z.iso.date()]).default(''),end:z.union([z.literal(''),z.iso.date()]).default('')}).refine(v=>!v.batch||v.kind!=='health').refine(v=>!v.start&&!v.end||!!v.start&&!!v.end&&v.start<=v.end&&(Date.parse(v.end)-Date.parse(v.start))/86400000<=365);
export type ClinicQuery=z.infer<typeof clinicQuerySchema>;
export const clinicRecordSchema=z.object({id:z.uuid(),kind:z.enum(clinicKinds),title:z.string(),date:z.iso.date(),farm:z.uuid(),farm_name:z.string(),animal:z.uuid().nullable(),animal_identifier:z.string(),batch:z.uuid().nullable(),batch_code:z.string(),species:z.string(),subtype:z.string(),severity:z.string(),status:z.string(),preview:z.string()});
export const clinicDetailSchema=clinicRecordSchema.extend({notes:z.string(),extra_notes:z.string(),professional:z.string(),record_time:z.string().nullable(),disease:z.string(),next_dose_date:z.iso.date().nullable(),dosage_ml:z.string().nullable(),vaccine_batch:z.string(),affected_animals:z.number().int().nonnegative(),affected_batches:z.number().int().nonnegative(),application:z.object({management:z.uuid(),status:z.string(),product:z.string(),lot:z.string(),unit:z.string(),quantity:z.string(),milk_until:z.iso.date().nullable(),meat_until:z.iso.date().nullable()}).nullable().optional()});
const page=<T extends z.ZodType>(row:T)=>z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(row)});
export const clinicPageSchema=page(clinicRecordSchema);
export const clinicAnimalSchema=z.object({id:z.uuid(),identifier:z.string(),farm:z.uuid(),farm_name:z.string(),species:z.string()});
export const clinicAnimalPageSchema=page(clinicAnimalSchema);
const option=z.object({value:z.string().min(1).max(30),label:z.string()});
export const clinicOptionsSchema=z.object({today:z.iso.date(),timezone:z.string().min(1),species:z.array(option),record_types:z.array(option),severities:z.array(option),outcomes:z.array(option)});
export type ClinicAnimal=z.infer<typeof clinicAnimalSchema>;
export type ClinicRecord=z.infer<typeof clinicRecordSchema>;
export type ClinicOptions=z.infer<typeof clinicOptionsSchema>;
export function matchesClinic(row:ClinicRecord,query:ClinicQuery){return row.kind===query.kind&&(!query.farm||row.farm===query.farm)&&(!query.animal||row.animal===query.animal)&&(!query.batch||row.batch===query.batch)&&(!query.species||row.species===query.species);}
/** Web page of the species segment that keeps health and vaccination records. */
export function clinicWebPath(species:string){return species==='bovinos'?'/home/seguimento/gado-de-corte/sanidade':species==='suinos'?'/home/seguimento/suinos':'/home';}
