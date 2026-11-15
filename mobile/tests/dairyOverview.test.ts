import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,type AxiosAdapter} from 'axios';
import {dairyOverviewSchema,dairyReferenceDate} from '../src/features/cattle/dairyOverviewContracts';
import {dairyMessages} from '../src/features/cattle/dairyMessages';
import {createAuthApi} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
const snapshot={date:'2026-11-13',herd_as_of:'2026-11-14',lactating_cows:12,total_cows:20,non_lactating_cows:8,young_females:4,bulls:1,monthly_produced_liters:'12345.60',monthly_discarded_liters:0,monthly_average_per_lactating_cow:null,milked_cows:null};
const user=userSchema.parse({id:'user',full_name:'Test',email:'test@example.invalid',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'operator',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:true}});
function fixture(actor=user,read:()=>Promise<unknown>=async()=>snapshot){
 const calls:{path:string|undefined;params:unknown;language:unknown}[]=[];
 const adapter:AxiosAdapter=async config=>{calls.push({path:config.url,params:config.params,language:config.headers['Accept-Language']});const data=config.url==='auth/login/'?{access:'fake',refresh:'fake'}:config.url==='auth/me/'?actor:config.url==='organizations/me/'?{id:'org',name:'Test',language:'es'}:config.url==='livestock/cattle/dairy-overview/'?await read():{};return {data,status:200,statusText:'OK',headers:{},config};};
 const controller=new SessionController(createAuthApi('https://example.invalid/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');
 return {controller,calls};
}
test('dairy summary preserves monthly precision, unknown average and current herd date',()=>{
 const result=dairyOverviewSchema.parse({...snapshot,cost:100});
 assert.equal(result.monthly_produced_liters,'12345.60');assert.equal(result.monthly_discarded_liters,'0');assert.equal(result.monthly_average_per_lactating_cow,null);assert.equal(result.herd_as_of,'2026-11-14');assert.equal('cost' in result,false);
 for(const change of [{total_cows:-1},{monthly_discarded_liters:'-1'},{monthly_average_per_lactating_cow:'NaN'},{date:'2026-02-30'}])assert.equal(dairyOverviewSchema.safeParse({...snapshot,...change}).success,false);
});
test('reference date accepts leap days and rejects impossible or future dates',()=>{
 assert.equal(dairyReferenceDate('2028-02-29','2028-03-01'),'2028-02-29');
 for(const date of ['2026-02-29','2026-11-14','13/11/2026',''])assert.equal(dairyReferenceDate(date,'2026-11-13'),null);
});
test('readonly dairy summary uses the web endpoint with date and organization language, without a global farm filter',async()=>{
 const f=fixture();await f.controller.signIn('test@example.invalid','test');await f.controller.dairyOverview(snapshot.date);
 assert.deepEqual(f.calls.at(-1),{path:'livestock/cattle/dairy-overview/',params:{date:snapshot.date},language:'es'});
 assert.equal(f.calls.some(call=>call.path?.includes('finance')),false);
});
test('summary rejects a mismatched date and malformed requests',async()=>{
 const f=fixture(user,async()=>({...snapshot,date:'2026-11-12'}));await f.controller.signIn('test@example.invalid','test');await assert.rejects(f.controller.dairyOverview(snapshot.date));
 const count=f.calls.length;await assert.rejects(f.controller.dairyOverview('2026-02-30'));assert.equal(f.calls.length,count);
});
test('summary preserves cattle access restrictions before any request',async()=>{
 for(const actor of [{...user,force_password_change:true},{...user,access:{...user.access,role:'feeder' as const}},{...user,access:{...user.access,livestock_species:['suinos']}}]){
  const f=fixture(actor);await f.controller.signIn('test@example.invalid','test');await assert.rejects(f.controller.dairyOverview(snapshot.date));assert.equal(f.calls.some(call=>call.path?.includes('dairy-overview')),false);
 }
});
test('summary arriving after logout cannot restore session data',async()=>{
 let release!:(value:unknown)=>void;const gate=new Promise(resolve=>{release=resolve;});const f=fixture(user,()=>gate);await f.controller.signIn('test@example.invalid','test');const pending=f.controller.dairyOverview(snapshot.date);await f.controller.signOut();release(snapshot);await assert.rejects(pending);
});
test('dairy overview translations cover all organization languages',()=>{
 for(const copy of Object.values(dairyMessages))assert.deepEqual(Object.keys(copy).sort(),Object.keys(dairyMessages['pt-BR']).sort());
});
