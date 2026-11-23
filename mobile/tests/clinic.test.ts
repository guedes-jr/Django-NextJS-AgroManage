import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,type AxiosAdapter} from 'axios';
import {createAuthApi} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {canReadClinic,canWriteClinic,clinicKinds,clinicQuerySchema,clinicRecordSchema,clinicWebPath,matchesClinic,type ClinicQuery} from '../src/features/clinic/contracts';
import {clinicMessages} from '../src/features/clinic/messages';
const id='00000000-0000-4000-8000-000000000001',animal='00000000-0000-4000-8000-000000000002',farm='00000000-0000-4000-8000-000000000003';
const user=userSchema.parse({id,full_name:'Operador',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'operator',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const query:ClinicQuery={kind:'health',page:1,search:'',species:'',start:'',end:''};
const row=clinicRecordSchema.parse({id,kind:'health',title:'Exame',date:'2026-11-07',farm,farm_name:'Fazenda A',animal,animal_identifier:'A-001',batch:null,batch_code:'',species:'bovinos',subtype:'exam',severity:'',status:'',preview:'Observation'});
async function fixture(actor=user){const calls:{path:string;params:unknown;method:string}[]=[];
 const adapter:AxiosAdapter=async config=>{const path=config.url!;calls.push({path,params:config.params,method:config.method!});let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?actor:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
 if(path==='livestock/clinical/records/mobile-options/')data={today:'2026-11-07',timezone:'America/Fortaleza',species:[{value:'bovinos',label:'Bovinos'}],record_types:[],severities:[],outcomes:[]};
 if(path==='livestock/clinical/records/mobile/')data={count:1,results:[row],next:null,previous:null};
 if(path===`livestock/clinical/records/${id}/mobile/`)data={...row,notes:'Observation',extra_notes:'',professional:'',record_time:null,disease:'',next_dose_date:null,dosage_ml:null,vaccine_batch:'',affected_animals:0,affected_batches:0};
 return {config,data,status:200,statusText:'OK',headers:{}};};const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,calls};
}
test('clinic keeps only exams/treatments and vaccinations after the web clinic removal',()=>{
 assert.deepEqual([...clinicKinds],['health','vaccinations']);
 for(const kind of ['clinical','alerts'])assert.equal(clinicQuerySchema.safeParse({...query,kind}).success,false);
 assert.equal(clinicRecordSchema.safeParse({...row,kind:'clinical'}).success,false);
});
test('clinic filters validate UUIDs, paired bounded periods and animal versus batch context',()=>{
 for(const change of [{page:0},{farm:'other'},{start:'2026-01-01'},{start:'2026-11-08',end:'2026-11-07'},{start:'2025-01-01',end:'2026-11-07'},{kind:'health' as const,batch:id}])assert.equal(clinicQuerySchema.safeParse({...query,...change}).success,false);
 assert.equal(matchesClinic(row,query),true);assert.equal(matchesClinic(row,{...query,animal:id}),false);assert.equal(matchesClinic(row,{...query,farm:id}),false);assert.equal(matchesClinic(row,{...query,kind:'vaccinations'}),false);
});
test('clinic role guard permits authorized operator read/write and denies feeder, missing species or veterinarian',()=>{
 assert.equal(canReadClinic(user),true);assert.equal(canWriteClinic(user),true);assert.equal(canReadClinic({...user,access:{...user.access,read_only:true}}),true);assert.equal(canWriteClinic({...user,access:{...user.access,read_only:true}}),false);
 for(const actor of [{...user,force_password_change:true},{...user,access:{...user.access,role:'feeder' as const}},{...user,access:{...user.access,livestock_species:[]}},{...user,access:{...user.access,role:'veterinarian' as const}}])assert.equal(canReadClinic(actor),false);
});
test('clinic operational reads use fixed paginated endpoints and validate returned context',async()=>{
 const f=await fixture();assert.equal((await f.controller.clinicPage(query)).results.length,1);assert.equal((f.calls.at(-1)?.params as {page_size:number;kind:string}).page_size,20);assert.equal((f.calls.at(-1)?.params as {kind:string}).kind,'health');
 await assert.rejects(f.controller.clinicPage({...query,kind:'vaccinations'}));await assert.rejects(f.controller.clinicDetail(id,{...query,farm:id}));assert.equal((await f.controller.clinicDetail(id,query)).id,id);
 assert.equal(f.calls.some(c=>c.method==='post'&&c.path==='livestock/clinical/records/'),false);
});
test('clinic web link opens the species segment instead of the removed web clinic',()=>{
 assert.equal(clinicWebPath('bovinos'),'/home/seguimento/gado-de-corte/sanidade');assert.equal(clinicWebPath('suinos'),'/home/seguimento/suinos');assert.equal(clinicWebPath(''),'/home');
});
test('clinic catalogs contain all organization locales and status labels',()=>{for(const language of ['pt-BR','en','es','pt-PT'] as const){assert.deepEqual(Object.keys(clinicMessages[language]).sort(),Object.keys(clinicMessages['pt-BR']).sort());assert.deepEqual(Object.keys(clinicMessages[language].labels).sort(),Object.keys(clinicMessages['pt-BR'].labels).sort());}});
