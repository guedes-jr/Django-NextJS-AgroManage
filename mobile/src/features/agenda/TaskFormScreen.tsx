import { useWorkspace } from '../workspace/WorkspaceProvider';
import { workspaceMessages } from '../workspace/messages';
import { organizationDay } from '../workspace/contracts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter, usePreventRemove } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isAxiosError } from 'axios';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { AuthFailure } from '../../services/authApi';
import { taskInputSchema, taskWriteAccess, taskStatuses, taskPriorities, daySchema, type AgendaTask, type taskOptionsSchema, type TaskInput } from './contracts';
import { agendaLabel, agendaMessages } from './messages';
import { taskFormMessages } from './formMessages';
import { AgendaButton, AgendaShell, Busy, styles as s } from './ui';
type Options=z.infer<typeof taskOptionsSchema>;
export function TaskFormScreen() {
  const {taskId,date}=useLocalSearchParams<{taskId?:string;date?:string}>();
  const {state,controller,language}=useAuth();const router=useRouter();const t=agendaMessages[language];
  const f=taskFormMessages[language];const [retry,setRetry]=useState(0);
  const [result,setResult]=useState<{key:string;options:Options|null;task:AgendaTask|undefined;failed:boolean}>({key:'',options:null,task:undefined,failed:false});
  const key=`${taskId??'new'}:${retry}`;
  useEffect(()=>{
    const abort=new AbortController();let active=true;
    const load=async()=>{
      const id=taskId===undefined?undefined:z.uuid().parse(taskId);
      const [options,task]=await Promise.all([controller.agendaOptions(abort.signal),id?controller.agendaTask(id,abort.signal):Promise.resolve(undefined)]);
      if(active)setResult({key,options,task,failed:false});
    };
    void load().catch(()=>{if(active)setResult({key,options:null,task:undefined,failed:true});});
    return ()=>{active=false;abort.abort();};
  },[controller,taskId,key]);
  const back=()=>router.canGoBack()?router.back():router.replace('/agenda');
  if(result.key!==key)return <AgendaShell title={taskId?f.edit:f.create} backLabel={t.back} onBack={back}><Busy label={t.loading}/></AgendaShell>;
  if(result.failed||!result.options)return <AgendaShell title={taskId?f.edit:f.create} backLabel={t.back} onBack={back}><View style={s.content}><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={()=>setRetry(v=>v+1)}/></View></AgendaShell>;
  const access=state.status==='signedIn'&&!result.options.read_only&&result.options.user_id===state.session.user.id?taskWriteAccess(state.session.user,result.task):'none';
  if(access==='none')return <AgendaShell title={f.edit} backLabel={t.back} onBack={back}><View style={s.content}><Text style={s.body}>{f.blocked}</Text></View></AgendaShell>;
  return <TaskEditor key={key} task={result.task} options={result.options} access={access} initialDate={daySchema.safeParse(date).success?date!:organizationDay(result.options.timezone)} onBack={back}/>;
}
function TaskEditor({task,options,access,initialDate,onBack}:{task?:AgendaTask;options:Options;access:'full'|'status';initialDate:string;onBack:()=>void}) {
  const {controller,language}=useAuth();const router=useRouter();
  const {farm}=useWorkspace();const [creationFarm]=useState(farm);
  const contextChanged=(creationFarm?.id??null)!==(farm?.id??null);
  const currentFarm=useRef(farm?.id??null);
  useLayoutEffect(()=>{currentFarm.current=farm?.id??null;},[farm?.id]);
  const assertCurrent=()=>{if(currentFarm.current!==(creationFarm?.id??null))throw new AuthFailure('unsupported');};
  const t=agendaMessages[language];const f=taskFormMessages[language];
  const [error,setError]=useState('');const [uncertain,setUncertain]=useState(false);const [saved,setSaved]=useState(false);
  const saving=useRef(false);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  const {control,handleSubmit,formState:{isDirty,isSubmitting,errors}}=useForm<TaskInput>({resolver:zodResolver(taskInputSchema),defaultValues:{
    farm:task?undefined:creationFarm?.id??null,title:task?.title??'',description:task?.description??'',due_date:task?.due_date??initialDate,
    start_time:task?.start_time?.slice(0,5)??null,end_time:task?.end_time?.slice(0,5)??null,location:task?.location??'',
    event_kind:(task?.event_kind as TaskInput['event_kind'])??'task',priority:(task?.priority as TaskInput['priority'])??'medium',status:(task?.status as TaskInput['status'])??'open',
  }});
  const [discarding,setDiscarding]=useState(false);
  usePreventRemove(!discarding&&!saved&&(isDirty||isSubmitting||uncertain),({repeat})=>{
    const discard=()=>{setDiscarding(true);repeat();};
    if(saving.current)return;
    if(Platform.OS==='web'){
      if(window.confirm(`${f.leaveTitle}\n${f.leaveBody}`))discard();
    }else Alert.alert(f.leaveTitle,f.leaveBody,[{text:f.stay,style:'cancel'},{text:f.discard,style:'destructive',onPress:()=>discard()}]);
  });
  useEffect(()=>{if(saved)onBack();},[saved,onBack]);
  const persist=async(values:TaskInput)=>{
    if(saving.current||uncertain||contextChanged||saved)return;saving.current=true;setError('');
    try{await controller.saveAgendaTask(access==='status'?{status:values.status}:values,task?.id,{farm:creationFarm?.id??null,taskFarm:task?.farm,assertCurrent});if(mounted.current)setSaved(true);}
    catch(error){if(mounted.current){const unknown=!(error instanceof AuthFailure)&&(!isAxiosError(error)||!error.response||error.response.status>=500);setUncertain(unknown);setError(unknown?f.uncertain:f.serverError);}}
    finally{saving.current=false;}
  };
  const input=(name:'title'|'description'|'due_date'|'start_time'|'end_time'|'location',label:string,multiline=false)=><View key={name} style={{gap:6}}><Text style={s.label}>{label}</Text><Controller control={control} name={name} render={({field})=><TextInput accessibilityLabel={label} value={field.value??''} onChangeText={value=>field.onChange((name==='start_time'||name==='end_time')&&!value?null:value)} onBlur={field.onBlur} ref={field.ref} editable={!isSubmitting&&!uncertain&&!contextChanged&&!saved} multiline={multiline} autoCapitalize={['due_date','start_time','end_time'].includes(name)?'none':'sentences'} style={[s.input,multiline&&{minHeight:90,textAlignVertical:'top',paddingVertical:12},errors[name]&&{borderColor:'#9A3028'}]}/>} /></View>;
  const choices=<K extends 'status'|'priority'|'event_kind'>(name:K,label:string,values:readonly TaskInput[K][],labels:(v:TaskInput[K])=>string)=><View key={name} style={{gap:6}}><Text style={s.label}>{label}</Text><Controller control={control} name={name} render={({field})=><View style={s.row}>{values.map(value=><AgendaButton key={value} label={labels(value)} selected={field.value===value} disabled={isSubmitting||uncertain||contextChanged||saved} onPress={()=>field.onChange(value)}/>)}</View>}/></View>;
  return <AgendaShell title={task?f.edit:f.create} backLabel={t.back} onBack={()=>{if(!isSubmitting)onBack();}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Text style={s.muted}>{f.timeHint} {options.timezone}</Text>
    {access==='status'?<Text style={s.body}>{f.restricted}</Text>:<>{!task&&<><Text style={s.muted}>{f.self}</Text>{creationFarm&&<Text style={s.badge}>{workspaceMessages[language].farms}: {creationFarm.name}</Text>}</>}{input('title',f.title)}{input('description',t.description,true)}{choices('event_kind',f.kind,['task','event','appointment'],value=>f[value])}{input('due_date',f.date)}{input('start_time',f.start)}{input('end_time',f.end)}{input('location',t.location)}{choices('priority',t.priority,taskPriorities,value=>agendaLabel(t,value))}</>}
    {choices('status',t.status,taskStatuses,value=>agendaLabel(t,value))}
    {contextChanged&&<Text accessibilityRole="alert" style={s.error}>{t.contextChanged}</Text>}
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <AgendaButton label={isSubmitting?f.saving:f.save} disabled={isSubmitting||uncertain||saved||contextChanged} onPress={()=>{void handleSubmit(persist,()=>setError(f.invalid))();}}/>
    {uncertain&&<AgendaButton label={f.openAgenda} onPress={()=>router.push('/agenda')}/>}
  </ScrollView></KeyboardAvoidingView></AgendaShell>;
}
