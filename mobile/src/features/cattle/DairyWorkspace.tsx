import {useState} from 'react';
import { colors } from '../../theme/tokens';
import {Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import type {Href} from 'expo-router';
import {useAuth} from '../auth/AuthProvider';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {FarmContextButton} from '../workspace/FarmContextButton';
import {workspaceMessages} from '../workspace/messages';
import {styles as s} from '../agenda/ui';
import {DairyIcon,type DairyIconName} from './DairyIcon';
import {tankMessages} from '../milk/tankMessages';
import {canReadCattle} from './contracts';
import {canReadManagements} from './managementContracts';
import {cattleMessages} from './messages';
import {reproductionMessages} from './reproductionMessages';
import {pastureMessages} from './pastureMessages';
import {managementMessages} from './managementMessages';
import {operationMessages} from './operationMessages';
import {milkTrendMessages} from './milkTrendMessages';
import {feedingMessages} from '../feeding/messages';
import {milkMessages} from '../milk/messages';
import {dairyFeedingMessages} from '../milk/dairyFeedingMessages';
import {DairyHerd} from './DairyHerd';
import {canReadCattleSales} from './saleContracts';
import {saleMessages} from './saleMessages';
import {dairyMessages} from './dairyMessages';
import {DairyOverview} from './DairyOverview';
import {CattleListScreen} from './CattleScreens';
type Tab='overview'|'herd'|'routines';
export function CattleLandingScreen(){const {production}=useLocalSearchParams();return production==='dairy'?<DairyWorkspace/>:<CattleListScreen/>;}
function DairyWorkspace(){
 const {state,language}=useAuth(),t=dairyMessages[language],w=workspaceMessages[language];const [tab,setTab]=useState<Tab>('overview');
 const allowed=state.status==='signedIn'&&canReadCattle(state.session.user);
 return <WorkspaceShell active="dairy" title={cattleMessages[language].dairy}>{!allowed?<View style={s.content}><Text style={s.error}>{w.noAccess}</Text></View>:<View style={{flex:1}}>
  <View style={d.context}><FarmContextButton/><View accessibilityRole="tablist" style={d.tabs}>{(['overview','herd','routines'] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:tab===value}} style={[d.tab,tab===value&&d.tabActive]} onPress={()=>setTab(value)}><Text style={[d.tabText,tab===value&&d.tabTextActive]}>{t[value]}</Text></Pressable>)}</View>{state.session.user.access.read_only&&<Text style={s.badge}>{t.readonly}</Text>}</View>
  {tab==='overview'?<DairyOverview onHerd={()=>setTab('herd')} onRoutines={()=>setTab('routines')}/>:tab==='herd'?<DairyHerd/>:<Routines/>}
 </View>}</WorkspaceShell>;
}
function Routines(){
 const {width,fontScale}=useWindowDimensions(),wide=width>=600&&fontScale<1.5;
 const {state,language}=useAuth(),{farm}=useWorkspace(),router=useRouter(),t=dairyMessages[language];
 const route=(pathname:string)=>({pathname,params:{production:'dairy',...(farm?{farm:farm.id}:{})}} as Href);
 const groups:{title:string;rows:{label:string;hint:string;icon:DairyIconName;href:Href}[]}[]=[
  {title:t.production,rows:[{label:milkMessages[language].title,hint:t.milkHint,icon:'milk',href:'/milk'},{label:tankMessages[language].title,hint:t.tankHint,icon:'tank',href:'/milk/tanks'},{label:milkTrendMessages[language].title,hint:t.trendHint,icon:'trend',href:route('/cattle/[production]/milk-trends')}]},
  {title:t.care,rows:[{label:reproductionMessages[language].title,hint:t.reproductionHint,icon:'reproduction',href:route('/cattle/[production]/reproduction')},{label:feedingMessages[language].title,hint:t.feedingHint,icon:'wheat',href:route('/feeding')},...(state.status==='signedIn'&&['admin','manager'].includes(state.session.user.access.role)?[{label:dairyFeedingMessages[language].title,hint:dairyFeedingMessages[language].hint,icon:'wheat' as const,href:{pathname:'/milk/group-feeding-history',params:farm?{farm:farm.id}:{}} as Href}]:[]),{label:pastureMessages[language].title,hint:t.pastureHint,icon:'pasture',href:route('/cattle/[production]/pastures')}]},
  {title:t.management,rows:[{label:operationMessages[language].title,hint:t.operationsHint,icon:'clipboard',href:route('/cattle/[production]/operations')},...(state.status==='signedIn'&&canReadManagements(state.session.user)?[{label:managementMessages[language].title,hint:t.managementHint,icon:'clipboard' as const,href:route('/cattle/[production]/managements')}]:[]),...(state.status==='signedIn'&&canReadCattleSales(state.session.user)?[{label:saleMessages[language].title,hint:saleMessages[language].subtitle,icon:'wallet' as const,href:route('/cattle/[production]/sales')}]:[])]},
 ];
 const tones:Partial<Record<DairyIconName,{color:string;backgroundColor:string}>>={milk:{color:colors.info,backgroundColor:colors.infoSurface},tank:{color:colors.neutral,backgroundColor:colors.neutralSurface},trend:{color:'#2467A3',backgroundColor:'#EAF3FA'},wheat:{color:colors.warning,backgroundColor:colors.warningSurface},reproduction:{color:'#7954A0',backgroundColor:'#F3EDFA'}};
 return <ScrollView contentContainerStyle={s.content}><View style={{gap:3}}><Text accessibilityRole="header" style={d.sectionTitle}>{t.operationsTitle}</Text></View>{groups.map(group=><View key={group.title} style={{gap:10}}><Text accessibilityRole="header" style={d.groupTitle}>{group.title}</Text><View style={d.grid}>{group.rows.map(row=>{const tone=tones[row.icon]??{color:colors.primary,backgroundColor:colors.primarySoft};return <Pressable key={row.label} accessibilityRole="button" accessibilityLabel={`${row.label}. ${row.hint}`} onPress={()=>router.push(row.href)} style={({pressed})=>[d.routine,wide&&d.half,{opacity:pressed?0.65:1}]}><View style={[d.icon,{backgroundColor:tone.backgroundColor}]}><DairyIcon name={row.icon} color={tone.color}/></View><View style={{flex:1,minWidth:0,gap:4}}><Text style={d.routineTitle}>{row.label}</Text><Text style={s.muted}>{row.hint}</Text></View><DairyIcon name="arrow" size={18}/></Pressable>;})}</View></View>)}</ScrollView>;
}
const d=StyleSheet.create({
 context:{width:'100%',maxWidth:1600,alignSelf:'center',paddingHorizontal:16,paddingTop:10,paddingBottom:4,gap:10},tabs:{flexDirection:'row',padding:3,borderRadius:12,backgroundColor:colors.track,gap:3},tab:{flex:1,minHeight:44,minWidth:44,justifyContent:'center',alignItems:'center',borderRadius:9,paddingHorizontal:5,paddingVertical:8},tabActive:{backgroundColor:colors.surface},tabText:{fontSize:14,fontWeight:'600',color:colors.muted,flexShrink:1},tabTextActive:{color:colors.primary,fontWeight:'700'},icon:{width:44,height:44,borderRadius:22,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center'},sectionTitle:{fontSize:19,fontWeight:'800',color:colors.forest},groupTitle:{fontSize:13,fontWeight:'700',color:colors.muted},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},half:{width:'48%',flexGrow:1},routine:{width:'100%',minHeight:88,flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:14,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface},routineTitle:{fontSize:15,fontWeight:'600',color:colors.forest},
});
