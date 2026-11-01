const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ts=require('typescript');
function load(file,imports={}){
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Date,require:name=>imports[name]||(name==='react/jsx-runtime'?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:new Proxy({},{get:(_,key)=>key}))});
 return exports;
}
function all(node,match){if(!node||typeof node!=='object')return [];return [...(match(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(child=>all(child,match))];}
const {parseAnimalCSV}=load('services/cattleOperationsService.ts');
test('assisted import accepts BOM, quoted fields and decimal dot without inventing missing data',()=>{
 const rows=parseAnimalCSV('\uFEFFidentifier;name;initial_weight_kg;cattle_purpose\r\nV1;"Estrela; da Fazenda";450.25;dairy\r\nV2;"Nome ""especial""";;beef\r\n');
 assert.equal(rows.length,2);assert.equal(rows[0].name,'Estrela; da Fazenda');assert.equal(rows[0].initial_weight_kg,'450.25');assert.equal(rows[1].name,'Nome "especial"');assert.equal(rows[1].initial_weight_kg,undefined);
});
test('assisted import rejects malformed files and fields capable of creating unrelated effects',()=>{
 for(const csv of ['identifier;purchase_value\nV1;100','identifier;identifier\nV1;V2','identifier;name\nV1','identifier;name\nV1;"unfinished'])assert.throws(()=>parseAnimalCSV(csv));
 assert.throws(()=>parseAnimalCSV('identifier\n'+Array.from({length:501},(_,i)=>`V${i}`).join('\n')));
});
test('milk chart only plots recorded dates and provides accessible detailed values',()=>{
 const {MilkTrendChart}=load('components/cattle/CattleOperationsWorkspace.tsx',{'@/services/milkProductionService':{milkNumber:value=>String(value)}});
 const tree=MilkTrendChart({series:[{date:'2026-10-28',produced:'20'},{date:'2026-10-31',produced:'10'}]});
 assert.equal(all(tree,node=>node.type==='circle').length,2);
 assert.equal(all(tree,node=>node.type==='polyline')[0].props.points,'40,30 660,110');
 assert.equal(all(tree,node=>node.type==='svg')[0].props.role,'img');
 assert.equal(all(tree,node=>node.type==='title').length,2);
});
