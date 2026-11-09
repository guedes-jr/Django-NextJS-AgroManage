import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,VaccinationSaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {vaccinationInputSchema,vaccinationKey,vaccinationReviewSchema,validateVaccinationReview,type VaccinationInput} from '../src/features/clinic/vaccinationContracts';
import {vaccinationMessages} from '../src/features/clinic/vaccinationMessages';
const id='00000000-0000-4000-8000-000000000001',patient='00000000-0000-4000-8000-000000000002',farm='00000000-0000-4000-8000-000000000003',vaccine='00000000-0000-4000-8000-000000000004';
const user=userSchema.parse({id,full_name:'Operator',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'operator',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const input:VaccinationInput={target_kind:'animal',target:patient,expected_farm:farm,vaccine_item:vaccine,dosage_ml:'2.5',application_date:'2026-11-07',next_dose_date:null,dose_type:'unica',applicator:'Professional',notes:'Recorded application'};
const target={id:patient,kind:'animal',label:'A-001',farm,farm_name:'Farm',species:'bovinos',head_count:1};
const product={id:vaccine,name:'Vaccine',unit:'ml',volume_per_dose:'',doses_per_package:null,configured:true};
const review=()=>vaccinationReviewSchema.parse({target,vaccine:product,dosage_ml:'2.50',quantity_per_head:'2.50',inventory_quantity:'2.50',available:'20.00',remaining:'17.50',lots:[{id,number:'V-001',quantity:'2.50',expiry:null}],command:input,preview_token:'synthetic-review'});
async function fixture(actor=user){let mode:'ok'|'400'|'408'|'409'|'503'|'network'|'invalid'='ok',species='bovinos';let hold:(()=>Promise<void>)|undefined;
 const calls:{path:string;body:unknown;params:Record<string,unknown>;method:string}[]=[];
 const adapter:AxiosAdapter=async config=>{const path=config.url!,body=config.data?JSON.parse(config.data):undefined;calls.push({path,body,params:config.params,method:config.method!});if(path==='auth/me/')await hold?.();let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?actor:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
 if(path==='livestock/vaccinations/mobile-targets/')data={count:1,next:null,previous:null,results:[{...target,species}]};
 if(path==='livestock/vaccinations/mobile-vaccines/')data={count:1,next:null,previous:null,results:[product]};
 if(path==='livestock/vaccinations/mobile-options/')data={today:'2026-11-07',timezone:'America/Fortaleza',dose_types:[{value:'unica',label:'Única'}]};
 if(path==='livestock/vaccinations/'&&config.params.view==='mobile-preview')data={...review(),command:body};
 if(path==='livestock/vaccinations/'&&config.params.view==='mobile-confirm'){
   if(mode==='network')throw new AxiosError('synthetic',undefined,config);
   if(['400','408','409','503'].includes(mode))throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:Number(mode),statusText:'test',headers:{}});
   data=mode==='invalid'?{}:{id,inventory_quantity:'2.50',inventory_unit:'ml'};
 }
 return {config,data,status:200,statusText:'OK',headers:{}};};
 const api=createAuthApi('https://example.com/api/v1/',create({adapter})),controller=new SessionController(api,{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');
 return {api,controller,calls,mode:(value:typeof mode)=>{mode=value;},species:(value:string)=>{species=value;},hold:(value:()=>Promise<void>)=>{hold=value;}};
}
test('vaccination validates UUIDs, positive exact input, manual dates and normalizes decimal comma',()=>{
 assert.equal(vaccinationInputSchema.parse({...input,dosage_ml:'02,50'}).dosage_ml,'2.5');
 assert.equal(vaccinationKey({...input,dosage_ml:'2.50'}),vaccinationKey(input));
 for(const change of [{target:'A-001'},{dosage_ml:'0'},{dosage_ml:'0.001'},{dosage_ml:'10000'},{next_dose_date:'2026-11-06'},{application_date:'2026-02-30'}])assert.equal(vaccinationInputSchema.safeParse({...input,...change}).success,false);
 assert.equal('cost' in vaccinationInputSchema.parse({...input,cost:12}),false);
});
test('vaccination review binds patient, farm, vaccine and every command field',()=>{
 assert.equal(validateVaccinationReview(review(),input).target.id,patient);
 for(const change of [{target:id},{expected_farm:id},{vaccine_item:id},{notes:'Changed'},{dosage_ml:'3'},{target_kind:'batch' as const}])assert.throws(()=>validateVaccinationReview(review(),{...input,...change}));
 assert.throws(()=>validateVaccinationReview({...review(),target:{...review().target,farm:id}},input));
});
test('vaccination read endpoints validate returned target scope and require species for vaccines',async()=>{
 const f=await fixture();await f.controller.vaccinationOptions();await f.controller.vaccinationTargets({kind:'animal',page:1,target:patient,farm,search:''});
 assert.equal(f.calls.at(-1)?.params.page_size,20);
 await assert.rejects(f.controller.vaccinationTargets({kind:'batch',page:1,search:''}));
 await assert.rejects(f.controller.vaccinationTargets({kind:'animal',page:1,farm:id,search:''}));
 await assert.rejects(f.controller.vaccinationVaccines({kind:'animal',page:1,search:''}));
 assert.equal((await f.controller.vaccinationVaccines({kind:'animal',species:'bovinos',page:1,search:''})).results.length,1);
});
test('vaccination confirmation requires controller-held review and sends only the signed token once',async()=>{
 const f=await fixture();await assert.rejects(f.controller.confirmVaccination(input,review()));
 const held=await f.controller.previewVaccination(input);await assert.rejects(f.controller.confirmVaccination({...input,notes:'Changed'},held));
 assert.equal((await f.controller.confirmVaccination(input,held)).id,id);
 assert.deepEqual(f.calls.at(-1)?.body,{preview_token:held.preview_token});assert.deepEqual(f.calls.at(-1)?.params,{view:'mobile-confirm'});
 await assert.rejects(f.controller.confirmVaccination(input,held));assert.equal(f.calls.filter(c=>c.params?.view==='mobile-confirm').length,1);
});
test('vaccination known rejection invalidates review and uncertain outcomes never replay',async()=>{
 const f=await fixture();
 for(const mode of ['400','409','408','503','network','invalid'] as const){const held=await f.controller.previewVaccination(input);f.mode(mode);await assert.rejects(f.controller.confirmVaccination(input,held),error=>['400','409'].includes(mode)?!(error instanceof VaccinationSaveUnconfirmed):error instanceof VaccinationSaveUnconfirmed);await assert.rejects(f.controller.confirmVaccination(input,held));}
 assert.equal(f.calls.filter(c=>c.params?.view==='mobile-confirm').length,6);
});
test('vaccination readonly and forbidden species cannot preview or confirm',async()=>{
 const blocked=await fixture({...user,access:{...user.access,read_only:true}});await assert.rejects(blocked.controller.previewVaccination(input));await assert.rejects(blocked.controller.confirmVaccination(input,review()));assert.equal(blocked.calls.some(c=>c.path==='livestock/vaccinations/'),false);
 const f=await fixture();f.species('suinos');await assert.rejects(f.controller.previewVaccination(input));assert.equal(f.calls.some(c=>c.path==='livestock/vaccinations/'),false);
});
test('vaccination blocks concurrent taps and logout during preflight',async()=>{
 const f=await fixture();const held=await f.controller.previewVaccination(input);let release!:()=>void;f.hold(()=>new Promise<void>(resolve=>{release=resolve;}));const pending=f.controller.confirmVaccination(input,held);while(!release)await new Promise(resolve=>setTimeout(resolve,0));await assert.rejects(f.controller.confirmVaccination(input,held));await f.controller.signOut();release();await assert.rejects(pending);assert.equal(f.calls.filter(c=>c.params?.view==='mobile-confirm').length,0);
});
test('vaccination messages cover four locales and retain all dose and unit labels',()=>{for(const locale of ['pt-BR','en','es','pt-PT'] as const){assert.deepEqual(Object.keys(vaccinationMessages[locale]).sort(),Object.keys(vaccinationMessages['pt-BR']).sort());assert.deepEqual(Object.keys(vaccinationMessages[locale].doseTypes).sort(),Object.keys(vaccinationMessages['pt-BR'].doseTypes).sort());assert.deepEqual(Object.keys(vaccinationMessages[locale].units).sort(),Object.keys(vaccinationMessages['pt-BR'].units).sort());}});
