import {z} from 'zod';
import {protocolExecutionOptionsSchema,protocolExecutionScopeSchema} from './protocolExecutionContracts';
const amount=z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/);
const cents=(s:string)=>{const [whole,fraction='']=amount.parse(s).split('.');return BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'));};
const format=(value:bigint)=>`${value/100n}.${String(value%100n).padStart(2,'0')}`;
const quantity=amount.refine(s=>amount.safeParse(s).success&&cents(s)>0n).transform(s=>format(cents(s)));
export const protocolMatingSchema=z.object({id:z.uuid(),date:z.iso.date(),kind:z.enum(['natural','ai','iatf']),version:z.iso.datetime({offset:true})});
export const protocolSemenLotSchema=z.object({id:z.uuid(),item:z.uuid(),name:z.string(),number:z.string(),unit:z.string().min(1),balance:amount,expiry:z.iso.date().nullable(),version:z.iso.datetime({offset:true})});
export type ProtocolMating=z.infer<typeof protocolMatingSchema>;
export type ProtocolSemenLot=z.infer<typeof protocolSemenLotSchema>;
export const protocolSemenInputSchema=protocolExecutionScopeSchema.extend({date:z.iso.date(),notes:z.string().trim().max(1000),mating:z.uuid(),inventory_lot:z.uuid().nullable(),inventory_quantity:quantity.nullable(),acknowledged:z.literal(true)}).refine(v=>(v.inventory_lot===null)===(v.inventory_quantity===null));
export type ProtocolSemenInput=z.infer<typeof protocolSemenInputSchema>;
export const protocolStockSchema=z.object({lot:z.uuid(),item:z.uuid(),name:z.string(),number:z.string(),unit:z.string().min(1),quantity:quantity,before:amount,after:amount,expiry:z.iso.date().nullable()}).refine(v=>[v.before,v.quantity,v.after].every(s=>amount.safeParse(s).success)&&cents(v.before)-cents(v.quantity)===cents(v.after));
export const protocolSemenReviewSchema=protocolExecutionOptionsSchema.extend({mating:protocolMatingSchema,stock:protocolStockSchema.nullable(),command:protocolSemenInputSchema,preview_token:z.string().min(1).max(60000)});
export type ProtocolSemenReview=z.infer<typeof protocolSemenReviewSchema>;
const page=<T extends z.ZodType>(schema:T)=>z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(schema)});
export const protocolMatingPageSchema=page(protocolMatingSchema),protocolSemenLotPageSchema=page(protocolSemenLotSchema);
export const protocolSemenKey=(v:ProtocolSemenInput)=>JSON.stringify(protocolSemenInputSchema.parse(v));
export function validateProtocolSemen(review:ProtocolSemenReview,input:ProtocolSemenInput){const v=protocolSemenInputSchema.parse(input);if(protocolSemenKey(review.command)!==protocolSemenKey(v)||review.step!==v.step||review.farm!==v.farm||review.production!==v.production||review.mating.id!==v.mating||review.mating.date!==v.date||v.date<review.earliest_date||v.date>review.today||(review.stock?.lot??null)!==v.inventory_lot||(review.stock?.quantity??null)!==v.inventory_quantity||review.stock?.expiry&&review.stock.expiry<v.date)throw Error('semen review');return review;}
