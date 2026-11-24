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
import {type StatusTone} from '../agenda/ui';
import {HomeIcon} from '../home/HomeIcon';
import {parseApiUrl} from '../../config/environment';
import {colors} from '../../theme/tokens';
import {DetailHeader,EmptyState,ErrorState,FilterChips,IconTile,InfoList,ListFooter,ListRow,MetricGrid,Notice,ScreenIntro,SearchBar,SectionLabel,SkeletonList,WebFallback,mobileStyles as ms} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {canReadStructures,structureCategories,type FarmStructure,type StructureCategory} from './contracts';
import {structureMessages} from './messages';

const denied=(error:unknown)=>isAxiosError(error)&&[401,403,404].includes(error.response?.status??0);
const maintenanceTone=(s:FarmStructure['maintenance_status']):StatusTone=>s==='overdue'?'danger':s==='due_soon'?'warning':s==='scheduled'?'info':'neutral';
const num=(v:string|number|null|undefined,language:string)=>v==null?null:new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(v));
const money=(v:string|undefined,language:string)=>v==null?'—':new Intl.NumberFormat(language,{style:'currency',currency:'BRL'}).format(Number(v));
const day=(v:string|null,language:string)=>v?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${v}T12:00:00Z`)):null;
async function openWeb(){const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site)throw Error('site');await Linking.openURL(new URL('/home/estrutura',site).href);}

export function StructuresScreen(){
 const {state,controller,language}=useAuth();const {farm}=useWorkspace();const router=useRouter();const t=structureMessages[language],w=workspaceMessages[language];
 const allowed=state.status==='signedIn'&&canReadStructures(state.session.user);
 const [category,setCategory]=useState<''|StructureCategory>('');const [search,setSearch]=useState('');const [linkFailed,setLinkFailed]=useState(false);
 const list=useInfinitePages<FarmStructure>({queryKey:['farm-structures','infinite',category,search,farm?.id],enabled:allowed,fetchPage:(page,signal)=>controller.farmStructures({category,search,page,...(farm?{farm:farm.id}:{})},signal)});
 const {refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={farm?.name??t.subtitle}/>
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
  <FilterChips value={category} onChange={setCategory} options={[{value:'' as const,label:t.all},...structureCategories.map(value=>({value,label:t.categories[value]??value}))]}/>
  {list.count!==undefined&&<Text style={{fontSize:12,color:colors.muted}}>{String(list.count)}</Text>}
 </View>;
 return <WorkspaceShell active="structure" title={t.title}>{!allowed||denied(list.error)?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<FarmStructure> data={list.rows} keyExtractor={row=>row.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><ListRow meta={`${t.categories[item.category]??item.category_label} · ${item.farm_name}`} title={item.name} subtitle={item.built_area_m2?`${t.area}: ${num(item.built_area_m2,language)} m²`:item.description||undefined} value={item.quantity>1?`×${item.quantity}`:undefined} status={item.maintenance_status!=='not_scheduled'?{label:t.maintenance[item.maintenance_status]??item.maintenance_status,tone:maintenanceTone(item.maintenance_status)}:undefined} leading={<IconTile tone="brand"><HomeIcon name="home" size={20} color={colors.primary}/></IconTile>} onPress={()=>router.push({pathname:'/structures/[id]',params:{id:item.id}})}/>}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={<>{!!list.rows.length&&<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>}<WebFallback hint={t.webHint} label={t.web} failed={linkFailed?w.failedLink:undefined} onPress={()=>{setLinkFailed(false);void openWeb().catch(()=>setLinkFailed(true));}}/></>}/>}</WorkspaceShell>;
}

export function StructureDetailScreen(){
 const params=useLocalSearchParams();const id=z.uuid().safeParse(params.id);
 const {state,controller,language}=useAuth();const router=useRouter();const t=structureMessages[language],w=workspaceMessages[language];
 const allowed=id.success&&state.status==='signedIn'&&canReadStructures(state.session.user);
 const financial=state.status==='signedIn'&&state.session.user.access.can_view_financial;
 const q=useQuery({queryKey:['farm-structure',params.id],enabled:allowed,queryFn:({signal})=>{if(!id.success)throw Error('id');return controller.farmStructure(id.data,signal);}});
 const {refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const [refreshing,setRefreshing]=useState(false);const [linkFailed,setLinkFailed]=useState(false);
 const d=q.data;
 return <WorkspaceShell active="structure" title={t.detail} onBack={()=>router.canGoBack()?router.back():router.replace('/structures')}><ScrollView contentContainerStyle={ms.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await refetch();}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>}>
  {!allowed?<EmptyState title={w.noAccess}/>:q.isPending?<SkeletonList rows={3}/>:q.isError||!d?<ErrorState message={denied(q.error)?w.noAccess:w.error} language={language} onRetry={()=>void refetch()}/>:<>
   <DetailHeader meta={`${t.categories[d.category]??d.category_label} · ${d.farm_name}`} title={d.name} leading={<IconTile tone="brand"><HomeIcon name="home" size={22} color={colors.primary}/></IconTile>} status={[{label:t.maintenance[d.maintenance_status]??d.maintenance_status,tone:maintenanceTone(d.maintenance_status)}]}>
    <MetricGrid items={[{label:t.quantity,value:String(d.quantity)},{label:t.area,value:num(d.built_area_m2,language)??'—',unit:d.built_area_m2?'m²':undefined},{label:t.nextMaintenance,value:day(d.next_maintenance_date,language)??'—',tone:maintenanceTone(d.maintenance_status)==='danger'?'danger':undefined}]}/>
    {!!d.description&&<Text style={{fontSize:15,lineHeight:22,color:colors.textSoft}}>{d.description}</Text>}
   </DetailHeader>
   <InfoList rows={[[t.length,d.length_m?`${num(d.length_m,language)} m`:null],[t.width,d.width_m?`${num(d.width_m,language)} m`:null],[t.acquired,day(d.acquisition_date,language)],[t.lastMaintenance,day(d.last_maintenance_date,language)],[t.maintenanceNotes,d.maintenance_notes||null],[t.notes,d.notes||null]]}/>
   {financial&&d.acquisition_value!=null&&<MetricGrid columns={2} items={[{label:t.acquisitionValue,value:money(d.acquisition_value,language)},{label:t.currentValue,value:money(d.current_value,language)}]}/>}
   <SectionLabel title={t.items}/>
   {d.items.length?<InfoList rows={d.items.map(item=>[item.name,`${num(item.quantity,language)} ${item.unit}${financial&&item.value!=null?` · ${money(item.value,language)}`:''}`] as [string,string])}/>:<Notice tone="neutral" text={t.noItems}/>}
   <WebFallback hint={t.webHint} label={t.web} failed={linkFailed?w.failedLink:undefined} onPress={()=>{setLinkFailed(false);void openWeb().catch(()=>setLinkFailed(true));}}/>
  </>}
 </ScrollView></WorkspaceShell>;
}
