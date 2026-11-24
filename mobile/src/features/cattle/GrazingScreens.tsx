import {grazingTransferMessages} from './grazingTransferMessages';
import {canExitPasture} from './grazingExitContracts';
import {grazingExitMessages} from './grazingExitMessages';
import {useCallback,useState} from 'react';
import {FlatList,RefreshControl,ScrollView,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {colors} from '../../theme/tokens';
import {DairyIcon} from './DairyIcon';
import {ActionGroup,ActionRow,DetailHeader,EmptyState,ErrorState,FilterChips,IconTile,InfoList,ListFooter,ListRow,MetricGrid,Notice,ScreenIntro,SearchBar,SectionLabel,Shortcut,SkeletonList,mobileStyles as ms,mobileUiMessages} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {canReadCattle,productionSchema} from './contracts';
import {cattleMessages,cattleLabel} from './messages';
import {pastureMessages} from './pastureMessages';
import {grazingMessages} from './grazingMessages';
import type {Grazing,GrazingQuery} from './grazingContracts';
const routeSchema=z.object({production:productionSchema,farm:z.uuid(),pasture:z.uuid()});
export function GrazingsScreen(){
 const params=useLocalSearchParams(),route=routeSchema.safeParse(params),{state,controller,language}=useAuth(),router=useRouter(),t=grazingMessages[language],w=workspaceMessages[language];const reconcile=params.reconcile==='1';const production=route.success?route.data.production:'beef',allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user);
 const [filter,setFilter]=useState<GrazingQuery['state']>('all'),[search,setSearch]=useState('');
 const base={farm:String(params.farm??''),pasture:String(params.pasture??''),state:filter,search};
 const list=useInfinitePages<Grazing>({queryKey:['cattle-grazings','infinite',base],enabled:allowed,fetchPage:(page,signal)=>controller.grazings({...base,page},signal)});const {refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const date=(v:string)=>new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${v}T12:00:00Z`));
 const hidden=reconcile&&list.isFetching&&!list.isFetchingNextPage,rows=hidden?[]:list.rows;
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={rows[0]?.pasture_name??t.scope}/>
  {route.success&&<View style={ms.wrap}><Shortcut label={pastureMessages[language].detail} icon={<DairyIcon name="pasture" size={18}/>} onPress={()=>router.push({pathname:'/cattle/[production]/pasture-detail',params:{production,id:route.data.pasture,farm:route.data.farm}})}/></View>}
  <FilterChips value={filter} onChange={setFilter} options={(['all','open','closed'] as const).map(value=>({value,label:t[value]}))}/>
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
 </View>;
 return <WorkspaceShell active={production} title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<Grazing> contentContainerStyle={ms.list} data={rows} keyExtractor={row=>row.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><ListRow meta={`${date(item.entry_date)} → ${item.exit_date?date(item.exit_date):t.noExit}`} title={item.batch_code} subtitle={`${item.pasture_name} · ${item.farm_name}`} value={new Intl.NumberFormat(language).format(item.current_quantity)} valueCaption={t.quantity} status={{label:item.exit_date?t.closed:t.open,tone:item.exit_date?'neutral':'success'}} leading={<IconTile tone={item.exit_date?'neutral':'success'}><DairyIcon name="herd" size={20} color={colors.textSoft}/></IconTile>} accessibilityLabel={`${t.view}: ${item.batch_code}`} onPress={()=>router.push({pathname:'/cattle/[production]/grazing-detail',params:{production,id:item.id,pasture:item.pasture,farm:item.farm,...(reconcile?{reconcile:'1'}:{})}})}/>}
  ListEmptyComponent={list.isPending||hidden?<SkeletonList/>:list.isError?<ErrorState message={t.unavailable} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}
export function GrazingDetailScreen(){
 const params=useLocalSearchParams(),route=routeSchema.extend({id:z.uuid()}).safeParse(params),{state,controller,language}=useAuth(),router=useRouter(),t=grazingMessages[language],w=workspaceMessages[language],c=cattleMessages[language];const reconcile=params.reconcile==='1';const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user);
 const q=useQuery({queryKey:['cattle-grazing',params.id,params.farm,params.pasture,...(reconcile?['reconciliation']:[])],staleTime:0,gcTime:reconcile?0:undefined,enabled:allowed,queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.grazing(route.data.id,{farm:route.data.farm,pasture:route.data.pasture,state:'all',search:'',page:1},signal);}});const {refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));const item=q.isError||reconcile&&q.isFetching?undefined:q.data;const date=(v:string)=>new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${v}T12:00:00Z`));
 const user=state.status==='signedIn'?state.session.user:null;
 return <WorkspaceShell active={route.success?route.data.production:'beef'} title={t.detail} onBack={()=>router.canGoBack()?router.back():route.success?router.replace({pathname:'/cattle/[production]/grazings',params:{production:route.data.production,pasture:route.data.pasture,farm:route.data.farm}}):router.replace('/')}><ScrollView contentContainerStyle={ms.list}>{!allowed?<EmptyState title={w.noAccess}/>:<>{(q.isPending||reconcile&&q.isFetching)&&<SkeletonList rows={3}/>}{q.isError&&<ErrorState message={t.unavailable} language={language} onRetry={()=>void refetch()}/>}{item&&route.success&&<>
  <DetailHeader meta={`${item.pasture_name} · ${item.farm_name}`} title={item.batch_code} leading={<IconTile tone={item.exit_date?'neutral':'success'}><DairyIcon name="herd" size={22} color={colors.textSoft}/></IconTile>} status={[{label:item.exit_date?t.closed:t.open,tone:item.exit_date?'neutral':'success'},{label:cattleLabel(c,item.batch_status),tone:'neutral'}]}>
   <MetricGrid items={[{label:t.quantity,value:new Intl.NumberFormat(language).format(item.current_quantity)},{label:t.entry,value:date(item.entry_date)},{label:t.exit,value:item.exit_date?date(item.exit_date):t.noExit}]}/>
  </DetailHeader>
  <InfoList rows={[[t.purpose,cattleLabel(c,item.batch_purpose)],[t.notes,item.notes||null]]}/>
  <SectionLabel title={mobileUiMessages[language].actions}/>
  <ActionGroup>
   {!reconcile&&item.exit_date===null&&item.batch_status==='active'&&item.current_quantity>0&&user&&canExitPasture(user)&&<ActionRow label={grazingTransferMessages[language].title} icon={<DairyIcon name="pasture" size={20}/>} onPress={()=>router.push({pathname:'/cattle/[production]/grazing-transfer',params:{production:route.data.production,id:item.id,farm:item.farm,pasture:item.pasture}})}/>}
   {!reconcile&&item.exit_date===null&&user&&canExitPasture(user)&&<ActionRow label={grazingExitMessages[language].title} icon={<DairyIcon name="arrow" size={20}/>} onPress={()=>router.push({pathname:'/cattle/[production]/grazing-exit',params:{production:route.data.production,id:item.id,farm:item.farm,pasture:item.pasture}})}/>}
   {item.batch_purpose!=='unknown'&&<ActionRow label={t.batchDetail} icon={<DairyIcon name="herd" size={20}/>} onPress={()=>router.push({pathname:'/cattle/[production]/[id]',params:{production:item.batch_purpose==='dual'?route.data.production:item.batch_purpose,id:item.batch,kind:'batches',farm:item.farm}})}/>}
  </ActionGroup>
  <Notice tone="neutral" text={t.scope}/>
 </>}</>}</ScrollView></WorkspaceShell>;
}
