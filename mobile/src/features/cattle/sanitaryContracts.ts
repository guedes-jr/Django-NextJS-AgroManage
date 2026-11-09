import {z} from 'zod';
import {productionSchema,matchesProduction} from './contracts';
import {weighingOptionsSchema,weighingAnimalSchema,canCreateWeighing} from './weighingContracts';
export const canCreateSanitary=canCreateWeighing;
export const sanitaryOptionsSchema=weighingOptionsSchema;
export type SanitaryOptions=z.infer<typeof sanitaryOptionsSchema>;
export const sanitaryAnimalSchema=weighingAnimalSchema.extend({status:z.literal('active')});
export type SanitaryAnimal=z.infer<typeof sanitaryAnimalSchema>;
export const sanitaryAnimalPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(sanitaryAnimalSchema)});
const optionalDate=z.union([z.literal(''),z.iso.date()]);
export const sanitaryTreatments=['exam','surgery','other'] as const;
export const sanitaryFormSchema=z.object({date:z.iso.date(),description:z.string().trim().min(1).max(200),responsible:z.string().trim().max(100),notes:z.string().max(2000),treatment_type:z.enum(sanitaryTreatments),next_procedure_date:optionalDate,milk_withdrawal_until:optionalDate,meat_withdrawal_until:optionalDate}).refine(v=>[v.next_procedure_date,v.milk_withdrawal_until,v.meat_withdrawal_until].every(date=>!date||date>=v.date));
export type SanitaryForm=z.infer<typeof sanitaryFormSchema>;
export const sanitaryInputSchema=z.object({farm:z.uuid(),production:productionSchema,date:z.iso.date(),description:z.string().trim().min(1).max(200),responsible:z.string().trim().max(100),notes:z.string().max(2000),treatment_type:z.enum(sanitaryTreatments),next_procedure_date:z.iso.date().nullable(),milk_withdrawal_until:z.iso.date().nullable(),meat_withdrawal_until:z.iso.date().nullable(),entries:z.array(z.object({animal:z.uuid(),animal_version:z.iso.datetime({offset:true})})).min(1).max(1000)}).refine(v=>new Set(v.entries.map(e=>e.animal)).size===v.entries.length&&[v.next_procedure_date,v.milk_withdrawal_until,v.meat_withdrawal_until].every(date=>!date||date>=v.date));
export type SanitaryInput=z.infer<typeof sanitaryInputSchema>;
export function sanitaryPayload(values:SanitaryForm,selected:SanitaryDraftAnimal[],options:SanitaryOptions,editing=false){const form=sanitaryFormSchema.parse(values),animals=z.array(sanitaryAnimalSchema).min(1).max(1000).parse(selected);if(form.date>options.today||!animals.some(row=>matchesProduction(row.cattle_purpose,options.production))||animals.some(row=>row.farm!==options.farm.id||!editing&&!matchesProduction(row.cattle_purpose,options.production)||row.entry_date&&form.date<row.entry_date))throw Error('sanitary scope');return sanitaryInputSchema.parse({...form,farm:options.farm.id,production:options.production,next_procedure_date:form.next_procedure_date||null,milk_withdrawal_until:form.milk_withdrawal_until||null,meat_withdrawal_until:form.meat_withdrawal_until||null,entries:animals.map(row=>({animal:row.id,animal_version:row.version}))});}

export const sanitaryDraftAnimalSchema=weighingAnimalSchema.extend({status:z.string()});
export type SanitaryDraftAnimal=z.infer<typeof sanitaryDraftAnimalSchema>;
export const sanitaryEditSchema=sanitaryOptionsSchema.extend({id:z.uuid(),version:z.iso.datetime({offset:true}),values:sanitaryFormSchema,entries:z.array(sanitaryDraftAnimalSchema).min(1).max(1000)});
export type SanitaryEdit=z.infer<typeof sanitaryEditSchema>;
export const sanitaryEditInputSchema=sanitaryInputSchema.safeExtend({expected_version:z.iso.datetime({offset:true})});
export type SanitaryEditInput=z.infer<typeof sanitaryEditInputSchema>;
export {weighingCancelInputSchema as sanitaryCancelInputSchema} from './weighingContracts';
export type {WeighingCancelInput as SanitaryCancelInput} from './weighingContracts';
