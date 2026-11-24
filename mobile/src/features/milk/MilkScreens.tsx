import {tankMessages} from './tankMessages';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useAuth } from '../auth/AuthProvider';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { workspaceMessages } from '../workspace/messages';
import { organizationDay } from '../workspace/contracts';
import { AgendaButton, Busy, StatusPill, styles as s } from '../agenda/ui';
import { HomeIcon } from '../home/HomeIcon';
import { DairyIcon } from '../cattle/DairyIcon';
import { colors } from '../../theme/tokens';
import { DateStepper, EmptyState, ErrorState, HeaderAction, IconTile, KpiStrip, ListFooter, ListRow, MetricGrid, Notice, ScreenIntro, SearchBar, Segmented, Shortcut, SkeletonList, mobileStyles as ms } from '../../components/mobile';
import { useInfinitePages } from '../../components/mobile/useInfinitePages';
import { canReadCattle,canCreateCattle } from '../cattle/contracts';
import { milkCalendarDate,isPeriodMilkTotal,milkKinds,type MilkQuery,type MilkCow,type MilkRecord,type MilkTotal } from './contracts';
import { milkMessages } from './messages';
import { MilkPeriodDetails } from './MilkPeriodDetails';
const denied=(error:unknown)=>isAxiosError(error)&&[401,403,404].includes(error.response?.status??0);
export function MilkScreen(){
 const {state,controller,language}=useAuth();const w=workspaceMessages[language];const t=milkMessages[language];
 const allowed=state.status==='signedIn'&&canReadCattle(state.session.user);
 const options=useQuery({queryKey:['milk-options'],enabled:allowed,queryFn:async({signal})=>{const value=await controller.agendaOptions(signal);return {...value,today:organizationDay(value.timezone)};}});
 const {refetch:refreshOptions}=options;
 useFocusEffect(useCallback(()=>{if(allowed)void refreshOptions();},[allowed,refreshOptions]));
 if(!allowed)return <WorkspaceShell active="milk" title={t.title}><Text style={s.error}>{w.noAccess}</Text></WorkspaceShell>;
 if(options.isPending)return <WorkspaceShell active="milk" title={t.title}><Busy label={w.loading}/></WorkspaceShell>;
 if(!options.data||options.isError)return <WorkspaceShell active="milk" title={t.title}><View style={s.content}><Text style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void options.refetch()}/></View></WorkspaceShell>;
 return <MilkContents today={options.data.today} readOnly={options.data.read_only||state.status!=='signedIn'||options.data.user_id!==state.session.user.id}/>;
}
function MilkContents({today,readOnly}:{today:string;readOnly:boolean}){
 const {state,controller,language}=useAuth();const {farm}=useWorkspace();const router=useRouter();const t=milkMessages[language],w=workspaceMessages[language];
 const [date,setDate]=useState(today),[kind,setKind]=useState<MilkQuery['kind']>('cows'),[search,setSearch]=useState(''),[details,setDetails]=useState(false);
 const summary=useQuery({queryKey:['milk-summary',date,farm?.id],queryFn:({signal})=>controller.milkSummary(date,farm?.id,signal)});
 const list=useInfinitePages<MilkCow|MilkRecord|MilkTotal>({queryKey:['milk-list','infinite',date,farm?.id,kind,search],enabled:true,fetchPage:(page,signal)=>controller.milkPage({date,farm:farm?.id,kind,search,page},signal)});
 const {refetch:refreshSummary}=summary,{refetch:refreshList}=list;useFocusEffect(useCallback(()=>{void refreshSummary();void refreshList();},[refreshSummary,refreshList]));
 const total=denied(summary.error)?undefined:summary.data,blocked=denied(list.error);
 const writable=!readOnly&&state.status==='signedIn'&&canCreateCattle(state.session.user),editable=writable&&state.status==='signedIn'&&['admin','manager'].includes(state.session.user.access.role);
 const number=(value:string|number|null)=>value==null?'—':new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(value));
 const unitless=(label:string)=>label.replace(/\s*\(L\)\s*$/,'');
 const busy=list.isFetching||list.isError;
 const canNewTotal=writable&&kind==='totals'&&!!farm&&list.count===0&&!busy&&!summary.isPending&&!summary.isFetching&&!summary.isError&&!total?.aggregate_mode&&!(total?.milked_cows&&total.milked_cows>0);
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={farm?.name} badge={!writable?<View style={{marginTop:6}}><StatusPill label={t.readonly} tone="neutral"/></View>:undefined} action={canNewTotal?<HeaderAction label={t.newTotal} onPress={()=>router.push({pathname:'/milk/form',params:{mode:'total',farm:farm!.id,date}})}/>:undefined}/>
  <DateStepper value={date} max={today} onChange={setDate} language={language} format={day=>milkCalendarDate(day,language)}/>
  {summary.isPending?<SkeletonList rows={1}/>:summary.isError?<ErrorState message={total?t.stale:w.error} language={language} onRetry={()=>void refreshSummary()}/>:null}
  {total&&<>
   <KpiStrip items={[{key:'p',label:unitless(t.produced),value:`${number(total.produced_liters)} L`},{key:'d',label:unitless(t.discarded),value:`${number(total.discarded_liters)} L`,tone:Number(total.discarded_liters)>0?'warning':undefined},{key:'u',label:unitless(t.usable),value:`${number(total.usable_liters)} L`,tone:'success'}]}/>
   <Pressable accessibilityRole="button" accessibilityState={{expanded:details}} onPress={()=>setDetails(v=>!v)} style={{minHeight:44,justifyContent:'center'}}><Text style={{fontSize:14,fontWeight:'700',color:colors.primary}}>{details?t.hideDetails:t.cowDetails}</Text></Pressable>
   {details&&<MetricGrid columns={2} items={[{label:t.expected,value:number(total.expected_cows)},{label:t.milked,value:number(total.milked_cows)},{label:t.pending,value:number(total.pending_cows),tone:total.pending_cows?'warning':undefined},{label:unitless(t.average),value:number(total.average_per_milked_cow),unit:'L'}]}/>}
   {total.aggregate_mode&&<Notice text={t.aggregate}/>}
  </>}
  <View style={ms.wrap}><Shortcut label={tankMessages[language].open} icon={<HomeIcon name="box" size={18} color={colors.primary}/>} onPress={()=>router.push('/milk/tanks')}/></View>
  <Segmented value={kind} onChange={value=>{setKind(value);setSearch('');}} options={milkKinds.map(value=>({value,label:t[value]}))}/>
  {kind!=='totals'?<SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>:writable&&<Notice text={farm?t.modeHint:t.selectFarm}/>}
  {writable&&kind==='totals'&&!farm&&<Shortcut label={w.farms} onPress={()=>router.push('/farms')}/>}
  {list.isError&&!!list.rows.length&&<ErrorState message={t.stale} language={language} onRetry={()=>void refreshList()}/>}
 </View>;
 const render=({item}:{item:MilkCow|MilkRecord|MilkTotal})=>{
  if('entry_status' in item){const pending=item.entry_status==='pending';const canOpen=writable&&item.entry_status!=='total'&&!busy;
   return <ListRow meta={item.farm_name} title={`${item.identifier}${item.name?` · ${item.name}`:''}`} value={item.liters==null?undefined:`${number(item.liters)} L`} status={{label:pending?t.pendingEntry:t[item.entry_status],tone:pending?'warning':item.entry_status==='total'?'info':'success'}} leading={<IconTile tone={pending?'warning':'brand'}><DairyIcon name="cow" size={20} color={pending?colors.warning:colors.primary}/></IconTile>} accessibilityLabel={canOpen?`${t.newIndividual}: ${item.identifier}`:undefined} onPress={canOpen?()=>router.push({pathname:'/milk/form',params:{mode:'individual',animal:item.id,farm:item.farm,date}}):undefined}/>;}
  if('animal' in item){const canEdit=editable&&!busy;
   return <ListRow meta={`${t[item.session]} · ${item.farm_name}`} title={item.identifier} value={`${number(item.liters)} L`} valueCaption={Number(item.discarded_liters)>0?`${unitless(t.discarded)}: ${number(item.discarded_liters)} L`:undefined} accessibilityLabel={canEdit?`${t.edit}: ${item.identifier}`:undefined} onPress={canEdit?()=>router.push({pathname:'/milk/form',params:{mode:'individual',id:item.id,date:item.date,animal:item.animal,session:item.session,...(farm?{farm:farm.id}:{})}}):undefined}/>;}
  const period=isPeriodMilkTotal(item),canEdit=editable&&!period&&!busy;
  return <ListRow meta={period?undefined:milkCalendarDate(item.date,language)} title={item.farm_name} value={`${number(item.liters)} L`} valueCaption={Number(item.discarded_liters)>0?`${unitless(t.discarded)}: ${number(item.discarded_liters)} L`:undefined} status={{label:t.total,tone:'info'}} extra={period?<MilkPeriodDetails record={item}/>:undefined} accessibilityLabel={canEdit?`${t.edit}: ${item.farm_name}`:undefined} onPress={canEdit?()=>router.push({pathname:'/milk/form',params:{mode:'total',id:item.id,date:item.date,farm:item.farm}}):undefined}/>;
 };
 return <WorkspaceShell active="milk" title={t.title}>{blocked?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<MilkCow|MilkRecord|MilkTotal> data={list.rows} keyExtractor={item=>item.id} renderItem={render} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>{void list.refresh();void refreshSummary();}} tintColor={colors.primary} colors={[colors.primary]}/>}
  onEndReached={list.loadMore} onEndReachedThreshold={0.4} ListHeaderComponent={header}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refreshList()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}
