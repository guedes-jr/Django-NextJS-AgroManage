import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,BirthContextChanged,BirthSaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {birthInputSchema,birthReviewSchema,validateBirthReview,ensureBirthScope,type BirthInput} from '../src/features/cattle/birthContracts';
import {birthMessages} from '../src/features/cattle/birthMessages';
const id='00000000-0000-4000-8000-000000000001',farm='00000000-0000-4000-8000-000000000002',pregnancy='00000000-0000-4000-8000-000000000003',calf='00000000-0000-4000-8000-000000000004',version='2026-11-08T08:00:00+00:00';
const user=userSchema.parse({id,full_name:'Operator',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'operator',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const animal={id,identifier:'COW',farm,farm_name:'Farm',version,cattle_purpose:'dairy'},gestation={id:pregnancy,start_date:'2026-01-29',expected_birth_date:'2026-11-08',version};
const input:BirthInput={expected_farm:farm,animal_version:version,expected_pregnancy:pregnancy,pregnancy_version:version,date:'2026-11-08',outcome:'alive',calf_identifier:'0001',calf_gender:'F',calf_purpose:'beef',weight_kg:'32.5',notes:'Recorded'};
const review=()=>birthReviewSchema.parse({animal,pregnancy:gestation,command:input,preview_token:'synthetic'});
async function fixture(actor=user){const calls:{path:string;body:unknown;params:Record<string,unknown>}[]=[];let mode:'ok'|'400'|'409'|'408'|'503'|'invalid'='ok',changed=false,returnedUser=actor;let hold:(()=>Promise<void>)|undefined;
 const adapter:AxiosAdapter=async config=>{const path=config.url!,body=config.data?JSON.parse(config.data):undefined;calls.push({path,body,params:config.params});if(path==='auth/me/')await hold?.();let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?returnedUser:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
 if(path.endsWith('/mobile-birth/'))data={animal,pregnancy:changed?{...gestation,id}:gestation,today:'2026-11-08',timezone:'America/Fortaleza',earliest_date:gestation.start_date};
 if(path.endsWith('/record-birth/')){if(config.params.view==='mobile-preview')data={...review(),command:body};else{if(['400','409','408','503'].includes(mode))throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:Number(mode),statusText:'test',headers:{}});data=mode==='invalid'?{}:{birth_id:pregnancy,calf_id:calf,calf_purpose:'beef'};}}
 return {config,data,status:200,statusText:'OK',headers:{}};};
 const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,calls,mode:(value:typeof mode)=>{mode=value;},changed:(value:boolean)=>{changed=value;},actor:(value:typeof actor)=>{returnedUser=value;},hold:(value:()=>Promise<void>)=>{hold=value;}};
}
test('birth requires explicit live-calf identity, sex and purpose and preserves leading zeros',()=>{
 assert.equal(birthInputSchema.parse({...input,weight_kg:'32,50'}).weight_kg,'32.5');assert.equal(birthInputSchema.parse(input).calf_identifier,'0001');
 for(const change of [{calf_identifier:''},{calf_gender:null},{calf_purpose:null},{weight_kg:'0'},{weight_kg:'1.001'},{date:'2026-02-30'},{expected_pregnancy:'PREGNANCY'}])assert.equal(birthInputSchema.safeParse({...input,...change}).success,false);
 assert.equal('cost' in birthInputSchema.parse({...input,cost:'10'}),false);
});
test('stillborn clears hidden live-animal fields rather than creating a phantom calf',()=>{
 assert.equal(birthInputSchema.safeParse({...input,outcome:'stillborn'}).success,false);assert.equal(birthInputSchema.safeParse({...input,outcome:'stillborn',calf_identifier:'',calf_gender:null,calf_purpose:null,weight_kg:null}).success,true);
});
test('birth review binds pregnancy, mother, farm, production, weight and purpose',()=>{
 validateBirthReview(review(),input);for(const change of [{expected_pregnancy:id},{expected_farm:id},{calf_identifier:'0002'},{calf_purpose:'dairy' as const},{weight_kg:'33'}])assert.throws(()=>validateBirthReview(review(),{...input,...change}));assert.throws(()=>ensureBirthScope(review(),id,'beef',farm));
});
test('birth confirmation needs held review and sends only token with explicit calf purpose',async()=>{
 const f=await fixture();await assert.rejects(f.controller.confirmBirth(id,'dairy',input,review()));const held=await f.controller.previewBirth(id,'dairy',input);const result=await f.controller.confirmBirth(id,'dairy',input,held);assert.equal(result.calf_id,calf);assert.equal(result.calf_purpose,'beef');assert.deepEqual(f.calls.at(-1)?.body,{preview_token:held.preview_token});assert.equal(f.calls.at(-1)?.params.view,'mobile-confirm');await assert.rejects(f.controller.confirmBirth(id,'dairy',input,held));
});
test('birth changed pregnancy or refreshed readonly permission blocks preview',async()=>{
 const f=await fixture();f.changed(true);await assert.rejects(f.controller.previewBirth(id,'dairy',input),BirthContextChanged);f.changed(false);f.actor({...user,access:{...user.access,read_only:true}});await assert.rejects(f.controller.previewBirth(id,'dairy',input));assert.equal(f.calls.some(c=>c.params?.view==='mobile-preview'),false);
});
test('birth known validation and uncertain result stay distinct without automatic replay',async()=>{
 const f=await fixture();for(const mode of ['400','409','408','503','invalid'] as const){const held=await f.controller.previewBirth(id,'dairy',input);f.mode(mode);await assert.rejects(f.controller.confirmBirth(id,'dairy',input,held),e=>['400','409'].includes(mode)?!(e instanceof BirthSaveUnconfirmed):e instanceof BirthSaveUnconfirmed);await assert.rejects(f.controller.confirmBirth(id,'dairy',input,held));}assert.equal(f.calls.filter(c=>c.params?.view==='mobile-confirm').length,5);
});
test('birth readonly/feeder, simultaneous action and logout guards prevent writes',async()=>{
 for(const actor of [{...user,access:{...user.access,read_only:true}},{...user,access:{...user.access,role:'feeder' as const}}]){const f=await fixture(actor);await assert.rejects(f.controller.previewBirth(id,'dairy',input));assert.equal(f.calls.some(c=>c.params?.view==='mobile-preview'),false);}
 const f=await fixture();let release!:()=>void;f.hold(()=>new Promise<void>(resolve=>{release=resolve;}));const pending=f.controller.previewBirth(id,'dairy',input);while(!release)await new Promise(resolve=>setTimeout(resolve,0));await assert.rejects(f.controller.previewBirth(id,'dairy',input));await f.controller.signOut();release();await assert.rejects(pending);assert.equal(f.calls.some(c=>c.params?.view==='mobile-preview'),false);
});
test('birth copy covers organization locales and both outcomes',()=>{for(const locale of ['pt-BR','en','es','pt-PT'] as const)assert.deepEqual(Object.keys(birthMessages[locale]).sort(),Object.keys(birthMessages['pt-BR']).sort());});
