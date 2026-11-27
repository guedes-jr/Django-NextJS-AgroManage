import assert from 'node:assert/strict';
import {test} from 'node:test';
import {canManagePlatform,platformUserDraft,platformUserPayload,platformUserSchema,platformOrganizationSchema,platformDashboardSchema} from '../src/features/platform/contracts';
import {platformMessages} from '../src/features/platform/messages';

const staff=(role:string)=>({id:'s',email:'s@example.com',full_name:'S',role,role_display:'',mfa_required:false});

test('only owner and administrator change customer data in the app',()=>{
 assert.equal(canManagePlatform(staff('platform_owner')),true);
 assert.equal(canManagePlatform(staff('platform_admin')),true);
 for(const role of ['platform_support','platform_auditor','platform_developer'])assert.equal(canManagePlatform(staff(role)),false,role);
});

test('user payload keeps segments only for scoped roles and omits a locked role',()=>{
 const user=platformUserSchema.parse({id:'6a4b3d2c-1e0f-4a9b-8c7d-6e5f4a3b2c1d',email:'Vet@Example.com',full_name:'Vet',role:'veterinarian',is_active:true,segments:['area-veterinario','suinocultura'],contracted_segments:['suinocultura','area-veterinario']});
 const draft=platformUserDraft(user);
 assert.deepEqual(draft.segments,['suinocultura']);
 assert.deepEqual(platformUserPayload(draft,{roleLocked:false}),{full_name:'Vet',email:'vet@example.com',phone:'',role:'veterinarian',segments:['suinocultura'],operator_read_only:false});
 const manager=platformUserPayload({...draft,role:'manager',segments:[]},{roleLocked:true});
 assert.equal('role' in manager,false);assert.equal('segments' in manager,false);
});

test('API payloads parse with optional blocks missing',()=>{
 assert.equal(platformOrganizationSchema.parse({id:'o',name:'Org',status:'suspended'}).users_count,0);
 const dashboard=platformDashboardSchema.parse({organizations:{total:3},users:{total:5},finance:{mrr:'10.5'}});
 assert.equal(dashboard.finance.mrr,'10.5');assert.equal(dashboard.support,undefined);
});

test('backoffice texts exist in the four languages',()=>{
 for(const copy of Object.values(platformMessages))for(const key of ['title','organizations','users','suspend','resetPassword','confirmBlock','webHint'] as const)assert.ok(copy[key]?.trim(),key);
});
