import assert from 'node:assert/strict';
import { test } from 'node:test';
import { userSchema, type User } from '../src/features/auth/contracts';
import { homeSections } from '../src/features/home/homeSections';

const make = (access: Partial<User['access']>): User => userSchema.parse({
  id: '6a4b3d2c-1e0f-4a9b-8c7d-6e5f4a3b2c1d', full_name: 'Teste', email: 'test@example.com',
  force_password_change: false, is_platform_staff: false, affiliate_portal_only: false,
  access: { role: 'operator', can_manage_users: false, can_view_financial: false, can_operate_crops: false, livestock_species: ['bovinos'], read_only: false, ...access },
});

test('home grows with the role', () => {
  assert.deepEqual(homeSections(make({ role: 'veterinarian' })), ['modules']);
  // Veterinarian: only the Área do veterinário bridge and the personal modules.
  assert.deepEqual(homeSections(make({ role: 'veterinarian', veterinary: true })), ['veterinary', 'modules']);
  assert.deepEqual(homeSections(make({ role: 'manager', can_view_financial: true, livestock_species: null, veterinary: true })), ['veterinary', 'finance', 'dairy', 'agenda', 'financeDetail']);
  assert.deepEqual(homeSections(make({})), ['actions', 'dairy', 'agenda', 'modules']);
  assert.deepEqual(homeSections(make({ role: 'manager', can_view_financial: true, livestock_species: null })), ['finance', 'dairy', 'agenda', 'financeDetail']);
  assert.deepEqual(homeSections(make({ role: 'admin', can_view_financial: true, can_manage_users: true, livestock_species: null })), ['finance', 'dairy', 'agenda', 'financeDetail', 'admin']);
});

test('sections follow data access, not only the role name', () => {
  // Swine-only operator: no dairy panel.
  assert.deepEqual(homeSections(make({ livestock_species: ['suinos'] })), ['actions', 'agenda', 'modules']);
  // Read-only operator: no routines to record.
  assert.equal(homeSections(make({ read_only: true })).includes('actions'), false);
  // Admin without the financial flag keeps the operational home plus administration.
  assert.deepEqual(homeSections(make({ role: 'admin', can_manage_users: true, livestock_species: null })), ['actions', 'dairy', 'agenda', 'admin', 'modules']);
});
