const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, Date, require: name => imports[name] || (name === 'react/jsx-runtime' ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) } : new Proxy({}, { get: (_, key) => key })),
  });
  return exports;
}
function all(node, match) {
  if (!node || typeof node !== 'object') return [];
  return [...(match(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => all(child, match))];
}
test('existing session is corrected with PATCH; new session and total have explicit scopes', async () => {
  const calls = [];
  const api = { patch: async (...args) => { calls.push(['PATCH', ...args]); return { data: {} }; }, post: async (...args) => { calls.push(['POST', ...args]); return { data: {} }; } };
  const { milkProductionService: service } = load('services/milkProductionService.ts', { './api': { default: api } });
  const values = { liters: '12.00', discarded_liters: '0', discard_reason: '', notes: '' };
  await service.saveIndividual('cow', '2026-11-01', 'morning', values, 'existing');
  assert.equal(calls[0][0], 'PATCH');
  assert.equal(calls[0][1], '/livestock/cattle/milk/existing/');
  await service.saveIndividual('cow', '2026-11-01', 'afternoon', values);
  assert.equal(calls[1][2].animal, 'cow');
  assert.equal(calls[1][2].session, 'afternoon');
  await service.saveTotal('farm', '2026-11-01', values);
  assert.equal(calls[2][2].farm, 'farm');
  assert.equal(calls[2][2].date, '2026-11-01');
  assert.equal(calls[2][2].animal, undefined);
});
test('production shortcuts update the form only; next cow submits after native validation', () => {
  const helpers = load('services/milkProductionService.ts');
  const { ProductionForm } = load('components/cattle/MilkProduction.tsx', { '@/services/milkProductionService': helpers });
  let values, saves = 0, next = 0;
  const props = { values: { liters: '', discarded_liters: '0', discard_reason: '', notes: '' }, setValues: value => { values = value; }, disabled: false, onSave: () => saves++, onNext: () => next++, total: 12 };
  const tree = ProductionForm(props);
  all(tree, n => n.type === 'button' && n.props.children?.[0] === 12)[0].props.onClick();
  assert.equal(values.liters, '12.00'); assert.equal(saves, 0);
  const nextButton = all(tree, n => n.type === 'button' && n.props.type === 'submit')[1];
  nextButton.props.onClick({ currentTarget: { form: { reportValidity: () => false } }, preventDefault() {} });
  assert.equal(next, 0);
  nextButton.props.onClick({ currentTarget: { form: { reportValidity: () => true } }, preventDefault() {} });
  assert.equal(next, 1);
});
test('discard requires a reason and saving or read-only state disables the entire form', () => {
  const { ProductionForm } = load('components/cattle/MilkProduction.tsx', { '@/services/milkProductionService': load('services/milkProductionService.ts') });
  const tree = ProductionForm({ values: { liters: '12', discarded_liters: '2', discard_reason: '', notes: '' }, setValues() {}, disabled: true, onSave() {}, editing: false, saving: true });
  assert.equal(all(tree, n => n.type === 'fieldset')[0].props.disabled, true);
  assert.equal(all(tree, n => n.type === 'input' && n.props.maxLength === 200)[0].props.required, true);
});
