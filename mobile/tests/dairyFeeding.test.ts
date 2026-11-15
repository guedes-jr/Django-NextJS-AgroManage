import assert from 'node:assert/strict';
import { test } from 'node:test';
import { create, type AxiosAdapter } from 'axios';
import { userSchema } from '../src/features/auth/contracts';
import {
  canReadDairyFeeding,
  canWriteDairyFeeding,
  dairyFeedEstimate,
  dairyFeedingCommandSchema,
  dairyFeedingHistoryPage,
  validateDairyFeedingReceipt,
} from '../src/features/milk/dairyFeedingContracts';
import { dairyFeedingFormMessages, dairyFeedingMessages } from '../src/features/milk/dairyFeedingMessages';
import { createAuthApi, DairyFeedingSaveUnconfirmed } from '../src/services/authApi';

const farm = '00000000-0000-4000-8000-000000000001';
const animal = '00000000-0000-4000-8000-000000000002';
const feed = '00000000-0000-4000-8000-000000000003';
const requestKey = '00000000-0000-4000-8000-000000000004';
const tokens = { access: 'token', refresh: 'refresh' };

const record = {
  saved: true,
  mode: 'feeding',
  request_key: requestKey,
  farm,
  period_start: '2026-11-12',
  date: '2026-11-14',
  days: 3,
  groups: [{
    name: 'Lactação',
    animals: [{ id: animal, identifier: 'Vaca 7' }],
    head_count: 1,
    feeds: [{ item: feed, name: 'Ração', mode: 'per_head_day', quantity_kg: '2.50', total_kg: '7.50' }],
    cancelled: false,
  }],
  notes: '',
};
const command = {
  farm,
  date: '2026-11-14',
  period_start: '2026-11-12',
  request_key: requestKey,
  groups: [{ name: 'Lactação', animals: [animal], feeds: [{ item: feed, quantity_kg: '2.50', mode: 'per_head_day' as const }] }],
  notes: '',
};

test('dairy feeding history validates period, group counts, unique animals and farm scope', () => {
  assert.equal(dairyFeedingHistoryPage({ count: 1, next: null, previous: null, results: [record] }, farm).results.length, 1);
  assert.throws(() => dairyFeedingHistoryPage({ count: 1, next: null, previous: null, results: [{ ...record, farm: animal }] }, farm));
  assert.throws(() => dairyFeedingHistoryPage({ count: 1, next: null, previous: null, results: [{ ...record, days: 2 }] }, farm));
  assert.throws(() => dairyFeedingHistoryPage({ count: 1, next: null, previous: null, results: [{ ...record, groups: [{ ...record.groups[0], head_count: 2 }] }] }, farm));
});

test('only bovine admins and managers can consult dairy group feeding', () => {
  const base = userSchema.parse({
    id: animal,
    full_name: 'Teste',
    email: 'test@example.com',
    force_password_change: false,
    is_platform_staff: false,
    affiliate_portal_only: false,
    access: { role: 'manager', can_manage_users: true, can_view_financial: false, can_operate_crops: false, livestock_species: ['bovinos'], read_only: true },
  });
  assert.equal(canReadDairyFeeding(base), true);
  assert.equal(canWriteDairyFeeding(base), false);
  assert.equal(canWriteDairyFeeding({ ...base, access: { ...base.access, read_only: false } }), true);
  assert.equal(canReadDairyFeeding({ ...base, access: { ...base.access, role: 'admin' } }), true);
  assert.equal(canReadDairyFeeding({ ...base, access: { ...base.access, role: 'operator' } }), false);
  assert.equal(canReadDairyFeeding({ ...base, access: { ...base.access, role: 'feeder' } }), false);
  assert.equal(canReadDairyFeeding({ ...base, force_password_change: true }), false);
});

test('dairy feeding commands reject overlapping groups and estimate only exact, bounded totals', () => {
  assert.equal(dairyFeedingCommandSchema.safeParse(command).success, true);
  assert.equal(dairyFeedingCommandSchema.safeParse({
    ...command,
    groups: [...command.groups, { ...command.groups[0], name: 'Outro grupo' }],
  }).success, false);
  assert.equal(dairyFeedEstimate('0.01', 'per_head_day', 3, 2), '0.06');
  assert.equal(dairyFeedEstimate('2.50', 'total', 3, 2), '2.50');
  assert.equal(dairyFeedEstimate('99999999.99', 'per_head_day', 2, 1), null);
});

test('dairy feeding receipt must match the exact submitted command', () => {
  assert.equal(validateDairyFeedingReceipt(command, record).request_key, requestKey);
  assert.throws(() => validateDairyFeedingReceipt({ ...command, notes: 'alterado' }, record));
  assert.throws(() => validateDairyFeedingReceipt(command, { ...record, farm: animal }));
});

