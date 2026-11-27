import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceState,planInvoicesSchema,safePaymentUrl} from '../src/features/organization/contracts';

const row=(extra:Record<string,unknown>)=>planInvoicesSchema.parse({subscription_status:'active',results:[{id:'1',number:'AG-1',status:'open',due_date:'2027-01-01',total:'99.80',balance:'99.80',overdue:false,...extra}]}).results[0]!;

test('invoice state follows status and overdue flag', () => {
  assert.equal(invoiceState(row({})),'open');
  assert.equal(invoiceState(row({status:'overdue',overdue:true})),'overdue');
  assert.equal(invoiceState(row({status:'paid'})),'paid');
  assert.equal(invoiceState(row({status:'uncollectible'})),'void');
  assert.equal(row({}).payment_url,'');
});

test('only https payment links are opened', () => {
  assert.equal(safePaymentUrl('https://www.asaas.com/i/pay_1'),'https://www.asaas.com/i/pay_1');
  assert.equal(safePaymentUrl('http://insecure.example/pay'),null);
  assert.equal(safePaymentUrl('javascript:alert(1)'),null);
  assert.equal(safePaymentUrl(''),null);
});

test('suspended subscription is read from the access payload and payment options parse', async () => {
  const {isSuspended,userSchema}=await import('../src/features/auth/contracts');
  const {invoicePaymentSchema}=await import('../src/features/organization/contracts');
  const base={id:'u',email:'a@b.c',full_name:'A',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'admin',can_manage_users:true,can_view_financial:true,can_operate_crops:true,livestock_species:null,read_only:false}};
  assert.equal(isSuspended(userSchema.parse({...base,access:{...base.access,subscription_status:'suspended'}})),true);
  assert.equal(isSuspended(userSchema.parse({...base,access:{...base.access,subscription_status:'active'}})),false);
  assert.equal(isSuspended(userSchema.parse(base)),false);
  const boleto=invoicePaymentSchema.parse({method:'boleto',amount:'80.00',bank_slip_url:'https://asaas/b/1',digitable_line:'34191'});
  assert.equal(boleto.pix_copy_paste,'');
  assert.throws(()=>invoicePaymentSchema.parse({method:'dinheiro',amount:'1'}));
});
