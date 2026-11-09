import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,InventorySaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {formulaInputSchema,formulaPayload,productionInputSchema,productionPayload,previewSchema,sameProduction,formulaSchema,type FormulaInput,type ProductionInput} from '../src/features/feed/contracts';
import {feedMessages} from '../src/features/feed/messages';
const id='00000000-0000-4000-8000-000000000001',item='00000000-0000-4000-8000-000000000002',lot='00000000-0000-4000-8000-000000000003';
const user=userSchema.parse({id,full_name:'Gestor',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'manager',can_manage_users:true,can_view_financial:false,can_operate_crops:false,livestock_species:[],read_only:false}});
const formulaInput:FormulaInput={nome:'Mistura',descricao:'',especie_animal:'bovino',item_final:id,ingredientes:[{item,percentual:'100'}]};
const production:ProductionInput={formula:id,quantidade_teorica:'10,01',quantidade_real:'9,50'};
const formula=formulaSchema.parse({id,nome:'Mistura',descricao:'',especie_animal:'bovino',item_final:id,item_final_nome:'Ração',ativa:true,updated_at:'2026-11-07T12:00:00Z',ingredientes:[{item,item_nome:'Milho',unidade:'kg',ativo:true,percentual:'100.00'}]});
const review=previewSchema.parse({preview_token:'synthetic',formula:id,nome:'Mistura',item_final:id,item_final_nome:'Ração',quantidade_teorica:'10.01',quantidade_real:'9.50',saldo_final_anterior:'0.00',saldo_final_posterior:'9.50',ingredientes:[{item,nome:'Milho',percentual:'100.00',quantidade:'10.01',disponivel:'100.00',lotes:[{id:lot,numero:'A',quantidade:'10.01'}]}]});
async function fixture(actor=user){
 const calls:{path:string;body:unknown}[]=[];let mode:'ok'|'409'|'500'|'invalid'='ok';let hold:(()=>Promise<void>)|undefined;
 const adapter:AxiosAdapter=async config=>{const path=config.url!;calls.push({path,body:config.data?JSON.parse(config.data):undefined});let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?actor:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:path==='inventory/items/choices/'?{categorias:[{value:'racao',label:'Ração'}],unidades:[{value:'kg',label:'kg'}],especies:[{value:'bovino',label:'Bovino'}],tipos_contrato:[{value:'spot',label:'Spot'}]}:{};
  if(path.endsWith('mobile-preview/')||path.endsWith('mobile-confirm/')||path.endsWith('mobile-save/')){
   await hold?.();if(mode==='409'||mode==='500')throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:Number(mode),statusText:'error',headers:{}});
   data=mode==='invalid'?{}:path.endsWith('mobile-preview/')?review:path.endsWith('mobile-confirm/')?{id,lote:lot}:{id};
  }
  if(path===`inventory/formulas/${id}/mobile/`)data=formula;
  if(path==='inventory/formulas/mobile/')data={count:1,next:null,previous:null,results:[formula]};
  return {config,data,status:200,statusText:'OK',headers:{}};
 };
 const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,calls,mode:(v:typeof mode)=>{mode=v;},hold:(v:()=>Promise<void>)=>{hold=v;}};
}
test('feed formula validates exact percentages, duplicates, final-product cycles and positive precision',()=>{
 assert.equal(formulaInputSchema.safeParse(formulaInput).success,true);
 for(const ingredients of [[],[{item,percentual:'99.99'}],[{item,percentual:'50'},{item,percentual:'50'}],[{item:id,percentual:'100'}],[{item,percentual:'100.001'}]])assert.equal(formulaInputSchema.safeParse({...formulaInput,ingredientes:ingredients}).success,false);
 assert.equal(formulaInputSchema.safeParse({...formulaInput,ingredientes:[{item,percentual:'33,33'},{item:lot,percentual:'66,67'}]}).success,true);
 for(const value of ['0','-1','NaN','1.001','100000000'])assert.equal(productionInputSchema.safeParse({...production,quantidade_teorica:value}).success,false);
});
test('feed payloads whitelist data, preserve formula versions and bind reviewed quantities',()=>{
 assert.deepEqual(productionPayload(production),{formula:id,quantidade_teorica:'10.01',quantidade_real:'9.50'});
 const value=formulaPayload({...formulaInput,custo_total:'injected'} as FormulaInput,formula);assert.equal('custo_total' in value,false);assert.equal(value.expected_updated_at,formula.updated_at);
 assert.equal(sameProduction(production,review),true);assert.equal(sameProduction({...production,quantidade_real:'9.51'},review),false);assert.equal(sameProduction({...production,formula:lot},review),false);
});
test('feed reads use operational endpoints and strict scoped contracts',async()=>{
 const f=await fixture();assert.equal((await f.controller.feedPage('formulas',1)).results.length,1);assert.equal((await f.controller.feedDetail('formulas',id)).id,id);assert.equal(f.calls.at(-1)?.path,`inventory/formulas/${id}/mobile/`);
 assert.equal('custo_total' in review,false);assert.equal('custo_unitario' in review.ingredientes[0]!.lotes[0]!,false);
});
test('formula save and production confirmation send minimal commands, never financial inputs',async()=>{
 const f=await fixture();await f.controller.saveFeedFormula(formulaInput,formula);assert.deepEqual(f.calls.at(-1)?.body,formulaPayload(formulaInput,formula));
 const preview=await f.controller.previewFeed(production);assert.deepEqual(f.calls.at(-1)?.body,productionPayload(production));assert.equal(f.calls.some(c=>c.path.endsWith('mobile-confirm/')),false);
 assert.deepEqual(await f.controller.confirmFeed(production,preview),{id,lote:lot});assert.deepEqual(f.calls.at(-1)?.body,{preview_token:'synthetic'});
 await assert.rejects(f.controller.confirmFeed({...production,quantidade_real:'1'},preview));assert.equal(f.calls.filter(c=>c.path.endsWith('mobile-confirm/')).length,1);
});
test('feed respects roles, read-only status and new session authorization before mutations',async()=>{
 for(const actor of [{...user,access:{...user.access,role:'feeder' as const}},{...user,access:{...user.access,role:'operator' as const}},{...user,access:{...user.access,read_only:true}}]){
  const f=await fixture(actor);await assert.rejects(f.controller.previewFeed(production));await assert.rejects(f.controller.saveFeedFormula(formulaInput));assert.equal(f.calls.some(c=>c.path.endsWith('mobile-preview/')||c.path.endsWith('mobile-save/')),false);
 }
 const f=await fixture();let release!:()=>void;f.hold(()=>new Promise<void>(resolve=>{release=resolve;}));const pending=f.controller.previewFeed(production);while(!release)await new Promise(resolve=>setTimeout(resolve,0));await assert.rejects(f.controller.previewFeed(production));await f.controller.signOut();release();await assert.rejects(pending);assert.equal(f.calls.some(c=>c.path.endsWith('mobile-confirm/')),false);
});
test('feed mutation uncertainty is distinct from failed previews and known conflicts; no retry',async()=>{
 const f=await fixture();f.mode('500');await assert.rejects(f.controller.previewFeed(production),e=>!(e instanceof InventorySaveUnconfirmed));await assert.rejects(f.controller.confirmFeed(production,review),InventorySaveUnconfirmed);await assert.rejects(f.controller.saveFeedFormula(formulaInput),InventorySaveUnconfirmed);
 f.mode('409');await assert.rejects(f.controller.confirmFeed(production,review),e=>!(e instanceof InventorySaveUnconfirmed));f.mode('invalid');await assert.rejects(f.controller.confirmFeed(production,review),InventorySaveUnconfirmed);assert.equal(f.calls.filter(c=>c.path.endsWith('mobile-confirm/')).length,3);
});
test('feed messages cover every supported organization language',()=>{for(const language of ['pt-BR','en','es','pt-PT'] as const){assert.deepEqual(Object.keys(feedMessages[language]).sort(),Object.keys(feedMessages['pt-BR']).sort());assert.ok(Object.values(feedMessages[language]).every(text=>text.length>0));}});
