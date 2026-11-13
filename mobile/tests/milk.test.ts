import assert from 'node:assert/strict';
import { test } from 'node:test';
import { create,type AxiosAdapter } from 'axios';
import { milkSummarySchema,milkValuesSchema,milkPayload,milkTotalSchema,isPeriodMilkTotal,milkTotalDateLabel,type MilkCommand } from '../src/features/milk/contracts';
import { milkMessages } from '../src/features/milk/messages';
import { organizationDay } from '../src/features/workspace/contracts';
import { createAuthApi, MilkPeriodReadOnly, AuthFailure } from '../src/services/authApi';
import { SessionController } from '../src/features/auth/sessionController';
import { userSchema } from '../src/features/auth/contracts';
const id='00000000-0000-4000-8000-000000000001',foreign='00000000-0000-4000-8000-000000000002';
const user=userSchema.parse({id,full_name:'Teste',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'manager',can_manage_users:true,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const values={liters:'12,25',discarded_liters:'0',discard_reason:'',notes:'Turno'};
test('milk validation compares exact hundredths, requires discard reason and preserves text payload',()=>{
 const schema=milkValuesSchema('individual');assert.deepEqual(milkPayload(schema.parse(values)),{...values,liters:'12.25'});
 for(const change of [{liters:'0'},{liters:'12.251'},{discarded_liters:'12.26',discard_reason:'Teste'},{discarded_liters:'1'},{liters:'1.234,56'},{liters:'10000000.00'}])assert.equal(schema.safeParse({...values,...change}).success,false);
 assert.equal(schema.safeParse({...values,liters:'0,29',discarded_liters:'0,29',discard_reason:'Carência'}).success,true);
 assert.equal(milkValuesSchema('total').safeParse({...values,liters:'123456789,99'}).success,true);
});
test('aggregate summary preserves unknown counts/average and accepts the actual numeric read model',()=>{
 const summary=milkSummarySchema.parse({produced_liters:950,discarded_liters:'50.00',usable_liters:900,milked_cows:null,expected_cows:2,pending_cows:null,average_per_milked_cow:null,aggregate_mode:true});assert.equal(summary.produced_liters,'950');assert.equal(summary.milked_cows,null);assert.equal(summary.average_per_milked_cow,null);
});
async function fixture(actor=user){
 const today=organizationDay('UTC');let readonly=false;let periodStart:string|null|undefined;let aggregate=false;let milked=0;let receiptPeriod=false;const writes:{path:string;method:string;body:Record<string,unknown>;params:unknown}[]=[];const calls:string[]=[];let priorFarm=id;
 const record={id,animal:id,identifier:'0007',farm_name:'Fazenda',date:today,session:'morning',liters:'12.25',discarded_liters:'0',discard_reason:'',notes:''};
 const adapter:AxiosAdapter=async config=>{
  const path=config.url!;calls.push(path);let data:unknown={};
  if(path==='auth/login/')data={access:'fake',refresh:'fake'};else if(path==='auth/me/')data=actor;else if(path==='organizations/me/')data={id:'org',name:'Org',language:'pt-BR'};else if(path==='tasks/agenda-options/')data={user_id:id,role:actor.access.role,read_only:readonly,timezone:'UTC'};
  else if(path===`livestock/cattle/animals/${id}/`)data={id,identifier:'0007',farm:id,farm_name:'Fazenda',cattle_purpose:'dairy',gender:'F',category:'Vaca',status:'active',birth_date:null,entry_date:'2020-01-01',current_weight_kg:null,reproductive_status:'lactante',is_lactating:true,milk_withdrawal_until:null,meat_withdrawal_until:null,notes:''};
  else if(path===`livestock/cattle/milk/${id}/`)data=record;
  else if(path===`livestock/cattle/milk-totals/${id}/`)data={...record,farm:priorFarm,period_start:periodStart};
  else if(path==='livestock/cattle/milk/day-summary/')data={produced_liters:'0',discarded_liters:'0',usable_liters:'0',milked_cows:milked,expected_cows:2,pending_cows:2,average_per_milked_cow:null,aggregate_mode:aggregate};
  if(['post','patch'].includes(config.method??'')&&path.startsWith('livestock/cattle/milk')){const body=JSON.parse(config.data);writes.push({path,method:config.method!,body,params:config.params});data=path.includes('milk-totals')?{...record,farm:id,period_start:receiptPeriod?'2020-01-01':periodStart,...body}:{...record,...body};}
  return {data,status:200,statusText:'OK',headers:{},config};
 };
 const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','password');
 const command:MilkCommand={mode:'individual',farm:id,animal:id,date:today,session:'morning'};
 return {controller,writes,calls,command,today,period:(start:string|null|undefined)=>{periodStart=start;},aggregate:()=>{aggregate=true;},individualProduction:()=>{milked=1;},wrongReceipt:()=>{receiptPeriod=true;},readonly:()=>{readonly=true;},foreignTotal:()=>{priorFarm=foreign;}};
}
test('individual and total writes use distinct endpoints, corrections do not rewrite identity',async()=>{
 const f=await fixture();await f.controller.saveMilk(f.command,values);assert.deepEqual(f.writes[0]?.body,{liters:'12.25',discarded_liters:'0',discard_reason:'',notes:'Turno',animal:id,date:f.today,session:'morning'});
 await f.controller.saveMilk({...f.command,id},values);assert.equal(f.writes[1]?.method,'patch');assert.deepEqual(f.writes[1]?.body,{liters:'12.25',discarded_liters:'0',discard_reason:'',notes:'Turno'});
 await f.controller.saveMilk({mode:'total',date:f.today,farm:id},values);assert.equal(f.writes[2]?.path,'livestock/cattle/milk-totals/');assert.equal('animal' in f.writes[2]!.body,false);assert.equal('session' in f.writes[2]!.body,false);
});
test('readonly, feeder, future dates, changed identity and unauthorized corrections stop before mutation',async()=>{
 const f=await fixture();f.readonly();await assert.rejects(f.controller.saveMilk(f.command,values));assert.equal(f.writes.length,0);
 const feeder=await fixture({...user,access:{...user.access,role:'feeder'}});await assert.rejects(feeder.controller.saveMilk(feeder.command,values));assert.equal(feeder.writes.length,0);
 const operator=await fixture({...user,access:{...user.access,role:'operator'}});await assert.rejects(operator.controller.saveMilk({...operator.command,id},values));assert.equal(operator.writes.length,0);
 const changed=await fixture();changed.foreignTotal();await assert.rejects(changed.controller.saveMilk({mode:'total',date:changed.today,farm:id,id},values));await assert.rejects(changed.controller.saveMilk({...changed.command,date:'2999-01-01'},values));assert.equal(changed.writes.length,0);
});
test('milk catalogs are complete in all supported languages',()=>{for(const copy of Object.values(milkMessages))assert.deepEqual(Object.keys(copy).sort(),Object.keys(milkMessages['pt-BR']).sort());});
test('period metadata distinguishes daily totals and preserves dates in labels',()=>{
 const base={id,farm:id,farm_name:'Fazenda',date:'2026-11-13',liters:'100',discarded_liters:'0',discard_reason:'',notes:''};
 for(const period_start of [undefined,null,base.date])assert.equal(isPeriodMilkTotal(milkTotalSchema.parse({...base,period_start})),false);
 const total=milkTotalSchema.parse({...base,period_start:'2026-11-10'});assert.equal(isPeriodMilkTotal(total),true);assert.match(milkTotalDateLabel(total,'pt-BR'),/10.*13/);
 assert.equal(milkTotalSchema.safeParse({...base,period_start:'2026-11-14'}).success,false);
});
test('period correction is blocked before mutation using a fresh record',async()=>{
 const f=await fixture();f.period('2020-01-01');await assert.rejects(f.controller.saveMilk({mode:'total',farm:id,date:f.today,id},values),MilkPeriodReadOnly);assert.equal(f.writes.length,0);
});
test('daily corrections preserve identity and request the mobile server guard',async()=>{
 for(const start of [undefined,null]){const f=await fixture();f.period(start);await f.controller.saveMilk({mode:'total',farm:id,date:f.today,id},values);assert.deepEqual(f.writes[0]?.params,{view:'mobile'});assert.equal('period_start' in f.writes[0]!.body,false);}
});
test('existing aggregate or individual production prevents a new total',async()=>{
 for(const kind of ['aggregate','individualProduction'] as const){const f=await fixture();f[kind]();await assert.rejects(f.controller.saveMilk({mode:'total',farm:id,date:f.today},values));assert.equal(f.writes.length,0);}
});
test('unexpected period receipt after writing remains an uncertain mutation',async()=>{
 const f=await fixture();f.wrongReceipt();await assert.rejects(f.controller.saveMilk({mode:'total',farm:id,date:f.today},values),error=>!(error instanceof AuthFailure));assert.equal(f.writes.length,1);
});
test('total queries include the selected day and reject responses outside farm or interval',async()=>{
 let params:unknown;let farm=id;let end='2026-11-13';
 const adapter:AxiosAdapter=async config=>{params=config.params;return {data:{count:1,next:null,previous:null,results:[{id,farm,farm_name:'Fazenda',date:end,period_start:'2026-11-10',liters:'100',discarded_liters:'0',discard_reason:'',notes:''}]},status:200,statusText:'OK',headers:{},config};};
 const api=createAuthApi('https://example.com/api/v1/',create({adapter}));const query={kind:'totals' as const,date:'2026-11-11',farm:id,page:1,search:''};
 const result=await api.milkPage({access:'fake',refresh:'fake'},'pt-BR',query);assert.equal(result.results.length,1);assert.deepEqual(params,{farm:id,page:1,search:'',covering_date:query.date,page_size:20});
 farm=foreign;await assert.rejects(api.milkPage({access:'fake',refresh:'fake'},'pt-BR',query));farm=id;end='2026-11-10';await assert.rejects(api.milkPage({access:'fake',refresh:'fake'},'pt-BR',query));
});
