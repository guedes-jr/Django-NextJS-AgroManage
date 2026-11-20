import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSwinePhasePage, swinePhases } from '../src/features/swine/contracts';
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
