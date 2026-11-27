import type {UnlockOutcome} from '../../features/security/lockPolicy';

export type BiometricKind='face'|'fingerprint'|'iris'|'device';
export type BiometricSupport={available:boolean;kind:BiometricKind};
/** The web preview keeps no session on disk, so there is nothing to unlock. */
export async function biometricSupport():Promise<BiometricSupport>{return {available:false,kind:'device'};}
export async function authenticate(_copy:{prompt:string;cancel:string;fallback:string}):Promise<UnlockOutcome>{return 'unavailable';}
export async function readBiometricPreference(_key:string){return false;}
export async function writeBiometricPreference(_key:string,_enabled:boolean){}
