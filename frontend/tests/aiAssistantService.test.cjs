const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function loadService(client) {
  const source = fs.readFileSync(path.join(__dirname, "../src/services/aiAssistantService.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: name => name === "axios" ? { isAxiosError: error => !!error?.isAxiosError } : { default: client },
  });
  return exports;
}

test("a real question uses the conversation endpoint and allows provider response time", async () => {
  const calls = [];
  const answer = { message: { content: "Resposta real" }, quota: { remaining: 4 } };
  const { aiAssistantService } = loadService({ post: async (...args) => { calls.push(args); return { data: answer }; } });
  assert.equal(await aiAssistantService.ask("conversation-id", "Como avaliar o lote?"), answer);
  assert.equal(calls[0][0], "/ai/conversations/conversation-id/ask/");
  assert.equal(calls[0][1].question, "Como avaliar o lote?");
  assert.equal(calls[0][2].timeout, 120000);
});

test("provider failures propagate without generating a demonstration answer", async () => {
  const failure = { isAxiosError: true, response: { data: { detail: "Provedor indisponível" } } };
  const { aiAssistantService, aiAssistantError } = loadService({ post: async () => { throw failure; } });
  await assert.rejects(aiAssistantService.ask("id", "Pergunta"), error => error === failure);
  assert.equal(aiAssistantError(failure), "Provedor indisponível");
  assert.match(aiAssistantError({ isAxiosError: true, code: "ECONNABORTED" }), /histórico/);
});

test("closed conversations stay out of the selectable history", async () => {
  const active = { id: "active", is_active: true };
  const { aiAssistantService } = loadService({ get: async () => ({ data: { results: [active, { id: "closed", is_active: false }] } }) });
  const history = await aiAssistantService.conversations();
  assert.equal(history.length, 1);
  assert.equal(history[0], active);
});
