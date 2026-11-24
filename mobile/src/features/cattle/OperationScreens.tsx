import {tankMessages} from '../milk/tankMessages';
import {canReadCattleCosts} from './costContracts';
import {costMessages} from './costMessages';
import {milkTrendMessages} from './milkTrendMessages';
import {importPreviewMessages} from './importPreviewMessages';
import {canEnterPasture} from './grazingEntryContracts';
import {protocolMessages} from './protocolMessages';
import {classificationMessages} from './classificationMessages';
import {canCreateWeighing} from './weighingContracts';
import {canWriteOccurrence} from './occurrenceContracts';
import {occurrenceMessages} from './occurrenceMessages';
import {useCallback,useState} from 'react';
import {FlatList,RefreshControl,ScrollView,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import { AgendaButton, type StatusTone } from '../agenda/ui';
import {colors} from '../../theme/tokens';
import {DairyIcon} from './DairyIcon';
import {ActionGroup,ActionRow,DetailHeader,EmptyState,ErrorState,FilterChips,HeaderAction,IconTile,InfoList,ListFooter,ListRow,MetricGrid,ScreenIntro,SearchBar,SectionLabel,Segmented,Shortcut,SkeletonList,mobileStyles as ms,mobileUiMessages} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {productionSchema,canReadCattle,type Production} from './contracts';
import {canReadManagements} from './managementContracts';
import {cattleMessages,cattleLabel} from './messages';
import {operationTabs,type CattleOperation,type CattleOperationQuery} from './operationContracts';
import {operationMessages} from './operationMessages';
const routeSchema=z.object({production:productionSchema,farm:z.uuid().optional(),tab:z.enum(operationTabs).optional()});
const occTone=(status:string):StatusTone=>status==='done'||status==='resolved'?'success':status==='open'||status==='pending'?'warning':'neutral';
export function OperationsScreen(){
 const params=useLocalSearchParams(),route=routeSchema.safeParse(params),{state,controller,language}=useAuth(),{farm}=useWorkspace(),router=useRouter(),t=operationMessages[language],w=workspaceMessages[language];
 const [tab,setTab]=useState<CattleOperationQuery['tab']>(route.success?route.data.tab??'occurrences':'occurrences'),[status,setStatus]=useState<CattleOperationQuery['status']>('all'),[search,setSearch]=useState(typeof params.search==='string'?params.search.slice(0,100):'');
 const reconcile=params.reconcile==='1';const production=route.success?route.data.production:'beef',farmId=route.success?route.data.farm??farm?.id:undefined,manager=state.status==='signedIn'&&canReadManagements(state.session.user),allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user)&&(tab!=='transfers'||manager);
 const base={production,farm:farmId,tab,status:tab==='occurrences'?status:'all' as const,search};
 const list=useInfinitePages<CattleOperation>({queryKey:['cattle-operations','infinite',base,...(reconcile?['reconciliation']:[])],enabled:allowed,fetchPage:(page,signal)=>controller.cattleOperations({...base,page},signal)}),{refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
const hidden=reconcile&&list.isFetching&&!list.isFetchingNextPage,rows=hidden?[]:list.rows;
 const date=(v:string)=>new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${v}T12:00:00Z`));
 const header=<OperationsHeader production={production} farmId={farmId} farmName={farm?.name} reconcile={reconcile} manager={manager} tab={tab} setTab={setTab} status={status} setStatus={setStatus} search={search} setSearch={setSearch}/>;
 return <WorkspaceShell active={production} title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<CattleOperation> contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" data={rows} keyExtractor={row=>row.id} ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=>{const title=item.tab==='occurrences'?item.description:item.tab==='purpose-history'?item.target.identifier:`${item.source.identifier} → ${item.destination.identifier}`;
   return <ListRow meta={`${date(item.date)} · ${item.farm_name}`} title={title} subtitle={item.tab==='purpose-history'?`${cattleLabel(cattleMessages[language],item.previous)} → ${cattleLabel(cattleMessages[language],item.purpose)}`:item.tab==='occurrences'?t.occurrenceKinds[item.kind]:undefined} value={item.tab==='transfers'?new Intl.NumberFormat(language).format(item.quantity):undefined} valueCaption={item.tab==='transfers'?t.quantity:undefined} status={item.tab==='occurrences'?{label:t.statuses[item.status],tone:occTone(item.status)}:undefined} leading={<IconTile tone={item.tab==='occurrences'?occTone(item.status):'brand'}><DairyIcon name={item.tab==='transfers'?'herd':'clipboard'} size={20} color={colors.textSoft}/></IconTile>} accessibilityLabel={`${t.open}: ${title}`} onPress={()=>router.push({pathname:'/cattle/[production]/operation-detail',params:{production,id:item.id,farm:item.farm,tab:item.tab,...(reconcile?{reconcile:'1'}:{})}})}/>;}}
  ListEmptyComponent={list.isPending||hidden?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}
function OperationsHeader({production,farmId,farmName,reconcile,manager,tab,setTab,status,setStatus,search,setSearch}:{production:Production;farmId?:string;farmName?:string;reconcile:boolean;manager:boolean;tab:CattleOperationQuery['tab'];setTab:(v:CattleOperationQuery['tab'])=>void;status:CattleOperationQuery['status'];setStatus:(v:CattleOperationQuery['status'])=>void;search:string;setSearch:(v:string)=>void}){
 const {state,language}=useAuth(),router=useRouter(),t=operationMessages[language];
 const labels={occurrences:t.occurrences,'purpose-history':t.classification,transfers:t.transfers};
 const user=state.status==='signedIn'?state.session.user:null;
 const needFarm=(go:()=>void)=>()=>{if(!farmId){router.push('/farms');return;}go();};
 const action=reconcile||!user?undefined:tab==='occurrences'&&canWriteOccurrence(user)?<HeaderAction label={occurrenceMessages[language].create} onPress={needFarm(()=>router.push({pathname:'/cattle/[production]/occurrence-form',params:{production,farm:farmId!}}))}/>:tab==='purpose-history'&&canCreateWeighing(user)?<HeaderAction label={classificationMessages[language].title} onPress={needFarm(()=>router.push({pathname:'/cattle/[production]/classification',params:{production,farm:farmId!}}))}/>:undefined;
 return <View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={farmName??t.scope} action={action}/>
  {!reconcile&&<View style={ms.wrap}>
   <Shortcut label={protocolMessages[language].title} icon={<DairyIcon name="reproduction" size={18}/>} onPress={()=>router.push({pathname:'/cattle/[production]/protocols',params:{production,...(farmId?{farm:farmId}:{})}})}/>
   {user&&canEnterPasture(user)&&<Shortcut label={importPreviewMessages[language].open} icon={<DairyIcon name="clipboard" size={18}/>} onPress={needFarm(()=>router.push({pathname:'/cattle/[production]/import-preview',params:{production,farm:farmId!}}))}/>}
   {production==='dairy'&&<Shortcut label={tankMessages[language].open} icon={<DairyIcon name="tank" size={18}/>} onPress={()=>router.push('/milk/tanks')}/>}
   {production==='dairy'&&<Shortcut label={milkTrendMessages[language].open} icon={<DairyIcon name="trend" size={18}/>} onPress={()=>router.push({pathname:'/cattle/[production]/milk-trends',params:{production:'dairy',...(farmId?{farm:farmId}:{})}})}/>}
   {user&&canReadCattleCosts(user)&&<Shortcut label={costMessages[language].open} icon={<DairyIcon name="wallet" size={18}/>} onPress={needFarm(()=>router.push({pathname:'/cattle/[production]/costs',params:{production,farm:farmId!}}))}/>}
  </View>}
  <Segmented value={tab} onChange={setTab} options={operationTabs.filter(value=>value!=='transfers'||manager).map(value=>({value,label:labels[value]}))}/>
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
  {tab==='occurrences'&&<FilterChips value={status} onChange={setStatus} options={(['all','open','done'] as const).map(value=>({value,label:value==='all'?t.all:value==='open'?t.pending:t.done}))}/>}
 </View>;
}
export function OperationDetailScreen(){
 const params=useLocalSearchParams(),route=routeSchema.extend({id:z.uuid(),tab:z.enum(operationTabs),farm:z.uuid()}).safeParse(params),{state,controller,language}=useAuth(),router=useRouter(),t=operationMessages[language],w=workspaceMessages[language];
 const reconcile=params.reconcile==='1';const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user)&&(route.data.tab!=='transfers'||canReadManagements(state.session.user));
 const q=useQuery({queryKey:['cattle-operation',params.id,params.tab,params.farm,params.production,...(reconcile?['reconciliation']:[])],gcTime:reconcile?0:undefined,enabled:allowed,staleTime:0,queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.cattleOperation(route.data.id,{production:route.data.production,farm:route.data.farm,tab:route.data.tab,status:'all',search:'',page:1},signal);}}),{refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 return <WorkspaceShell active={route.success?route.data.production:'beef'} title={t.detail} onBack={()=>router.canGoBack()?router.back():router.replace('/')}><ScrollView contentContainerStyle={ms.list}>{!allowed?<EmptyState title={w.noAccess}/>:<>{(q.isPending||reconcile&&q.isFetching)&&<SkeletonList rows={3}/>}{q.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:q.data&&route.success&&!(reconcile&&q.isFetching)&&<Details row={q.data} production={route.data.production} readOnly={reconcile}/>}</>}</ScrollView></WorkspaceShell>;
}
function Details({row,production,readOnly}:{row:CattleOperation;production:Production;readOnly:boolean}){
 const {language,state}=useAuth(),router=useRouter(),t=operationMessages[language],c=cattleMessages[language];
 const date=(v:string|null)=>v?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${v}T12:00:00Z`)):null;
 const targets=row.tab==='transfers'?[[row.source,t.source],[row.destination,t.destination]] as const:row.target?[[row.target,t.target]] as const:[];
 return <>
  <DetailHeader meta={`${date(row.date)} · ${row.farm_name}`} title={row.tab==='occurrences'?row.description:row.tab==='purpose-history'?t.classification:t.transfers} leading={<IconTile tone={row.tab==='occurrences'?occTone(row.status):'brand'}><DairyIcon name={row.tab==='transfers'?'herd':'clipboard'} size={22} color={colors.textSoft}/></IconTile>} status={row.tab==='occurrences'?[{label:t.statuses[row.status],tone:occTone(row.status)}]:[]}>
   {row.tab==='purpose-history'&&<MetricGrid columns={2} items={[{label:t.previous,value:cattleLabel(c,row.previous)},{label:t.purpose,value:cattleLabel(c,row.purpose)}]}/>}
   {row.tab==='transfers'&&<MetricGrid columns={2} items={[{label:t.quantity,value:new Intl.NumberFormat(language).format(row.quantity)}]}/>}
  </DetailHeader>
  {!readOnly&&row.tab==='occurrences'&&row.can_resolve&&state.status==='signedIn'&&canWriteOccurrence(state.session.user)&&<AgendaButton variant="primary" label={occurrenceMessages[language].resolve} onPress={()=>router.push({pathname:'/cattle/[production]/occurrence-resolve',params:{production,id:row.id,farm:row.farm}})}/>}
  <InfoList rows={[[t.author,row.author],...(row.tab==='occurrences'?[[t.target,row.target?.identifier??t.farmArea],[t.assigned,row.assigned_to||'—'],[t.due,date(row.due_date)],[t.resolution,row.resolution||null],[t.resolved,row.resolved_at?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeStyle:'short',timeZone:row.timezone}).format(new Date(row.resolved_at)):null]] as [string,string|null][]:[]),...(row.tab==='transfers'?[[t.reason,row.reason]] as [string,string][]:[])]}/>
  {!!targets.length&&<><SectionLabel title={mobileUiMessages[language].actions}/><ActionGroup>{targets.map(([value,label])=><ActionRow key={value.id} label={`${label}: ${value.identifier}`} description={`${t.currentPurpose}: ${cattleLabel(c,value.purpose)}`} disabled={value.purpose==='unknown'} icon={<DairyIcon name={value.kind==='animals'?'cow':'herd'} size={20}/>} onPress={()=>router.push({pathname:'/cattle/[production]/[id]',params:{production:value.purpose==='dual'?production:value.purpose as Production,id:value.id,kind:value.kind,farm:row.farm}})}/>)}</ActionGroup></>}
 </>;
}
