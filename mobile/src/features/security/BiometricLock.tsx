import {createContext,useCallback,useContext,useEffect,useRef,useState,type PropsWithChildren} from 'react';
import {AppState,Image,Pressable,Switch,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {AgendaButton} from '../agenda/ui';
import {Notice} from '../../components/mobile';
import {colors,space,type as typo} from '../../theme/tokens';
import {selectApiUrl,sessionStorageKey} from '../../config/environment';
import {authenticate,biometricSupport,readBiometricPreference,writeBiometricPreference,type BiometricSupport} from '../../services/security/biometrics';
import {biometricPreferenceKey,hasSession,lockOnResume,lockOnSessionStart,settledStatus,type SessionStatus,type UnlockOutcome} from './lockPolicy';
import {systemUiState} from './systemUi';
import {securityMessages} from './messages';

type Ctx={support:BiometricSupport|null;enabled:boolean;setEnabled:(value:boolean)=>Promise<UnlockOutcome>};
const BiometricContext=createContext<Ctx>({support:null,enabled:false,setEnabled:async()=>'unavailable'});
export const useBiometricLock=()=>useContext(BiometricContext);
const namespace=sessionStorageKey(selectApiUrl({api:process.env.EXPO_PUBLIC_API_URL,devApi:process.env.EXPO_PUBLIC_DEV_API_URL},__DEV__));
type Phase='open'|'checking'|'locked';

/**
 * Optional local unlock over a session that is still valid. It hides the app (also from accessibility)
 * until the user confirms with biometrics or the device passcode, or chooses to sign in again.
 */
export function BiometricLockProvider({children}:PropsWithChildren){
 const {state,controller,language}=useAuth();const t=securityMessages[language];
 const userId=state.status==='signedIn'||state.status==='platform'?state.session.user.id:null;
 const [tracked,setTracked]=useState<{settled:SessionStatus|null;key:string|null}>({settled:null,key:null});
 const [phase,setPhase]=useState<Phase>('open');
 const key=userId?biometricPreferenceKey(namespace,userId):state.status==='restoring'?tracked.key:null;
 // Derived during render so restored content never paints for a frame before the lock.
 const settled=settledStatus(tracked.settled,state.status);
 if(settled!==tracked.settled||key!==tracked.key){
  const continuing=hasSession(tracked.settled??'signedOut')&&tracked.key===key;
  if(settled&&!continuing&&lockOnSessionStart(tracked.settled,settled,true))setPhase('checking');
  else if(!hasSession(settled??'signedOut')&&phase!=='open')setPhase('open');
  setTracked({settled,key});
 }
 const active=hasSession(settled??'signedOut');
 const [preference,setPreference]=useState<{key:string;value:boolean}|null>(null);const enabled=!!key&&preference?.key===key&&preference.value;
 const [support,setSupport]=useState<BiometricSupport|null>(null);
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const prompting=useRef(false);

 useEffect(()=>{void biometricSupport().then(setSupport);},[]);
 useEffect(()=>{
  if(!key)return;
  let live=true;void readBiometricPreference(key).then(value=>{if(!live)return;setPreference({key,value});setPhase(current=>current==='checking'?value?'locked':'open':current);});
  return ()=>{live=false;};
 },[key]);

 // With the lock on, hide the content while the app is not in front (iOS app switcher snapshot).
 const [foreground,setForeground]=useState(AppState.currentState==='active');
 const live=useRef({enabled,active});
 useEffect(()=>{live.current={enabled,active};},[enabled,active]);
 useEffect(()=>{
  let backgroundedAt:number|null=null;
  const subscription=AppState.addEventListener('change',next=>{
   setForeground(next==='active');
   if(next==='background'){backgroundedAt=Date.now();return;}
   if(next!=='active')return;
   const ui=systemUiState();
   if(live.current.active&&lockOnResume({enabled:live.current.enabled,backgroundedAt,now:Date.now(),systemUiActive:ui.active,systemUiEndedAt:ui.endedAt}))setPhase('locked');
   backgroundedAt=null;
   if(!ui.active)void biometricSupport().then(setSupport);
  });
  return ()=>subscription.remove();
 },[]);

 const unlock=useCallback(async()=>{
  if(prompting.current)return;prompting.current=true;setBusy(true);setMessage('');
  try{
   const copy=securityMessages[language];
   const outcome=await authenticate({prompt:copy.prompt,cancel:copy.cancel,fallback:copy.fallback});
   if(outcome==='success'){setPhase('open');return;}
   if(outcome==='unavailable')setMessage(copy.unavailable);else if(outcome==='failed')setMessage(copy.failed);
  }finally{prompting.current=false;setBusy(false);}
 },[language]);
 useEffect(()=>{if(phase==='locked'&&active)void unlock();},[phase,active,unlock]);

 const setEnabled=useCallback(async(value:boolean):Promise<UnlockOutcome>=>{
  if(!key)return 'unavailable';
  if(value){
   if(!support?.available)return 'unavailable';
   const copy=securityMessages[language];const outcome=await authenticate({prompt:copy.prompt,cancel:copy.cancel,fallback:copy.fallback});if(outcome!=='success')return outcome;
  }
  try{await writeBiometricPreference(key,value);}catch{return 'failed';}
  setPreference({key,value});return 'success';
 },[key,support,language]);

 const privacy=active&&enabled&&!foreground;
 const covered=active&&(phase!=='open'||privacy);
 return <BiometricContext.Provider value={{support,enabled,setEnabled}}>
  <View style={{flex:1}} importantForAccessibility={covered?'no-hide-descendants':'auto'} accessibilityElementsHidden={covered}>{children}</View>
  {covered&&<SafeAreaView accessibilityViewIsModal style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:colors.background,alignItems:'center',justifyContent:'center',padding:space.xl}}>
   <View style={{width:'100%',maxWidth:420,alignItems:'center',gap:space.md}}>
    <Image source={require('../../../assets/brand-mark.png')} accessibilityIgnoresInvertColors style={{width:72,height:72}} resizeMode="contain"/>
    {phase==='locked'&&foreground&&<>
     <Text accessibilityRole="header" style={{...typo.screenTitle,color:colors.text,textAlign:'center'}}>{t.lockedTitle}</Text>
     <Text style={{...typo.body,color:colors.muted,textAlign:'center'}}>{t.lockedHint}</Text>
     {!!message&&<Notice tone="warning" text={message}/>}
     <AgendaButton variant="primary" style={{alignSelf:'stretch'}} busy={busy} disabled={busy} label={t.unlock} onPress={()=>void unlock()}/>
     <AgendaButton style={{alignSelf:'stretch'}} disabled={busy} label={t.usePassword} onPress={()=>void controller.signOut()}/>
    </>}
   </View>
  </SafeAreaView>}
 </BiometricContext.Provider>;
}

