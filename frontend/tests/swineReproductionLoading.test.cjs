const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness(failures = new Set()) {
  const state = [], refs = [], calls = {};
  let cursor = 0, refCursor = 0, effects = [];
  const routes = { getReproductionDashboard: 'dashboard', getMarras: 'marras', getMatrizes: 'matrizes', getGestacoes: 'gestacao', getMaternidades: 'maternidade', getCreches: 'creche', getCrescimentos: 'crescimento', getEngordas: 'engorda' };
  const service = new Proxy({}, { get(_, key) {
    if (key === 'getReproducers') return async () => [];
    return async () => {
      const phase = routes[key];
      if (phase) calls[phase] = (calls[phase] || 0) + 1;
      if (failures.has(phase)) throw new Error('API unavailable');
      return { kpis: { marras: 3 }, rows: [], alerts: [], aiSuggestions: [] };
    };
  }});
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
    },
    useRef(initial) { const i = refCursor++; if (!(i in refs)) refs[i] = { current: initial }; return refs[i]; },
    useEffect(callback) { effects.push(callback); },
    useCallback: callback => callback, useMemo: callback => callback(), Suspense: 'suspense',
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/app/home/rebanho/suinos/reproducao/page.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled + '\nexports.TestContent = ReproducaoPageContent;', {
    exports, console, URLSearchParams, setInterval: () => 1, clearInterval: () => {},
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' };
      if (name === 'next/navigation') return { useSearchParams: () => new URLSearchParams('tab=dashboard'), usePathname: () => '/home/rebanho/suinos/reproducao', useRouter: () => ({ replace() {}, push() {} }) };
      if (name === '@/services/livestockService') return service;
      if (name === '@/components/reproducao/ReproducaoDashboard') return { ReproducaoDashboard: 'repro-dashboard' };
      if (name === '@/components/ui/Toast') return { useToast: () => ({ showToast() {} }) };
      return {};
    },
  });
  function render() { cursor = 0; refCursor = 0; effects = []; return exports.TestContent(); }
  return { calls, render, mount() {
    render(); const setup = effects.slice();
    const cleanups = setup.map(effect => effect());
    cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup(); });
    setup.forEach(effect => effect());
  }};
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; }
  return null;
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('StrictMode setup-cleanup-setup finishes loading and retains dashboard data', async () => {
  const app = harness(); app.mount(); await settle();
  const dashboard = find(app.render(), node => node.type === 'repro-dashboard');
  assert.equal(dashboard.props.initialLoading, false);
  assert.equal(dashboard.props.tabLoading.dashboard, false);
  assert.equal(dashboard.props.config.kpis[0].value, 3);
  assert.equal(app.calls.dashboard, 1);
});

test('a failed phase ends loading, preserves other data and can be retried', async () => {
  const failures = new Set(['marras']);
  const app = harness(failures); app.mount(); await settle();
  let tree = app.render();
  assert.equal(find(tree, node => node.type === 'repro-dashboard').props.initialLoading, false);
  assert.equal(find(tree, node => node.type === 'repro-dashboard').props.config.kpis[0].value, 3);
  assert.ok(find(tree, node => node.props?.role === 'alert'));
  failures.clear();
  find(tree, node => node.type === 'button').props.onClick(); await settle();
  tree = app.render();
  assert.equal(find(tree, node => node.type === 'repro-dashboard').props.initialLoading, false);
  assert.equal(find(tree, node => node.props?.role === 'alert'), null);
  assert.equal(app.calls.marras, 2);
  assert.equal(app.calls.dashboard, 1);
});
