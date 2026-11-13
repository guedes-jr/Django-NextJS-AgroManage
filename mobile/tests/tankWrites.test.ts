import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,TankRecordUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {organizationDay} from '../src/features/workspace/contracts';
import {tankCommand,tankWriteCommandSchema,validateTankReceipt,canWriteTankRecord,type TankDraft,type TankWriteCommand} from '../src/features/milk/tankWriteContracts';
import {tankWriteMessages} from '../src/features/milk/tankWriteMessages';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',key='33333333-3333-4333-8333-333333333333',today=organizationDay('UTC');
const user=userSchema.parse({id,full_name:'Teste',email:'test@example.invalid',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'manager',can_manage_users:true,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const draft:TankDraft={date:today,kind:'production',liters:'12,25',buyer:'',driver:'',vehicle:'',document:'',reason:'',notes:'Teste',sample:'',temperature_c:'',fat_percent:'',protein_percent:'',scc:'',tbc:'',antibiotics:'not_tested'};
const command=tankCommand('movement',id,id,draft,key);
const base={id,tank:id,farm:id,tank_name:'T1',farm_name:'F1',date:today,notes:'Teste',recorded_by:'Teste'};
const row={...base,timezone:'UTC',kind:'production',liters:'12.25',buyer:'',driver:'',vehicle:'',document:'',reason:'',cancelled_at:null,cancellation_reason:''};
function receipt(c:TankWriteCommand){return c.mode==='quality'?{...base,...c,id:other}:c.mode==='cancel'?{...row,cancelled_at:'2026-11-13T12:00:00Z',cancellation_reason:c.reason}:{...row,...c,liters:Number(c.liters).toFixed(2)};}
async function fixture(){
 let actor=user,mode='normal',foreign=false,wait:(()=>Promise<void>)|undefined;const writes:{path:string;body:Record<string,unknown>;params:unknown}[]=[];const store=new Map<string,unknown>();
 const adapter:AxiosAdapter=async config=>{
  const path=config.url!;let data:unknown={};
  if(path==='auth/login/')data={access:'fake',refresh:'fake'};
  else if(path==='auth/me/')data=actor;
  else if(path==='organizations/me/')data={id:'org',name:'Org',language:'pt-BR'};
  else if(path==='tasks/agenda-options/'){await wait?.();data={user_id:id,role:actor.access.role,read_only:actor.access.read_only,timezone:'UTC'};}
  else if(path===`livestock/cattle/milk-tanks/${id}/`)data={id,farm:foreign?other:id,farm_name:'F1',name:'T1',capacity_liters:'1000.00',balance_liters:'100.00',is_active:true,notes:''};
  else if(path.includes('production-available/'))data={date:today,produced_usable:'1000',allocated:'100',available:'900'};
  else if(path.includes('/receipt/'))data=store.get(config.params.request_key);
  else if(path===`livestock/cattle/milk-tank-movements/${id}/`)data=row;
  if(config.method==='post'&&path.startsWith('livestock/cattle/milk-tank')){
   const body=JSON.parse(config.data);writes.push({path,body,params:config.params});const c=tankWriteCommandSchema.parse(path.endsWith('/cancel/')?{mode:'cancel',tank:id,farm:id,id,...body}:{mode:path.includes('quality')?'quality':'movement',farm:id,...body});data=receipt(c);if(c.mode!=='cancel')store.set(c.request_key,data);
   if(mode==='invalid')throw new AxiosError('invalid','ERR_BAD_REQUEST',config,undefined,{status:400,data:{liters:['Saldo insuficiente']},headers:{},statusText:'Bad Request',config});
   if(mode==='timeout')throw new AxiosError('timeout','ECONNABORTED',config);if(mode==='malformed')data={...data as object,farm:other};
  }
  return {data,status:200,statusText:'OK',headers:{},config};
 };
 const api=createAuthApi('https://example.com/api/v1/',create({adapter}));const controller=new SessionController(api,{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.invalid','synthetic');
 return {controller,writes,actor:(v:typeof user)=>{actor=v;},mode:(v:string)=>{mode=v;},foreign:()=>{foreign=true;},wait:(fn:()=>Promise<void>)=>{wait=fn;}};
}
test('movement requires exact positive volume buyer/reason and strips hidden collection values',()=>{
 assert.equal(command.mode==='movement'?command.liters:'','12.25');for(const liters of ['0','-1','1.001','1e3','1000000000'])assert.throws(()=>tankCommand('movement',id,id,{...draft,liters},key));for(const kind of ['collection','discard'])assert.throws(()=>tankCommand('movement',id,id,{...draft,kind},key));
 const c=tankCommand('movement',id,id,{...draft,buyer:'Hidden',notes:'  Teste  '},key);assert.equal('notes' in c?c.notes:'','Teste');assert.equal(c.mode==='movement'?c.buyer:'','');assert.equal('unit_price' in tankWriteCommandSchema.parse({...c,unit_price:'2'}),false);
});
test('quality distinguishes zero from null and enforces decimal/count bounds',()=>{
 assert.throws(()=>tankCommand('quality',id,id,draft,key));const c=tankCommand('quality',id,id,{...draft,fat_percent:'0',scc:'0',temperature_c:'-1,25'},key);assert.equal(c.mode==='quality'?c.protein_percent:0,null);assert.equal(c.mode==='quality'?c.scc:null,0);
 for(const change of [{fat_percent:'100.01'},{scc:'2147483648'},{scc:'1.1'},{temperature_c:'-273.16'},{protein_percent:'1e1'}])assert.throws(()=>tankCommand('quality',id,id,{...draft,...change},key));assert.throws(()=>tankCommand('cancel',id,id,draft,key,id));
});
test('receipts validate exact scope volume fields and cancellation reason',()=>{
 assert.equal(validateTankReceipt(command,row).id,id);for(const changed of [{farm:other},{tank:other},{liters:'12.26'},{cancelled_at:'2026-11-13T12:00:00Z'},{date:'2020-01-01'}])assert.throws(()=>validateTankReceipt(command,{...row,...changed}));const c=tankCommand('cancel',id,id,{...draft,reason:'Correção'},key,id);assert.throws(()=>validateTankReceipt(c,row));assert.equal(validateTankReceipt(c,receipt(c)).id,id);
});
test('review reads available production; writes use sanitized mobile commands and explicit keys',async()=>{
 const f=await fixture();assert.equal((await f.controller.tankRecordContext(command)).available?.available,'900');assert.equal(f.writes.length,0);await f.controller.saveTankRecord(command);await f.controller.saveTankRecord(tankCommand('quality',id,id,{...draft,antibiotics:'negative'},key));assert.deepEqual(f.writes[0]?.params,{view:'mobile',farm:id,tank:id});assert.equal(f.writes[0]?.body.request_key,key);assert.equal(f.writes[0]?.body.liters,'12.25');for(const field of ['mode','farm','unit_price'])assert.equal(field in f.writes[0]!.body,false);
});
test('uncertain writes reconcile by key with GET without replay; known 400 stays distinct',async()=>{
 for(const mode of ['timeout','malformed']){const f=await fixture();f.mode(mode);await assert.rejects(f.controller.saveTankRecord(command),TankRecordUnconfirmed);assert.equal(f.writes.length,1);assert.equal((await f.controller.reconcileTankRecord(command)).id,id);assert.equal(f.writes.length,1);}const f=await fixture();f.mode('invalid');await assert.rejects(f.controller.saveTankRecord(command),e=>e instanceof AxiosError&&!(e instanceof TankRecordUnconfirmed));
});
test('fresh readonly role farm future date logout and concurrent intents block before writing',async()=>{
 for(const actor of [{...user,access:{...user.access,read_only:true}},{...user,access:{...user.access,role:'feeder' as const}}]){const f=await fixture();f.actor(actor);await assert.rejects(f.controller.saveTankRecord(command));assert.equal(f.writes.length,0);}const foreign=await fixture();foreign.foreign();await assert.rejects(foreign.controller.saveTankRecord(command));assert.equal(foreign.writes.length,0);
 const future=await fixture();await assert.rejects(future.controller.saveTankRecord({...command,...(command.mode==='movement'?{date:'2999-01-01'}:{})}));assert.equal(future.writes.length,0);
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const f=await fixture();f.wait(()=>gate);const first=f.controller.saveTankRecord(command);await assert.rejects(f.controller.saveTankRecord(command));await f.controller.signOut();release();await assert.rejects(first);assert.equal(f.writes.length,0);
});
test('cancel remains manager-only and posts a required reason without finance',async()=>{
 const c=tankCommand('cancel',id,id,{...draft,reason:'Correção'},key,id),f=await fixture();await f.controller.saveTankRecord(c);assert.deepEqual(f.writes[0]?.body,{reason:'Correção'});const operator={...user,access:{...user.access,role:'operator' as const}};assert.equal(canWriteTankRecord(operator,'movement'),true);assert.equal(canWriteTankRecord(operator,'cancel'),false);const denied=await fixture();denied.actor(operator);await assert.rejects(denied.controller.saveTankRecord(c));assert.equal(denied.writes.length,0);
});
test('write catalogs cover every organization language',()=>{for(const copy of Object.values(tankWriteMessages))assert.deepEqual(Object.keys(copy).sort(),Object.keys(tankWriteMessages['pt-BR']).sort());});
