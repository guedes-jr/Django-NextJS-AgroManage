import {useCallback,useState} from 'react';
import {FlatList,Linking,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {isAxiosError} from 'axios';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,type StatusTone} from '../agenda/ui';
import {HomeIcon} from '../home/HomeIcon';
import {parseApiUrl} from '../../config/environment';
import {colors} from '../../theme/tokens';
import {ActionGroup,ActionRow,BottomSheet,DetailHeader,EmptyState,ErrorState,FilterChips,HeaderAction,IconTile,InfoList,KpiStrip,ListFooter,ListRow,MetricGrid,Notice,PickerModal,ScreenIntro,SearchBar,SectionLabel,Segmented,SheetOption,Shortcut,SkeletonList,WebFallback,mobileStyles as ms,mobileUiMessages} from '../../components/mobile';
import {cropFormMessages} from './formMessages';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {activityDate,activityDetail,activityLabel,canManagePlantations,canReadCrops,canWriteCrops,cropActivityKinds,cropOperationKinds,cropStatuses,type CropOperationKind,type CropActivity,type CropActivityKind,type CropStatus,type Plantation} from './contracts';
import {cropMessages} from './messages';

const denied=(error:unknown)=>isAxiosError(error)&&[401,403,404].includes(error.response?.status??0);
export const cropTone=(status:CropStatus):StatusTone=>status==='finished'?'success':status==='cancelled'?'neutral':status==='harvesting'?'warning':status==='planned'?'info':'success';
const num=(v:string|number|null|undefined,language:string,digits=2)=>v==null||v===''?'—':new Intl.NumberFormat(language,{maximumFractionDigits:digits}).format(Number(v));
const money=(v:string|null|undefined,language:string)=>v==null?'—':new Intl.NumberFormat(language,{style:'currency',currency:'BRL'}).format(Number(v));
const day=(v:string|null|undefined,language:string)=>v?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${v.slice(0,10)}T12:00:00Z`)):null;
async function openCropsWeb(path='/home/plantacoes'){const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site)throw Error('site');await Linking.openURL(new URL(path,site).href);}

type Tab='overview'|'plantations'|'routines';
export function CropsScreen(){
 const params=useLocalSearchParams();
 const {state,language}=useAuth();const t=cropMessages[language],f=cropFormMessages[language],w=workspaceMessages[language];
 const allowed=state.status==='signedIn'&&canReadCrops(state.session.user);
 const [tab,setTab]=useState<Tab>(params.tab==='plantations'||params.tab==='routines'?params.tab:'overview');
 const [status,setStatus]=useState<''|CropStatus>('');
 const tabs=<Segmented value={tab} onChange={setTab} options={[{value:'overview',label:f.overview},{value:'plantations',label:f.plantations},{value:'routines',label:f.routines}]}/>;
 return <WorkspaceShell active="crops" title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:tab==='plantations'?<PlantationList tabs={tabs} status={status} setStatus={setStatus}/>:tab==='routines'?<Routines tabs={tabs}/>:<CropsOverview tabs={tabs} onStatus={value=>{setStatus(value);setTab('plantations');}}/>}</WorkspaceShell>;
}
function CropsOverview({tabs,onStatus}:{tabs:React.ReactElement;onStatus:(status:''|CropStatus)=>void}){
 const {state,controller,language}=useAuth();const {farm}=useWorkspace();const t=cropMessages[language],f=cropFormMessages[language],w=workspaceMessages[language];
 const financial=state.status==='signedIn'&&state.session.user.access.can_view_financial;
 const q=useQuery({queryKey:['crops-dashboard'],queryFn:({signal})=>controller.cropsDashboard(signal)});
 const {refetch}=q;useFocusEffect(useCallback(()=>{void refetch();},[refetch]));
 const [refreshing,setRefreshing]=useState(false);const d=q.data;
 return <ScrollView contentContainerStyle={ms.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await refetch();}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>}>
  <ScreenIntro title={t.title} subtitle={farm?.name??t.subtitle}/>
  {tabs}
  {q.isPending?<SkeletonList rows={2}/>:q.isError||!d?<ErrorState message={denied(q.error)?w.noAccess:w.error} language={language} onRetry={()=>void refetch()}/>:<>
   <KpiStrip items={[{key:'a',label:f.active,value:num(d.total_active,language,0),onPress:()=>onStatus('')},{key:'h',label:f.area,value:`${num(d.total_area_ha,language)} ha`},{key:'u',label:f.upcoming,value:num(d.upcoming_harvests,language,0),tone:d.upcoming_harvests?'warning':undefined,onPress:()=>onStatus('harvesting')}]}/>
   <MetricGrid columns={2} items={[{label:f.production,value:num(d.total_estimated_production_kg,language,0),unit:'kg'},...(financial?[{label:f.investment,value:money(d.total_investment??null,language),tone:'danger' as const},{label:f.revenue,value:money(d.total_estimated_revenue??null,language),tone:'success' as const},{label:f.roi,value:d.avg_roi!=null?`${num(d.avg_roi,language)} %`:'—'}]:[])]}/>
   <SectionLabel title={f.byStatus}/>
   <View style={ms.wrap}>{cropStatuses.filter(st=>d.status_counts[st]).map(st=><Shortcut key={st} label={`${t.statuses[st]??st} · ${d.status_counts[st]}`} onPress={()=>onStatus(st)}/>)}</View>
  </>}
  <SectionLabel title={f.routines}/>
  <RoutineActions/>
 </ScrollView>;
}
function PlantationList({tabs,status,setStatus}:{tabs:React.ReactElement;status:''|CropStatus;setStatus:(v:''|CropStatus)=>void}){
 const {state,controller,language}=useAuth();const {farm}=useWorkspace();const router=useRouter();const t=cropMessages[language],f=cropFormMessages[language],w=workspaceMessages[language];
 const [search,setSearch]=useState('');const [linkFailed,setLinkFailed]=useState(false);
 const writable=state.status==='signedIn'&&canManagePlantations(state.session.user);
 const list=useInfinitePages<Plantation>({queryKey:['crops-plantations','infinite',status,search,farm?.id],enabled:true,fetchPage:(page,signal)=>controller.plantations({status,search,page,...(farm?{farm:farm.id}:{})},signal)});
 const {refetch}=list;useFocusEffect(useCallback(()=>{void refetch();},[refetch]));
 const area=list.rows.reduce((sum,row)=>sum+Number(row.planted_area_ha??0),0);
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={farm?.name??t.subtitle} action={writable?<HeaderAction label={f.newPlantation} onPress={()=>router.push('/crops/form')}/>:undefined}/>
  {tabs}
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
  <FilterChips value={status} onChange={setStatus} options={[{value:'' as const,label:t.all},...cropStatuses.map(value=>({value,label:t.statuses[value]??value}))]}/>
  {list.count!==undefined&&<Text style={{fontSize:12,color:colors.muted}}>{`${list.count} · ${t.area}: ${num(area,language)} ha${list.hasNextPage?'+':''}`}</Text>}
  {list.isError&&!!list.rows.length&&<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>}
 </View>;
 if(denied(list.error))return <View style={ms.list}><EmptyState title={w.noAccess}/></View>;
 return <FlatList<Plantation> data={list.rows} keyExtractor={row=>row.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><ListRow meta={[item.farm_name,item.field_name].filter(Boolean).join(' · ')} title={item.name} subtitle={[item.crop_name,item.variety,item.planting_date?`${t.planting}: ${day(item.planting_date,language)}`:null].filter(Boolean).join(' · ')||undefined} value={item.planted_area_ha!=null?`${num(item.planted_area_ha,language)} ha`:undefined} valueCaption={item.expected_harvest_date?`${t.expectedHarvest}: ${day(item.expected_harvest_date,language)}`:undefined} status={{label:t.statuses[item.status]??item.status,tone:cropTone(item.status)}} leading={<IconTile tone="brand"><HomeIcon name="leaf" size={20} color={colors.primary}/></IconTile>} onPress={()=>router.push({pathname:'/crops/[id]',params:{id:item.id}})}/>}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={<>{!!list.rows.length&&<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>}<WebFallback hint={t.webHint} label={t.web} failed={linkFailed?w.failedLink:undefined} onPress={()=>{setLinkFailed(false);void openCropsWeb().catch(()=>setLinkFailed(true));}}/></>}/>;
}
function Routines({tabs}:{tabs:React.ReactElement}){
 const {language}=useAuth();const t=cropMessages[language],f=cropFormMessages[language];
 return <ScrollView contentContainerStyle={ms.list}><ScreenIntro title={t.title} subtitle={f.chooseOperation}/>{tabs}<RoutineActions/></ScrollView>;
}
const opIcon:Record<CropOperationKind,'leaf'|'box'|'heart'|'trend'|'agenda'|'chart'>={plantings:'leaf',fertilizations:'box',pesticides:'heart',irrigations:'trend','land-preparations':'agenda',harvests:'chart'};
/** Operation launcher: picks the plantation when not in context, then opens the native form. */
export function RoutineActions({plantation}:{plantation?:string}){
 const {state,language}=useAuth();const router=useRouter();const f=cropFormMessages[language];
 const writable=state.status==='signedIn'&&canWriteCrops(state.session.user);
 const [pending,setPending]=useState<CropOperationKind|null>(null);
 if(!writable)return <Notice tone="neutral" text={f.readonly}/>;
 const go=(kind:CropOperationKind,target:string)=>router.push({pathname:'/crops/operation',params:{kind,plantation:target}});
 return <><ActionGroup>{cropOperationKinds.map(kind=><ActionRow key={kind} label={f.ops[kind]??kind} description={f.opsHint[kind]} icon={<HomeIcon name={opIcon[kind]} size={20} color={colors.primary}/>} onPress={()=>plantation?go(kind,plantation):setPending(kind)}/>)}</ActionGroup>
  {pending&&<PlantationPicker onClose={()=>setPending(null)} onSelect={row=>{const kind=pending;setPending(null);go(kind,row.id);}}/>}</>;
}
function PlantationPicker({onSelect,onClose}:{onSelect:(row:Plantation)=>void;onClose:()=>void}){
 const {controller,language}=useAuth();const {farm}=useWorkspace();const t=cropMessages[language],f=cropFormMessages[language],w=workspaceMessages[language];
 const [search,setSearch]=useState('');
 const list=useInfinitePages<Plantation>({queryKey:['crops-plantation-picker','infinite',search,farm?.id],enabled:true,fetchPage:(page,signal)=>controller.plantations({search,page,...(farm?{farm:farm.id}:{})},signal)});
 return <PickerModal<Plantation> title={f.choosePlantation} language={language} onClose={onClose} search={search} onSearch={setSearch} searchPlaceholder={t.search} list={list} keyExtractor={row=>row.id} emptyLabel={t.empty} errorLabel={w.error}
  renderItem={row=>{const closed=row.status==='finished'||row.status==='cancelled';return <ListRow meta={[row.farm_name,row.field_name].filter(Boolean).join(' · ')} title={row.name} subtitle={row.crop_name??undefined} disabled={closed} status={{label:t.statuses[row.status]??row.status,tone:cropTone(row.status)}} leading={<IconTile tone="brand"><HomeIcon name="leaf" size={20} color={colors.primary}/></IconTile>} onPress={()=>onSelect(row)}/>;}}/>;
}

export function CropDetailScreen(){
 const params=useLocalSearchParams();const id=z.uuid().safeParse(params.id);
 const {state,controller,language}=useAuth();const router=useRouter();const t=cropMessages[language],w=workspaceMessages[language];
 const allowed=id.success&&state.status==='signedIn'&&canReadCrops(state.session.user);
 const financial=state.status==='signedIn'&&state.session.user.access.can_view_financial;
 const q=useQuery({queryKey:['crops-plantation-dashboard',params.id],enabled:allowed,queryFn:({signal})=>{if(!id.success)throw Error('id');return controller.plantationDashboard(id.data,signal);}});
 const {refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const [kind,setKind]=useState<CropActivityKind>('plantings');const [refreshing,setRefreshing]=useState(false);const [sheet,setSheet]=useState(false);
 const f=cropFormMessages[language];const writable=state.status==='signedIn'&&canWriteCrops(state.session.user);
 const d=q.data;
 return <WorkspaceShell active="crops" title={t.detail} onBack={()=>router.canGoBack()?router.back():router.replace('/crops')}><ScrollView contentContainerStyle={ms.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await refetch();}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>}>
  {!allowed?<EmptyState title={w.noAccess}/>:q.isPending?<SkeletonList rows={4}/>:q.isError||!d?<ErrorState message={denied(q.error)?w.noAccess:w.error} language={language} onRetry={()=>void refetch()}/>:<>
   <DetailHeader meta={[d.farm_name,d.field_name].filter(Boolean).join(' · ')} title={d.name} leading={<IconTile tone="brand"><HomeIcon name="leaf" size={22} color={colors.primary}/></IconTile>} status={[{label:t.statuses[d.status]??d.status,tone:cropTone(d.status)},...(d.crop_type_display?[{label:d.crop_type_display,tone:'neutral' as const}]:[])]}>
    <MetricGrid items={[{label:t.area,value:num(d.area_ha,language),unit:'ha'},{label:t.cultivationDays,value:num(d.days_in_cultivation,language,0)},{label:t.daysRemaining,value:num(d.days_remaining,language,0),tone:d.days_remaining!=null&&d.days_remaining<0?'warning':undefined}]}/>
   </DetailHeader>
   {writable&&d.status!=='finished'&&d.status!=='cancelled'&&<AgendaButton variant="primary" label={f.record} onPress={()=>setSheet(true)}/>}
   <InfoList rows={[[t.crop,d.crop_name||null],[t.variety,d.variety||null],[t.planting,day(d.planting_date,language)],[t.expectedHarvest,day(d.expected_harvest_date,language)],[t.actualHarvest,day(d.actual_harvest_date,language)],[t.production,d.estimated_production_kg!=null?`${num(d.estimated_production_kg,language)} kg`:null],[t.bags,d.estimated_bags!=null?num(d.estimated_bags,language):null],[t.population,d.population!=null?num(d.population,language,0):null],[t.spacing,d.spacing||null],[t.responsible,d.responsible_name||null]]}/>
   {financial&&d.investment_total!=null&&<><SectionLabel title={t.finance}/>
    <MetricGrid columns={2} items={[{label:t.investment,value:money(d.investment_total,language),tone:'danger'},{label:t.costHa,value:money(d.cost_per_ha,language)},{label:t.revenue,value:money(d.estimated_revenue,language),tone:'success'},{label:t.profit,value:money(d.estimated_profit,language),tone:Number(d.estimated_profit)<0?'danger':'success'},{label:t.roi,value:d.estimated_roi!=null?`${num(d.estimated_roi,language)} %`:'—'},{label:t.realProfit,value:money(d.real_profit,language),tone:Number(d.real_profit)<0?'danger':undefined}]}/>
    <Text style={{fontSize:12,lineHeight:17,color:colors.muted}}>{t.financeHint}</Text></>}
   {writable&&<><SectionLabel title={mobileUiMessages[language].actions}/><ActionGroup><ActionRow label={f.editPlantation} icon={<HomeIcon name="leaf" size={20} color={colors.primary}/>} onPress={()=>router.push({pathname:'/crops/form',params:{id:d.id}})}/></ActionGroup></>}
   <SectionLabel title={t.history}/>
   <FilterChips value={kind} onChange={setKind} options={cropActivityKinds.map(value=>({value,label:t.kinds[value]??value}))}/>
   <ActivityList key={kind} kind={kind} plantation={d.id} financial={financial}/>
   <BottomSheet visible={sheet} title={f.chooseOperation} onClose={()=>setSheet(false)} language={language}><View>{cropOperationKinds.map(kind=><SheetOption key={kind} label={f.ops[kind]??kind} selected={false} onPress={()=>{setSheet(false);router.push({pathname:'/crops/operation',params:{kind,plantation:d.id}});}}/>)}</View></BottomSheet>
  </>}
 </ScrollView></WorkspaceShell>;
}
function ActivityList({kind,plantation,financial}:{kind:CropActivityKind;plantation:string;financial:boolean}){
 const {controller,language}=useAuth();const t=cropMessages[language],w=workspaceMessages[language];
 const list=useInfinitePages<CropActivity>({queryKey:['crops-activities','infinite',kind,plantation],enabled:true,fetchPage:(page,signal)=>controller.cropActivities(kind,plantation,page,signal)});
 if(list.isPending)return <SkeletonList rows={2}/>;
 if(list.isError)return <ErrorState message={denied(list.error)?w.noAccess:w.error} language={language} onRetry={()=>void list.refetch()}/>;
 if(!list.rows.length)return <Notice tone="neutral" text={t.noHistory}/>;
 return <View style={{gap:8}}>{list.rows.map(row=><ListRow key={row.id} meta={day(activityDate(row),language)??undefined} title={activityLabel(row)??t.kinds[kind]??kind} subtitle={activityDetail(row)||undefined} value={row.quantity!=null?`${num(row.quantity,language)}${row.unit?` ${row.unit}`:''}`:undefined} valueCaption={financial&&row.total_price!=null?`${t.cost}: ${money(row.total_price,language)}`:undefined}/>)}
  {list.hasNextPage&&<AgendaButton label={mobileUiMessages[language].more} busy={list.isFetchingNextPage} disabled={list.isFetchingNextPage} onPress={list.loadMore}/>}
 </View>;
}
