import {z} from 'zod';
import {matingAnimalSchema} from './matingContracts';
export {ensureMatingScope as ensureBirthScope} from './matingContracts';
const purpose=z.enum(['beef','dairy','dual']);
export const birthPregnancySchema=z.object({id:z.uuid(),start_date:z.iso.date(),expected_birth_date:z.iso.date(),version:z.iso.datetime({offset:true})});
export const birthOptionsSchema=z.object({animal:matingAnimalSchema,pregnancy:birthPregnancySchema,today:z.iso.date(),timezone:z.string().min(1),earliest_date:z.iso.date()});
export type BirthOptions=z.infer<typeof birthOptionsSchema>;
function normalizeWeight(value:string){const [whole='',fraction='']=value.replace(',','.').split('.');const trimmed=fraction.replace(/0+$/,'');return `${whole.replace(/^0+(?=\d)/,'')}${trimmed?'.'+trimmed:''}`;}
export const birthInputSchema=z.object({expected_farm:z.uuid(),animal_version:z.iso.datetime({offset:true}),expected_pregnancy:z.uuid(),pregnancy_version:z.iso.datetime({offset:true}),date:z.iso.date(),outcome:z.enum(['alive','stillborn']),calf_identifier:z.string().trim().max(50),calf_gender:z.enum(['M','F']).nullable(),calf_purpose:purpose.nullable(),weight_kg:z.string().trim().regex(/^\d{1,6}(?:[.,]\d{1,2})?$/).refine(v=>Number(v.replace(',','.'))>0).transform(normalizeWeight).nullable(),notes:z.string().trim().max(2000)}).refine(v=>v.outcome==='alive'?!!v.calf_identifier&&!!v.calf_gender&&!!v.calf_purpose:!v.calf_identifier&&!v.calf_gender&&!v.calf_purpose);
export type BirthInput=z.infer<typeof birthInputSchema>;
export const birthReviewSchema=z.object({animal:matingAnimalSchema,pregnancy:birthPregnancySchema,command:birthInputSchema,preview_token:z.string().min(1).max(60000)});
export type BirthReview=z.infer<typeof birthReviewSchema>;
export function birthKey(value:BirthInput){return JSON.stringify(birthInputSchema.parse(value));}
export function validateBirthReview(review:BirthReview,input:BirthInput){if(birthKey(review.command)!==birthKey(input)||review.animal.farm!==input.expected_farm||review.animal.version!==input.animal_version||review.pregnancy.id!==input.expected_pregnancy||review.pregnancy.version!==input.pregnancy_version)throw Error('birth review scope');return review;}
