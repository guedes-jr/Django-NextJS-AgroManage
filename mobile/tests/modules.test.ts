import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,type AxiosAdapter} from 'axios';
import {createAuthApi} from '../src/services/authApi';
import {userSchema} from '../src/features/auth/contracts';
import {customerTransitions,openTicketSchema,ticketSchema} from '../src/features/support/contracts';
import {canReadStructures,structurePageSchema} from '../src/features/structures/contracts';
import {supportMessages} from '../src/features/support/messages';
import {structureMessages} from '../src/features/structures/messages';
const id='00000000-0000-4000-8000-000000000001';
const user=(role:'admin'|'operator')=>userSchema.parse({id,full_name:'Pessoa',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role,can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:[],read_only:false}});

test('customer ticket transitions mirror the server rules',()=>{
 assert.deepEqual(customerTransitions('open'),['resolved']);
 assert.deepEqual(customerTransitions('waiting_customer'),['resolved']);
 assert.deepEqual(customerTransitions('resolved'),['closed','open']);
 assert.deepEqual(customerTransitions('closed'),['open']);
});
test('ticket creation requires subject/body and an idempotency key',()=>{
 assert.throws(()=>openTicketSchema.parse({subject:'ab',body:'texto',category:'question',priority:'normal',creation_key:id}));
 assert.equal(openTicketSchema.parse({subject:' Erro ',body:' Detalhe ',category:'technical',priority:'high',creation_key:id}).subject,'Erro');
 assert.throws(()=>ticketSchema.parse({id,subject:'x',category:'question',priority:'normal',status:'unknown',version:1,created_at:'',updated_at:''}));
});
test('ticket list rejects rows outside the requested status',async()=>{
 const adapter:AxiosAdapter=async config=>({data:{count:1,next:null,results:[{id,subject:'Erro',category:'question',priority:'normal',status:'closed',version:2,created_at:'2026-11-23T10:00:00Z',updated_at:'2026-11-23T10:00:00Z'}]},status:200,statusText:'OK',headers:{},config});
 const api=createAuthApi('https://example.com/api/v1/',create({adapter}));
 await assert.rejects(api.supportTickets({access:'a'},'pt-BR',{status:'open'}),/support scope/);
});
test('structures follow the module gate and normalize the next page',()=>{
 assert.equal(canReadStructures(user('admin')),true);assert.equal(canReadStructures(user('operator')),false);
 assert.equal(structurePageSchema.parse({count:0,results:[]}).next,null);
});
test('support and structure copy exist in four languages',()=>{
 for(const language of ['pt-BR','pt-PT','en','es'] as const){assert.ok(supportMessages[language].statuses.waiting_customer);assert.ok(structureMessages[language].categories.corral);}
});

test('team directory filters active members by role and text, gated by user management',async()=>{
 const {canReadTeam,filterMembers,memberListSchema}=await import('../src/features/team/contracts');
 const rows=memberListSchema.parse([{id,email:'ana@example.com',full_name:'Ana Souza',role:'manager',is_active:true},{id:'00000000-0000-4000-8000-000000000002',email:'bia@example.com',full_name:'Bia',role:'operator',is_active:false}]);
 assert.equal(filterMembers(rows,{search:'ana',role:'',active:true}).length,1);
 assert.equal(filterMembers(rows,{search:'',role:'operator',active:true}).length,0);
 assert.equal(filterMembers(rows,{search:'',role:'',active:false})[0]?.full_name,'Bia');
 assert.equal(canReadTeam(user('admin')),false);
});

test('cattle sale payload keeps only the chosen pricing basis and validates required pairs',async()=>{
 const {salePayload,saleEstimate,cattleSaleInputSchema}=await import('../src/features/cattle/saleContracts');
 const base={mode:'whole' as const,quantity:'',date:'2026-11-20',due_date:'2026-11-30',buyer:'Frigorífico',responsible:'',notes:'',weight_kg:'4500',pricing_basis:'live_kg' as const,price_per_kg:'10,5',price_per_arroba:'300',carcass_weight_kg:'',yield_percent:'52',deductions:'',deduction_description:'',slaughter_reference:''};
 const live=salePayload(base) as Record<string,unknown>;assert.equal(live.price_per_kg,'10.5');assert.equal('price_per_arroba' in live,false);assert.equal(live.deductions,'0');assert.equal('quantity' in live,false);
 const carcass=salePayload({...base,pricing_basis:'carcass_arroba'}) as Record<string,unknown>;assert.equal(carcass.price_per_arroba,'300');assert.equal(carcass.yield_percent,'52');assert.equal('price_per_kg' in carcass,false);
 assert.throws(()=>cattleSaleInputSchema.parse({...base,mode:'partial'}));
 assert.throws(()=>cattleSaleInputSchema.parse({...base,deductions:'100'}));
 assert.throws(()=>cattleSaleInputSchema.parse({...base,due_date:'2026-11-10'}));
 assert.deepEqual(saleEstimate({...base,deductions:'250'}),{gross:47250,net:47000});
 assert.equal(saleEstimate({...base,pricing_basis:'carcass_arroba'}).gross,46800);
});

test('organization settings gates, address lines and report access',async()=>{
 const {canEditOrganization,canReadOrganization,addressLine,organizationUpdateSchema}=await import('../src/features/organization/contracts');
 const {canReadReport}=await import('../src/features/reports/contracts');
 assert.equal(canReadOrganization(user('operator')),false);assert.equal(canEditOrganization(user('admin')),true);
 assert.equal(addressLine({logradouro:'Rua A',numero:'10',cidade:'Uberaba',estado:'MG'}),'Rua A · 10 · Uberaba · MG');
 assert.throws(()=>organizationUpdateSchema.parse({name:'A',email:'',phone:''}));
 assert.equal(canReadReport(user('operator'),'low-stock'),false);assert.equal(canReadReport(user('admin'),'low-stock'),true);
});
