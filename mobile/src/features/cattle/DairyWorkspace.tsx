import {useCallback,useState} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import type {Href} from 'expo-router';
import {useAuth} from '../auth/AuthProvider';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {FarmContextButton} from '../workspace/FarmContextButton';
import {organizationDay} from '../workspace/contracts';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,Busy,styles as s} from '../agenda/ui';
import {HomeIcon,type HomeIconName} from '../home/HomeIcon';
import {milkCalendarDate} from '../milk/contracts';
import {tankMessages} from '../milk/tankMessages';
import {canReadCattle} from './contracts';
import {canReadManagements} from './managementContracts';
import {cattleMessages,cattleLabel} from './messages';
import {reproductionMessages} from './reproductionMessages';
import {pastureMessages} from './pastureMessages';
import {managementMessages} from './managementMessages';
import {operationMessages} from './operationMessages';
import {milkTrendMessages} from './milkTrendMessages';
import {feedingMessages} from '../feeding/messages';
import {milkMessages} from '../milk/messages';
import {DairyHerd} from './DairyHerd';
import {dairyMessages} from './dairyMessages';
import {CattleListScreen} from './CattleScreens';
type Tab='overview'|'herd'|'routines';
export function CattleLandingScreen(){const {production}=useLocalSearchParams();return production==='dairy'?<DairyWorkspace/>:<CattleListScreen/>;}
function DairyWorkspace(){
 const {state,language}=useAuth(),t=dairyMessages[language],w=workspaceMessages[language];const [tab,setTab]=useState<Tab>('overview');
 const allowed=state.status==='signedIn'&&canReadCattle(state.session.user);
 return <WorkspaceShell active="dairy" title={cattleMessages[language].dairy}>{!allowed?<View style={s.content}><Text style={s.error}>{w.noAccess}</Text></View>:<View style={{flex:1}}>
  <View style={d.context}><FarmContextButton/><View accessibilityRole="tablist" style={d.tabs}>{(['overview','herd','routines'] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:tab===value}} style={[d.tab,tab===value&&d.tabActive]} onPress={()=>setTab(value)}><Text style={[d.tabText,tab===value&&d.tabTextActive]}>{t[value]}</Text></Pressable>)}</View>{state.session.user.access.read_only&&<Text style={s.badge}>{t.readonly}</Text>}</View>
  {tab==='overview'?<Overview onHerd={()=>setTab('herd')}/>:tab==='herd'?<DairyHerd/>:<Routines/>}
 </View>}</WorkspaceShell>;
}
function Overview({onHerd}:{onHerd:()=>void}){
 const {controller,language,state}=useAuth(),{farm}=useWorkspace(),router=useRouter(),t=dairyMessages[language],c=cattleMessages[language],w=workspaceMessages[language];
 const options=useQuery({queryKey:['dairy-day'],queryFn:async({signal})=>{const value=await controller.agendaOptions(signal);if(state.status!=='signedIn'||value.user_id!==state.session.user.id)throw Error('actor');return {today:organizationDay(value.timezone)};}});
 const milk=useQuery({queryKey:['milk-summary',options.data?.today,farm?.id],enabled:!!options.data&&!options.isError,staleTime:0,queryFn:({signal})=>controller.milkSummary(options.data!.today,farm?.id,signal)});
 const herd=useQuery({queryKey:['cattle-overview','dairy',farm?.id],staleTime:0,queryFn:({signal})=>controller.cattleOverview('dairy',farm?.id,signal)});
 const {refetch:refreshMilk}=milk,{refetch:refreshHerd}=herd,{refetch:refreshDay}=options;
 useFocusEffect(useCallback(()=>{void refreshDay();void refreshHerd();},[refreshDay,refreshHerd]));
 useFocusEffect(useCallback(()=>{if(options.data&&!options.isError)void refreshMilk();},[options.data,options.isError,refreshMilk]));
 const m=milk.isError||options.isError?undefined:milk.data,h=herd.isError?undefined:herd.data;
 const num=(value:number|string|null)=>value===null?'—':new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(value));
 const produced=Number(m?.produced_liters),discarded=Number(m?.discarded_liters),usable=Number(m?.usable_liters);
 const visual=Number.isFinite(produced)&&produced>0&&discarded>=0&&usable>=0&&Math.abs(produced-discarded-usable)<0.01;
 const maximum=Math.max(0,...(h?.categories.map(row=>row.quantity)??[]));
 const error=(retry:()=>void)=><View style={{gap:8}}><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={retry}/></View>;
 const stat=(label:string,value:number)=><View key={label} style={d.metric}><Text style={d.number}>{num(value)}</Text><Text style={s.muted}>{label}</Text></View>;
 return <ScrollView contentContainerStyle={s.content}>
  <View style={s.card}><View style={d.sectionHeading}><View style={d.icon}><HomeIcon name="chart"/></View><View style={{flex:1}}><Text style={s.title}>{t.today}</Text>{options.data&&<Text style={s.muted}>{milkCalendarDate(options.data.today,language)}</Text>}</View></View>
   {options.isPending||milk.isPending&&!options.isError?<Busy label={w.loading}/>:options.isError?error(()=>void refreshDay()):milk.isError?error(()=>void refreshMilk()):null}
   {m&&<><View style={d.volumeRow}><Text style={d.volume}>{num(m.produced_liters)}<Text style={d.unit}> L</Text></Text><Text style={s.muted}>{t.produced}</Text></View>
    {visual&&<View accessible accessibilityLabel={`${t.usable}: ${num(m.usable_liters)} L. ${t.discarded}: ${num(m.discarded_liters)} L.`} style={d.volumeBar}><View style={{width:`${usable/produced*100}%`,backgroundColor:'#24663D',height:10}}/><View style={{width:`${discarded/produced*100}%`,backgroundColor:'#D8A33A',height:10}}/></View>}
    <View style={s.row}><Text style={[s.body,{flex:1}]}>{t.usable}: {num(m.usable_liters)} L</Text><Text style={s.body}>{t.discarded}: {num(m.discarded_liters)} L</Text></View>
    {produced===0&&<Text style={s.muted}>{t.noMilk}</Text>}{m.aggregate_mode&&<Text style={s.muted}>{t.aggregate}</Text>}
   </>}
   <InlineLink label={t.openMilk} onPress={()=>router.push('/milk')}/>
  </View>
  <View style={s.card}><View style={d.sectionHeading}><View style={d.icon}><HomeIcon name="leaf"/></View><Text style={s.title}>{t.herd}</Text></View>
   {herd.isPending?<Busy label={w.loading}/>:herd.isError?error(()=>void refreshHerd()):null}
   {h&&<><View style={d.metrics}>{stat(t.heads,h.total_head)}{stat(t.lactating,h.lactating_females)}{stat(t.pregnant,h.pregnant_females)}{stat(t.batches,h.active_batches)}</View>
    {h.total_head===0?<Text style={s.muted}>{t.noHerd}</Text>:h.categories.length>0&&<View style={{gap:10}}><Text style={s.label}>{t.composition}</Text>{h.categories.map(row=><View key={row.category} accessible accessibilityLabel={`${cattleLabel(c,row.category)}: ${num(row.quantity)}`} style={{gap:4}}><View style={d.sectionHeading}><Text style={[s.muted,{flex:1}]}>{cattleLabel(c,row.category)}</Text><Text style={s.label}>{num(row.quantity)}</Text></View><View style={d.categoryTrack}><View style={{width:`${maximum>0?row.quantity/maximum*100:0}%`,height:5,backgroundColor:'#65966C',borderRadius:3}}/></View></View>)}<Text style={d.chartHint}>{t.chart}</Text></View>}
   </>}
   <InlineLink label={t.openHerd} onPress={onHerd}/>
  </View>
  {(m||h)&&<Text style={s.muted}>{t.updated} {new Intl.DateTimeFormat(language,{hour:'2-digit',minute:'2-digit'}).format(Math.max(m?milk.dataUpdatedAt:0,h?herd.dataUpdatedAt:0))}</Text>}
 </ScrollView>;
}
function InlineLink({label,onPress}:{label:string;onPress:()=>void}){return <Pressable accessibilityRole="button" onPress={onPress} style={d.link}><Text style={d.linkText}>{label}</Text><HomeIcon name="arrow" size={18}/></Pressable>;}
function Routines(){
 const {state,language}=useAuth(),{farm}=useWorkspace(),router=useRouter(),t=dairyMessages[language];
 const route=(pathname:string)=>({pathname,params:{production:'dairy',...(farm?{farm:farm.id}:{})}} as Href);
 const groups:{title:string;rows:{label:string;hint:string;icon:HomeIconName;href:Href}[]}[]=[
  {title:t.production,rows:[{label:milkMessages[language].title,hint:t.milkHint,icon:'chart',href:'/milk'},{label:tankMessages[language].title,hint:t.tankHint,icon:'box',href:'/milk/tanks'},{label:milkTrendMessages[language].title,hint:t.trendHint,icon:'trend',href:route('/cattle/[production]/milk-trends')}]},
  {title:t.care,rows:[{label:reproductionMessages[language].title,hint:t.reproductionHint,icon:'leaf',href:route('/cattle/[production]/reproduction')},{label:feedingMessages[language].title,hint:t.feedingHint,icon:'leaf',href:route('/feeding')},{label:pastureMessages[language].title,hint:t.pastureHint,icon:'leaf',href:route('/cattle/[production]/pastures')}]},
  {title:t.management,rows:[{label:operationMessages[language].title,hint:t.operationsHint,icon:'modules',href:route('/cattle/[production]/operations')},...(state.status==='signedIn'&&canReadManagements(state.session.user)?[{label:managementMessages[language].title,hint:t.managementHint,icon:'modules' as const,href:route('/cattle/[production]/managements')}]:[])]},
 ];
 return <ScrollView contentContainerStyle={s.content}>{groups.map(group=><View key={group.title} style={s.card}><Text style={s.title}>{group.title}</Text>{group.rows.map((row,index)=><Pressable key={row.label} accessibilityRole="button" accessibilityLabel={`${row.label}. ${row.hint}`} onPress={()=>router.push(row.href)} style={({pressed})=>[d.routine,index>0&&d.routineDivider,{opacity:pressed?0.65:1}]}><View style={d.icon}><HomeIcon name={row.icon}/></View><View style={{flex:1,gap:3}}><Text style={d.routineTitle}>{row.label}</Text><Text style={s.muted}>{row.hint}</Text></View><HomeIcon name="arrow" size={18}/></Pressable>)}</View>)}</ScrollView>;
}
const d=StyleSheet.create({
 context:{width:'100%',maxWidth:720,alignSelf:'center',paddingHorizontal:16,paddingTop:10,paddingBottom:4,gap:10},tabs:{flexDirection:'row',padding:3,borderRadius:12,backgroundColor:'#E7EDE2',gap:3},tab:{flex:1,minHeight:44,minWidth:44,justifyContent:'center',alignItems:'center',borderRadius:9,paddingHorizontal:5,paddingVertical:8},tabActive:{backgroundColor:'#FFF'},tabText:{fontSize:14,fontWeight:'600',color:'#53645A',flexShrink:1},tabTextActive:{color:'#205D32',fontWeight:'700'},sectionHeading:{flexDirection:'row',alignItems:'center',gap:8},icon:{width:36,height:36,borderRadius:10,backgroundColor:'#EFF4EA',alignItems:'center',justifyContent:'center'},volumeRow:{flexDirection:'row',alignItems:'baseline',gap:10,flexWrap:'wrap'},volume:{maxWidth:'100%',flexShrink:1,fontSize:32,fontWeight:'800',color:'#163F2C'},unit:{fontSize:18,fontWeight:'600'},volumeBar:{height:10,borderRadius:5,overflow:'hidden',flexDirection:'row',backgroundColor:'#E8ECE3'},metrics:{flexDirection:'row',flexWrap:'wrap',gap:12},metric:{flexBasis:100,flexGrow:1,gap:2,paddingVertical:4},number:{fontSize:23,fontWeight:'700',color:'#205D32'},categoryTrack:{height:5,borderRadius:3,backgroundColor:'#EAF0E5'},chartHint:{fontSize:12,lineHeight:18,color:'#66786A'},link:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,borderTopWidth:1,borderColor:'#E7EDDF',paddingTop:8,marginTop:4},linkText:{fontSize:14,fontWeight:'700',color:'#24663D',flex:1},routine:{minHeight:64,flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10},routineDivider:{borderTopWidth:1,borderColor:'#E7EDDF'},routineTitle:{fontSize:15,fontWeight:'600',color:'#24452F'},
});
