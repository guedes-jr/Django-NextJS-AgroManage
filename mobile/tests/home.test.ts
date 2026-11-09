import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canOpenModule, canLoadFinancialHome, modulePaths } from '../src/features/home/contracts';
import { homeMessages } from '../src/features/home/messages';
import type { User } from '../src/features/auth/contracts';
const access: User['access'] = { role:'operator', can_manage_users:false, can_view_financial:false, can_operate_crops:false, livestock_species:['bovinos'], read_only:false };
test('mobile navigation preserves species, financial and feeder restrictions', () => {
  assert.equal(canOpenModule(access,'beef'),true);
  assert.equal(canOpenModule(access,'dairy'),true);
  for (const key of ['swine','crops','inventory','finance','structure'] as const) assert.equal(canOpenModule(access,key),false);
  assert.equal(canLoadFinancialHome({...access, can_view_financial:true}),false);
  assert.equal(canLoadFinancialHome({...access, role:'manager',can_view_financial:true}),true);
  for (const key of Object.keys(modulePaths) as (keyof typeof modulePaths)[]) {
    assert.equal(canOpenModule({...access,role:'feeder'},key),['feeding','profile','notifications','support'].includes(key));
  }
  assert.equal(canOpenModule({...access,role:'feeder',livestock_species:[]},'feeding'),false);
});
test('all home languages have complete catalogs and canonical cattle routes', () => {
  for (const catalog of Object.values(homeMessages)) assert.deepEqual(Object.keys(catalog).sort(),Object.keys(homeMessages['pt-BR']).sort());
  assert.equal(modulePaths.beef,'/home/seguimento/gado-de-corte');
  assert.equal(modulePaths.dairy,'/home/seguimento/pecuaria-leiteira');
});

test('shared navigation keeps native routes distinct from unavailable web modules',async()=>{
  const {nativeDestination,moduleKeys}=await import('../src/features/workspace/navigation');
  assert.deepEqual(nativeDestination('agenda'),{pathname:'/agenda'});
  assert.deepEqual(nativeDestination('agenda',true),{pathname:'/agenda/task-form'});
  for(const production of ['beef','dairy'] as const){
    assert.deepEqual(nativeDestination(production),{pathname:'/cattle/[production]',params:{production}});
    assert.deepEqual(nativeDestination(production,true),{pathname:'/cattle/[production]/form',params:{production,mode:'create'}});
  }
  assert.deepEqual(nativeDestination('clinic'),{pathname:'/clinic'});assert.deepEqual(nativeDestination('clinic',true),{pathname:'/clinic/form'});
  assert.deepEqual(nativeDestination('notifications'),{pathname:'/notifications'});assert.equal(nativeDestination('notifications',true),null);
  assert.deepEqual(nativeDestination('feeding'),{pathname:'/feeding'});assert.deepEqual(nativeDestination('feeding',true),{pathname:'/feeding'});
  assert.deepEqual(nativeDestination('profile'),{pathname:'/profile'});
  assert.equal(nativeDestination('profile',true),null);assert.deepEqual(nativeDestination('inventory'),{pathname:'/inventory'});assert.deepEqual(nativeDestination('inventory',true),{pathname:'/inventory/form',params:{kind:'items'}});
  for(const key of moduleKeys.filter(key=>!['agenda','beef','dairy','profile','inventory','feeding','notifications','clinic'].includes(key)))assert.equal(nativeDestination(key),null);
});
