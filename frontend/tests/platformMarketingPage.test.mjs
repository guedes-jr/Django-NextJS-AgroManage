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
  const refs = [];
  const listeners = new Map();
  let cursor = 0;
  let effectCursor = 0;
  let refCursor = 0;
  let pendingEffects = [];
  const api = {
    audiences: async () => [],
    campaigns: async () => ({ results: [], next: null }),
    options: async () => ({ plans: [], statuses: [], roles: [] }),
    queryOrganizations: async () => ({ count: 0, page: 1, has_next: false, results: [] }),
    saveCampaign: async data => ({ id: "draft-id", ...data, status: "draft", image_details: [], summary: { prepared: 0, skipped: 0, read: 0, deliveries: [] } }),
    preview: async () => ({ recipients: 1, organizations: 1, in_app: 1, whatsapp: 0, sample: [], token: "preview-token", blockers: [] }),
    ...overrides,
  };
  const source = fs.readFileSync(path.join(directory, "../src/app/platform/(panel)/marketing/page.tsx"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    window: {
      scrollTo() {},
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: name => listeners.delete(name),
    },
    require(name) {
      if (name === "react") return {
        useState(initial) {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
        },
        useRef: () => {
          const index = refCursor++;
          if (!refs[index]) refs[index] = { current: null };
          return refs[index];
        },
        useEffect: (effect, dependencies) => {
          const index = effectCursor++;
          const previous = effects[index];
          if (!previous || dependencies.some((value, dependency) => !Object.is(value, previous.dependencies[dependency]))) {
            pendingEffects.push(() => {
              previous?.cleanup?.();
              effects[index] = { dependencies, cleanup: effect() };
            });
          }
        },
      };
      if (name === "react/jsx-runtime") return loadModule(name);
      if (name.includes("platformMarketingService")) return { platformMarketingService: api };
      if (name.includes("memberService")) return { memberError: () => "Falha na operação." };
      return {};
    },
  });
  function render() {
    cursor = 0;
    effectCursor = 0;
    refCursor = 0;
    pendingEffects = [];
    const tree = exports.default();
    pendingEffects.forEach(effect => effect());
    return tree;
  }
  const tree = render();
  return { tree, render, listeners };
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

function writeMessage(page, value = "Mensagem de teste") {
  nodes(page.render()).find(node => node.type === "textarea").props.onChange({ target: { value } });
}

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
  assert.equal(saved.filters.search, undefined);
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
  const sections = nodes(tree).filter(node => node.type === "section" && "hidden" in node.props && node.props["aria-label"] !== "Campanhas e resultados");
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
  assert.equal(saved.name, "Público da comunicação");
  assert.deepEqual(nodes(tree).filter(node => node.type === "section" && "hidden" in node.props && node.props["aria-label"] !== "Campanhas e resultados").map(node => node.props.hidden), [true, true, false]);
});

test("continuing with an empty explicit selection explains the problem", async () => {
  let saves = 0;
  const page = mount({ saveAudience: async () => { saves++; } });
  await settle();
  writeMessage(page);
  button(page.render(), "Voltar às organizações").props.onClick();
  const choice = nodes(page.render()).find(node => node.type === "label" && textOf(node).startsWith("Somente as selecionadas"));
  nodes(choice).find(node => node.type === "input").props.onChange();
  button(page.render(), "Continuar para revisão").props.onClick();
  await settle();
  const tree = page.render();
  assert.equal(saves, 0);
  assert.deepEqual(nodes(tree).filter(node => node.type === "section" && "hidden" in node.props && node.props["aria-label"] !== "Campanhas e resultados").map(node => node.props.hidden), [true, false, true]);
  assert.match(textOf(nodes(tree).find(node => node.props?.role === "alert")), /Selecione ao menos uma organização/);
});

