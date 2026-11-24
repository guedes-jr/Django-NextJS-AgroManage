import {canWriteTankRecord} from './tankWriteContracts';
import {tankWriteMessages} from './tankWriteMessages';
import {canManageTank} from './tankFormContracts';
import {tankFormMessages} from './tankFormMessages';
import {tankQualityMessages} from './tankQualityMessages';
import {tankMovementMessages} from './tankMovementMessages';
import {useCallback,useState} from 'react';
import {FlatList,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,StatusPill,styles as s} from '../agenda/ui';
import {HomeIcon} from '../home/HomeIcon';
import {DairyIcon} from '../cattle/DairyIcon';
import {colors} from '../../theme/tokens';
import {ActionGroup,ActionRow,DetailHeader,EmptyState,ErrorState,FilterChips,HeaderAction,IconTile,ListFooter,ListRow,MetricGrid,Notice,ScreenIntro,SectionLabel,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {canReadCattle} from '../cattle/contracts';
import {formatMilkVolume,milkCents} from '../cattle/milkTrendContracts';
import {tankMessages} from './tankMessages';
import type {MilkTank,TankQuery} from './tankContracts';
export function TankListScreen(){
 const {state,controller,language}=useAuth(),{farm}=useWorkspace(),router=useRouter(),t=tankMessages[language],w=workspaceMessages[language];
 const allowed=state.status==='signedIn'&&canReadCattle(state.session.user),[status,setStatus]=useState<TankQuery['status']>('active');
 const list=useInfinitePages<MilkTank>({queryKey:['milk-tanks','infinite',farm?.id,status],enabled:allowed,fetchPage:(page,signal)=>controller.milkTanks({farm:farm?.id,status,page},signal)}),{refetch}=list;
 useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const manager=state.status==='signedIn'&&canManageTank(state.session.user),readOnly=state.status==='signedIn'&&state.session.user.access.read_only;
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={farm?.name} badge={readOnly?<View style={{marginTop:6}}><StatusPill label={t.readonlyAccess} tone="neutral"/></View>:undefined} action={manager?<HeaderAction label={tankFormMessages[language].create} onPress={()=>{if(!farm){router.push('/farms');return;}router.push({pathname:'/milk/tank-form',params:{mode:'create',farm:farm.id}});}}/>:undefined}/>
  {manager&&!farm&&<Notice text={t.selectFarm}/>}
  <FilterChips label={t.filter} value={status} onChange={setStatus} options={(['active','inactive','all'] as const).map(value=>({value,label:t[value]}))}/>
  <Notice text={t.readOnly} tone="neutral"/>
  {list.count!==undefined&&<SectionLabel title={`${t.storage} · ${list.count}`}/>}
 </View>;
 return <WorkspaceShell active="milk" title={t.title} onBack={()=>router.canGoBack()?router.back():router.replace('/milk')}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<MilkTank> contentContainerStyle={ms.list} data={list.rows} keyExtractor={row=>row.id} ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><TankRow tank={item} onPress={()=>router.push({pathname:'/milk/tank',params:{id:item.id,farm:item.farm}})}/>}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}
