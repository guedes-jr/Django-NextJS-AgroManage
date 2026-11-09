import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,ClinicSaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {canReadClinic,canWriteClinic,clinicInputSchema,clinicPayload,clinicQuerySchema,clinicRecordSchema,matchesClinic,type ClinicQuery,type ClinicInput} from '../src/features/clinic/contracts';
import {clinicMessages} from '../src/features/clinic/messages';
const id='00000000-0000-4000-8000-000000000001',animal='00000000-0000-4000-8000-000000000002',farm='00000000-0000-4000-8000-000000000003';
const user=userSchema.parse({id,full_name:'Operador',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'operator',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const values:ClinicInput={animal,expected_farm:farm,record_type:'consultation',record_date:'2026-11-07',record_time:'08:30',clinical_notes:' Observation ',severity:'moderate',outcome:'pending',veterinarian:''};
const query:ClinicQuery={kind:'clinical',page:1,search:'',species:'',start:'',end:''};
const row=clinicRecordSchema.parse({id,kind:'clinical',title:'Consulta',date:'2026-11-07',farm,farm_name:'Fazenda A',animal,animal_identifier:'A-001',batch:null,batch_code:'',species:'bovinos',subtype:'consultation',severity:'moderate',status:'pending',preview:'Observation'});
async function fixture(actor=user){const calls:{path:string;body:unknown;params:unknown;method:string}[]=[];let mode:'ok'|'500'|'400'|'invalid'='ok',active=true,animalSpecies='bovinos';let hold:(()=>Promise<void>)|undefined;
 const adapter:AxiosAdapter=async config=>{const path=config.url!,body=config.data?JSON.parse(config.data):undefined;calls.push({path,body,params:config.params,method:config.method!});if(path==='auth/me/')await hold?.();let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?actor:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
 if(path==='livestock/clinical/records/mobile-options/')data={today:'2026-11-07',timezone:'America/Fortaleza',species:[{value:'bovinos',label:'Bovinos'}],record_types:[{value:'consultation',label:'Consulta'}],severities:[{value:'moderate',label:'Moderado'}],outcomes:[{value:'pending',label:'Pendente'}]};
 if(path==='livestock/clinical/records/mobile-animals/')data={count:active?1:0,results:active?[{id:animal,identifier:'A-001',name:'',farm,farm_name:'Fazenda A',species:animalSpecies}]:[],next:null,previous:null};
 if(path==='livestock/clinical/records/mobile/')data={count:1,results:[row],next:null,previous:null};
 if(path===`livestock/clinical/records/${id}/mobile/`)data={...row,notes:'Observation',extra_notes:'',professional:'',record_time:null,disease:'',next_dose_date:null,dosage_ml:null,vaccine_batch:'',affected_animals:0,affected_batches:0};
 if(path==='livestock/clinical/records/'&&config.method==='post'){if(mode==='500'||mode==='400')throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:Number(mode),statusText:'error',headers:{}});data=mode==='invalid'?{}:{id};}
 return {config,data,status:200,statusText:'OK',headers:{}};};const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,calls,mode:(v:typeof mode)=>{mode=v;},active:(v:boolean)=>{active=v;},species:(v:string)=>{animalSpecies=v;},hold:(v:()=>Promise<void>)=>{hold=v;}};
}
test('clinic filters validate UUIDs, paired bounded periods and animal versus batch context',()=>{
 for(const change of [{page:0},{farm:'other'},{start:'2026-01-01'},{start:'2026-11-08',end:'2026-11-07'},{start:'2025-01-01',end:'2026-11-07'},{kind:'health',batch:id}])assert.equal(clinicQuerySchema.safeParse({...query,...change}).success,false);
 assert.equal(matchesClinic(row,query),true);assert.equal(matchesClinic(row,{...query,animal:id}),false);assert.equal(matchesClinic(row,{...query,farm:id}),false);assert.equal(matchesClinic(row,{...query,kind:'health'}),false);
});
test('clinic writes whitelist essential fields and preserve explicit UUID, farm, date and time',()=>{
 const result=clinicPayload({...values,treatment_cost:'injected'} as ClinicInput);assert.equal('treatment_cost' in result,false);assert.equal(result.animal,animal);assert.equal(result.expected_farm,farm);assert.equal(result.clinical_notes,'Observation');assert.equal(clinicPayload({...values,record_time:''}).record_time,null);
 for(const change of [{animal:'A-001'},{clinical_notes:''},{record_date:'2026-02-30'},{record_time:'25:30'}])assert.equal(clinicInputSchema.safeParse({...values,...change}).success,false);
});
test('clinic role guard permits authorized operator read/write and denies feeder or missing species',()=>{
 assert.equal(canReadClinic(user),true);assert.equal(canWriteClinic(user),true);assert.equal(canReadClinic({...user,access:{...user.access,read_only:true}}),true);assert.equal(canWriteClinic({...user,access:{...user.access,read_only:true}}),false);
 for(const actor of [{...user,force_password_change:true},{...user,access:{...user.access,role:'feeder' as const}},{...user,access:{...user.access,livestock_species:[]}}])assert.equal(canReadClinic(actor),false);
});
test('clinic operational reads use fixed paginated endpoints and validate returned context',async()=>{
 const f=await fixture();assert.equal((await f.controller.clinicPage(query)).results.length,1);assert.equal((f.calls.at(-1)?.params as {page_size:number}).page_size,20);await assert.rejects(f.controller.clinicPage({...query,kind:'health'}));await assert.rejects(f.controller.clinicDetail(id,{...query,farm:id}));assert.equal((await f.controller.clinicDetail(id,query)).id,id);
});
test('clinic creation revalidates scope/options and uses existing create policy with mobile receipt',async()=>{
 const f=await fixture();assert.deepEqual(await f.controller.createClinicRecord(values),{id});assert.deepEqual(f.calls.at(-1)?.body,clinicPayload(values));assert.deepEqual(f.calls.at(-1)?.params,{view:'mobile'});
 for(const value of [{...values,record_date:'2026-11-08'},{...values,record_type:'unknown'}])await assert.rejects(f.controller.createClinicRecord(value));f.active(false);await assert.rejects(f.controller.createClinicRecord(values));f.active(true);f.species('suinos');await assert.rejects(f.controller.createClinicRecord(values));assert.equal(f.calls.filter(c=>c.method==='post'&&c.path==='livestock/clinical/records/').length,1);
});
test('clinic logout during preflight, read-only and concurrent taps cannot create a record',async()=>{
 const blocked=await fixture({...user,access:{...user.access,read_only:true}});await assert.rejects(blocked.controller.createClinicRecord(values));assert.equal(blocked.calls.some(c=>c.path==='livestock/clinical/records/'),false);
 const f=await fixture();let release!:()=>void;f.hold(()=>new Promise<void>(resolve=>{release=resolve;}));const pending=f.controller.createClinicRecord(values);while(!release)await new Promise(resolve=>setTimeout(resolve,0));await assert.rejects(f.controller.createClinicRecord(values));await f.controller.signOut();release();await assert.rejects(pending);assert.equal(f.calls.some(c=>c.path==='livestock/clinical/records/'),false);
});
test('clinic uncertain writes are not retried and stay distinct from known validation errors',async()=>{
 const f=await fixture();f.mode('400');await assert.rejects(f.controller.createClinicRecord(values),e=>!(e instanceof ClinicSaveUnconfirmed));f.mode('500');await assert.rejects(f.controller.createClinicRecord(values),ClinicSaveUnconfirmed);f.mode('invalid');await assert.rejects(f.controller.createClinicRecord(values),ClinicSaveUnconfirmed);assert.equal(f.calls.filter(c=>c.path==='livestock/clinical/records/').length,3);
});
test('clinic catalogs contain all organization locales and status labels',()=>{for(const language of ['pt-BR','en','es','pt-PT'] as const){assert.deepEqual(Object.keys(clinicMessages[language]).sort(),Object.keys(clinicMessages['pt-BR']).sort());assert.deepEqual(Object.keys(clinicMessages[language].labels).sort(),Object.keys(clinicMessages['pt-BR'].labels).sort());}});
