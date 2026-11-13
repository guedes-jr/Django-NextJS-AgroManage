import {canWriteTankRecord} from './tankWriteContracts';
import {tankWriteMessages} from './tankWriteMessages';
import {useCallback,useState} from 'react';
import {FlatList,ScrollView,Text,TextInput,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,Busy,styles as s} from '../agenda/ui';
import {canReadCattle} from '../cattle/contracts';
import {formatMilkVolume} from '../cattle/milkTrendContracts';
import {tankMovementQuerySchema,tankMovementKinds,type TankMovement,type TankMovementQuery} from './tankMovementContracts';
import {tankMovementMessages} from './tankMovementMessages';
const scopeSchema=z.object({tank:z.uuid(),farm:z.uuid()});
export function TankMovementListScreen(){
 const router=useRouter(),params=useLocalSearchParams(),route=scopeSchema.safeParse(params),{state,controller,language}=useAuth(),t=tankMovementMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user),tank=route.success?route.data.tank:'',farm=route.success?route.data.farm:'';
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [kind,setKind]=useState<TankMovementQuery['kind']>('all'),[date,setDate]=useState(''),[applied,setApplied]=useState({kind:'all' as TankMovementQuery['kind'],date:''}),[paging,setPaging]=useState({scope:'',page:1}),[invalid,setInvalid]=useState(false);
 const scope=`${tank}:${farm}:${applied.kind}:${applied.date}`,page=paging.scope===scope?paging.page:1,dirty=kind!==applied.kind||date!==applied.date;
 const q=useQuery({queryKey:['milk-tank-movements',tank,farm,applied,page],enabled:allowed&&!dirty,staleTime:0,queryFn:async({signal})=>{const [metadata,history]=await Promise.all([controller.milkTank(tank,farm,signal),controller.milkTankMovements({tank,farm,...applied,page},signal)]);return {metadata,history};}}),{refetch}=q;
 useFocusEffect(useCallback(()=>{if(allowed&&!dirty)void refetch();},[allowed,dirty,refetch]));
 const data=!dirty&&!q.isError&&!q.isFetching?q.data:undefined;
 const apply=()=>{if(!tankMovementQuerySchema.safeParse({tank,farm,kind,date,page:1}).success){setInvalid(true);return;}setInvalid(false);setFiltersOpen(false);setPaging({scope:`${tank}:${farm}:${kind}:${date}`,page:1});if(!dirty&&page===1)void refetch();else setApplied({kind,date});};
 return <WorkspaceShell active="milk" title={t.title} onBack={()=>router.canGoBack()?router.back():route.success?router.replace({pathname:'/milk/tank',params:{id:tank,farm}}):router.replace('/milk/tanks')}>{!allowed?<View style={s.content}><Text style={s.error}>{w.noAccess}</Text></View>:<FlatList contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" data={data?.history.results??[]} keyExtractor={row=>row.id}
  ListHeaderComponent={<View style={{gap:12}}>
   <View style={s.card}><Text style={s.title}>{t.context}</Text>
    {!q.isError&&q.data&&<><Text style={s.title}>{q.data.metadata.name}</Text><Text style={s.muted}>{q.data.metadata.farm_name}</Text></>}
    <Text style={s.body}>{t[applied.kind]} · {applied.date?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${applied.date}T12:00:00Z`)):t.allDates}</Text>
    <AgendaButton label={filtersOpen?t.closeFilters:t.filters} selected={filtersOpen||dirty} onPress={()=>setFiltersOpen(value=>!value)}/>
    {filtersOpen&&<><View style={s.row}>{(['all',...tankMovementKinds] as const).map(value=><AgendaButton key={value} label={t[value]} selected={kind===value} onPress={()=>setKind(value)}/>)}</View><Text style={s.label}>{t.date}</Text><TextInput style={s.input} accessibilityLabel={t.date} value={date} onChangeText={setDate} maxLength={10} autoCapitalize="none" placeholder={t.date}/><AgendaButton label={t.apply} onPress={apply}/><AgendaButton label={t.clear} disabled={!dirty&&applied.kind==='all'&&!applied.date} onPress={()=>{setKind('all');setDate('');setApplied({kind:'all',date:''});setPaging({scope:`${tank}:${farm}:all:`,page:1});setInvalid(false);setFiltersOpen(false);}}/>{invalid&&<Text accessibilityRole="alert" style={s.error}>{t.invalid}</Text>}</>}
    {dirty&&<Text accessibilityRole="alert" style={s.muted}>{t.dirty}</Text>}
   </View>
   <View style={s.row}><Text style={[s.title,{flex:1}]}>{t.records}{data?` (${data.history.count})`:''}</Text><AgendaButton label={t.refresh} disabled={dirty||q.isFetching} onPress={()=>void refetch()}/></View>
   {params.reconcile!=='1'&&data&&data.metadata.is_active&&state.status==='signedIn'&&canWriteTankRecord(state.session.user,'movement')&&<AgendaButton label={tankWriteMessages[language].movement} onPress={()=>router.push({pathname:'/milk/tank-record-form',params:{mode:'movement',tank,farm,...(applied.date?{date:applied.date}:{})}})}/>}
   <Text style={s.muted}>{t.note}</Text>
   {!dirty&&q.isFetching&&<Busy label={w.loading}/>}{!dirty&&q.isError&&<><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refetch()}/>{page>1&&<AgendaButton label={`${w.page} 1`} onPress={()=>setPaging({scope,page:1})}/>}</>}
  </View>}
  renderItem={({item})=><View style={s.card}><MovementSummary row={item}/><AgendaButton label={t.view} accessibilityLabel={`${t.view}: ${t[item.kind]} · ${item.date}`} onPress={()=>router.push({pathname:'/milk/tank-movement',params:{id:item.id,tank,farm,...(params.reconcile==='1'?{reconcile:'1'}:{})}})}/></View>}
  ListEmptyComponent={data&&!data.history.count?<Text style={s.body}>{t.empty}</Text>:undefined}
  ListFooterComponent={data?<View style={s.row}><AgendaButton label={w.previous} disabled={!data.history.previous} onPress={()=>setPaging({scope,page:page-1})}/><Text style={s.body}>{w.page} {page}</Text><AgendaButton label={w.next} disabled={!data.history.next||page>=100000} onPress={()=>setPaging({scope,page:page+1})}/></View>:undefined}/>}</WorkspaceShell>;
}
export function TankMovementDetailScreen(){
 const router=useRouter(),params=useLocalSearchParams(),route=scopeSchema.extend({id:z.uuid()}).safeParse(params),{state,controller,language}=useAuth(),t=tankMovementMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user),id=route.success?route.data.id:'',tank=route.success?route.data.tank:'',farm=route.success?route.data.farm:'';
 const q=useQuery({queryKey:['milk-tank-movement',id,tank,farm],enabled:allowed,staleTime:0,queryFn:({signal})=>controller.milkTankMovement(id,tank,farm,signal)}),{refetch}=q;
 useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const row=!q.isError&&!q.isFetching?q.data:undefined,field=(label:string,value:string)=>value?<View key={label} style={{gap:3}}><Text style={s.label}>{label}</Text><Text style={s.body} selectable>{value}</Text></View>:null;
 return <WorkspaceShell active="milk" title={t.detail} onBack={()=>router.canGoBack()?router.back():route.success?router.replace({pathname:'/milk/tank-movements',params:{tank,farm,...(params.reconcile==='1'?{reconcile:'1'}:{})}}):router.replace('/milk/tanks')}><ScrollView contentContainerStyle={s.content}>{!allowed?<Text style={s.error}>{w.noAccess}</Text>:q.isError?<><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refetch()}/></>:!row?<Busy label={w.loading}/>:<><View style={s.card}><Text style={s.heading}>{row.tank_name}</Text><Text style={s.muted}>{row.farm_name}</Text><MovementSummary row={row}/></View>{row.cancelled_at&&<View style={s.card}><Text style={s.error}>{t.cancelled}</Text>{field(t.cancelDate,new Intl.DateTimeFormat(language,{dateStyle:'medium',timeStyle:'short',timeZone:row.timezone}).format(new Date(row.cancelled_at))+` (${row.timezone})`)}{field(t.cancelReason,row.cancellation_reason)}</View>}{[row.recorded_by,row.buyer,row.driver,row.vehicle,row.document,row.reason,row.notes].some(Boolean)&&<View style={s.card}><Text style={s.title}>{t.information}</Text>{field(t.author,row.recorded_by)}{field(t.buyer,row.buyer)}{field(t.driver,row.driver)}{field(t.vehicle,row.vehicle)}{field(t.document,row.document)}{field(t.reason,row.reason)}{field(t.notes,row.notes)}</View>}{params.reconcile!=='1'&&!row.cancelled_at&&state.status==='signedIn'&&canWriteTankRecord(state.session.user,'cancel')&&<AgendaButton label={tankWriteMessages[language].cancel} onPress={()=>router.push({pathname:'/milk/tank-record-form',params:{mode:'cancel',id:row.id,tank,farm}})}/>}<Text style={s.muted}>{t.note}</Text><AgendaButton label={t.refresh} onPress={()=>void refetch()}/></>}</ScrollView></WorkspaceShell>;
}
function MovementSummary({row}:{row:TankMovement}){const {language}=useAuth(),t=tankMovementMessages[language];return <><Text style={s.title}>{t[row.kind]}</Text><Text style={s.body}>{new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${row.date}T12:00:00Z`))}</Text><Text style={s.body}>{t.volume}: {formatMilkVolume(row.liters,language)} L</Text><Text style={row.cancelled_at?s.error:s.badge}>{row.cancelled_at?t.cancelled:t.confirmed}</Text></>;}
