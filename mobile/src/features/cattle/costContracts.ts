import {z} from 'zod';
import type {User} from '../auth/contracts';
import {productionSchema,canReadCattle} from './contracts';
export function canReadCattleCosts(user:User){return canReadCattle(user)&&user.access.can_view_financial&&['admin','manager'].includes(user.access.role);}
export const costSources=['feed','sanitary','health','vaccine','semen'] as const;
const money=z.string().regex(/^-?\d{1,20}\.\d{2}$/);
export const costCents=(s:string)=>{money.parse(s);return BigInt(s.replace('.',''));};
export const costQuerySchema=z.object({production:productionSchema,farm:z.uuid(),start:z.iso.date(),end:z.iso.date(),batch:z.uuid().optional(),tab:z.enum(['operations','expenses']),page:z.number().int().min(1).max(100000)}).refine(v=>v.start<=v.end&&(Date.parse(v.end)-Date.parse(v.start))/86400000<=366);
export type CostQuery=z.infer<typeof costQuerySchema>;
const farm=z.object({id:z.uuid(),name:z.string()}),batch=z.object({id:z.uuid(),identifier:z.string(),farm:z.uuid(),purpose:z.enum(['beef','dairy','dual'])});
export type CostBatch=z.infer<typeof batch>;
export const costOptionsSchema=z.object({farm,production:productionSchema,today:z.iso.date(),timezone:z.string().min(1),start:z.iso.date(),end:z.iso.date()});
export type CostOptions=z.infer<typeof costOptionsSchema>;
const totals=z.object({feed:money,sanitary:money,health:money,vaccine:money,semen:money}),missing=z.object({feed:z.number().int().nonnegative(),sanitary:z.number().int().nonnegative(),health:z.number().int().nonnegative(),vaccine:z.number().int().nonnegative(),semen:z.number().int().nonnegative()});
const common={id:z.string().min(1),date:z.iso.date(),description:z.string(),amount:money.nullable(),reference:z.string().nullable()};
export const operationCostSchema=z.object({...common,source:z.enum(costSources)});
export const expenseCostSchema=z.object({...common,id:z.uuid(),amount:money,status:z.enum(['pending','paid','overdue'])});
export const costReportSchema=z.object({farm,production:productionSchema,batch:batch.nullable(),start:z.iso.date(),end:z.iso.date(),today:z.iso.date(),timezone:z.string().min(1),currency:z.literal('BRL'),tab:z.enum(['operations','expenses']),page:z.number().int().positive(),page_size:z.literal(20),operational_total:money,expenses_by_due_date:money,missing_cost_count:z.number().int().nonnegative(),totals,missing_by_source:missing,operation_count:z.number().int().nonnegative().max(5000),expense_count:z.number().int().nonnegative().max(5000),count:z.number().int().nonnegative().max(5000),next:z.boolean(),previous:z.boolean(),results:z.array(z.union([operationCostSchema,expenseCostSchema])).max(20)}).superRefine((v,ctx)=>{
 const amounts=[v.operational_total,v.expenses_by_due_date,...Object.values(v.totals)];if(!amounts.every(s=>money.safeParse(s).success))return;
 const count=v.tab==='operations'?v.operation_count:v.expense_count,expected=Math.min(20,Math.max(0,count-(v.page-1)*20));
 if(v.start>v.end||v.end>v.today||v.count!==count||v.results.length!==expected||v.previous!==(v.page>1)||v.next!==(v.page*20<count)||new Set(v.results.map(r=>r.id)).size!==v.results.length||costSources.reduce((sum,key)=>sum+costCents(v.totals[key]),0n)!==costCents(v.operational_total)||costSources.reduce((sum,key)=>sum+v.missing_by_source[key],0)!==v.missing_cost_count||v.missing_cost_count>v.operation_count||v.results.some(r=>r.date<v.start||r.date>v.end||!(v.tab==='operations'?operationCostSchema:expenseCostSchema).safeParse(r).success))ctx.addIssue({code:'custom',message:'cost report counts or amounts'});
});
export type CostReport=z.infer<typeof costReportSchema>;
export const costBatchPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(batch)});
export function validateCostScope(r:CostReport,q:CostQuery){if(r.farm.id!==q.farm||r.production!==q.production||(r.batch?.id??undefined)!==q.batch||r.batch&&(r.batch.farm!==q.farm||![q.production,'dual'].includes(r.batch.purpose))||r.start!==q.start||r.end!==q.end||r.tab!==q.tab||r.page!==q.page)throw Error('cost report scope');return r;}
export function formatCost(value:string,language:string){const n=costCents(value),abs=n<0n?-n:n,decimal=new Intl.NumberFormat(language).formatToParts(1.1).find(p=>p.type==='decimal')?.value??'.';return `${n<0n?'-':''}R$ ${new Intl.NumberFormat(language,{maximumFractionDigits:0}).format(abs/100n)}${decimal}${String(abs%100n).padStart(2,'0')}`;}
