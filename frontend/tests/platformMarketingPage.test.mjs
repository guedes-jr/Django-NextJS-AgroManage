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
  if (!tree || typeof tree !== "object") return "";
  return [tree?.props?.children].flat(Infinity).map(textOf).join("");
}

function button(tree, label) {
  return nodes(tree).find(node => node.type === "button" && textOf(node) === label);
}

const settle = () => new Promise(resolve => setImmediate(resolve));

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
