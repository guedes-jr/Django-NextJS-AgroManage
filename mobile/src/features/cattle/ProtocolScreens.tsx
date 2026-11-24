import {protocolTemplateMessages} from './protocolTemplateMessages';
import {canEnterPasture} from './grazingEntryContracts';
import {matingMessages} from './matingMessages';
import {protocolSemenMessages} from './protocolSemenMessages';
import {protocolExecutionMessages} from './protocolExecutionMessages';
import {canStartProtocol} from './protocolStartContracts';
import {protocolStartMessages} from './protocolStartMessages';
import {useCallback,useState} from 'react';
import {FlatList,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,StatusPill,type StatusTone} from '../agenda/ui';
import {colors} from '../../theme/tokens';
import {DairyIcon} from './DairyIcon';
import {DetailHeader,EmptyState,ErrorState,HeaderAction,IconTile,InfoList,ListFooter,ListRow,MetricGrid,Notice,ScreenIntro,SearchBar,SectionLabel,Segmented,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {productionSchema,canReadCattle} from './contracts';
import {protocolKinds,type Protocol,type ProtocolRun,type ProtocolQuery} from './protocolContracts';
import {protocolMessages} from './protocolMessages';
const routeSchema=z.object({production:productionSchema,farm:z.uuid().optional()});
const stepTone=(status:string):StatusTone=>status==='done'||status==='completed'||status==='executed'?'success':status==='overdue'||status==='late'?'danger':status==='cancelled'?'neutral':'warning';
export function ProtocolsScreen(){
 const params=useLocalSearchParams(),route=routeSchema.safeParse(params),{state,controller,language}=useAuth(),{farm}=useWorkspace(),router=useRouter(),t=protocolMessages[language],w=workspaceMessages[language];
 const reconcile=params.reconcile==='1';
 const [kind,setKind]=useState<ProtocolQuery['kind']>(params.kind==='protocols'?'protocols':'protocol-runs'),[search,setSearch]=useState(typeof params.search==='string'?params.search.slice(0,100):'');
 const production=route.success?route.data.production:'beef',farmId=route.success?route.data.farm??farm?.id:undefined,allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user);
 const base={kind,production,farm:farmId,search};
 const list=useInfinitePages<Protocol|ProtocolRun>({queryKey:['cattle-protocols','infinite',base,...(reconcile?['reconciliation']:[])],enabled:allowed,fetchPage:(page,signal)=>controller.cattleProtocols({...base,page},signal)}),{refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const hidden=reconcile&&list.isFetching&&!list.isFetchingNextPage,rows=hidden?[]:list.rows;
 const user=state.status==='signedIn'?state.session.user:null;
 const action=reconcile||!user?undefined:kind==='protocols'&&canEnterPasture(user)?<HeaderAction label={protocolTemplateMessages[language].create} onPress={()=>router.push({pathname:'/cattle/[production]/protocol-template',params:{production}})}/>:canStartProtocol(user)?<HeaderAction label={protocolStartMessages[language].title} onPress={()=>{if(!farmId){router.push('/farms');return;}router.push({pathname:'/cattle/[production]/protocol-start',params:{production,farm:farmId}});}}/>:undefined;
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={kind==='protocols'?t.catalogScope:farm?.name??t.readOnly} action={action}/>
  <Segmented value={kind} onChange={setKind} options={protocolKinds.map(value=>({value,label:value==='protocols'?t.catalog:t.runs}))}/>
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
 </View>;
 return <WorkspaceShell active={production} title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<Protocol|ProtocolRun> keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={ms.list} data={rows} keyExtractor={row=>row.id} ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=>'animal' in item?<ListRow meta={`${item.farm_name} · ${t.version} ${item.protocol.version}`} title={`${item.animal.identifier} · ${item.protocol.name}`} value={`${item.completed}/${item.total}`} valueCaption={t.progress} extra={<Progress done={item.completed} total={item.total}/>} leading={<IconTile tone={item.completed>=item.total?'success':'info'}><DairyIcon name="reproduction" size={20} color={colors.textSoft}/></IconTile>} accessibilityLabel={`${t.open}: ${item.animal.identifier}`} onPress={()=>router.push({pathname:'/cattle/[production]/protocol-detail',params:{production,kind,id:item.id,farm:item.farm,...(reconcile?{reconcile:'1'}:{})}})}/>
   :<ListRow meta={`${t.version} ${item.version}`} title={item.name} value={String(item.steps.length)} leading={<IconTile tone="brand"><DairyIcon name="clipboard" size={20}/></IconTile>} accessibilityLabel={`${t.open}: ${item.name}`} onPress={()=>router.push({pathname:'/cattle/[production]/protocol-detail',params:{production,kind,id:item.id,...(reconcile?{reconcile:'1'}:{})}})}/>}
  ListEmptyComponent={list.isPending||hidden?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}
function Progress({done,total}:{done:number;total:number}){const pct=total>0?Math.min(100,Math.round(done/total*100)):0;return <View aria-hidden style={{height:6,borderRadius:3,backgroundColor:colors.track,marginTop:8,overflow:'hidden'}}><View style={{width:`${pct}%`,height:6,borderRadius:3,backgroundColor:pct>=100?colors.success:colors.primary}}/></View>;}
export function ProtocolDetailScreen(){
 const params=useLocalSearchParams(),route=routeSchema.extend({kind:z.enum(protocolKinds),id:z.uuid()}).safeParse(params),{state,controller,language}=useAuth(),router=useRouter(),t=protocolMessages[language],w=workspaceMessages[language],production=route.success?route.data.production:'beef',allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user);
 const reconcile=params.reconcile==='1';
 const q=useQuery({queryKey:['cattle-protocol',params.id,params.kind,params.farm,production,...(reconcile?['reconciliation']:[])],enabled:allowed,staleTime:0,queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.cattleProtocol(route.data.id,{...route.data,search:'',page:1},signal);}}),{refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const d=q.data;
 return <WorkspaceShell active={production} title={t.title} onBack={()=>router.canGoBack()?router.back():router.replace({pathname:'/cattle/[production]/protocols',params:{production}})}><ScrollView contentContainerStyle={ms.list}>{!allowed?<EmptyState title={w.noAccess}/>:q.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:q.isPending||reconcile&&q.isFetching||!d?<SkeletonList rows={4}/>:<ProtocolDetailBody d={d} production={production} reconcile={reconcile}/>}</ScrollView></WorkspaceShell>;
}
type ProtocolDetail=Awaited<ReturnType<ReturnType<typeof useAuth>['controller']['cattleProtocol']>>;
function ProtocolDetailBody({d,production,reconcile}:{d:ProtocolDetail;production:'beef'|'dairy';reconcile:boolean}){
 const {state,language}=useAuth(),router=useRouter(),t=protocolMessages[language];
 const date=(value:string)=>new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
 const exec=!reconcile&&state.status==='signedIn'&&canStartProtocol(state.session.user);
 return 'animal' in d?<>
  <DetailHeader meta={`${d.farm_name} · ${t.version} ${d.protocol.version}`} title={`${d.animal.identifier} · ${d.protocol.name}`} leading={<IconTile tone="info"><DairyIcon name="reproduction" size={22} color={colors.textSoft}/></IconTile>}>
   <MetricGrid columns={2} items={[{label:t.start,value:date(d.start_date)},{label:t.progress,value:`${d.completed}/${d.total}`,tone:d.completed>=d.total?'success':undefined}]}/>
   <Progress done={d.completed} total={d.total}/>
   <Text style={{fontSize:12,lineHeight:17,color:colors.muted}}>{t.snapshot}</Text>
  </DetailHeader>
  <SectionLabel title={t.runs}/>
  {d.steps.map(step=><View key={step.id} style={{gap:8,padding:14,borderRadius:16,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={{width:28,height:28,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft}}><Text style={{fontWeight:'800',color:colors.primary}}>{step.number+1}</Text></View><Text style={{flex:1,fontSize:16,fontWeight:'700',color:colors.forest}}>{step.name}</Text><StatusPill label={t[step.status]} tone={stepTone(step.status)}/></View>
   <InfoList rows={[[t.due,date(step.due_date)],[t.assigned,step.assigned_to||null],[t.executed,step.executed_date?date(step.executed_date):null],[t.author,step.executed_by||null],[t.notes,step.notes||null],[t.mating,step.mating?`${matingMessages[language][step.mating.kind]} · ${date(step.mating.date)}`:null],[t.stock,step.stock?`${step.stock.name} · ${step.stock.number} · ${step.stock.quantity} ${step.stock.unit}`:null]]}/>
   {exec&&step.can_execute_documentary&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}><AgendaButton style={{flexGrow:1}} label={protocolExecutionMessages[language].title} accessibilityLabel={`${protocolExecutionMessages[language].title}: ${step.name}`} onPress={()=>router.push({pathname:'/cattle/[production]/protocol-execution',params:{production,farm:d.farm,step:step.id}})}/><AgendaButton style={{flexGrow:1}} label={protocolSemenMessages[language].title} accessibilityLabel={`${protocolSemenMessages[language].title}: ${step.name}`} onPress={()=>router.push({pathname:'/cattle/[production]/protocol-semen',params:{production,farm:d.farm,step:step.id}})}/></View>}
  </View>)}
  <Notice tone="neutral" text={t.readOnly}/>
 </>:<>
  <DetailHeader meta={`${t.version} ${d.version}`} title={d.name} leading={<IconTile tone="brand"><DairyIcon name="clipboard" size={22}/></IconTile>}/>
  {!reconcile&&state.status==='signedIn'&&canEnterPasture(state.session.user)&&<AgendaButton label={protocolTemplateMessages[language].newVersion} onPress={()=>router.push({pathname:'/cattle/[production]/protocol-template',params:{production,source:d.id}})}/>}
  <InfoList rows={d.steps.map((step,index)=>[`${index+1}. ${step.name}`,`${t.relative}: ${step.day}`] as [string,string])}/>
  <Notice tone="neutral" text={t.catalogScope}/>
 </>;
}
