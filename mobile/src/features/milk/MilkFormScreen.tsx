import { useEffect,useId,useRef,useState } from 'react';
import { Alert,KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View } from 'react-native';
import { useLocalSearchParams,usePreventRemove,useRouter } from 'expo-router';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { Controller,useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { useAuth } from '../auth/AuthProvider';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { workspaceMessages } from '../workspace/messages';
import { organizationDay } from '../workspace/contracts';
import { canCreateCattle } from '../cattle/contracts';
import { AgendaShell,AgendaButton,Busy,styles as s } from '../agenda/ui';
import { AuthFailure } from '../../services/authApi';
import { milkCommandSchema,milkValuesSchema,type MilkCommand,type MilkValues } from './contracts';
import { milkMessages } from './messages';
const routeSchema=z.object({mode:z.enum(['individual','total']),id:z.uuid().optional(),date:z.iso.date(),animal:z.uuid().optional(),farm:z.uuid().optional(),session:z.enum(['morning','afternoon','evening']).optional()}).refine(v=>v.mode==='individual'?!!v.animal:!!v.farm);
export function MilkFormScreen(){
 const instanceId=useId();const params=useLocalSearchParams();const route=routeSchema.safeParse(params);const {state,controller,language}=useAuth();const {farm}=useWorkspace();const [creationFarm]=useState(farm);const w=workspaceMessages[language],t=milkMessages[language];const router=useRouter();
 const allowed=route.success&&state.status==='signedIn'&&canCreateCattle(state.session.user);
 const query=useQuery({queryKey:['milk-form',instanceId,params.mode,params.id,params.animal,params.farm,params.date],enabled:allowed,staleTime:0,gcTime:0,refetchOnMount:'always',refetchOnReconnect:false,networkMode:'always',queryFn:async({signal})=>{
  if(!route.success)throw new Error('invalid route');const v=route.data;const options=await controller.agendaOptions(signal);const today=organizationDay(options.timezone);
  const record=v.id?await controller.milkDetail(v.mode,v.id,signal):undefined;
  const animal=v.mode==='individual'?await controller.cattleDetail('animals',v.animal!,'dairy',v.farm,signal):undefined;
  if(record&&(record.date!==v.date||('animal' in record?record.animal!==v.animal:record.farm!==v.farm)))throw new Error('invalid record');
  const command=milkCommandSchema.parse({mode:v.mode,date:v.date,id:v.id,farm:animal&&'farm' in animal?animal.farm:v.farm,animal:v.animal,session:record&&'session' in record?record.session:v.session??'morning'});
  return {options,today,command,record,animal};
 }});
 const back=()=>router.canGoBack()?router.back():router.replace('/milk');
 if(!allowed)return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><Text style={s.error}>{t.blocked}</Text></AgendaShell>;
 if(query.isPending||query.isFetching)return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><Busy label={w.loading}/></AgendaShell>;
 if(query.isError||!query.data)return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void query.refetch()}/></View></AgendaShell>;
 const d=query.data;const editing=!!d.record;
 const permitted=state.status==='signedIn'&&!d.options.read_only&&d.options.user_id===state.session.user.id&&d.command.date<=d.today&&(!editing||['admin','manager'].includes(state.session.user.access.role))&&(d.command.mode==='individual'?d.animal?.status==='active'&&'identifier' in d.animal&&d.animal.gender==='F'&&['Vaca','Matriz'].includes(d.animal.category):editing||creationFarm?.id===d.command.farm);
 if(!permitted)return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{t.blocked}</Text></View></AgendaShell>;
 return <MilkEditor command={d.command} initial={d.record??{liters:'',discarded_liters:'0',discard_reason:'',notes:''}} label={d.animal&&'identifier' in d.animal?`${d.animal.identifier} · ${d.animal.farm_name}`:d.record?.farm_name??creationFarm?.name??''}/>;
}
function MilkEditor({command,initial,label}:{command:MilkCommand;initial:MilkValues;label:string}){
 const {controller,language}=useAuth();const t=milkMessages[language],w=workspaceMessages[language];const router=useRouter();const client=useQueryClient();const [session,setSession]=useState(command.mode==='individual'?command.session:'morning');
 const {control,handleSubmit,formState:{isDirty,isSubmitting,errors}}=useForm<MilkValues>({resolver:zodResolver(milkValuesSchema(command.mode)),defaultValues:initial});
 const [message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false),[saved,setSaved]=useState(false),[discarding,setDiscarding]=useState(false);const saving=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
 usePreventRemove(!saved&&!discarding&&(isDirty||isSubmitting||uncertain||(command.mode==='individual'&&session!==command.session)),({repeat})=>{if(saving.current)return;const leave=()=>{setDiscarding(true);repeat();};if(Platform.OS==='web'){if(window.confirm(`${t.discardTitle}\n${t.discardBody}`))leave();}else Alert.alert(t.discardTitle,t.discardBody,[{text:t.stay,style:'cancel'},{text:t.discard,style:'destructive',onPress:leave}]);});
 const back=()=>{if(!saving.current){if(router.canGoBack())router.back();else router.replace('/milk');}};
 useEffect(()=>{if(saved){if(router.canGoBack())router.back();else router.replace('/milk');}},[saved,router]);
 const persist=async(values:MilkValues)=>{
  if(saving.current||uncertain||saved)return;saving.current=true;setMessage('');
  try{await controller.saveMilk(command.mode==='individual'?{...command,session}:command,values);if(mounted.current){setSaved(true);void client.invalidateQueries({queryKey:['milk-list']});void client.invalidateQueries({queryKey:['milk-summary']});void client.invalidateQueries({queryKey:['cattle-history']});}}
  catch(error){if(mounted.current){const unknown=!(error instanceof AuthFailure)&&(!isAxiosError(error)||!error.response||error.response.status>=500);setUncertain(unknown);let detail='';if(isAxiosError(error)&&[400,403,409,422].includes(error.response?.status??0)){const body=error.response?.data?.error?.detail??error.response?.data;detail=typeof body?.detail==='string'?body.detail:['liters','discarded_liters','discard_reason','date','session','animal','farm','non_field_errors'].flatMap(k=>typeof body?.[k]==='string'?[body[k]]:Array.isArray(body?.[k])?body[k].filter((v:unknown)=>typeof v==='string'):[]).join(' ');}setMessage(unknown?t.uncertain:detail.slice(0,800)||t.failed);}}
  finally{saving.current=false;}
 };
 const disabled=isSubmitting||uncertain||saved;
 const input=(name:keyof MilkValues,label:string,multiline=false)=><View key={name} style={{gap:6}}><Text style={s.label}>{label}</Text><Controller control={control} name={name} render={({field})=><TextInput accessibilityLabel={label} value={field.value} ref={field.ref} onChangeText={field.onChange} onBlur={field.onBlur} editable={!disabled} keyboardType={name==='liters'||name==='discarded_liters'?'decimal-pad':'default'} multiline={multiline} style={[s.input,multiline&&{minHeight:80,textAlignVertical:'top',paddingVertical:12},errors[name]&&{borderColor:'#9A3028'}]}/>} /></View>;
 return <AgendaShell title={command.id?t.edit:command.mode==='total'?t.newTotal:t.newIndividual} backLabel={w.back} onBack={back}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
  <View style={s.card}><Text style={s.title}>{label}</Text><Text style={s.body}>{new Intl.DateTimeFormat(language,{dateStyle:'long'}).format(new Date(`${command.date}T12:00:00`))}</Text></View><Text style={s.muted}>{t.modeHint}</Text>{command.id&&<Text style={s.muted}>{t.scope}</Text>}
  {command.mode==='individual'&&<><Text style={s.label}>{t.session}</Text><View style={s.row}>{(['morning','afternoon','evening'] as const).map(value=><AgendaButton key={value} label={t[value]} selected={session===value} disabled={disabled||!!command.id} onPress={()=>setSession(value)}/>)}</View><Text style={s.muted}>{t.withdrawal}</Text></>}
  {input('liters',t.produced)}{input('discarded_liters',t.discarded)}{input('discard_reason',t.reason)}{input('notes',t.notes,true)}{!!message&&<Text accessibilityRole="alert" style={s.error}>{message}</Text>}
  <AgendaButton label={isSubmitting?t.saving:t.save} disabled={disabled} onPress={()=>{void handleSubmit(persist,()=>setMessage(t.invalid))();}}/>{uncertain&&<AgendaButton label={t.review} onPress={()=>router.push('/milk')}/>}
 </ScrollView></KeyboardAvoidingView></AgendaShell>;
}
