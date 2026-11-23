import { semenSaleAmount, semenSaleCommand } from '../src/features/swine/semenSales';
import { swineSales } from '../src/features/swine/sales';
import { swineSaleAmount, swineTransitionInput, swineTransitionOptions } from '../src/features/swine/transitions';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  matchesSwineBirth, matchesSwineDiagnosis, parseSwineBatchHistoryPage, parseSwinePhasePage, parseSwineRecordDetail, swinePhases,
  swineBatchWeightCommandSchema, swineBirthInputSchema, swineBirthOptionsSchema, swineDiagnosisInputSchema, swineDiagnosisOptionsSchema, swineMatingCommandSchema,
} from '../src/features/swine/contracts';
import { swineMessages } from '../src/features/swine/messages';

test('parses the paginated mobile projection without manufacturing missing fields', () => {
  const page = parseSwinePhasePage('marras', {
    count: 1, page: 1, page_size: 20, next: false, previous: false,
    rows: [{ id: 'm-1', identifier: 'M-001', idade: null, peso: null, entrada: null, status: 'pronta' }],
  });
  assert.equal(page.phase, 'marras');
  assert.equal(page.rows[0]?.data.id, 'm-1');
  assert.equal(page.rows[0]?.data.idade, null);
});

test('all organization languages label every swine phase', () => {
  for (const copy of Object.values(swineMessages)) {
    assert.deepEqual(Object.keys(copy.phase).sort(), [...swinePhases].sort());
    assert.ok(copy.detail.trim());
    assert.ok(copy.phaseSummary.trim());
  }
});


const key = '7f0f0f0f-0000-4000-8000-000000000001';
const batchId = '7f0f0f0f-0000-4000-8000-000000000002';

test('weight command normalizes kg and rejects unsupported fields or non-positive weights', () => {
  const command = swineBatchWeightCommandSchema.parse({ request_key: key, phase: 'creche', weight_kg: '18,5', weighing_date: '2026-11-20', notes: ' ' });
  assert.equal(command.weight_kg, '18.500');
  assert.equal(command.notes, '');
  assert.equal(swineBatchWeightCommandSchema.safeParse({ ...command, weight_kg: '0' }).success, false);
  assert.equal(swineBatchWeightCommandSchema.safeParse({ ...command, phase: 'marras' }).success, false);
  assert.equal(swineBatchWeightCommandSchema.safeParse({ ...command, quantity: 3 }).success, false);
});

test('mating command only accepts coverage-ready statuses and known types', () => {
  const base = { request_key: key, expected_status: 'pronta', mating_date: '2026-11-20', mating_type: 'iatf', sire_info: '', notes: '' };
  assert.equal(swineMatingCommandSchema.safeParse(base).success, true);
  assert.equal(swineMatingCommandSchema.safeParse({ ...base, expected_status: 'coberta' }).success, false);
  assert.equal(swineMatingCommandSchema.safeParse({ ...base, mating_type: 'embryo' }).success, false);
});

test('diagnosis input must match the reviewed options before sending', () => {
  const options = swineDiagnosisOptionsSchema.parse({
    today: '2026-11-23', timezone: 'America/Sao_Paulo',
    animal: { id: batchId, identifier: 'M-01', farm: key, farm_name: 'Granja', version: '2026-11-23T10:00:00+00:00' },
    mating: { id: key, date: '2026-10-29', version: '2026-10-29T10:00:00+00:00', expected_birth_date: null },
    allowed_results: ['negative'],
  });
  const input = swineDiagnosisInputSchema.parse({
    expected_farm: key, expected_mating: key, animal_version: options.animal.version, mating_version: options.mating.version,
    diagnosis_date: '2026-11-23', result: 'negative',
  });
  assert.equal(matchesSwineDiagnosis(options, input), true);
  assert.equal(matchesSwineDiagnosis(options, { ...input, result: 'positive' }), false, 'positive needs a valid forecast');
  assert.equal(matchesSwineDiagnosis(options, { ...input, diagnosis_date: '2026-11-24' }), false);
  assert.equal(matchesSwineDiagnosis(options, { ...input, diagnosis_date: '2026-10-28' }), false);
  assert.equal(matchesSwineDiagnosis(options, { ...input, animal_version: '2026-11-23T11:00:00+00:00' }), false);
});