function TankRow({tank,onPress}:{tank:MilkTank;onPress:()=>void}){
 const {language}=useAuth(),t=tankMessages[language];
 const over=milkCents(tank.balance_liters)>milkCents(tank.capacity_liters);
 const pct=Number(tank.capacity_liters)>0?Math.min(100,Math.round(Number(tank.balance_liters)/Number(tank.capacity_liters)*100)):0;
 return <ListRow meta={tank.farm_name} title={tank.name} value={`${formatMilkVolume(tank.balance_liters,language)} L`} valueCaption={`${t.capacity}: ${formatMilkVolume(tank.capacity_liters,language)} L`} status={over?{label:t.warning,tone:'danger'}:{label:tank.is_active?t.enabled:t.disabled,tone:tank.is_active?'success':'neutral'}} leading={<IconTile tone={over?'danger':'brand'}><DairyIcon name="tank" size={20} color={over?colors.error:colors.primary}/></IconTile>} extra={<FillBar percent={pct} danger={over}/>} onPress={onPress}/>;
}
function FillBar({percent,danger}:{percent:number;danger:boolean}){
 return <View aria-hidden style={{height:6,borderRadius:3,backgroundColor:colors.track,marginTop:8,overflow:'hidden'}}><View style={{width:`${percent}%`,height:6,borderRadius:3,backgroundColor:danger?colors.error:colors.primary}}/></View>;
}
export function TankDetailScreen(){
 const router=useRouter(),params=useLocalSearchParams(),route=z.object({id:z.uuid(),farm:z.uuid()}).safeParse(params),{state,controller,language}=useAuth(),t=tankMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user),id=route.success?route.data.id:'',farm=route.success?route.data.farm:'';
 const q=useQuery({queryKey:['milk-tank',id,farm],enabled:allowed,staleTime:0,queryFn:({signal})=>controller.milkTank(id,farm,signal)}),{refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const [refreshing,setRefreshing]=useState(false);
 const tank=q.data;
 const over=tank?milkCents(tank.balance_liters)>milkCents(tank.capacity_liters):false;
 return <WorkspaceShell active="milk" title={t.detail} onBack={()=>router.canGoBack()?router.back():router.replace('/milk/tanks')}><ScrollView contentContainerStyle={ms.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await refetch();}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>}>
  {!allowed?<EmptyState title={w.noAccess}/>:q.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:!tank?<SkeletonList rows={3}/>:<>
   <DetailHeader meta={tank.farm_name} title={tank.name} leading={<IconTile tone="brand"><DairyIcon name="tank" size={22}/></IconTile>} status={[{label:tank.is_active?t.enabled:t.disabled,tone:tank.is_active?'success':'neutral'},...(state.status==='signedIn'&&state.session.user.access.read_only?[{label:t.readonlyAccess,tone:'neutral' as const}]:[])]}>
    <MetricGrid columns={2} items={[{label:t.balance,value:formatMilkVolume(tank.balance_liters,language),unit:'L',tone:over?'danger':undefined},{label:t.capacity,value:formatMilkVolume(tank.capacity_liters,language),unit:'L'}]}/>
    <FillBar percent={Number(tank.capacity_liters)>0?Math.min(100,Math.round(Number(tank.balance_liters)/Number(tank.capacity_liters)*100)):0} danger={over}/>
    {over&&<Notice text={t.warning} tone="danger"/>}
   </DetailHeader>
   <TankRecordActions tank={id} farm={farm} active={tank.is_active}/>
   <SectionLabel title={t.actions}/>
   <ActionGroup>
    <ActionRow label={tankMovementMessages[language].open} icon={<HomeIcon name="trend" size={20} color={colors.primary}/>} onPress={()=>router.push({pathname:'/milk/tank-movements',params:{tank:id,farm}})}/>
    <ActionRow label={tankQualityMessages[language].open} icon={<DairyIcon name="clipboard" size={20}/>} onPress={()=>router.push({pathname:'/milk/tank-qualities',params:{tank:id,farm}})}/>
    {state.status==='signedIn'&&canManageTank(state.session.user)&&<ActionRow label={tankFormMessages[language].edit} icon={<DairyIcon name="tank" size={20}/>} onPress={()=>router.push({pathname:'/milk/tank-form',params:{mode:'edit',id,farm}})}/>}
   </ActionGroup>
   {!!tank.notes&&<><SectionLabel title={t.notes}/><View style={s.card}><Text style={s.body} selectable>{tank.notes}</Text></View></>}
   <Notice text={t.readOnly} tone="neutral"/>
  </>}
 </ScrollView></WorkspaceShell>;
}

function TankRecordActions({tank,farm,active}:{tank:string;farm:string;active:boolean}){
 const {state,language}=useAuth(),router=useRouter();
 if(!active||state.status!=='signedIn'||!canWriteTankRecord(state.session.user,'movement'))return null;
 return <View style={[s.row,{flexWrap:'nowrap'}]}>{(['movement','quality'] as const).map((mode,i)=><AgendaButton key={mode} style={{flex:1}} variant={i===0?'primary':'secondary'} label={tankWriteMessages[language][mode]} onPress={()=>router.push({pathname:'/milk/tank-record-form',params:{mode,tank,farm}})}/>)}</View>;
}