test("continuing updates a saved audience after its filters change", async () => {
  let saved;
  const page = mount({
    audiences: async () => [{ id: "existing", name: "Clientes", filters: { roles: ["admin"] } }],
    saveAudience: async (data, id) => { saved = { data, id }; return { id, ...data }; },
  });
  await settle();
  writeMessage(page);
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
  assert.deepEqual(nodes(page.render()).filter(node => node.type === "section" && "hidden" in node.props && node.props["aria-label"] !== "Campanhas e resultados").map(node => node.props.hidden), [true, true, false]);
});

test("a failed audience save keeps the organization step and displays an error", async () => {
  const page = mount({ saveAudience: async () => { throw new Error("Servidor indisponível"); } });
  await settle();
  writeMessage(page);
  button(page.render(), "Voltar às organizações").props.onClick();
  button(page.render(), "Continuar para revisão").props.onClick();
  await settle();
  const tree = page.render();
  assert.deepEqual(nodes(tree).filter(node => node.type === "section" && "hidden" in node.props && node.props["aria-label"] !== "Campanhas e resultados").map(node => node.props.hidden), [true, false, true]);
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

test("campaign home and creation are separate views", async () => {
  const page = mount();
  await settle();
  let tree = page.render();
  let home = nodes(tree).find(node => node.props?.["aria-label"] === "Campanhas e resultados");
  let wizard = nodes(tree).find(node => node.type === "div" && node.props.hidden === true);
  assert.equal(home.props.hidden, false);
  assert.ok(wizard);
  button(tree, "Nova comunicação").props.onClick();
  tree = page.render();
  home = nodes(tree).find(node => node.props?.["aria-label"] === "Campanhas e resultados");
  assert.equal(home.props.hidden, true);
  button(tree, "Voltar às campanhas").props.onClick();
  assert.equal(nodes(page.render()).find(node => node.props?.["aria-label"] === "Campanhas e resultados").props.hidden, false);
});

test("review prepares recipients automatically and confirmation publishes its token", async () => {
  const calls = [];
  const page = mount({
    saveAudience: async data => ({ id: "audience-id", ...data }),
    saveCampaign: async data => {
      calls.push(["save", data.audience]);
      return { id: "campaign-id", ...data, status: "draft", image_details: [], summary: { prepared: 0, skipped: 0, read: 0, deliveries: [] } };
    },
    preview: async id => {
      calls.push(["preview", id]);
      return { recipients: 1, organizations: 1, in_app: 1, whatsapp: 0, sample: [], token: "fresh-token", blockers: [] };
    },
    publish: async (id, token) => {
      calls.push(["publish", id, token]);
      return { id, title: "Novidades", body: "", status: "queued", image_details: [], recipient_count: 1, summary: { prepared: 0, skipped: 0, read: 0, deliveries: [] } };
    },
  });
  await settle();
  button(page.render(), "Nova comunicação").props.onClick();
  nodes(page.render()).find(node => node.type === "input" && node.props.maxLength === 200)
    .props.onChange({ target: { value: "Novidades" } });
  button(page.render(), "Continuar para organizações").props.onClick();
  button(page.render(), "Continuar para revisão").props.onClick();
  await settle();
  let tree = page.render();
  assert.deepEqual(calls, [["save", "audience-id"], ["preview", "campaign-id"]]);
  assert.equal(button(tree, "Confirmar envio").props.disabled, false);
  button(tree, "Confirmar envio").props.onClick();
  await settle();
  tree = page.render();
  assert.deepEqual(calls[2], ["publish", "campaign-id", "fresh-token"]);
  assert.equal(nodes(tree).find(node => node.props?.["aria-label"] === "Campanhas e resultados").props.hidden, false);
  assert.match(textOf(tree), /Campanha confirmada e adicionada à fila/);
});

test("review shows policy blockers and disables publication", async () => {
  const page = mount({
    saveAudience: async data => ({ id: "audience-id", ...data }),
    preview: async () => ({ recipients: 1, organizations: 1, in_app: 1, whatsapp: 0, sample: [], token: "token", blockers: ["Ative a categoria Propagandas em Notificações."] }),
  });
  await settle();
  button(page.render(), "Nova comunicação").props.onClick();
  writeMessage(page);
  button(page.render(), "Continuar para revisão").props.onClick();
  await settle();
  const tree = page.render();
  assert.match(textOf(tree), /Ative a categoria Propagandas/);
  assert.equal(button(tree, "Confirmar envio").props.disabled, true);
});

test("a publish failure keeps the draft and requires a fresh review before retrying", async () => {
  let previews = 0;
  let publishes = 0;
  const page = mount({
    saveAudience: async data => ({ id: "audience-id", ...data }),
    preview: async () => ({ recipients: 1, organizations: 1, in_app: 1, whatsapp: 0, sample: [], token: `token-${++previews}`, blockers: [] }),
    publish: async () => { publishes++; throw new Error("Prévia expirada"); },
  });
  await settle();
  button(page.render(), "Nova comunicação").props.onClick();
  nodes(page.render()).find(node => node.type === "textarea").props.onChange({ target: { value: "Mensagem preservada" } });
  button(page.render(), "Continuar para organizações").props.onClick();
  button(page.render(), "Continuar para revisão").props.onClick();
  await settle();
  button(page.render(), "Confirmar envio").props.onClick();
  await settle();
  let tree = page.render();
  assert.equal(publishes, 1);
  assert.ok(nodes(tree).some(node => node.props?.role === "alert"));
  assert.equal(button(tree, "Confirmar envio").props.disabled, true);
  assert.equal(nodes(tree).find(node => node.type === "textarea").props.value, "Mensagem preservada");
  button(tree, "Atualizar revisão").props.onClick();
  await settle();
  tree = page.render();
  assert.equal(previews, 2);
  assert.equal(button(tree, "Confirmar envio").props.disabled, false);
});

test("opening organizations automatically queries and step shortcuts validate content", async () => {
  let queries = 0;
  const page = mount({ queryOrganizations: async () => { queries++; return { count: 0, page: 1, has_next: false, results: [] }; } });
  await settle();
  button(page.render(), "Nova comunicação").props.onClick();
  button(page.render(), "3Revisão e envio").props.onClick();
  assert.match(textOf(page.render()), /Preencha ao menos um título/);
  assert.equal(queries, 0);
  writeMessage(page);
  button(page.render(), "2Organizações").props.onClick();
  await settle();
  assert.equal(queries, 1);
  assert.deepEqual(nodes(page.render()).filter(node => node.type === "section" && "hidden" in node.props && node.props["aria-label"] !== "Campanhas e resultados").map(node => node.props.hidden), [true, false, true]);
});

test("unsaved edits survive home navigation and require a decision before a new campaign", async () => {
  const page = mount();
  await settle();
  button(page.render(), "Nova comunicação").props.onClick();
  writeMessage(page, "Preservar esta mensagem");
  assert.equal(page.render().props.children[0].props.inert, false);
  assert.ok(page.listeners.has("beforeunload"));
  button(page.render(), "Voltar às campanhas").props.onClick();
  button(page.render(), "Nova comunicação").props.onClick();
  let tree = page.render();
  assert.ok(nodes(tree).some(node => node.props?.role === "dialog"));
  assert.equal(nodes(tree).find(node => node.type === "textarea").props.value, "Preservar esta mensagem");
  button(tree, "Continuar editando").props.onClick();
  tree = page.render();
  assert.ok(!nodes(tree).some(node => node.props?.role === "dialog"));
  assert.equal(nodes(tree).find(node => node.props?.["aria-label"] === "Campanhas e resultados").props.hidden, true);
  button(tree, "Voltar às campanhas").props.onClick();
  tree = page.render();
  button(tree, "Nova comunicação").props.onClick();
  button(page.render(), "Descartar alterações e continuar").props.onClick();
  tree = page.render();
  assert.equal(nodes(tree).find(node => node.type === "textarea").props.value, "");
  assert.ok(!page.listeners.has("beforeunload"));
});

test("save and exit works from the message step and clears the unsaved warning", async () => {
  let saved;
  const page = mount({
    saveAudience: async data => ({ id: "audience-id", ...data }),
    saveCampaign: async data => { saved = data; return { id: "draft", ...data, status: "draft", summary: { prepared: 0, skipped: 0, read: 0, deliveries: [] } }; },
  });
  await settle();
  button(page.render(), "Nova comunicação").props.onClick();
  writeMessage(page, "Salvar agora");
  button(page.render(), "Salvar e sair").props.onClick();
  await settle();
  const tree = page.render();
  assert.equal(saved.body, "Salvar agora");
  assert.equal(saved.audience, "audience-id");
  assert.equal(nodes(tree).find(node => node.props?.["aria-label"] === "Campanhas e resultados").props.hidden, false);
  assert.ok(!page.listeners.has("beforeunload"));
});

test("changing channels refreshes review automatically with the new channel", async () => {
  const channels = [];
  const page = mount({
    saveAudience: async data => ({ id: "audience-id", ...data }),
    saveCampaign: async data => {
      channels.push(data.send_whatsapp);
      return { id: "draft", ...data, status: "draft", summary: { prepared: 0, skipped: 0, read: 0, deliveries: [] } };
    },
  });
  await settle();
  button(page.render(), "Nova comunicação").props.onClick();
  writeMessage(page);
  button(page.render(), "3Revisão e envio").props.onClick();
  await settle();
  const label = nodes(page.render()).find(node => node.type === "label" && textOf(node) === "WhatsApp");
  nodes(label).find(node => node.type === "input").props.onChange({ target: { checked: true } });
  await settle();
  assert.deepEqual(channels, [false, true]);
  assert.equal(button(page.render(), "Confirmar envio").props.disabled, false);
});

function campaignRow(change = {}) {
  return { id: "existing-campaign", title: "Oferta", body: "Mensagem", audience: "saved-audience", images: [], image_details: [], link_url: "", link_label: "", send_in_app: true, send_whatsapp: false, status: "draft", recipient_count: 0, summary: { prepared: 0, skipped: 0, read: 0, deliveries: [] }, ...change };
}

test("resuming a draft retrieves its exact audience when it is outside the saved list", async () => {
  let requested;
  const page = mount({
    campaigns: async () => ({ results: [campaignRow()], next: null }),
    audience: async id => { requested = id; return { id, name: "Público original", filters: { roles: ["operator"], organizations: ["org-original"] } }; },
  });
  await settle();
  button(page.render(), "Gerenciar e enviar").props.onClick();
  await settle();
  const tree = page.render();
  assert.equal(requested, "saved-audience");
  assert.match(textOf(tree), /Público original/);
  assert.match(textOf(tree), /Somente as selecionadas \(1\)/);
});

test("campaign cancellation requires confirmation and updates the home without a reload", async () => {
  let cancellations = 0;
  let loads = 0;
  const page = mount({
    campaigns: async () => { loads++; return { results: [campaignRow()], next: null }; },
    cancel: async () => { cancellations++; return campaignRow({ status: "cancelled" }); },
  });
  await settle();
  button(page.render(), "Cancelar pendentes").props.onClick();
  assert.equal(cancellations, 0);
  button(page.render(), "Manter campanha").props.onClick();
  assert.equal(cancellations, 0);
  button(page.render(), "Cancelar pendentes").props.onClick();
  button(page.render(), "Confirmar cancelamento").props.onClick();
  await settle();
  const tree = page.render();
  assert.equal(cancellations, 1);
  assert.equal(loads, 1);
  assert.equal(button(tree, "Cancelar pendentes"), undefined);
});

test("campaign search and status filters are applied to server requests", async () => {
  const requests = [];
  const page = mount({ campaigns: async (...args) => { requests.push(args); return { results: [], next: null }; } });
  await settle();
  let tree = page.render();
  nodes(tree).find(node => node.type === "input" && node.props.type === "search")
    .props.onChange({ target: { value: "Oferta" } });
  tree = page.render();
  nodes(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  page.render();
  await settle();
  const label = nodes(page.render()).find(node => node.type === "label" && textOf(node).startsWith("SituaçãoTodas as situações"));
  nodes(label).find(node => node.type === "select").props.onChange({ target: { value: "draft" } });
  page.render();
  await settle();
  assert.deepEqual(requests.at(-1), [1, "Oferta", "draft"]);
});

test("new communications default to system delivery and include every recipient role", async () => {
  let audience;
  let campaign;
  const page = mount({
    saveAudience: async data => { audience = data; return { id: "audience", ...data }; },
    saveCampaign: async data => { campaign = data; return campaignRow({ ...data }); },
  });
  await settle();
  button(page.render(), "Nova comunicação").props.onClick();
  writeMessage(page, "Aviso de pagamento");
  button(page.render(), "3Revisão e envio").props.onClick();
  await settle();
  assert.equal(campaign.category, "system");
  assert.deepEqual(Array.from(audience.filters.roles), ["admin", "manager", "operator"]);
});

test("zero in-app recipients show counts and explain how users authorize marketing", async () => {
  const page = mount({
    saveAudience: async data => ({ id: "audience", ...data }),
    preview: async () => ({
      organizations: 1, recipients: 0, in_app: 0, whatsapp: 0, token: "token",
      blockers: ["Nenhum destinatário elegível."],
      sample: [{ id: "org", name: "Fazenda Teste", eligible_users: 0 }],
      eligibility: { total_users: 3, eligible_users: 0, inactive_users: 0, roles_excluded: 1, platform_staff_excluded: 0, notifications_disabled: 0, marketing_not_authorized: 2 },
    }),
  });
  await settle();
  button(page.render(), "Nova comunicação").props.onClick();
  writeMessage(page);
  const categoryLabel = nodes(page.render()).find(node => node.type === "label" && textOf(node).startsWith("Tipo de envio"));
  nodes(categoryLabel).find(node => node.type === "select").props.onChange({ target: { value: "marketing" } });
  button(page.render(), "3Revisão e envio").props.onClick();
  await settle();
  const tree = page.render();
  assert.match(textOf(tree), /Por que o total no sistema está zero/);
  assert.match(textOf(tree), /Sem autorização para propagandas2/);
  assert.match(textOf(tree), /Cargos fora da seleção1/);
  assert.match(textOf(tree), /Cada destinatário precisa ativar/);
  assert.equal(button(tree, "Confirmar envio").props.disabled, true);
  assert.ok(button(tree, "Revisar organizações e cargos"));
});

test("review converts an existing marketing draft without losing selected organizations or channels", async () => {
  const saved = [];
  const page = mount({
    campaigns: async () => ({ results: [campaignRow({ category: "marketing", send_whatsapp: true })], next: null }),
    audiences: async () => [{ id: "saved-audience", name: "Selecionadas", filters: { roles: ["admin"], organizations: ["org-1", "org-2"] } }],
    saveAudience: async (data, id) => { saved.push(data); return { id, ...data }; },
    saveCampaign: async data => campaignRow(data),
    preview: async () => ({ recipients: saved.at(-1).filters.roles.length, organizations: 2, in_app: 3, whatsapp: 1, token: "new-token", blockers: [], sample: [] }),
  });
  await settle();
  button(page.render(), "Gerenciar e enviar").props.onClick();
  await settle();
  button(page.render(), "3Revisão e envio").props.onClick();
  await settle();
  button(page.render(), "Usar como comunicado / cobrança (todos os cargos)").props.onClick();
  await settle();
  const tree = page.render();
  assert.deepEqual(Array.from(saved.at(-1).filters.roles), ["admin", "manager", "operator"]);
  assert.deepEqual(Array.from(saved.at(-1).filters.organizations), ["org-1", "org-2"]);
  assert.match(textOf(tree), /Tipo de envio: Comunicado \/ cobrança/);
  assert.equal(nodes(tree).find(node => node.type === "input" && node.props.checked && nodes(tree).some(label => label.type === "label" && textOf(label) === "WhatsApp" && nodes(label).includes(node))).props.checked, true);
  assert.equal(button(tree, "Confirmar envio").props.disabled, false);
  assert.equal(button(tree, "Usar como comunicado / cobrança (todos os cargos)"), undefined);
});
