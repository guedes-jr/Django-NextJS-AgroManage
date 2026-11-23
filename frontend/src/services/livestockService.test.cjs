const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

test("semen collection components are loaded from the Doses / Semen category", async () => {
  const source = ts.transpileModule(fs.readFileSync(`${__dirname}/livestockService.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  const items = [{ id: "1", nome: "Diluente", unidade_medida: "ml" }];
  const signal = new AbortController().signal;
  const api = {
    get: async (url, options) => {
      assert.equal(url, "/inventory/items/all_items/");
      assert.deepEqual({ ...options.params }, { categoria: "semen" });
      assert.equal(options.signal, signal);
      return { data: items };
    },
  };
  vm.runInNewContext(source, { exports, require: () => ({ default: api }) });
  assert.equal(await exports.listSemenComponentStock(signal), items);
});
