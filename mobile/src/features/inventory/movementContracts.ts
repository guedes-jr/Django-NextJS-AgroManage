import {z} from 'zod';
export const movementTypes=['compra','venda','consumo','perda','entrada','saida','vencimento','ajuste'] as const;
export const movementSchema=z.object({id:z.uuid(),item:z.uuid(),item_nome:z.string(),item_unidade:z.string(),lote:z.uuid().nullable(),lote_numero:z.string().nullable(),tipo:z.string(),quantidade:z.string().regex(/^-?\d+(\.\d+)?$/),data_movimentacao:z.iso.datetime({offset:true}),responsavel_nome:z.string().nullable(),destino:z.string(),observacao:z.string(),cattle_delivery:z.uuid().nullable(),farm:z.uuid().nullable(),farm_nome:z.string().nullable(),timezone:z.string().refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}})});
export type InventoryMovement=z.infer<typeof movementSchema>;
export const movementPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(movementSchema)});
export const movementQuerySchema=z.object({page:z.number().int().min(1).max(100000).default(1),search:z.string().trim().max(100).default(''),tipo:z.enum(['',...movementTypes]).default(''),item:z.uuid().optional(),lote:z.uuid().optional(),start:z.iso.date().optional(),end:z.iso.date().optional()}).refine(v=>!v.start&&!v.end||!!v.start&&!!v.end&&v.start<=v.end&&(Date.parse(v.end)-Date.parse(v.start))/86400000<=365);
export type MovementQuery=z.infer<typeof movementQuerySchema>;
const countDecimal=z.string().trim().regex(/^\d{1,8}([.,]\d{1,2})?$/);
export function hundredths(value:string){const [whole='0',fraction='']=value.replace(',','.').split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));}
export const stockCountSchema=z.object({quantidade_contada:countDecimal,saldo_esperado:countDecimal,motivo:z.string().trim().min(1).max(1000)}).refine(v=>hundredths(v.quantidade_contada)!==hundredths(v.saldo_esperado),{path:['quantidade_contada'],message:'difference'});
export type StockCountInput=z.infer<typeof stockCountSchema>;
export function stockCountPayload(input:StockCountInput){const v=stockCountSchema.parse(input);return {...v,quantidade_contada:v.quantidade_contada.replace(',','.'),saldo_esperado:v.saldo_esperado.replace(',','.')};}
