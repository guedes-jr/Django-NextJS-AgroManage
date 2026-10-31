const {test} = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const datesExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/agendaDates.ts`,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {exports:datesExports});
const pdfExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/organizationAgendaPdf.ts`,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {exports:pdfExports,require:(name)=>name === "./agendaDates" ? datesExports : require(name)});
const options = {start:'2026-10-26',end:'2026-11-01',farmLabel:'Fazenda teste',activityLabel:'Todas as atividades',includeRecorded:false};
const events = Array.from({length:75},(_,i)=>({id:String(i),date:'2026-10-27',title:`EVENTO_${String(i).padStart(3,'0')} nome extenso para verificar quebra de linhas e continuidade nas paginas`,domain:'livestock',species:'bovinos',farm_name:'Fazenda teste',status:'planned',estimated:false}));
for (const view of ['list','calendar','month']) {
  test(`${view}: exports every event over multiple pages with correct orientation`,()=>{
    const doc = pdfExports.buildAgendaPdf(events,{...options,view});
    assert.ok(doc.getNumberOfPages()>1);
    const pdf = doc.output();
    for(let i=0;i<75;i++) assert.ok(pdf.includes(`EVENTO_${String(i).padStart(3,'0')}`));
    assert.equal(doc.internal.pageSize.getWidth()>doc.internal.pageSize.getHeight(),view!=='list');
    if(process.env.AGENDA_PDF_QA) fs.writeFileSync(`/tmp/agenda-${view}-qa.pdf`,Buffer.from(doc.output('arraybuffer')));
  });
  test(`${view}: empty agenda remains exportable`,()=>{
    assert.equal(pdfExports.buildAgendaPdf([],{...options,view}).getNumberOfPages(),1);
  });
}
test('export follows all result pages using the selected filters',async()=>{
  const exportsObject = {};
  const calls=[];
  const apiClient={get:async(url,{params})=>{calls.push(params);return {data:{results:[{id:String(params.page)}],next:params.page<3?'next':null}};}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/organizationAgendaService.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject,require:()=>({apiClient})});
  const rows=await exportsObject.allAgendaEvents({start:options.start,end:options.end,domain:'crops',farm:'farm-1',include_recorded:true});
  assert.equal(rows.length,3);
  assert.equal(calls.length,3);
  for(const params of calls) {assert.equal(params.domain,'crops');assert.equal(params.farm,'farm-1');assert.equal(params.include_recorded,true);assert.equal(params.page_size,100);}
});

test('monthly ranges handle leap years, year changes and calendar padding',()=>{
  assert.equal(datesExports.agendaRange('2024-02-17','month').end,'2024-02-29');
  assert.equal(datesExports.moveAgendaPeriod('2026-12-31','month',1),'2027-01-01');
  assert.equal(datesExports.agendaRange('2026-11-01','week').start,'2026-10-26');
  const range=datesExports.agendaRange('2026-10-31','month');
  const cells=datesExports.agendaDays(datesExports.agendaMonday(range.start),datesExports.addAgendaDays(datesExports.agendaMonday(range.end),6));
  assert.equal(cells.length,35);
  assert.equal(cells[0],'2026-09-28');
  assert.equal(cells[34],'2026-11-01');
});

test('monthly overview keeps six weeks on one page and marks holidays outside activity results',()=>{
  const sample=Array.from({length:8},(_,i)=>({id:`visual-${i}`,date:`2026-03-${String(i*3+1).padStart(2,'0')}`,title:['Visita técnica','Vacinação do lote A','Colheita do milho','Reunião da equipe'][i%4],domain:['tasks','livestock','crops','tasks'][i%4],species:'',farm_name:'Fazenda Horizonte',kind:'task',status:'planned',estimated:false}));
  const doc=pdfExports.buildAgendaPdf(sample,{...options,start:'2026-03-01',end:'2026-03-31',view:'month',today:'2026-03-10',holidays:[{date:'2026-03-19',name:'Feriado municipal'}]});
  assert.equal(doc.getNumberOfPages(),1);
  assert.ok(doc.output().includes('Feriado municipal'));
  for(const event of sample) assert.ok(doc.output().includes(event.title));
  if(process.env.AGENDA_PDF_QA)fs.writeFileSync('/tmp/agenda-month-visual-qa.pdf',Buffer.from(doc.output('arraybuffer')));
});
