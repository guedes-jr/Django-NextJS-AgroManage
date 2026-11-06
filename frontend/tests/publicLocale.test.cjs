const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const workspace = require('./helpers/locale.cjs');
function load(file, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, Date, Intl, ...globals, require: name => imports[name] || (name === 'react/jsx-runtime'
    ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    : new Proxy({}, { get: (_, key) => key })) });
  return exports;
}
const publicLocale = load('lib/publicMessages.ts', { './localeMessages': workspace });
const { publicMessages, translatePublicMessage, resolvePublicLanguage } = publicLocale;
function languageImports(language) {
  return { '@/lib/publicLocaleServer': { getPublicTranslator: async () => ({ language, t: (key, values) => translatePublicMessage(language, key, values) }) } };
}
function all(node, match) {
  if (!node || typeof node !== 'object') return [];
  return [...(match(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => all(child, match))];
}

test('public catalogs are complete and preserve interpolation parameters in every language', () => {
  const keys = Object.keys(publicMessages['pt-BR']).sort();
  const placeholders = text => [...text.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort();
  for (const [language, catalog] of Object.entries(publicMessages)) {
    assert.deepEqual(Object.keys(catalog).sort(), keys, language);
    for (const key of keys) {
      assert.ok(catalog[key].trim(), `${language}: ${key}`);
      assert.deepEqual(placeholders(catalog[key]), placeholders(publicMessages['pt-BR'][key]), `${language}: ${key}`);
    }
  }
});

test('browser language negotiation supports regional tags, priorities and unsupported languages', () => {
  for (const [header, expected] of [
    ['en-US,en;q=0.9,pt-BR;q=0.8', 'en'], ['pt-PT,pt;q=0.9', 'pt-PT'],
    ['ES-ar', 'es'], ['fr,en;q=0.7,es;q=0.9', 'es'], ['es;q=0,en;q=0.5', 'en'],
    ['de,fr;q=0.8', 'pt-BR'], ['', 'pt-BR'], ['en;q=invalid,es;q=0.8', 'es'],
  ]) assert.equal(resolvePublicLanguage(header), expected, header);
});

test('public pages and metadata render in the negotiated language before hydration', async () => {
  for (const language of Object.keys(publicMessages)) {
    const page = load('app/(marketing)/contato/page.tsx', languageImports(language));
    const rendered = await page.default();
    assert.equal(rendered.props.title, publicMessages[language]['public.letSGetToKnowYourOperation']);
    assert.equal((await page.generateMetadata()).title, publicMessages[language]['public.contactAndDemoFazendaMais']);
    if (language === 'en') assert.equal(rendered.props.title, "Let's get to know your operation");
  }
});

test('translated resource links keep the same anchors in all languages', async () => {
  for (const language of Object.keys(publicMessages)) {
    const page = load('app/(marketing)/recursos/page.tsx', languageImports(language));
    const rendered = await page.default();
    const links = all(rendered, node => node.type === 'a').map(node => node.props.href);
    assert.deepEqual(links, ['#plantações', '#rebanhos', '#estoque', '#financeiro', '#clínica veterinária', '#relatorios']);
  }
});

test('public guides keep their slugs and localize both content and metadata', async () => {
  const page = load('app/(marketing)/conteudos/[slug]/page.tsx', languageImports('en'));
  assert.deepEqual(Array.from(page.generateStaticParams(), item => item.slug), ['organizar-custos-rurais', 'controle-de-estoque-na-fazenda', 'indicadores-de-gestao-rural']);
  const props = { params: Promise.resolve({ slug: 'organizar-custos-rurais' }) };
  assert.equal((await page.default(props)).props.title, 'How to organize farm costs');
  assert.equal((await page.generateMetadata(props)).title, 'How to organize farm costs | Fazenda Mais');
});

test('built-in plan copy is localized while custom copy remains intact', () => {
  const { localizePlanText } = load('components/marketing/PlanBuilder.tsx');
  const t = (key, values) => translatePublicMessage('en', key, values);
  assert.equal(localizePlanText('1 a 10 matrizes', t), '1 to 10 breeding females');
  assert.equal(localizePlanText('Nome personalizado do cliente', t), 'Nome personalizado do cliente');
});

test('shared controls use organization language first and keep platform default unchanged', () => {
  const org = { language: 'es', t: key => workspace.translateMessage('es', key) };
  const pub = { language: 'en', t: key => translatePublicMessage('en', key) };
  for (const [organization, publicContext, expected] of [[org, pub, 'es'], [null, pub, 'en'], [null, null, 'pt-BR']]) {
    const { useInterfaceLocale } = load('lib/interfaceLocale.ts', {
      './locale': { useOptionalOrganizationLocale: () => organization },
      './publicLocale': { useOptionalPublicLocale: () => publicContext }, './localeMessages': workspace,
    });
    assert.equal(useInterfaceLocale().language, expected);
  }
});

test('registration WhatsApp controls render in public context without an organization provider', () => {
  const { default: WhatsAppContactOptions } = load('components/auth/WhatsAppContactOptions.tsx', {
    react: { useId: () => 'contact' },
    '@/lib/interfaceLocale': { useInterfaceLocale: () => ({ language: 'en', t: key => translatePublicMessage('en', key) }) },
  });
  let next;
  const tree = WhatsAppContactOptions({ value: { phone_is_whatsapp: false, receive_system_alerts: false }, onChange: value => { next = value; } });
  assert.equal(all(tree, node => node.type === 'legend')[0].props.children, workspace.messages.en['whatsapp.title']);
  const checkbox = all(tree, node => node.props?.id === 'contact-contact')[0];
  checkbox.props.onChange({ target: { checked: true } });
  assert.equal(next.phone_is_whatsapp, true);
  assert.equal(next.receive_system_alerts, false);
});


test('public language is ready for API requests before passive page effects run', () => {
  const effects = [], languages = [], document = { documentElement: {} };
  const { PublicLocaleProvider } = load('lib/publicLocale.tsx', {
    './publicMessages': publicLocale,
    '@/services/api': { setApiLanguage: language => languages.push(language) },
    react: { createContext: () => ({ Provider: 'provider' }), useState: initial => [initial, () => {}],
      useEffect() {}, useLayoutEffect: effect => effects.push(effect), useMemo: callback => callback() },
  }, { document });
  const tree = PublicLocaleProvider({ initialLanguage: 'es', children: 'page' });
  assert.equal(tree.props.value.language, 'es');
  effects.forEach(effect => effect());
  assert.deepEqual(languages, ['es']);
  assert.equal(document.documentElement.lang, 'es');
});

test('support labels translate without changing the codes sent to the API', () => {
  const { getTicketLabels } = load('services/ticketPresentation.ts');
  for (const language of ['pt-BR', 'en', 'es', 'pt-PT']) {
    const labels = getTicketLabels(key => workspace.translateMessage(language, key));
    assert.deepEqual(Object.keys(labels.ticketStatuses), ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']);
    assert.deepEqual(Object.keys(labels.ticketCategories), ['access', 'billing', 'technical', 'question', 'other']);
    if (language === 'en') assert.equal(labels.ticketStatuses.waiting_customer, 'Waiting for customer');
  }
});
