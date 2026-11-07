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
