const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/reproductiveIndicators.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const { reproductiveIndicators: calculate } = exportsObject;
const female = (cycles, changes={}) => ({ id: '1', farm: 'farm1', category: 'Matriz', status: 'active', reproductive_status: 'vazia', reproductive_cycles: cycles, ...changes });
test('births and weanings use their own event year and include discarded mothers', () => {
  const result = calculate([female([{ mating_date: '2025-10-01', birth_date: '2026-01-20', weaning_date: '2026-02-10', live_born: 10, total_born: 12, weaned_quantity: 9 }], { status: 'sold' })], '2026', '');
  assert.equal(result.born, 10);
  assert.equal(result.weaned, 9);
  assert.equal(result.pregnancyRate, null);
  assert.equal(result.matrices, 0);
});
test('pending matings do not dilute resolved pregnancy and farrowing rates', () => {
  const result = calculate([female([
    { mating_date: '2026-01-01', pregnancy_confirmed: true, pregnancy_status: 'completed', birth_date: '2026-04-25' },
    { mating_date: '2026-07-01', pregnancy_confirmed: true, pregnancy_status: 'ongoing' },
    { mating_date: '2026-09-01', status: 'pending_dg' },
    { mating_date: '2026-09-02', status: 'failed' },
  ])], '2026', '');
  assert.equal(result.coverageRate, 100);
  assert.ok(Math.abs(result.pregnancyRate - 200/3) < 1e-10);
  assert.equal(result.farrowingRate, 100);
});
test('weight means are weighted by piglets and farm filters exclude other farms', () => {
  const result = calculate([
    female([{ birth_date: '2026-01-01', live_born: 10, avg_birth_weight_kg: 1, weaning_date: '2026-01-21', weaned_quantity: 10, avg_weaning_weight_kg: 5 }]),
    female([{ birth_date: '2026-01-01', live_born: 20, avg_birth_weight_kg: 2, weaning_date: '2026-01-21', weaned_quantity: 20, avg_weaning_weight_kg: 8 }], { id: '2' }),
    female([{ birth_date: '2026-01-01', live_born: 1000, avg_birth_weight_kg: 99 }], { id: '3', farm: 'other' }),
  ], '2026', 'farm1');
  assert.equal(result.birthWeight, 5/3);
  assert.equal(result.weaningWeight, 7);
  assert.equal(result.born, 30);
});
test('intervals use the previous year as a baseline without mixing other years', () => {
  const result = calculate([female([
    { mating_date: '2025-01-01', birth_date: '2025-05-01', weaning_date: '2025-05-21' },
    { mating_date: '2025-05-26', birth_date: '2025-09-01', weaning_date: '2025-09-21' },
    { mating_date: '2026-01-01', birth_date: '2026-04-01' },
  ])], '2026', '');
  assert.equal(result.birthInterval, 212);
  assert.equal(result.weanToMating, 102);
});
test('empty datasets expose null for ratios and real zero for counts', () => {
  const result = calculate([], '2026', '');
  assert.equal(result.born, 0);
  assert.equal(result.weaned, 0);
  assert.equal(result.pregnancyRate, null);
  assert.equal(result.birthWeight, null);
});
