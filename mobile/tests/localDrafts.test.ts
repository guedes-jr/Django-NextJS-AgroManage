import assert from 'node:assert/strict';
import {test} from 'node:test';
import {z} from 'zod';
import {DRAFT_RETENTION_MS,MAX_DRAFTS_PER_SCOPE,MAX_DRAFT_BYTES,draftDaysLeft,draftExpiringSoon,draftId,draftScope,draftsToPurge,isDraftExpired,readDraft,serializeDraft,textDraft,type DraftRecord} from '../src/features/drafts/contracts';
import {createMemoryDraftStore} from '../src/features/drafts/store';
import {draftMessages} from '../src/features/drafts/messages';

const user='5f8d0d55-2b7c-4c39-9a52-0d1d9f3f6a10',org='7c9e6679-7425-40de-944b-e07fc1f90ae7';
const record=(over:Partial<DraftRecord>={}):DraftRecord=>({id:'a',scope:'s',feature:'support-ticket',context:'new',formVersion:1,state:'draft',title:'T',route:{pathname:'/support/new',params:{},farm:null},payload:'{}',createdAt:0,updatedAt:0,...over});

test('drafts are isolated per environment, user and organization', () => {
 const a=draftScope('fazendamais.session.0068',user,org);
 assert.notEqual(a,draftScope('fazendamais.session.0068',user,'other-org'));
 assert.notEqual(a,draftScope('fazendamais.session.0069',user,org));
 assert.notEqual(a,draftScope('fazendamais.session.0068','other-user',org));
 assert.equal(draftId(a,'cattle-animal','beef:farm-1'),draftId(a,'cattle-animal','beef:farm-1'));
 assert.notEqual(draftId(a,'cattle-animal','beef:farm-1'),draftId(a,'cattle-animal','dairy:farm-1'));
 assert.doesNotMatch(draftId(a,'support-ticket','x|y/../z'),/\.\.\/|\/z/);
});

test('payload is read only for the same form version and shape', () => {
 const schema=textDraft({subject:z.string(),creation_key:z.uuid()});
 const ok=readDraft(record({payload:JSON.stringify({subject:'Oi',creation_key:org})}),schema);
 assert.deepEqual(ok,{ok:true,value:{subject:'Oi',creation_key:org}});
 assert.deepEqual(readDraft(record({formVersion:0,payload:'{}'}),schema),{ok:false,reason:'version'});
 assert.deepEqual(readDraft(record({payload:'{not json'}),schema),{ok:false,reason:'invalid'});
 assert.deepEqual(readDraft(record({payload:JSON.stringify({subject:'Oi',creation_key:org,token:'x'})}),schema),{ok:false,reason:'invalid'});
});

test('oversized content is not kept', () => {
 assert.equal(serializeDraft({body:'x'.repeat(MAX_DRAFT_BYTES)}),null);
 assert.equal(serializeDraft({body:'ok'}),'{"body":"ok"}');
});

test('retention: expiry, warning window and limit per scope', () => {
 const now=DRAFT_RETENTION_MS*2;
 assert.equal(isDraftExpired({updatedAt:now-DRAFT_RETENTION_MS},now),true);
 assert.equal(isDraftExpired({updatedAt:now-1000},now),false);
 assert.equal(draftDaysLeft({updatedAt:now},now),30);
 assert.equal(draftExpiringSoon({updatedAt:now},now),false);
 assert.equal(draftExpiringSoon({updatedAt:now-26*86400000},now),true);
 const rows=Array.from({length:MAX_DRAFTS_PER_SCOPE+2},(_,i)=>({id:`d${i}`,updatedAt:now-i*1000}));
 rows.push({id:'old',updatedAt:0});
 const purge=draftsToPurge(rows,now);
 assert.ok(purge.includes('old'));
 assert.ok(purge.includes(`d${MAX_DRAFTS_PER_SCOPE+1}`));
 assert.ok(!purge.includes('d0'));
 assert.equal(purge.length,3);
});

test('store keeps one draft per id, lists by scope and clears a scope on sign-out', async () => {
 const store=createMemoryDraftStore();
 await store.save(record({id:'x',scope:'s1',createdAt:1,updatedAt:1}));
 await store.save(record({id:'x',scope:'s1',title:'Novo',createdAt:5,updatedAt:5}));
 await store.save(record({id:'y',scope:'s2',updatedAt:2}));
 const mine=await store.list('s1');
 assert.equal(mine.length,1);assert.equal(mine[0]?.title,'Novo');assert.equal(mine[0]?.createdAt,1);
 assert.equal(await store.removeScope('s1'),1);
 assert.deepEqual(await store.list('s1'),[]);
 assert.equal((await store.list('s2')).length,1);
});

test('draft copy exists in every language', () => {
 for(const copy of Object.values(draftMessages)){
  for(const [key,value] of Object.entries(copy))if(typeof value==='string')assert.ok(value.length>0,key);
  assert.ok(copy.features['cattle-animal']&&copy.features['support-ticket']);
 }
});