test('record detail rejects another record or a batch outside the requested phase', () => {
  const batch = { id: batchId, batch_code: 'L-01', species_code: 'suinos', phase: 'creche', entry_date: '2026-11-01', exit_date: null, status: 'active', quantity: 20, avg_weight_kg: null };
  const detail = parseSwineRecordDetail('creche', batchId, batch);
  assert.equal(detail.kind, 'batch');
  assert.throws(() => parseSwineRecordDetail('engorda', batchId, batch));
  assert.throws(() => parseSwineRecordDetail('creche', key, batch));
});

test('batch history pagination must match the requested page', () => {
  const page = { count: 21, page: 1, page_size: 20, next: true, previous: false, results: [{ type: 'weighing', date: '2026-11-20', weight_kg: '18.5' }] };
  assert.equal(parseSwineBatchHistoryPage(page, 1, 20).results.length, 1);
  assert.throws(() => parseSwineBatchHistoryPage({ ...page, next: false }, 1, 20));
  assert.throws(() => parseSwineBatchHistoryPage(page, 2, 20));
});

test('birth input requires at least one piglet and must match the reviewed pregnancy', () => {
  const options = swineBirthOptionsSchema.parse({
    today: '2026-11-23', timezone: 'America/Sao_Paulo',
    animal: { id: batchId, identifier: 'M-03', category: 'Marrã', farm: key, farm_name: 'Granja', version: '2026-11-23T10:00:00+00:00' },
    pregnancy: { id: key, start_date: '2026-07-31', expected_birth_date: '2026-11-22', version: '2026-08-25T10:00:00+00:00' },
    birth_order: 1, default_weaning_days: 21, max_piglets: 40,
  });
  const base = {
    request_key: key, expected_farm: key, expected_pregnancy: key, animal_version: options.animal.version,
    pregnancy_version: options.pregnancy.version, birth_date: '2026-11-23', live_born: 12, stillborn: 1, mummified: 0,
    avg_weight_kg: '1,45', expected_weaning_days: 21, notes: '',
  };
  const input = swineBirthInputSchema.parse(base);
  assert.equal(input.avg_weight_kg, '1.45');
  assert.equal(matchesSwineBirth(options, input), true);
  assert.equal(swineBirthInputSchema.safeParse({ ...base, live_born: 0, stillborn: 0 }).success, false);
  assert.equal(swineBirthInputSchema.safeParse({ ...base, live_born: 30, stillborn: 11 }).success, false);
  assert.equal(swineBirthInputSchema.safeParse({ ...base, expected_weaning_days: 0 }).success, false);
  assert.equal(matchesSwineBirth(options, { ...input, birth_date: '2026-07-30' }), false);
  assert.equal(matchesSwineBirth(options, { ...input, birth_date: '2026-11-24' }), false);
  assert.equal(matchesSwineBirth(options, { ...input, pregnancy_version: '2026-11-01T10:00:00+00:00' }), false);
});

test('every language labels the farrowing form', () => {
  for (const copy of Object.values(swineMessages)) {
    for (const value of [copy.birthTitle, copy.reviewBirth, copy.confirmBirth, copy.birthInvalid, copy.birthUnconfirmed, copy.expectedWeaningDate]) assert.ok(value.trim());
  }
});

