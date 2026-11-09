import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,NotificationSaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {canReadNotifications,notificationQuerySchema,notificationSchema,notificationOrigin,preferencesSchema,preferencesPatch,preferenceFields,type NotificationQuery} from '../src/features/notifications/contracts';
import {notificationMessages} from '../src/features/notifications/messages';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const user=userSchema.parse({id,full_name:'Gestor',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'manager',can_manage_users:true,can_view_financial:true,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const row=notificationSchema.parse({id,type:'system',category:'system',priority:'medium',title:'Aviso',message:'Mensagem',link:'/home/agenda',is_read:false,read_at:null,occurrence_count:1,last_occurred_at:null,is_archived:false,created_at:'2026-11-07T12:00:00Z',group_items:[],promotion:null});
const preferences=preferencesSchema.parse({id,marketing_alerts:false,stock_alerts:true,animal_alerts:true,financial_alerts:true,report_alerts:true,email_notifications:true,push_notifications:true,whatsapp_reproductive_alerts:false,frequency:'instant',updated_at:'2026-11-07T12:00:00Z'});
const query:NotificationQuery={page:1,archived:false,status:'all',category:'',search:''};
async function fixture(actor=user){const calls:{path:string;body:unknown;params:unknown;method:string}[]=[];let current={...row},record={...preferences},mode:'ok'|'409'|'500'|'invalid'='ok';let hold:(()=>Promise<void>)|undefined;
 const adapter:AxiosAdapter=async config=>{const path=config.url!,body=config.data?JSON.parse(config.data):undefined;calls.push({path,body,params:config.params,method:config.method!});if(path==='auth/me/')await hold?.();let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?actor:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
  if(path==='notifications/')data={count:1,results:[current],next:null,previous:null};if(path==='notifications/unread-count/')data={unread_count:current.is_read||current.is_archived?0:1};
  if(path===`notifications/${id}/`){if(config.method==='patch')current={...current,is_read:true,read_at:'2026-11-07T13:00:00Z'};data=current;}
  if(path===`notifications/${id}/archive/`){current={...current,is_archived:true};data=current;}if(path===`notifications/${id}/unarchive/`){current={...current,is_archived:false};data=current;}
  if(path==='notifications/preferences/'){if(config.method==='patch'){if(mode==='409'||mode==='500')throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:Number(mode),statusText:'error',headers:{}});const {expected_updated_at,...values}=body;assert.equal(expected_updated_at,preferences.updated_at);record={...record,...values,updated_at:'2026-11-07T13:00:00Z'};}data=mode==='invalid'?{}:record;}
  return {config,data,status:200,statusText:'OK',headers:{}};};
 const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,calls,mode:(v:typeof mode)=>{mode=v;},hold:(v:()=>Promise<void>)=>{hold=v;}};
}
test('notification query bounds filters/pages and personal access includes read-only feeder',()=>{
 assert.equal(notificationQuerySchema.safeParse({...query,page:0}).success,false);assert.equal(notificationQuerySchema.safeParse({...query,category:'unknown'}).success,false);assert.equal(notificationQuerySchema.safeParse({...query,search:'x'.repeat(101)}).success,false);
 const feeder={...user,access:{...user.access,role:'feeder' as const,can_view_financial:false,read_only:true}};assert.equal(canReadNotifications(feeder),true);assert.equal(preferenceFields(feeder).includes('financial_alerts'),false);assert.equal(preferenceFields(feeder).includes('stock_alerts'),false);
 assert.equal(canReadNotifications({...user,force_password_change:true}),false);
});
test('notification origins allow only recognized authorized tenant destinations',()=>{
 assert.deepEqual(notificationOrigin('/home/clinico',user),{path:'/home/clinico'});assert.deepEqual(notificationOrigin('/home/agenda',user),{path:'/home/agenda'});assert.deepEqual(notificationOrigin('/home/seguimento/pecuaria-leiteira/racao/tratos',user),{path:'/home/seguimento/pecuaria-leiteira/racao/tratos',production:'dairy'});
 for(const link of ['https://evil.invalid/home/agenda','//evil.invalid','/home/agenda?next=https://evil.invalid','/home/../platform','/home/agenda#x','/home/%61genda','/home\\agenda'])assert.equal(notificationOrigin(link,user),null);
 const feeder={...user,access:{...user.access,role:'feeder' as const}};assert.equal(notificationOrigin('/home/agenda',feeder),null);assert.equal(notificationOrigin('/home/estoque/produtos',feeder),null);assert.equal(notificationOrigin('/home/seguimento/gado-de-corte/racao/tratos',feeder)?.production,'beef');
 const operator={...user,access:{...user.access,role:'operator' as const}};assert.equal(notificationOrigin('/home/seguimento/suinos/reproducao?tab=maternidade',operator),null);
});
test('preferences save only changed allowed fields plus the reviewed version',()=>{
 const patch=preferencesPatch({...preferences,email_notifications:false,injected:'secret'} as typeof preferences,preferences);assert.deepEqual(patch,{email_notifications:false,expected_updated_at:preferences.updated_at});
 assert.equal(preferencesSchema.safeParse({...preferences,frequency:'never'}).success,false);
});
test('notification API uses fixed personal endpoints, pagination and state-only mutations',async()=>{
 const f=await fixture();await f.controller.notifications(query);assert.equal(f.calls.at(-1)?.path,'notifications/');assert.equal((f.calls.at(-1)?.params as {page_size:number}).page_size,20);
 await f.controller.notification(id,false);assert.deepEqual(f.calls.at(-1)?.params,{archived:false});assert.equal((await f.controller.notificationCount()).unread_count,1);
 const read=await f.controller.changeNotification(id,false,'read');assert.equal(read.is_read,true);assert.deepEqual(f.calls.at(-1)?.body,{is_read:true});assert.equal((await f.controller.notificationCount()).unread_count,0);
 assert.equal((await f.controller.changeNotification(id,false,'archive')).is_archived,true);assert.equal((await f.controller.changeNotification(id,true,'restore')).is_archived,false);
});
test('preferences fresh authorization blocks unauthorized fields and version conflict is distinct from uncertainty',async()=>{
 const f=await fixture();await f.controller.saveNotificationPreferences({...preferences,marketing_alerts:true},preferences);assert.deepEqual(f.calls.at(-1)?.body,{marketing_alerts:true,expected_updated_at:preferences.updated_at});
 f.mode('409');await assert.rejects(f.controller.saveNotificationPreferences({...preferences,marketing_alerts:true},preferences),e=>!(e instanceof NotificationSaveUnconfirmed));f.mode('500');await assert.rejects(f.controller.saveNotificationPreferences({...preferences,marketing_alerts:true},preferences),NotificationSaveUnconfirmed);f.mode('invalid');await assert.rejects(f.controller.saveNotificationPreferences({...preferences,marketing_alerts:true},preferences),NotificationSaveUnconfirmed);
 const feeder=await fixture({...user,access:{...user.access,role:'feeder' as const,read_only:true}});await assert.rejects(feeder.controller.saveNotificationPreferences({...preferences,stock_alerts:false},preferences));assert.equal(feeder.calls.some(c=>c.method==='patch'),false);await feeder.controller.saveNotificationPreferences({...preferences,email_notifications:false},preferences);
});
test('notification writes are single flight and logout during preflight cannot change account data',async()=>{
 const f=await fixture();let release!:()=>void;f.hold(()=>new Promise<void>(resolve=>{release=resolve;}));const pending=f.controller.changeNotification(id,false,'read');while(!release)await new Promise(resolve=>setTimeout(resolve,0));await assert.rejects(f.controller.changeNotification(id,false,'archive'));await f.controller.signOut();release();await assert.rejects(pending);assert.equal(f.calls.some(c=>c.method==='patch'),false);await assert.rejects(f.controller.notification(other,false));
});
test('notification translations cover all supported languages and categories',()=>{for(const language of ['pt-BR','en','es','pt-PT'] as const){assert.deepEqual(Object.keys(notificationMessages[language]).sort(),Object.keys(notificationMessages['pt-BR']).sort());assert.deepEqual(Object.keys(notificationMessages[language].categories).sort(),Object.keys(notificationMessages['pt-BR'].categories).sort());}});
