import {canWriteTankRecord} from './tankWriteContracts';
import {tankWriteMessages} from './tankWriteMessages';
import {useCallback,useState} from 'react';
import {FlatList,RefreshControl,ScrollView,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {DairyIcon} from '../cattle/DairyIcon';
import {colors} from '../../theme/tokens';
import {DayFilter,DetailHeader,EmptyState,ErrorState,HeaderAction,IconTile,InfoList,ListFooter,ListRow,MetricGrid,Notice,ScreenIntro,SectionLabel,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {canReadCattle} from '../cattle/contracts';
import {tankQualityQuerySchema,type TankQuality} from './tankQualityContracts';
import {tankQualityMessages} from './tankQualityMessages';
const scopeSchema=z.object({tank:z.uuid(),farm:z.uuid()});
export function TankQualityListScreen(){
 const router=useRouter(),params=useLocalSearchParams(),route=scopeSchema.safeParse(params),{state,controller,language}=useAuth(),t=tankQualityMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user),tank=route.success?route.data.tank:'',farm=route.success?route.data.farm:'';
 const [date,setDate]=useState('');
 const valid=tankQualityQuerySchema.safeParse({tank,farm,date,page:1}).success;
 const meta=useQuery({queryKey:['milk-tank',tank,farm],enabled:allowed,staleTime:0,queryFn:({signal})=>controller.milkTank(tank,farm,signal)});
 const list=useInfinitePages<TankQuality>({queryKey:['milk-tank-quality-list','infinite',tank,farm,date],enabled:allowed&&valid,fetchPage:(page,signal)=>controller.milkTankQualities({tank,farm,date,page},signal)}),{refetch}=list;
 useFocusEffect(useCallback(()=>{if(allowed&&valid)void refetch();},[allowed,valid,refetch]));
 const writable=params.reconcile!=='1'&&!!meta.data?.is_active&&state.status==='signedIn'&&canWriteTankRecord(state.session.user,'quality');
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={meta.data?`${meta.data.name} · ${meta.data.farm_name}`:undefined} action={writable?<HeaderAction label={tankWriteMessages[language].quality} onPress={()=>router.push({pathname:'/milk/tank-record-form',params:{mode:'quality',tank,farm,...(date?{date}:{})}})}/>:undefined}/>
  <DayFilter value={date} onChange={setDate} language={language} allLabel={t.allDates}/>
  <Notice tone="neutral" text={t.note}/>
  {list.count!==undefined&&<SectionLabel title={`${t.records} · ${list.count}`}/>}
 </View>;
 return <WorkspaceShell active="milk" title={t.title} onBack={()=>router.canGoBack()?router.back():route.success?router.replace({pathname:'/milk/tank',params:{id:tank,farm}}):router.replace('/milk/tanks')}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<TankQuality> contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" data={list.rows} keyExtractor={row=>row.id} ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><ListRow meta={new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${item.date}T12:00:00Z`))} title={item.sample||t.missing} subtitle={[item.fat_percent!==null?`${t.fat}: ${item.fat_percent}%`:null,item.protein_percent!==null?`${t.protein}: ${item.protein_percent}%`:null].filter(Boolean).join(' · ')||undefined} status={{label:`${t.antibiotics}: ${t[item.antibiotics]}`,tone:item.antibiotics==='positive'?'danger':item.antibiotics==='negative'?'success':'neutral'}} leading={<IconTile tone={item.antibiotics==='positive'?'danger':'info'}><DairyIcon name="clipboard" size={20} color={colors.textSoft}/></IconTile>} accessibilityLabel={`${t.view}: ${item.sample||item.date}`} onPress={()=>router.push({pathname:'/milk/tank-quality',params:{id:item.id,tank,farm,...(params.reconcile==='1'?{reconcile:'1'}:{})}})}/>}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}
export function TankQualityDetailScreen(){
 const router=useRouter(),params=useLocalSearchParams(),route=scopeSchema.extend({id:z.uuid()}).safeParse(params),{state,controller,language}=useAuth(),t=tankQualityMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user),id=route.success?route.data.id:'',tank=route.success?route.data.tank:'',farm=route.success?route.data.farm:'';
 const q=useQuery({queryKey:['milk-tank-quality',id,tank,farm],enabled:allowed,staleTime:0,queryFn:({signal})=>controller.milkTankQuality(id,tank,farm,signal)}),{refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const row=!q.isError&&!q.isFetching?q.data:undefined;
 const number=(value:string|null)=>value===null?t.missing:new Intl.NumberFormat(language,{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value));
 const count=(value:number|null)=>value===null?t.missing:new Intl.NumberFormat(language).format(value);
 return <WorkspaceShell active="milk" title={t.detail} onBack={()=>router.canGoBack()?router.back():route.success?router.replace({pathname:'/milk/tank-qualities',params:{tank,farm,...(params.reconcile==='1'?{reconcile:'1'}:{})}}):router.replace('/milk/tanks')}><ScrollView contentContainerStyle={ms.list}>{!allowed?<EmptyState title={w.noAccess}/>:q.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:!row?<SkeletonList rows={3}/>:<>
  <DetailHeader meta={`${row.tank_name} · ${row.farm_name} · ${new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${row.date}T12:00:00Z`))}`} title={`${t.sample}: ${row.sample||t.missing}`} leading={<IconTile tone={row.antibiotics==='positive'?'danger':'info'}><DairyIcon name="clipboard" size={22} color={colors.textSoft}/></IconTile>} status={[{label:`${t.antibiotics}: ${t[row.antibiotics]}`,tone:row.antibiotics==='positive'?'danger':row.antibiotics==='negative'?'success':'neutral'}]}>
   <MetricGrid items={[{label:t.temperature,value:number(row.temperature_c),unit:row.temperature_c===null?undefined:'°C'},{label:t.fat,value:number(row.fat_percent),unit:row.fat_percent===null?undefined:'%'},{label:t.protein,value:number(row.protein_percent),unit:row.protein_percent===null?undefined:'%'},{label:t.scc,value:count(row.scc),unit:row.scc===null?undefined:t.cells},{label:t.tbc,value:count(row.tbc),unit:row.tbc===null?undefined:t.cfu}]}/>
  </DetailHeader>
  <InfoList rows={[[t.author,row.recorded_by||t.missing],[t.notes,row.notes||null]]}/>
  <Notice tone="neutral" text={t.note}/>
 </>}</ScrollView></WorkspaceShell>;
}
