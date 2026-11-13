const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(name) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/${name}.ts`, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, {exports, require: () => ({})});
  return exports;
}
const {dairyCommandRow, isDairyReceipt} = load('dairyWorksheetService');
const {dairyFeedQuantity} = load('dairyFeedingService');
test('group feeding counts both dates, preserves period totals and crosses months without local DST arithmetic', () => {
  assert.equal(dairyFeedQuantity({quantity_kg:'2.50',mode:'per_head_day'},4,'2026-10-31','2026-11-02'),30);
  assert.equal(dairyFeedQuantity({quantity_kg:'12.50',mode:'total'},4,'2026-10-31','2026-11-02'),12.5);
  assert.equal(dairyFeedQuantity({quantity_kg:'0.25',mode:'per_head_day'},3,'2026-11-12','2026-11-12'),0.75);
  assert.equal(dairyFeedQuantity({quantity_kg:'2',mode:'per_head_day'},4,'2026-11-13','2026-11-12'),0);
  assert.equal(dairyFeedQuantity({quantity_kg:'2',mode:'total'},4,'','2026-11-12'),0);
});
test('worksheet submissions contain only writable values and the version of the intended animal', () => {
  const row = {id:'cow',identifier:'001',farm:'farm',expected_version:'v1',morning:'12',afternoon:'8',evening:'0',discarded_liters:'0',discard_reason:'',notes:'',oxytocin_ml:'2',feeds:[{slot:'silage',item:'product',quantity_kg:'5',name:'Silagem',cost_total:'private'}]};
  const result = dairyCommandRow(row);
  assert.equal(result.animal,'cow');
  assert.equal(result.expected_version,'v1');
  assert.equal(result.remove,false);
  assert.equal(result.feeds[0].item,'product');
  assert.equal('farm' in result,false);
  assert.equal('name' in result.feeds[0],false);
  assert.equal('cost_total' in result.feeds[0],false);
});
test('a response cannot clear pending work belonging to a different farm, day, request or number of animals', () => {
  const command = {farm:'f',date:'2026-11-12',request_key:'key',rows:[{}]};
  const receipt = {saved:true,farm:'f',date:'2026-11-12',request_key:'key',animals:1,received_liters:'20.50'};
  assert.equal(isDairyReceipt(receipt,command),true);
  for (const change of [{farm:'other'},{date:'2026-11-11'},{request_key:'other'},{saved:false},{animals:0},{received_liters:'NaN'},{received_liters:'-1'}]) assert.equal(isDairyReceipt({...receipt,...change},command),false);
  assert.equal(isDairyReceipt(null,command),false);
});
