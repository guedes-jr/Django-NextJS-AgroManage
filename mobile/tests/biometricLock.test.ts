import assert from 'node:assert/strict';
import {test} from 'node:test';
import {LOCK_GRACE_MS,SYSTEM_UI_MAX_MS,biometricPreferenceKey,lockOnResume,lockOnSessionStart,settledStatus,unlockOutcome} from '../src/features/security/lockPolicy';
import {securityMessages} from '../src/features/security/messages';
import {systemUiState,withSystemUi} from '../src/features/security/systemUi';

test('restored sessions lock; a password sign-in does not', () => {
 assert.equal(lockOnSessionStart(null,'signedIn',true),true);
 assert.equal(lockOnSessionStart(null,'platform',true),true);
 assert.equal(lockOnSessionStart('unavailable','signedIn',true),true);
 assert.equal(lockOnSessionStart('signedOut','signedIn',true),false);
 assert.equal(lockOnSessionStart(null,'signedIn',false),false);
 assert.equal(lockOnSessionStart(null,'signedOut',true),false);
});

test('foreground revalidation (restoring) does not count as a new session', () => {
 assert.equal(settledStatus('signedIn','restoring'),'signedIn');
 assert.equal(settledStatus(null,'restoring'),null);
 assert.equal(settledStatus('signedIn','signedOut'),'signedOut');
 const previous=settledStatus('signedIn','restoring');
 assert.equal(lockOnSessionStart(previous,'signedIn',true),false);
});

test('resume locks only after the grace period, with more room for system screens', () => {
 const base={enabled:true,backgroundedAt:1000,systemUiActive:false,systemUiEndedAt:null};
 assert.equal(lockOnResume({...base,now:1000+LOCK_GRACE_MS-1}),false);
 assert.equal(lockOnResume({...base,now:1000+LOCK_GRACE_MS}),true);
 assert.equal(lockOnResume({...base,enabled:false,now:1000+LOCK_GRACE_MS*10}),false);
 assert.equal(lockOnResume({...base,backgroundedAt:null,now:1000+LOCK_GRACE_MS*10}),false);
 assert.equal(lockOnResume({...base,systemUiActive:true,now:1000+LOCK_GRACE_MS*2}),false);
 assert.equal(lockOnResume({...base,systemUiActive:true,now:1000+SYSTEM_UI_MAX_MS}),true);
 const now=1000+LOCK_GRACE_MS*3;
 assert.equal(lockOnResume({...base,systemUiEndedAt:now-500,now}),false);
 assert.equal(lockOnResume({...base,systemUiEndedAt:500,now}),true);
});

test('preference key is per environment and user and stays a valid secure-store key', () => {
 const a=biometricPreferenceKey('fazendamais.session.0068','5f8d0d55-2b7c-4c39-9a52-0d1d9f3f6a10');
 assert.match(a,/^[A-Za-z0-9._-]+$/);
 assert.notEqual(a,biometricPreferenceKey('fazendamais.session.0068','other-user'));
 assert.notEqual(a,biometricPreferenceKey('fazendamais.session.0069','5f8d0d55-2b7c-4c39-9a52-0d1d9f3f6a10'));
});

test('unlock outcomes separate cancel, unavailable and failure', () => {
 assert.equal(unlockOutcome({success:true}),'success');
 assert.equal(unlockOutcome({success:false,error:'user_cancel'}),'cancel');
 assert.equal(unlockOutcome({success:false,error:'lockout'}),'unavailable');
 assert.equal(unlockOutcome({success:false,error:'not_enrolled'}),'unavailable');
 assert.equal(unlockOutcome({success:false,error:'authentication_failed'}),'failed');
});

test('system screen tracking survives failures', async () => {
 assert.equal(systemUiState().active,false);
 const pending=withSystemUi(async()=>{assert.equal(systemUiState().active,true);throw Error('cancel');});
 await assert.rejects(pending);
 assert.equal(systemUiState().active,false);
 assert.ok(systemUiState().endedAt);
});

test('security copy exists in every language', () => {
 const keys=Object.keys(securityMessages['pt-BR']) as (keyof typeof securityMessages['pt-BR'])[];
 for(const copy of Object.values(securityMessages))for(const key of keys)assert.ok(copy[key].length>0,key);
});
