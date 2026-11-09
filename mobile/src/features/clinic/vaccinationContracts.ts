import {z} from 'zod';

const decimal=z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/);
export function normalizedDecimal(value:string){const [whole='',fraction='']=value.replace(',','.').split('.');return `${whole.replace(/^0+(?=\d)/,'')}${fraction.replace(/0+$/,'')?'.'+fraction.replace(/0+$/,''):''}`;}
export const vaccinationQuerySchema=z.object({kind:z.enum(['animal','batch']),page:z.number().int().min(1).default(1),target:z.uuid().optional(),farm:z.uuid().optional(),species:z.string().max(30).optional(),search:z.string().trim().max(100).default('')});
export type VaccinationQuery=z.infer<typeof vaccinationQuerySchema>;
export const vaccinationTargetSchema=z.object({id:z.uuid(),kind:z.enum(['animal','batch']),label:z.string(),farm:z.uuid(),farm_name:z.string(),species:z.string(),head_count:z.number().int().positive()});
export type VaccinationTarget=z.infer<typeof vaccinationTargetSchema>;
export const vaccineSchema=z.object({id:z.uuid(),name:z.string(),unit:z.enum(['ml','l','dose','unidade']),volume_per_dose:z.string(),doses_per_package:z.number().int().nullable(),configured:z.boolean()});
export type Vaccine=z.infer<typeof vaccineSchema>;
const page=<T extends z.ZodType>(row:T)=>z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(row)});
export const vaccinationTargetPage=page(vaccinationTargetSchema),vaccinePage=page(vaccineSchema);
export const vaccinationOptionsSchema=z.object({today:z.iso.date(),timezone:z.string().min(1),dose_types:z.array(z.object({value:z.string(),label:z.string()})).min(1)});
export type VaccinationOptions=z.infer<typeof vaccinationOptionsSchema>;
export const vaccinationInputSchema=z.object({target_kind:z.enum(['animal','batch']),target:z.uuid(),expected_farm:z.uuid(),vaccine_item:z.uuid(),dosage_ml:z.string().regex(/^\d{1,4}(?:[.,]\d{1,2})?$/).refine(v=>Number(v.replace(',','.'))>0).transform(normalizedDecimal),application_date:z.iso.date(),next_dose_date:z.iso.date().nullable(),dose_type:z.enum(['unica','primeira','segunda','terceira','reforco']),applicator:z.string().trim().max(100),notes:z.string().trim().max(2000)}).refine(v=>!v.next_dose_date||v.next_dose_date>=v.application_date,{path:['next_dose_date'],message:'date'});
export type VaccinationInput=z.infer<typeof vaccinationInputSchema>;
export function vaccinationKey(value:VaccinationInput){return JSON.stringify(vaccinationInputSchema.parse(value));}
export const vaccinationReviewSchema=z.object({target:vaccinationTargetSchema,vaccine:vaccineSchema,dosage_ml:decimal,quantity_per_head:decimal,inventory_quantity:decimal,available:decimal,remaining:decimal,lots:z.array(z.object({id:z.uuid(),number:z.string(),quantity:decimal,expiry:z.iso.date().nullable()})).min(1),command:vaccinationInputSchema,preview_token:z.string().min(1).max(60000)});
export type VaccinationReview=z.infer<typeof vaccinationReviewSchema>;
export function validateVaccinationReview(review:VaccinationReview,input:VaccinationInput){const v=vaccinationInputSchema.parse(input);if(vaccinationKey(review.command)!==vaccinationKey(v)||review.target.id!==v.target||review.target.kind!==v.target_kind||review.target.farm!==v.expected_farm||review.vaccine.id!==v.vaccine_item||!review.vaccine.configured||normalizedDecimal(review.dosage_ml)!==v.dosage_ml)throw Error('vaccination review scope');return review;}
