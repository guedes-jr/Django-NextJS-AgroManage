import {z} from 'zod';
export {canEnterPasture as canManagePasture} from './grazingEntryContracts';
const decimal=(integers:number)=>z.string().trim().regex(new RegExp(`^\\d{1,${integers}}(?:[.,]\\d{1,2})?$`)).refine(value=>Number(value.replace(',','.'))>0);
export const pastureFormSchema=z.object({name:z.string().trim().min(1).max(100),area_ha:decimal(8),max_stocking_ua_ha:z.union([z.literal(''),decimal(6)]),availability:z.enum(['unknown','available','resting','blocked']),availability_reason:z.string().trim().max(255),notes:z.string()}).refine(value=>!['resting','blocked'].includes(value.availability)||!!value.availability_reason);
export type PastureForm=z.infer<typeof pastureFormSchema>;
export const pastureFormOptionsSchema=z.object({farm:z.object({id:z.uuid(),name:z.string()})});
export const pastureFormRecordSchema=z.object({id:z.uuid(),farm:z.uuid(),farm_name:z.string(),version:z.iso.datetime({offset:true}),name:z.string().min(1).max(100),area_ha:z.string(),max_stocking_ua_ha:z.string().nullable(),availability:z.enum(['unknown','available','resting','blocked']),availability_reason:z.string(),notes:z.string()});
export type PastureFormRecord=z.infer<typeof pastureFormRecordSchema>;
export const pastureCommandSchema=z.discriminatedUnion('mode',[z.object({mode:z.literal('create'),farm:z.uuid(),values:pastureFormSchema}),z.object({mode:z.literal('edit'),farm:z.uuid(),id:z.uuid(),version:z.iso.datetime({offset:true}),values:pastureFormSchema})]);
export type PastureCommand=z.infer<typeof pastureCommandSchema>;
export function pasturePayload(command:PastureCommand){const c=pastureCommandSchema.parse(command);return {...c.values,farm:c.farm,area_ha:c.values.area_ha.replace(',','.'),max_stocking_ua_ha:c.values.max_stocking_ua_ha?c.values.max_stocking_ua_ha.replace(',','.'):null,...(c.mode==='edit'?{expected_version:c.version}:{})};}
