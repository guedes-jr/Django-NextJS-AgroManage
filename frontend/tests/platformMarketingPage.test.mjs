import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const loadModule = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));

function mount(overrides = {}) {
  const state = [];
  const effects = [];
  let cursor = 0;
  let mounted = false;
  const api = {
    audiences: async () => [],
    campaigns: async () => ({ results: [], next: null }),
    options: async () => ({ plans: [], statuses: [], roles: [] }),
    ...overrides,
  };
  const source = fs.readFileSync(path.join(directory, "../src/app/platform/(panel)/marketing/page.tsx"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    window: { scrollTo() {} },
    require(name) {
      if (name === "react") return {
        useState(initial) {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
        },
        useRef: () => ({ current: null }),
        useEffect: effect => { if (!mounted) effects.push(effect); },
      };
      if (name === "react/jsx-runtime") return loadModule(name);
      if (name.includes("platformMarketingService")) return { platformMarketingService: api };
      if (name.includes("memberService")) return { memberError: () => "Falha na operação." };
      return {};
    },
  });
  function render() {
    cursor = 0;
    const tree = exports.default();
    mounted = true;
    return tree;
  }
  const tree = render();
  effects.forEach(effect => effect());
  return { tree, render };
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  const children = [tree.props?.children].flat(Infinity);
  return [tree, ...children.flatMap(nodes)];
}

function textOf(tree) {
  if (typeof tree === "string") return tree;
  if (typeof tree === "number") return String(tree);
  if (!tree || typeof tree !== "object") return "";
  return [tree?.props?.children].flat(Infinity).map(textOf).join("");
}

function button(tree, label) {
  return nodes(tree).find(node => node.type === "button" && textOf(node) === label);
}

const settle = () => new Promise(resolve => setImmediate(resolve));

for (const field of ["title", "body", "link_url", "images"]) {
  test(`a campaign can continue with only ${field}`, async () => {
    const page = mount({ upload: async () => ({ id: "image-id", image: "/photo.png" }) });
    await settle();
    let tree = page.render();
    if (field === "images") {
      nodes(tree).find(node => node.type === "input" && node.props.type === "file")
        .props.onChange({ target: { files: [{ size: 100 }], value: "photo.png" } });
      await settle();
    } else {
      const input = nodes(tree).find(node => field === "body" ? node.type === "textarea"
        : node.type === "input" && (field === "title" ? node.props.maxLength === 200 : node.props.type === "url"));
      input.props.onChange({ target: { value: field === "link_url" ? "https://example.com" : "Novidade" } });
    }
    tree = page.render();
    assert.equal(button(tree, "Continuar para organizações").props.disabled, false);
  });
}

test("organization filters can be queried without a saved audience or name", async () => {
  let queries = 0;
  const page = mount({
    queryOrganizations: async filters => {
      queries++;
      assert.equal(filters.search, "Fazenda");
      return { count: 1, results: [{ id: "org-id", name: "Fazenda" }] };
    },
  });
  await settle();
  let tree = page.render();
  const searchLabel = nodes(tree).find(node => node.type === "label" && textOf(node).startsWith("Nome da organização contém"));
  nodes(searchLabel).find(node => node.type === "input").props.onChange({ target: { value: "Fazenda" } });
  tree = page.render();
  const query = button(tree, "Consultar organizações");
  assert.ok(!query.props.disabled);
  query.props.onClick();
  await settle();
  assert.equal(queries, 1);
  assert.match(textOf(page.render()), /1 organizações encontradas/);
});

