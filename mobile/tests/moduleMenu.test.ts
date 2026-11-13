import assert from 'node:assert/strict';
import {test} from 'node:test';
import {moduleGroups,moduleMenuMessages,visibleModuleGroups} from '../src/features/workspace/moduleMenuData';
import {moduleKeys,nativeDestination} from '../src/features/workspace/navigation';
import {canOpenModule} from '../src/features/home/contracts';
const keys=(query:string,allowed=moduleKeys)=>visibleModuleGroups(allowed,'pt-BR',query).flatMap(group=>group.keys);
test('module groups cover each existing destination once without changing native/web support',()=>{
 const all=moduleGroups.flatMap(group=>[...group.keys]);assert.equal(new Set(all).size,all.length);assert.deepEqual([...all].sort(),[...moduleKeys].sort());
 assert.ok(nativeDestination('dairy'));assert.equal(nativeDestination('finance'),null);
});
test('search matches accents descriptions and groups without surfacing unauthorized modules',()=>{
 assert.ok(keys('pecuaria').includes('dairy'));assert.ok(keys('vacinacoes').includes('clinic'));assert.deepEqual(keys('gestao',['inventory','dairy']),['inventory']);assert.deepEqual(keys('receitas',['agenda','dairy']),[]);assert.deepEqual(keys('not-a-module'),[]);
 const access={role:'operator' as const,can_manage_users:false,can_view_financial:false,can_operate_crops:false,livestock_species:['bovinos'],read_only:false};const allowed=moduleKeys.filter(key=>canOpenModule(access,key));
 assert.equal(keys('',allowed).includes('finance'),false);assert.equal(keys('configuracoes',allowed).includes('settings'),false);assert.deepEqual(keys('receitas',allowed),[]);
});
test('all menu translations include every group and module description',()=>{
 for(const value of Object.values(moduleMenuMessages)){assert.deepEqual(Object.keys(value.groups).sort(),moduleGroups.map(group=>group.id).sort());assert.deepEqual(Object.keys(value.descriptions).sort(),[...moduleKeys].sort());assert.equal(Object.values(value.descriptions).every(text=>!!text.trim()),true);}
});
