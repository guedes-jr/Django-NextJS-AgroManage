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

function loadComponent(filename, dependencies) {
  const state = [], refs = [];
  let cursor = 0, refCursor = 0;
  const source = fs.readFileSync(path.join(directory, "../src/components/notifications", filename), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, console,
    require(name) {
      if (name === "react") return {
        createContext: () => ({ Provider: "provider" }),
        useState(initial) {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
        },
        useRef(initial) {
          const index = refCursor++;
          if (!refs[index]) refs[index] = { current: initial };
          return refs[index];
        },
        useCallback: callback => callback,
        useMemo: callback => callback(),
        useEffect() {},
      };
      if (name === "react/jsx-runtime") return loadModule(name);
      if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, property) => String(property) }) };
      return dependencies[name] || {};
    },
  });
  return () => { cursor = 0; refCursor = 0; return (exports.default || exports.NotificationProvider)({ children: null }); };
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}

test("an unread delivered campaign is visible on screen and requires explicit acknowledgement", async () => {
  const acknowledged = [];
  const current = { id: "campaign-alert", category: "system", title: "Aviso de pagamento", promotion: { body: "Pagamento pendente", images: [] }, is_read: false };
  const render = loadComponent("CampaignAlertBanner.tsx", {
    "./NotificationProvider": { useNotificationContext: () => ({ notifications: [current], markAsRead: async id => acknowledged.push(id) }) },
  });
  const tree = render();
  assert.equal(tree.type, "dialog");
  assert.equal(tree.props["aria-label"], "Comunicados pendentes");
  assert.equal(acknowledged.length, 0);
  const action = nodes(tree).find(node => node.type === "button");
  action.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(acknowledged, ["campaign-alert"]);
});

test("the modal displays large images separately from the padded message content", () => {
  const render = loadComponent("CampaignAlertBanner.tsx", {
    "next/image": { default: "image" },
    "./NotificationProvider": { useNotificationContext: () => ({
      notifications: [{ id: "photo", title: "Comunicado", promotion: {
        body: "Mensagem", images: [{ id: "image-1", image: "/media/announcement.png" }],
      } }],
    }) },
  });
  const tree = render();
  const image = nodes(tree).find(node => node.type === "image");
  assert.equal(image.props.src, "/media/announcement.png");
  assert.equal(image.props.width, 1600);
  assert.equal(image.props.className, "image");
  assert.equal(image.props.alt, "Comunicado");
});

test("view later closes the modal without marking any notification as read", () => {
  let acknowledgements = 0;
  const render = loadComponent("CampaignAlertBanner.tsx", {
    "./NotificationProvider": { useNotificationContext: () => ({
      notifications: [{ id: "later", promotion: { body: "Aviso", images: [] } }],
      markAsRead: async () => { acknowledgements++; },
    }) },
  });
  const action = nodes(render()).find(node => node.type === "button" && node.props.children === "Ver depois");
  action.props.onClick();
  assert.equal(render(), null);
  assert.equal(acknowledgements, 0);
});

test("failed acknowledgement keeps the modal visible and displays a retry message", async () => {
  const render = loadComponent("CampaignAlertBanner.tsx", {
    "./NotificationProvider": { useNotificationContext: () => ({
      notifications: [{ id: "failed", promotion: { body: "Aviso", images: [] } }],
      markAsRead: async () => { throw new Error("Failure"); },
    }) },
  });
  nodes(render()).find(node => node.type === "button").props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  const tree = render();
  assert.equal(tree.type, "dialog");
  assert.ok(nodes(tree).some(node => node.props?.role === "alert"));
});

test("read, archived and ordinary notifications do not appear as campaign banners", () => {
  const render = loadComponent("CampaignAlertBanner.tsx", {
    "./NotificationProvider": { useNotificationContext: () => ({
      notifications: [{ promotion: {}, is_read: true }, { promotion: {}, is_archived: true }, { title: "Ordinary" }],
    }) },
  });
  assert.equal(render(), null);
});

test("a changed unread count refreshes notification content instead of only the badge", async () => {
  let count = 0, lists = 0;
  const notifications = [{ id: "new-alert", promotion: { body: "Novo comunicado" } }];
  const render = loadComponent("NotificationProvider.tsx", {
    "@/services/notificationService": { default: {
      getAll: async () => { lists++; return count ? notifications : []; },
      getUnreadCount: async () => ({ unread_count: count }),
    } },
  });
  await render().props.value.fetchNotifications();
  assert.equal(lists, 2);
  await render().props.value.fetchUnreadCount();
  assert.equal(lists, 2);
  count = 1;
  await render().props.value.fetchUnreadCount();
  assert.equal(lists, 4);
  assert.equal(render().props.value.notifications[0].id, "new-alert");
});
