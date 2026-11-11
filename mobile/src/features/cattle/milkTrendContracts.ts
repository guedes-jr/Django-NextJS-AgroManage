import {z} from 'zod';
const volume=z.string().regex(/^\d{1,20}\.\d{2}$/);
export const milkCents=(s:string)=>{if(!/^\d{1,20}\.\d{2}$/.test(s))throw Error('volume');return BigInt(s.replace('.',''));};
export const dropSchema=z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/).refine(v=>Number(v)>=1&&Number(v)<=100).transform(v=>Number(v).toFixed(2));
export const milkTrendQuerySchema=z.object({production:z.literal('dairy'),farm:z.uuid().optional(),animal:z.uuid().optional(),start:z.iso.date(),end:z.iso.date(),drop_percent:dropSchema}).refine(v=>v.start<=v.end&&(Date.parse(v.end)-Date.parse(v.start))/86400000<=366);
export type MilkTrendQuery=z.infer<typeof milkTrendQuerySchema>;
const farm=z.object({id:z.uuid(),name:z.string()});
export const milkTrendAnimalSchema=z.object({id:z.uuid(),identifier:z.string(),farm:z.uuid(),purpose:z.enum(['unknown','beef','dairy','dual'])});
export type MilkTrendAnimal=z.infer<typeof milkTrendAnimalSchema>;
export const milkTrendOptionsSchema=z.object({production:z.literal('dairy'),farm:farm.nullable(),today:z.iso.date(),timezone:z.string().min(1),start:z.iso.date(),end:z.iso.date(),drop_percent:dropSchema});
export type MilkTrendOptions=z.infer<typeof milkTrendOptionsSchema>;
const point=z.object({date:z.iso.date(),produced:volume,discarded:volume,usable:volume,milked_cows:z.number().int().nonnegative().nullable(),aggregate:z.boolean()}).refine(v=>[v.produced,v.discarded,v.usable].every(s=>/^\d{1,20}\.\d{2}$/.test(s))&&milkCents(v.produced)-milkCents(v.discarded)===milkCents(v.usable)&&(v.aggregate?v.milked_cows===null:v.milked_cows!==null));
export const milkTrendReportSchema=z.object({production:z.literal('dairy'),farm:farm.nullable(),animal:milkTrendAnimalSchema.nullable(),start:z.iso.date(),end:z.iso.date(),today:z.iso.date(),timezone:z.string().min(1),drop_threshold:dropSchema,scope:z.enum(['individual','farm']),produced:volume,discarded:volume,usable:volume,days_with_records:z.number().int().min(0).max(367),series:z.array(point).max(367),sessions:z.array(z.object({session:z.enum(['morning','afternoon','evening']),liters:volume,records:z.number().int().positive()})).max(3),drop_alert:z.object({date:z.iso.date(),previous_date:z.iso.date(),drop_percent:volume,threshold:dropSchema}).nullable()}).superRefine((v,ctx)=>{
 const valid=[v.produced,v.discarded,v.usable,...v.series.flatMap(p=>[p.produced,p.discarded,p.usable])].every(s=>/^\d{1,20}\.\d{2}$/.test(s));
 if(!valid)return;
 const sum=(field:'produced'|'discarded'|'usable')=>v.series.reduce((n,p)=>n+milkCents(p[field]),0n);
 if(v.start>v.end||v.end>v.today||v.days_with_records!==v.series.length||v.series.some((p,i)=>p.date<v.start||p.date>v.end||i>0&&p.date<=v.series[i-1]!.date)||(['produced','discarded','usable'] as const).some(key=>sum(key)!==milkCents(v[key]))||new Set(v.sessions.map(s=>s.session)).size!==v.sessions.length||(v.scope==='individual')!==(v.animal!==null)||v.scope==='individual'&&v.series.some(p=>p.aggregate))ctx.addIssue({code:'custom',message:'milk report totals or scope'});
 if(v.drop_alert){const a=v.drop_alert,previous=v.series.find(p=>p.date===a.previous_date),current=v.series.find(p=>p.date===a.date);if(!previous||!current||a.date>=v.today||(Date.parse(a.date)-Date.parse(a.previous_date))/86400000!==1||a.threshold!==v.drop_threshold||Number(a.drop_percent)<Number(a.threshold)||Number(a.drop_percent)>100)ctx.addIssue({code:'custom',message:'milk alert context'});}
});
export type MilkTrendReport=z.infer<typeof milkTrendReportSchema>;
export const milkTrendAnimalPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(milkTrendAnimalSchema)});
export function validateMilkTrendScope(r:MilkTrendReport,q:MilkTrendQuery){if((r.farm?.id??undefined)!==q.farm||(r.animal?.id??undefined)!==q.animal||q.farm&&r.animal&&r.animal.farm!==q.farm||r.start!==q.start||r.end!==q.end||r.drop_threshold!==dropSchema.parse(q.drop_percent))throw Error('milk trend scope');return r;}

export function formatMilkVolume(value:string,language:string){const n=milkCents(value),whole=n/100n,fraction=String(n%100n).padStart(2,'0'),decimal=new Intl.NumberFormat(language).formatToParts(1.1).find(p=>p.type==='decimal')?.value??'.';return `${new Intl.NumberFormat(language,{maximumFractionDigits:0}).format(whole)}${decimal}${fraction}`;}
