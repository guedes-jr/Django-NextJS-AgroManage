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
import {type StatusTone} from '../agenda/ui';
import {DairyIcon} from '../cattle/DairyIcon';
import {colors} from '../../theme/tokens';
import {ActionGroup,ActionRow,DayFilter,DetailHeader,EmptyState,ErrorState,FilterChips,HeaderAction,IconTile,InfoList,ListFooter,ListRow,MetricGrid,Notice,ScreenIntro,SectionLabel,SkeletonList,mobileStyles as ms,mobileUiMessages} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {canReadCattle} from '../cattle/contracts';
import {formatMilkVolume} from '../cattle/milkTrendContracts';
import {tankMovementQuerySchema,tankMovementKinds,type TankMovement,type TankMovementQuery} from './tankMovementContracts';
import {tankMovementMessages} from './tankMovementMessages';
const scopeSchema=z.object({tank:z.uuid(),farm:z.uuid()});
export function TankMovementListScreen(){
 const router=useRouter(),params=useLocalSearchParams(),route=scopeSchema.safeParse(params),{state,controller,language}=useAuth(),t=tankMovementMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user),tank=route.success?route.data.tank:'',farm=route.success?route.data.farm:'';
 const [kind,setKind]=useState<TankMovementQuery['kind']>('all'),[date,setDate]=useState('');
 const valid=tankMovementQuerySchema.safeParse({tank,farm,kind,date,page:1}).success;
 const meta=useQuery({queryKey:['milk-tank',tank,farm],enabled:allowed,staleTime:0,queryFn:({signal})=>controller.milkTank(tank,farm,signal)});
 const list=useInfinitePages<TankMovement>({queryKey:['milk-tank-movements','infinite',tank,farm,kind,date],enabled:allowed&&valid,fetchPage:(page,signal)=>controller.milkTankMovements({tank,farm,kind,date,page},signal)}),{refetch}=list;
 useFocusEffect(useCallback(()=>{if(allowed&&valid)void refetch();},[allowed,valid,refetch]));
 const writable=params.reconcile!=='1'&&!!meta.data?.is_active&&state.status==='signedIn'&&canWriteTankRecord(state.session.user,'movement');
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={meta.data?`${meta.data.name} · ${meta.data.farm_name}`:undefined} action={writable?<HeaderAction label={tankWriteMessages[language].movement} onPress={()=>router.push({pathname:'/milk/tank-record-form',params:{mode:'movement',tank,farm,...(date?{date}:{})}})}/>:undefined}/>
  <FilterChips label={t.filters} value={kind} onChange={setKind} options={(['all',...tankMovementKinds] as const).map(value=>({value,label:t[value]}))}/>
  <DayFilter value={date} onChange={setDate} language={language} allLabel={t.allDates}/>
  <Notice tone="neutral" text={t.note}/>
  {list.count!==undefined&&<SectionLabel title={`${t.records} · ${list.count}`}/>}
 </View>;
 return <WorkspaceShell active="milk" title={t.title} onBack={()=>router.canGoBack()?router.back():route.success?router.replace({pathname:'/milk/tank',params:{id:tank,farm}}):router.replace('/milk/tanks')}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<TankMovement> contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" data={list.rows} keyExtractor={row=>row.id} ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><MovementRow row={item} onPress={()=>router.push({pathname:'/milk/tank-movement',params:{id:item.id,tank,farm,...(params.reconcile==='1'?{reconcile:'1'}:{})}})}/>}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}
const kindTone=(row:TankMovement):StatusTone=>row.cancelled_at?'neutral':row.kind==='production'?'success':row.kind==='discard'?'danger':'info';
function MovementRow({row,onPress}:{row:TankMovement;onPress:()=>void}){
 const {language}=useAuth(),t=tankMovementMessages[language];
 return <ListRow meta={new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${row.date}T12:00:00Z`))} title={t[row.kind]} value={`${formatMilkVolume(row.liters,language)} L`} status={{label:row.cancelled_at?t.cancelled:t.confirmed,tone:row.cancelled_at?'danger':'success'}} leading={<IconTile tone={kindTone(row)}><DairyIcon name="tank" size={20} color={colors.textSoft}/></IconTile>} accessibilityLabel={`${t.view}: ${t[row.kind]} · ${row.date}`} onPress={onPress}/>;
}
export function TankMovementDetailScreen(){
 const router=useRouter(),params=useLocalSearchParams(),route=scopeSchema.extend({id:z.uuid()}).safeParse(params),{state,controller,language}=useAuth(),t=tankMovementMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user),id=route.success?route.data.id:'',tank=route.success?route.data.tank:'',farm=route.success?route.data.farm:'';
 const q=useQuery({queryKey:['milk-tank-movement',id,tank,farm],enabled:allowed,staleTime:0,queryFn:({signal})=>controller.milkTankMovement(id,tank,farm,signal)}),{refetch}=q;
 useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const row=!q.isError&&!q.isFetching?q.data:undefined;
 return <WorkspaceShell active="milk" title={t.detail} onBack={()=>router.canGoBack()?router.back():route.success?router.replace({pathname:'/milk/tank-movements',params:{tank,farm,...(params.reconcile==='1'?{reconcile:'1'}:{})}}):router.replace('/milk/tanks')}><ScrollView contentContainerStyle={ms.list}>{!allowed?<EmptyState title={w.noAccess}/>:q.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:!row?<SkeletonList rows={3}/>:<>
  <DetailHeader meta={`${row.tank_name} · ${row.farm_name}`} title={t[row.kind]} leading={<IconTile tone={kindTone(row)}><DairyIcon name="tank" size={22} color={colors.textSoft}/></IconTile>} status={[{label:row.cancelled_at?t.cancelled:t.confirmed,tone:row.cancelled_at?'danger':'success'}]}>
   <MetricGrid columns={2} items={[{label:t.volume,value:formatMilkVolume(row.liters,language),unit:'L'},{label:t.date.replace(/\s*\(.*\)$/,''),value:new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${row.date}T12:00:00Z`))}]}/>
  </DetailHeader>
  {row.cancelled_at&&<><SectionLabel title={t.cancelled}/><InfoList rows={[[t.cancelDate,new Intl.DateTimeFormat(language,{dateStyle:'medium',timeStyle:'short',timeZone:row.timezone}).format(new Date(row.cancelled_at))+` (${row.timezone})`],[t.cancelReason,row.cancellation_reason]]}/></>}
  <SectionLabel title={t.information}/>
  <InfoList rows={[[t.author,row.recorded_by],[t.buyer,row.buyer],[t.driver,row.driver],[t.vehicle,row.vehicle],[t.document,row.document],[t.reason,row.reason],[t.notes,row.notes]]}/>
  {params.reconcile!=='1'&&!row.cancelled_at&&state.status==='signedIn'&&canWriteTankRecord(state.session.user,'cancel')&&<><SectionLabel title={mobileUiMessages[language].actions}/><ActionGroup><ActionRow tone="danger" label={tankWriteMessages[language].cancel} icon={<DairyIcon name="tank" size={20} color={colors.error}/>} onPress={()=>router.push({pathname:'/milk/tank-record-form',params:{mode:'cancel',id:row.id,tank,farm}})}/></ActionGroup></>}
  <Notice tone="neutral" text={t.note}/>
 </>}</ScrollView></WorkspaceShell>;
}
