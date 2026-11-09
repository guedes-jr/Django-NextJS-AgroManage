import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,MedicationSaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {canApplyMedication,medicationInputSchema,medicationReviewSchema,validateMedicationReview,type MedicationInput} from '../src/features/clinic/medicationContracts';
import {medicationMessages} from '../src/features/clinic/medicationMessages';
const id='00000000-0000-4000-8000-000000000001',animal='00000000-0000-4000-8000-000000000002',farm='00000000-0000-4000-8000-000000000003',lot='00000000-0000-4000-8000-000000000004';
const user=userSchema.parse({id,full_name:'Manager',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'manager',can_manage_users:false,can_view_financial:true,can_operate_crops:true,livestock_species:null,read_only:false}});
const input:MedicationInput={animal,expected_farm:farm,inventory_lot:lot,expected_unit:'ml',quantity:'2.5',date:'2026-11-08',description:'Medication performed',responsible:'Professional',notes:'Recorded',milk_withdrawal_until:'2026-11-11',meat_withdrawal_until:'2026-11-11'};
const lotData={id:lot,item:id,name:'Medicine',unit:'ml',number:'MED-1',balance:'20.00',expiry:null,received:'2026-11-08',withdrawal_days:3};
const review=()=>medicationReviewSchema.parse({animal:{id:animal,identifier:'A',farm,farm_name:'Farm'},lot:lotData,quantity:'2.50',remaining:'17.50',minimum_withdrawal:'2026-11-11',command:input,preview_token:'synthetic'});
async function fixture(actor=user){const calls:{path:string;body:unknown;method:string}[]=[];let mode:'ok'|'400'|'409'|'503'|'408'|'invalid'='ok',species='bovinos',returnedUser=actor;let hold:(()=>Promise<void>)|undefined;
 const adapter:AxiosAdapter=async config=>{const path=config.url!,body=config.data?JSON.parse(config.data):undefined;calls.push({path,body,method:config.method!});if(path==='auth/me/')await hold?.();let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?returnedUser:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
 if(path==='livestock/clinical/records/mobile-animals/')data={count:1,next:null,previous:null,results:[{id:animal,identifier:'A',farm,farm_name:'Farm',species}]};
 if(path.endsWith('mobile-medication-options/'))data={today:'2026-11-08',timezone:'America/Fortaleza'};
 if(path.endsWith('mobile-medication-lots/'))data={count:1,next:null,previous:null,results:[lotData]};
 if(path.endsWith('mobile-medication-preview/'))data={...review(),command:body};
 if(path.endsWith('mobile-medication-confirm/')){if(['400','409','503','408'].includes(mode))throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{},status:Number(mode),statusText:'test',headers:{}});data=mode==='invalid'?{}:{id,management:lot};}
 return {config,data,status:200,statusText:'OK',headers:{}};};
 const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,calls,mode:(value:typeof mode)=>{mode=value;},species:(value:string)=>{species=value;},actor:(value:typeof actor)=>{returnedUser=value;},hold:(value:()=>Promise<void>)=>{hold=value;}};
}
test('medication preserves managerial access rather than expanding bovine operator permissions',async()=>{
 assert.equal(canApplyMedication(user),true);for(const role of ['operator','feeder'] as const){const actor={...user,access:{...user.access,role,livestock_species:['bovinos']}};assert.equal(canApplyMedication(actor),false);const f=await fixture(actor);await assert.rejects(f.controller.medicationOptions());await assert.rejects(f.controller.previewMedication(input));assert.equal(f.calls.some(c=>c.path.includes('mobile-medication')),false);}
});
test('medication validates stock-unit quantity, real manual withdrawal dates and excludes cost',()=>{
 assert.equal(medicationInputSchema.parse({...input,quantity:'2,50'}).quantity,'2.5');assert.equal('cost' in medicationInputSchema.parse({...input,cost:20}),false);
 for(const change of [{quantity:'0'},{quantity:'0.001'},{quantity:'100000000'},{animal:'A'},{description:''},{description:'x'.repeat(201)},{milk_withdrawal_until:'2026-11-07'}])assert.equal(medicationInputSchema.safeParse({...input,...change}).success,false);
});
test('medication review binds complete command, animal, farm, lot and actual product unit',()=>{
 validateMedicationReview(review(),input);for(const change of [{animal:id},{inventory_lot:id},{expected_farm:id},{expected_unit:'l'},{quantity:'3'},{milk_withdrawal_until:'2026-11-12'},{notes:'Changed'}])assert.throws(()=>validateMedicationReview(review(),{...input,...change}));
 assert.throws(()=>validateMedicationReview({...review(),lot:{...review().lot,unit:'l'}},input));
});
test('medication confirmation requires held review and sends only token once',async()=>{
 const f=await fixture();await f.controller.medicationOptions();assert.equal((await f.controller.medicationLots(1,'Medicine')).count,1);await assert.rejects(f.controller.confirmMedication(input,review()));const held=await f.controller.previewMedication(input);await assert.rejects(f.controller.confirmMedication({...input,notes:'Changed'},held));assert.deepEqual(await f.controller.confirmMedication(input,held),{id,management:lot});assert.deepEqual(f.calls.at(-1)?.body,{preview_token:held.preview_token});await assert.rejects(f.controller.confirmMedication(input,held));assert.equal(f.calls.filter(c=>c.path.endsWith('mobile-medication-confirm/')).length,1);
});
test('medication rejects changed bovine scope or fresh role without mutation',async()=>{
 const f=await fixture();f.species('suinos');await assert.rejects(f.controller.previewMedication(input));assert.equal(f.calls.some(c=>c.path.endsWith('mobile-medication-preview/')),false);f.species('bovinos');const held=await f.controller.previewMedication(input);f.actor({...user,access:{...user.access,role:'operator',livestock_species:['bovinos']}});await assert.rejects(f.controller.confirmMedication(input,held));assert.equal(f.calls.some(c=>c.path.endsWith('mobile-medication-confirm/')),false);
});
test('medication uncertain outcomes cannot repeat a sent review and known conflicts remain distinct',async()=>{
 const f=await fixture();for(const mode of ['400','409','503','408','invalid'] as const){const held=await f.controller.previewMedication(input);f.mode(mode);await assert.rejects(f.controller.confirmMedication(input,held),e=>['400','409'].includes(mode)?!(e instanceof MedicationSaveUnconfirmed):e instanceof MedicationSaveUnconfirmed);await assert.rejects(f.controller.confirmMedication(input,held));}assert.equal(f.calls.filter(c=>c.path.endsWith('mobile-medication-confirm/')).length,5);
});
test('medication preflight cannot confirm after logout or concurrent tap',async()=>{
 const f=await fixture();const held=await f.controller.previewMedication(input);let release!:()=>void;f.hold(()=>new Promise<void>(resolve=>{release=resolve;}));const pending=f.controller.confirmMedication(input,held);while(!release)await new Promise(resolve=>setTimeout(resolve,0));await assert.rejects(f.controller.confirmMedication(input,held));await f.controller.signOut();release();await assert.rejects(pending);assert.equal(f.calls.some(c=>c.path.endsWith('mobile-medication-confirm/')),false);
});
test('medication catalogs cover all organizational languages',()=>{for(const locale of ['pt-BR','en','es','pt-PT'] as const)assert.deepEqual(Object.keys(medicationMessages[locale]).sort(),Object.keys(medicationMessages['pt-BR']).sort());});
