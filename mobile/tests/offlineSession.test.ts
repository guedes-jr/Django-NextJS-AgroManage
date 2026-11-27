import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AxiosError,create,type AxiosAdapter} from 'axios';
import {createAuthApi,AuthFailure} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {OFFLINE_WINDOW_MS,createMemoryLocalCache,offlineAllowed,snapshotKey} from '../src/features/offline/contracts';

const user={id:'u1',full_name:'Ana',email:'ana@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,
 access:{role:'admin',can_manage_users:true,can_view_financial:true,can_operate_crops:true,livestock_species:['bovinos'],read_only:false}};
const farmsPage={results:[{id:'5f8d0d55-2b7c-4c39-9a52-0d1d9f3f6a10',name:'Fazenda A'}],next:null};

function fixture(){
 const calls:{path:string;method:string}[]=[];let network=true;
 const adapter:AxiosAdapter=async config=>{
  const path=config.url!;calls.push({path,method:config.method!});
  if(!network)throw new AxiosError('Network Error','ERR_NETWORK',config);
  const data=path==='auth/login/'?{access:'a',refresh:'r'}:path==='auth/me/'?user:path==='organizations/me/'?{id:'o1',name:'Org',language:'pt-BR'}:path==='farms/'?farmsPage:{};
  return {config,data,status:200,statusText:'OK',headers:{}};
 };
 const local=createMemoryLocalCache('ns');let stored:{access:string;refresh:string}|null=null;
 const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>stored,save:async t=>{stored=t;},clear:async()=>{stored=null;}},'pt-BR',local);
 return {calls,controller,local,setNetwork:(value:boolean)=>{network=value;}};
}

test('offline window is 24 hours after the last server confirmation', () => {
 assert.equal(offlineAllowed(1000,1000+OFFLINE_WINDOW_MS),true);
 assert.equal(offlineAllowed(1000,1001+OFFLINE_WINDOW_MS),false);
 assert.equal(offlineAllowed(5000,1000),false);
 assert.equal(snapshotKey('farms',[1]),'farms:[1]');
 assert.equal(snapshotKey('x',['a'.repeat(700)]),null);
});

test('without network the last confirmed session opens read-only with saved results', async () => {
 const f=fixture();
 await f.controller.signIn('ana@example.com','secret',true);
 assert.deepEqual(await f.controller.farms(1),farmsPage);
 f.setNetwork(false);
 await f.controller.restore();
 const state=f.controller.getSnapshot();
 assert.equal(state.status,'signedIn');
 assert.ok(state.status==='signedIn'&&state.offline);
 assert.equal(f.controller.isOffline(),true);
 const before=f.calls.length;
 assert.deepEqual(await f.controller.farms(1),farmsPage);
 // Not saved yet: refused at once, without any request.
 await assert.rejects(f.controller.farms(2),(error:unknown)=>error instanceof AuthFailure&&error.key==='offline');
 await assert.rejects(f.controller.profile(),(error:unknown)=>error instanceof AuthFailure&&error.key==='offline');
 assert.equal(f.calls.length,before);
});

test('reconnect returns online without restarting the session', async () => {
 const f=fixture();
 await f.controller.signIn('ana@example.com','secret',true);
 f.setNetwork(false);await f.controller.restore();
 await f.controller.reconnect();
 assert.equal(f.controller.isOffline(),true);
 f.setNetwork(true);await f.controller.reconnect();
 const state=f.controller.getSnapshot();
 assert.equal(state.status,'signedIn');
 assert.equal(f.controller.isOffline(),false);
 assert.deepEqual(await f.controller.farms(2),farmsPage);
});

test('beyond 24 hours or after sign-out the app does not open offline', async () => {
 const f=fixture();
 await f.controller.signIn('ana@example.com','secret',true);
 const saved=await f.local.readSession();assert.ok(saved);
 await f.local.saveSession(saved.session,Date.now()-OFFLINE_WINDOW_MS-1000);
 f.setNetwork(false);await f.controller.restore();
 assert.equal(f.controller.getSnapshot().status,'unavailable');

 const g=fixture();
 await g.controller.signIn('ana@example.com','secret',true);
 await g.controller.farms(1);
 await g.controller.signOut();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(await g.local.readSession(),null);
 assert.equal(await g.local.readSnapshot('ns|u1|o1','farms:[1]'),null);
});
