import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,DiagnosisContextChanged,DiagnosisSaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {diagnosisInputSchema,diagnosisOptionsSchema,ensureDiagnosisScope,matchesDiagnosis,type DiagnosisInput} from '../src/features/cattle/diagnosisContracts';
import {diagnosisMessages} from '../src/features/cattle/diagnosisMessages';
const id='00000000-0000-4000-8000-000000000001',farm='00000000-0000-4000-8000-000000000002',mating='00000000-0000-4000-8000-000000000003';
const user=userSchema.parse({id,full_name:'Operator',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'operator',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const version='2026-11-08T08:00:00+00:00';
const option=diagnosisOptionsSchema.parse({today:'2026-11-08',timezone:'America/Fortaleza',animal:{id,identifier:'COW',farm,farm_name:'Farm',cattle_purpose:'dairy',version},mating:{id:mating,date:'2026-10-01',version,expected_birth_date:'2027-07-08'},allowed_results:['positive','negative']});
const input:DiagnosisInput={expected_farm:farm,expected_mating:mating,animal_version:version,mating_version:version,diagnosis_date:'2026-11-08',result:'positive'};
async function fixture(actor=user){const calls:{path:string;body:unknown;method:string;params:unknown}[]=[];let mode:'ok'|'400'|'409'|'408'|'503'|'network'|'invalid'='ok',changed=false,returnedUser=actor;let hold:(()=>Promise<void>)|undefined;
 const adapter:AxiosAdapter=async config=>{const path=config.url!,body=config.data?JSON.parse(config.data):undefined;calls.push({path,body,method:config.method!,params:config.params});if(path==='auth/me/')await hold?.();let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?returnedUser:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
 if(path.endsWith('mobile-diagnosis/'))data=changed?{...option,mating:{...option.mating,id}}:option;
 if(path.endsWith('diagnose-pregnancy/')){if(mode==='network')throw new AxiosError('synthetic',undefined,config);if(['400','409','408','503'].includes(mode))throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:Number(mode),statusText:'test',headers:{}});data=mode==='invalid'?{}:{animal:id,mating,result:body.result,status:body.result==='positive'?'gestante':'descanso'};}
 return {config,data,status:200,statusText:'OK',headers:{}};};
 const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,calls,mode:(value:typeof mode)=>{mode=value;},changed:(value:boolean)=>{changed=value;},actor:(value:typeof actor)=>{returnedUser=value;},hold:(value:()=>Promise<void>)=>{hold=value;}};
}
test('diagnosis input requires explicit result, actual date, UUIDs and versions, and strips extras',()=>{
 for(const change of [{result:''},{result:'maybe'},{diagnosis_date:'2026-02-30'},{expected_mating:'COVERAGE'},{animal_version:'today'}])assert.equal(diagnosisInputSchema.safeParse({...input,...change}).success,false);
 assert.equal('cost' in diagnosisInputSchema.parse({...input,cost:12}),false);assert.equal(matchesDiagnosis(option,input),true);
});
test('diagnosis context binds animal, farm, segment, mating, versions, available result and date',()=>{
 assert.equal(ensureDiagnosisScope(option,id,'dairy',farm).animal.id,id);assert.throws(()=>ensureDiagnosisScope(option,farm,'dairy',farm));assert.throws(()=>ensureDiagnosisScope(option,id,'beef',farm));assert.throws(()=>ensureDiagnosisScope(option,id,'dairy',id));
 for(const change of [{expected_mating:id},{expected_farm:id},{animal_version:'2026-11-07T08:00:00+00:00'},{diagnosis_date:'2026-09-01'},{diagnosis_date:'2026-11-09'}])assert.equal(matchesDiagnosis(option,{...input,...change}),false);
 assert.equal(matchesDiagnosis({...option,allowed_results:['negative']},input),false);
});
test('diagnosis uses existing action with mobile mode and validates narrow receipt',async()=>{
 const f=await fixture();await f.controller.diagnosisOptions(id,'dairy',farm);assert.equal((await f.controller.saveDiagnosis(id,'dairy',input)).status,'gestante');assert.deepEqual(f.calls.at(-1)?.body,input);assert.deepEqual(f.calls.at(-1)?.params,{view:'mobile',production:'dairy',farm});assert.equal((await f.controller.saveDiagnosis(id,'dairy',{...input,result:'negative'})).status,'descanso');
});
test('diagnosis changed coverage or refreshed readonly access stops before POST',async()=>{
 const f=await fixture();f.changed(true);await assert.rejects(f.controller.saveDiagnosis(id,'dairy',input),DiagnosisContextChanged);f.changed(false);f.actor({...user,access:{...user.access,read_only:true}});await assert.rejects(f.controller.saveDiagnosis(id,'dairy',input));assert.equal(f.calls.some(c=>c.path.endsWith('diagnose-pregnancy/')),false);
});
test('diagnosis uncertainty stays distinct from validation/conflict without automatic replay',async()=>{
 const f=await fixture();for(const mode of ['400','409','408','503','network','invalid'] as const){f.mode(mode);await assert.rejects(f.controller.saveDiagnosis(id,'dairy',input),e=>['400','409'].includes(mode)?!(e instanceof DiagnosisSaveUnconfirmed):e instanceof DiagnosisSaveUnconfirmed);}assert.equal(f.calls.filter(c=>c.path.endsWith('diagnose-pregnancy/')).length,6);
});
test('diagnosis readonly/feeder permissions and concurrent/logout guards prevent writes',async()=>{
 for(const actor of [{...user,access:{...user.access,read_only:true}},{...user,access:{...user.access,role:'feeder' as const}}]){const f=await fixture(actor);await assert.rejects(f.controller.saveDiagnosis(id,'dairy',input));assert.equal(f.calls.some(c=>c.path.endsWith('diagnose-pregnancy/')),false);}
 const f=await fixture();let release!:()=>void;f.hold(()=>new Promise<void>(resolve=>{release=resolve;}));const pending=f.controller.saveDiagnosis(id,'dairy',input);while(!release)await new Promise(resolve=>setTimeout(resolve,0));await assert.rejects(f.controller.saveDiagnosis(id,'dairy',input));await f.controller.signOut();release();await assert.rejects(pending);assert.equal(f.calls.some(c=>c.path.endsWith('diagnose-pregnancy/')),false);
});
test('diagnosis text covers all organization locales',()=>{for(const locale of ['pt-BR','en','es','pt-PT'] as const)assert.deepEqual(Object.keys(diagnosisMessages[locale]).sort(),Object.keys(diagnosisMessages['pt-BR']).sort());});
