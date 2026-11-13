import {canWriteTankRecord} from './tankWriteContracts';
import {tankWriteMessages} from './tankWriteMessages';
import {canManageTank} from './tankFormContracts';
import {tankFormMessages} from './tankFormMessages';
import {tankQualityMessages} from './tankQualityMessages';
import {tankMovementMessages} from './tankMovementMessages';
import {useCallback,useState} from 'react';
import {FlatList,ScrollView,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {FarmContextButton} from '../workspace/FarmContextButton';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,Busy,styles as s} from '../agenda/ui';
import {canReadCattle} from '../cattle/contracts';
import {formatMilkVolume,milkCents} from '../cattle/milkTrendContracts';
import {tankMessages} from './tankMessages';
import type {MilkTank,TankQuery} from './tankContracts';
export function TankListScreen(){
 const {state,controller,language}=useAuth(),{farm}=useWorkspace(),router=useRouter(),t=tankMessages[language],w=workspaceMessages[language];
 const allowed=state.status==='signedIn'&&canReadCattle(state.session.user),[status,setStatus]=useState<TankQuery['status']>('active'),[paging,setPaging]=useState({scope:'',page:1}),scope=`${farm?.id??'all'}:${status}`,page=paging.scope===scope?paging.page:1;
 const q=useQuery({queryKey:['milk-tanks',farm?.id,status,page],enabled:allowed,staleTime:0,queryFn:({signal})=>controller.milkTanks({farm:farm?.id,status,page},signal)}),{refetch}=q;
 useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const data=!q.isError&&!q.isFetching?q.data:undefined;
 return <WorkspaceShell active="milk" title={t.title} onBack={()=>router.canGoBack()?router.back():router.replace('/milk')}>{!allowed?<View style={s.content}><Text style={s.error}>{w.noAccess}</Text></View>:<FlatList<MilkTank> contentContainerStyle={s.content} data={data?.results??[]} keyExtractor={row=>row.id}
  ListHeaderComponent={<View style={{gap:12}}>
   <View style={s.card}><Text style={s.title}>{t.context}</Text><FarmContextButton/>
    <Text style={s.label}>{t.filter}</Text><View style={s.row}>{(['all','active','inactive'] as const).map(value=><AgendaButton key={value} label={t[value]} selected={status===value} onPress={()=>setStatus(value)}/>)}</View>
    {state.status==='signedIn'&&state.session.user.access.read_only&&<Text style={s.badge}>{t.readonlyAccess}</Text>}
   </View>
   <Text style={s.muted}>{t.readOnly}</Text>
   <View style={s.row}><Text style={[s.title,{flex:1}]}>{t.storage}{data?` (${data.count})`:''}</Text><AgendaButton label={t.refresh} disabled={q.isFetching} onPress={()=>void refetch()}/></View>
   {state.status==='signedIn'&&canManageTank(state.session.user)&&<><AgendaButton label={tankFormMessages[language].create} disabled={!farm||q.isFetching||q.isError} onPress={()=>{if(farm)router.push({pathname:'/milk/tank-form',params:{mode:'create',farm:farm.id}});}}/>{!farm&&<Text style={s.muted}>{t.selectFarm}</Text>}</>}
   {q.isFetching&&<Busy label={w.loading}/>}{q.isError&&<><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refetch()}/>{page>1&&<AgendaButton label={`${w.page} 1`} onPress={()=>setPaging({scope,page:1})}/>}</>}
  </View>}
  renderItem={({item})=><View style={s.card}><TankData tank={item}/><AgendaButton label={`${t.view}: ${item.name}`} onPress={()=>router.push({pathname:'/milk/tank',params:{id:item.id,farm:item.farm}})}/></View>}
  ListEmptyComponent={data&&!data.count?<Text style={s.body}>{t.empty}</Text>:undefined}
  ListFooterComponent={data?<View style={s.row}><AgendaButton label={w.previous} disabled={!data.previous} onPress={()=>setPaging({scope,page:page-1})}/><Text style={s.body}>{w.page} {page}</Text><AgendaButton label={w.next} disabled={!data.next||page>=100000} onPress={()=>setPaging({scope,page:page+1})}/></View>:undefined}/>}</WorkspaceShell>;
}
export function TankDetailScreen(){
 const router=useRouter(),params=useLocalSearchParams(),route=z.object({id:z.uuid(),farm:z.uuid()}).safeParse(params),{state,controller,language}=useAuth(),t=tankMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user),id=route.success?route.data.id:'',farm=route.success?route.data.farm:'';
 const [notesVisible,setNotesVisible]=useState(false);
 const q=useQuery({queryKey:['milk-tank',id,farm],enabled:allowed,staleTime:0,queryFn:({signal})=>controller.milkTank(id,farm,signal)}),{refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 return <WorkspaceShell active="milk" title={t.detail} onBack={()=>router.canGoBack()?router.back():router.replace('/milk/tanks')}><ScrollView contentContainerStyle={s.content}>
  {!allowed?<Text style={s.error}>{w.noAccess}</Text>:q.isError?<><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refetch()}/></>:q.isFetching||!q.data?<Busy label={w.loading}/>:<>
   <View style={s.card}><TankData tank={q.data} detail/>{state.status==='signedIn'&&state.session.user.access.read_only&&<Text style={s.badge}>{t.readonlyAccess}</Text>}</View>
   <Text style={s.muted}>{t.readOnly}</Text>
   <Text style={s.title}>{t.actions}</Text>
   <TankRecordActions tank={id} farm={farm} active={q.data.is_active}/>
   <AgendaButton label={tankMovementMessages[language].open} onPress={()=>router.push({pathname:'/milk/tank-movements',params:{tank:id,farm}})}/>
   <AgendaButton label={tankQualityMessages[language].open} onPress={()=>router.push({pathname:'/milk/tank-qualities',params:{tank:id,farm}})}/>
   {state.status==='signedIn'&&canManageTank(state.session.user)&&<AgendaButton label={tankFormMessages[language].edit} onPress={()=>router.push({pathname:'/milk/tank-form',params:{mode:'edit',id,farm}})}/>}
   {!!q.data.notes&&<View style={s.card}><AgendaButton label={t.notes} selected={notesVisible} onPress={()=>setNotesVisible(value=>!value)}/>{notesVisible&&<Text style={s.body} selectable>{q.data.notes}</Text>}</View>}
   <AgendaButton label={t.refresh} onPress={()=>void refetch()}/>
  </>}
 </ScrollView></WorkspaceShell>;
}
function TankData({tank,detail=false}:{tank:MilkTank;detail?:boolean}){
 const {language}=useAuth(),t=tankMessages[language];
 return <><Text style={detail?s.heading:s.title}>{tank.name}</Text><Text style={s.muted}>{tank.farm_name}</Text><Text style={s.badge}>{tank.is_active?t.enabled:t.disabled}</Text>
  <View style={s.row}>{[[t.balance,tank.balance_liters],[t.capacity,tank.capacity_liters]].map(([label,value])=><View key={label} style={{flex:1,minWidth:100,gap:3}}><Text style={s.label}>{label}</Text><Text style={s.title}>{formatMilkVolume(value!,language)} L</Text></View>)}</View>
  {milkCents(tank.balance_liters)>milkCents(tank.capacity_liters)&&<Text accessibilityRole="alert" style={s.error}>{t.warning}</Text>}
 </>;
}

function TankRecordActions({tank,farm,active}:{tank:string;farm:string;active:boolean}){
 const {state,language}=useAuth(),router=useRouter();
 if(!active||state.status!=='signedIn'||!canWriteTankRecord(state.session.user,'movement'))return null;
 return <View style={s.row}>{(['movement','quality'] as const).map(mode=><AgendaButton key={mode} label={tankWriteMessages[language][mode]} onPress={()=>router.push({pathname:'/milk/tank-record-form',params:{mode,tank,farm}})}/>)}</View>;
}
