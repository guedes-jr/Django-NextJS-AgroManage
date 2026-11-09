import {managementMessages} from './managementMessages';
import {useId,useRef,useState} from 'react';
import {Alert,KeyboardAvoidingView,Platform,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {useLocalSearchParams,usePreventRemove,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Controller,useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {isAxiosError} from 'axios';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {AgendaShell,AgendaButton,Busy,styles as s} from '../agenda/ui';
import {workspaceMessages} from '../workspace/messages';
import {WeighingCancellationUnconfirmed} from '../../services/authApi';
import {productionSchema} from './contracts';
import {canCreateWeighing,weighingCancelInputSchema,type WeighingEdit} from './weighingContracts';
import {weighingMaintenanceMessages} from './weighingMaintenanceMessages';
const formSchema=weighingCancelInputSchema.pick({reason:true});
export function WeighingCancellationScreen(){
 const params=useLocalSearchParams(),route=z.object({production:productionSchema,farm:z.uuid(),id:z.uuid()}).safeParse(params),instance=useId(),{state,controller,language}=useAuth(),router=useRouter(),t=weighingMaintenanceMessages[language],w=workspaceMessages[language];const allowed=route.success&&state.status==='signedIn'&&canCreateWeighing(state.session.user);
 const q=useQuery({queryKey:['weighing-cancel',instance,params.id,params.farm,params.production],enabled:allowed,staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false,queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.weighingEdit(route.data.id,route.data.farm,route.data.production,signal);}});const back=()=>router.canGoBack()?router.back():router.replace('/');
 if(!allowed||q.isError)return <AgendaShell title={t.cancel} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{allowed?t.failed:w.noAccess}</Text>{allowed&&<AgendaButton label={w.retry} onPress={()=>void q.refetch()}/>}</View></AgendaShell>;
 if(q.isPending)return <AgendaShell title={t.cancel} backLabel={w.back} onBack={back}><Busy label={w.loading}/></AgendaShell>;
 return <Editor record={q.data}/>;
}
function Editor({record}:{record:WeighingEdit}){
 const {controller,language}=useAuth(),router=useRouter(),client=useQueryClient(),t=weighingMaintenanceMessages[language],w=workspaceMessages[language];const {control,handleSubmit,formState:{isDirty}}=useForm<{reason:string}>({resolver:zodResolver(formSchema),defaultValues:{reason:''}});
 const [saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[blocked,setBlocked]=useState(false),[leaving,setLeaving]=useState(false),[message,setMessage]=useState('');const lock=useRef(false),href={pathname:'/cattle/[production]/management-detail' as const,params:{production:record.production,farm:record.farm.id,id:record.id}};
 usePreventRemove(!saved&&!leaving&&(isDirty||busy||unknown||blocked),({repeat})=>{if(lock.current)return;const leave=()=>{setLeaving(true);repeat();};const body=unknown?t.unknownLeave:t.discardBody;if(Platform.OS==='web'){if(window.confirm(`${t.discard}\n${body}`))leave();}else Alert.alert(t.discard,body,[{text:t.stay,style:'cancel'},{text:t.leave,style:'destructive',onPress:leave}]);});
 const cancel=async({reason}:{reason:string})=>{if(lock.current||saved||unknown||blocked)return;lock.current=true;setBusy(true);setMessage('');try{await controller.cancelWeighing(record.id,{farm:record.farm.id,production:record.production,expected_version:record.version,reason});setSaved(true);for(const key of ['cattle-managements','cattle-management','cattle-management-participants'])void client.invalidateQueries({queryKey:[key]});}catch(error){if(error instanceof WeighingCancellationUnconfirmed){setUnknown(true);setMessage(t.unknown);}else if(isAxiosError(error)&&[400,403,404,409].includes(error.response?.status??0)){setBlocked(true);setMessage(t.changed);}else{setBlocked(true);setMessage(t.failed);}}finally{lock.current=false;setBusy(false);}};
 const disabled=busy||saved||unknown||blocked;
 return <AgendaShell title={t.cancel} backLabel={w.back} onBack={()=>{if(!lock.current){if(router.canGoBack())router.back();else router.replace('/');}}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><View style={s.card}><Text style={s.heading}>{record.values.description}</Text><Text style={s.body}>{record.farm.name}</Text><Text style={s.body}>{new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${record.values.date}T12:00:00Z`))}</Text><Text style={s.body}>{managementMessages[language].total}: {record.values.entries.length}</Text></View>{saved?<><Text accessibilityRole="alert" style={s.title}>{t.saved}</Text><AgendaButton label={t.detail} onPress={()=>router.dismissTo(href)}/></>:<><Text style={s.muted}>{t.scope}</Text><Text style={s.label}>{t.reason}</Text><Controller control={control} name="reason" render={({field})=><TextInput ref={field.ref} accessibilityLabel={t.reason} style={[s.input,{minHeight:90,textAlignVertical:'top'}]} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} editable={!disabled} multiline maxLength={300}/>}/><Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={()=>void handleSubmit(cancel,()=>setMessage(t.invalid))()} style={[s.button,{backgroundColor:'#FBECE7'},disabled&&{opacity:0.6}]}><Text style={[s.buttonText,{color:'#8A2D23'}]}>{busy?w.loading:t.confirm}</Text></Pressable></>}{!!message&&<Text accessibilityRole="alert" style={s.error}>{message}</Text>}{(unknown||blocked)&&<AgendaButton label={t.check} onPress={()=>router.push({...href,params:{...href.params,reconcile:'1'}})}/>}</ScrollView></KeyboardAvoidingView></AgendaShell>;
}
