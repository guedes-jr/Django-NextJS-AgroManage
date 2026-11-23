import { vetBillingSchema, vetSettlementTotal, veterinaryMonthSchema } from '../src/features/veterinary/contracts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,type AxiosAdapter} from 'axios';
import {createAuthApi} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {canUseVeterinary,curralRows,curralSummary,daysBetween,vetAnimalSchema,type VetAnimal} from '../src/features/veterinary/contracts';
import {fill,veterinaryMessages} from '../src/features/veterinary/messages';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const vet=userSchema.parse({id:id(1),full_name:'Dra. Ana',email:'vet@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,
  access:{role:'veterinarian',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:[],read_only:false,veterinary:true,segment_features:{'area-veterinario':{agenda:false}}}});
const animal=(n:number,patch:Partial<VetAnimal>={}):VetAnimal=>vetAnimalSchema.parse({
  id:id(100+n),client:id(10),client_name:'Manuel',farm_name:'Boa Vista',identifier:String(n),name:'',category:'vaca_solteira',status:'open',
  next:{code:'first',day:null,date:null},deadline:'nodate',procedures_count:0,last:null,...patch,
});

test('veterinary area requires the contracted segment and an allowed role',()=>{
  assert.equal(canUseVeterinary(vet),true);
  assert.equal(canUseVeterinary({...vet,access:{...vet.access,veterinary:false}}),false);
  assert.equal(canUseVeterinary({...vet,access:{...vet.access,role:'manager'}}),true);
  for(const role of ['operator','feeder'] as const)assert.equal(canUseVeterinary({...vet,access:{...vet.access,role}}),false);
  assert.equal(canUseVeterinary({...vet,force_password_change:true}),false);
  // Older payloads without the field keep the area closed.
  const legacy=userSchema.parse({...vet,access:{role:'admin',can_manage_users:true,can_view_financial:true,can_operate_crops:true,livestock_species:null,read_only:false}});
  assert.equal(canUseVeterinary(legacy),false);
});

test('corral list filters by preset, client and search and orders by deadline and date',()=>{
  const rows=[
    animal(1,{deadline:'week',status:'protocol',next:{code:'alert_removal',day:8,date:'2026-11-25'}}),
    animal(2,{deadline:'late',status:'inseminated',next:{code:'alert_ultrasound',day:null,date:'2026-11-18'}}),
    animal(3,{deadline:'today',status:'pregnant',next:{code:'alert_calving',day:null,date:'2026-11-22'},client:id(11),client_name:'Antônio',name:'Mimosa'}),
    animal(4),
  ];
  assert.deepEqual(curralRows(rows,{preset:'week',client:'',search:''}).map(r=>r.identifier),['2','3','1']);
  assert.deepEqual(curralRows(rows,{preset:'all',client:'',search:''}).map(r=>r.identifier),['2','3','1','4']);
  assert.deepEqual(curralRows(rows,{preset:'late',client:'',search:''}).map(r=>r.identifier),['2']);
  assert.deepEqual(curralRows(rows,{preset:'protocol',client:'',search:''}).map(r=>r.identifier),['1']);
  assert.deepEqual(curralRows(rows,{preset:'all',client:id(11),search:''}).map(r=>r.identifier),['3']);
  assert.deepEqual(curralRows(rows,{preset:'all',client:'',search:'antonio'}).map(r=>r.identifier),['3']);
  assert.deepEqual(curralRows(rows,{preset:'all',client:'',search:'mimosa'}).map(r=>r.identifier),['3']);
  assert.deepEqual(curralSummary(rows),{late:1,today:1,week:1});
  assert.equal(daysBetween('2026-11-18','2026-11-22'),4);
});

test('veterinary reads use the area endpoints and drop billing values from the payload',async()=>{
  const calls:string[]=[];
  const adapter:AxiosAdapter=async config=>{const path=config.url!;calls.push(path);let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?vet:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
    if(path==='veterinary/workspace/')data={today:'2026-11-22',open_alerts:2,role:'veterinarian',features:{finance:false},settings:{price_ultrasound:'15.00'},team:[],can_wipe:false};
    if(path==='veterinary/animals/')data=[{...animal(1),last:{kind:'ultrasound',date:'2026-11-20',result:'open',value:'15.00',paid:false}}];
    if(path==='veterinary/clients/')data=[{id:id(10),name:'Manuel',farm_name:'Boa Vista',receivable:'15.00',phone:'73999990000'}];
    return {config,data,status:200,statusText:'OK',headers:{}};};
  const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');
  await controller.signIn('vet@example.com','synthetic');
  assert.equal((await controller.vetWorkspace()).open_alerts,2);
  const row=(await controller.vetAnimals())[0]!;
  assert.equal(row.identifier,'1');assert.equal('value' in (row.last as object),false);
  const client=(await controller.vetClients())[0]!;
  assert.equal('receivable' in client,false);
  assert.deepEqual(calls.filter(p=>p.startsWith('veterinary/')),['veterinary/workspace/','veterinary/animals/','veterinary/clients/']);
});

