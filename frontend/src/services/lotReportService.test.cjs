const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/lotReportService.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject, require: () => ({}) });
const { isProductionLot, lotReportTotals, lotReportHeaders, lotReportExportRow } = exportsObject;
test('footer uses weighted cost and margin rather than adding row ratios', () => {
  const totals = lotReportTotals([
    { quantity: 10, total_cost: '100', cost_per_animal: '10', sales: '200', profit: '100', margin: '50', nursery: '30' },
    { quantity: 20, total_cost: '500', cost_per_animal: '25', sales: '600', profit: '100', margin: '16.666', nursery: null },
  ]);
  assert.equal(totals.total_cost, 600);
  assert.equal(totals.cost_per_animal, 20);
  assert.equal(totals.margin, 25);
  assert.equal(totals.nursery, 30);
  assert.equal(totals.labor, null);
});
test('sold batch uses sale quantity while missing denominators remain unavailable', () => {
  assert.equal(lotReportTotals([{ quantity: 0, cost_quantity: 10, total_cost: '100', cost_per_animal: '10' }]).cost_per_animal, 10);
  assert.equal(lotReportTotals([{ quantity: 0, total_cost: '100', cost_per_animal: null }]).cost_per_animal, null);
  assert.equal(lotReportTotals([{ quantity: 10, total_cost: '0', sales: '0', profit: '0' }]).margin, null);
});
test('export matches all data columns and preserves absent prices', () => {
  const row = lotReportExportRow({ batch_code: 'L001', quantity: 10, status: 'active', status_display: 'Ativo', production_type: 'Ciclo completo', matrices: ['M001'], purchase: '0', labor: null, total_cost: '25' });
  assert.equal(row.length, lotReportHeaders.length);
  assert.equal(row[2], 'M001');
  assert.equal(row[8], 0);
  assert.equal(row[15], '—');
  assert.equal(row[16], 25);
});

test('the general lot report excludes breeding animals while retaining production lots', () => {
  for (const category of ['Matriz', 'Marrã', 'Reprodutor', 'Cachaço', 'Aguardando Cobertura']) {
    assert.equal(isProductionLot({ batch_code: '145987', category, phase: 'engorda' }), false);
  }
  assert.equal(isProductionLot({ batch_code: 't-5631', category: 'Marrã' }), false);
  assert.equal(isProductionLot({ production_type: 'Reprodução' }), false);
  assert.equal(isProductionLot({ phase: 'reproducao' }), false);
  assert.equal(isProductionLot({ phase: 'aguardando_cobertura' }), false);
  assert.equal(isProductionLot({ category: 'Leitão', phase: 'creche', production_type: 'Ciclo completo' }), true);
  assert.equal(isProductionLot({ category: 'Terminação', phase: 'engorda', production_type: 'Compra p/ engorda', status: 'sold' }), true);
});
test('excluding matrices applies to exported rows and report totals', () => {
  const all = [
    { batch_code: '145987', category: 'Matriz', quantity: 1, total_cost: '2000', status: 'active' },
    { batch_code: 'L001', category: 'Leitão', quantity: 10, total_cost: '100', cost_per_animal: '10', status: 'active' },
  ];
  const lots = all.filter(isProductionLot);
  assert.equal(lots.length, 1);
  assert.equal(lotReportExportRow(lots[0])[0], 'L001');
  assert.equal(lotReportTotals(lots).total_cost, 100);
});
