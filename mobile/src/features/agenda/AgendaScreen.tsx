import {WorkspaceShell} from '../workspace/WorkspaceShell';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { organizationDay } from '../workspace/contracts';
import { FarmContextButton } from '../workspace/FarmContextButton';
import { useRead } from '../workspace/useRead';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { agendaQuerySchema, canReadAgenda, taskWriteAccess, daySchema, shiftDay, type AgendaQuery, type agendaPageSchema } from './contracts';
import { agendaMessages, agendaLabel } from './messages';
import { AgendaButton, Busy, styles as s } from './ui';
import type { z } from 'zod';
import { taskFormMessages } from './formMessages';
export function AgendaScreen() {
  const {controller,language}=useAuth();const t=agendaMessages[language];const [retry,setRetry]=useState(0);
  const load=useCallback((signal:AbortSignal)=>controller.agendaOptions(signal),[controller]);const options=useRead(String(retry),load);
  if(options.loading)return <WorkspaceShell active="agenda" title={t.title}><Busy label={t.loading}/></WorkspaceShell>;
  if(options.failed||!options.data)return <WorkspaceShell active="agenda" title={t.title}><View style={s.content}><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={()=>setRetry(v=>v+1)}/></View></WorkspaceShell>;
  return <AgendaContents timezone={options.data.timezone}/>;
}
function AgendaContents({timezone}:{timezone:string}) {
  const {state,controller,language}=useAuth();
  const router=useRouter(); const t=agendaMessages[language];
  const {farm}=useWorkspace();
  const today=organizationDay(timezone);
  const [date,setDate]=useState(today); const [draft,setDraft]=useState(date);
  const [week,setWeek]=useState(false); const [domain,setDomain]=useState<AgendaQuery['domain']>('all');
  const [recorded,setRecorded]=useState(false);
  const [pagination,setPagination]=useState<{farm:string|null;page:number}>({farm:farm?.id??null,page:1});
  const farmKey=farm?.id??null;const page=pagination.farm===farmKey?pagination.page:1;
  const setPage=(value:number|((current:number)=>number))=>setPagination({farm:farmKey,page:typeof value==='function'?value(page):value});
  const [reload,setReload]=useState(0); const [invalid,setInvalid]=useState(false);
  const [result,setResult]=useState<{key:string;data:z.infer<typeof agendaPageSchema>|null;failed:boolean}>({key:'',data:null,failed:false});
  const allowed=state.status==='signedIn'&&canReadAgenda(state.session.user);
  const end=week?shiftDay(date,6):date;
  const requestKey=JSON.stringify([date,end,domain,page,recorded,reload,farm?.id]);
  const busy=result.key!==requestKey;
  const data=busy?null:result.data;
  const failed=!busy&&result.failed;
  useFocusEffect(useCallback(()=>{
    if(!allowed) return;
    const abort=new AbortController(); let active=true;
    void controller.agenda(agendaQuerySchema.parse({start:date,end,domain,page,include_recorded:recorded,...(farm?{farm:farm.id}:{})}),abort.signal)
      .then(data=>{if(active)setResult({key:requestKey,data,failed:false});}).catch(()=>{if(active)setResult({key:requestKey,data:null,failed:true});});
    return ()=>{active=false;abort.abort();};
  },[controller,allowed,date,end,domain,page,recorded,requestKey,farm]));
  const changeDate=(value:string)=>{setDate(value);setDraft(value);setInvalid(false);setPage(1);};
  const format=(day:string)=>new Intl.DateTimeFormat(language,{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${day}T12:00:00`));
  return <WorkspaceShell active="agenda" title={t.title}>{!allowed?<View style={s.state}><Text>{t.unavailable}</Text></View>:<FlatList
    key={`${date}:${end}:${domain}:${page}:${recorded}`} data={data?.results??[]} keyExtractor={event=>event.id}
    contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<View style={{gap:12}}>
      <FarmContextButton/>
      {state.status==='signedIn'&&state.session.user.access.read_only&&<Text style={s.badge}>{t.readonly}</Text>}
      <View style={s.row}><AgendaButton label="‹" accessibilityLabel={t.previous} onPress={()=>changeDate(shiftDay(date,week?-7:-1))}/><Text style={s.range}>{format(date)}{week?` – ${format(end)}`:''}</Text><AgendaButton label="›" accessibilityLabel={t.next} onPress={()=>changeDate(shiftDay(date,week?7:1))}/></View>
      <View style={s.row}><AgendaButton label={t.today} onPress={()=>changeDate(organizationDay(timezone))}/><AgendaButton label={t.day} selected={!week} onPress={()=>{setWeek(false);setPage(1);}}/><AgendaButton label={t.week} selected={week} onPress={()=>{setWeek(true);setPage(1);}}/></View>
      <Text style={s.label}>{t.date}</Text><View style={s.row}><TextInput accessibilityLabel={t.date} autoCapitalize="none" autoCorrect={false} value={draft} onChangeText={setDraft} placeholder="2026-11-07" style={s.input}/><AgendaButton label={t.apply} onPress={()=>{const parsed=daySchema.safeParse(draft);if(parsed.success)changeDate(parsed.data);else setInvalid(true);}}/></View>
      {invalid&&<Text accessibilityRole="alert" style={s.error}>{t.invalidDate}</Text>}
      <View style={s.row}>{(['all','tasks','livestock','crops','holidays'] as const).map(value=><AgendaButton key={value} label={t[value]} selected={domain===value} onPress={()=>{setDomain(value);setPage(1);}}/>)}</View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{checked:recorded}} onPress={()=>{setRecorded(!recorded);setPage(1);}} style={s.check}><Text style={s.badge}>{recorded?'☑':'☐'}</Text><Text style={s.checkText}>{t.recorded}</Text></Pressable>
      {state.status==='signedIn'&&taskWriteAccess(state.session.user)==='full'&&<AgendaButton label={taskFormMessages[language].create} onPress={()=>router.push({pathname:'/agenda/task-form',params:{date}})}/>}
      <AgendaButton label={t.refresh} disabled={busy} onPress={()=>setReload(v=>v+1)}/>
      {busy&&<Busy label={t.loading}/>}{failed&&<View style={s.card}><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={()=>setReload(v=>v+1)}/></View>}
    </View>}
    ListEmptyComponent={!busy&&!failed?<Text style={s.body}>{t.empty}</Text>:undefined}
    renderItem={({item})=><Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/agenda/[id]',params:{id:item.id,start:date,end,domain,page:String(page),recorded:recorded?'1':'0',farm:farm?.id}})} style={s.card}>
      <Text style={s.muted}>{format(item.date)} · {item.farm_name}</Text><Text style={s.title}>{item.title}</Text><Text style={s.badge}>{agendaLabel(t,item.status)}</Text>{item.estimated&&<Text style={s.muted}>{t.estimated}</Text>}
    </Pressable>}
    ListFooterComponent={data&&!busy?<View style={s.row}><AgendaButton label={t.prevPage} disabled={!data.previous} onPress={()=>setPage(v=>Math.max(1,v-1))}/><Text style={s.muted}>{t.page} {page}</Text><AgendaButton label={t.more} disabled={!data.next} onPress={()=>setPage(v=>v+1)}/></View>:undefined}
  />}</WorkspaceShell>;
}
