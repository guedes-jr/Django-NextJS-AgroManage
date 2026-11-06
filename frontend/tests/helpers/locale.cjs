const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../src/lib/localeMessages.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: exportsObject });
module.exports = {
  ...exportsObject,
  useOrganizationLocale: () => ({ language: 'pt-BR', t: (key, values) => exportsObject.translateMessage('pt-BR', key, values) }),
};
