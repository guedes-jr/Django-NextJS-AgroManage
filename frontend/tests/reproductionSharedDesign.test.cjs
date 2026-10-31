const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const state = [];
  let cursor = 0;
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/components', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, console,
    require(name) {
      if (name === 'react') return {
        useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
        useMemo: callback => callback(), useCallback: callback => callback, useEffect() {}, useRef: initial => ({ current: initial }),
      };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' };
      if (name === 'next/image') return { default: 'image' };
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  return { render(name, props) { cursor = 0; return exports[name](props); } };
}
function all(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => all(child, predicate))];
}

test('shared phase cards keep the same design and compact navigation for cattle and swine', () => {
  const app = load('reproducao/ReproducaoLayout.tsx');
  let selected;
  const props = { phases: [{ id: 'heifers', label: 'Novilhas', icon: 'cow', count: 3 }, { id: 'dry', label: 'Vacas secas', icon: 'milk-off', count: 1 }], onSelect: value => { selected = value; } };
  let tree = app.render('ReproducaoPhaseCards', props);
  const cards = all(tree, n => n.props?.className === 'repro-phase-card');
  assert.equal(cards.length, 2);
  cards[1].props.onClick(); assert.equal(selected, 'dry');
  all(tree, n => n.props?.['aria-label'] === 'Lista compacta')[0].props.onClick();
  tree = app.render('ReproducaoPhaseCards', props);
  assert.equal(all(tree, n => n.props?.className === 'repro-phase-grid is-compact').length, 1);
  const tabs = app.render('ReproducaoPhaseTabs', { ...props, selected: 'heifers' });
  assert.equal(all(tabs, n => n.props?.className === 'repro-phase-tab is-active').length, 1);
});

test('server pagination retains the shared table design and does not slice a server page twice', () => {
  const app = load('ui/DataTable.tsx');
  let next, size;
  const tree = app.render('DataTable', { columns: [{ key: 'identifier', label: 'Brinco' }], rows: Array.from({ length: 10 }, (_, i) => ({ id: i+91, identifier: `V-${i+91}` })),
    pagination: { page: 9, pageSize: 10, total: 105, onPageChange: value => { next = value; }, onPageSizeChange: value => { size = value; } } });
  assert.equal(all(tree, n => n.type === 'td').length, 10);
  all(tree, n => n.props?.title === 'Próxima página')[0].props.onClick(); assert.equal(next, 10);
  all(tree, n => n.type === 'select')[0].props.onChange({ target: { value: '20' } }); assert.equal(size, 20);
});

test('existing client pagination and conditional row actions are preserved', () => {
  const app = load('ui/DataTable.tsx');
  const props = { columns: [{ key: 'identifier', label: 'Brinco' }], rows: Array.from({ length: 20 }, (_, i) => ({ id: i+1, identifier: `V-${i+1}`, lactating: i === 0 })), actions: [{ label: 'Secar', onClick() {}, shouldShow: row => row.lactating }] };
  let tree = app.render('DataTable', props);
  assert.equal(all(tree, n => n.props?.title === 'Secar').length, 1);
  all(tree, n => n.props?.title === 'Próxima página')[0].props.onClick();
  tree = app.render('DataTable', props);
  assert.equal(all(tree, n => n.props?.title === 'Secar').length, 0);
  assert.ok(all(tree, n => n.type === 'td').some(n => n.props.children === 'V-11'));
});


test('cattle reproduction forms reuse the swine modal while preserving dates and save commands', async () => {
  const app = load('cattle/CattleReproductionForm.tsx');
  let received, saved = 0;
  const spec = { title: 'Cobertura / IA', initial: { mating_date: '2026-10-31' }, fields: [{ name: 'mating_date', label: 'Data', type: 'date', max: '2026-10-31', required: true }], save: async values => { received = values; } };
  const modal = app.render('CattleReproductionForm', { spec, onClose() {}, onSaved() { saved++; } });
  assert.equal(modal.type, 'ReproducaoModal');
  assert.equal(modal.props.fields[0].max, '2026-10-31');
  assert.equal(modal.props.fields[0].initialValue, '2026-10-31');
  const values = { mating_date: '2026-10-31' };
  await modal.props.onConfirm(values);
  assert.equal(received, values);
  assert.equal(saved, 1);
});


test('complete animal registration keeps sections and uses reproduction modal presentation', () => {
  const app = load('cattle/CattleReproductionForm.tsx');
  const spec = { title: 'Cadastrar vaca', sections: [{ id: 'animal', title: 'Dados do animal' }], fields: [{ name: 'identifier', section: 'animal', label: 'Brinco', required: true }], save: async () => {} };
  const form = app.render('CattleReproductionForm', { spec, onClose() {}, onSaved() {} });
  assert.equal(form.type, 'CattleForm');
  assert.equal(form.props.reproduction, true);
  assert.equal(form.props.spec, spec);
});

test('every cattle phase shares list and details actions even for read-only users', () => {
  const app = load('cattle/CattleReproduction.tsx');
  let opened;
  for (const selected of ['heifers', 'cows', 'pregnant', 'lactating', 'dry']) {
    const animal = { id: selected, reproductive_status: 'vazia' };
    const tree = app.render('CattleReproduction', { selected, counts: {}, animals: [animal], canWrite: false, onHistory: value => { opened = value; } });
    const table = all(tree, node => node.type === 'ReproducaoTabContent')[0];
    assert.ok(table);
    assert.equal(table.props.actions.length, 1);
    table.props.actions[0].onClick({ animal });
    assert.equal(opened, animal);
  }
});
