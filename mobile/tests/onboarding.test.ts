import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOnboarding, isTrialExpired, userSchema } from '../src/features/auth/contracts';
import { buildSelection, catalogSchema, onboardingSummarySchema, tierFor, trialDaysLeft } from '../src/features/onboarding/contracts';
import { fill, onboardingMessages } from '../src/features/onboarding/messages';

const catalog = catalogSchema.parse([
  { code: 'plantacoes', name: 'Plantações', subtitle: '', metric_label: 'hectares', tiers: [
    { id: 't1', label: 'Até 10 ha', minimum_quantity: 1, maximum_quantity: 10, monthly_price: '50.00', requires_quote: false },
    { id: 't2', label: 'Acima de 10 ha', minimum_quantity: 11, maximum_quantity: null, monthly_price: null, requires_quote: true },
  ] },
  { code: 'gado-de-corte', name: 'Gado de corte', subtitle: '', metric_label: 'animais', tiers: [
    { id: 't3', label: 'Sob consulta', minimum_quantity: null, maximum_quantity: null, monthly_price: null, requires_quote: true },
  ] },
]);

test('first access selection needs a quantity only for segments priced by size', () => {
  assert.equal(buildSelection(catalog, {}), null);
  assert.equal(buildSelection(catalog, { plantacoes: '' }), null);
  assert.equal(buildSelection(catalog, { plantacoes: '0' }), null);
  assert.deepEqual(buildSelection(catalog, { plantacoes: '12', 'gado-de-corte': '' }), [
    { segment_code: 'plantacoes', quantity: 12 }, { segment_code: 'gado-de-corte', quantity: null },
  ]);
});

test('quantity picks the tier and unsized segments use their single tier', () => {
  assert.equal(tierFor(catalog[0]!, 5)?.id, 't1');
  assert.equal(tierFor(catalog[0]!, 40)?.id, 't2');
  assert.equal(tierFor(catalog[0]!, null), null);
  assert.equal(tierFor(catalog[1]!, null)?.id, 't3');
});

test('access stage routes the app and trial days round up', () => {
  const base = { id: 'u', email: 'a@b.c', full_name: 'A', force_password_change: false, is_platform_staff: false, affiliate_portal_only: false };
  const access = { role: 'admin', can_manage_users: true, can_view_financial: true, can_operate_crops: false, livestock_species: null, read_only: false };
  assert.equal(isOnboarding(userSchema.parse({ ...base, access: { ...access, access_stage: 'onboarding' } })), true);
  assert.equal(isTrialExpired(userSchema.parse({ ...base, access: { ...access, access_stage: 'trial_expired' } })), true);
  assert.equal(isOnboarding(userSchema.parse({ ...base, access })), false);
  const now = Date.parse('2026-11-27T12:00:00Z');
  assert.equal(trialDaysLeft('2026-12-04T12:00:00Z', now), 7);
  assert.equal(trialDaysLeft('2026-11-27T18:00:00Z', now), 1);
  assert.equal(trialDaysLeft('2026-11-26T12:00:00Z', now), 0);
});

test('server summary parses and every language has the same copy', () => {
  const summary = onboardingSummarySchema.parse({
    price: { currency: 'BRL', billing_cycle: 'monthly', gross: '50.00', subtotal: '50.00', discount_total: '0.00', total: '50.00',
      lines: [{ segment_code: 'plantacoes', name: 'Plantações', tier_label: 'Até 10 ha', base: '50.00', on_request: false, total: '50.00', discounts: [], quantity: 5 }],
      subscription_discounts: [] },
    billing_cycle: 'monthly', months: 1, cycle_total: '50.00', unpriced: [], trial_days: 7, trial_ends_at: '2026-12-04T12:00:00Z',
    coupon_applied: false, coupon_error: '', terms_version: '2026-11',
  });
  assert.equal(summary.price.lines[0]?.quantity, 5);
  const keys = Object.keys(onboardingMessages['pt-BR']).sort();
  for (const language of ['en', 'es', 'pt-PT'] as const) assert.deepEqual(Object.keys(onboardingMessages[language]).sort(), keys);
  assert.equal(fill(onboardingMessages.en.trialDays, { days: 3 }), 'Free period: 3 day(s) left.');
});
