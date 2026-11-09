import {z} from 'zod';
import {sanitaryInputSchema,sanitaryFormSchema,sanitaryPayload,type SanitaryOptions,type SanitaryDraftAnimal,sanitaryOptionsSchema,sanitaryDraftAnimalSchema} from './sanitaryContracts';
import {medicationInputSchema,medicationLotSchema,type MedicationLot} from '../clinic/medicationContracts';
export const collectiveMedicationFormSchema=sanitaryFormSchema.safeExtend({quantity:z.string()});
export type CollectiveMedicationForm=z.infer<typeof collectiveMedicationFormSchema>;
export const collectiveMedicationInputSchema=z.object({...sanitaryInputSchema.shape,treatment_type:z.literal('medication'),inventory_lot:z.uuid(),expected_unit:z.string().min(1).max(20),quantity:medicationInputSchema.shape.quantity}).refine(v=>new Set(v.entries.map(e=>e.animal)).size===v.entries.length&&[v.next_procedure_date,v.milk_withdrawal_until,v.meat_withdrawal_until].every(date=>!date||date>=v.date));
export type CollectiveMedicationInput=z.infer<typeof collectiveMedicationInputSchema>;
export function medicationTotal(quantity:string,count:number){if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(quantity)||!Number.isInteger(count)||count<1||count>1000)throw Error('total');const [whole,fraction='']=quantity.split('.'),total=(BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0')))*BigInt(count);if(total<=0n||total>9999999999n)throw Error('total limit');return `${total/100n}.${String(total%100n).padStart(2,'0')}`;}
export function collectiveMedicationPayload(values:CollectiveMedicationForm,selected:SanitaryDraftAnimal[],options:SanitaryOptions,lot:MedicationLot,editing=false){const base=sanitaryPayload(values,selected,options,editing),quantity=medicationInputSchema.shape.quantity.parse(values.quantity);medicationTotal(quantity,selected.length);return collectiveMedicationInputSchema.parse({...base,treatment_type:'medication',inventory_lot:lot.id,expected_unit:lot.unit,quantity});}

export const collectiveMedicationEditSchema=sanitaryOptionsSchema.extend({id:z.uuid(),version:z.iso.datetime({offset:true}),values:z.object({...collectiveMedicationFormSchema.shape,treatment_type:z.literal('medication')}).transform(value=>({...value,treatment_type:'other' as CollectiveMedicationForm['treatment_type']})).pipe(collectiveMedicationFormSchema),lot:medicationLotSchema,entries:z.array(sanitaryDraftAnimalSchema).min(1).max(1000)});
export type CollectiveMedicationEdit=z.infer<typeof collectiveMedicationEditSchema>;
export const collectiveMedicationEditInputSchema=collectiveMedicationInputSchema.safeExtend({expected_version:z.iso.datetime({offset:true})});
export type CollectiveMedicationEditInput=z.infer<typeof collectiveMedicationEditInputSchema>;
export {sanitaryCancelInputSchema as collectiveMedicationCancelInputSchema} from './sanitaryContracts';
export type {SanitaryCancelInput as CollectiveMedicationCancelInput} from './sanitaryContracts';
