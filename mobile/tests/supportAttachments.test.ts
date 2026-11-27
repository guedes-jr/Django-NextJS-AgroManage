import assert from 'node:assert/strict';
import {test} from 'node:test';
import {attachmentLimits,attachmentMime,attachmentName,attachmentProblem,formatBytes} from '../src/features/support/attachments';
import {messageSchema} from '../src/features/support/contracts';
import {teamMessageSchema} from '../src/features/platform/contracts';
import {supportMessages} from '../src/features/support/messages';

test('attachment pre-check mirrors the server limits', () => {
 assert.equal(attachmentProblem({name:'laudo.pdf',size:1200},0),null);
 assert.equal(attachmentProblem({name:'foto.JPG',size:null},4),null);
 assert.equal(attachmentProblem({name:'foto.heic',size:100},0),'format');
 assert.equal(attachmentProblem({name:'script.exe',size:100},0),'format');
 assert.equal(attachmentProblem({name:'semextensao',size:100},0),'format');
 assert.equal(attachmentProblem({name:'big.zip',size:attachmentLimits.maxBytes+1},0),'size');
 assert.equal(attachmentProblem({name:'empty.txt',size:0},0),'size');
 assert.equal(attachmentProblem({name:'ok.png',size:10},attachmentLimits.perMessage),'limit');
});

test('picked file names keep a valid extension', () => {
 assert.equal(attachmentName('IMG_0001.HEIC','file:///cache/ImagePicker/abc.jpg','foto'),'IMG_0001.jpg');
 assert.equal(attachmentName(null,'file:///cache/ImagePicker/abc.jpeg?x=1','foto-1'),'foto-1.jpeg');
 assert.equal(attachmentName('Relatório final.pdf','content://x/123','arquivo'),'Relatório final.pdf');
 assert.equal(attachmentName('../../etc/passwd.txt','file:///a.txt','arquivo'),'passwd.txt');
 assert.equal(attachmentName('a<b>.exe','file:///a.exe','arquivo'),'a_b_.exe');
});

test('mime type falls back to the extension and size reads in KB/MB', () => {
 assert.equal(attachmentMime('a.pdf'),'application/pdf');
 assert.equal(attachmentMime('a.jpg','image/jpeg'),'image/jpeg');
 assert.equal(attachmentMime('a.bin'),'application/octet-stream');
 assert.equal(formatBytes(2048,'en'),'2 KB');
 assert.equal(formatBytes(3*1024*1024,'en'),'3 MB');
});

test('customer and team messages expose attachments and permission to attach', () => {
 const base={id:'5f8d0d55-2b7c-4c39-9a52-0d1d9f3f6a10',author_name:'Ana',body:'Oi',from_team:false,created_at:'2026-11-27T10:00:00Z'};
 const attachment={id:'7c9e6679-7425-40de-944b-e07fc1f90ae7',filename:'laudo.pdf',size:10};
 assert.equal(messageSchema.parse({...base,attachments:[attachment],can_attach:true}).can_attach,true);
 assert.equal(messageSchema.parse({...base,attachments:[]}).can_attach,false);
 const team=teamMessageSchema.parse(base);
 assert.deepEqual(team.attachments,[]);assert.equal(team.can_attach,false);
});

test('attachment copy exists in every language', () => {
 for(const copy of Object.values(supportMessages)){
  for(const key of ['attach','camera','gallery','file','attachHint','uploading','uploaded','retryUpload','discard','openAttachment','errFormat','errSize','errLimit','errPermission','errPick','errOpen','errShare','errUnsupported','uploadUnknown'] as const)assert.ok(copy[key].length>0,key);
 }
});
