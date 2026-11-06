const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { messages, translateMessage } = require('./helpers/locale.cjs');

function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, Date, Intl, require: name => imports[name] || (name === 'react/jsx-runtime'
    ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    : new Proxy({}, { get: (_, key) => key })) });
  return exports;
}
function all(node, match) {
  if (!node || typeof node !== 'object') return [];
  return [...(match(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => all(child, match))];
}

test('every organization language has the complete catalog and identical interpolation parameters', () => {
  const keys = Object.keys(messages['pt-BR']).sort();
  const placeholders = value => Array.from(value.matchAll(/\{([^}]+)\}/g), match => match[1]).sort();
  for (const [language, catalog] of Object.entries(messages)) {
    assert.deepEqual(Object.keys(catalog).sort(), keys, language);
    for (const key of keys) {
      assert.ok(catalog[key].trim(), `${language}: ${key}`);
      assert.deepEqual(placeholders(catalog[key]), placeholders(messages['pt-BR'][key]), `${language}: ${key}`);
    }
  }
});

test('interpolation keeps user content literal and replaces repeated placeholders', () => {
  const name = '<b>{count}</b> $&';
  assert.equal(translateMessage('en', 'workspace.removeTheHolidayName', { name }), `Remove the holiday ${name}?`);
  assert.equal(translateMessage('en', 'workspace.countEventsInThisPeriod', { count: 0 }), '0 events in this period');
});

test('milk formatting follows language and preserves the default and missing-value behavior', () => {
  const { milkNumber } = load('services/milkProductionService.ts');
  assert.equal(milkNumber(1234.5, 'en'), '1,234.50');
  assert.equal(milkNumber(1234.5, 'pt-BR'), '1.234,50');
  assert.equal(milkNumber(1234.5), '1.234,50');
  assert.equal(milkNumber(null, 'es'), '—');
});

test('milk form translates controls and accessible labels in all four languages', () => {
  for (const language of Object.keys(messages)) {
    const { ProductionForm } = load('components/cattle/MilkProduction.tsx', {
      '@/lib/locale': { useOrganizationLocale: () => ({ language, t: (key, values) => translateMessage(language, key, values) }) },
      '@/services/milkProductionService': load('services/milkProductionService.ts'),
    });
    const tree = ProductionForm({ values: { liters: '12', discarded_liters: '0', discard_reason: '', notes: '' },
      setValues() {}, disabled: false, onSave() {}, onNext() {}, saving: false });
    assert.equal(all(tree, n => n.props?.type === 'range')[0].props['aria-label'], messages[language]['workspace.adjustMilkVolume']);
    assert.ok(all(tree, n => n.type === 'button').some(n => [n.props.children].flat().includes(messages[language]['workspace.saveProduction'])));
  }
});

test('agenda PDF uses the requested language without changing event data', () => {
  for (const [language, expected] of [['en', 'Event'], ['es', 'Evento'], ['pt-PT', 'Evento'], ['pt-BR', 'Evento']]) {
    const text = [], tables = [];
    function Doc() {
      const doc = { internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } }, text: value => text.push(value),
        getTextWidth: value => value.length, splitTextToSize: value => [value], getNumberOfPages: () => 1 };
      return new Proxy(doc, { get: (target, property) => target[property] ?? (() => {}) });
    }
    const { buildAgendaPdf } = load('services/organizationAgendaPdf.ts', {
      '@/lib/localeMessages': { translateMessage },
      jspdf: { jsPDF: Doc }, 'jspdf-autotable': { default: (_, options) => tables.push(options) },
      './agendaDates': load('services/agendaDates.ts'),
    });
    const event = { id: 'one', date: '2026-11-05', title: 'Nome da fazenda preservado', farm_name: 'Fazenda São João',
      domain: 'tasks', species: '', status: 'done', estimated: false };
    buildAgendaPdf([event], { language, start: event.date, end: event.date, view: 'list', farmLabel: 'Fazenda São João',
      activityLabel: 'Test', includeRecorded: true, today: event.date });
    assert.equal(tables[0].head[0][1], expected);
    assert.equal(tables[0].body[0][1], event.title);
    assert.equal(tables[0].body[0][3], event.farm_name);
    assert.ok(text.includes(messages[language]['workspace.countEventsInThisPeriod'].replace('{count}', '1')));
  }
});

test('organization pages wait for their language and ignore an outdated refresh after a save', async () => {
  const state = [], effectState = [], pendingEffects = [];
  const windowEvents = new Map(), documentEvents = new Map(), requests = [], patches = [], requestLanguages = [];
  let cursor = 0;
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return state[index] ?? (state[index] = { current: initial }); },
    useMemo(callback) { cursor++; return callback(); }, useCallback(callback) { cursor++; return callback; },
    useEffect(callback, dependencies) {
      const index = cursor++, previous = effectState[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) pendingEffects.push(() => {
        previous?.cleanup?.(); effectState[index] = { dependencies, cleanup: callback() };
      });
    },
  };
  const exports = {};
  const document = { visibilityState: 'visible', documentElement: {}, addEventListener: (name, fn) => documentEvents.set(name, fn), removeEventListener: name => documentEvents.delete(name) };
  const window = { addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener: name => windowEvents.delete(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/locale.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, document, window, AbortController, require: name => ({
    react, './localeMessages': { translateMessage },
    '@/services/api': { default: { get: () => new Promise(resolve => requests.push(resolve)), patch: () => new Promise(resolve => patches.push(resolve)) }, setApiLanguage: value => requestLanguages.push(value) },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  })[name] });
  function render() { cursor = 0; const tree = exports.OrganizationLocaleProvider({ children: 'tenant pages' }); while (pendingEffects.length) pendingEffects.shift()(); return tree; }
  const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
  assert.equal(render().props.role, 'status');
  requests.shift()({ data: { language: 'en' } }); await tick();
  let tree = render();
  assert.equal(tree.type, 'provider'); assert.equal(tree.props.value.language, 'en');
  assert.equal(document.documentElement.lang, 'en'); assert.equal(requestLanguages.at(-1), 'en');
  windowEvents.get('focus')();
  const update = tree.props.value.updateLanguage('es');
  patches.shift()({ data: { language: 'es' } }); await update;
  requests.shift()({ data: { language: 'pt-BR' } }); await tick();
  tree = render();
  assert.equal(tree.props.value.language, 'es'); assert.equal(requestLanguages.at(-1), 'es');
  for (const effect of effectState) effect?.cleanup?.();
  assert.equal(windowEvents.size, 0); assert.equal(documentEvents.size, 0);
});

test('service fallbacks follow the interface language while preserving server details', () => {
  const { cattleError } = load('services/cattleService.ts', { '@/lib/localeMessages': { translateMessage } });
  const { financeError } = load('services/financeService.ts', {
    '@/lib/localeMessages': { translateMessage }, axios: { isAxiosError: error => !!error?.isAxiosError },
  });
  assert.equal(cattleError({}, 'en'), 'Could not complete the operation. Try again.');
  assert.equal(financeError({}, 'es'), 'No se pudo completar la operación.');
  const serverError = { isAxiosError: true, response: { data: { detail: 'Detalhe específico: Fazenda São João' } } };
  assert.equal(cattleError(serverError, 'en'), serverError.response.data.detail);
  assert.equal(financeError(serverError, 'es'), serverError.response.data.detail);
});
