import {canManagePasture} from './pastureFormContracts';
import {pastureFormMessages} from './pastureFormMessages';
import {canEnterPasture} from './grazingEntryContracts';
import {grazingEntryMessages} from './grazingEntryMessages';
import {grazingMessages} from './grazingMessages';
import {useCallback,useState} from 'react';
import {FlatList,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {workspaceMessages} from '../workspace/messages';
import { AgendaButton, type StatusTone } from '../agenda/ui';
import {colors} from '../../theme/tokens';
import {DairyIcon} from './DairyIcon';
import {ActionGroup,ActionRow,DetailHeader,EmptyState,ErrorState,HeaderAction,IconTile,InfoList,ListFooter,ListRow,MetricGrid,Notice,ScreenIntro,SearchBar,SectionLabel,SkeletonList,mobileStyles as ms,mobileUiMessages} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {canReadCattle,productionSchema} from './contracts';
import {pastureMessages} from './pastureMessages';
import type {Pasture} from './pastureContracts';
const occupancyTone=(state:string):StatusTone=>state==='occupied'?'success':state==='overstocked'||state==='blocked'?'danger':state==='resting'?'warning':'neutral';
export function PasturesScreen(){
 const params=useLocalSearchParams(),route=z.object({production:productionSchema,farm:z.uuid().optional()}).safeParse(params);
 const {state,controller,language}=useAuth(),{farm}=useWorkspace(),router=useRouter(),t=pastureMessages[language],w=workspaceMessages[language];
 const reconcile=params.reconcile==='1';const production=route.success?route.data.production:'beef',farmId=route.success?route.data.farm??farm?.id:undefined,allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user);
 const [search,setSearch]=useState(typeof params.search==='string'?params.search.slice(0,100):'');
 const list=useInfinitePages<Pasture>({queryKey:['cattle-pastures','infinite',{farm:farmId,search},...(reconcile?['reconciliation']:[])],enabled:allowed,fetchPage:(page,signal)=>controller.pastures({farm:farmId,search,page},signal)});const {refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const number=(v:string|number)=>new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(v));
 const hidden=reconcile&&list.isFetching&&!list.isFetchingNextPage,rows=hidden?[]:list.rows;
 const manager=!reconcile&&state.status==='signedIn'&&canManagePasture(state.session.user);
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={farm?.name??t.scope} action={manager?<HeaderAction label={pastureFormMessages[language].create} onPress={()=>{if(!farmId){router.push('/farms');return;}router.push({pathname:'/cattle/[production]/pasture-form',params:{production,farm:farmId,mode:'create'}});}}/>:undefined}/>
  {manager&&!farmId&&<Notice text={pastureFormMessages[language].chooseFarm}/>}
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
  {list.count!==undefined&&!hidden&&<Text style={{fontSize:12,color:colors.muted}}>{`${list.count} · ${t.scope}`}</Text>}
 </View>;
 return <WorkspaceShell active={production} title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<Pasture> data={rows} keyExtractor={item=>item.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><ListRow meta={`${item.farm_name} · ${number(item.area_ha)} ha`} title={item.name} subtitle={item.occupancy.missing_weight_heads>0?`${t.missing}: ${number(item.occupancy.missing_weight_heads)}`:undefined} value={number(item.occupancy.heads)} valueCaption={t.heads} status={{label:t.states[item.occupancy.state],tone:occupancyTone(item.occupancy.state)}} leading={<IconTile tone={occupancyTone(item.occupancy.state)}><DairyIcon name="pasture" size={20} color={colors.textSoft}/></IconTile>} accessibilityLabel={`${t.open}: ${item.name}`} onPress={()=>router.push({pathname:'/cattle/[production]/pasture-detail',params:{production,id:item.id,farm:item.farm,...(reconcile?{reconcile:'1'}:{})}})}/>}
  ListEmptyComponent={list.isPending||hidden?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}
export function PastureDetailScreen(){
 const params=useLocalSearchParams(),route=z.object({production:productionSchema,id:z.uuid(),farm:z.uuid()}).safeParse(params);const {state,controller,language}=useAuth(),router=useRouter(),t=pastureMessages[language],w=workspaceMessages[language];const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user),reconcile=params.reconcile==='1';
 const q=useQuery({queryKey:['cattle-pasture',params.id,params.farm,...(reconcile?['reconciliation']:[])],enabled:allowed,staleTime:0,refetchOnMount:'always',queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.pasture(route.data.id,route.data.farm,signal);}});const {refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const number=(value:string|number|null)=>value===null?t.unknown:new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(value));const date=(value:string|null)=>value?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`)):t.unknown;const item=q.isError||reconcile&&q.isFetching?undefined:q.data;
 const user=state.status==='signedIn'?state.session.user:null;
 return <WorkspaceShell active={route.success?route.data.production:'beef'} title={t.detail} onBack={()=>router.canGoBack()?router.back():route.success?router.replace({pathname:'/cattle/[production]/pastures',params:{production:route.data.production,farm:route.data.farm}}):router.replace('/')}><ScrollView contentContainerStyle={ms.list}>{!allowed?<EmptyState title={w.noAccess}/>:<>{(q.isPending||reconcile&&q.isFetching)&&<SkeletonList rows={3}/>}{q.isError&&<ErrorState message={t.unavailable} language={language} onRetry={()=>void refetch()}/>}{item&&route.success&&<>
  <DetailHeader meta={`${item.farm_name} · ${number(item.area_ha)} ha`} title={item.name} leading={<IconTile tone={occupancyTone(item.occupancy.state)}><DairyIcon name="pasture" size={22} color={colors.textSoft}/></IconTile>} status={[{label:t.states[item.occupancy.state],tone:occupancyTone(item.occupancy.state)},{label:`${t.availability}: ${t.states[item.availability]}`,tone:item.availability==='blocked'?'danger':item.availability==='resting'?'warning':'neutral'}]}>
   <MetricGrid items={[{label:t.heads,value:number(item.occupancy.heads)},{label:t.stocking,value:number(item.occupancy.stocking_ua_ha),unit:'UA/ha'},{label:t.capacity,value:number(item.occupancy.capacity_percent),unit:'%',tone:Number(item.occupancy.capacity_percent)>100?'danger':undefined}]}/>
   {!!item.availability_reason&&<Notice tone="warning" text={`${t.restriction}: ${item.availability_reason}`}/>}
  </DetailHeader>
  {!reconcile&&user&&canEnterPasture(user)&&!['resting','blocked'].includes(item.availability)&&<AgendaButton variant="primary" label={grazingEntryMessages[language].title} onPress={()=>router.push({pathname:'/cattle/[production]/grazing-entry',params:{production:route.data.production,pasture:item.id,farm:item.farm}})}/>}
  <InfoList rows={[[t.area,`${number(item.area_ha)} ha`],[t.limit,`${number(item.max_stocking_ua_ha)} UA/ha`],[t.missing,number(item.occupancy.missing_weight_heads)],[t.weight,`${number(item.occupancy.live_weight_kg)} kg`],[t.occupied,number(item.occupancy.occupied_days)],[t.lastExit,date(item.occupancy.last_exit_date)],[t.emptyDays,number(item.occupancy.empty_days)],[t.notes,item.notes||null]]}/>
  <SectionLabel title={mobileUiMessages[language].actions}/>
  <ActionGroup>
   <ActionRow label={grazingMessages[language].title} icon={<DairyIcon name="herd" size={20}/>} onPress={()=>router.push({pathname:'/cattle/[production]/grazings',params:{production:route.data.production,pasture:item.id,farm:item.farm}})}/>
   {!reconcile&&user&&canManagePasture(user)&&<ActionRow label={pastureFormMessages[language].edit} icon={<DairyIcon name="pasture" size={20}/>} onPress={()=>router.push({pathname:'/cattle/[production]/pasture-form',params:{production:route.data.production,id:item.id,farm:item.farm,mode:'edit'}})}/>}
  </ActionGroup>
  <Notice tone="neutral" text={t.scope}/>
 </>}</>}</ScrollView></WorkspaceShell>;
}
