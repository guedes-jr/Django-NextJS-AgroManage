import {z} from 'zod';
import type {User} from '../auth/contracts';
import {canReadManagements} from './managementContracts';
import {productionSchema,matchesProduction} from './contracts';
export function canCreateWeighing(user:User){return canReadManagements(user)&&!user.access.read_only;}
const weight=z.string().trim().regex(/^\d{1,6}(?:[.,]\d{1,2})?$/).refine(v=>Number(v.replace(',','.'))>0);
export const weighingOptionsSchema=z.object({farm:z.object({id:z.uuid(),name:z.string()}),production:productionSchema,today:z.iso.date(),timezone:z.string().min(1),max_participants:z.literal(1000)});
export type WeighingOptions=z.infer<typeof weighingOptionsSchema>;
export const weighingAnimalSchema=z.object({id:z.uuid(),identifier:z.string(),farm:z.uuid(),cattle_purpose:z.string(),status:z.string().optional(),entry_date:z.iso.date().nullable(),version:z.iso.datetime({offset:true})});
export type WeighingAnimal=z.infer<typeof weighingAnimalSchema>;
export const weighingAnimalPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(weighingAnimalSchema)});
export const weighingFormSchema=z.object({date:z.iso.date(),description:z.string().trim().min(1).max(200),responsible:z.string().trim().max(100),notes:z.string(),entries:z.array(z.object({animal:weighingAnimalSchema,weight_kg:weight})).min(1).max(1000)}).refine(value=>new Set(value.entries.map(row=>row.animal.id)).size===value.entries.length);
export type WeighingForm=z.infer<typeof weighingFormSchema>;
export const weighingInputSchema=z.object({farm:z.uuid(),production:productionSchema,date:z.iso.date(),description:z.string().trim().min(1).max(200),responsible:z.string().trim().max(100),notes:z.string(),entries:z.array(z.object({animal:z.uuid(),animal_version:z.iso.datetime({offset:true}),weight_kg:weight.transform(value=>value.replace(',','.'))})).min(1).max(1000)}).refine(value=>new Set(value.entries.map(row=>row.animal)).size===value.entries.length);
export type WeighingInput=z.infer<typeof weighingInputSchema>;
export function weighingPayload(values:WeighingForm,options:WeighingOptions,editing=false){const parsed=weighingFormSchema.parse(values);if(parsed.date>options.today||!parsed.entries.some(row=>matchesProduction(row.animal.cattle_purpose,options.production))||parsed.entries.some(row=>row.animal.farm!==options.farm.id||!editing&&!matchesProduction(row.animal.cattle_purpose,options.production)||row.animal.status!==undefined&&row.animal.status!=='active'||row.animal.entry_date&&parsed.date<row.animal.entry_date))throw Error('weighing context');return weighingInputSchema.parse({...parsed,farm:options.farm.id,production:options.production,entries:parsed.entries.map(row=>({animal:row.animal.id,animal_version:row.animal.version,weight_kg:row.weight_kg}))});}

export const weighingEditSchema=weighingOptionsSchema.extend({id:z.uuid(),version:z.iso.datetime({offset:true}),values:z.object({date:z.iso.date(),description:z.string(),responsible:z.string(),notes:z.string(),entries:z.array(z.object({animal:weighingAnimalSchema,weight_kg:z.string()})).min(1).max(1000)})});
export type WeighingEdit=z.infer<typeof weighingEditSchema>;
export const weighingEditInputSchema=weighingInputSchema.safeExtend({expected_version:z.iso.datetime({offset:true})});
export type WeighingEditInput=z.infer<typeof weighingEditInputSchema>;
export const weighingCancelInputSchema=z.object({farm:z.uuid(),production:productionSchema,expected_version:z.iso.datetime({offset:true}),reason:z.string().trim().min(1).max(300)});
export type WeighingCancelInput=z.infer<typeof weighingCancelInputSchema>;