test("table selections persist across pages and determine the saved audience", async () => {
  let saved;
  const page = mount({
    queryOrganizations: async (_filters, requestedPage) => ({
      count: 2, page: requestedPage, has_next: requestedPage === 1,
      results: [{ id: `org-${requestedPage}`, name: `Fazenda ${requestedPage}`, document: "123", plan: "Pro", status: "Ativa", city: "Recife", state: "PE" }],
    }),
    saveAudience: async data => { saved = data; return { id: "audience", ...data }; },
  });
  await settle();
  button(page.render(), "Consultar organizações").props.onClick();
  await settle();
  let tree = page.render();
  assert.ok(nodes(tree).some(node => node.type === "table" && textOf(node).includes("Cidade / UF")));
  nodes(tree).find(node => node.props?.["aria-label"] === "Selecionar Fazenda 1")
    .props.onChange({ target: { checked: true } });
  button(page.render(), "Próxima página").props.onClick();
  await settle();
  tree = page.render();
  nodes(tree).find(node => node.props?.["aria-label"] === "Selecionar organizações desta página")
    .props.onChange({ target: { checked: true } });
  button(page.render(), "Página anterior").props.onClick();
  await settle();
  tree = page.render();
  assert.equal(nodes(tree).find(node => node.props?.["aria-label"] === "Selecionar Fazenda 1").props.checked, true);
  nodes(tree).find(node => node.type === "input" && node.props.maxLength === 150)
    .props.onChange({ target: { value: "Selecionadas" } });
  button(page.render(), "Salvar público").props.onClick();
  await settle();
  assert.deepEqual(Array.from(saved.filters.organizations), ["org-1", "org-2"]);
  tree = page.render();
  nodes(tree).find(node => node.props?.["aria-label"] === "Selecionar organizações desta página")
    .props.onChange({ target: { checked: false } });
  button(page.render(), "Próxima página").props.onClick();
  await settle();
  nodes(page.render()).find(node => node.props?.["aria-label"] === "Selecionar organizações desta página")
    .props.onChange({ target: { checked: false } });
  assert.equal(button(page.render(), "Salvar público").props.disabled, true);
});

test("message comes first and survives navigation between steps", async () => {
  const page = mount();
  await settle();
  let tree = page.render();
  assert.equal(button(tree, "Continuar para organizações").props.disabled, true);
  const title = nodes(tree).find(node => node.type === "input" && node.props.maxLength === 200);
  const body = nodes(tree).find(node => node.type === "textarea");
  title.props.onChange({ target: { value: "Novidades" } });
  body.props.onChange({ target: { value: "Mensagem da campanha" } });
  tree = page.render();
  assert.equal(button(tree, "Continuar para organizações").props.disabled, false);
  button(tree, "Continuar para organizações").props.onClick();
  tree = page.render();
  const sections = nodes(tree).filter(node => node.type === "section" && "hidden" in node.props);
  assert.deepEqual(sections.map(node => node.props.hidden), [true, false, true]);
  button(tree, "Voltar à mensagem").props.onClick();
  tree = page.render();
  assert.equal(nodes(tree).find(node => node.type === "textarea").props.value, "Mensagem da campanha");
});

test("saving an audience succeeds without preview or list reload", async () => {
  let lists = 0;
  let previews = 0;
  const page = mount({
    audiences: async () => { lists++; return []; },
    audiencePreview: async () => { previews++; throw new Error("timeout"); },
    saveAudience: async data => ({ id: "audience-id", ...data }),
  });
  await settle();
  let tree = page.render();
  nodes(tree).find(node => node.type === "input" && node.props.maxLength === 150)
    .props.onChange({ target: { value: "Clientes" } });
  tree = page.render();
  button(tree, "Salvar público").props.onClick();
  await settle();
  tree = page.render();
  assert.equal(lists, 1);
  assert.equal(previews, 0);
  assert.equal(button(tree, "Continuar para revisão").props.disabled, false);
  assert.match(textOf(tree), /Público salvo/);
});

