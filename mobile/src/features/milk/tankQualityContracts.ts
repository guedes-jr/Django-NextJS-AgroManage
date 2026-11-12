import {z} from 'zod';
export const tankQualityQuerySchema=z.object({tank:z.uuid(),farm:z.uuid(),date:z.union([z.literal(''),z.iso.date()]),page:z.number().int().min(1).max(100000)});
export type TankQualityQuery=z.infer<typeof tankQualityQuerySchema>;
const decimal=(min:number,max:number)=>z.string().regex(/^-?\d{1,3}\.\d{2}$/).refine(v=>Number(v)>=min&&Number(v)<=max).nullable();
export const tankQualitySchema=z.object({id:z.uuid(),farm:z.uuid(),tank:z.uuid(),tank_name:z.string(),farm_name:z.string(),date:z.iso.date(),sample:z.string(),temperature_c:decimal(-273.15,999.99),fat_percent:decimal(0,100),protein_percent:decimal(0,100),scc:z.number().int().min(0).max(2147483647).nullable(),tbc:z.number().int().min(0).max(2147483647).nullable(),antibiotics:z.enum(['not_tested','negative','positive']),notes:z.string(),recorded_by:z.string()});
export type TankQuality=z.infer<typeof tankQualitySchema>;
export const tankQualityPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(tankQualitySchema).max(20)}).refine(v=>v.results.length<=v.count&&new Set(v.results.map(r=>r.id)).size===v.results.length);
export function ensureTankQualityScope(row:TankQuality,query:Pick<TankQualityQuery,'tank'|'farm'>,id?:string){if(row.tank!==query.tank||row.farm!==query.farm||id&&row.id!==id)throw Error('tank quality scope');return row;}
