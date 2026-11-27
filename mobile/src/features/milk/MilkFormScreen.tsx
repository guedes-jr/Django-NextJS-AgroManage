import { useEffect,useId,useMemo,useRef,useState } from 'react';
import { Alert,KeyboardAvoidingView,Platform,Pressable,ScrollView,Text,TextInput,View } from 'react-native';
import { useLocalSearchParams,usePreventRemove,useRouter } from 'expo-router';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { Controller,useForm,useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { useAuth } from '../auth/AuthProvider';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { workspaceMessages } from '../workspace/messages';
import { organizationDay } from '../workspace/contracts';
import { canCreateCattle } from '../cattle/contracts';
import { AgendaButton, Busy, FormField, styles as s } from '../agenda/ui';
import { AgendaFormShell as AgendaShell } from '../workspace/AppShell';
import { AuthFailure,MilkPeriodReadOnly } from '../../services/authApi';
import { milkCommandSchema,milkValuesSchema,isPeriodMilkTotal,type MilkCommand,type MilkValues } from './contracts';
import { milkMessages } from './messages';
import { MilkPeriodDetails } from './MilkPeriodDetails';
import { useLocalDraft } from '../drafts/useLocalDraft';
import { DraftNotice } from '../drafts/DraftScreens';
import { textDraft } from '../drafts/contracts';
const milkDraftSchema=textDraft({liters:z.string().max(20),discarded_liters:z.string().max(20),discard_reason:z.string().max(500),notes:z.string().max(5000),session:z.enum(['morning','afternoon','evening']).nullable()});
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
 if(d.record&&'farm' in d.record&&isPeriodMilkTotal(d.record))return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><ScrollView contentContainerStyle={s.content}><View style={s.card}><Text style={s.title}>{d.record.farm_name}</Text><Text style={s.body}>{t.produced}: {new Intl.NumberFormat(language).format(Number(d.record.liters))} L</Text><Text style={s.body}>{t.discarded}: {new Intl.NumberFormat(language).format(Number(d.record.discarded_liters))} L</Text><MilkPeriodDetails record={d.record}/></View></ScrollView></AgendaShell>;
 const permitted=state.status==='signedIn'&&!d.options.read_only&&d.options.user_id===state.session.user.id&&d.command.date<=d.today&&(!editing||['admin','manager'].includes(state.session.user.access.role))&&(d.command.mode==='individual'?d.animal?.status==='active'&&'identifier' in d.animal&&d.animal.gender==='F'&&['Vaca','Matriz'].includes(d.animal.category):editing||creationFarm?.id===d.command.farm);
 if(!permitted)return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{t.blocked}</Text></View></AgendaShell>;
 return <MilkEditor command={d.command} initial={d.record??{liters:'',discarded_liters:'0',discard_reason:'',notes:''}} label={d.animal&&'identifier' in d.animal?`${d.animal.identifier} · ${d.animal.farm_name}`:d.record?.farm_name??creationFarm?.name??''}/>;
}
function MilkEditor({command,initial,label}:{command:MilkCommand;initial:MilkValues;label:string}){
 const {controller,language}=useAuth();const t=milkMessages[language],w=workspaceMessages[language];const router=useRouter();const client=useQueryClient();const [session,setSession]=useState(command.mode==='individual'?command.session:'morning');
 const {control,handleSubmit,setFocus,getValues,reset,formState:{isDirty,isSubmitting,errors}}=useForm<MilkValues>({resolver:zodResolver(milkValuesSchema(command.mode)),defaultValues:initial});
 // Local draft only for a new record; editing starts from the server record.
 const draft=useLocalDraft({feature:'milk-record',context:`${command.mode}:${command.date}:${command.mode==='individual'?command.animal:command.farm}`,schema:milkDraftSchema,enabled:!command.id,onRestore:({session:kept,...rest})=>{reset({...getValues(),...rest},{keepDefaultValues:true});if(kept&&command.mode==='individual')setSession(kept);}});
 const draftRoute=useMemo(()=>{const params:Record<string,string>={mode:command.mode,date:command.date,farm:command.farm};if(command.mode==='individual')params.animal=command.animal;return {pathname:'/milk/form',params,farm:null};},[command]);
 const watched=useWatch({control});
 const [message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false),[saved,setSaved]=useState(false),[discarding,setDiscarding]=useState(false);const saving=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
 const {ready:draftReady,schedule}=draft;const sessionChanged=command.mode==='individual'&&session!==command.session;
 useEffect(()=>{if(draftReady&&(isDirty||sessionChanged))schedule({...getValues(),session:command.mode==='individual'?session:null},label,draftRoute);},[watched,session,draftReady,isDirty,sessionChanged,schedule,getValues,command.mode,label,draftRoute]);
 const keepDraft=draft.enabled&&!['error','tooLarge'].includes(draft.status.state);
 usePreventRemove(!saved&&!discarding&&(((isDirty||sessionChanged)&&!keepDraft)||isSubmitting||uncertain),({repeat})=>{if(saving.current)return;const leave=()=>{setDiscarding(true);repeat();};if(Platform.OS==='web'){if(window.confirm(`${t.discardTitle}\n${t.discardBody}`))leave();}else Alert.alert(t.discardTitle,t.discardBody,[{text:t.stay,style:'cancel'},{text:t.discard,style:'destructive',onPress:leave}]);});
 const back=()=>{if(!saving.current){if(router.canGoBack())router.back();else router.replace('/milk');}};
 useEffect(()=>{if(saved){if(router.canGoBack())router.back();else router.replace('/milk');}},[saved,router]);
 const persist=async(values:MilkValues)=>{
  if(saving.current||uncertain||saved)return;saving.current=true;setMessage('');
  try{await controller.saveMilk(command.mode==='individual'?{...command,session}:command,values);await draft.discard();if(mounted.current){setSaved(true);void client.invalidateQueries({queryKey:['milk-list']});void client.invalidateQueries({queryKey:['milk-summary']});void client.invalidateQueries({queryKey:['cattle-history']});}}
  catch(error){if(mounted.current){const unknown=!(error instanceof AuthFailure)&&(!isAxiosError(error)||!error.response||error.response.status>=500);setUncertain(unknown);if(unknown)draft.markUnconfirmed({...values,session:command.mode==='individual'?session:null},label,draftRoute);let detail='';if(isAxiosError(error)&&[400,403,409,422].includes(error.response?.status??0)){const body=error.response?.data?.error?.detail??error.response?.data;detail=typeof body?.detail==='string'?body.detail:['liters','discarded_liters','discard_reason','date','session','animal','farm','period_start','non_field_errors'].flatMap(k=>typeof body?.[k]==='string'?[body[k]]:Array.isArray(body?.[k])?body[k].filter((v:unknown)=>typeof v==='string'):[]).join(' ');}setMessage(error instanceof MilkPeriodReadOnly?t.periodReadonly:unknown?t.uncertain:detail.slice(0,800)||t.failed);}}
  finally{saving.current=false;}
 };
 const disabled=isSubmitting||uncertain||saved||!draft.ready;
 const fieldError=(name:keyof MilkValues)=>{const code=errors[name]?.message;return !errors[name]?undefined:code==='positive'||(name==='liters'&&!getValues('liters').trim())?t.errPositive:code==='discard'?t.errDiscard:code==='reason'?t.errReason:t.errFormat;};
 const volume=(name:keyof MilkValues)=>name==='liters'||name==='discarded_liters';
 const input=(name:keyof MilkValues,label:string,multiline=false,next?:keyof MilkValues)=><FormField key={name} label={volume(name)?label.replace(/\s*\(L\)\s*$/,''):label} unit={volume(name)?'L':undefined} error={fieldError(name)}><Controller control={control} name={name} render={({field})=><TextInput accessibilityLabel={label} value={field.value} ref={field.ref} onChangeText={field.onChange} onBlur={field.onBlur} editable={!disabled} keyboardType={volume(name)?'decimal-pad':'default'} returnKeyType={multiline?'default':next?'next':'done'} onSubmitEditing={next?()=>setFocus(next):undefined} submitBehavior={next?'submit':undefined} selectTextOnFocus={volume(name)} multiline={multiline} style={[s.fieldControl,multiline&&{minHeight:80,textAlignVertical:'top',paddingVertical:12}]}/>} /></FormField>;
 return <AgendaShell title={command.id?t.edit:command.mode==='total'?t.newTotal:t.newIndividual} backLabel={w.back} onBack={back}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
  <View style={s.card}><Text style={s.title}>{label}</Text><Text style={s.body}>{new Intl.DateTimeFormat(language,{dateStyle:'long'}).format(new Date(`${command.date}T12:00:00`))}</Text></View><Text style={s.muted}>{t.modeHint}</Text>{command.id&&<Text style={s.muted}>{t.scope}</Text>}{draft.enabled&&<DraftNotice draft={draft} language={language} onDiscard={()=>{void draft.discard();reset();if(command.mode==='individual')setSession(command.session);}}/>}
  {command.mode==='individual'&&<View style={{gap:6}}><Text style={s.label}>{t.session}</Text><View accessibilityRole="radiogroup" style={[s.viewTabs,{alignSelf:'stretch'}]}>{(['morning','afternoon','evening'] as const).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{checked:session===value,disabled:disabled||!!command.id}} disabled={disabled||!!command.id} onPress={()=>setSession(value)} style={[s.viewTab,{flex:1},session===value&&s.viewTabActive]}><Text style={[s.viewTabText,session===value&&s.viewTabTextActive]}>{t[value]}</Text></Pressable>)}</View><Text style={s.muted}>{t.withdrawal}</Text></View>}
  {input('liters',t.produced,false,'discarded_liters')}{input('discarded_liters',t.discarded,false,'discard_reason')}{input('discard_reason',t.reason,false,'notes')}{input('notes',t.notes,true)}{!!message&&<Text accessibilityRole="alert" style={s.error}>{message}</Text>}
  <AgendaButton variant="primary" busy={isSubmitting} label={isSubmitting?t.saving:t.save} disabled={disabled} onPress={()=>{void handleSubmit(persist,()=>setMessage(t.invalid))();}}/>{uncertain&&<AgendaButton label={t.review} onPress={()=>router.push('/milk')}/>}
 </ScrollView></KeyboardAvoidingView></AgendaShell>;
}
