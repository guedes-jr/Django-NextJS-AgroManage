import assert from 'node:assert/strict';
import { test } from 'node:test';
import { create, type AxiosAdapter } from 'axios';
import { animalSchema, canReadCattle, cattleQuerySchema, ensureCattleScope, matchesProduction } from '../src/features/cattle/contracts';
import { cattleMessages } from '../src/features/cattle/messages';
import { createAuthApi } from '../src/services/authApi';
import { SessionController } from '../src/features/auth/sessionController';
import { userSchema } from '../src/features/auth/contracts';
import { createSessionQueryClient } from '../src/query/sessionQueryClient';
const id='00000000-0000-4000-8000-000000000001';
const user=userSchema.parse({id,full_name:'Teste',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'operator',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const animal={id,identifier:'0007',name:'Mimosa',farm:id,farm_name:'Fazenda',cattle_purpose:'beef',gender:'F',category:'Vaca',status:'active',birth_date:null,entry_date:'2026-11-07',current_weight_kg:'310.250',reproductive_status:'vazia',is_lactating:false,milk_withdrawal_until:null,meat_withdrawal_until:null,notes:''};
const query=cattleQuerySchema.parse({production:'beef',kind:'animals'});
test('cattle response keeps unknown dates and exact decimal text, excluding prices',()=>{
  const result=animalSchema.parse({...animal,purchase_value:'123.45',reproductive_cycles:[{cost:100}]});assert.equal(result.identifier,'0007');assert.equal(result.birth_date,null);assert.equal(result.current_weight_kg,'310.250');assert.equal('purchase_value' in result,false);assert.equal('reproductive_cycles' in result,false);
  assert.equal(animalSchema.safeParse({...animal,current_weight_kg:310.25}).success,false);
});
test('cattle input and responses cannot silently change production or farm',()=>{
  assert.equal(cattleQuerySchema.safeParse({...query,production:'all'}).success,false);assert.equal(cattleQuerySchema.safeParse({...query,page:0}).success,false);
  assert.equal(matchesProduction('dual','dairy'),true);assert.equal(matchesProduction('unknown','beef'),false);
  assert.throws(()=>ensureCattleScope(animalSchema.parse(animal),'dairy'));assert.throws(()=>ensureCattleScope(animalSchema.parse(animal),'beef','00000000-0000-4000-8000-000000000002'));
});
function fixture(actor=user,hold?:()=>Promise<void>){const calls:{path:string|undefined;params:unknown}[]=[];const adapter:AxiosAdapter=async config=>{calls.push({path:config.url,params:config.params});let data:unknown=config.url==='auth/login/'?{access:'fake',refresh:'fake'}:config.url==='auth/me/'?actor:config.url==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};if(config.url==='livestock/cattle/animals/'){await hold?.();data={count:1,results:[animal],next:null,previous:null};}return {data,status:200,statusText:'OK',headers:{},config};};const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');return {controller,calls};}
test('feeder, missing bovine scope and forced password cannot request rebanho',async()=>{
  for(const actor of [{...user,access:{...user.access,role:'feeder' as const}},{...user,access:{...user.access,livestock_species:['suinos']}},{...user,force_password_change:true}]){assert.equal(canReadCattle(actor),false);const f=fixture(actor);await f.controller.signIn('test@example.com','password');await assert.rejects(f.controller.cattleList(query));assert.equal(f.calls.some(c=>c.path?.startsWith('livestock/')),false);}
});
test('cattle API uses server production/farm filters and the operational view',async()=>{
  const f=fixture();await f.controller.signIn('test@example.com','password');await f.controller.cattleList({...query,farm:id,search:'0007',page:2});assert.deepEqual(f.calls.at(-1),{path:'livestock/cattle/animals/',params:{production:'beef',farm:id,search:'0007',page:2,status:'active',view:'operational',page_size:20}});
  await assert.rejects(f.controller.cattleDetail('animals','../bad','beef'));assert.equal(f.calls.length,4);
});
test('a late cattle response cannot survive logout or reuse a session cache',async()=>{
  let resolve!:()=>void;const gate=new Promise<void>(done=>{resolve=done;});const f=fixture(user,()=>gate);await f.controller.signIn('test@example.com','password');const epoch=f.controller.getSessionEpoch();const pending=f.controller.cattleList(query);await f.controller.signOut();resolve();await assert.rejects(pending,/expired/);assert.notEqual(f.controller.getSessionEpoch(),epoch);
  const first=createSessionQueryClient('first');const second=createSessionQueryClient('second');first.setQueryData(['cattle','beef'],animal);assert.equal(second.getQueryData(['cattle','beef']),undefined);first.clear();second.clear();
});
test('query cancellation propagates signal and never stores a late value',async()=>{
  const client=createSessionQueryClient('cancel');let aborted=false;
  const pending=client.fetchQuery({queryKey:['cattle'],queryFn:({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));}))});
  const failure=assert.rejects(pending);await client.cancelQueries();await failure;assert.equal(aborted,true);assert.equal(client.getQueryData(['cattle']),undefined);client.clear();
});
test('cattle translations cover four languages',()=>{for(const copy of Object.values(cattleMessages))assert.deepEqual(Object.keys(copy).sort(),Object.keys(cattleMessages['pt-BR']).sort());});

