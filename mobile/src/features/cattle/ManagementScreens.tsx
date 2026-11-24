import {collectiveMedicationMaintenanceMessages} from './collectiveMedicationMaintenanceMessages';
import {collectiveMedicationConfirmationMessages} from './collectiveMedicationConfirmationMessages';
import {collectiveMedicationMessages} from './collectiveMedicationMessages';
import {sanitaryMaintenanceMessages} from './sanitaryMaintenanceMessages';
import {sanitaryConfirmationMessages} from './sanitaryConfirmationMessages';
import {sanitaryMessages} from './sanitaryMessages';
import {followUpMessages} from './followUpMessages';
import {castrationMaintenanceMessages} from './castrationMaintenanceMessages';
import {castrationConfirmationMessages} from './castrationConfirmationMessages';
import {castrationMessages} from './castrationMessages';
import {weighingMaintenanceMessages} from './weighingMaintenanceMessages';
import {weighingConfirmationMessages} from './weighingConfirmationMessages';
import {canCreateWeighing} from './weighingContracts';
import {weighingMessages} from './weighingMessages';
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
import {ActionGroup,ActionRow,BottomSheet,DetailHeader,EmptyState,ErrorState,FilterChips,HeaderAction,IconTile,InfoList,ListFooter,ListRow,MetricGrid,Notice,ScreenIntro,SearchBar,SectionLabel,SelectChip,SheetOption,SkeletonList,mobileStyles as ms,mobileUiMessages} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {productionSchema} from './contracts';
import {cattleMessages,cattleLabel} from './messages';
import {managementMessages} from './managementMessages';
import {canReadManagements,managementKinds,managementStatuses,type Management,type ManagementParticipant,type ManagementQuery} from './managementContracts';
const routeSchema=z.object({production:productionSchema,farm:z.uuid().optional()});
const statusTone=(status:string):StatusTone=>status==='confirmed'?'success':status==='cancelled'?'danger':status==='draft'?'warning':'neutral';
export function ManagementsScreen(){
 const params=useLocalSearchParams(),route=routeSchema.safeParse(params),{state,controller,language}=useAuth(),{farm}=useWorkspace(),router=useRouter(),t=managementMessages[language],w=workspaceMessages[language],u=mobileUiMessages[language];const reconcile=params.reconcile==='1';const production=route.success?route.data.production:'beef',farmId=route.success?route.data.farm??farm?.id:undefined,allowed=route.success&&state.status==='signedIn'&&canReadManagements(state.session.user);
 const [kind,setKind]=useState<ManagementQuery['kind']>('all'),[status,setStatus]=useState<ManagementQuery['status']>('all'),[search,setSearch]=useState(typeof params.search==='string'?params.search.slice(0,100):''),[sheet,setSheet]=useState<'create'|'status'|null>(null);
 const base={production,farm:farmId,kind,status,search};
 const list=useInfinitePages<Management>({queryKey:['cattle-managements','infinite',base,...(reconcile?['reconciliation']:[])],enabled:allowed,fetchPage:(page,signal)=>controller.managements({...base,page},signal)});const {refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const date=(v:string)=>new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${v}T12:00:00Z`));
 const hidden=reconcile&&list.isFetching&&!list.isFetchingNextPage,rows=hidden?[]:list.rows;
 const creator=!reconcile&&state.status==='signedIn'&&canCreateWeighing(state.session.user);
 const go=(pathname:'/cattle/[production]/collective-medication-form'|'/cattle/[production]/sanitary-form'|'/cattle/[production]/castration-form'|'/cattle/[production]/weighing-form')=>{setSheet(null);if(!farmId){router.push('/farms');return;}router.push({pathname,params:{production,farm:farmId}});};
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={farm?.name} action={creator?<HeaderAction label={u.newRecord} onPress={()=>setSheet('create')}/>:undefined}/>
  {creator&&!farmId&&<Notice text={weighingMessages[language].chooseFarm}/>}
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
  <FilterChips value={kind} onChange={setKind} options={[{value:'all' as const,label:t.all},...managementKinds.map(value=>({value,label:t.kinds[value]}))]} trailing={<SelectChip label={t.allStatuses} value={status==='all'?undefined:t.statuses[status]} active={status!=='all'} onPress={()=>setSheet('status')}/>}/>
  {list.count!==undefined&&!hidden&&<Text style={{fontSize:12,color:colors.muted}}>{`${list.count} · ${t.scope}`}</Text>}
 </View>;
 return <WorkspaceShell active={production} title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<>
  <FlatList<Management> contentContainerStyle={ms.list} data={rows} keyExtractor={row=>row.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
   refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
   renderItem={({item})=><ListRow meta={`${date(item.date)} · ${t.kinds[item.kind]}`} title={item.description} subtitle={item.farm_name} value={new Intl.NumberFormat(language).format(item.participant_count)} valueCaption={`${t.segment}: ${new Intl.NumberFormat(language).format(item.segment_count)}`} status={{label:t.statuses[item.status],tone:statusTone(item.status)}} leading={<IconTile tone={statusTone(item.status)}><DairyIcon name="clipboard" size={20} color={colors.textSoft}/></IconTile>} accessibilityLabel={`${t.open}: ${item.description}`} onPress={()=>router.push({pathname:'/cattle/[production]/management-detail',params:{production,id:item.id,farm:item.farm,...(reconcile?{reconcile:'1'}:{})}})}/>}
   ListEmptyComponent={list.isPending||hidden?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
   ListFooterComponent={rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>
  <BottomSheet visible={sheet==='create'} title={u.newRecord} onClose={()=>setSheet(null)} language={language}><ActionGroup>
   <ActionRow label={weighingMessages[language].create} icon={<DairyIcon name="trend" size={20}/>} onPress={()=>go('/cattle/[production]/weighing-form')}/>
   <ActionRow label={sanitaryMessages[language].create} icon={<DairyIcon name="clipboard" size={20}/>} onPress={()=>go('/cattle/[production]/sanitary-form')}/>
   <ActionRow label={collectiveMedicationMessages[language].create} icon={<DairyIcon name="heart" size={20}/>} onPress={()=>go('/cattle/[production]/collective-medication-form')}/>
   <ActionRow label={castrationMessages[language].create} icon={<DairyIcon name="bull" size={20}/>} onPress={()=>go('/cattle/[production]/castration-form')}/>
  </ActionGroup></BottomSheet>
  <BottomSheet visible={sheet==='status'} title={t.allStatuses} onClose={()=>setSheet(null)} language={language}>
   <SheetOption label={t.allStatuses} selected={status==='all'} onPress={()=>{setStatus('all');setSheet(null);}}/>
   {managementStatuses.map(value=><SheetOption key={value} label={t.statuses[value]} selected={status===value} onPress={()=>{setStatus(value);setSheet(null);}}/>)}
  </BottomSheet>
 </>}</WorkspaceShell>;
}
const detailRoute=routeSchema.extend({id:z.uuid(),farm:z.uuid()});
export function ManagementDetailScreen(){
 const params=useLocalSearchParams(),route=detailRoute.safeParse(params),{state,controller,language}=useAuth(),router=useRouter(),t=managementMessages[language],w=workspaceMessages[language];const allowed=route.success&&state.status==='signedIn'&&canReadManagements(state.session.user),reconcile=params.reconcile==='1';
 const q=useQuery({queryKey:['cattle-management',params.production,params.id,params.farm,...(reconcile?['reconciliation']:[])],enabled:allowed,staleTime:0,refetchOnMount:'always',queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.management(route.data.id,{production:route.data.production,farm:route.data.farm,kind:'all',status:'all',search:'',page:1},signal);}});const {refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));const item=q.isError||reconcile&&q.isFetching?undefined:q.data;
 return <WorkspaceShell active={route.success?route.data.production:'beef'} title={t.detail} onBack={()=>router.canGoBack()?router.back():route.success?router.replace({pathname:'/cattle/[production]/managements',params:{production:route.data.production,farm:route.data.farm}}):router.replace('/')}><ScrollView contentContainerStyle={ms.list}>{!allowed?<EmptyState title={w.noAccess}/>:<>{(q.isPending||reconcile&&q.isFetching)&&<SkeletonList rows={3}/>}{q.isError&&<ErrorState message={t.unavailable} language={language} onRetry={()=>void refetch()}/>}{item&&route.success&&<ManagementDetailBody item={item} production={route.data.production} reconcile={reconcile}/>}</>}</ScrollView></WorkspaceShell>;
}
type ManagementDetail=Awaited<ReturnType<ReturnType<typeof useAuth>['controller']['management']>>;
function ManagementDetailBody({item,production,reconcile}:{item:ManagementDetail;production:'beef'|'dairy';reconcile:boolean}){
 const {state,language}=useAuth(),router=useRouter(),t=managementMessages[language];
 const date=(v:string|null)=>v?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${v}T12:00:00Z`)):null;const instant=(v:string|null)=>v?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeStyle:'short',timeZone:item.timezone??'UTC'}).format(new Date(v)):null;
 const can=!reconcile&&state.status==='signedIn'&&canCreateWeighing(state.session.user);
 type Act={key:string;label:string;path:'/cattle/[production]/management-follow-up'|'/cattle/[production]/collective-medication-form'|'/cattle/[production]/collective-medication-cancel'|'/cattle/[production]/collective-medication-confirmation'|'/cattle/[production]/sanitary-form'|'/cattle/[production]/sanitary-cancel'|'/cattle/[production]/sanitary-confirmation'|'/cattle/[production]/castration-form'|'/cattle/[production]/castration-cancel'|'/cattle/[production]/castration-confirmation'|'/cattle/[production]/weighing-form'|'/cattle/[production]/weighing-cancel'|'/cattle/[production]/weighing-confirmation';danger?:boolean};
 const acts=():{primary?:Act;others:Act[]}=>{
  if(!can)return {others:[]};
  if(item.kind==='sanitary'&&item.status==='confirmed'&&item.next_procedure_date&&item.follow_up_status==='pending')return {primary:{key:'follow',label:followUpMessages[language].title,path:'/cattle/[production]/management-follow-up'},others:[]};
  if(item.status!=='draft')return {others:[]};
  if(item.kind==='sanitary'&&item.treatment_type==='medication')return {primary:{key:'review',label:collectiveMedicationConfirmationMessages[language].review,path:'/cattle/[production]/collective-medication-confirmation'},others:[{key:'edit',label:collectiveMedicationMaintenanceMessages[language].edit,path:'/cattle/[production]/collective-medication-form'},{key:'cancel',label:collectiveMedicationMaintenanceMessages[language].cancel,path:'/cattle/[production]/collective-medication-cancel',danger:true}]};
  if(item.kind==='sanitary'&&['exam','surgery','other'].includes(item.treatment_type))return {primary:{key:'review',label:sanitaryConfirmationMessages[language].review,path:'/cattle/[production]/sanitary-confirmation'},others:[{key:'edit',label:sanitaryMaintenanceMessages[language].edit,path:'/cattle/[production]/sanitary-form'},{key:'cancel',label:sanitaryMaintenanceMessages[language].cancel,path:'/cattle/[production]/sanitary-cancel',danger:true}]};
  if(item.kind==='castration')return {primary:{key:'review',label:castrationConfirmationMessages[language].review,path:'/cattle/[production]/castration-confirmation'},others:[{key:'edit',label:castrationMaintenanceMessages[language].edit,path:'/cattle/[production]/castration-form'},{key:'cancel',label:castrationMaintenanceMessages[language].cancel,path:'/cattle/[production]/castration-cancel',danger:true}]};
  if(item.kind==='weighing')return {primary:{key:'review',label:weighingConfirmationMessages[language].review,path:'/cattle/[production]/weighing-confirmation'},others:[{key:'edit',label:weighingMaintenanceMessages[language].edit,path:'/cattle/[production]/weighing-form'},{key:'cancel',label:weighingMaintenanceMessages[language].cancel,path:'/cattle/[production]/weighing-cancel',danger:true}]};
  return {others:[]};
 };
 const {primary,others}=acts();
 const open=(a:Act)=>{router.push({pathname:a.path,params:{production,id:item.id,farm:item.farm}});};
 return <>
  <DetailHeader meta={`${date(item.date)} · ${item.farm_name}`} title={item.description} leading={<IconTile tone={statusTone(item.status)}><DairyIcon name="clipboard" size={22} color={colors.textSoft}/></IconTile>} status={[{label:t.kinds[item.kind],tone:'neutral'},{label:t.statuses[item.status],tone:statusTone(item.status)},...(item.next_procedure_date?[{label:`${t.followUp}: ${t.followStatuses[item.follow_up_status]}`,tone:item.follow_up_status==='pending'?'warning' as const:'neutral' as const}]:[])]}>
   <MetricGrid columns={2} items={[{label:t.total,value:new Intl.NumberFormat(language).format(item.participant_count)},{label:t.segment,value:new Intl.NumberFormat(language).format(item.segment_count)}]}/>
   {(item.milk_withdrawal_until||item.meat_withdrawal_until)&&<Notice tone="warning" text={[item.milk_withdrawal_until?`${t.milk}: ${date(item.milk_withdrawal_until)}`:null,item.meat_withdrawal_until?`${t.meat}: ${date(item.meat_withdrawal_until)}`:null].filter(Boolean).join(' · ')}/>}
  </DetailHeader>
  {primary&&<AgendaButton variant="primary" label={primary.label} onPress={()=>open(primary)}/>}
  <InfoList rows={[[t.responsible,item.responsible||null],[t.treatment,item.kind==='sanitary'?(item.treatment_type in t.treatments?t.treatments[item.treatment_type as keyof typeof t.treatments]:item.treatment_type):null],[t.confirmedAt,instant(item.confirmed_at)],[t.reason,item.cancellation_reason||null],[t.next,date(item.next_procedure_date)],[t.followNote,item.follow_up_note||null],[t.resolvedAt,instant(item.follow_up_resolved_at)],[t.notes,item.notes||null]]}/>
  <SectionLabel title={mobileUiMessages[language].actions}/>
  <ActionGroup>
   <ActionRow label={t.participants} icon={<DairyIcon name="herd" size={20}/>} onPress={()=>router.push({pathname:'/cattle/[production]/management-participants',params:{production:production,id:item.id,farm:item.farm}})}/>
   {others.map(a=><ActionRow key={a.key} label={a.label} tone={a.danger?'danger':'brand'} icon={<DairyIcon name="clipboard" size={20} color={a.danger?colors.error:colors.primary}/>} onPress={()=>open(a)}/>)}
  </ActionGroup>
  <Notice tone="neutral" text={t.scope}/>
 </>;
}
export function ManagementParticipantsScreen(){
 const params=useLocalSearchParams(),route=detailRoute.safeParse(params),{state,controller,language}=useAuth(),router=useRouter(),t=managementMessages[language],w=workspaceMessages[language],c=cattleMessages[language];const allowed=route.success&&state.status==='signedIn'&&canReadManagements(state.session.user);const [search,setSearch]=useState('');
 const list=useInfinitePages<ManagementParticipant>({queryKey:['cattle-management-participants','infinite',params.production,params.id,params.farm,search],enabled:allowed,fetchPage:(page,signal)=>{if(!route.success)throw Error('route');return controller.managementParticipants(route.data.id,{production:route.data.production,farm:route.data.farm,kind:'all',status:'all',search:'',page:1},route.data.farm,page,search,signal);}});const {refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 return <WorkspaceShell active={route.success?route.data.production:'beef'} title={t.total} onBack={()=>router.canGoBack()?router.back():route.success?router.replace({pathname:'/cattle/[production]/management-detail',params:route.data}):router.replace('/')}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<ManagementParticipant> contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" data={list.isError?[]:list.rows} keyExtractor={row=>row.id}
  ListHeaderComponent={<View style={ms.header}><ScreenIntro title={t.total} subtitle={list.count!==undefined?`${list.count} · ${t.scope}`:t.scope}/><SearchBar value={search} onChange={setSearch} placeholder={t.participantSearch} language={language}/></View>}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><ListRow title={item.identifier} subtitle={`${cattleLabel(c,item.cattle_purpose)} · ${cattleLabel(c,item.status)}`} value={item.weight_kg===null?undefined:`${new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(item.weight_kg))} kg`} valueCaption={item.weight_kg===null?t.noWeight:t.weight} leading={<IconTile tone="brand"><DairyIcon name="cow" size={20}/></IconTile>} accessibilityLabel={`${t.animal}: ${item.identifier}`} onPress={route.success&&item.cattle_purpose!=='unknown'?()=>router.push({pathname:'/cattle/[production]/[id]',params:{production:item.cattle_purpose==='dual'?route.data.production:item.cattle_purpose,id:item.animal,farm:item.farm,kind:'animals'}}):undefined}/>}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={t.unavailable} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.noParticipants}/>}
  ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}
