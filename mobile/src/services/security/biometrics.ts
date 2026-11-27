import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import {withSystemUi} from '../../features/security/systemUi';
import {unlockOutcome,type UnlockOutcome} from '../../features/security/lockPolicy';

export type BiometricKind='face'|'fingerprint'|'iris'|'device';
export type BiometricSupport={available:boolean;kind:BiometricKind};
const options={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};

/** Available only with hardware and at least one enrolled biometric; the device passcode stays as fallback. */
export async function biometricSupport():Promise<BiometricSupport>{
 try{
  const [hardware,enrolled,types]=await Promise.all([LocalAuthentication.hasHardwareAsync(),LocalAuthentication.isEnrolledAsync(),LocalAuthentication.supportedAuthenticationTypesAsync()]);
  const T=LocalAuthentication.AuthenticationType;
  const kind:BiometricKind=types.includes(T.FACIAL_RECOGNITION)?'face':types.includes(T.FINGERPRINT)?'fingerprint':types.includes(T.IRIS)?'iris':'device';
  return {available:hardware&&enrolled,kind};
 }catch{return {available:false,kind:'device'};}
}

export async function authenticate(copy:{prompt:string;cancel:string;fallback:string}):Promise<UnlockOutcome>{
 try{return unlockOutcome(await withSystemUi(()=>LocalAuthentication.authenticateAsync({promptMessage:copy.prompt,cancelLabel:copy.cancel,fallbackLabel:copy.fallback,disableDeviceFallback:false})));}
 catch{return 'failed';}
}

export async function readBiometricPreference(key:string){
 try{return (await SecureStore.getItemAsync(key,options))==='1';}catch{return false;}
}
export async function writeBiometricPreference(key:string,enabled:boolean){
 if(enabled)await SecureStore.setItemAsync(key,'1',options);else await SecureStore.deleteItemAsync(key,options);
}
