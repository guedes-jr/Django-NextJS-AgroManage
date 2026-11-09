import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,InventorySaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {launchInputSchema,launchPayload,launchPreviewSchema,sameLaunch,moneyText,type LaunchInput} from '../src/features/inventory/launchContracts';
import {launchMessages} from '../src/features/inventory/launchMessages';
const id='00000000-0000-4000-8000-000000000001',lot='00000000-0000-4000-8000-000000000002';
const user=userSchema.parse({id,full_name:'Gestor',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'manager',can_manage_users:true,can_view_financial:true,can_operate_crops:false,livestock_species:[],read_only:false}});
const values:LaunchInput={item:id,tipo:'entrada',quantidade:'3,25',unidade_esperada:'kg',lote:'',farm:'',fornecedor:'',numero_lote:'NOVO',data_entrada:'2026-11-07',data_fabricacao:'',data_validade:'',local_armazenamento:'deposito',nota_fiscal:'',custo_unitario:'',purchase_due_date:'',motivo:'Recebimento',observacao:'',destino:''};
function preview(input=values){const command=launchPayload(input);return launchPreviewSchema.parse({command,preview_token:'synthetic-review',item:id,item_nome:'Produto',unidade:'kg',lote:command.lote,numero_lote:input.numero_lote,tipo:input.tipo,quantidade:command.quantidade,saldo_anterior:'0.00',saldo_posterior:command.quantidade,farm:command.farm,farm_nome:command.farm?'Fazenda':null,fornecedor:command.fornecedor,fornecedor_nome:null,total_pendente:input.tipo==='compra'?'8.29':null});}
async function fixture(actor=user){const calls:{path:string;body:unknown}[]=[];let mode:'ok'|'409'|'500'='ok';let hold:(()=>Promise<void>)|undefined;const adapter:AxiosAdapter=async config=>{const path=config.url!;calls.push({path,body:config.data?JSON.parse(config.data):undefined});let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?actor:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
 if(path==='inventory/movimentacoes/preview/'){await hold?.();if(mode==='500')throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:500,statusText:'error',headers:{}});data=preview();}
 if(path==='inventory/movimentacoes/confirm/'){if(mode!=='ok')throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:Number(mode),statusText:'error',headers:{}});data={id,lote:lot,payable:null};}
 return {config,data,status:200,statusText:'OK',headers:{}};};const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,calls,mode:(v:typeof mode)=>{mode=v;},hold:(v:()=>Promise<void>)=>{hold=v;}};
}
test('stock launch validates positive amounts, explicit receipts, withdrawal lot/destination and pending-purchase data',()=>{
 for(const change of [{quantidade:'0'},{quantidade:'-1'},{quantidade:'1.001'},{numero_lote:''},{data_entrada:''},{tipo:'saida'},{tipo:'compra'}])assert.equal(launchInputSchema.safeParse({...values,...change}).success,false);
 const purchase=launchInputSchema.parse({...values,tipo:'compra',farm:id,custo_unitario:'2,55',purchase_due_date:'2026-12-07'});assert.equal(launchPayload(purchase).custo_unitario,'2.55');assert.equal(launchPayload(purchase).quantidade,'3.25');assert.equal('purchase_payment_status' in launchPayload(purchase),false);
 const existing=launchPayload({...values,lote:lot});for(const key of ['numero_lote','local_armazenamento','nota_fiscal'])assert.equal(existing[key as keyof typeof existing],'');assert.equal(existing.data_entrada,null);assert.equal(existing.fornecedor,null);assert.equal(existing.custo_unitario,null);
});
test('review binds the complete normalized intention, including reason, dates, destinations and prices',()=>{
 const reviewed=preview();assert.equal(sameLaunch(values,reviewed),true);
 for(const change of [{motivo:'Outro'},{observacao:'Outra'},{numero_lote:'OUTRO'},{farm:id},{fornecedor:id},{data_entrada:'2026-11-06'},{destino:'Outro'},{quantidade:'3,26'}])assert.equal(sameLaunch({...values,...change},reviewed),false);
 assert.equal(sameLaunch(values,{...reviewed,total_pendente:'0.00'}),false);
 const purchase={...values,tipo:'compra' as const,farm:id,custo_unitario:'2,55',purchase_due_date:'2026-12-07'};const p=preview(purchase);assert.equal(sameLaunch(purchase,p),true);assert.equal(sameLaunch({...purchase,custo_unitario:'2.56'},p),false);
});
test('financial preview formatting preserves cents beyond Number integer precision',()=>{
 assert.equal(moneyText('99999999999999.99','en').replace(/\D/g,''),'9999999999999999');assert.equal(moneyText('8.29','pt-BR').replace(/\D/g,''),'829');
});
test('preview and confirmation use distinct endpoints and confirmation sends only its signed review',async()=>{
 const f=await fixture();const reviewed=await f.controller.previewStockLaunch(values);assert.equal(f.calls.at(-1)?.path,'inventory/movimentacoes/preview/');assert.deepEqual(f.calls.at(-1)?.body,launchPayload(values));assert.equal(f.calls.some(c=>c.path.includes('/confirm/')),false);
 assert.deepEqual(await f.controller.confirmStockLaunch(values,reviewed),{id,lote:lot,payable:null});assert.deepEqual(f.calls.at(-1),{path:'inventory/movimentacoes/confirm/',body:{preview_token:'synthetic-review'}});await assert.rejects(f.controller.confirmStockLaunch({...values,motivo:'Outro'},reviewed));assert.equal(f.calls.filter(c=>c.path.includes('/confirm/')).length,1);
});
test('stock writing preserves role, read-only and financial restrictions before requesting purchase preview',async()=>{
 for(const role of ['operator','feeder'] as const){const f=await fixture({...user,access:{...user.access,role}});await assert.rejects(f.controller.previewStockLaunch(values));assert.equal(f.calls.some(c=>c.path.startsWith('inventory/')),false);}
 const readonly=await fixture({...user,access:{...user.access,read_only:true}});await assert.rejects(readonly.controller.previewStockLaunch(values));assert.equal(readonly.calls.some(c=>c.path.startsWith('inventory/')),false);
 const nonfinancial=await fixture({...user,access:{...user.access,can_view_financial:false}});const purchase={...values,tipo:'compra' as const,farm:id,custo_unitario:'2',purchase_due_date:'2026-12-07'};await assert.rejects(nonfinancial.controller.previewStockLaunch(purchase));assert.equal(nonfinancial.calls.some(c=>c.path.startsWith('inventory/')),false);
});
test('in-flight preview and logout cannot produce an automatic confirmation',async()=>{
 const f=await fixture();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});f.hold(()=>gate);const first=f.controller.previewStockLaunch(values);await assert.rejects(f.controller.previewStockLaunch(values));await f.controller.signOut();release();await assert.rejects(first);assert.equal(f.calls.some(c=>c.path.includes('/confirm/')),false);
});
test('preview failure is not a possible commit, while confirmation failure is unconfirmed and conflict stays explicit',async()=>{
 const f=await fixture();f.mode('500');await assert.rejects(f.controller.previewStockLaunch(values),e=>e instanceof AxiosError&&!(e instanceof InventorySaveUnconfirmed));await assert.rejects(f.controller.confirmStockLaunch(values,preview()),InventorySaveUnconfirmed);f.mode('409');await assert.rejects(f.controller.confirmStockLaunch(values,preview()),e=>e instanceof AxiosError&&e.response?.status===409);
});
test('stock launch catalogs cover every language and location',()=>{for(const copy of Object.values(launchMessages)){assert.deepEqual(Object.keys(copy).sort(),Object.keys(launchMessages['pt-BR']).sort());assert.deepEqual(Object.keys(copy.locations).sort(),Object.keys(launchMessages['pt-BR'].locations).sort());}});
