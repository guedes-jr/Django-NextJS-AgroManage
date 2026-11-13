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
import {tankQualityQuerySchema,type TankQuality} from './tankQualityContracts';
import {tankQualityMessages} from './tankQualityMessages';
const scopeSchema=z.object({tank:z.uuid(),farm:z.uuid()});
export function TankQualityListScreen(){
 const router=useRouter(),params=useLocalSearchParams(),route=scopeSchema.safeParse(params),{state,controller,language}=useAuth(),t=tankQualityMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user),tank=route.success?route.data.tank:'',farm=route.success?route.data.farm:'';
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [date,setDate]=useState(''),[applied,setApplied]=useState(''),[paging,setPaging]=useState({scope:'',page:1}),[invalid,setInvalid]=useState(false),scope=`${tank}:${farm}:${applied}`,page=paging.scope===scope?paging.page:1,dirty=date!==applied;
 const q=useQuery({queryKey:['milk-tank-quality-list',tank,farm,applied,page],enabled:allowed&&!dirty,staleTime:0,queryFn:async({signal})=>{const [metadata,history]=await Promise.all([controller.milkTank(tank,farm,signal),controller.milkTankQualities({tank,farm,date:applied,page},signal)]);return {metadata,history};}}),{refetch}=q;
 useFocusEffect(useCallback(()=>{if(allowed&&!dirty)void refetch();},[allowed,dirty,refetch]));
 const data=!dirty&&!q.isError&&!q.isFetching?q.data:undefined,apply=()=>{if(!tankQualityQuerySchema.safeParse({tank,farm,date,page:1}).success){setInvalid(true);return;}setInvalid(false);setFiltersOpen(false);setPaging({scope:`${tank}:${farm}:${date}`,page:1});if(!dirty&&page===1)void refetch();else setApplied(date);};
 return <WorkspaceShell active="milk" title={t.title} onBack={()=>router.canGoBack()?router.back():route.success?router.replace({pathname:'/milk/tank',params:{id:tank,farm}}):router.replace('/milk/tanks')}>{!allowed?<View style={s.content}><Text style={s.error}>{w.noAccess}</Text></View>:<FlatList contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" data={data?.history.results??[]} keyExtractor={row=>row.id}
  ListHeaderComponent={<View style={{gap:12}}>
   <View style={s.card}><Text style={s.title}>{t.context}</Text>
    {!q.isError&&q.data&&<><Text style={s.title}>{q.data.metadata.name}</Text><Text style={s.muted}>{q.data.metadata.farm_name}</Text></>}
    <Text style={s.body}>{applied?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${applied}T12:00:00Z`)):t.allDates}</Text>
    <AgendaButton label={filtersOpen?t.closeFilters:t.filters} selected={filtersOpen||dirty} onPress={()=>setFiltersOpen(value=>!value)}/>
    {filtersOpen&&<><Text style={s.label}>{t.date}</Text><TextInput style={s.input} accessibilityLabel={t.date} value={date} onChangeText={setDate} maxLength={10} autoCapitalize="none" placeholder={t.date}/><AgendaButton label={t.apply} onPress={apply}/><AgendaButton label={t.clear} disabled={!dirty&&!applied} onPress={()=>{setDate('');setApplied('');setPaging({scope:`${tank}:${farm}:`,page:1});setInvalid(false);setFiltersOpen(false);}}/>{invalid&&<Text accessibilityRole="alert" style={s.error}>{t.invalid}</Text>}</>}
    {dirty&&<Text accessibilityRole="alert" style={s.muted}>{t.dirty}</Text>}
   </View>
   <View style={s.row}><Text style={[s.title,{flex:1}]}>{t.records}{data?` (${data.history.count})`:''}</Text><AgendaButton label={t.refresh} disabled={dirty||q.isFetching} onPress={()=>void refetch()}/></View>
   {params.reconcile!=='1'&&data&&data.metadata.is_active&&state.status==='signedIn'&&canWriteTankRecord(state.session.user,'quality')&&<AgendaButton label={tankWriteMessages[language].quality} onPress={()=>router.push({pathname:'/milk/tank-record-form',params:{mode:'quality',tank,farm,...(applied?{date:applied}:{})}})}/>}
   <Text style={s.muted}>{t.note}</Text>
   {!dirty&&q.isFetching&&<Busy label={w.loading}/>}{!dirty&&q.isError&&<><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refetch()}/>{page>1&&<AgendaButton label={`${w.page} 1`} onPress={()=>setPaging({scope,page:1})}/>}</>}
  </View>}
  renderItem={({item})=><View style={s.card}><QualityData row={item} summary/><AgendaButton label={t.view} accessibilityLabel={`${t.view}: ${item.sample||item.date}`} onPress={()=>router.push({pathname:'/milk/tank-quality',params:{id:item.id,tank,farm,...(params.reconcile==='1'?{reconcile:'1'}:{})}})}/></View>}
  ListEmptyComponent={data&&!data.history.count?<Text style={s.body}>{t.empty}</Text>:undefined}
  ListFooterComponent={data?<View style={s.row}><AgendaButton label={w.previous} disabled={!data.history.previous} onPress={()=>setPaging({scope,page:page-1})}/><Text style={s.body}>{w.page} {page}</Text><AgendaButton label={w.next} disabled={!data.history.next||page>=100000} onPress={()=>setPaging({scope,page:page+1})}/></View>:undefined}/>}</WorkspaceShell>;
}
export function TankQualityDetailScreen(){
 const router=useRouter(),params=useLocalSearchParams(),route=scopeSchema.extend({id:z.uuid()}).safeParse(params),{state,controller,language}=useAuth(),t=tankQualityMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user),id=route.success?route.data.id:'',tank=route.success?route.data.tank:'',farm=route.success?route.data.farm:'';
 const q=useQuery({queryKey:['milk-tank-quality',id,tank,farm],enabled:allowed,staleTime:0,queryFn:({signal})=>controller.milkTankQuality(id,tank,farm,signal)}),{refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const row=!q.isError&&!q.isFetching?q.data:undefined;
 return <WorkspaceShell active="milk" title={t.detail} onBack={()=>router.canGoBack()?router.back():route.success?router.replace({pathname:'/milk/tank-qualities',params:{tank,farm,...(params.reconcile==='1'?{reconcile:'1'}:{})}}):router.replace('/milk/tanks')}><ScrollView contentContainerStyle={s.content}>{!allowed?<Text style={s.error}>{w.noAccess}</Text>:q.isError?<><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refetch()}/></>:!row?<Busy label={w.loading}/>:<><View style={s.card}><Text style={s.heading}>{row.tank_name}</Text><Text style={s.muted}>{row.farm_name}</Text><QualityData row={row}/></View><View style={s.card}><Text style={s.label}>{t.author}</Text><Text style={s.body}>{row.recorded_by||t.missing}</Text></View>{!!row.notes&&<View style={s.card}><Text style={s.label}>{t.notes}</Text><Text style={s.body} selectable>{row.notes}</Text></View>}<Text style={s.muted}>{t.note}</Text><AgendaButton label={t.refresh} onPress={()=>void refetch()}/></>}</ScrollView></WorkspaceShell>;
}
function QualityData({row,summary=false}:{row:TankQuality;summary?:boolean}){
 const {language}=useAuth(),t=tankQualityMessages[language],number=(value:string|null,unit:string)=>value===null?t.missing:`${new Intl.NumberFormat(language,{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value))} ${unit}`,count=(value:number|null,unit:string)=>value===null?t.missing:`${new Intl.NumberFormat(language).format(value)} ${unit}`;
 const metric=(label:string,value:string)=><View key={label} style={{flex:1,minWidth:100,gap:3}}><Text style={s.label}>{label}</Text><Text style={s.body}>{value}</Text></View>;
 return <><Text style={s.title}>{new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${row.date}T12:00:00Z`))}</Text><Text style={s.body}>{t.sample}: {row.sample||t.missing}</Text><Text style={row.antibiotics==='positive'?s.error:s.badge}>{t.antibiotics}: {t[row.antibiotics]}</Text>{!summary&&<View style={s.row}>{metric(t.temperature,number(row.temperature_c,'°C'))}{metric(t.fat,number(row.fat_percent,'%'))}{metric(t.protein,number(row.protein_percent,'%'))}{metric(t.scc,count(row.scc,t.cells))}{metric(t.tbc,count(row.tbc,t.cfu))}</View>}</>;
}