test("continuing saves an unnamed audience and opens review with the current selection", async () => {
  let saved;
  const page = mount({
    queryOrganizations: async () => ({ count: 1, page: 1, has_next: false, results: [{ id: "org-1", name: "Fazenda" }] }),
    saveAudience: async data => { saved = data; return { id: "audience-id", ...data }; },
  });
  await settle();
  let tree = page.render();
  nodes(tree).find(node => node.type === "textarea").props.onChange({ target: { value: "Novidades" } });
  button(page.render(), "Continuar para organizações").props.onClick();
  button(page.render(), "Consultar organizações").props.onClick();
  await settle();
  nodes(page.render()).find(node => node.props?.["aria-label"] === "Selecionar Fazenda")
    .props.onChange({ target: { checked: true } });
  tree = page.render();
  assert.equal(button(tree, "Continuar para revisão").props.disabled, false);
  button(tree, "Continuar para revisão").props.onClick();
  await settle();
  tree = page.render();
  assert.deepEqual(Array.from(saved.filters.organizations), ["org-1"]);
  assert.equal(saved.name, "Público da propaganda");
  assert.deepEqual(nodes(tree).filter(node => node.type === "section" && "hidden" in node.props).map(node => node.props.hidden), [true, true, false]);
});

test("continuing with an empty explicit selection explains the problem", async () => {
  let saves = 0;
  const page = mount({ saveAudience: async () => { saves++; } });
  await settle();
  button(page.render(), "Voltar às organizações").props.onClick();
  const choice = nodes(page.render()).find(node => node.type === "label" && textOf(node).startsWith("Somente as selecionadas"));
  nodes(choice).find(node => node.type === "input").props.onChange();
  button(page.render(), "Continuar para revisão").props.onClick();
  await settle();
  const tree = page.render();
  assert.equal(saves, 0);
  assert.deepEqual(nodes(tree).filter(node => node.type === "section" && "hidden" in node.props).map(node => node.props.hidden), [true, false, true]);
  assert.match(textOf(nodes(tree).find(node => node.props?.role === "alert")), /Selecione ao menos uma organização/);
});

test("continuing updates a saved audience after its filters change", async () => {
  let saved;
  const page = mount({
    audiences: async () => [{ id: "existing", name: "Clientes", filters: { roles: ["admin"] } }],
    saveAudience: async (data, id) => { saved = { data, id }; return { id, ...data }; },
  });
  await settle();
  button(page.render(), "Voltar às organizações").props.onClick();
  let tree = page.render();
  nodes(tree).find(node => node.type === "select" && node.props.value === "")
    .props.onChange({ target: { value: "existing" } });
  tree = page.render();
  const label = nodes(tree).find(node => node.type === "label" && textOf(node).startsWith("Nome da organização contém"));
  nodes(label).find(node => node.type === "input").props.onChange({ target: { value: "Fazenda" } });
  button(page.render(), "Continuar para revisão").props.onClick();
  await settle();
  assert.equal(saved.id, "existing");
  assert.equal(saved.data.filters.search, "Fazenda");
  assert.deepEqual(nodes(page.render()).filter(node => node.type === "section" && "hidden" in node.props).map(node => node.props.hidden), [true, true, false]);
});

test("a failed audience save keeps the organization step and displays an error", async () => {
  const page = mount({ saveAudience: async () => { throw new Error("Servidor indisponível"); } });
  await settle();
  button(page.render(), "Voltar às organizações").props.onClick();
  button(page.render(), "Continuar para revisão").props.onClick();
  await settle();
  const tree = page.render();
  assert.deepEqual(nodes(tree).filter(node => node.type === "section" && "hidden" in node.props).map(node => node.props.hidden), [true, false, true]);
  assert.ok(nodes(tree).some(node => node.props?.role === "alert"));
});

test("a failed campaign listing preserves loaded audiences and the editor", async () => {
  const page = mount({
    audiences: async () => [{ id: "saved", name: "Público salvo", filters: { roles: ["admin"] } }],
    campaigns: async () => { throw new Error("timeout"); },
  });
  await settle();
  const tree = page.render();
  assert.ok(nodes(tree).some(node => node.type === "option" && node.props.value === "saved"));
  assert.ok(nodes(tree).some(node => node.type === "textarea"));
  assert.match(textOf(tree), /Não foi possível carregar todos os dados/);
});
