import {isAxiosError} from 'axios';
import {useCallback,useState} from 'react';
import {FlatList,RefreshControl,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,styles as ui} from '../agenda/ui';
import {colors} from '../../theme/tokens';
import {DairyIcon} from './DairyIcon';
import {DateStepper,EmptyState,ErrorState,IconTile,InfoList,KpiStrip,ListFooter,ListRow,Notice,PickerModal,ScreenIntro,SectionLabel,Segmented,SelectChip,Shortcut,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {productionSchema} from './contracts';
import {cattleMessages,cattleLabel} from './messages';
import {canReadCattleCosts,costQuerySchema,costSources,formatCost,type CostOptions,type CostBatch,type CostQuery,type CostReport} from './costContracts';
import {costMessages} from './costMessages';
function errorText(error:unknown,fallback:string){if(!isAxiosError(error)||error.response?.status!==400)return fallback;const flat=(v:unknown):string[]=>typeof v==='string'?[v]:Array.isArray(v)?v.flatMap(flat):v&&typeof v==='object'?Object.values(v).flatMap(flat):[];return flat(error.response.data?.error?.detail??error.response.data).join(' ').slice(0,800)||fallback;}
export function CostScreen(){
 const params=useLocalSearchParams(),route=z.object({production:productionSchema,farm:z.uuid().optional()}).safeParse(params),{state,controller,language}=useAuth(),{farm}=useWorkspace(),router=useRouter(),w=workspaceMessages[language],t=costMessages[language],production=route.success?route.data.production:'beef',farmId=route.success?route.data.farm??farm?.id:undefined,allowed=route.success&&state.status==='signedIn'&&canReadCattleCosts(state.session.user);
 const q=useQuery({queryKey:['cattle-cost-options',farmId,production],enabled:allowed&&!!farmId,staleTime:0,queryFn:({signal})=>{if(!farmId)throw Error('farm');return controller.cattleCostOptions(farmId,production,signal);}}),{refetch}=q;useFocusEffect(useCallback(()=>{if(allowed&&farmId)void refetch();},[allowed,farmId,refetch]));
 return <WorkspaceShell active={production} title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:!farmId?<View style={ms.list}><EmptyState title={w.farms} action={<AgendaButton label={w.farms} onPress={()=>router.push('/farms')}/>}/></View>:q.isError?<View style={ms.list}><ErrorState message={errorText(q.error,w.error)} language={language} onRetry={()=>void refetch()}/></View>:q.isPending?<View style={ms.list}><SkeletonList rows={3}/></View>:<Report key={`${farmId}:${production}`} options={q.data}/>}</WorkspaceShell>;
}
type CostRow=CostReport['results'][number];
function Report({options}:{options:CostOptions}){
 const {controller,language}=useAuth(),w=workspaceMessages[language],t=costMessages[language],c=cattleMessages[language];
 const [start,setStart]=useState(options.start),[end,setEnd]=useState(options.end),[batch,setBatch]=useState<CostBatch>(),[picker,setPicker]=useState(false),[tab,setTab]=useState<CostQuery['tab']>('operations');
 const base={production:options.production,farm:options.farm.id,start,end,batch:batch?.id,tab};
 const valid=costQuerySchema.safeParse({...base,page:1}).success&&end<=options.today;
 const list=useInfinitePages<CostRow>({queryKey:['cattle-costs','infinite',base],enabled:valid,fetchPage:async(page,signal)=>{const data=await controller.cattleCosts({...base,page},signal);return {...data,next:data.next?String(page+1):null};}});
 const {refetch}=list;useFocusEffect(useCallback(()=>{if(valid)void refetch();},[valid,refetch]));
 const data=list.data?.pages[0] as CostReport|undefined;
 const date=(value:string)=>new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`)),money=(value:string)=>formatCost(value,language);
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={`${options.farm.name} · ${cattleLabel(c,options.production)}`}/>
  <View style={{gap:8}}><Text style={ui.label}>{t.start}</Text><DateStepper value={start} max={end} onChange={setStart} language={language}/><Text style={ui.label}>{t.end}</Text><DateStepper value={end} min={start} max={options.today} onChange={setEnd} language={language}/></View>
  <View style={ms.wrap}><SelectChip label={t.all} value={batch?.identifier} active={!!batch} onPress={()=>setPicker(true)}/>{batch&&<Shortcut label={t.all} onPress={()=>setBatch(undefined)}/>}</View>
  {!valid&&<Notice tone="danger" text={t.invalid}/>}
  {list.isPending&&valid?<SkeletonList rows={2}/>:list.isError?<ErrorState message={errorText(list.error,w.error)} language={language} onRetry={()=>void refetch()}/>:data&&<>
   <KpiStrip items={[{key:'k',label:t.known,value:money(data.operational_total)},{key:'e',label:t.expenses,value:money(data.expenses_by_due_date)},{key:'m',label:t.missing,value:String(data.missing_cost_count),tone:data.missing_cost_count?'warning':undefined}]}/>
   <SectionLabel title={t.sources}/>
   <InfoList rows={costSources.map(source=>[t[source],`${money(data.totals[source])}${data.missing_by_source[source]>0?` · ${t.missing}: ${data.missing_by_source[source]}`:''}`] as [string,string])}/>
   <Text style={{fontSize:12,lineHeight:17,color:colors.muted}}>{`${t.note} ${t.allocation}`}</Text>
  </>}
  <Segmented value={tab} onChange={setTab} options={[{value:'operations',label:t.operations},{value:'expenses',label:t.expenseTab}]}/>
 </View>;
 return <><FlatList<CostRow> contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" data={list.rows} keyExtractor={row=>row.id} ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><ListRow meta={`${date(item.date)} · ${'source' in item?t[item.source]:t[item.status]}`} title={item.description} subtitle={item.reference?`${t.reference}: ${item.reference}`:undefined} value={item.amount===null?t.unknown:money(item.amount)} status={item.amount===null?{label:t.missing,tone:'warning'}:undefined}/>}
  ListEmptyComponent={data&&!list.rows.length?<EmptyState title={t.empty}/>:undefined}
  ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>
  {picker&&<BatchPicker options={options} onClose={()=>setPicker(false)} onSelect={row=>{setBatch(row);setPicker(false);}}/>}</>;
}
function BatchPicker({options,onClose,onSelect}:{options:CostOptions;onClose:()=>void;onSelect:(row:CostBatch)=>void}){
 const {controller,language}=useAuth(),t=costMessages[language],w=workspaceMessages[language],[search,setSearch]=useState('');
 const list=useInfinitePages<CostBatch>({queryKey:['cattle-cost-batches','infinite',options.farm.id,options.production,search],enabled:true,fetchPage:(page,signal)=>controller.cattleCostBatches(options.farm.id,options.production,page,search,signal) as Promise<{results:CostBatch[];next:string|null}>});
 return <PickerModal<CostBatch> title={t.choose} language={language} onClose={onClose} search={search} onSearch={setSearch} searchPlaceholder={t.search} list={list} keyExtractor={row=>row.id} emptyLabel={t.noBatch} errorLabel={w.error}
  renderItem={item=><ListRow title={item.identifier} leading={<IconTile tone="brand"><DairyIcon name="herd" size={20}/></IconTile>} accessibilityLabel={`${t.select}: ${item.identifier}`} onPress={()=>onSelect(item)}/>}/>;
}
