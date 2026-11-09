import {useId,useRef,useState} from 'react';
import {Alert,KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import {useLocalSearchParams,usePreventRemove,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Controller,useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {isAxiosError} from 'axios';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {AgendaShell,AgendaButton,Busy,styles as s} from '../agenda/ui';
import {workspaceMessages} from '../workspace/messages';
import {CattleOccurrenceChanged,CattleOccurrenceResolutionUnconfirmed} from '../../services/authApi';
import {productionSchema} from './contracts';
import {canWriteOccurrence,occurrenceResolutionInputSchema,type OccurrenceResolutionOptions} from './occurrenceContracts';
import {occurrenceMessages} from './occurrenceMessages';
const formSchema=occurrenceResolutionInputSchema.pick({resolution:true});
export function OccurrenceResolutionScreen(){
 const params=useLocalSearchParams(),route=z.object({production:productionSchema,farm:z.uuid(),id:z.uuid()}).safeParse(params),instance=useId(),{state,controller,language}=useAuth(),router=useRouter(),t=occurrenceMessages[language],w=workspaceMessages[language];const allowed=route.success&&state.status==='signedIn'&&canWriteOccurrence(state.session.user);
 const q=useQuery({queryKey:['occurrence-resolution',instance,params.id,params.farm,params.production],enabled:allowed,staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false,queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.cattleOccurrenceResolutionOptions(route.data.id,route.data.farm,route.data.production,signal);}});const back=()=>router.canGoBack()?router.back():router.replace('/');
 if(!allowed||q.isError)return <AgendaShell title={t.resolve} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{allowed?t.failed:w.noAccess}</Text>{allowed&&<AgendaButton label={w.retry} onPress={()=>void q.refetch()}/>}</View></AgendaShell>;
 if(q.isPending||!route.success)return <AgendaShell title={t.resolve} backLabel={w.back} onBack={back}><Busy label={w.loading}/></AgendaShell>;
 return <Editor record={q.data} production={route.data.production}/>;
}
function Editor({record,production}:{record:OccurrenceResolutionOptions;production:'beef'|'dairy'}){
 const {controller,language}=useAuth(),router=useRouter(),client=useQueryClient(),t=occurrenceMessages[language],w=workspaceMessages[language];const {control,handleSubmit,formState:{isDirty}}=useForm<{resolution:string}>({resolver:zodResolver(formSchema),defaultValues:{resolution:''}});
 const [saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[blocked,setBlocked]=useState(false),[leaving,setLeaving]=useState(false),[message,setMessage]=useState('');const lock=useRef(false),href={pathname:'/cattle/[production]/operation-detail' as const,params:{production,farm:record.record.farm,id:record.record.id,tab:'occurrences'}};
 usePreventRemove(!saved&&!leaving&&(isDirty||busy||unknown||blocked),({repeat})=>{if(lock.current)return;const leave=()=>{setLeaving(true);repeat();};const body=unknown?t.unknownLeave:t.discardBody;if(Platform.OS==='web'){if(window.confirm(`${t.discard}\n${body}`))leave();}else Alert.alert(t.discard,body,[{text:t.stay,style:'cancel'},{text:t.leave,style:'destructive',onPress:leave}]);});
 const resolve=async({resolution}:{resolution:string})=>{if(lock.current||saved||unknown||blocked)return;lock.current=true;setBusy(true);setMessage('');try{await controller.resolveCattleOccurrence(record.record.id,{farm:record.record.farm,production,context_token:record.context_token,resolution});setSaved(true);for(const key of ['cattle-operations','cattle-operation','agenda','home','workspace-priorities'])void client.invalidateQueries({queryKey:[key]});}catch(error){if(error instanceof CattleOccurrenceResolutionUnconfirmed){setUnknown(true);setMessage(t.resolutionUnknown);}else if(error instanceof CattleOccurrenceChanged||isAxiosError(error)&&[400,403,404,409].includes(error.response?.status??0)){setBlocked(true);setMessage(t.changed);}else{setBlocked(true);setMessage(t.failed);}}finally{lock.current=false;setBusy(false);}};
 const disabled=busy||saved||unknown||blocked;
 return <AgendaShell title={t.resolve} backLabel={w.back} onBack={()=>{if(!lock.current){if(router.canGoBack())router.back();else router.replace('/');}}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><View style={s.card}><Text style={s.heading}>{record.record.tab==='occurrences'?record.record.description:''}</Text><Text style={s.body}>{record.record.farm_name}</Text><Text style={s.body}>{new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${record.record.date}T12:00:00Z`))}</Text></View>{saved?<><Text accessibilityRole="alert" style={s.title}>{t.resolved}</Text><AgendaButton label={t.detail} onPress={()=>router.dismissTo(href)}/></>:<><Text style={s.muted}>{t.resolutionScope}</Text><Text style={s.label}>{t.resolution}</Text><Controller control={control} name="resolution" render={({field})=><TextInput ref={field.ref} accessibilityLabel={t.resolution} style={[s.input,{minHeight:90,textAlignVertical:'top'}]} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} editable={!disabled} multiline maxLength={1000}/>}/><AgendaButton label={busy?w.loading:t.confirm} disabled={disabled} onPress={()=>void handleSubmit(resolve,()=>setMessage(t.resolutionInvalid))()}/></>}{!!message&&<Text accessibilityRole="alert" style={s.error}>{message}</Text>}{(unknown||blocked)&&<AgendaButton label={t.checkDetail} onPress={()=>router.push({...href,params:{...href.params,reconcile:'1'}})}/>}</ScrollView></KeyboardAvoidingView></AgendaShell>;
}
