import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,MatingContextChanged,MatingSaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {matingInputSchema,matingReviewSchema,validateMatingReview,ensureMatingScope,type MatingInput} from '../src/features/cattle/matingContracts';
import {matingMessages} from '../src/features/cattle/matingMessages';
const id='00000000-0000-4000-8000-000000000001',farm='00000000-0000-4000-8000-000000000002',sire='00000000-0000-4000-8000-000000000003',version='2026-11-08T08:00:00+00:00';
const user=userSchema.parse({id,full_name:'Operator',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'operator',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const animal={id,identifier:'COW',farm,farm_name:'Farm',version,cattle_purpose:'dairy'};
const input:MatingInput={expected_farm:farm,animal_version:version,mating_date:'2026-11-08',mating_type:'ai',sire:null,expected_sire_farm:null,sire_version:null,sire_info:'Reported semen',expected_diagnosis_date:null,notes:'Recorded'};
const review=()=>matingReviewSchema.parse({animal,sire:null,expected_birth_date:'2027-08-18',mating_date:input.mating_date,mating_type:input.mating_type,command:input,preview_token:'synthetic'});
async function fixture(actor=user){const calls:{path:string;body:unknown;params:Record<string,unknown>;method:string}[]=[];let mode:'ok'|'400'|'409'|'408'|'503'|'invalid'='ok',changed=false,returnedUser=actor;let hold:(()=>Promise<void>)|undefined;
 const adapter:AxiosAdapter=async config=>{const path=config.url!,body=config.data?JSON.parse(config.data):undefined;calls.push({path,body,params:config.params,method:config.method!});if(path==='auth/me/')await hold?.();let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?returnedUser:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
 if(path.endsWith('/mobile-mating/'))data={animal:changed?{...animal,version:'2026-11-08T09:00:00+00:00'}:animal,today:'2026-11-08',timezone:'America/Fortaleza',earliest_date:null,types:['natural','ai','iatf']};
 if(path.endsWith('/mobile-mating-sires/'))data={count:1,next:null,previous:null,results:[{...animal,id:sire,identifier:'BULL',cattle_purpose:'beef'}]};
 if(path.endsWith('/register-mating/')){if(config.params.view==='mobile-preview')data={...review(),command:body};else{if(['400','409','408','503'].includes(mode))throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:Number(mode),statusText:'test',headers:{}});data=mode==='invalid'?{}:{id:sire,animal:id,status:'coberta',expected_birth_date:'2027-08-18'};}}
 return {config,data,status:200,statusText:'OK',headers:{}};};
 const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,calls,mode:(value:typeof mode)=>{mode=value;},changed:(value:boolean)=>{changed=value;},actor:(value:typeof actor)=>{returnedUser=value;},hold:(value:()=>Promise<void>)=>{hold=value;}};
}
test('mating separates natural sire UUID/version from manually reported AI origin',()=>{
 assert.equal(matingInputSchema.safeParse(input).success,true);
 const natural={...input,mating_type:'natural' as const,sire,expected_sire_farm:farm,sire_version:version,sire_info:''};assert.equal(matingInputSchema.safeParse(natural).success,true);
 for(const change of [{sire_info:''},{mating_type:'natural'},{sire},{expected_diagnosis_date:'2026-11-07'},{mating_date:'2026-02-30'},{notes:'x'.repeat(2001)}])assert.equal(matingInputSchema.safeParse({...input,...change}).success,false);
 assert.equal('semen_quantity' in matingInputSchema.parse({...input,semen_quantity:'1'}),false);
});
test('mating review binds animal/farm/production, origin, dates and notes',()=>{
 validateMatingReview(review(),input);for(const change of [{expected_farm:id},{sire_info:'Other'},{notes:'Changed'},{mating_date:'2026-11-07'}])assert.throws(()=>validateMatingReview(review(),{...input,...change}));assert.throws(()=>ensureMatingScope(review(),id,'beef',farm));
});
test('mating uses dedicated metadata and paginated bulls without filtering them to female production',async()=>{
 const f=await fixture();assert.equal((await f.controller.matingOptions(id,'dairy',farm)).types.length,3);assert.equal((await f.controller.matingSires(1,'BULL')).results[0]?.cattle_purpose,'beef');assert.equal(f.calls.at(-1)?.params.page_size,20);
});
test('mating confirmation requires held review and sends only signed token once',async()=>{
 const f=await fixture();await assert.rejects(f.controller.confirmMating(id,'dairy',input,review()));const held=await f.controller.previewMating(id,'dairy',input);await assert.rejects(f.controller.confirmMating(id,'dairy',{...input,notes:'Changed'},held),MatingContextChanged);assert.equal((await f.controller.confirmMating(id,'dairy',input,held)).status,'coberta');assert.deepEqual(f.calls.at(-1)?.body,{preview_token:held.preview_token});assert.equal(f.calls.at(-1)?.params.view,'mobile-confirm');await assert.rejects(f.controller.confirmMating(id,'dairy',input,held));
});
test('mating preflight blocks changed female and refreshed readonly permission before preview',async()=>{
 const f=await fixture();f.changed(true);await assert.rejects(f.controller.previewMating(id,'dairy',input),MatingContextChanged);f.changed(false);f.actor({...user,access:{...user.access,read_only:true}});await assert.rejects(f.controller.previewMating(id,'dairy',input));assert.equal(f.calls.some(c=>c.params?.view==='mobile-preview'),false);
});
test('mating uncertainty invalidates sent review without replay and stays distinct from 400/409',async()=>{
 const f=await fixture();for(const mode of ['400','409','408','503','invalid'] as const){const held=await f.controller.previewMating(id,'dairy',input);f.mode(mode);await assert.rejects(f.controller.confirmMating(id,'dairy',input,held),e=>['400','409'].includes(mode)?!(e instanceof MatingSaveUnconfirmed):e instanceof MatingSaveUnconfirmed);await assert.rejects(f.controller.confirmMating(id,'dairy',input,held));}assert.equal(f.calls.filter(c=>c.params?.view==='mobile-confirm').length,5);
});
test('mating blocks simultaneous actions and logout during preflight',async()=>{
 const f=await fixture();let release!:()=>void;f.hold(()=>new Promise<void>(resolve=>{release=resolve;}));const pending=f.controller.previewMating(id,'dairy',input);while(!release)await new Promise(resolve=>setTimeout(resolve,0));await assert.rejects(f.controller.previewMating(id,'dairy',input));await f.controller.signOut();release();await assert.rejects(pending);assert.equal(f.calls.some(c=>c.params?.view==='mobile-preview'),false);
});
test('mating catalogs cover all organization locales',()=>{for(const locale of ['pt-BR','en','es','pt-PT'] as const)assert.deepEqual(Object.keys(matingMessages[locale]).sort(),Object.keys(matingMessages['pt-BR']).sort());});
