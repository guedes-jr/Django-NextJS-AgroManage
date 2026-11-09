import {useId,useRef,useState} from 'react';
import {Alert,Platform,Pressable,ScrollView,Switch,Text,View} from 'react-native';
import {usePreventRemove,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {Controller,useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {isAxiosError} from 'axios';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {AgendaShell,AgendaButton,Busy,styles as s} from '../agenda/ui';
import {NotificationSaveUnconfirmed} from '../../services/authApi';
import {canReadNotifications,preferenceFields,preferenceValuesSchema,type Preferences,type PreferenceValues} from './contracts';
import {notificationMessages} from './messages';
export function PreferencesScreen(){
 const {controller,state,language}=useAuth();const t=notificationMessages[language],w=workspaceMessages[language],router=useRouter();const instance=useId();const [nonce,setNonce]=useState(0),[failed,setFailed]=useState(false);const allowed=state.status==='signedIn'&&canReadNotifications(state.session.user);
 const q=useQuery({queryKey:['notification-preferences-form',instance],enabled:allowed,staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false,networkMode:'always',queryFn:({signal})=>controller.notificationPreferences(signal)});
 const back=()=>router.canGoBack()?router.back():router.replace('/notifications');
 if(!allowed||q.isPending||q.isError&&!q.data)return <AgendaShell title={t.preferences} backLabel={w.back} onBack={back}><View style={s.content}>{!allowed?<Text style={s.error}>{w.noAccess}</Text>:q.isPending?<Busy label={w.loading}/>:<><Text style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void q.refetch()}/></>}</View></AgendaShell>;
 if(!q.data)return null;
 return <PreferencesEditor key={nonce} initial={q.data} reload={async()=>{setFailed(false);const result=await q.refetch();if(result.isError)setFailed(true);else setNonce(v=>v+1);}} reloadFailed={failed}/>;
}
function PreferencesEditor({initial,reload,reloadFailed}:{initial:Preferences;reload:()=>Promise<void>;reloadFailed:boolean}){
 const {state,controller,language}=useAuth();const t=notificationMessages[language],w=workspaceMessages[language],router=useRouter();const [record,setRecord]=useState(initial),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[conflict,setConflict]=useState(false),[discarding,setDiscarding]=useState(false),[message,setMessage]=useState('');const lock=useRef(false);
 const {control,handleSubmit,reset,formState:{isDirty}}=useForm<PreferenceValues>({resolver:zodResolver(preferenceValuesSchema),defaultValues:preferenceValuesSchema.parse(initial)});
 usePreventRemove(!discarding&&(isDirty||busy||unknown),({repeat})=>{if(lock.current)return;const leave=()=>{setDiscarding(true);repeat();};if(Platform.OS==='web'){if(window.confirm(`${t.discard}\n${unknown?t.uncertain:t.discardBody}`))leave();}else Alert.alert(t.discard,unknown?t.uncertain:t.discardBody,[{text:t.stay,style:'cancel'},{text:t.leave,style:'destructive',onPress:leave}]);});
 const save=async(values:PreferenceValues)=>{if(lock.current||unknown||conflict)return;lock.current=true;setBusy(true);setMessage('');try{const result=await controller.saveNotificationPreferences(values,record);setRecord(result);reset(preferenceValuesSchema.parse(result));setMessage(t.saved);}catch(error){if(error instanceof NotificationSaveUnconfirmed){setUnknown(true);setMessage(t.uncertain);}else if(isAxiosError(error)&&error.response?.status===409){setConflict(true);setMessage(t.changed);}else setMessage(t.failed);}finally{lock.current=false;setBusy(false);}};
 const reloadData=()=>{if(lock.current)return;const run=async()=>{lock.current=true;setBusy(true);try{await reload();}finally{lock.current=false;setBusy(false);}};if(!isDirty||unknown||conflict){void run();return;}if(Platform.OS==='web'){if(window.confirm(`${t.discard}\n${t.discardBody}`))void run();}else Alert.alert(t.discard,t.discardBody,[{text:t.stay,style:'cancel'},{text:t.reload,onPress:()=>void run()}]);};
 const disabled=busy||unknown||conflict;const fields=state.status==='signedIn'?preferenceFields(state.session.user):[];
 return <AgendaShell title={t.preferences} backLabel={w.back} onBack={()=>{if(!lock.current){if(router.canGoBack())router.back();else router.replace('/notifications');}}}><ScrollView contentContainerStyle={s.content}><Text style={s.body}>{t.account}</Text>{fields.map(key=><View key={key} style={[s.card,s.row,{justifyContent:'space-between'}]}><Text style={[s.body,{flex:1}]}>{t[key]}</Text><Controller control={control} name={key} render={({field})=><Pressable accessibilityRole="switch" accessibilityLabel={t[key]} accessibilityState={{checked:field.value,disabled}} disabled={disabled} onPress={()=>field.onChange(!field.value)} style={{minHeight:44,minWidth:52,justifyContent:'center',alignItems:'center'}}><View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden={true}><Switch accessible={false} disabled={disabled} value={field.value} trackColor={{true:'#28703C',false:'#9AABA0'}}/></View></Pressable>}/></View>)}<Text style={s.muted}>{t.pushNote}</Text><Text style={s.title}>{t.frequency}</Text><Controller control={control} name="frequency" render={({field})=><View style={s.row}>{(['instant','daily','weekly'] as const).map(value=><AgendaButton key={value} label={t[value]} selected={field.value===value} disabled={disabled} onPress={()=>field.onChange(value)}/>)}</View>}/><AgendaButton label={busy?w.loading:t.save} disabled={disabled||!isDirty} onPress={()=>void handleSubmit(save)()}/><AgendaButton label={t.reload} disabled={busy} onPress={reloadData}/>{!!message&&<Text accessibilityRole="alert" style={message===t.saved?s.badge:s.error}>{message}</Text>}{reloadFailed&&<Text style={s.error}>{w.error}</Text>}</ScrollView></AgendaShell>;
}
