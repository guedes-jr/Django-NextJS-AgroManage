import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,HealthSaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {healthInputSchema,healthOptionsSchema,type HealthInput} from '../src/features/clinic/healthContracts';
import {healthMessages} from '../src/features/clinic/healthMessages';
const id='00000000-0000-4000-8000-000000000001',animal='00000000-0000-4000-8000-000000000002',farm='00000000-0000-4000-8000-000000000003';
const user=userSchema.parse({id,full_name:'Operator',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'operator',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const input:HealthInput={animal,expected_farm:farm,treatment_type:'exam',application_date:'2026-11-07',description:' Recorded examination ',veterinary:' Professional ',notes:' Additional note '};
const options={today:'2026-11-07',timezone:'America/Fortaleza',treatment_types:[{value:'exam',label:'Exame'},{value:'medication',label:'Medicação'},{value:'surgery',label:'Cirurgia'},{value:'other',label:'Outro'}]};
async function fixture(actor=user){const calls:{path:string;body:unknown;params:unknown;method:string}[]=[];let mode:'ok'|'400'|'408'|'500'|'network'|'invalid'|'extra'='ok',active=true,species='bovinos',org='org',returnedUser=actor;let hold:(()=>Promise<void>)|undefined;
 const adapter:AxiosAdapter=async config=>{const path=config.url!,body=config.data?JSON.parse(config.data):undefined;calls.push({path,body,params:config.params,method:config.method!});if(path==='auth/me/')await hold?.();let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?returnedUser:path==='organizations/me/'?{id:org,name:'Org',language:'pt-BR'}:{};
 if(path==='livestock/health/records/mobile-options/')data=options;
 if(path==='livestock/clinical/records/mobile-animals/')data={count:active?1:0,results:active?[{id:animal,identifier:'A-001',farm,farm_name:'Farm',species}]:[],next:null,previous:null};
 if(path==='livestock/health/records/'&&config.method==='post'){
   if(mode==='network')throw new AxiosError('synthetic',undefined,config);
   if(['400','408','500'].includes(mode))throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:Number(mode),statusText:'test',headers:{}});
   data=mode==='invalid'?{}:mode==='extra'?{id,cost:'20'}:{id};
 }
 return {config,data,status:200,statusText:'OK',headers:{}};};
 const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');
 return {controller,calls,mode:(value:typeof mode)=>{mode=value;},active:(value:boolean)=>{active=value;},species:(value:string)=>{species=value;},org:(value:string)=>{org=value;},actor:(value:typeof actor)=>{returnedUser=value;},hold:(value:()=>Promise<void>)=>{hold=value;}};
}
test('health documentation validates UUID, real date, description, limits and actual procedure types',()=>{
 const result=healthInputSchema.parse({...input,cost:'injected',dosage:'injected'});assert.equal(result.description,'Recorded examination');assert.equal(result.veterinary,'Professional');assert.equal(result.notes,'Additional note');assert.equal('cost' in result,false);assert.equal('dosage' in result,false);
 for(const change of [{animal:'A-001'},{expected_farm:'Farm'},{application_date:'2026-02-30'},{description:' '},{description:'x'.repeat(8001)},{veterinary:'x'.repeat(101)},{treatment_type:'invalid'}])assert.equal(healthInputSchema.safeParse({...input,...change}).success,false);
 assert.equal(healthOptionsSchema.safeParse({...options,treatment_types:[{value:'new-unknown',label:'Unknown'}]}).success,false);
});
test('health options and essential creation use dedicated contract and id-only receipt',async()=>{
 const f=await fixture();assert.equal((await f.controller.healthOptions()).today,options.today);assert.deepEqual(await f.controller.createHealthRecord(input),{id});assert.deepEqual(f.calls.at(-1)?.body,healthInputSchema.parse(input));assert.deepEqual(f.calls.at(-1)?.params,{view:'mobile'});assert.equal(f.calls.at(-1)?.path,'livestock/health/records/');
});
test('health preflight rejects future dates, inactive patient and forbidden species without a POST',async()=>{
 const f=await fixture();await assert.rejects(f.controller.createHealthRecord({...input,application_date:'2026-11-08'}));f.active(false);await assert.rejects(f.controller.createHealthRecord(input));f.active(true);f.species('suinos');await assert.rejects(f.controller.createHealthRecord(input));assert.equal(f.calls.some(c=>c.path==='livestock/health/records/'),false);
});
test('health refreshed access and organization changes block mutation',async()=>{
 const f=await fixture();f.actor({...user,access:{...user.access,read_only:true}});await assert.rejects(f.controller.createHealthRecord(input));f.actor(user);f.org('changed');await assert.rejects(f.controller.createHealthRecord(input));assert.equal(f.calls.some(c=>c.path==='livestock/health/records/'),false);
});
test('health feeder and read-only sessions cannot write',async()=>{
 for(const actor of [{...user,access:{...user.access,role:'feeder' as const}},{...user,access:{...user.access,read_only:true}}]){const f=await fixture(actor);await assert.rejects(f.controller.createHealthRecord(input));assert.equal(f.calls.some(c=>c.path==='livestock/health/records/'),false);}
});
test('health uncertain receipt, timeout and server/network errors are distinct from known validation and are not retried',async()=>{
 const f=await fixture();for(const mode of ['400','408','500','network','invalid','extra'] as const){f.mode(mode);await assert.rejects(f.controller.createHealthRecord(input),error=>mode==='400'?!(error instanceof HealthSaveUnconfirmed):error instanceof HealthSaveUnconfirmed);}assert.equal(f.calls.filter(c=>c.path==='livestock/health/records/').length,6);
});
test('health blocks concurrent taps and discards preflight after logout',async()=>{
 const f=await fixture();let release!:()=>void;f.hold(()=>new Promise<void>(resolve=>{release=resolve;}));const pending=f.controller.createHealthRecord(input);while(!release)await new Promise(resolve=>setTimeout(resolve,0));await assert.rejects(f.controller.createHealthRecord(input));await f.controller.signOut();release();await assert.rejects(pending);assert.equal(f.calls.some(c=>c.path==='livestock/health/records/'),false);
});
test('health messages cover all organization locales and documentary medication type',()=>{for(const locale of ['pt-BR','en','es','pt-PT'] as const){assert.deepEqual(Object.keys(healthMessages[locale]).sort(),Object.keys(healthMessages['pt-BR']).sort());assert.deepEqual(Object.keys(healthMessages[locale].types).sort(),Object.keys(healthMessages['pt-BR'].types).sort());assert.ok(healthMessages[locale].medication);}});
