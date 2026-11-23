import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,VetSaveRejected,VetSaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {blankLaunch,launchBranch,launchPayload,proposedPregnancy,protocolSteps,vetLookupSchema,type LaunchForm,type VetLookup} from '../src/features/veterinary/launchContracts';
import {veterinaryMessages} from '../src/features/veterinary/messages';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const today='2026-11-22',client=id(10);
const base=(patch:Partial<LaunchForm>={}):LaunchForm=>({...blankLaunch(client,today,'Dra. Ana',id(2)),animal:'101',...patch});
const found=(patch:Record<string,unknown>={}):VetLookup=>vetLookupSchema.parse({found:true,id:id(100),identifier:'101',name:'',category:'vaca_parida',status:'open',
  next:{code:'new',day:null,date:null},procedures_count:1,source:null,pending_step:null,not_inseminated_date:null,default_coverage_method:'',...patch});
const source={kind:'protocol',insemination_date:'2026-10-01',bull:'Touro A',cycling:'cycling',management_days:10,protocol_start:'2026-09-21'};

test('branch follows the web: pending step, then IATF insemination, else diagnosis',()=>{
  assert.equal(launchBranch(null),'diagnosis');
  assert.equal(launchBranch({found:false}),'diagnosis');
  assert.equal(launchBranch(found({status:'protocol',pending_step:{kind:'removal',day:8,date:'2026-11-20'}})),'step');
  assert.equal(launchBranch(found({status:'protocol'})),'iatf');
  assert.equal(launchBranch(found({status:'pregnant'})),'diagnosis');
});

test('diagnosis payloads carry only the answers of the chosen conduct',()=>{
  assert.deepEqual(launchPayload(base(),null,today),{problem:'category'});
  assert.deepEqual(launchPayload(base({category:'novilha'}),null,today),{problem:'diagnosis'});
  assert.deepEqual(launchPayload(base({category:'novilha',diagnosis:'open'}),null,today),{problem:'conduct'});
  const protocol=launchPayload(base({category:'novilha',diagnosis:'open',conduct:'iatf_protocol',management:11}),null,today);
  assert.ok('payload' in protocol);
  assert.deepEqual(protocol.payload,{client,new_client_name:'',date:today,animal:'101',responsible:'Dra. Ana',responsible_user:id(2),notes:'',category:'novilha',diagnosis:'open',conduct:'iatf_protocol',cycling:'cycling',management_days:11,protocol_start:today});
  const heat=launchPayload(base({category:'novilha',diagnosis:'open',conduct:'observe_heat',returnDays:'18'}),null,today);
  assert.ok('payload' in heat);assert.equal(heat.payload.return_days,18);assert.equal('management_days' in heat.payload,false);
  assert.deepEqual(launchPayload(base({category:'novilha',diagnosis:'open',conduct:'iatf_protocol',protocolStart:'2026-11-30'}),null,today),{problem:'future'});
});

test('pregnancy uses the protocol data unless the vet corrects it',()=>{
  const lookup=found({status:'inseminated',source});
  assert.deepEqual(launchPayload(base({category:'vaca_parida',diagnosis:'pregnant'}),lookup,today),{problem:'method'});
  const form=base({category:'vaca_parida',diagnosis:'pregnant',method:'artificial'});
  assert.deepEqual(proposedPregnancy(form,lookup),{coverage:'2026-10-01',calving:'2027-07-11',bull:'Touro A'});
  const confirmed=launchPayload(form,lookup,today);
  assert.ok('payload' in confirmed);
  assert.equal(confirmed.payload.confirm_pregnancy,true);assert.equal(confirmed.payload.coverage_date,'2026-10-01');assert.equal(confirmed.payload.bull,'Touro A');
  assert.deepEqual(launchPayload({...form,edit:true},lookup,today),{problem:'gestation'});
  const edited=launchPayload({...form,edit:true,gestation:'60'},lookup,today);
  assert.ok('payload' in edited);
  assert.equal(edited.payload.edit,true);assert.equal(edited.payload.gestation_days,60);assert.equal(edited.payload.coverage_date,'2026-09-23');
  const fresh=launchPayload(base({category:'novilha',diagnosis:'pregnant',method:'natural',gestation:'30'}),null,today);
  assert.ok('payload' in fresh);assert.equal(fresh.payload.confirm_pregnancy,false);
});

