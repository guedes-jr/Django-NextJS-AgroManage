import {z} from 'zod';
const dec=z.string().regex(/^\d+(\.\d{1,2})?$/);
const page=<T extends z.ZodType>(row:T)=>z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(row)});
export const ingredientSchema=z.object({item:z.uuid(),item_nome:z.string(),unidade:z.string(),ativo:z.boolean(),percentual:dec});
export const formulaSchema=z.object({id:z.uuid(),nome:z.string(),descricao:z.string(),especie_animal:z.string(),item_final:z.uuid().nullable(),item_final_nome:z.string(),ativa:z.boolean(),updated_at:z.iso.datetime({offset:true}),ingredientes:z.array(ingredientSchema)});
export const productionSchema=z.object({id:z.uuid(),formula:z.uuid(),formula_nome:z.string(),data_producao:z.iso.datetime({offset:true}),timezone:z.string().min(1),quantidade_teorica:dec,quantidade_real:dec,status:z.string(),responsavel_nome:z.string()});
export const formulaPageSchema=page(formulaSchema),productionPageSchema=page(productionSchema);
const positive=z.string().trim().regex(/^\d{1,8}([.,]\d{1,2})?$/).refine(v=>Number(v.replace(',','.'))>0);
export const formulaInputSchema=z.object({nome:z.string().trim().min(1).max(150),descricao:z.string().trim().max(5000),especie_animal:z.string().max(30),item_final:z.uuid(),ingredientes:z.array(z.object({item:z.uuid(),percentual:positive.refine(v=>Number(v.replace(',','.'))<=100)})).min(1).max(50)}).superRefine((v,ctx)=>{
 const ids=v.ingredientes.map(row=>row.item);
 const sum=v.ingredientes.reduce((n,row)=>n+Math.round(Number(row.percentual.replace(',','.'))*100),0);
 if(sum!==10000||new Set(ids).size!==ids.length||ids.includes(v.item_final))ctx.addIssue({code:'custom',path:['ingredientes'],message:'invalid'});
});
export const productionInputSchema=z.object({formula:z.uuid(),quantidade_teorica:positive,quantidade_real:positive});
export type Formula=z.infer<typeof formulaSchema>;
export type Production=z.infer<typeof productionSchema>;
export type FormulaInput=z.infer<typeof formulaInputSchema>;
export type ProductionInput=z.infer<typeof productionInputSchema>;
export function formulaPayload(input:FormulaInput,record?:Formula){const v=formulaInputSchema.parse(input);return {...(record?{id:record.id,expected_updated_at:record.updated_at}:{}),nome:v.nome,descricao:v.descricao,especie_animal:v.especie_animal,item_final:v.item_final,ingredientes:v.ingredientes.map(row=>({item:row.item,percentual:row.percentual.replace(',','.')}))};}
export function productionPayload(input:ProductionInput){const v=productionInputSchema.parse(input);return {formula:v.formula,quantidade_teorica:v.quantidade_teorica.replace(',','.'),quantidade_real:v.quantidade_real.replace(',','.')};}
export const previewSchema=z.object({preview_token:z.string().min(1).max(60000),formula:z.uuid(),nome:z.string(),item_final:z.uuid(),item_final_nome:z.string(),quantidade_teorica:dec,quantidade_real:dec,saldo_final_anterior:dec,saldo_final_posterior:dec,ingredientes:z.array(z.object({item:z.uuid(),nome:z.string(),percentual:dec,quantidade:dec,disponivel:dec,lotes:z.array(z.object({id:z.uuid(),numero:z.string(),quantidade:dec}))}))});
export type FeedPreview=z.infer<typeof previewSchema>;
export function sameProduction(input:ProductionInput,review:FeedPreview){const v=productionPayload(input);return v.formula===review.formula&&Number(v.quantidade_teorica)===Number(review.quantidade_teorica)&&Number(v.quantidade_real)===Number(review.quantidade_real);}
