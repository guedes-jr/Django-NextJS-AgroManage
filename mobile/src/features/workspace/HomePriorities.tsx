import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { canReadAgenda, shiftDay } from '../agenda/contracts';
import { agendaLabel, agendaMessages } from '../agenda/messages';
import { agendaStatusTone } from '../agenda/presentation';
import { AgendaButton, Busy, StatusPill, styles as s } from '../agenda/ui';
import { colors, radius, space, touchTarget, type } from '../../theme/tokens';
import { organizationDay } from './contracts';
import { workspaceMessages } from './messages';
import { useWorkspace } from './WorkspaceProvider';
import { useRead } from './useRead';

// Next 7 days of the agenda: what needs attention, readable without opening each item.
export function HomePriorities(){
  const {state,controller,language}=useAuth();const {farm}=useWorkspace();const t=workspaceMessages[language],a=agendaMessages[language];const router=useRouter();const [retry,setRetry]=useState(0);
  const allowed=state.status==='signedIn'&&canReadAgenda(state.session.user);
  const load=useCallback(async(signal:AbortSignal)=>{const options=await controller.agendaOptions(signal);const start=organizationDay(options.timezone);const end=shiftDay(start,6);const query={start,end,domain:'all' as const,page:1,include_recorded:false,...(farm?{farm:farm.id}:{})};const page=await controller.agenda(query,signal);return {page,query,today:start};},[controller,farm]);
  const result=useRead(`${farm?.id??'all'}:${retry}`,load,allowed);
  if(!allowed)return null;
  const day=(value:string)=>new Date(`${value}T12:00:00`);
  return <View style={p.wrap}>
    <View style={s.sectionHeader}><Text accessibilityRole="header" style={s.sectionHeading}>{t.priorities}</Text><Pressable accessibilityRole="link" accessibilityLabel={t.openAgenda} onPress={()=>router.push('/agenda')} style={p.link} hitSlop={6}><Text style={p.linkText}>{t.openAgenda} ›</Text></Pressable></View>
    {result.loading?<Busy label={t.loading}/>:result.failed?<View style={s.card}><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={()=>setRetry(v=>v+1)}/></View>:result.data&&<View style={p.list}>
      {result.data.page.results.slice(0,4).map((event,index)=>{const isToday=event.date===result.data!.today;const status=agendaLabel(a,event.status);return <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`${isToday?a.today:new Intl.DateTimeFormat(language,{dateStyle:'full'}).format(day(event.date))}. ${event.title}. ${status}`} onPress={()=>router.push({pathname:'/agenda/[id]',params:{id:event.id,...result.data!.query,page:'1',recorded:'0',include_recorded:undefined}})} style={({pressed})=>[p.row,index>0&&p.divider,pressed&&p.pressed]}>
        <View style={[p.date,isToday&&p.dateToday]}><Text style={[p.dateDay,isToday&&p.dateTodayText]}>{new Intl.DateTimeFormat(language,{day:'numeric'}).format(day(event.date))}</Text><Text style={[p.dateMonth,isToday&&p.dateTodayText]}>{isToday?a.today:new Intl.DateTimeFormat(language,{month:'short'}).format(day(event.date)).replace('.','')}</Text></View>
        <View style={p.body}><Text style={p.title} numberOfLines={2}>{event.title}</Text>{!!event.farm_name&&<Text style={s.muted} numberOfLines={1}>{event.farm_name}</Text>}<StatusPill label={event.estimated?`${status} · ${a.estimated}`:status} tone={agendaStatusTone(event.status)}/></View>
        <Text aria-hidden style={p.chevron}>›</Text>
      </Pressable>;})}
      {!result.data.page.results.length&&<Text style={[s.body,p.empty]}>{t.noTasks}</Text>}
    </View>}
  </View>;
}
const p=StyleSheet.create({
  wrap:{gap:space.sm},
  link:{minHeight:touchTarget,justifyContent:'center'},linkText:{fontSize:14,fontWeight:'700',color:colors.primary},
  list:{borderRadius:radius.lg,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface,overflow:'hidden'},
  row:{flexDirection:'row',alignItems:'center',gap:space.md,padding:space.md,minHeight:72},
  divider:{borderTopWidth:1,borderColor:colors.divider},pressed:{backgroundColor:colors.primarySoft},
  date:{width:52,paddingVertical:6,borderRadius:radius.md,alignItems:'center',backgroundColor:colors.primarySoft},
  dateToday:{backgroundColor:colors.primary},
  dateDay:{fontSize:18,fontWeight:'800',color:colors.forest,...type.numeric},dateMonth:{fontSize:11,fontWeight:'700',color:colors.muted,textTransform:'uppercase'},
  dateTodayText:{color:colors.surface},
  body:{flex:1,minWidth:0,gap:4},title:{fontSize:15,lineHeight:20,fontWeight:'700',color:colors.forest},
  chevron:{fontSize:22,color:colors.muted},
  empty:{padding:space.lg},
});
