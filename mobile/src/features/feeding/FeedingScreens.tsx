import {useCallback,useState} from 'react';
import { colors } from '../../theme/tokens';
import {FlatList,RefreshControl,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,StatusPill} from '../agenda/ui';
import {DetailHeader,EmptyState,ErrorState,IconTile,KpiStrip,ListFooter,ListRow,MetricGrid,ScreenIntro,SearchBar,SectionLabel,Segmented,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {productionSchema} from '../cattle/contracts';
import {DairyIcon} from '../cattle/DairyIcon';
import {canReadDailyFeeding,canWriteDailyFeeding,feedingBatchPage,FeedingDayChanged,feedingDeliveriesForDay,type FeedingBatch} from './contracts';
import {feedingMessages} from './messages';
const dayLabel=(day:string,language:string)=>new Intl.DateTimeFormat(language,{dateStyle:'long',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`));
const number=(value:number|string,language:string)=>new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(value));

export function FeedingScreen(){
 const params=useLocalSearchParams(),initial=productionSchema.safeParse(params.production??'beef');
 const {state,controller,language}=useAuth(),{farm}=useWorkspace(),router=useRouter(),t=feedingMessages[language],w=workspaceMessages[language];
 const [production,setProduction]=useState(initial.success?initial.data:'beef'),[search,setSearch]=useState('');
 const allowed=initial.success&&state.status==='signedIn'&&canReadDailyFeeding(state.session.user);
 const list=useInfinitePages<FeedingBatch>({queryKey:['feeding','infinite',production,farm?.id,search],enabled:allowed,fetchPage:async(page,signal)=>feedingBatchPage.parse(await controller.dailyFeeding({resource:'batches',production,page,search,farm:farm?.id},signal))});
 const {refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const day=(list.data?.pages[0] as {date?:string}|undefined)?.date;
 const supplied=list.rows.reduce((sum,row)=>sum+Number(row.supplied_kg),0),pendingBatches=list.rows.filter(row=>Number(row.supplied_kg)===0).length;
 const complete=!list.hasNextPage&&!!list.data;
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={[day?dayLabel(day,language):null,farm?.name].filter(Boolean).join(' · ')} badge={state.status==='signedIn'&&!canWriteDailyFeeding(state.session.user)?<View style={{marginTop:6}}><StatusPill label={t.readonly} tone="neutral"/></View>:undefined}/>
  <Segmented value={production} onChange={setProduction} options={(['beef','dairy'] as const).map(value=>({value,label:t[value]}))}/>
  {list.count!==undefined&&<KpiStrip items={[{key:'b',label:t.batches,value:number(list.count,language)},...(complete?[{key:'s',label:t.supplied,value:`${number(supplied,language)} kg`,tone:'success' as const},{key:'p',label:t.unfed,value:number(pendingBatches,language),tone:pendingBatches?'warning' as const:undefined}]:[])]}/>}
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
  {list.isError&&!!list.rows.length&&<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>}
 </View>;
 return <WorkspaceShell active="feeding" title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<FeedingBatch> data={list.rows} keyExtractor={row=>row.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=>{const fed=Number(item.supplied_kg)>0;return <ListRow meta={item.farm_name} title={`${item.batch_code}${item.name?` · ${item.name}`:''}`} subtitle={`${number(item.head_count,language)} ${t.heads.toLowerCase()}`} value={`${number(item.supplied_kg,language)} kg`} valueCaption={t.supplied} leading={<IconTile tone={fed?'success':'warning'}><DairyIcon name="wheat" size={20} color={fed?colors.success:colors.warning}/></IconTile>} accessibilityLabel={`${item.batch_code}. ${item.name}. ${t.heads}: ${number(item.head_count,language)}. ${t.supplied}: ${number(item.supplied_kg,language)} kg. ${t.deliveries}`} onPress={()=>router.push({pathname:'/feeding/batch',params:{batch:item.id,production,farm:item.farm}})}/>;}}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}
export const feedingRoute=z.object({batch:z.uuid(),farm:z.uuid(),production:productionSchema});
type Delivery=ReturnType<typeof feedingDeliveriesForDay>['results'][number];
export function FeedingBatchScreen(){
 const params=useLocalSearchParams(),route=feedingRoute.safeParse(params),{state,controller,language}=useAuth(),t=feedingMessages[language],w=workspaceMessages[language],router=useRouter();
 const [expanded,setExpanded]=useState<string|null>(null);
 const allowed=route.success&&state.status==='signedIn'&&canReadDailyFeeding(state.session.user);
 const batch=useQuery({queryKey:['feeding-batch',params.batch,params.farm,params.production],enabled:allowed,staleTime:0,queryFn:async({signal})=>{if(!route.success)throw Error('route');const data=feedingBatchPage.parse(await controller.dailyFeeding({...route.data,resource:'batches',page:1,search:''},signal));const row=data.results.find(value=>value.id===route.data.batch&&value.farm===route.data.farm);if(!row)throw Error('unavailable');return {row,date:data.date,timezone:data.timezone};}});
 const day=batch.data?.date;
 const records=useInfinitePages<Delivery>({queryKey:['feeding-deliveries','infinite',params.batch,params.farm,params.production,day],enabled:allowed&&!!batch.data&&!batch.isError,fetchPage:async(page,signal)=>{if(!route.success||!day)throw Error('route');return feedingDeliveriesForDay(await controller.dailyFeeding({...route.data,resource:'deliveries',page,search:''},signal),day);}});
 const {refetch:refreshBatch}=batch,{refetch:refreshRecords}=records;
 useFocusEffect(useCallback(()=>{if(allowed)void refreshBatch();},[allowed,refreshBatch]));
 useFocusEffect(useCallback(()=>{if(allowed&&day&&!batch.isError)void refreshRecords();},[allowed,day,batch.isError,refreshRecords]));
 const context=batch.isError?undefined:batch.data,rows=records.isError||!context?[]:records.rows;
 const [refreshing,setRefreshing]=useState(false);
 const refresh=async()=>{const result=await refreshBatch();if(result.data&&!result.isError&&result.data.date===day)await refreshRecords();};
 const writable=state.status==='signedIn'&&canWriteDailyFeeding(state.session.user),writeDisabled=batch.isFetching||batch.isError||records.isPending||(records.isFetching&&!records.isFetchingNextPage)||records.isError;
 const header=<View style={ms.header}>{!allowed?<EmptyState title={w.noAccess}/>:<>
  {batch.isPending?<SkeletonList rows={2}/>:batch.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refresh()}/>:null}
  {context&&<DetailHeader meta={`${context.row.farm_name} · ${t[route.success?route.data.production:'beef']}`} title={`${context.row.batch_code}${context.row.name?` · ${context.row.name}`:''}`} leading={<IconTile tone="brand"><DairyIcon name="herd" size={22}/></IconTile>} status={[{label:`${t.today}: ${dayLabel(context.date,language)}`,tone:'neutral'},...(!writable?[{label:t.readonly,tone:'neutral' as const}]:[])]}>
   <MetricGrid columns={2} items={[{label:t.heads,value:number(context.row.head_count,language)},{label:t.supplied,value:number(context.row.supplied_kg,language),unit:'kg',tone:Number(context.row.supplied_kg)>0?'success':'warning'}]}/>
   {writable&&route.success&&<AgendaButton variant="primary" label={t.launch} disabled={writeDisabled} onPress={()=>router.push({pathname:'/feeding/form',params:route.data})}/>}
   <Text style={{fontSize:12,lineHeight:17,color:colors.muted}}>{t.scope}</Text>
  </DetailHeader>}
  <SectionLabel title={`${t.deliveries}${records.count!==undefined&&context?` · ${number(records.count,language)}`:''}`}/>
  {records.isError&&context&&<ErrorState message={records.error instanceof FeedingDayChanged?t.historyDayChanged:w.error} language={language} onRetry={()=>void refresh()}/>}
 </>}</View>;
 return <WorkspaceShell active="feeding" title={t.deliveries} onBack={()=>router.canGoBack()?router.back():router.replace('/feeding')}>
  <FlatList<Delivery> data={rows} keyExtractor={row=>row.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" ListHeaderComponent={header}
   refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await refresh();}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={records.loadMore} onEndReachedThreshold={0.4}
   renderItem={({item})=>{const open=expanded===item.id;return <ListRow meta={new Intl.DateTimeFormat(language,{timeStyle:'short',timeZone:context?.timezone}).format(new Date(item.created_at))} title={item.item_name} subtitle={`${t.author}: ${item.recorded_by||'—'}`} value={`${number(item.quantity_kg,language)} kg`} leading={<IconTile tone="warning"><DairyIcon name="wheat" size={20} color={colors.warning}/></IconTile>} accessibilityLabel={`${item.item_name}. ${number(item.quantity_kg,language)} kg. ${open?t.hideDetails:t.details}`} onPress={()=>setExpanded(value=>value===item.id?null:item.id)} extra={open?<View style={{gap:4,marginTop:6}}>{!!item.notes&&<Text style={{fontSize:14,lineHeight:20,color:colors.textSoft}}>{item.notes}</Text>}<Text selectable style={{fontSize:12,color:colors.muted}}>{item.id}</Text></View>:undefined}/>;}}
   ListEmptyComponent={!context?undefined:records.isPending?<SkeletonList rows={3}/>:records.isError?undefined:<EmptyState title={t.empty}/>}
   ListFooterComponent={rows.length?<ListFooter loading={records.isFetchingNextPage} end={!records.hasNextPage} language={language}/>:undefined}/>
 </WorkspaceShell>;
}