test('animal and weight forms validate chronology, category and exact decimal input',async()=>{
  const {animalInputSchema,animalPayload,weightInputSchema}=await import('../src/features/cattle/contracts');
  const form={identifier:' 0009 ',name:'Animal',gender:'F' as const,category:'Novilha' as const,birth_date:'',entry_date:'2026-11-07',notes:'',breed_name_input:'Mestiça',initial_weight_kg:'310,25'};
  const schema=animalInputSchema('2026-11-07');
  assert.equal(schema.safeParse({...form,entry_date:'2026-11-08'}).success,false);assert.equal(schema.safeParse({...form,birth_date:'2026-11-08'}).success,false);assert.equal(schema.safeParse({...form,gender:'M'}).success,false);assert.equal(schema.safeParse({...form,initial_weight_kg:'0,000'}).success,false);assert.equal(schema.safeParse({...form,initial_weight_kg:'100,125'}).success,false);
  const parsed=schema.parse(form);assert.equal(parsed.identifier,'0009');
  const created=animalPayload(parsed,{farm:id,production:'beef'});assert.equal(created.birth_date,null);assert.equal('initial_weight_kg' in created?created.initial_weight_kg:null,'310.25');
  const edited=animalPayload(parsed);for(const key of ['farm_id','species_code_input','cattle_purpose','initial_weight_kg','breed_name_input','status','purchase_value'])assert.equal(key in edited,false);
  const weight=weightInputSchema('2026-11-07','2026-11-01');
  for(const change of [{weight_kg:'0'},{weight_kg:'310.123'},{weight_kg:'1.234,56'},{weighing_date:'2026-11-08'},{weighing_date:'2026-10-31'}])assert.equal(weight.safeParse({weight_kg:'310,25',weighing_date:'2026-11-07',notes:'',...change}).success,false);
  assert.equal(weight.parse({weight_kg:'310,25',weighing_date:'2026-11-07',notes:''}).weight_kg,'310,25');
});
async function mutationFixture(actor:typeof user={...user,access:{...user.access,role:'manager' as const}},extra:Partial<typeof animal>={}){
  const {organizationDay}=await import('../src/features/workspace/contracts');const today=organizationDay('UTC');let record={...animal,entry_date:today,...extra};const writes:{path:string;method:string;body:Record<string,unknown>}[]=[];
  let organizationId='org';let optionsReadOnly=false;let hold:(()=>Promise<void>)|undefined;
  const adapter:AxiosAdapter=async config=>{
    const path=config.url!;let data:unknown={};
    if(path==='auth/login/')data={access:'fake',refresh:'fake'};else if(path==='auth/me/')data=actor;else if(path==='organizations/me/')data={id:organizationId,name:'Org',language:'pt-BR'};else if(path==='tasks/agenda-options/'){await hold?.();data={user_id:id,role:actor.access.role,read_only:optionsReadOnly,timezone:'UTC'};}else if(path===`livestock/cattle/animals/${id}/`)data=record;
    if(['post','patch'].includes(config.method??'')&&path.startsWith('livestock/cattle/')){
      const body=JSON.parse(config.data);writes.push({path,method:config.method!,body});
      if(path.endsWith('/register-weight/'))data={id};else{record={...record,...body};data=record;}
    }
    return {data,status:200,statusText:'OK',headers:{},config};
  };
  const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','password');
  const values={identifier:'0009',name:'Nativa',gender:'F' as const,category:'Novilha' as const,birth_date:'',entry_date:today,notes:'',breed_name_input:'Mestiça',initial_weight_kg:'100,25'};
  return {controller,writes,values,today,switchOrganization:()=>{organizationId='other';},readOnly:()=>{optionsReadOnly=true;},hold:(f:()=>Promise<void>)=>{hold=f;}};
}
test('animal mutation sends immutable scope only on creation and never edits current weight',async()=>{
  const f=await mutationFixture();await f.controller.saveCattleAnimal(f.values,'beef',id);assert.equal(f.writes[0]?.body.farm_id,id);assert.equal(f.writes[0]?.body.species_code_input,'bovinos');assert.equal(f.writes[0]?.body.initial_weight_kg,'100.25');
  await f.controller.saveCattleAnimal(f.values,'beef',id,id);const edit=f.writes[1]!.body;assert.equal(f.writes[1]?.method,'patch');for(const key of ['farm_id','species_code_input','cattle_purpose','current_weight_kg','initial_weight_kg','breed_name_input'])assert.equal(key in edit,false);
});
test('operator can create/weigh but manager-only editing and readonly are enforced before HTTP mutation',async()=>{
  const operator=await mutationFixture(user);await operator.controller.saveCattleAnimal(operator.values,'beef',id);await assert.rejects(operator.controller.saveCattleAnimal(operator.values,'beef',id,id));assert.equal(operator.writes.length,1);
  await operator.controller.recordCattleWeight('animals',id,'beef',id,{weight_kg:'312,50',weighing_date:operator.today,notes:'Conferência'});assert.deepEqual(operator.writes[1]?.body,{weight_kg:'312.50',weighing_date:operator.today,notes:'Conferência'});
  operator.readOnly();await assert.rejects(operator.controller.recordCattleWeight('animals',id,'beef',id,{weight_kg:'312,50',weighing_date:operator.today,notes:''}));assert.equal(operator.writes.length,2);
  const inactive=await mutationFixture(undefined,{status:'sold'});await assert.rejects(inactive.controller.recordCattleWeight('animals',id,'beef',id,{weight_kg:'312',weighing_date:inactive.today,notes:''}));assert.equal(inactive.writes.length,0);
});
test('cattle mutations reject simultaneous requests and stop after logout during preflight',async()=>{
  const f=await mutationFixture();let release!:()=>void;const gate=new Promise<void>(done=>{release=done;});f.hold(()=>gate);
  const first=f.controller.saveCattleAnimal(f.values,'beef',id);await assert.rejects(f.controller.saveCattleAnimal(f.values,'beef',id));await f.controller.signOut();release();await assert.rejects(first);assert.equal(f.writes.length,0);
});
test('cattle form messages are complete in every language',async()=>{const {cattleFormMessages}=await import('../src/features/cattle/formMessages');for(const copy of Object.values(cattleFormMessages))assert.deepEqual(Object.keys(copy).sort(),Object.keys(cattleFormMessages['pt-BR']).sort());});

test('a changed organization or farm stops cattle edits before mutation',async()=>{
  const changed=await mutationFixture();changed.switchOrganization();await assert.rejects(changed.controller.saveCattleAnimal(changed.values,'beef',id));assert.equal(changed.writes.length,0);assert.equal(changed.controller.getSnapshot().status,'signedOut');
  const moved=await mutationFixture(undefined,{farm:'00000000-0000-4000-8000-000000000002'});await assert.rejects(moved.controller.saveCattleAnimal(moved.values,'beef',id,id));assert.equal(moved.writes.length,0);
});
