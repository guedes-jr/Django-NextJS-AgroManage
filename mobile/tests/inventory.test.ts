import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,type AxiosAdapter} from 'axios';
import {createAuthApi} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {canReadInventory,itemSchema,lotSchema,alertSchema,summarySchema,inventoryQuerySchema} from '../src/features/inventory/contracts';
import {inventoryMessages} from '../src/features/inventory/messages';
import {parseSearch} from '../src/features/workspace/contracts';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const actor=userSchema.parse({id,full_name:'Gestor',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'manager',can_manage_users:true,can_view_financial:false,can_operate_crops:false,livestock_species:[],read_only:false}});
const item={id,nome:'Produto 0009',categoria:'racao',categoria_display:'Ração',categorias:['racao'],unidade_medida:'kg',unidade_display:'kg — Quilograma',descricao:'',fabricante:'',especie_animal:'bovino',estoque_minimo:'10.00',estoque_atual:'7.25',estoque_baixo:true,prioridade:'alta',ativo:true};
const lot={id,item:id,numero_lote:'0007',data_fabricacao:null,data_validade:null,quantidade_inicial:'10.00',quantidade_atual:'7.25',local_display:'Depósito',data_entrada:'2026-11-07',observacao:'',ativo:true};
const query=inventoryQuerySchema.parse({kind:'items'});
async function fixture(user=actor,hold?:()=>Promise<void>){const calls:{path:string;params:unknown;method:string|undefined;signal:unknown}[]=[];let lotItem=id;const adapter:AxiosAdapter=async config=>{const path=config.url!;calls.push({path,params:config.params,method:config.method,signal:config.signal});let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?user:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
 if(path.startsWith('inventory/')){await hold?.();data=path==='inventory/alertas/'?{count:0,results:[],next:null,previous:null}:path==='inventory/fornecedores/'?{count:0,results:[],next:null,previous:null}:path==='inventory/items/stats/'?{total_items:1,estoque_baixo:1,total_value:'999'}:path==='inventory/items/choices/'?{categorias:[{value:'racao',label:'Ração'}]}:path==='inventory/lotes/'?{count:1,results:[{...lot,item:lotItem}],next:null,previous:null}:path===`inventory/items/${id}/`?item:{count:1,results:[item],next:'https://untrusted.invalid/next',previous:null};}
 return {data,status:200,statusText:'OK',headers:{},config};};const api=createAuthApi('https://example.com/api/v1/',create({adapter}));const controller=new SessionController(api,{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,calls,setWrongLot:()=>{lotItem=other;}};}
test('inventory models preserve unit, precise balances, unknown expiry and optional alert product; discard costs',()=>{
 const result=itemSchema.parse({...item,custo_medio:'123.45',organization:id});assert.equal(result.estoque_atual,'7.25');assert.equal('custo_medio' in result,false);assert.equal('organization' in result,false);
 assert.equal(lotSchema.parse({...lot,custo_unitario:null}).data_validade,null);assert.equal('custo_unitario' in lotSchema.parse({...lot,custo_unitario:'9'}),false);
 assert.equal(alertSchema.parse({id,item:null,tipo:'outro',prioridade:'media',titulo:'Geral',descricao:'',lido:false,resolvido:false,created_at:'2026-11-07T12:00:00Z'}).item,null);
 assert.deepEqual(summarySchema.parse({total_items:1,estoque_baixo:1,total_value:'1',total_qty:99,itens_vencidos:0}),{total_items:1,estoque_baixo:1});
});
test('inventory query validates server pagination and prevents missing/foreign item scope',()=>{
 for(const changes of [{page:0},{page:1.5},{search:'x'.repeat(101)},{status:'invented'},{item:id}])assert.equal(inventoryQuerySchema.safeParse({...query,...changes}).success,false);
 assert.equal(inventoryQuerySchema.safeParse({...query,kind:'lots'}).success,false);assert.equal(inventoryQuerySchema.safeParse({...query,kind:'lots',item:id}).success,true);
});
test('inventory API sends only supported filters, uses operational projection and never follows remote next URLs',async()=>{
 const f=await fixture();const signal=new AbortController().signal;await f.controller.inventoryPage({...query,status:'baixo',search:'0009',category:'racao',page:2},signal);
 assert.deepEqual(f.calls.at(-1)?.params,{page:2,page_size:20,view:'operational',search:'0009',categoria:'racao',status:'baixo'});assert.equal(f.calls.at(-1)?.signal,signal);
 await f.controller.inventoryPage({...query,kind:'alerts',search:'ignored',category:'ignored',status:'baixo'});assert.equal(f.calls.at(-1)?.path,'inventory/alertas/');assert.deepEqual(f.calls.at(-1)?.params,{page:1,page_size:20});
 await f.controller.inventoryPage({...query,kind:'suppliers',search:'Alvo',category:'ignored'});assert.equal(f.calls.at(-1)?.path,'inventory/fornecedores/');assert.deepEqual(f.calls.at(-1)?.params,{page:1,page_size:20,search:'Alvo'});
 await f.controller.inventorySummary();assert.equal(f.calls.at(-1)?.path,'inventory/items/stats/');assert.deepEqual(f.calls.at(-1)?.params,{view:'operational'});
 await f.controller.inventoryDetail('items',id);assert.equal(f.calls.at(-1)?.path,`inventory/items/${id}/`);
 await f.controller.inventoryPage({...query,kind:'lots',item:id});assert.deepEqual(f.calls.at(-1)?.params,{page:1,page_size:20,item:id,view:'operational'});
 f.setWrongLot();await assert.rejects(f.controller.inventoryPage({...query,kind:'lots',item:id}),/scope/);
 assert.equal(f.calls.some(c=>c.path.includes('untrusted')||c.method!=='get'&&c.path.startsWith('inventory/')),false);
});
test('inventory remains manager/admin-only in mobile; readonly managers may consult without financial capability',async()=>{
 const readonly=await fixture({...actor,access:{...actor.access,read_only:true}});await readonly.controller.inventorySummary();assert.equal(canReadInventory({...actor,access:{...actor.access,read_only:true}}),true);
 for(const role of ['operator','feeder'] as const){const f=await fixture({...actor,access:{...actor.access,role,livestock_species:['bovinos']}});await assert.rejects(f.controller.inventorySummary());await assert.rejects(f.controller.inventoryPage(query));await assert.rejects(f.controller.inventoryDetail('items',id));assert.equal(f.calls.some(c=>c.path.startsWith('inventory/')),false);}
 for(const changes of [{force_password_change:true},{is_platform_staff:true},{affiliate_portal_only:true}])assert.equal(canReadInventory({...actor,...changes}),false);
});
test('inventory discards late responses after signout and does not reopen a previous session',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const f=await fixture(actor,()=>gate);const pending=f.controller.inventorySummary();await f.controller.signOut();release();await assert.rejects(pending,/expired/);assert.equal(f.controller.getSnapshot().status,'signedOut');
});
test('inventory search accepts the actual unit field and offers native detail without dropping legacy labels',()=>{
 for(const unit of [{unidade_display:'kg'},{unidade_medida_display:'kg'}]){const result=parseSearch('inventory',{results:[{id,nome:'0009',categoria_display:'Ração',...unit}],next:null,previous:null});assert.equal(result.results[0]?.nativeInventory,id);assert.equal(result.results[0]?.subtitle,'Ração · kg');}
});
test('inventory catalogs cover four locales, categories and known severity/contract labels',()=>{
 for(const copy of Object.values(inventoryMessages)){assert.deepEqual(Object.keys(copy).sort(),Object.keys(inventoryMessages['pt-BR']).sort());assert.deepEqual(Object.keys(copy.categories).sort(),Object.keys(inventoryMessages['pt-BR'].categories).sort());assert.deepEqual(Object.keys(copy.labels).sort(),Object.keys(inventoryMessages['pt-BR'].labels).sort());}
});
