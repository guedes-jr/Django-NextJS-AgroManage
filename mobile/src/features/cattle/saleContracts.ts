import {z} from 'zod';
import type {User} from '../auth/contracts';
import {canReadCattle} from './contracts';

/** Same audience as the web sales module (managers); read-only accounts never record. */
export function canReadCattleSales(user:User){return canReadCattle(user)&&['admin','manager'].includes(user.access.role);}
export function canSellCattle(user:User){return canReadCattleSales(user)&&!user.access.read_only;}
const decimal=z.union([z.string(),z.number()]).transform(v=>String(v));
export const cattleSaleRowSchema=z.object({id:z.string(),date:z.iso.date(),batch_code:z.string().optional(),quantity:z.number().nullable().optional(),amount:decimal.nullable().optional(),net_amount:decimal.nullable().optional(),buyer:z.string().optional(),weight_kg:decimal.nullable().optional(),pricing_basis:z.string().optional(),responsible:z.string().optional()});
export type CattleSaleRow=z.infer<typeof cattleSaleRowSchema>;
export const cattleSaleListSchema=z.array(cattleSaleRowSchema);
const num=(precision:number)=>z.string().trim().transform(v=>v.replace(',','.')).pipe(z.string().regex(new RegExp(`^\\d+(\\.\\d{1,${precision}})?$`))).refine(v=>Number(v)>0);
const optional=(precision:number)=>z.union([z.literal(''),num(precision)]).transform(v=>v||undefined);
export const cattleSaleInputSchema=z.object({
 mode:z.enum(['whole','partial']),quantity:z.string().trim().optional(),date:z.iso.date(),due_date:z.iso.date(),buyer:z.string().trim().min(1).max(200),responsible:z.string().trim().max(200),notes:z.string().trim().max(2000),
 weight_kg:num(3),pricing_basis:z.enum(['live_kg','carcass_arroba']),price_per_kg:optional(6),price_per_arroba:optional(2),carcass_weight_kg:optional(3),yield_percent:optional(2),deductions:z.union([z.literal(''),z.string().trim().transform(v=>v.replace(',','.')).pipe(z.string().regex(/^\d+(\.\d{1,2})?$/))]).transform(v=>v||'0'),deduction_description:z.string().trim().max(500),slaughter_reference:z.string().trim().max(200),
}).superRefine((v,ctx)=>{
 if(v.mode==='partial'&&!/^\d+$/.test(v.quantity??''))ctx.addIssue({code:'custom',path:['quantity'],message:'quantity'});
 if(v.pricing_basis==='live_kg'&&!v.price_per_kg)ctx.addIssue({code:'custom',path:['price_per_kg'],message:'price'});
 if(v.pricing_basis==='carcass_arroba'&&(!v.price_per_arroba||!(v.carcass_weight_kg||v.yield_percent)))ctx.addIssue({code:'custom',path:['price_per_arroba'],message:'carcass'});
 if(Number(v.deductions)>0&&!v.deduction_description)ctx.addIssue({code:'custom',path:['deduction_description'],message:'description'});
 if(v.yield_percent&&Number(v.yield_percent)>100)ctx.addIssue({code:'custom',path:['yield_percent'],message:'yield'});
 if(v.due_date<v.date)ctx.addIssue({code:'custom',path:['due_date'],message:'due'});
});
export type CattleSaleInput=z.input<typeof cattleSaleInputSchema>;
/** API payload mirroring the web: only the fields of the chosen pricing basis are sent. */
export function salePayload(input:CattleSaleInput){
 const v=cattleSaleInputSchema.parse(input);
 const base={mode:v.mode,...(v.mode==='partial'?{quantity:Number(v.quantity)}:{}),date:v.date,due_date:v.due_date,buyer:v.buyer,responsible:v.responsible,notes:v.notes,weight_kg:v.weight_kg,pricing_basis:v.pricing_basis,deductions:v.deductions,deduction_description:v.deduction_description,slaughter_reference:v.slaughter_reference};
 return v.pricing_basis==='live_kg'?{...base,price_per_kg:v.price_per_kg}:{...base,price_per_arroba:v.price_per_arroba,...(v.carcass_weight_kg?{carcass_weight_kg:v.carcass_weight_kg}:{yield_percent:v.yield_percent})};
}
/** Informational estimate only; the server computes the gross/net amounts and the receivable. */
export function saleEstimate(v:{pricing_basis:'live_kg'|'carcass_arroba';weight_kg:string;price_per_kg:string;price_per_arroba:string;carcass_weight_kg:string;yield_percent:string;deductions:string}){
 const n=(x:string)=>Number(x.replace(',','.'))||0;
 const weight=n(v.weight_kg);
 const gross=v.pricing_basis==='live_kg'?weight*n(v.price_per_kg):((n(v.carcass_weight_kg)||weight*n(v.yield_percent)/100)/15)*n(v.price_per_arroba);
 return {gross:Math.round(gross*100)/100,net:Math.round((gross-n(v.deductions))*100)/100};
}
