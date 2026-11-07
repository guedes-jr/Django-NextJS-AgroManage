import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { canReadAgenda, shiftDay } from '../agenda/contracts';
import { AgendaButton, Busy, styles as s } from '../agenda/ui';
import { organizationDay } from './contracts';
import { workspaceMessages } from './messages';
import { useWorkspace } from './WorkspaceProvider';
import { useRead } from './useRead';
export function HomePriorities(){
  const {state,controller,language}=useAuth();const {farm}=useWorkspace();const t=workspaceMessages[language];const router=useRouter();const [retry,setRetry]=useState(0);
  const allowed=state.status==='signedIn'&&canReadAgenda(state.session.user);
  const load=useCallback(async(signal:AbortSignal)=>{const options=await controller.agendaOptions(signal);const start=organizationDay(options.timezone);const end=shiftDay(start,6);const query={start,end,domain:'all' as const,page:1,include_recorded:false,...(farm?{farm:farm.id}:{})};const page=await controller.agenda(query,signal);return {page,query};},[controller,farm]);
  const result=useRead(`${farm?.id??'all'}:${retry}`,load,allowed);
  if(!allowed)return null;
  return <View style={s.card}><Text accessibilityRole="header" style={s.title}>{t.priorities}</Text>{result.loading?<Busy label={t.loading}/>:result.failed?<><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={()=>setRetry(v=>v+1)}/></>:result.data&&<>{result.data.page.results.slice(0,3).map(event=><AgendaButton key={event.id} label={`${new Intl.DateTimeFormat(language,{day:'numeric',month:'short'}).format(new Date(`${event.date}T12:00:00`))} · ${event.title}`} onPress={()=>router.push({pathname:'/agenda/[id]',params:{id:event.id,...result.data!.query,page:'1',recorded:'0',include_recorded:undefined}})}/>)}{!result.data.page.results.length&&<Text style={s.body}>{t.noTasks}</Text>}</>}<AgendaButton label={t.openAgenda} onPress={()=>router.push('/agenda')}/></View>;
}
