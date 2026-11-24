import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,type AxiosAdapter} from 'axios';
import {createAuthApi} from '../src/services/authApi';
import {userSchema} from '../src/features/auth/contracts';
import {activePayment,canReadFinance,canReverse,canSettle,canWriteFinance,settledAmount,transactionInputSchema,transactionSchema} from '../src/features/finance/contracts';
import {financeMessages} from '../src/features/finance/messages';
import {activityDate,activityLabel,activityPageSchema,canReadCrops,plantationQuerySchema} from '../src/features/crops/contracts';

const id='00000000-0000-4000-8000-000000000001',cat='00000000-0000-4000-8000-000000000002',pay='00000000-0000-4000-8000-000000000003',rev='00000000-0000-4000-8000-000000000004';
const user=(role:'admin'|'manager'|'operator',can_view_financial=true,read_only=false)=>userSchema.parse({id,full_name:'Gestor',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role,can_manage_users:false,can_view_financial,can_operate_crops:false,livestock_species:[],read_only}});
const row={id,description:'Venda de leite',amount:'1500.50',category:cat,category_name:'Leite',category_type:'revenue',due_date:'2026-11-20',payment_date:null,status:'pending',reference:'',notes:'',bank_account:null,farm:null,payment_events:[]};

test('finance follows the web gate: admin/manager with financial visibility; read-only never writes',()=>{
 assert.equal(canReadFinance(user('manager')),true);
 assert.equal(canReadFinance(user('operator')),false);
 assert.equal(canReadFinance(user('admin',false)),false);
 assert.equal(canWriteFinance(user('admin',true,true)),false);
 assert.equal(canWriteFinance(user('admin')),true);
});

test('title amounts keep decimal text and creation normalizes Brazilian input',()=>{
 assert.equal(transactionSchema.parse({...row,amount:1500.5}).amount,'1500.5');
 assert.equal(transactionInputSchema.parse({description:'Ração',amount:'1.234,56',category:cat,due_date:'2026-11-23',bank_account:null,farm:null,notes:''}).amount,'1234.56');
 assert.throws(()=>transactionInputSchema.parse({description:'Ração',amount:'0',category:cat,due_date:'2026-11-23',bank_account:null,farm:null,notes:''}));
 assert.throws(()=>transactionInputSchema.parse({description:' ',amount:'10',category:cat,due_date:'2026-11-23',bank_account:null,farm:null,notes:''}));
});

test('settlement only for open titles; reversal targets the payment not yet reversed',()=>{
 const pending=transactionSchema.parse(row);assert.equal(canSettle(pending),true);assert.equal(canReverse(pending),false);
 const event=(kind:'payment'|'reversal',eventId:string,reverses:string|null=null)=>({id:eventId,kind,amount:'1500.50',bank_account:null,payment_date:'2026-11-21',payment_method:'pix',reason:'',reverses,created_at:'2026-11-21T10:00:00Z'});
 const paid=transactionSchema.parse({...row,status:'paid',payment_date:'2026-11-21',payment_events:[event('payment',pay)]});
 assert.equal(canSettle(paid),false);assert.equal(canReverse(paid),true);assert.equal(activePayment(paid)?.id,pay);assert.equal(settledAmount(paid),1500.5);
 const again=transactionSchema.parse({...row,status:'paid',payment_events:[event('payment',pay),event('reversal',rev,pay),event('payment',cat)]});
 assert.equal(activePayment(again)?.id,cat);
 const legacy=transactionSchema.parse({...row,status:'paid',payment_date:'2026-11-21'});
 assert.equal(activePayment(legacy),undefined);assert.equal(canReverse(legacy),true);
});

test('transaction list rejects rows outside the requested type or status',async()=>{
 const adapter:AxiosAdapter=async config=>({data:{count:1,next:null,previous:null,results:[{...row,category_type:'expense'}]},status:200,statusText:'OK',headers:{},config});
 const api=createAuthApi('https://example.com/api/v1/',create({adapter}));
 await assert.rejects(api.financeTransactions({access:'a'},'pt-BR',{type:'revenue'}),/finance scope/);
});

test('finance copy exists in the four languages with status labels',()=>{
 for(const language of ['pt-BR','pt-PT','en','es'] as const){const t=financeMessages[language];assert.ok(t.title&&t.settle&&t.reverse);for(const status of ['pending','overdue','paid','cancelled'])assert.ok(t.statuses[status]);}
});

test('crops read gate, lenient activity pages and labels',()=>{
 assert.equal(canReadCrops(user('operator')),false);
 assert.equal(canReadCrops(user('manager')),true);
 assert.equal(canReadCrops(userSchema.parse({...user('operator'),access:{...user('operator').access,can_operate_crops:true}})),true);
 const page=activityPageSchema.parse([{id,application_date:'2026-11-01',item_name:'Ureia',quantity:'10.5',unit:'kg'}]);
 assert.equal(page.next,null);assert.equal(activityDate(page.results[0]!),'2026-11-01');assert.equal(activityLabel(page.results[0]!),'Ureia');
 assert.throws(()=>plantationQuerySchema.parse({status:'unknown'}));
});

test('crop operations validate per kind and never send prices without financial access',async()=>{
 const {cropOperationSchema,operationPayload,canWriteCrops}=await import('../src/features/crops/contracts');
 const plantation=id,item=cat;
 const planting=cropOperationSchema.parse({kind:'plantings',plantation,item,quantity:'12,5',unit:'kg',planting_date:'2026-11-20',spacing:'',operator:'',notes:''});
 assert.equal((planting as {quantity:string}).quantity,'12.5');
 assert.deepEqual(Object.keys(operationPayload(planting,false)).sort(),['item','notes','operator','plantation','planting_date','quantity','spacing','unit']);
 assert.throws(()=>cropOperationSchema.parse({kind:'fertilizations',plantation,item,quantity:'0',unit:'kg',application_date:'2026-11-20',application_method:'row',area_applied_ha:'',operator:'',notes:''}));
 const sale=cropOperationSchema.parse({kind:'harvests',plantation,notes:'',harvest_type:'total',harvest_date:'2026-11-20',quantity:'100',quantity_unit:'sack',unit_weight_kg:'60',destination:'sale',buyer_name:'Cooperativa',unit_price:'120',quality_grade:''});
 assert.throws(()=>operationPayload(sale,false));
 const payload=operationPayload(sale,true);assert.equal(payload.planting_cycle,plantation);assert.equal('plantation' in payload,false);assert.equal(payload.unit_price,'120');
 const stock=operationPayload(cropOperationSchema.parse({kind:'harvests',plantation,notes:'',harvest_type:'partial',harvest_date:'2026-11-20',quantity:'10',quantity_unit:'kg',unit_weight_kg:'',destination:'stock',buyer_name:'x',unit_price:'5',quality_grade:''}),true);
 assert.equal('unit_price' in stock,false);assert.equal(stock.buyer_name,'');
 assert.throws(()=>cropOperationSchema.parse({kind:'harvests',plantation,notes:'',harvest_type:'total',harvest_date:'2026-11-20',quantity:'10',quantity_unit:'kg',unit_weight_kg:'',destination:'sale',buyer_name:'',unit_price:'',quality_grade:''}));
 assert.equal(canWriteCrops(user('manager',false,true)),false);assert.equal(canWriteCrops(user('manager')),true);
});
