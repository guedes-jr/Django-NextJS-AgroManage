const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = ts.transpileModule(fs.readFileSync(`${__dirname}/swineLaborService.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function service(api = {}, cryptoApi = { randomUUID: () => "unique-id" }) {
  const exports = {};
  vm.runInNewContext(source, { exports, require: () => ({ default: api }), crypto: cryptoApi });
  return exports;
}
test('daily, hourly and monthly costs use people and the correct units', () => {
  const { calculateLaborTotal: total } = service();
  assert.equal(total('daily', 2, 5, 120), 1200);
  assert.equal(total('hourly', 2, 6, 15), 180);
  assert.equal(total('monthly', 2, 8, 2000), 4000);
  assert.equal(total('hourly', 1, 1.5, 15.25), 22.88);
  for (const args of [['daily', 0, 1, 120], ['hourly', 1, -2, 15], ['daily', 1.5, 1, 120], ['daily', 1, 1, Infinity]]) assert.equal(total(...args), 0);
});
test('saving records cost by sector without requiring a batch', async () => {
  const calls = [];
  const api = { get: async () => ({ data: [{ id: 'category', name: 'Mão de Obra - Suinocultura', category_type: 'expense' }] }), post: async (url, body) => { calls.push({ url, body }); return { data: {} }; } };
  const labor = { sector: 'Creche', worker: 'Equipe 1', activity: 'Limpeza', type: 'daily', people: 3, quantity: 2, rate: 100, observations: '' };
  await service(api).createSwineLabor('2026-10-02', labor);
  assert.equal(calls.length, 1);
  assert.equal('animal_batch' in calls[0].body, false);
  assert.equal(calls[0].body.amount, '600.00');
  assert.equal(JSON.parse(calls[0].body.notes).labor.sector, 'Creche');
  assert.equal(service().readLaborDetails(calls[0].body.notes).type, 'daily');
  assert.equal(service().readLaborDetails('2 pessoas, 8 horas'), null);
});
test('history includes all pages and excludes cancelled or unrelated entries', async () => {
  const api = { get: async url => ({ data: url.includes('page=2') ? { results: [{ reference: 'LABOR-SWINE-2', status: 'paid' }], next: null } : { results: [{ reference: 'LABOR-SWINE-1', status: 'paid' }, { reference: 'LABOR-SWINE-3', status: 'cancelled' }, { reference: 'OTHER', status: 'paid' }], next: '/finance/transactions/?page=2' } }) };
  assert.equal((await service(api).getSwineLaborHistory()).length, 2);
});

test('saving succeeds in browsers without crypto.randomUUID', async () => {
  for (const cryptoApi of [undefined, {}, { getRandomValues: bytes => { bytes.fill(17); return bytes; } }]) {
    const calls = [];
    const api = { get: async () => ({ data: [{ id: 'category', name: 'Mão de Obra - Suinocultura', category_type: 'expense' }] }), post: async (url, body) => { calls.push(body); return { data: {} }; } };
    const labor = { sector: 'Geral', worker: 'João', activity: 'Manejo', type: 'daily', people: 15, quantity: 10, rate: 120, observations: '' };
    await service(api, cryptoApi === undefined ? null : cryptoApi).createSwineLabor('2026-10-02', labor);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].amount, '18000.00');
    assert.match(calls[0].reference, /^LABOR-SWINE-/);
    assert.ok(calls[0].reference.length <= 100);
  }
});
test('save failures expose relevant API validation and permission messages', () => {
  const { laborSaveError } = service();
  assert.match(laborSaveError({ response: { status: 400, data: { amount: ['Valor inválido.'] } } }), /Valor: Valor inválido/);
  assert.match(laborSaveError({ response: { status: 403 } }), /permissão/);
  assert.match(laborSaveError(new Error('network')), /Tente novamente/);
});
