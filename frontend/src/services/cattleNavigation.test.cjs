const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const navigation = {};
const load = (file, exports, require = () => ({})) => vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/${file}`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require, URLSearchParams });
load('cattleNavigation.ts', navigation);
const legacy = '/home/seguimento/bovinos';
const pages = ['cadastro', 'lotes', 'reproducao', 'sanidade', 'racao', 'racao/tratos', 'racao/producao', 'racao/gerenciar-formulas', 'pastos', 'pastos/ocupacoes', 'manejos', 'operacoes', 'pesagens', 'vendas', 'relatorios'];
for (const segment of ['beef', 'dairy']) {
  const root = `/home/seguimento/${segment === 'dairy' ? 'pecuaria-leiteira' : 'gado-de-corte'}`;
  test(`${segment}: canonical pages have routes and return to their own home`, () => {
    assert.equal(navigation.cattleHome(segment), root);
    assert.equal(navigation.cattleParent(root), null);
    for (const page of pages) {
      assert.equal(navigation.cattleParent(`${root}/${page}`, new URLSearchParams({ production: segment === 'beef' ? 'dairy' : 'beef' })).href, root);
      assert.ok(fs.existsSync(`${__dirname}/../app${root}/${page}/page.tsx`));
      assert.equal(navigation.cattleHref(`${legacy}/${page}?production=${segment}&farm=abc&tab=costs#results`, segment), `${root}/${page}?farm=abc&tab=costs#results`);
    }
  });
  test(`${segment}: old entry URLs and nested aliases leave the bovinos tree`, () => {
    assert.equal(navigation.cattleHref(`${legacy}?farm=abc&production=${segment}`, segment), `${root}?farm=abc`);
    assert.equal(navigation.cattleProduction(root), segment);
    assert.ok(navigation.isCattlePath(root));
  });
}
test('milk and old dairy aliases resolve to the dairy segment and retain filters', () => {
  const root = navigation.cattleHome('dairy');
  assert.equal(navigation.cattleHref(`${legacy}/pecuaria-leiteira/animais?group=young-females&farm=x`, 'beef'), `${root}/cadastro?group=young-females&farm=x`);
  assert.equal(navigation.cattleHref(`${legacy}/leite`, 'beef'), `${root}/leite`);
  assert.equal(navigation.cattleProduction(`${legacy}/operacoes`, new URLSearchParams('tab=milk-trends')), 'dairy');
  assert.ok(fs.existsSync(`${__dirname}/../app${root}/leite/page.tsx`));
});
test('unrelated URLs and internal species identity are preserved', () => {
  assert.equal(navigation.cattleHref('/home/estoque/resumo?x=1', 'dairy'), '/home/estoque/resumo?x=1');
  assert.equal(navigation.cattleAccessPath('/home/seguimento/suinos/vendas'), '/home/seguimento/suinos/vendas');
  assert.equal(navigation.cattleAccessPath('/home/seguimento/pecuaria-leiteira/vendas'), `${legacy}/vendas`);
  assert.equal(navigation.isCattlePath('/home/seguimento/gado-de-corte-extra'), false);
});
const accessExports = {};
load('organizationAccess.ts', accessExports, name => name === './cattleNavigation' ? navigation : {});
const access = role => ({ role, can_manage_users: false, can_operate_crops: false, livestock_species: ['bovinos'], read_only: false });
test('operators retain bovine scope and cannot gain access to finance, crops or swine', () => {
  const operator = access('operator');
  for (const production of ['beef', 'dairy']) {
    const root = navigation.cattleHome(production);
    assert.equal(accessExports.canAccessOrganizationPath(operator, `${root}/cadastro`), true);
    assert.equal(accessExports.canAccessOrganizationPath(operator, `${root}/vendas`), false);
    assert.equal(accessExports.canAccessOrganizationPath({ ...operator, livestock_species: ['suinos'] }, root), false);
  }
  for (const path of ['/home/financeiro', '/home/plantacoes', '/home/seguimento/suinos']) assert.equal(accessExports.canAccessOrganizationPath(operator, path), false);
});
test('feeder scope stays restricted to daily feeding in either segment and legacy bookmarks', () => {
  const feeder = access('feeder');
  for (const root of [legacy, navigation.cattleHome('beef'), navigation.cattleHome('dairy')]) {
    assert.equal(accessExports.canAccessOrganizationPath(feeder, `${root}/racao/tratos`), true);
    for (const suffix of ['', '/cadastro', '/racao', '/racao/producao', '/relatorios']) assert.equal(accessExports.canAccessOrganizationPath(feeder, root + suffix), false);
    assert.equal(accessExports.canAccessOrganizationPath({ ...feeder, livestock_species: [] }, `${root}/racao/tratos`), false);
  }
});

test('former rebanho prefix preserves scopes, filters and both stages of legacy cattle URLs', () => {
  for (const production of ['beef', 'dairy']) {
    const root = navigation.cattleHome(production);
    const former = root.replace('/home/seguimento/', '/home/rebanho/');
    assert.equal(navigation.cattleHref(`${former}/manejos?launch=medication&farm=x`, production), `${root}/manejos?launch=medication&farm=x`);
    assert.equal(navigation.cattleProduction(former), production);
    for (const role of ['operator', 'feeder']) {
      for (const suffix of ['', '/cadastro', '/vendas', '/racao/tratos']) {
        assert.equal(accessExports.canAccessOrganizationPath(access(role), former + suffix), accessExports.canAccessOrganizationPath(access(role), root + suffix));
      }
    }
  }
  assert.equal(navigation.cattleHref('/home/rebanho/bovinos/pecuaria-leiteira/animais?group=young-females', 'beef'), '/home/seguimento/pecuaria-leiteira/cadastro?group=young-females');
  assert.equal(navigation.canonicalSegmentPath('/home/rebanhos/suinos'), '/home/rebanhos/suinos');
  const swine = { ...access('operator'), livestock_species: ['suinos'] };
  assert.equal(accessExports.canAccessOrganizationPath(swine, '/home/seguimento/suinos/reproducao'), true);
  assert.equal(accessExports.canAccessOrganizationPath(swine, '/home/seguimento/suinos/vendas'), false);
  assert.equal(accessExports.canAccessOrganizationPath(swine, '/home/seguimento/pecuaria-leiteira'), false);
});
test('global redirect is permanent and API/media proxies keep their own prefixes', async () => {
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../../next.config.js`, 'utf8'), { module: mod, process: { env: {} }, console: { log() {} } });
  const [redirect] = await mod.exports.redirects();
  assert.equal(redirect.source, '/home/rebanho/:path*');
  assert.equal(redirect.destination, '/home/seguimento/:path*');
  assert.equal(redirect.permanent, true);
  const rewrites = await mod.exports.rewrites();
  assert.equal(rewrites[0].source, '/api/v1/:path*');
  assert.equal(rewrites[0].destination, 'http://127.0.0.1:8000/api/v1/:path*/');
  assert.equal(rewrites[1].source, '/media/:path*');
});