/** Profile/backoffice switch. Turning it on asks for biometrics first, so a wrong setup cannot lock the user out. */
export function BiometricSetting({language}:{language:keyof typeof securityMessages}){
 const {support,enabled,setEnabled}=useBiometricLock();const t=securityMessages[language];
 const [busy,setBusy]=useState(false);const [notice,setNotice]=useState<{text:string;ok:boolean}|null>(null);
 if(!support)return null;
 if(!support.available&&!enabled)return <Notice tone="neutral" text={t.settingUnavailable}/>;
 const label=support.kind==='face'?t.settingFace:support.kind==='fingerprint'?t.settingFingerprint:support.kind==='iris'?t.settingIris:t.settingDevice;
 const change=async(value:boolean)=>{if(busy)return;setBusy(true);setNotice(null);
  try{const outcome=await setEnabled(value);
   if(outcome==='success')setNotice({text:value?t.enabled:t.disabled,ok:true});
   else if(outcome==='unavailable')setNotice({text:t.settingUnavailable,ok:false});
   else if(outcome==='failed')setNotice({text:t.failed,ok:false});
  }finally{setBusy(false);}};
 return <View style={{gap:space.xs}}>
  <Pressable accessibilityRole="switch" accessibilityState={{checked:enabled,disabled:busy}} accessibilityLabel={label} accessibilityHint={t.settingHint} disabled={busy} onPress={()=>void change(!enabled)} style={{flexDirection:'row',alignItems:'center',gap:space.md,minHeight:44,paddingVertical:space.sm}}>
   <View style={{flex:1}}><Text style={{...typo.body,color:colors.text}}>{label}</Text><Text style={{...typo.meta,color:colors.muted}}>{t.settingHint}</Text></View>
   <Switch accessible={false} disabled={busy} value={enabled} onValueChange={value=>void change(value)} trackColor={{true:colors.primary,false:colors.muted}}/>
  </Pressable>
  {notice&&<Notice tone={notice.ok?'success':'danger'} text={notice.text}/>}
 </View>;
}
