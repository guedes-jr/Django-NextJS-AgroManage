import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,InventorySaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {movementSchema,movementQuerySchema,stockCountSchema,stockCountPayload,hundredths} from '../src/features/inventory/movementContracts';
import {movementMessages} from '../src/features/inventory/movementMessages';
const id='00000000-0000-4000-8000-000000000001',lotId='00000000-0000-4000-8000-000000000002',moveId='00000000-0000-4000-8000-000000000003';
const user=userSchema.parse({id,full_name:'Gestor',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'manager',can_manage_users:true,can_view_financial:false,can_operate_crops:false,livestock_species:[],read_only:false}});
const movement={id:moveId,item:id,item_nome:'Produto',item_unidade:'kg',lote:lotId,lote_numero:'0009',tipo:'ajuste',quantidade:'-2.75',data_movimentacao:'2026-11-07T12:00:00-03:00',responsavel_nome:'Gestor',destino:'Inventário',observacao:'Contagem física',farm:null,farm_nome:null,cattle_delivery:null,timezone:'America/Fortaleza'};
const item={id,nome:'Produto',categoria:'racao',categoria_display:'Ração',categorias:['racao'],unidade_medida:'kg',unidade_display:'kg',descricao:'',fabricante:'',especie_animal:'',estoque_minimo:'0.00',estoque_atual:'10.00',estoque_baixo:false,prioridade:'media',ativo:true};
const lot={id:lotId,item:id,numero_lote:'0009',data_fabricacao:null,data_validade:null,quantidade_inicial:'10.00',quantidade_atual:'10.00',local_display:'Depósito',data_entrada:'2026-11-07',observacao:'',ativo:true};
const input={quantidade_contada:'7,25',saldo_esperado:'10.00',motivo:'Conferência'};
async function fixture(actor=user){let unit='kg',lotItem=id,active=true,mode:'ok'|'409'|'500'='ok',hold:(()=>Promise<void>)|undefined;const calls:{path:string;params:unknown;body:unknown;method:string|undefined}[]=[];
 const adapter:AxiosAdapter=async config=>{const path=config.url!;calls.push({path,params:config.params,body:config.data?JSON.parse(config.data):undefined,method:config.method});let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?actor:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:path==='inventory/movimentacoes/'?{count:1,results:[movement],next:'https://untrusted.invalid/next',previous:null}:path===`inventory/movimentacoes/${moveId}/`?movement:path===`inventory/items/${id}/`?{...item,unidade_medida:unit}:{};
 if(path===`inventory/lotes/${lotId}/`){await hold?.();data={...lot,item:lotItem,ativo:active};}
 if(path.endsWith('/ajustar-estoque/')){if(mode!=='ok')throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:Number(mode),statusText:'error',headers:{}});data={id:moveId,custo_total:'999'};}
 return {config,data,status:200,statusText:'OK',headers:{}};};const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,calls,unit:()=>{unit='unidade';},wrongLot:()=>{lotItem=moveId;},inactive:()=>{active=false;},mode:(v:typeof mode)=>{mode=v;},hold:(v:()=>Promise<void>)=>{hold=v;}};
}
test('movement read model preserves signed quantities, null sources and system zone without costs',()=>{
 const row=movementSchema.parse({...movement,custo_total:'123.45',custo_unitario_movimento:'9'});assert.equal(row.quantidade,'-2.75');assert.equal(row.farm,null);assert.equal('custo_total' in row,false);assert.equal('custo_unitario_movimento' in row,false);
 assert.equal(movementSchema.safeParse({...movement,timezone:'invalid-zone'}).success,false);assert.equal(movementSchema.safeParse({...movement,quantidade:-2.75}).success,false);
});
test('movement filters reject malformed dates, unbounded periods and invalid types before HTTP',()=>{
 for(const value of [{page:0},{start:'2026-11-07'},{start:'2026-11-08',end:'2026-11-07'},{start:'2026-02-30',end:'2026-03-01'},{start:'2024-01-01',end:'2026-01-01'},{tipo:'fake'},{item:'bad'}])assert.equal(movementQuerySchema.safeParse(value).success,false);
 assert.equal(movementQuerySchema.safeParse({start:'2026-01-01',end:'2026-12-31'}).success,true);
});
test('stock count compares exact hundredths, permits zero and normalizes only allowed fields',()=>{
 assert.equal(hundredths('7,25'),725);assert.equal(stockCountSchema.safeParse({...input,quantidade_contada:'0'}).success,true);
 for(const change of [{quantidade_contada:'10,00'},{quantidade_contada:'-1'},{quantidade_contada:'7.251'},{saldo_esperado:'-1'},{motivo:' '}])assert.equal(stockCountSchema.safeParse({...input,...change}).success,false);
 assert.deepEqual(stockCountPayload({...input,motivo:' Conferência '}),{quantidade_contada:'7.25',saldo_esperado:'10.00',motivo:'Conferência'});
});
test('movement API fixes its own endpoints, filters, context and operational receipt',async()=>{
 const f=await fixture();await f.controller.inventoryMovements(movementQuerySchema.parse({item:id,lote:lotId,tipo:'ajuste',page:2,start:'2026-11-01',end:'2026-11-07'}));assert.deepEqual(f.calls.at(-1)?.params,{search:'',tipo:'ajuste',page:2,item:id,lote:lotId,start:'2026-11-01',end:'2026-11-07',view:'operational',page_size:20});
 await f.controller.inventoryMovement(moveId);assert.equal(f.calls.at(-1)?.path,`inventory/movimentacoes/${moveId}/`);await assert.rejects(f.controller.inventoryMovements(movementQuerySchema.parse({item:moveId})),/scope/);
 assert.deepEqual(await f.controller.countInventory(lotId,id,'kg',input),{id:moveId});assert.equal(f.calls.at(-1)?.path,`inventory/lotes/${lotId}/ajustar-estoque/`);assert.deepEqual(f.calls.at(-1)?.params,{view:'receipt'});assert.deepEqual(f.calls.at(-1)?.body,{quantidade_contada:'7.25',saldo_esperado:'10.00',motivo:'Conferência',unidade_esperada:'kg'});assert.equal(f.calls.some(c=>c.path.includes('untrusted')),false);
});
test('history/count guards preserve mobile roles and reject changed unit or lot before mutation',async()=>{
 for(const role of ['operator','feeder'] as const){const f=await fixture({...user,access:{...user.access,role}});await assert.rejects(f.controller.inventoryMovements(movementQuerySchema.parse({})));await assert.rejects(f.controller.countInventory(lotId,id,'kg',input));assert.equal(f.calls.some(c=>c.path.startsWith('inventory/')),false);}
 const readonly=await fixture({...user,access:{...user.access,read_only:true}});await readonly.controller.inventoryMovements(movementQuerySchema.parse({}));await assert.rejects(readonly.controller.countInventory(lotId,id,'kg',input));assert.equal(readonly.calls.some(c=>c.method==='post'&&c.path.startsWith('inventory/')),false);
 for(const change of ['unit','wrongLot','inactive'] as const){const f=await fixture();f[change]();await assert.rejects(f.controller.countInventory(lotId,id,'kg',input));assert.equal(f.calls.some(c=>c.path.endsWith('/ajustar-estoque/')),false);}
});
test('count preflight is single flight and cannot send a write after signout',async()=>{
 const f=await fixture();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});f.hold(()=>gate);const first=f.controller.countInventory(lotId,id,'kg',input);await assert.rejects(f.controller.countInventory(lotId,id,'kg',input));await f.controller.signOut();release();await assert.rejects(first);assert.equal(f.calls.some(c=>c.path.endsWith('/ajustar-estoque/')),false);
});
test('count stale balance is a known conflict and server failure is unconfirmed, with complete locales',async()=>{
 const f=await fixture();f.mode('409');await assert.rejects(f.controller.countInventory(lotId,id,'kg',input),e=>e instanceof AxiosError&&e.response?.status===409);f.mode('500');await assert.rejects(f.controller.countInventory(lotId,id,'kg',input),InventorySaveUnconfirmed);
 for(const copy of Object.values(movementMessages)){assert.deepEqual(Object.keys(copy).sort(),Object.keys(movementMessages['pt-BR']).sort());assert.deepEqual(Object.keys(copy.types).sort(),Object.keys(movementMessages['pt-BR'].types).sort());}
});
