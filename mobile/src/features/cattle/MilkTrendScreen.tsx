import {useCallback,useState} from 'react';
import {FlatList,RefreshControl,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {styles as ui} from '../agenda/ui';
import {colors} from '../../theme/tokens';
import {DairyIcon} from './DairyIcon';
import {DateStepper,EmptyState,ErrorState,FilterChips,IconTile,KpiStrip,ListRow,MetricGrid,Notice,PickerModal,ScreenIntro,SectionLabel,SelectChip,Shortcut,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {workspaceMessages} from '../workspace/messages';
import {canReadCattle} from './contracts';
import {cattleMessages,cattleLabel} from './messages';
import {milkTrendMessages} from './milkTrendMessages';
import {milkTrendQuerySchema,formatMilkVolume,type MilkTrendOptions,type MilkTrendQuery,type MilkTrendAnimal} from './milkTrendContracts';
export function MilkTrendScreen(){
 const params=useLocalSearchParams(),route=z.object({production:z.literal('dairy'),farm:z.uuid().optional()}).safeParse(params),{state,controller,language}=useAuth(),{farm}=useWorkspace(),t=milkTrendMessages[language],w=workspaceMessages[language],farmId=route.success?route.data.farm??farm?.id:undefined,allowed=route.success&&state.status==='signedIn'&&canReadCattle(state.session.user);
 const q=useQuery({queryKey:['milk-trend-options',farmId],enabled:allowed,staleTime:0,queryFn:({signal})=>controller.milkTrendOptions(farmId,signal)}),{refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 return <WorkspaceShell active="dairy" title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:q.isError?<View style={ms.list}><ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/></View>:q.isPending?<View style={ms.list}><SkeletonList rows={3}/></View>:<Report key={farmId??'all'} options={q.data}/>}</WorkspaceShell>;
}
const shift=(day:string,delta:number)=>{const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);};
type Period='7'|'30'|'90'|'custom';
function Report({options}:{options:MilkTrendOptions}){
 const {controller,language}=useAuth(),t=milkTrendMessages[language],w=workspaceMessages[language],c=cattleMessages[language];
 const [period,setPeriod]=useState<Period>('custom'),[start,setStart]=useState(options.start),[end,setEnd]=useState(options.end),[drop,setDrop]=useState(String(Number(options.drop_percent))),[animal,setAnimal]=useState<MilkTrendAnimal>(),[picker,setPicker]=useState(false);
 const choose=(p:Period)=>{setPeriod(p);if(p!=='custom'){setEnd(options.today);setStart(shift(options.today,-(Number(p)-1)));}};
 const parsed=milkTrendQuerySchema.safeParse({production:'dairy',farm:options.farm?.id,start,end,animal:animal?.id,drop_percent:drop});
 const query=parsed.success?parsed.data:null;
 const q=useQuery({queryKey:['milk-trends',query],enabled:!!query,staleTime:0,queryFn:({signal})=>controller.milkTrends(query!,signal)}),{refetch}=q;useFocusEffect(useCallback(()=>{if(query)void refetch();},[query,refetch]));
 const [refreshing,setRefreshing]=useState(false);
 const data=q.isError?undefined:q.data,volume=(v:string)=>`${formatMilkVolume(v,language)} L`,date=(v:string)=>new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${v}T12:00:00Z`));
 const drops=Array.from(new Set(['10','15','20','30',String(Number(options.drop_percent))])).sort((a,b)=>Number(a)-Number(b));
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={options.farm?.name??t.scope}/>
  <FilterChips value={period} onChange={choose} options={[{value:'7',label:`7 ${t.days.toLowerCase()}`},{value:'30',label:`30 ${t.days.toLowerCase()}`},{value:'90',label:`90 ${t.days.toLowerCase()}`},{value:'custom',label:`${date(start)} – ${date(end)}`}]}/>
  {period==='custom'&&<View style={{gap:8}}><Text style={ui.label}>{t.start}</Text><DateStepper value={start} max={end} onChange={setStart} language={language}/><Text style={ui.label}>{t.end}</Text><DateStepper value={end} min={start} max={options.today} onChange={setEnd} language={language}/></View>}
  <View style={{gap:6}}><Text style={ui.label}>{t.drop}</Text><FilterChips value={drop} onChange={setDrop} options={drops.map(v=>({value:v,label:`${v}%`}))}/></View>
  <View style={ms.wrap}><SelectChip label={t.all} value={animal?`${animal.identifier}`:undefined} active={!!animal} onPress={()=>setPicker(true)}/>{animal&&<Shortcut label={t.all} onPress={()=>setAnimal(undefined)}/>}</View>
  {!query&&<Notice tone="danger" text={t.invalid}/>}
  {q.isFetching&&!data?<SkeletonList rows={2}/>:q.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:data&&<>
   {data.animal&&<Notice tone="info" text={`${data.animal.identifier} · ${cattleLabel(c,data.animal.purpose)}`}/>}
   <KpiStrip items={[{key:'p',label:t.produced,value:volume(data.produced)},{key:'d',label:t.discarded,value:volume(data.discarded),tone:Number(data.discarded)>0?'warning':undefined},{key:'u',label:t.usable,value:volume(data.usable),tone:'success'}]}/>
   <Text style={{fontSize:12,color:colors.muted}}>{`${t.days}: ${data.days_with_records} · ${t.applied}: ${date(data.start)} – ${date(data.end)}`}</Text>
   {data.drop_alert&&<Notice tone="danger" text={`${t.alert}: ${formatMilkVolume(data.drop_alert.drop_percent,language)}% · ${date(data.drop_alert.previous_date)} → ${date(data.drop_alert.date)}. ${t.alertNote}`}/>}
   {!!data.sessions.length&&<><SectionLabel title={t.sessions}/><MetricGrid columns={3} items={data.sessions.map(row=>({label:`${t[row.session]} · ${row.records} ${t.records.toLowerCase()}`,value:formatMilkVolume(row.liters,language),unit:'L'}))}/></>}
   <SectionLabel title={t.title}/>
  </>}
 </View>;
 return <><FlatList contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" data={data?.series??[]} keyExtractor={p=>p.date} ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await refetch();}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>}
  renderItem={({item})=><ListRow meta={item.aggregate?t.aggregate:`${t.individual} · ${t.cows}: ${item.milked_cows}`} title={date(item.date)} subtitle={`${t.discarded}: ${volume(item.discarded)} · ${t.usable}: ${volume(item.usable)}`} value={volume(item.produced)} status={data?.drop_alert?.date===item.date?{label:t.alert,tone:'danger'}:undefined}/>}
  ListEmptyComponent={data&&!data.series.length?<EmptyState title={t.empty}/>:undefined}
  ListFooterComponent={<Notice tone="neutral" text={`${t.scope} ${t.note}`}/>}/>
  {picker&&query&&<AnimalPicker query={query} onClose={()=>setPicker(false)} onSelect={row=>{setAnimal(row);setPicker(false);}}/>}</>;
}
function AnimalPicker({query,onClose,onSelect}:{query:MilkTrendQuery;onClose:()=>void;onSelect:(row:MilkTrendAnimal)=>void}){
 const {controller,language}=useAuth(),t=milkTrendMessages[language],w=workspaceMessages[language],c=cattleMessages[language],[search,setSearch]=useState('');
 const list=useInfinitePages<MilkTrendAnimal>({queryKey:['milk-trend-animals','infinite',query,search],enabled:true,fetchPage:(page,signal)=>controller.milkTrendAnimals(query,page,search,signal) as Promise<{results:MilkTrendAnimal[];next:string|null}>});
 return <PickerModal<MilkTrendAnimal> title={t.choose} language={language} onClose={onClose} search={search} onSearch={setSearch} searchPlaceholder={t.search} list={list} keyExtractor={a=>a.id} emptyLabel={t.noAnimals} errorLabel={w.error}
  renderItem={item=><ListRow title={item.identifier} subtitle={cattleLabel(c,item.purpose)} leading={<IconTile tone="info"><DairyIcon name="cow" size={20} color={colors.info}/></IconTile>} accessibilityLabel={`${t.select}: ${item.identifier}`} onPress={()=>onSelect(item)}/>}/>;
}
