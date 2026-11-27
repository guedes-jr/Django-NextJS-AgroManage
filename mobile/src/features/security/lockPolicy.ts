/**
 * Optional biometric unlock (P14.15/P14.16). Biometrics only re-open a session that is still valid on
 * the server; they never replace the password or extend the session validity.
 */
export const LOCK_GRACE_MS=2*60*1000;
/** Camera, gallery, file picker or share sheet opened by the app itself: allowed away time before locking. */
export const SYSTEM_UI_MAX_MS=10*60*1000;
/** The picker promise may settle just after the app becomes active again. */
export const SYSTEM_UI_SETTLE_MS=2000;

export type SessionStatus='restoring'|'signedOut'|'signedIn'|'platform'|'unavailable';
const hasSession=(status:SessionStatus)=>status==='signedIn'||status==='platform';

/**
 * `previous` is the last settled status (`restoring` is transient and ignored; the app revalidates the
 * session on every return to the foreground). A session that appears straight from storage (cold start,
 * or a retry after the server was unavailable) is locked. One that appears after the login screen was
 * just authenticated with the password is not, and a session that simply continues is handled on resume.
 */
export function lockOnSessionStart(previous:SessionStatus|null,next:SessionStatus,enabled:boolean){
 return enabled&&hasSession(next)&&(previous===null||previous==='unavailable');
}
export const settledStatus=(previous:SessionStatus|null,next:SessionStatus)=>next==='restoring'?previous:next;
export {hasSession};

export function lockOnResume({enabled,backgroundedAt,now,systemUiActive,systemUiEndedAt}:{enabled:boolean;backgroundedAt:number|null;now:number;systemUiActive:boolean;systemUiEndedAt:number|null}){
 if(!enabled||backgroundedAt===null)return false;
 const away=now-backgroundedAt;
 const fromSystemUi=systemUiActive||(systemUiEndedAt!==null&&systemUiEndedAt>=backgroundedAt&&now-systemUiEndedAt<SYSTEM_UI_SETTLE_MS);
 return away>=(fromSystemUi?SYSTEM_UI_MAX_MS:LOCK_GRACE_MS);
}

/** Per API environment and per user, so another account on the same device never inherits the setting. */
export function biometricPreferenceKey(namespace:string,userId:string){
 return `fazendamais.biometric.${namespace.replace(/[^A-Za-z0-9._-]/g,'')}.${userId.replace(/[^A-Za-z0-9._-]/g,'')}`.slice(0,200);
}

export type UnlockOutcome='success'|'cancel'|'unavailable'|'failed';
export function unlockOutcome(result:{success:true}|{success:false;error:string}):UnlockOutcome{
 if(result.success)return 'success';
 if(['user_cancel','system_cancel','app_cancel','user_fallback'].includes(result.error))return 'cancel';
 if(['not_enrolled','not_available','passcode_not_set','lockout'].includes(result.error))return 'unavailable';
 return 'failed';
}