test('protocol steps and new clients',()=>{
  const step=launchPayload(base({stepDone:'yes',stepDate:'2026-11-20'}),found({status:'protocol',pending_step:{kind:'removal',day:8,date:'2026-11-20'}}),today);
  assert.ok('payload' in step);assert.deepEqual([step.payload.step_done,step.payload.step_date],['yes','2026-11-20']);
  assert.deepEqual(launchPayload(base({stepDone:'yes',stepDate:'2026-11-21'}),found({status:'protocol'}),today),{problem:'stepBull'});
  const notDone=launchPayload(base({stepDone:'no'}),found({status:'protocol'}),today);
  assert.ok('payload' in notDone);assert.equal(notDone.payload.step_date,null);
  assert.deepEqual(launchPayload(base({client:'',category:'novilha',diagnosis:'open',conduct:'discard'}),null,today),{problem:'client'});
  const created=launchPayload(base({client:'',newClient:' Manuel ',category:'novilha',diagnosis:'open',conduct:'discard',discard:'age'}),found({status:'protocol'}),today);
  assert.ok('payload' in created);assert.deepEqual([created.payload.client,created.payload.new_client_name,created.payload.discard_reason],[null,'Manuel','age']);
  assert.deepEqual(launchPayload(base({date:'2026-11-23'}),null,today),{problem:'future'});
  assert.deepEqual(protocolSteps(10,'2026-11-01').map(s=>[s.day,s.date]),[[8,'2026-11-09'],[10,'2026-11-11']]);
});

async function fixture(mode:'ok'|'400'|'500'|'network'|'invalid'){
  const vet=userSchema.parse({id:id(1),full_name:'Dra. Ana',email:'vet@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,
    access:{role:'veterinarian',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:[],read_only:false,veterinary:true}});
  const posts:unknown[]=[];
  const adapter:AxiosAdapter=async config=>{const path=config.url!;let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?vet:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
    if(path==='veterinary/procedures/'){posts.push(JSON.parse(config.data));
      if(mode==='network')throw new AxiosError('timeout','ECONNABORTED',config);
      if(mode==='400'||mode==='500')throw new AxiosError('synthetic',undefined,config,undefined,{config,status:Number(mode),statusText:'x',headers:{},data:mode==='400'?{error:{code:'bad_request',message:'Requisição inválida.',detail:{detail:'Escolha a conduta.'}}}:{}});
      data=mode==='invalid'?{}:{branch:'diagnosis',animal_created:true,animal:{id:id(100),identifier:'101'},client:{id:client,name:'Manuel'},procedure:{id:id(200),kind:'ultrasound',date:today,result:'open',not_done:false,value:'15.00'},alerts:[]};}
    return {config,data,status:201,statusText:'OK',headers:{}};};
  const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');
  await controller.signIn('vet@example.com','synthetic');
  return {controller,posts};
}

test('register distinguishes saved, refused and unknown results and never retries',async()=>{
  const ok=await fixture('ok');
  assert.equal((await ok.controller.vetRegister({animal:'101'})).animal.identifier,'101');
  const refused=await fixture('400');
  await assert.rejects(refused.controller.vetRegister({animal:'101'}),(e:unknown)=>e instanceof VetSaveRejected&&e.message==='Escolha a conduta.');
  for(const mode of ['500','network','invalid'] as const){const f=await fixture(mode);await assert.rejects(f.controller.vetRegister({animal:'101'}),VetSaveUnconfirmed);assert.equal(f.posts.length,1,mode);}
});

test('concurrent taps send a single procedure',async()=>{
  const f=await fixture('ok');
  const first=f.controller.vetRegister({animal:'101'});
  await assert.rejects(f.controller.vetRegister({animal:'101'}));
  await first;
  assert.equal(f.posts.length,1);
});

test('launch copy is complete in the four organization languages',()=>{
  const ref=veterinaryMessages['pt-BR'].launch;
  for(const language of ['en','es','pt-PT'] as const){
    const copy=veterinaryMessages[language].launch;
    assert.deepEqual(Object.keys(copy).sort(),Object.keys(ref).sort(),language);
    for(const group of ['problems','conducts','methods','discard'] as const)assert.deepEqual(Object.keys(copy[group]).sort(),Object.keys(ref[group]).sort(),`${language}.${group}`);
  }
});
