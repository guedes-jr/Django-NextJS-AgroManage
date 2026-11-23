const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateBuiltArea } = require('./structureDimensions.ts');

test('calculates and rounds the area in square meters from both dimensions', () => {
  assert.equal(calculateBuiltArea('12.50', '3,10'), '38.75');
  assert.equal(calculateBuiltArea('0.50', '0.01'), '0.01');
  assert.equal(calculateBuiltArea('0', '12'), '0.00');
});

test('requires two valid dimensions before calculating', () => {
  assert.equal(calculateBuiltArea('', '10'), null);
  assert.equal(calculateBuiltArea('10', null), null);
  assert.equal(calculateBuiltArea('-1', '10'), null);
  assert.equal(calculateBuiltArea('1.234', '10'), null);
});
