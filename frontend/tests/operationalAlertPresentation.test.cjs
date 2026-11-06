const locale = require('./helpers/locale.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
function moduleAt(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, require: name => imports[name] || (name === '@/lib/locale' ? locale : null) || (name === 'react/jsx-runtime' ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) } : { default: 'Link' }),
  });
  return exports;
}
const presentation = moduleAt('services/operationalAlertPresentation.ts');
function all(node, match) {
  if (!node || typeof node !== 'object') return [];
  return [...(match(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => all(child, match))];
}
test('newest alerts sort dates descending, preserve undated order and never mutate input', () => {
  const input = [{ text: 'undated 1' }, { text: 'old', due_date: '2026-06-01' }, { text: 'new', due_date: '2026-10-31' }, { text: 'undated 2', due_date: 'invalid' }];
  assert.deepEqual(Array.from(presentation.newestAlerts(input), item => item.text), ['new', 'old', 'undated 1', 'undated 2']);
  assert.equal(input[0].text, 'undated 1');
});
test('alert cards show only ten latest records, retain full count and link to complete list', () => {
  const { AlertListCard } = moduleAt('components/ui/AlertListCard.tsx', { '@/services/operationalAlertPresentation': presentation });
  const alerts = Array.from({ length: 47 }, (_, index) => ({ text: `Alert ${index}`, due_date: `2026-10-${String(index % 30 + 1).padStart(2,'0')}`, type: 'info', time: 'Hoje' }));
  const tree = AlertListCard({ alerts });
  assert.equal(all(tree, n => n.props?.className === 'repro-alert-text').length, 10);
  assert.equal(all(tree, n => n.props?.href === presentation.ALERTS_PAGE).length, 1);
  assert.equal(all(tree, n => n.props?.className?.includes('repro-badge'))[0].props.children, '47 alertas');
});
test('complete alert lookup requests all dates only for the operators permitted species', async () => {
  const requested = [];
  const service = moduleAt('services/operationalAlertService.ts', {
    './organizationAccess': { getOrganizationAccess: async () => ({ role: 'operator', livestock_species: ['bovinos'] }) },
    './livestockService': { getReproductionDashboard: async (species, all) => { requested.push([species, all]); return { alerts: [{ text: 'Teste', alert_key: 'key', type: 'warning' }] }; } },
    './operationalAlertPresentation': presentation,
  });
  const results = await service.getSystemAlerts();
  assert.deepEqual(requested, [['bovinos', true]]);
  assert.equal(results[0].species, 'bovinos');
});

test('alert filters combine search, segment, level and inclusive date bounds', () => {
  const dated = { text: 'Diagnóstico de prenhez', species: 'bovinos', type: 'warning', due_date: '2026-10-31' };
  const alerts = [dated, { ...dated, species: 'suinos' }, { ...dated, due_date: undefined }];
  const filters = { search: 'PRENHEZ', segment: 'bovinos', level: 'warning', start: '2026-10-31', end: '2026-10-31' };
  assert.equal(presentation.filterAlerts(alerts, filters).length, 1);
  assert.equal(presentation.filterAlerts(alerts, { ...filters, end: '2026-10-30' }).length, 0);
  assert.equal(presentation.filterAlerts(alerts, { ...filters, level: 'danger' }).length, 0);
  assert.equal(presentation.filterAlerts(alerts, { ...filters, start: '', end: '' }).length, 2);
});
