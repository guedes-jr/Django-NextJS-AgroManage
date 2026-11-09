import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,type AxiosAdapter} from 'axios';
import {createAuthApi} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {organizationDay} from '../src/features/workspace/contracts';
import {batchInputSchema,batchPayload,transferInput,transferPreviewSchema,matchesPreview,canTransfer,cattleOverviewSchema} from '../src/features/cattle/batchContracts';
import {batchSchema} from '../src/features/cattle/contracts';
import {batchMessages} from '../src/features/cattle/batchMessages';
const source='00000000-0000-4000-8000-000000000001',destination='00000000-0000-4000-8000-000000000002',farm='00000000-0000-4000-8000-000000000003',key='00000000-0000-4000-8000-000000000004';
const user=userSchema.parse({id:source,full_name:'Teste',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'manager',can_manage_users:true,can_view_financial:true,can_operate_crops:false,livestock_species:['bovinos'],read_only:false}});
const today=organizationDay('UTC');
const batch={id:source,batch_code:'A',name:null,farm_id:farm,farm_name:'Fazenda',cattle_purpose:'beef',category:'Bezerro',status:'active',phase:'creche',quantity:10,gender:'Misto',entry_date:today,birth_date:null,avg_weight_kg:null,notes:''};
const values=batchInputSchema(today).parse({batch_code:' A ',name:'',category:'Bezerro',phase:'creche',origin:'purchased',gender:'Misto',quantity:'10',birth_date:'',entry_date:today,avg_weight_kg:'200,25',notes:''});
const input=transferInput.parse({source,destination,quantity:3,animals:[],date:today,reason:'Ajuste',request_key:key});
const snapshot=transferPreviewSchema.parse({source,destination,source_code:'A',destination_code:'B',farm,quantity:3,source_before:10,source_after:7,destination_before:2,destination_after:5,animals:[],date:today,reason:'Ajuste'});
async function fixture(actor=user){const writes:{body:Record<string,unknown>;path:string;method:string}[]=[];let optionsReadOnly=false;let org='org';let previewReads=0;const adapter:AxiosAdapter=async config=>{
 const path=config.url!;let data:unknown={};
 if(path==='auth/login/')data={access:'synthetic',refresh:'synthetic'};else if(path==='auth/me/')data=actor;else if(path==='organizations/me/')data={id:org,name:'Org',language:'pt-BR'};else if(path==='tasks/agenda-options/')data={user_id:source,role:actor.access.role,read_only:optionsReadOnly,timezone:'UTC'};else if(path.startsWith('livestock/cattle/batches/')){previewReads++;data={...batch,id:path.includes(destination)?destination:source};}
 if(['post','patch'].includes(config.method??'')&&path.startsWith('livestock/cattle/')){const body=JSON.parse(config.data);writes.push({body,path,method:config.method!});data=path.includes('transfers')?body.preview?snapshot:{id:key,snapshot:{...snapshot,purchase_value_transferred:'999.00'}}:{...batch,...body};}
 return {data,status:200,statusText:'OK',headers:{},config};};
 const api=createAuthApi('https://example.com/api/v1/',create({adapter}));const controller=new SessionController(api,{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {api,controller,writes,reads:()=>previewReads,readonly:()=>{optionsReadOnly=true;},changeOrg:()=>{org='other';}};
}
test('batch creation preserves decimals and unknown dates/costs; editing never sends immutable headcounts',()=>{
 const create=batchPayload(values,{farm,production:'beef'});assert.equal('avg_weight_kg' in create?create.avg_weight_kg:null,'200.25');assert.equal(create.birth_date,null);assert.equal('purchase_value' in create,false);assert.equal('quantity' in create?create.quantity:null,10);assert.equal(batchSchema.parse(batch).name,'');
 assert.deepEqual(Object.keys(batchPayload(values)).sort(),['batch_code','name','birth_date','notes'].sort());
 for(const change of [{quantity:'0'},{quantity:'2147483648'},{avg_weight_kg:'1.123'},{avg_weight_kg:'0'},{birth_date:'2026-02-30'},{entry_date:'9999-01-01'}])assert.equal(batchInputSchema(today).safeParse({...values,...change}).success,false);
});
test('batch mutations preserve tenant scope, role restrictions and readonly preflight',async()=>{
 const manager=await fixture();await manager.controller.saveCattleBatch(values,'beef',farm);await manager.controller.saveCattleBatch(values,'beef',farm,source);assert.equal(manager.writes[1]!.method,'patch');assert.equal('quantity' in manager.writes[1]!.body,false);
 const operator=await fixture({...user,access:{...user.access,role:'operator'}});await operator.controller.saveCattleBatch(values,'beef',farm);await assert.rejects(operator.controller.saveCattleBatch(values,'beef',farm,source));assert.equal(operator.writes.length,1);
 manager.readonly();await assert.rejects(manager.controller.saveCattleBatch(values,'beef',farm));manager.changeOrg();await assert.rejects(manager.controller.saveCattleBatch(values,'beef',farm));assert.equal(manager.writes.length,2);
});
test('transfer preview validates exact participants, conservation and reviewed intention',()=>{
 assert.equal(matchesPreview(input,snapshot,farm),true);
 for(const change of [{source:destination},{animals:[source,source],quantity:2},{animals:[source],quantity:2},{quantity:0},{reason:' '}])assert.equal(transferInput.safeParse({...input,...change}).success,false);
 assert.equal(transferPreviewSchema.safeParse({...snapshot,source_after:8}).success,false);
 for(const change of [{destination:source},{quantity:4},{date:'2020-01-01'},{reason:'Outro'},{animals:[source]}])assert.equal(matchesPreview({...input,...change},snapshot,farm),false);
 assert.equal(matchesPreview(input,snapshot,source),false);
});
test('preview is separate from confirmation; replay keeps key, participants and expected balances, strips financial snapshot',async()=>{
 const f=await fixture();await f.controller.cattleTransfer(input,'beef',farm);assert.equal(f.writes[0]!.body.preview,true);assert.equal(f.reads(),2);
 const result=await f.controller.cattleTransfer(input,'beef',farm,snapshot);assert.deepEqual(result,{id:key});await f.controller.cattleTransfer(input,'beef',farm,snapshot);
 assert.deepEqual(f.writes[1]!.body,f.writes[2]!.body);assert.equal(f.writes[1]!.body.request_key,key);assert.equal(f.writes[1]!.body.expected_source,10);assert.equal(f.writes[1]!.body.expected_destination,2);assert.equal(f.writes[1]!.body.preview,false);assert.equal(f.reads(),2);
 // Reconciliation can acknowledge an older committed intent without re-previewing today's balances.
 await f.controller.cattleTransfer({...input,date:'2020-01-01'},'beef',farm,{...snapshot,date:'2020-01-01'});assert.equal(f.reads(),2);
 await assert.rejects(f.controller.cattleTransfer({...input,quantity:4},'beef',farm,snapshot));assert.equal(f.writes.length,4);
});
test('transfer cannot request financial snapshots without manager capability, and preview checks production/farm',async()=>{
 for(const actor of [{...user,access:{...user.access,role:'operator' as const}},{...user,access:{...user.access,can_view_financial:false}},{...user,access:{...user.access,read_only:true}}]){assert.equal(canTransfer(actor),false);const f=await fixture(actor);await assert.rejects(f.controller.cattleTransfer(input,'beef',farm));assert.equal(f.writes.length,0);}
 const f=await fixture();await assert.rejects(f.controller.cattleTransfer(input,'dairy',farm));await assert.rejects(f.controller.cattleTransfer(input,'beef',source));assert.equal(f.writes.length,0);
});
test('overview excludes unrelated milk/pasture metrics and keeps unknown average; catalogs cover all locales',()=>{
 const result=cattleOverviewSchema.parse({total_head:12,identified_animals:1,active_batches:2,pregnant_females:0,lactating_females:0,average_identified_weight:null,categories:[],milk_produced_month:100,pasture_area_ha:25});assert.equal(result.average_identified_weight,null);assert.equal('milk_produced_month' in result,false);
 for(const copy of Object.values(batchMessages))assert.deepEqual(Object.keys(copy).sort(),Object.keys(batchMessages['pt-BR']).sort());
});
