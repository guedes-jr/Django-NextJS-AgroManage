import {z} from 'zod';
import type {User} from '../auth/contracts';
export function canWriteInventory(user:User){return canReadInventory(user)&&!user.access.read_only;}
export function canReadInventory(user:User){return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only&&['admin','manager'].includes(user.access.role);}
const decimal=z.string().regex(/^\d+(\.\d+)?$/);
export const itemSchema=z.object({id:z.uuid(),nome:z.string(),categoria:z.string(),categoria_display:z.string(),categorias:z.array(z.string()),unidade_medida:z.string(),unidade_display:z.string(),descricao:z.string(),fabricante:z.string(),especie_animal:z.string(),estoque_minimo:decimal,estoque_atual:decimal,estoque_baixo:z.boolean(),prioridade:z.string(),ativo:z.boolean(),updated_at:z.iso.datetime({offset:true}).optional()});
export const lotSchema=z.object({id:z.uuid(),item:z.uuid(),numero_lote:z.string(),data_fabricacao:z.iso.date().nullable(),data_validade:z.iso.date().nullable(),quantidade_inicial:decimal,quantidade_atual:decimal,local_display:z.string(),fornecedor_nome:z.string().optional(),data_entrada:z.iso.date(),observacao:z.string(),ativo:z.boolean()});
export const alertSchema=z.object({id:z.uuid(),item:z.uuid().nullable(),item_nome:z.string().optional(),tipo:z.string(),prioridade:z.string(),titulo:z.string(),descricao:z.string(),lido:z.boolean(),resolvido:z.boolean(),created_at:z.iso.datetime({offset:true})});
export const supplierSchema=z.object({id:z.uuid(),nome:z.string(),cnpj:z.string(),tipo_contrato:z.string(),ativo:z.boolean(),contatos:z.array(z.object({id:z.uuid(),tipo:z.string(),label:z.string(),valor:z.string()})),enderecos:z.array(z.object({id:z.uuid(),label:z.string().optional(),latitude:z.string().nullable().optional(),longitude:z.string().nullable().optional(),cep:z.string(),logradouro:z.string(),numero:z.string(),bairro:z.string(),complemento:z.string(),cidade:z.string(),estado:z.string()})),updated_at:z.iso.datetime({offset:true}).optional()});
export const summarySchema=z.object({total_items:z.number().int().nonnegative(),estoque_baixo:z.number().int().nonnegative()});
export const choicesSchema=z.object({categorias:z.array(z.object({value:z.string().min(1).max(30),label:z.string()}))});
const option=z.object({value:z.string().min(1).max(30),label:z.string()});
export const inventoryFormChoicesSchema=z.object({categorias:z.array(option).min(1),unidades:z.array(option).min(1),especies:z.array(option),tipos_contrato:z.array(option).min(1)});
const page=<T extends z.ZodType>(schema:T)=>z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(schema)});
export const itemPageSchema=page(itemSchema),lotPageSchema=page(lotSchema),alertPageSchema=page(alertSchema),supplierPageSchema=page(supplierSchema);
export const inventoryKinds=['items','alerts','suppliers'] as const;
export const inventoryQuerySchema=z.object({kind:z.enum([...inventoryKinds,'lots']),page:z.number().int().min(1).max(100000).default(1),search:z.string().trim().max(100).default(''),category:z.string().max(30).default(''),status:z.enum(['all','baixo','normal']).default('all'),item:z.uuid().optional()}).refine(v=>v.kind==='lots'?!!v.item:!v.item);
export type InventoryQuery=z.infer<typeof inventoryQuerySchema>;
export type InventoryItem=z.infer<typeof itemSchema>;
export type InventoryLot=z.infer<typeof lotSchema>;
export type InventoryAlert=z.infer<typeof alertSchema>;
export type InventorySupplier=z.infer<typeof supplierSchema>;
