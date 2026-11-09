import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,type AxiosAdapter} from 'axios';
import {createAuthApi} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {reproductionGroups,reproductionQuerySchema,reproductionPageSchema,ensureReproductionScope,type ReproductionQuery} from '../src/features/cattle/reproductionContracts';
import {reproductionMessages} from '../src/features/cattle/reproductionMessages';
const id='00000000-0000-4000-8000-000000000001',farm='00000000-0000-4000-8000-000000000002';
const user=userSchema.parse({id,full_name:'Operator',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'operator',can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:true}});
const query:ReproductionQuery={production:'dairy',farm,group:'pregnant',page:1,search:''};
const row={id,identifier:'COW',farm,farm_name:'Farm',cattle_purpose:'dairy',gender:'F',category:'Vaca',reproductive_status:'gestante',is_lactating:true,last_mating_date:'2026-09-01',pregnancy_start_date:'2026-09-01',expected_birth_date:'2027-06-10'};
async function fixture(actor=user){let hold:(()=>Promise<void>)|undefined;const calls:{path:string;method:string;params:Record<string,unknown>}[]=[];
 const adapter:AxiosAdapter=async config=>{const path=config.url!;calls.push({path,method:config.method!,params:config.params});let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?actor:path==='organizations/me/'?{id:'org',name:'Org',language:'pt-BR'}:{};
 if(path==='livestock/cattle/animals/mobile-reproduction/'){await hold?.();data={count:1,next:'https://outside.invalid',previous:null,results:[row],today:'2026-11-08',timezone:'America/Fortaleza',groups:reproductionGroups,summary:{females:9,...Object.fromEntries(reproductionGroups.map(key=>[key,key==='pregnant'?9:0]))}};}
 if(path===`livestock/cattle/animals/${id}/mobile-reproduction/`)data={...row,notes:'Recorded',entry_date:null,birth_date:null};
 return {config,data,status:200,statusText:'OK',headers:{}};};
 const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,calls,hold:(fn:()=>Promise<void>)=>{hold=fn;}};
}
test('reproduction validates segment, farm UUID, group, page and search before requests',()=>{
 for(const change of [{production:'swine'},{farm:'Farm'},{group:'invented'},{page:0},{search:'x'.repeat(101)}])assert.equal(reproductionQuerySchema.safeParse({...query,...change}).success,false);
 assert.equal(ensureReproductionScope({...row,cattle_purpose:'dual'},query).id,id);assert.throws(()=>ensureReproductionScope({...row,cattle_purpose:'beef'},query));assert.throws(()=>ensureReproductionScope({...row,farm:id},query));
});
test('reproduction endpoints use fixed pagination, preserve server dates/counts and remain cost free',async()=>{
 const f=await fixture(),page=await f.controller.reproductionPage(query);assert.equal(page.summary.pregnant,9);assert.equal(page.results[0]?.expected_birth_date,'2027-06-10');assert.equal(f.calls.at(-1)?.params.page_size,20);await f.controller.reproductionPage({...query,page:2});assert.equal(f.calls.at(-1)?.path,'livestock/cattle/animals/mobile-reproduction/');assert.equal(f.calls.at(-1)?.params.page,2);
 assert.equal((await f.controller.reproductionAnimal(id,query)).pregnancy_start_date,'2026-09-01');assert.equal(f.calls.filter(c=>c.path.includes('mobile-reproduction')).every(c=>c.method==='get'),true);assert.equal('cost' in page.results[0]!,false);
});
test('reproduction rejects a returned animal outside requested farm or segment',async()=>{
 const f=await fixture();await assert.rejects(f.controller.reproductionPage({...query,production:'beef'}));await assert.rejects(f.controller.reproductionAnimal(id,{...query,farm:id}));
 assert.equal(reproductionPageSchema.safeParse({results:[]}).success,false);
});
test('reproduction remains available to read-only bovine operator, rejects feeder and unrelated species',async()=>{
 const allowed=await fixture();await allowed.controller.reproductionPage(query);
 for(const actor of [{...user,access:{...user.access,role:'feeder' as const}},{...user,access:{...user.access,livestock_species:['suinos']}}]){const f=await fixture(actor);await assert.rejects(f.controller.reproductionPage(query));await assert.rejects(f.controller.reproductionAnimal(id,query));assert.equal(f.calls.some(c=>c.path.includes('mobile-reproduction')),false);}
});
test('reproduction discards read response after logout',async()=>{
 const f=await fixture();let release!:()=>void;f.hold(()=>new Promise<void>(resolve=>{release=resolve;}));const pending=f.controller.reproductionPage(query);while(!release)await new Promise(resolve=>setTimeout(resolve,0));await f.controller.signOut();release();await assert.rejects(pending);
});
test('reproduction translations cover all groups and organization languages',()=>{for(const locale of ['pt-BR','en','es','pt-PT'] as const){assert.deepEqual(Object.keys(reproductionMessages[locale]).sort(),Object.keys(reproductionMessages['pt-BR']).sort());assert.deepEqual(Object.keys(reproductionMessages[locale].groups).sort(),[...reproductionGroups].sort());}});
