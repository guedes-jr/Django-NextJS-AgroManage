import { test } from 'node:test';
import assert from 'node:assert/strict';
import { create, type AxiosAdapter } from 'axios';
import { canSearch, organizationDay, parseSearch, searchQuerySchema } from '../src/features/workspace/contracts';
import { workspaceMessages } from '../src/features/workspace/messages';
import { userSchema } from '../src/features/auth/contracts';
import { createAuthApi } from '../src/services/authApi';
import { SessionController } from '../src/features/auth/sessionController';
const id='00000000-0000-4000-8000-000000000001';
const user=userSchema.parse({id,full_name:'Teste',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'operator',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
test('organization calendar day uses its timezone across midnight and leap days',()=>{
  const now=new Date('2026-11-08T01:00:00Z');assert.equal(organizationDay('America/Fortaleza',now),'2026-11-07');assert.equal(organizationDay('Pacific/Auckland',now),'2026-11-08');assert.equal(organizationDay('America/Fortaleza',new Date('2028-03-01T01:00:00Z')),'2028-02-29');assert.throws(()=>organizationDay('invalid',now));
});
test('search permissions do not broaden operator or feeder domains',()=>{
  assert.equal(canSearch(user,'animal'),true);assert.equal(canSearch(user,'crop'),false);assert.equal(canSearch(user,'inventory'),false);assert.equal(canSearch(user,'structure'),false);
  for(const kind of ['animal','batch','crop','inventory','structure'] as const){assert.equal(canSearch({...user,access:{...user.access,role:'feeder'}},kind),false);assert.equal(canSearch({...user,force_password_change:true},kind),false);assert.equal(canSearch({...user,access:{...user.access,role:'manager'}},kind),true);}
});
test('search validates input, preserves string identifiers and builds its own destinations',()=>{
  assert.equal(searchQuerySchema.safeParse({kind:'crop',search:'a',page:1}).success,false);assert.equal(searchQuerySchema.safeParse({kind:'crop',search:'milho',page:0}).success,false);
  const page={next:null,previous:null,results:[{id,identifier:'0007',species_code:'bovinos',farm_name:'Fazenda',cattle_purpose:'dairy',href:'https://evil.test',purchase_value:'999'}]};
  const result=parseSearch('animal',page);assert.equal(result.results[0]?.label,'0007');assert.equal(result.results[0]?.path,'/home/seguimento/pecuaria-leiteira/cadastro');assert.equal('purchase_value' in result.results[0]!,false);assert.deepEqual(result.results[0]?.native,{id,production:'dairy',kind:'animals'});
  assert.equal(parseSearch('batch',{...page,results:[{id,batch_code:'007',species_code:'bovinos',farm_name:'Fazenda'}]}).results[0]?.path,null);
  assert.throws(()=>parseSearch('animal',{...page,results:[{id:'../../bad'}]}));
});
function fixture(actor=user,delay?:()=>Promise<void>){
  const calls:{path:string|undefined;params:unknown}[]=[];
  const adapter:AxiosAdapter=async config=>{
    calls.push({path:config.url,params:config.params});
    const data=config.url==='auth/login/'?{access:'fake',refresh:'fake'}:config.url==='auth/me/'?{...actor,phone:'123'}:config.url==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:config.url==='farms/'?{results:[{id,name:'Fazenda'}],next:null}:{results:[],next:null,previous:null};
    if(config.url==='farms/')await delay?.();return {data,status:200,statusText:'OK',headers:{},config};
  };
  const api=createAuthApi('https://example.com/api/v1/',create({adapter}));const controller=new SessionController(api,{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');return {calls,controller};
}
test('unauthorized search and farm reads never reach the API; feeder may read its profile',async()=>{
  const f=fixture({...user,access:{...user.access,role:'feeder'}});await f.controller.signIn('test@example.com','password');
  await assert.rejects(f.controller.farms(1));await assert.rejects(f.controller.searchEntities({kind:'animal',search:'teste',page:1}));assert.equal(f.calls.some(c=>c.path==='farms/'||c.path?.includes('animals')),false);assert.equal((await f.controller.profile()).phone,'123');
});
test('authorized search sends paginated remote query and farm reads discard responses after logout',async()=>{
  const f=fixture();await f.controller.signIn('test@example.com','password');await f.controller.searchEntities({kind:'animal',search:'007',page:2});assert.deepEqual(f.calls.at(-1),{path:'livestock/animals/',params:{search:'007',page:2,page_size:20}});
  let resolve!:()=>void;const pending=new Promise<void>(done=>{resolve=done;});const late=fixture(user,()=>pending);await late.controller.signIn('test@example.com','password');const request=late.controller.farms(1);await late.controller.signOut();resolve();await assert.rejects(request,/expired/);
});
test('workspace translations are complete',()=>{for(const copy of Object.values(workspaceMessages))assert.deepEqual(Object.keys(copy).sort(),Object.keys(workspaceMessages['pt-BR']).sort());});
