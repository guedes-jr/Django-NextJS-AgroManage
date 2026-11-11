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
 return <WorkspaceShell active="milk" title={t.title}>{!allowed?<View style={s.content}><Text style={s.error}>{w.noAccess}</Text></View>:<FlatList contentContainerStyle={s.content} data={data?.results??[]} keyExtractor={row=>row.id} ListHeaderComponent={<View style={{gap:12}}><AgendaButton label={w.back} onPress={()=>router.canGoBack()?router.back():router.replace('/milk')}/><FarmContextButton/><Text style={s.muted}>{t.readOnly}</Text><View style={s.row}>{(['all','active','inactive'] as const).map(value=><AgendaButton key={value} label={t[value]} selected={status===value} onPress={()=>setStatus(value)}/>)}</View><AgendaButton label={t.refresh} disabled={q.isFetching} onPress={()=>void refetch()}/>{q.isFetching&&<Busy label={w.loading}/ >}{q.isError&&<><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refetch()}/>{page>1&&<AgendaButton label={`${w.page} 1`} onPress={()=>setPaging({scope,page:1})}/>}</>}</View>} renderItem={({item})=><View style={s.card}><TankData tank={item}/><AgendaButton label={`${t.view}: ${item.name}`} onPress={()=>router.push({pathname:'/milk/tank',params:{id:item.id,farm:item.farm}})}/></View>} ListEmptyComponent={data&&!data.count?<Text style={s.body}>{t.empty}</Text>:undefined} ListFooterComponent={data?<View style={s.row}><AgendaButton label={w.previous} disabled={!data.previous} onPress={()=>setPaging({scope,page:page-1})}/><Text style={s.body}>{w.page} {page}</Text><AgendaButton label={w.next} disabled={!data.next||page>=100000} onPress={()=>setPaging({scope,page:page+1})}/></View>:undefined}/>}</WorkspaceShell>;
}
export function TankDetailScreen(){
 const router=useRouter(),params=useLocalSearchParams(),route=z.object({id:z.uuid(),farm:z.uuid()}).safeParse(params),{state,controller,language}=useAuth(),t=tankMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user),id=route.success?route.data.id:'',farm=route.success?route.data.farm:'';
 const q=useQuery({queryKey:['milk-tank',id,farm],enabled:allowed,staleTime:0,queryFn:({signal})=>controller.milkTank(id,farm,signal)}),{refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 return <WorkspaceShell active="milk" title={t.detail}><ScrollView contentContainerStyle={s.content}><AgendaButton label={w.back} onPress={()=>router.canGoBack()?router.back():router.replace('/milk/tanks')}/>{!allowed?<Text style={s.error}>{w.noAccess}</Text>:q.isError?<><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refetch()}/></>:q.isFetching||!q.data?<Busy label={w.loading}/>:<><View style={s.card}><TankData tank={q.data}/></View><AgendaButton label={tankMovementMessages[language].open} onPress={()=>router.push({pathname:'/milk/tank-movements',params:{tank:id,farm}})}/>{!!q.data.notes&&<View style={s.card}><Text style={s.heading}>{t.notes}</Text><Text style={s.body} selectable>{q.data.notes}</Text></View>}<Text style={s.muted}>{t.readOnly}</Text><AgendaButton label={t.refresh} onPress={()=>void refetch()}/></>}</ScrollView></WorkspaceShell>;
}
function TankData({tank}:{tank:MilkTank}){const {language}=useAuth(),t=tankMessages[language];return <><Text style={s.heading}>{tank.name}</Text><Text style={s.body}>{tank.farm_name}</Text><Text style={s.badge}>{tank.is_active?t.enabled:t.disabled}</Text><Text style={s.body}>{t.balance}: {formatMilkVolume(tank.balance_liters,language)} L</Text><Text style={s.body}>{t.capacity}: {formatMilkVolume(tank.capacity_liters,language)} L</Text>{milkCents(tank.balance_liters)>milkCents(tank.capacity_liters)&&<Text style={s.error}>{t.warning}</Text>}</>;}
