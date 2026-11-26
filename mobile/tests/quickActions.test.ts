import assert from 'node:assert/strict';
import { test } from 'node:test';
import { userSchema, type User } from '../src/features/auth/contracts';
import { agendaStatusTone } from '../src/features/agenda/presentation';
import { quickActionMessages, quickActions } from '../src/features/workspace/quickActions';
import { languages } from '../src/i18n/messages';

const make = (access: Partial<User['access']>): User => userSchema.parse({
  id: '6a4b3d2c-1e0f-4a9b-8c7d-6e5f4a3b2c1d', full_name: 'Teste', email: 'test@example.com',
  force_password_change: false, is_platform_staff: false, affiliate_portal_only: false,
  access: { role: 'operator', can_manage_users: false, can_view_financial: false, can_operate_crops: false, livestock_species: ['bovinos'], read_only: false, ...access },
});
const ids = (user: User) => quickActions(user).map(action => action.id);

test('field routines come first and follow the destination permissions', () => {
  const operator = ids(make({}));
  assert.deepEqual(operator.slice(0, 3), ['milk', 'feeding', 'clinic']);
  assert.ok(operator.includes('task'));
  assert.ok(operator.includes('feeding'), 'operators with cattle record daily feeding (former feeder role)');
  assert.equal(operator.includes('stock'), false, 'operators cannot write inventory');
  assert.equal(operator.includes('finance'), false);
  assert.equal(operator.includes('swine'), false);
});

test('a veterinarian without other segments has no field routine; with cattle, works like an operator', () => {
  assert.deepEqual(ids(make({ role: 'veterinarian', segments: ['area-veterinario'] })), []);
  assert.ok(ids(make({ role: 'veterinarian', segments: ['area-veterinario', 'gado-de-corte','pecuaria-leiteira'] })).includes('feeding'));
});

test('managers get native inventory and finance routines, read-only users get none', () => {
  const manager = quickActions(make({ role: 'manager', can_view_financial: true, livestock_species: ['bovinos', 'suinos'] }));
  const byId = Object.fromEntries(manager.map(action => [action.id, action]));
  assert.deepEqual(byId.stock?.destination, { pathname: '/inventory/launch' });
  assert.deepEqual(byId.finance?.destination, { pathname: '/finance/form' });
  assert.equal(byId.swine?.destination, null);
  assert.equal(manager[0]?.id, 'milk');
  assert.deepEqual(quickActions(make({ role: 'manager', read_only: true })), []);
});

test('every quick action has a label and description in all languages', () => {
  const all = quickActions(make({ role: 'admin', can_view_financial: true, can_operate_crops: true, livestock_species: ['bovinos', 'suinos'] }));
  for (const language of languages) {
    const copy = quickActionMessages[language];
    assert.ok(copy.title.trim() && copy.hint.trim() && copy.web.trim());
    for (const action of all) assert.ok(copy.actions[action.id].label.trim() && copy.actions[action.id].description.trim(), `${language}:${action.id}`);
  }
});

test('status tone reinforces known agenda statuses and stays neutral otherwise', () => {
  assert.equal(agendaStatusTone('done'), 'success');
  assert.equal(agendaStatusTone('recorded'), 'success');
  assert.equal(agendaStatusTone('open'), 'warning');
  assert.equal(agendaStatusTone('in_progress'), 'info');
  assert.equal(agendaStatusTone('critical'), 'danger');
  assert.equal(agendaStatusTone('cancelled'), 'neutral');
  assert.equal(agendaStatusTone('anything-else'), 'neutral');
});

test('bottom navigation keeps the create button centred when tabs are missing', async () => {
  const { balanceNavSlots } = await import('../src/features/workspace/navigation');
  // Full set: already balanced, search not needed.
  assert.deepEqual(balanceNavSlots(['home', 'agenda'], ['finance', 'modules'], 'search', true), { left: ['home', 'agenda'], right: ['finance', 'modules'] });
  // Without finance, search fills the right side.
  assert.deepEqual(balanceNavSlots(['home', 'agenda'], ['modules'], 'search', true), { left: ['home', 'agenda'], right: ['search', 'modules'] });
  // Without search access, an empty slot keeps the button centred.
  assert.deepEqual(balanceNavSlots(['home', 'agenda'], ['modules'], null, true), { left: ['home', 'agenda'], right: ['spacer', 'modules'] });
  // Feeder: home | + | modules.
  assert.deepEqual(balanceNavSlots(['home'], ['modules'], null, true), { left: ['home'], right: ['modules'] });
  // No create button: nothing to centre.
  assert.deepEqual(balanceNavSlots(['home', 'agenda'], ['modules'], 'search', false), { left: ['home', 'agenda'], right: ['modules'] });
});
