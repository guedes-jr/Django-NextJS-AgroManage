import {z} from 'zod';
import {matchesProduction,productionSchema} from './contracts';
import {weighingOptionsSchema,weighingAnimalSchema,canCreateWeighing} from './weighingContracts';
export const canCreateCastration=canCreateWeighing;
export const castrationOptionsSchema=weighingOptionsSchema;
export type CastrationOptions=z.infer<typeof castrationOptionsSchema>;
export const castrationAnimalSchema=weighingAnimalSchema.extend({gender:z.literal('M'),status:z.literal('active'),is_castrated:z.literal(false)});
export type CastrationAnimal=z.infer<typeof castrationAnimalSchema>;
export const castrationAnimalPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(castrationAnimalSchema)});
export const castrationFormSchema=z.object({date:z.iso.date(),description:z.string().trim().min(1).max(200),responsible:z.string().trim().max(100),notes:z.string()});
export type CastrationForm=z.infer<typeof castrationFormSchema>;
export const castrationInputSchema=castrationFormSchema.extend({farm:z.uuid(),production:productionSchema,entries:z.array(z.object({animal:z.uuid(),animal_version:z.iso.datetime({offset:true})})).min(1).max(1000)}).refine(value=>new Set(value.entries.map(row=>row.animal)).size===value.entries.length);
export type CastrationInput=z.infer<typeof castrationInputSchema>;
export function castrationPayload(values:CastrationForm,selected:CastrationDraftAnimal[],options:CastrationOptions,editing=false){const animals=z.array(castrationAnimalSchema).min(1).max(1000).parse(selected),form=castrationFormSchema.parse(values);if(form.date>options.today||!animals.some(row=>matchesProduction(row.cattle_purpose,options.production))||animals.some(row=>row.farm!==options.farm.id||!editing&&!matchesProduction(row.cattle_purpose,options.production)||row.entry_date&&form.date<row.entry_date))throw Error('castration scope');return castrationInputSchema.parse({...form,farm:options.farm.id,production:options.production,entries:animals.map(row=>({animal:row.id,animal_version:row.version}))});}

export const castrationDraftAnimalSchema=weighingAnimalSchema.extend({gender:z.string(),status:z.string(),is_castrated:z.boolean()});
export type CastrationDraftAnimal=z.infer<typeof castrationDraftAnimalSchema>;
export const castrationEditSchema=castrationOptionsSchema.extend({id:z.uuid(),version:z.iso.datetime({offset:true}),values:castrationFormSchema,entries:z.array(castrationDraftAnimalSchema).min(1).max(1000)});
export type CastrationEdit=z.infer<typeof castrationEditSchema>;
export const castrationEditInputSchema=castrationInputSchema.safeExtend({expected_version:z.iso.datetime({offset:true})});
export type CastrationEditInput=z.infer<typeof castrationEditInputSchema>;
export {weighingCancelInputSchema as castrationCancelInputSchema} from './weighingContracts';
export type {WeighingCancelInput as CastrationCancelInput} from './weighingContracts';
