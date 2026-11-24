import {birthMessages} from './birthMessages';
import {matingMessages} from './matingMessages';
import {diagnosisMessages} from './diagnosisMessages';
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
import {ActionGroup,ActionRow,DetailHeader,EmptyState,ErrorState,FilterChips,IconTile,InfoList,KpiStrip,ListFooter,ListRow,MetricGrid,ScreenIntro,SearchBar,SectionLabel,SkeletonList,mobileStyles as ms,mobileUiMessages} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import { AgendaShell } from '../workspace/AppShell';
import {canReadCattle,canCreateCattle,productionSchema} from './contracts';
import {cattleMessages,cattleLabel} from './messages';
import {AnimalHistory} from './CattleScreens';
import {reproductionMessages} from './reproductionMessages';
import type {ReproductionQuery,ReproductionAnimal} from './reproductionContracts';
const reproTone=(status:string):StatusTone=>status==='gestante'?'success':status==='coberta'?'info':status==='vazia'?'warning':'neutral';
type ReproductionPage=Awaited<ReturnType<ReturnType<typeof useAuth>['controller']['reproductionPage']>>;
export function ReproductionScreen(){
 const params=useLocalSearchParams(),route=z.object({production:productionSchema,farm:z.uuid().optional()}).safeParse(params);
 const {state,controller,language}=useAuth(),{farm}=useWorkspace(),router=useRouter(),t=reproductionMessages[language],c=cattleMessages[language],w=workspaceMessages[language];
 const production=route.success?route.data.production:'beef',farmId=route.success?route.data.farm??farm?.id:undefined;const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user);
 const [group,setGroup]=useState<ReproductionQuery['group']>('all'),[search,setSearch]=useState('');
 const base={production,farm:farmId,group,search};
 const list=useInfinitePages<ReproductionAnimal>({queryKey:['cattle-reproduction','infinite',base],enabled:allowed,fetchPage:(page,signal)=>controller.reproductionPage({...base,page},signal)});const {refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const first=list.data?.pages[0] as ReproductionPage|undefined;
 const n=(v:number)=>new Intl.NumberFormat(language).format(v);
 const date=(value:string|null)=>value?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`)):t.noDate;
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={farm?.name??t.scope}/>
  {first&&<KpiStrip items={[{key:'f',label:t.females,value:n(first.summary.females),selected:group==='all',onPress:()=>setGroup('all')},...first.groups.slice(0,2).map(value=>({key:value,label:t.groups[value]??value,value:n(first.summary[value]),selected:group===value,onPress:()=>setGroup(group===value?'all':value)}))]}/>}
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
  {first&&<FilterChips value={group} onChange={setGroup} options={[{value:'all' as const,label:t.all},...first.groups.map(value=>({value,label:t.groups[value]??value,count:first.summary[value]}))]}/>}
 </View>;
 return <WorkspaceShell active={production} title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<ReproductionAnimal> contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" data={list.isError?[]:list.rows} keyExtractor={row=>row.id} ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><ListRow meta={item.farm_name} title={item.identifier} subtitle={[cattleLabel(c,item.category),item.expected_birth_date?`${t.birth}: ${date(item.expected_birth_date)}`:null].filter(Boolean).join(' · ')} status={{label:cattleLabel(c,item.reproductive_status),tone:reproTone(item.reproductive_status)}} leading={<IconTile tone={reproTone(item.reproductive_status)}><DairyIcon name="reproduction" size={20} color={colors.textSoft}/></IconTile>} accessibilityLabel={`${t.detail}: ${item.identifier}`} onPress={()=>router.push({pathname:'/cattle/[production]/reproduction-detail',params:{production,id:item.id,farm:item.farm}})}/>}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}
export function ReproductionDetailScreen(){
 const params=useLocalSearchParams(),route=z.object({production:productionSchema,id:z.uuid(),farm:z.uuid().optional()}).safeParse(params);
 const {state,controller,language}=useAuth(),router=useRouter(),t=reproductionMessages[language],c=cattleMessages[language],w=workspaceMessages[language];const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user);
 const q=useQuery({queryKey:['cattle-reproduction-detail',params.production,params.id,params.farm],enabled:allowed,queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.reproductionAnimal(route.data.id,{production:route.data.production,farm:route.data.farm,group:'all',page:1,search:''},signal);}});const {refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const back=()=>router.canGoBack()?router.back():route.success?router.replace({pathname:'/cattle/[production]/reproduction',params:{production:route.data.production,...(route.data.farm?{farm:route.data.farm}:{})}}):router.replace('/');
 const date=(v:string|null)=>v?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${v}T12:00:00Z`)):t.noDate;
 const writer=state.status==='signedIn'&&canCreateCattle(state.session.user);
 const d=q.data;
 const primary=!d||!route.success||!writer||d.gender!=='F'?null:d.reproductive_status==='gestante'?{label:birthMessages[language].title,path:'/cattle/[production]/birth' as const}:d.reproductive_status==='coberta'?{label:diagnosisMessages[language].title,path:'/cattle/[production]/diagnosis' as const}:{label:matingMessages[language].title,path:'/cattle/[production]/mating' as const};
 return <WorkspaceShell active={route.success?route.data.production:'beef'} title={t.detail} onBack={back}><ScrollView contentContainerStyle={ms.list}>{!allowed?<EmptyState title={w.noAccess}/>:q.isPending?<SkeletonList rows={3}/>:q.isError||!d?<ErrorState message={t.unavailable} language={language} onRetry={()=>void refetch()}/>:<>
  <DetailHeader meta={`${d.farm_name} · ${cattleLabel(c,d.category)} · ${cattleLabel(c,d.gender)}`} title={d.identifier} leading={<IconTile tone={reproTone(d.reproductive_status)}><DairyIcon name="reproduction" size={22} color={colors.textSoft}/></IconTile>} status={[{label:cattleLabel(c,d.reproductive_status),tone:reproTone(d.reproductive_status)},{label:d.is_lactating?t.lactating:t.notLactating,tone:d.is_lactating?'info':'neutral'}]}>
   <MetricGrid items={[{label:t.mating,value:date(d.last_mating_date)},{label:t.pregnancy,value:date(d.pregnancy_start_date)},{label:t.birth,value:date(d.expected_birth_date)}]}/>
   <Text style={{fontSize:12,lineHeight:17,color:colors.muted}}>{t.estimate}</Text>
  </DetailHeader>
  {primary&&route.success&&<AgendaButton variant="primary" label={primary.label} onPress={()=>router.push({pathname:primary.path,params:{production:route.data.production,id:d.id,farm:d.farm}})}/>}
  {!!d.notes&&<InfoList rows={[[cattleMessages[language].notes,d.notes]]}/>}
  {route.success&&<><SectionLabel title={mobileUiMessages[language].actions}/><ActionGroup><ActionRow label={t.animal} icon={<DairyIcon name="cow" size={20}/>} onPress={()=>router.push({pathname:'/cattle/[production]/[id]',params:{production:route.data.production,kind:'animals',id:d.id,farm:d.farm}})}/></ActionGroup>
  <AnimalHistory id={d.id} production={route.data.production} farm={d.farm}/></>}
 </>}</ScrollView></WorkspaceShell>;
}

export function ReproductionHistoryScreen(){const params=useLocalSearchParams(),route=z.object({production:productionSchema,id:z.uuid(),farm:z.uuid()}).safeParse(params);const {state,language}=useAuth(),router=useRouter(),w=workspaceMessages[language],t=diagnosisMessages[language];const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user);return <AgendaShell title={t.check} backLabel={w.back} onBack={()=>router.canGoBack()?router.back():router.replace('/')}><ScrollView contentContainerStyle={ms.list}>{allowed?<AnimalHistory id={route.data.id} production={route.data.production} farm={route.data.farm} reconcile/>:<EmptyState title={w.noAccess}/>}</ScrollView></AgendaShell>;}
