import { test } from 'node:test';
import assert from 'node:assert/strict';
import { create, AxiosError, type AxiosAdapter } from 'axios';
import { agendaQuerySchema, agendaPageSchema, canReadAgenda, shiftDay, safeAgendaSource, type AgendaTask } from '../src/features/agenda/contracts';
import { agendaMessages } from '../src/features/agenda/messages';
import { createAuthApi } from '../src/services/authApi';
import { SessionController } from '../src/features/auth/sessionController';
import { userSchema } from '../src/features/auth/contracts';
const id='00000000-0000-4000-8000-000000000001';
const user=userSchema.parse({id,full_name:'Teste',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'operator',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const query=agendaQuerySchema.parse({start:'2026-11-07',end:'2026-11-07'});
const empty={count:0,results:[],next:null,previous:null};
function fixture(agenda:()=>Promise<unknown>=async()=>empty, actor=user) {
  const calls:string[]=[];
  const adapter:AxiosAdapter=async config=>{
    calls.push(config.url!);
    const payload:Record<string,unknown>={'auth/login/':{access:'fake-access',refresh:'fake-refresh'},'auth/me/':actor,'organizations/me/':{id:'org',name:'Teste',language:'es'},'auth/logout/':{}};
    return {data:config.url==='tasks/agenda/'?await agenda():payload[config.url!],status:200,statusText:'OK',headers:{},config};
  };
  const api=createAuthApi('https://example.com/api/v1/',create({adapter}));
  const controller=new SessionController(api,{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');
  return {controller,calls};
}
test('agenda validates real calendar days, bounded intervals and pages',()=>{
  for(const value of [{start:'2026-02-30'}, {end:'2026-11-06'},{end:'2027-01-01'},{page:0},{page:'https://evil.test'}]) assert.equal(agendaQuerySchema.safeParse({...query,...value}).success,false);
  assert.equal(shiftDay('2026-12-31',1),'2027-01-01');
  assert.equal(shiftDay('2028-03-01',-1),'2028-02-29');
  assert.equal(agendaPageSchema.safeParse({...empty,results:[{id:'incomplete'}]}).success,false);
});
test('feeder and forced password change cannot request agenda; read-only may consult',async()=>{
  for(const actor of [{...user,access:{...user.access,role:'feeder' as const}},{...user,force_password_change:true}]){
    assert.equal(canReadAgenda(actor),false);const f=fixture(undefined,actor);await f.controller.signIn('test@example.com','password');
    await assert.rejects(f.controller.agenda(query));assert.equal(f.calls.includes('tasks/agenda/'),false);
  }
  const f=fixture(undefined,{...user,access:{...user.access,read_only:true}});await f.controller.signIn('test@example.com','password');assert.deepEqual(await f.controller.agenda(query),empty);
});
test('late agenda response is discarded after logout',async()=>{
  let resolve!:(value:unknown)=>void;const pending=new Promise(done=>{resolve=done;});const f=fixture(()=>pending);
  await f.controller.signIn('test@example.com','password');const request=f.controller.agenda(query);await f.controller.signOut();resolve(empty);await assert.rejects(request,/expired/);
});
test('agenda expiry ends local access',async()=>{
  const f=fixture(async()=>{throw new AxiosError('expired','ERR_BAD_REQUEST',undefined,undefined,{status:401} as never);});await f.controller.signIn('test@example.com','password');await assert.rejects(f.controller.agenda(query));assert.equal(f.controller.getSnapshot().status,'signedOut');
});
test('agenda client keeps locale, bearer, filters and numeric page without following returned links',async()=>{
  const requests:unknown[]=[];
  const adapter:AxiosAdapter=async config=>{requests.push({url:config.url,params:config.params,auth:config.headers.Authorization,locale:config.headers['Accept-Language']});return {data:empty,status:200,statusText:'OK',headers:{},config};};
  const api=createAuthApi('https://example.com/api/v1/',create({adapter}));await api.agenda({access:'fake',refresh:'fake'},'es',{...query,page:2,domain:'tasks',include_recorded:true});
  assert.deepEqual(requests,[{url:'tasks/agenda/',params:{...query,page:2,domain:'tasks',include_recorded:true,page_size:25},auth:'Bearer fake',locale:'es'}]);
  await assert.rejects(api.agendaTask({access:'fake',refresh:'fake'},'es','../../auth/me'));assert.equal(requests.length,1);
});
test('source links accept only authorized tenant destinations',()=>{
  for(const path of ['https://evil.test','//evil.test','/home/financeiro','/home/seguimento/gado-de-corte/operacoes?tab=protocols&redirect=evil','/home/seguimento/suinos/reproducao',`/home/plantacoes/${id}`])assert.equal(safeAgendaSource(path,user),null);
  assert.equal(safeAgendaSource('/home/seguimento/suinos',{...user,access:{...user.access,livestock_species:['suinos']}}),'/home/seguimento/suinos');
  const source='/home/seguimento/pecuaria-leiteira/operacoes?tab=protocols';assert.equal(safeAgendaSource(source,user),source);
  assert.equal(safeAgendaSource(`/home/plantacoes/${id}`,{...user,access:{...user.access,can_operate_crops:true}}),`/home/plantacoes/${id}`);
});
test('all agenda languages cover the same messages',()=>{
  for(const catalog of Object.values(agendaMessages))assert.deepEqual(Object.keys(catalog).sort(),Object.keys(agendaMessages['pt-BR']).sort());
});

const taskInput={title:'Visita técnica',description:'Conferir curral',due_date:'2026-11-07',event_kind:'appointment' as const,start_time:'09:00',end_time:'10:00',location:'Curral',priority:'high' as const,status:'open' as const};
const taskRecord={...taskInput,id,assigned_to:id,created_by:id,operational_link:null,assigned_to_name:'Teste',created_by_name:'Teste'};
function writingFixture(actor=user, record:AgendaTask=taskRecord, delayOptions?:()=>Promise<void>) {
  const writes:{method:string|undefined;body:Record<string,unknown>}[]=[];
  let optionsReadOnly=false;
  const adapter:AxiosAdapter=async config=>{
    const path=config.url;
    let data:unknown={};
    if(path==='auth/login/')data={access:'fake',refresh:'fake'};
    if(path==='auth/me/')data=actor;
    if(path==='organizations/me/')data={id:'org',name:'Teste',language:'pt-BR'};
    if(path==='tasks/agenda-options/'){await delayOptions?.();data={user_id:actor.id,role:actor.access.role,read_only:optionsReadOnly,timezone:'America/Fortaleza'};}
    if(path===`tasks/${id}/`)data=record;
    if(['post','patch'].includes(config.method??'')&&path?.startsWith('tasks/')){const body=JSON.parse(config.data);writes.push({method:config.method,body});data={...record,...body};}
    return {data,status:200,statusText:'OK',headers:{},config};
  };
  const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');
  return {controller,writes,readOnly:()=>{optionsReadOnly=true;}};
}
test('task input validates times, required date/title and strips permission-bearing fields',async()=>{
  const {taskInputSchema}=await import('../src/features/agenda/contracts');
  for(const change of [{title:''},{due_date:'2026-02-30'},{start_time:'25:00'},{end_time:'08:00'},{start_time:null},{priority:'urgent'}])assert.equal(taskInputSchema.safeParse({...taskInput,...change}).success,false);
  assert.deepEqual(taskInputSchema.parse({...taskInput,organization:'foreign',created_by:'other',assigned_to:'other'}),taskInput);
});
test('task creation assigns current user and editing preserves unrelated fields',async()=>{
  const f=writingFixture();await f.controller.signIn('test@example.com','password');await f.controller.saveAgendaTask(taskInput);
  assert.deepEqual(f.writes,[{method:'post',body:{...taskInput,assigned_to:id}}]);
  await f.controller.saveAgendaTask({...taskInput,title:'Editada'},id);
  assert.equal(f.writes[1]?.method,'patch');assert.equal(f.writes[1]?.body.title,'Editada');assert.equal('assigned_to' in f.writes[1]!.body,false);assert.equal('farm' in f.writes[1]!.body,false);assert.equal('whatsapp_remind_at' in f.writes[1]!.body,false);
});
test('operator may change only status of a task created by someone else',async()=>{
  const f=writingFixture(user,{...taskRecord,created_by:'00000000-0000-4000-8000-000000000002'});await f.controller.signIn('test@example.com','password');
  await assert.rejects(f.controller.saveAgendaTask(taskInput,id));assert.equal(f.writes.length,0);
  await f.controller.saveAgendaTask({status:'done'},id);assert.deepEqual(f.writes,[{method:'patch',body:{status:'done'}}]);
});
test('readonly, closed operator tasks and operational origins cannot be mutated',async()=>{
  for(const record of [{...taskRecord,status:'done' as const},{...taskRecord,operational_link:'/home/seguimento/gado-de-corte/operacoes'}]){
    const f=writingFixture(user,record);await f.controller.signIn('test@example.com','password');await assert.rejects(f.controller.saveAgendaTask(taskInput,id));assert.equal(f.writes.length,0);
  }
  const f=writingFixture();await f.controller.signIn('test@example.com','password');f.readOnly();await assert.rejects(f.controller.saveAgendaTask(taskInput));assert.equal(f.writes.length,0);
});
test('logout during write preflight prevents mutation and simultaneous submissions are blocked',async()=>{
  let resolve!:()=>void;const gate=new Promise<void>(done=>{resolve=done;});const f=writingFixture(user,taskRecord,()=>gate);
  await f.controller.signIn('test@example.com','password');const save=f.controller.saveAgendaTask(taskInput);await assert.rejects(f.controller.saveAgendaTask(taskInput));await f.controller.signOut();resolve();await assert.rejects(save);assert.equal(f.writes.length,0);
});
test('form translations are complete',async()=>{
  const {taskFormMessages}=await import('../src/features/agenda/formMessages');for(const copy of Object.values(taskFormMessages))assert.deepEqual(Object.keys(copy).sort(),Object.keys(taskFormMessages['pt-BR']).sort());
});
