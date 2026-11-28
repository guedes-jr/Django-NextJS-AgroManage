import assert from 'node:assert/strict';
import {test} from 'node:test';
import {userSchema,type User} from '../src/features/auth/contracts';
import {canManageMembers,draftFromMember,emptyMemberDraft,memberPayload,memberSchema,validateMemberDraft,withRole} from '../src/features/team/contracts';
import {teamMessages} from '../src/features/team/messages';

const make=(access:Partial<User['access']>={}):User=>userSchema.parse({id:'6a4b3d2c-1e0f-4a9b-8c7d-6e5f4a3b2c1d',full_name:'Admin',email:'a@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,
 access:{role:'admin',can_manage_users:true,can_view_financial:true,can_operate_crops:true,livestock_species:null,read_only:false,...access}});

test('only the organization admin manages members',()=>{
 assert.equal(canManageMembers(make()),true);
 assert.equal(canManageMembers(make({role:'manager',can_manage_users:false})),false);
 assert.equal(canManageMembers({...make(),force_password_change:true}),false);
});

test('role change keeps segments only between scoped roles; the vet area is part of the vet role',()=>{
 const operator={...emptyMemberDraft,role:'operator' as const,segments:['gado-de-corte','area-veterinario'],operator_read_only:true};
 assert.deepEqual(withRole(operator,'manager'),{...operator,role:'manager',segments:[],operator_read_only:false});
 assert.deepEqual(withRole(operator,'veterinarian').segments,['gado-de-corte']);
 const member=memberSchema.parse({id:'6a4b3d2c-1e0f-4a9b-8c7d-6e5f4a3b2c1e',email:'v@example.com',full_name:'Vet',role:'veterinarian',segments:['area-veterinario','suinocultura'],is_active:true});
 assert.deepEqual(draftFromMember(member).segments,['suinocultura']);
});

test('validation and payload follow the API contract',()=>{
 const draft={...emptyMemberDraft,full_name:' Ana ',email:'ana@example.com',password:'12345678',password_confirm:'12345678',segments:['plantacoes']};
 assert.deepEqual(validateMemberDraft(draft,true),{});
 assert.equal(validateMemberDraft({...draft,password_confirm:'x'},true).password_confirm,'passwordMismatch');
 assert.equal(validateMemberDraft({...draft,phone_is_whatsapp:true},false).phone,'phone');
 const created=memberPayload(draft,{creating:true,roleLocked:false});
 assert.equal(created.full_name,'Ana');assert.deepEqual((created as {segments:string[]}).segments,['plantacoes']);assert.equal((created as {email:string}).email,'ana@example.com');
 const locked=memberPayload({...draft,role:'manager'},{creating:false,roleLocked:true});
 assert.equal('role' in locked,false);assert.equal('segments' in locked,false);assert.equal('password' in locked,false);
});

test('member texts exist in the four languages',()=>{
 for(const copy of Object.values(teamMessages))for(const key of ['newMember','segments','readOnlyLabel','deactivate','confirmDeactivate','errMismatch'] as const)assert.ok(copy[key]?.trim(),key);
});

test('one mobile contact can handle WhatsApp and Telegram but a second cannot claim either channel', () => {
 const phone={name:'Trabalho',kind:'phone' as const,value:'81999990000',is_whatsapp:true,is_telegram:true,notifications:['whatsapp','telegram'] as ('whatsapp'|'telegram')[]};
 const draft={...emptyMemberDraft,full_name:'Membro',contacts:[phone]};
 assert.deepEqual(memberPayload(draft,{creating:false,roleLocked:false}).contacts,[phone]);
 assert.deepEqual(validateMemberDraft(draft,false),{});
 assert.equal(validateMemberDraft({...draft,contacts:[phone,{...phone,value:'81999991111'}]},false).contacts,'contacts');
});