test('reproductive transitions accept only the inputs for the reviewed operation', () => {
  const context = {
    request_key: 'ee78b0af-ed06-474e-862f-0c6e557a0ebe',
    expected_farm: '9c102c1d-9c6e-4a37-aa16-4a3a874a6149',
    version: 'reviewed', date: '2026-11-23',
  };
  const weaning = { ...context, kind: 'weaning', quantity: 12, weight: '6,50' };
  const parsed = swineTransitionInput.parse(weaning);
  assert.equal(parsed.kind === 'weaning' && parsed.weight, '6.50');
  assert.equal(swineTransitionInput.safeParse({ ...weaning, quantity: 0 }).success, false);
  assert.equal(swineTransitionInput.safeParse({ ...weaning, weight: '0' }).success, false);
  const loss = { ...context, kind: 'loss', reason: 'REABSORCAO', notes: '' };
  assert.equal(swineTransitionInput.safeParse(loss).success, true);
  assert.equal(swineTransitionInput.safeParse({ ...loss, reason: 'unknown' }).success, false);
});

test('transfer options require the immediate next phase and the quantity of the lot', () => {
  const options = {
    id: 'ee78b0af-ed06-474e-862f-0c6e557a0ebe',
    farm: '9c102c1d-9c6e-4a37-aa16-4a3a874a6149',
    farm_name: 'Farm', animal: 'L-01', version: 'reviewed',
    since: '2026-11-10', today: '2026-11-23',
    kind: 'transfer', source: 'creche', destination: 'crescimento', quantity: 20,
  };
  assert.equal(swineTransitionOptions.safeParse(options).success, true);
  assert.equal(swineTransitionOptions.safeParse({ ...options, destination: 'engorda' }).success, false);
  assert.equal(swineTransitionOptions.safeParse({ ...options, quantity: null }).success, false);
});

test('mortality requires a positive count and a reviewed cause', () => {
  const command = {
    request_key: 'ee78b0af-ed06-474e-862f-0c6e557a0ebe',
    expected_farm: '9c102c1d-9c6e-4a37-aa16-4a3a874a6149',
    version: 'reviewed', date: '2026-11-23',
    kind: 'mortality', quantity: 2, notes: '', cause: 'Test cause',
  };
  assert.equal(swineTransitionInput.safeParse(command).success, true);
  assert.equal(swineTransitionInput.safeParse({ ...command, cause: ' ' }).success, false);
  assert.equal(swineTransitionInput.safeParse({ ...command, quantity: 1.5 }).success, false);
});

test('sale review uses exact decimal rounding at the cent', () => {
  assert.equal(swineSaleAmount('200.500', '4.35'), '872.18');
  assert.equal(swineSaleAmount('1.005', '1'), '1.00');
  assert.equal(swineSaleAmount('1.015', '1'), '1.02');
  assert.equal(swineSaleAmount('0.001', '0.01'), null);
  assert.equal(swineSaleAmount('999999999', '1000.00'), null);
});


test('sales history retains unknown legacy prices and weight', () => {
  const row = { id: 'ee78b0af-ed06-474e-862f-0c6e557a0ebe', date: '2026-11-23', batch_code: 'L-1',
    quantity: 2, amount: '350.25', buyer: 'Comprador', price_per_kg: null, weight_kg: null };
  assert.deepEqual(swineSales.parse([row]), [row]);
});

test('semen sales validate stock, dates and exact decimal totals', () => {
  const data = {
    request_key: 'ee78b0af-ed06-474e-862f-0c6e557a0ebe', collection: '9c102c1d-9c6e-4a37-aa16-4a3a874a6149',
    expected_balance: 10, quantity: 4, price: '20,50', buyer: 'Comprador', date: '2026-11-23', due_date: '2026-11-30',
  };
  const sale = semenSaleCommand.parse(data);
  assert.equal(semenSaleAmount(sale.quantity, sale.price), '82.00');
  assert.equal(semenSaleCommand.safeParse({ ...data, quantity: 11 }).success, false);
  assert.equal(semenSaleCommand.safeParse({ ...data, due_date: '2026-11-22' }).success, false);
});