test('dairy feeding history requests only the selected farm and explicit page', async () => {
  let url = '';
  let params: unknown;
  const adapter: AxiosAdapter = async config => {
    url = config.url ?? '';
    params = config.params;
    return { data: { count: 1, next: null, previous: null, results: [record], products: [] }, status: 200, statusText: 'OK', headers: {}, config };
  };
  const api = createAuthApi('https://example.test/api/v1/', create({ adapter }));
  const result = await api.dairyFeedingHistory(tokens, 'pt-BR', farm, 2);
  assert.equal(result.results[0]?.request_key, requestKey);
  assert.equal(url, 'livestock/cattle/dairy-feeding/');
  assert.deepEqual(params, { farm, resource: 'history', page: 2, page_size: 20 });
  await assert.rejects(api.dairyFeedingHistory(tokens, 'pt-BR', animal, 1));
});

test('dairy feeding catalog is scoped, paginated and writes preserve the same command key and payload', async () => {
  const requests: { method?: string; url?: string; params?: unknown; data?: unknown }[] = [];
  let submissions = 0;
  const adapter: AxiosAdapter = async config => {
    requests.push({ method: config.method, url: config.url, params: config.params, data: config.data });
    if (config.method === 'get' && config.url === 'livestock/cattle/dairy-feeding/') {
      return { data: { count: 1, next: null, previous: null, results: [{ id: animal, identifier: 'Vaca 7', name: '', category: 'Vaca', batch_code: '' }], products: [{ id: feed, name: 'Ração' }] }, status: 200, statusText: 'OK', headers: {}, config };
    }
    if (config.method === 'post') {
      submissions += 1;
      if (submissions === 1) throw new Error('connection lost');
      return { data: record, status: 200, statusText: 'OK', headers: {}, config };
    }
    return { data: record, status: 200, statusText: 'OK', headers: {}, config };
  };
  const api = createAuthApi('https://example.test/api/v1/', create({ adapter }));
  const catalog = await api.dairyFeedingCatalog(tokens, 'pt-BR', { farm, page: 2, search: 'vaca' });
  assert.equal(catalog.results[0]?.id, animal);
  assert.deepEqual(requests[0]?.params, { farm, page: 2, page_size: 20, search: 'vaca' });
  const write = { kind: 'supply' as const, command };
  await assert.rejects(api.saveDairyFeeding(tokens, 'pt-BR', write), DairyFeedingSaveUnconfirmed);
  assert.equal((await api.saveDairyFeeding(tokens, 'pt-BR', write)).request_key, requestKey);
  const posted = requests.filter(request => request.method === 'post').map(request => request.data);
  assert.equal(posted[0], posted[1]);
  assert.deepEqual(JSON.parse(String(posted[1])), command);
  const receipt = await api.reconcileDairyFeeding(tokens, 'pt-BR', write);
  assert.equal(receipt.request_key, requestKey);
  assert.equal(requests.at(-1)?.url, `livestock/cattle/dairy-worksheet/${farm}/${requestKey}/`);
});

test('dairy group cancellation requires a reason and reconciles its audit receipt', async () => {
  const cancel = { farm, request_key: feed, source_key: requestKey, group_index: 0, reason: 'Correção de lançamento' };
  const receipt = {
    saved: true,
    mode: 'feeding_cancel',
    request_key: feed,
    farm,
    cancelled_source: `${requestKey}:0`,
    reason: cancel.reason,
  };
  const requests: { method?: string; url?: string; data?: unknown }[] = [];
  const adapter: AxiosAdapter = async config => {
    requests.push({ method: config.method, url: config.url, data: config.data });
    return { data: receipt, status: 200, statusText: 'OK', headers: {}, config };
  };
  const api = createAuthApi('https://example.test/api/v1/', create({ adapter }));
  const write = { kind: 'cancel' as const, command: cancel };
  assert.equal((await api.saveDairyFeeding(tokens, 'pt-BR', write)).mode, 'feeding_cancel');
  assert.equal((await api.reconcileDairyFeeding(tokens, 'pt-BR', write)).request_key, feed);
  assert.equal(requests[0]?.url, 'livestock/cattle/dairy-feeding/cancel/');
  assert.deepEqual(JSON.parse(String(requests[0]?.data)), cancel);
  assert.equal(requests[1]?.url, `livestock/cattle/dairy-worksheet/${farm}/${feed}/`);
  await assert.rejects(api.saveDairyFeeding(tokens, 'pt-BR', {
    kind: 'cancel',
    command: { ...cancel, reason: ' ' },
  }));
});

test('dairy feeding labels cover every supported language', () => {
  for (const copy of Object.values(dairyFeedingMessages)) {
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(dairyFeedingMessages['pt-BR']).sort());
  }
  for (const copy of Object.values(dairyFeedingFormMessages)) {
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(dairyFeedingFormMessages['pt-BR']).sort());
  }
});
