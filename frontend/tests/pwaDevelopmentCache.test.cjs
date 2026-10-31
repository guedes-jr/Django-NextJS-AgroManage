const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function run(mode, controlled = false) {
  const calls = { registered: [], unregistered: [], deleted: [], reloads: 0 };
  const own = { active: { scriptURL: 'http://localhost:3000/sw.js' }, unregister: async () => { calls.unregistered.push('app'); return true; } };
  const other = { active: { scriptURL: 'http://localhost:3000/other/sw.js' }, unregister: async () => { calls.unregistered.push('other'); return true; } };
  let effect;
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/components/pwa/PWAInstallPrompt.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(compiled, {
    exports, URL, process: { env: { NODE_ENV: mode } },
    navigator: { userAgent: 'Chrome', serviceWorker: {
      controller: controlled ? own.active : null,
      getRegistrations: async () => controlled ? [own, other] : [],
      register: async url => { calls.registered.push(url); return { update: async () => {} }; },
      addEventListener() {}, removeEventListener() {},
    } },
    window: {
      location: { origin: 'http://localhost:3000', reload: () => { calls.reloads++; } },
      caches: { keys: async () => ['fazenda-mais-static-v4', 'another-app-cache'], delete: async key => { calls.deleted.push(key); return true; } },
      matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 1, cancelAnimationFrame() {},
      addEventListener() {}, removeEventListener() {},
    },
    require(name) {
      if (name === 'react') return { useEffect: callback => { effect = callback; }, useState: initial => [initial, () => {}] };
      return {};
    },
  });
  exports.PWAInstallPrompt();
  const cleanup = effect();
  await new Promise(resolve => setImmediate(resolve));
  cleanup?.();
  return calls;
}

test('development removes only the app worker/cache and reloads a controlled page', async () => {
  const calls = await run('development', true);
  assert.deepEqual(calls.registered, []);
  assert.deepEqual(calls.unregistered, ['app']);
  assert.deepEqual(calls.deleted, ['fazenda-mais-static-v4']);
  assert.equal(calls.reloads, 1);
});
test('development without an active worker does not loop on reload', async () => {
  const calls = await run('development');
  assert.equal(calls.reloads, 0);
  assert.deepEqual(calls.registered, []);
});
test('production retains PWA registration and does not clear its cache', async () => {
  const calls = await run('production');
  assert.deepEqual(calls.registered, ['/sw.js']);
  assert.deepEqual(calls.unregistered, []);
  assert.deepEqual(calls.deleted, []);
});
