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
