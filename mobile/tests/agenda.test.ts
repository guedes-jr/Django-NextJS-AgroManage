import { test } from 'node:test';
import assert from 'node:assert/strict';
import { create, AxiosError, type AxiosAdapter } from 'axios';
import { agendaQuerySchema, agendaListingQuery, agendaPageSchema, canReadAgenda, shiftDay, safeAgendaSource, type AgendaTask } from '../src/features/agenda/contracts';
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
const taskRecord={...taskInput,id,farm:null,assigned_to:id,created_by:id,operational_link:null,assigned_to_name:'Teste',created_by_name:'Teste'};
function writingFixture(actor=user, record:AgendaTask=taskRecord, delayOptions?:()=>Promise<void>,receiptChange:Partial<AgendaTask>={}) {
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
    if(['post','patch'].includes(config.method??'')&&path?.startsWith('tasks/')){const body=JSON.parse(config.data);writes.push({method:config.method,body});data={...record,...body,...receiptChange};}
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

test('calendar day pagination queries the selected day beyond the first period page', async()=>{
 const selected='2026-11-28';const event={id:'task:'+id,source_id:id,date:selected,title:'Late month activity',domain:'tasks',species:'',farm_name:'Farm',kind:'task',status:'pending',source_url:null,estimated:false};
 const adapter:AxiosAdapter=async config=>{
  const p=config.params;assert.equal(p.farm,id);assert.equal(p.include_recorded,true);assert.equal(p.domain,'tasks');
  const daily=p.start===selected&&p.end===selected;
  return {data:daily?{count:26,next:p.page===1?'untrusted-next':null,previous:p.page===2?'untrusted-previous':null,results:[event]}:{count:60,next:'untrusted-next',previous:null,results:[]},status:200,statusText:'OK',headers:{},config};
 };
 const api=createAuthApi('https://example.com/api/v1/',create({adapter}));
 const period=agendaQuerySchema.parse({start:'2026-11-01',end:'2026-11-30',farm:id,domain:'tasks',include_recorded:true});
 for(const mode of ['month','week'] as const){
  const first=await api.agenda({access:'fake',refresh:'fake'},'en',agendaListingQuery(period,mode,selected));assert.equal(first.count,26);assert.equal(first.results[0]?.date,selected);assert.ok(first.next);
  const second=await api.agenda({access:'fake',refresh:'fake'},'en',agendaListingQuery({...period,page:2},mode,selected));assert.equal(second.count,26);assert.equal(second.next,null);assert.ok(second.previous);
 }
 const list=agendaListingQuery(period,'list',selected);assert.equal(list.start,period.start);assert.equal(list.end,period.end);
 assert.throws(()=>agendaListingQuery(period,'month','2026-02-30'));
});

test('return selection preserves calendar context but cannot select a different farm',async()=>{
 const {restoreAgendaSelection}=await import('../src/features/agenda/selection');
 const selection={date:'2026-11-28',mode:'week',domain:'livestock',recorded:true,farm:id,page:3,offset:410};
 assert.deepEqual(restoreAgendaSelection(selection,id,'2026-11-13'),selection);
 for(const invalid of [null,{...selection,page:0},{...selection,offset:Infinity},{...selection,date:'2026-02-30'}])assert.equal(restoreAgendaSelection(invalid,id,'2026-11-13').page,1);
 const changed=restoreAgendaSelection(selection,null,'2026-11-13');assert.equal(changed.farm,null);assert.equal(changed.offset,0);assert.equal(changed.date,'2026-11-13');
});

test('detail lookup finds moved events and distinguishes removed resources from failed or cancelled reads',async()=>{
 const {findAgendaEvent}=await import('../src/features/agenda/findEvent');
 const event={id:'event:1',source_id:id,date:query.start,title:'Activity',domain:'livestock',species:'bovinos',farm_name:'Farm',kind:'event',status:'planned',source_url:null,estimated:true};
 const pages:number[]=[];
 const scope={...query,page:2,farm:id,domain:'livestock' as const,include_recorded:true};
 const found=await findAgendaEvent(scope,event.id,async q=>{pages.push(q.page);assert.equal(q.farm,id);assert.equal(q.include_recorded,true);assert.equal(q.start,scope.start);assert.equal(q.domain,'livestock');return {...empty,count:26,results:q.page===1?[event]:[]};});
 assert.equal(found?.id,event.id);assert.deepEqual(pages,[2,1]);
 assert.equal(await findAgendaEvent(query,event.id,async()=>empty),null);
 await assert.rejects(findAgendaEvent(query,event.id,async()=>{throw new Error('offline');}));
 const abort=new AbortController();abort.abort();let calls=0;await assert.rejects(findAgendaEvent(query,event.id,async()=>{calls++;return empty;},abort.signal));assert.equal(calls,0);
 await assert.rejects(findAgendaEvent(query,event.id,async()=>({...empty,next:'untrusted-next'})),/lookup limit/);
});

test('native origins use exact record identity, verified farm and existing read permissions',async()=>{
 const {nativeAgendaOrigin}=await import('../src/features/agenda/origin');
 const event={id:`vaccination:${id}`,source_id:id,date:query.start,title:'Next dose',domain:'livestock',species:'bovinos',farm:id,farm_name:'Farm',kind:'vaccination',status:'planned',source_url:'/home/seguimento/pecuaria-leiteira/sanidade',estimated:false};
 const operator={...user,access:{...user.access,read_only:true}};
 assert.deepEqual(nativeAgendaOrigin(event,operator,id),{pathname:'/clinic/detail',params:{id,kind:'vaccinations',farm:id}});
 const manager={...user,access:{...user.access,role:'manager' as const}};
 const sanitary={...event,id:`sanitary:${id}`,kind:'sanitary',source_url:'/home/seguimento/pecuaria-leiteira/manejos'};
 assert.deepEqual(nativeAgendaOrigin(sanitary,manager,null),{pathname:'/cattle/[production]/management-detail',params:{id,farm:id,production:'dairy'}});
 assert.equal(nativeAgendaOrigin(sanitary,operator,id),null);
 for(const change of [{farm:undefined},{farm:null},{id:`vaccination:wrong`},{source_id:'bad'},{species:'suinos'},{source_url:'https://example.com/steal'},{kind:'nutrition'},{domain:'crops'}])assert.equal(nativeAgendaOrigin({...event,...change},manager,id),null);
 assert.equal(nativeAgendaOrigin(event,manager,'00000000-0000-4000-8000-000000000002'),null);
 for(const actor of [{...manager,force_password_change:true},{...manager,is_platform_staff:true},{...manager,access:{...manager.access,role:'feeder' as const}},{...operator,access:{...operator.access,livestock_species:['suinos']}}])assert.equal(nativeAgendaOrigin(event,actor,id),null);
 const swine={...event,species:'suinos',source_url:'/home/seguimento/suinos'};
 assert.equal(nativeAgendaOrigin(swine,manager,null)?.pathname,'/clinic/detail');
 assert.equal(nativeAgendaOrigin(swine,operator,null),null);
 assert.equal(nativeAgendaOrigin({...event,id:`vaccine_record:${id}`,kind:'vaccine_record'},manager,id)?.params.id,id);
});

test('task writes stop when selection changes during preflight or the saved farm changes',async()=>{
 const {AuthFailure}=await import('../src/services/authApi');
 let changed=false;const f=writingFixture(user,taskRecord,async()=>{changed=true;});await f.controller.signIn('test@example.com','password');
 await assert.rejects(f.controller.saveAgendaTask(taskInput,undefined,{farm:null,assertCurrent:()=>{if(changed)throw new AuthFailure('unsupported');}}));assert.equal(f.writes.length,0);
 const edit=writingFixture(user,{...taskRecord,farm:id});await edit.controller.signIn('test@example.com','password');
 await assert.rejects(edit.controller.saveAgendaTask(taskInput,id,{farm:null,taskFarm:null,assertCurrent:()=>{}}));assert.equal(edit.writes.length,0);
 await assert.rejects(edit.controller.saveAgendaTask({...taskInput,farm:null},id));assert.equal(edit.writes.length,0);
 await edit.controller.saveAgendaTask(taskInput,id,{farm:id,taskFarm:id,assertCurrent:()=>{}});assert.equal(edit.writes.length,1);assert.equal('farm' in edit.writes[0]!.body,false);
 const creation=writingFixture();await creation.controller.signIn('test@example.com','password');await assert.rejects(creation.controller.saveAgendaTask({...taskInput,farm:id},undefined,{farm:null,assertCurrent:()=>{}}));assert.equal(creation.writes.length,0);
});

test('task identity reads and mutation confirmations reject inconsistent receipts',async()=>{
 const {AuthFailure}=await import('../src/services/authApi');const tokens={access:'fake',refresh:'fake'};let writes=0;let change:Record<string,unknown>={id:'00000000-0000-4000-8000-000000000002'};
 const adapter:AxiosAdapter=async config=>{if(config.method==='post'||config.method==='patch')writes++;return {data:{...taskRecord,...change},status:200,statusText:'OK',headers:{},config};};
 const api=createAuthApi('https://example.com/api/v1/',create({adapter}));await assert.rejects(api.agendaTask(tokens,'en',id));assert.equal(writes,0);
 for(const body of [{status:'done'},{title:'Different'},{due_date:'2026-11-08'},{farm:id},{assigned_to:null}]){change=body;await assert.rejects(api.saveAgendaTask(tokens,'en',taskInput,undefined,id),error=>!(error instanceof AuthFailure));}
 change={id:'00000000-0000-4000-8000-000000000002'};await assert.rejects(api.saveAgendaTask(tokens,'en',taskInput,id,id));
 assert.equal(writes,6);
});

test('a changed farm in a correction receipt remains an uncertain result after mutation',async()=>{
 const {AuthFailure}=await import('../src/services/authApi');
 const f=writingFixture(user,taskRecord,undefined,{farm:id});await f.controller.signIn('test@example.com','password');
 await assert.rejects(f.controller.saveAgendaTask(taskInput,id),error=>!(error instanceof AuthFailure));assert.equal(f.writes.length,1);
});
