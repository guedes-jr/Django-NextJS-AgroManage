import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,FeedingSaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {canReadDailyFeeding,canWriteDailyFeeding,feedingDraftSchema,feedingCommand,feedingPayload,feedingBatchSchema,feedingCommandSchema,feedingReceiptSchema,type FeedingQuery} from '../src/features/feeding/contracts';
import {feedingMessages} from '../src/features/feeding/messages';
const id='00000000-0000-4000-8000-000000000001',item='00000000-0000-4000-8000-000000000002',farm='00000000-0000-4000-8000-000000000003',key='00000000-0000-4000-8000-000000000004';
const user=userSchema.parse({id,full_name:'Tratador',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'feeder',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const batch=feedingBatchSchema.parse({id,batch_code:'B1',name:'',farm,farm_name:'Fazenda A',production:'beef',head_count:10,supplied_kg:'0.00'});
const command=feedingCommand(batch,'beef','2026-11-07',{quantity_kg:'5,25',notes:' Trato '},{id:item,name:'Ração',unit:'kg'},key);
const query:FeedingQuery={resource:'batches',production:'beef',page:1,search:''};
async function fixture(actor=user){
 const calls:{path:string;method:string;body:unknown;params:unknown}[]=[];let mode:'ok'|'500'|'400'|'invalid'='ok',date='2026-11-07',effects=0;const commits=new Map();let preflight:(()=>Promise<void>)|undefined;let hold:(()=>Promise<void>)|undefined;
 const adapter:AxiosAdapter=async config=>{const path=config.url!,body=config.data?JSON.parse(config.data):undefined;if(path==='auth/me/')await preflight?.();calls.push({path,method:config.method!,body,params:config.params});let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?actor:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
  if(path==='livestock/cattle/daily-feeding/'){
   if(config.method==='get')data={date,timezone:'America/Fortaleza',count:1,next:null,previous:null,results:[batch]};
   else{await hold?.();if(mode==='400')throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:400,statusText:'error',headers:{}});
    if(!commits.has(body.request_key)){effects++;commits.set(body.request_key,{id,date:body.date,quantity_kg:Number(body.quantity_kg)});}
    if(mode==='500')throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:500,statusText:'error',headers:{}});
    data=mode==='invalid'?{}:commits.get(body.request_key);
   }
  }return {config,data,status:200,statusText:'OK',headers:{}};
 };
 const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,calls,mode:(v:typeof mode)=>{mode=v;},day:(v:string)=>{date=v;},effects:()=>effects,preflight:(v:()=>Promise<void>)=>{preflight=v;},hold:(v:()=>Promise<void>)=>{hold=v;}};
}
test('daily feeding keeps kg precision, stable key and distinct formula/final product',()=>{
 assert.equal(command.quantity_kg,'5.25');assert.equal(command.notes,'Trato');assert.equal(command.request_key,key);assert.equal(command.formula,null);
 const recipe=feedingCommand(batch,'beef','2026-11-07',{quantity_kg:'5',notes:''},{id:key,name:'Fórmula',item,item_name:'Ração'},key);assert.equal(recipe.item,item);assert.equal(recipe.formula,key);
 for(const quantity_kg of ['0','-1','1.001','NaN','100000000'])assert.equal(feedingDraftSchema.safeParse({quantity_kg,notes:''}).success,false);
 assert.throws(()=>feedingCommand(batch,'dairy','2026-11-07',{quantity_kg:'5',notes:''},{id:item,name:'Ração',unit:'kg'},key));
 assert.equal(feedingCommandSchema.safeParse({...command,date:'2026-02-30'}).success,false);assert.equal('custo' in feedingPayload({...command,custo:'injected'} as typeof command),false);
});
test('daily feeding permits feeder and authorized read-only operator without broadening write roles',()=>{
 assert.equal(canReadDailyFeeding(user),true);assert.equal(canWriteDailyFeeding(user),true);
 const op={...user,access:{...user.access,role:'operator' as const}};assert.equal(canReadDailyFeeding(op),true);assert.equal(canWriteDailyFeeding(op),false);
 for(const change of [{...user,force_password_change:true},{...user,is_platform_staff:true},{...user,access:{...user.access,livestock_species:[]}}])assert.equal(canReadDailyFeeding(change),false);
 assert.equal(canWriteDailyFeeding({...user,access:{...user.access,read_only:true}}),false);
});
test('daily feeding uses its paginated operational endpoint and fixed scoped queries',async()=>{
 const f=await fixture();await f.controller.dailyFeeding(query);assert.equal(f.calls.at(-1)?.path,'livestock/cattle/daily-feeding/');assert.deepEqual(f.calls.at(-1)?.params,{...query,view:'mobile',page_size:20});
 await assert.rejects(f.controller.dailyFeeding({...query,farm:item}));assert.equal(f.calls.some(c=>c.path.startsWith('inventory/')),false);
});
test('delivery checks the fresh batch/day and sends only its reviewed intention',async()=>{
 const f=await fixture();assert.deepEqual(await f.controller.saveDailyFeeding(command),{id,date:command.date,quantity_kg:'5.25'});assert.deepEqual(f.calls.at(-1)?.body,feedingPayload(command));assert.equal(f.effects(),1);
 f.day('2026-11-08');await assert.rejects(f.controller.saveDailyFeeding({...command,request_key:item}));assert.equal(f.effects(),1);
});
test('uncertain result is explicitly reconciled using identical payload/key even after day rollover',async()=>{
 const f=await fixture();f.mode('500');await assert.rejects(f.controller.saveDailyFeeding(command),FeedingSaveUnconfirmed);assert.equal(f.effects(),1);const first=f.calls.at(-1)?.body;
 f.mode('ok');f.day('2026-11-08');const count=f.calls.filter(c=>c.method==='get'&&c.path.includes('daily-feeding')).length;
 assert.equal((await f.controller.saveDailyFeeding(command,true)).id,id);assert.deepEqual(f.calls.at(-1)?.body,first);assert.equal(f.effects(),1);assert.equal(f.calls.filter(c=>c.method==='get'&&c.path.includes('daily-feeding')).length,count);
});
test('read-only, operator and lost species permission block mutation; preflight logout and double taps cannot send',async()=>{
 for(const actor of [{...user,access:{...user.access,role:'operator' as const}},{...user,access:{...user.access,read_only:true}},{...user,access:{...user.access,livestock_species:[]}}]){const f=await fixture(actor);await assert.rejects(f.controller.saveDailyFeeding(command));assert.equal(f.effects(),0);}
 const f=await fixture();let release!:()=>void;f.hold(()=>new Promise<void>(resolve=>{release=resolve;}));const pending=f.controller.saveDailyFeeding(command);while(!release)await new Promise(resolve=>setTimeout(resolve,0));await assert.rejects(f.controller.saveDailyFeeding(command));release();await pending;assert.equal(f.effects(),1);
 await f.controller.signOut();await assert.rejects(f.controller.saveDailyFeeding(command,true));assert.equal(f.effects(),1);
 const g=await fixture();let releaseAuth!:()=>void;g.preflight(()=>new Promise<void>(resolve=>{releaseAuth=resolve;}));const preparing=g.controller.saveDailyFeeding(command);while(!releaseAuth)await new Promise(resolve=>setTimeout(resolve,0));await g.controller.signOut();releaseAuth();await assert.rejects(preparing);assert.equal(g.effects(),0);
});
test('known validation and unconfirmed/invalid receipts stay distinct without automatic retries',async()=>{
 const f=await fixture();f.mode('400');await assert.rejects(f.controller.saveDailyFeeding(command),e=>!(e instanceof FeedingSaveUnconfirmed));assert.equal(f.effects(),0);f.mode('invalid');await assert.rejects(f.controller.saveDailyFeeding(command),FeedingSaveUnconfirmed);assert.equal(f.effects(),1);assert.equal(f.calls.filter(c=>c.path.includes('daily-feeding')&&c.method==='post').length,2);
 assert.equal(feedingReceiptSchema.parse({id,date:'2026-11-07',quantity_kg:5.25}).quantity_kg,'5.25');
});
test('daily feeding messages cover every organization language',()=>{for(const language of ['pt-BR','en','es','pt-PT'] as const){assert.deepEqual(Object.keys(feedingMessages[language]).sort(),Object.keys(feedingMessages['pt-BR']).sort());assert.ok(Object.values(feedingMessages[language]).every(text=>text.length>0));}});
