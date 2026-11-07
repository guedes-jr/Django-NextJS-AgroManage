import { isAxiosError } from 'axios';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { parseApiUrl } from '../../config/environment';
import { agendaQuerySchema, canReadAgenda, taskWriteAccess, safeAgendaSource, type AgendaEvent, type taskSchema } from './contracts';
import { taskFormMessages } from './formMessages';
import { agendaMessages, agendaLabel } from './messages';
import { AgendaButton, AgendaShell, Busy, styles as s } from './ui';
export function AgendaDetailScreen() {
  const {state,controller,language}=useAuth(); const router=useRouter(); const t=agendaMessages[language];
  const params=useLocalSearchParams<{id:string;start:string;end:string;domain:string;page:string;recorded:string;farm?:string}>();
  const {id,start,end,domain,page,recorded,farm}=params;
  const [result,setResult]=useState<{key:string;event:AgendaEvent|null;task:z.infer<typeof taskSchema>|null;missing:boolean;failed:boolean}>({key:'',event:null,task:null,missing:false,failed:false});
  const [linkFailed,setLinkFailed]=useState(false);const [reload,setReload]=useState(0);
  const requestKey=JSON.stringify([id,start,end,domain,page,recorded,reload,farm]);
  const busy=result.key!==requestKey;
  const {event,task,missing,failed}=busy?{event:null,task:null,missing:false,failed:false}:result;
  const allowed=state.status==='signedIn'&&canReadAgenda(state.session.user);
  useFocusEffect(useCallback(()=>{
    if(!allowed)return;
    const abort=new AbortController();let active=true;
    const load=async()=>{
      let event:AgendaEvent|null=null;let task:z.infer<typeof taskSchema>|null=null;
      if(typeof id!=='string') throw new Error('invalid event');
      if(id.startsWith('task:')) {
        const parsed=z.uuid().safeParse(id.slice(5));
        if(!parsed.success) throw new Error('invalid task');
        task=await controller.agendaTask(parsed.data,abort.signal);
      } else {
        const query=agendaQuerySchema.safeParse({start,end,domain,page,include_recorded:recorded==='1',farm});
        if(!query.success) throw new Error('invalid query');
        const result=await controller.agenda(query.data,abort.signal);const found=result.results.find(e=>e.id===id);
        event=found??null;
      }
      if(active)setResult({key:requestKey,event,task,missing:!event&&!task,failed:false});
    };
    void load().catch(error=>{if(active){const unavailable=isAxiosError(error)&&[403,404].includes(error.response?.status??0);setResult({key:requestKey,event:null,task:null,missing:unavailable,failed:!unavailable});}});
    return ()=>{active=false;abort.abort();};
  },[allowed,controller,id,start,end,domain,page,recorded,requestKey,farm]));
  const back=()=>router.canGoBack()?router.back():router.replace('/agenda');
  const source=state.status==='signedIn'?safeAgendaSource(task?.operational_link??event?.source_url??null,state.session.user):null;
  const open=async()=>{
    const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);
    if(!site||!source){setLinkFailed(true);return;}
    try{setLinkFailed(false);await Linking.openURL(new URL(source,site).href);}catch{setLinkFailed(true);}
  };
  const field=(label:string,value:string|undefined|null)=>(value?<View key={label} style={{gap:3}}><Text style={s.label}>{label}</Text><Text style={s.body}>{value}</Text></View>:null);
  const date=task?.due_date??event?.date;
  return <AgendaShell title={t.detail} backLabel={t.back} onBack={back}><ScrollView contentContainerStyle={s.content}>
    {!allowed?<Text style={s.error}>{t.unavailable}</Text>:busy?<Busy label={t.loading}/>:failed?<View style={s.card}><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={()=>setReload(v=>v+1)}/></View>:missing?<Text style={s.body}>{t.missing}</Text>:<View style={s.card}>
      <Text accessibilityRole="header" style={s.heading}>{task?.title??event?.title}</Text>
      {date&&<Text style={s.body}>{new Intl.DateTimeFormat(language,{dateStyle:'full'}).format(new Date(`${date}T12:00:00`))}</Text>}
      {event&&<Text style={s.muted}>{event.farm_name}</Text>}
      {event?.estimated&&<Text style={s.badge}>{t.estimated}</Text>}
      {field(t.status,agendaLabel(t,task?.status??event?.status??''))}
      {task&&<>{field(t.description,task.description||t.noDescription)}{field(t.time,[task.start_time?.slice(0,5),task.end_time?.slice(0,5)].filter(Boolean).join(' – '))}{field(t.location,task.location)}{field(t.responsible,task.assigned_to_name)}{field(t.author,task.created_by_name)}{field(t.priority,agendaLabel(t,task.priority))}</>}
      {task&&state.status==='signedIn'&&taskWriteAccess(state.session.user,task)!=='none'&&<AgendaButton label={taskFormMessages[language].edit} onPress={()=>router.push({pathname:'/agenda/task-form',params:{taskId:task.id}})}/>}
      {event&&event.domain!=='holidays'&&<Text style={s.body}>{t.source}</Text>}
      {source&&<><AgendaButton label={t.web} onPress={()=>void open()}/><Text style={s.muted}>{t.browserHint}</Text></>}
      {linkFailed&&<Text accessibilityRole="alert" style={s.error}>{t.failedLink}</Text>}
    </View>}
  </ScrollView></AgendaShell>;
}