test('veterinary reads are refused without the area',async()=>{
  const blocked={...vet,access:{...vet.access,veterinary:false}};
  const adapter:AxiosAdapter=async config=>{const path=config.url!;const data=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?blocked:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};return {config,data,status:200,statusText:'OK',headers:{}};};
  const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');
  await controller.signIn('vet@example.com','synthetic');
  await assert.rejects(controller.vetAnimals());
});

test('veterinary copy is complete in the four organization languages',()=>{
  const base=veterinaryMessages['pt-BR'];
  for(const language of ['pt-BR','en','es','pt-PT'] as const){
    const copy=veterinaryMessages[language];
    assert.deepEqual(Object.keys(copy).sort(),Object.keys(base).sort());
    for(const group of ['presets','status','deadline','nextCode','kind','category'] as const)assert.deepEqual(Object.keys(copy[group]).sort(),Object.keys(base[group]).sort(),`${language}.${group}`);
  }
  assert.equal(fill(base.nextCode.alert_inseminate??'',{day:10}),'Inseminar (D10)');
});

test('animals tab filters by client, status, category and search in tag order',async()=>{
  const {animalRows}=await import('../src/features/veterinary/contracts');
  const rows=[animal(10),animal(2,{status:'pregnant',category:'novilha'}),animal(1,{client:id(11),client_name:'Antônio'})];
  assert.deepEqual(animalRows(rows,{client:'',status:'',category:'',search:''}).map(r=>r.identifier),['1','2','10']);
  assert.deepEqual(animalRows(rows,{client:id(10),status:'',category:'',search:''}).map(r=>r.identifier),['2','10']);
  assert.deepEqual(animalRows(rows,{client:'',status:'pregnant',category:'',search:''}).map(r=>r.identifier),['2']);
  assert.deepEqual(animalRows(rows,{client:'',status:'',category:'novilha',search:''}).map(r=>r.identifier),['2']);
  assert.deepEqual(animalRows(rows,{client:'',status:'',category:'',search:'ANTONIO'}).map(r=>r.identifier),['1']);
});

test('history drops values and describes each procedure',async()=>{
  const {vetHistorySchema}=await import('../src/features/veterinary/contracts');
  const {historyLines}=await import('../src/features/veterinary/messages');
  const raw={id:id(300),date:'2026-11-20',kind:'ultrasound',result:'pregnant',semen:'',notes:'Ok',responsible:'Dra. Ana',conduct:'',cycling:'',management_days:null,protocol_start:null,
    return_days:0,discard_reason:'',coverage_date:'2026-09-21',gestation_days:60,bull:'Touro A',calving_date:'2027-06-30',coverage_method:'artificial',step:'',step_day:null,
    rescheduled_to:null,not_done:false,gestation_now:62,herd_synced:true,value:'15.00',paid:true,pricing:null};
  const item=vetHistorySchema.parse(raw);
  assert.equal('value' in item,false);assert.equal('paid' in item,false);
  const view=historyLines(veterinaryMessages['pt-BR'],item,day=>day);
  assert.equal(view.title,'Ultrassom');assert.equal(view.result,'Prenha');
  assert.deepEqual(view.lines,['Gestação: 62 dias · parto previsto 2027-06-30','Cobertura: Inseminação artificial','Touro / sêmen: Touro A','Responsável: Dra. Ana','Obs.: Ok']);
  const removal=historyLines(veterinaryMessages['pt-BR'],vetHistorySchema.parse({...raw,kind:'other',result:'',step:'removal',step_day:8,not_done:true,rescheduled_to:'2026-11-24',coverage_method:'',bull:'',notes:''}),day=>day);
  assert.equal(removal.title,'Retirada do dispositivo (D8)');
  assert.deepEqual(removal.lines,['Não feito','Remarcado para 2026-11-24','Responsável: Dra. Ana']);
  const protocol=historyLines(veterinaryMessages['en'],vetHistorySchema.parse({...raw,result:'open',conduct:'iatf_protocol',management_days:10,protocol_start:'2026-11-20',bull:'',coverage_method:'',calving_date:null,notes:'',responsible:''}),day=>day);
  assert.deepEqual([protocol.result,...protocol.lines],['Open','IATF protocol','10-day IATF protocol · start 2026-11-20']);
  for(const language of ['en','es','pt-PT'] as const)assert.deepEqual(Object.keys(veterinaryMessages[language].animals).sort(),Object.keys(veterinaryMessages['pt-BR'].animals).sort());
});


test('billing preserves decimal amounts and rejects invalid periods', () => {
  const result = { month: '2026-11', total: '120.50', received: '0.00', receivable: '120.50', clients: [], detail: null };
  assert.deepEqual(vetBillingSchema.parse(result), result);
  assert.equal(vetBillingSchema.safeParse({ ...result, total: 120.5 }).success, false);
  assert.equal(veterinaryMonthSchema.safeParse('2026-13').success, false);
});


test('reviewed settlement total sums exact cents', () => {
  const review = [
    { id: 'eed3782c-6b32-45f0-81c0-16095afb43ac', value: '0.10', version: '2026-11-23T12:00:00Z' },
    { id: 'b11f9d84-d528-4fef-a5a4-fc3e28360de0', value: '0.20', version: '2026-11-23T12:00:00Z' },
  ];
  assert.equal(vetSettlementTotal(review), '0.30');
});
