import {useCallback,useState} from 'react';
import { colors } from '../../theme/tokens';
import {Pressable,ScrollView,StyleSheet,Text,TextInput,View,useWindowDimensions} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {organizationDay} from '../workspace/contracts';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,Busy,styles as s} from '../agenda/ui';
import {DairyIcon,type DairyIconName} from './DairyIcon';
import {milkCalendarDate} from '../milk/contracts';
import {milkMessages} from '../milk/messages';
import {tankMessages} from '../milk/tankMessages';
import {feedingMessages} from '../feeding/messages';
import {reproductionMessages} from './reproductionMessages';
import {dairyMessages} from './dairyMessages';
import {dairyReferenceDate} from './dairyOverviewContracts';

export function DairyOverview({onHerd,onRoutines}:{onHerd:()=>void;onRoutines:()=>void}){
 const {controller,language,state}=useAuth(),t=dairyMessages[language],w=workspaceMessages[language];
 const day=useQuery({queryKey:['dairy-day'],queryFn:async({signal})=>{const value=await controller.agendaOptions(signal);if(state.status!=='signedIn'||value.user_id!==state.session.user.id)throw Error('actor');return organizationDay(value.timezone);}});
 const {refetch}=day;
 useFocusEffect(useCallback(()=>{void refetch();},[refetch]));
 if(day.isPending)return <Busy label={w.loading}/>;
 if(day.isError||!day.data)return <View style={s.content}><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refetch()}/></View>;
 return <Summary today={day.data} onHerd={onHerd} onRoutines={onRoutines} title={t.summary}/>;
}
function Summary({today,onHerd,onRoutines,title}:{today:string;onHerd:()=>void;onRoutines:()=>void;title:string}){
 const {controller,language}=useAuth(),t=dairyMessages[language],w=workspaceMessages[language],router=useRouter();
 const [selected,setSelected]=useState<string>(),[draft,setDraft]=useState(today),[editing,setEditing]=useState(false),[invalid,setInvalid]=useState(false);
 const date=selected??today,{width,fontScale}=useWindowDimensions(),wide=width>=600&&fontScale<1.5;
 const q=useQuery({queryKey:['dairy-overview',date],staleTime:0,queryFn:({signal})=>controller.dairyOverview(date,signal)}),{refetch}=q;
 useFocusEffect(useCallback(()=>{void refetch();},[refetch]));
 // Never present a failed refresh as a current snapshot.
 const data=q.isError?undefined:q.data;
 const number=(value:number|string|null|undefined,unit=false)=>value==null?'—':`${new Intl.NumberFormat(language,{maximumFractionDigits:1}).format(Number(value))}${unit?' L':''}`;
 const metrics:{label:string;value:number|string|null|undefined;icon:DairyIconName;tone:string;soft:string;liters?:boolean}[]=[
  {label:t.lactating,value:data?.lactating_cows,icon:'lactation',tone:colors.primary,soft:colors.primarySoft},
  {label:t.monthlyProduction,value:data?.monthly_produced_liters,icon:'milk',tone:'#2467A3',soft:'#EAF3FA',liters:true},
  {label:t.monthlyAverage,value:data?.monthly_average_per_lactating_cow,icon:'trend',tone:colors.primary,soft:colors.primarySoft,liters:true},
  {label:t.monthlyDiscard,value:data?.monthly_discarded_liters,icon:'milk-off',tone:'#986119',soft:'#FFF4E2',liters:true},
  {label:t.totalCows,value:data?.total_cows,icon:'cow',tone:'#2467A3',soft:'#EAF3FA'},
  {label:t.dry,value:data?.non_lactating_cows,icon:'milk-off',tone:'#986119',soft:'#FFF4E2'},
  {label:t.young,value:data?.young_females,icon:'calf',tone:colors.neutral,soft:colors.neutralSurface},
  {label:t.bulls,value:data?.bulls,icon:'bull',tone:colors.primary,soft:colors.primarySoft},
 ];
 const shortcuts:{label:string;hint:string;icon:DairyIconName;open:()=>void;tone:string;soft:string}[]=[
  {label:milkMessages[language].title,hint:t.milkHint,icon:'milk',tone:colors.info,soft:colors.infoSurface,open:()=>router.push('/milk')},
  {label:feedingMessages[language].title,hint:t.feedingHint,icon:'wheat',tone:colors.warning,soft:colors.warningSurface,open:()=>router.push({pathname:'/feeding',params:{production:'dairy'}})},
  {label:tankMessages[language].title,hint:t.tankHint,icon:'tank',tone:colors.neutral,soft:colors.neutralSurface,open:()=>router.push('/milk/tanks')},
  {label:reproductionMessages[language].title,hint:t.reproductionHint,icon:'reproduction',tone:'#7954A0',soft:'#F3EDFA',open:()=>router.push({pathname:'/cattle/[production]/reproduction',params:{production:'dairy'}})},
  {label:t.herd,hint:t.openHerd,icon:'herd',tone:colors.primary,soft:colors.primarySoft,open:onHerd},
  {label:t.routines,hint:t.managementHint,icon:'clipboard',tone:colors.primary,soft:colors.primarySoft,open:onRoutines},
 ];
 return <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
  <View style={v.dateRow}><View style={{flex:1,minWidth:160,gap:3}}><Text style={s.label}>{t.reference}</Text><Text style={s.body}>{milkCalendarDate(date,language)}</Text></View><View style={v.dateActions}><AgendaButton label={t.changeReference} selected={editing} onPress={()=>{setDraft(date);setEditing(value=>!value);setInvalid(false);}}/><Pressable accessibilityRole="button" accessibilityLabel={t.refresh} accessibilityState={{disabled:q.isFetching}} disabled={q.isFetching} onPress={()=>void refetch()} style={v.refresh}><Text aria-hidden style={v.refreshIcon}>↻</Text></Pressable></View></View>
  {editing&&<View style={s.card}><Text style={s.label}>{milkMessages[language].date}</Text><TextInput style={s.input} accessibilityLabel={t.reference} value={draft} onChangeText={setDraft} maxLength={10} autoCapitalize="none"/>{invalid&&<Text accessibilityRole="alert" style={s.error}>{t.referenceError}</Text>}<AgendaButton label={t.applyReference} onPress={()=>{const value=dairyReferenceDate(draft,today);if(!value){setInvalid(true);return;}setSelected(value);setInvalid(false);setEditing(false);}}/></View>}
  <View style={v.panel}><Text style={v.eyebrow}>{t.overview}</Text><Text accessibilityRole="header" style={v.title}>{title}</Text>
   {q.isFetching&&<Busy label={w.loading}/>}
   {q.isError&&<View style={{gap:8}}><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refetch()}/></View>}
   <View style={v.grid}>{metrics.map(metric=><View key={metric.label} accessible accessibilityLabel={`${metric.label}: ${q.isPending?w.loading:number(metric.value,metric.liters)}`} style={[v.metric,wide&&v.half]}><View style={[v.metricIcon,{backgroundColor:metric.soft}]}><DairyIcon name={metric.icon} color={metric.tone} size={24}/></View><View style={v.metricCopy}><Text style={v.value}>{number(metric.value,metric.liters)}</Text><Text style={v.label}>{metric.label}</Text></View></View>)}</View>
  </View>
  <Text style={s.muted}>{t.monthlyScope}</Text><Text style={s.muted}>{t.herdScope}{data?` ${milkCalendarDate(data.herd_as_of,language)}.`:''}</Text>
  {data?.milked_cows===0&&<View style={v.notice}><Text style={[s.body,{flex:1}]}>{t.noMilk}</Text><AgendaButton label={t.openMilk} onPress={()=>router.push('/milk')}/></View>}
  <View style={{gap:10}}><Text accessibilityRole="header" style={v.title}>{t.operationsTitle}</Text><View style={v.grid}>{shortcuts.map(item=><Pressable key={item.label} accessibilityRole="button" accessibilityLabel={`${item.label}. ${item.hint}`} onPress={item.open} style={({pressed})=>[v.shortcut,wide&&v.half,pressed&&{opacity:0.65}]}><View style={[v.metricIcon,{backgroundColor:item.soft}]}><DairyIcon name={item.icon} color={item.tone} size={23}/></View><View style={v.metricCopy}><Text style={v.shortcutTitle}>{item.label}</Text><Text style={s.muted}>{item.hint}</Text></View><DairyIcon name="arrow" size={18}/></Pressable>)}</View></View>
  {data&&<Text style={s.muted}>{t.updated} {new Intl.DateTimeFormat(language,{hour:'2-digit',minute:'2-digit'}).format(q.dataUpdatedAt)}</Text>}
 </ScrollView>;
}
const v=StyleSheet.create({dateRow:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},dateActions:{flexDirection:'row',alignItems:'center',gap:8},refresh:{width:44,height:44,alignItems:'center',justifyContent:'center',borderRadius:12,borderWidth:1,borderColor:colors.border},refreshIcon:{fontSize:26,color:colors.primary},panel:{backgroundColor:colors.surface,borderRadius:16,borderWidth:1,borderColor:colors.borderSoft,padding:12,gap:12},eyebrow:{fontSize:12,fontWeight:'700',color:colors.muted,textTransform:'uppercase'},title:{fontSize:19,fontWeight:'800',color:colors.forest},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},metric:{width:'100%',flexDirection:'row',alignItems:'center',gap:12,padding:12,borderWidth:1,borderColor:colors.borderSoft,borderRadius:12,backgroundColor:colors.background},half:{width:'48%',flexGrow:1},metricIcon:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},metricCopy:{flex:1,minWidth:0,gap:4},value:{fontSize:25,fontWeight:'800',color:colors.forest,flexShrink:1},label:{fontSize:13,fontWeight:'600',color:colors.muted},shortcut:{width:'100%',minHeight:88,flexDirection:'row',alignItems:'center',gap:10,padding:12,borderWidth:1,borderColor:colors.borderSoft,borderRadius:14,backgroundColor:colors.surface},shortcutTitle:{fontSize:15,fontWeight:'700',color:colors.forest},notice:{padding:12,gap:10,backgroundColor:colors.soft,borderRadius:12}});
