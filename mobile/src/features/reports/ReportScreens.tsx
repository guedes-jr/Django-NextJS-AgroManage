import {useCallback,useState} from 'react';
import {Linking,RefreshControl,ScrollView,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {HomeIcon,type HomeIconName} from '../home/HomeIcon';
import {parseApiUrl} from '../../config/environment';
import {colors} from '../../theme/tokens';
import {ActionGroup,ActionRow,EmptyState,ErrorState,FilterChips,InfoList,KpiStrip,ListRow,ScreenIntro,SectionLabel,Segmented,SkeletonList,WebFallback,mobileStyles as ms} from '../../components/mobile';
import {canReadReport,canUseReports,reportKinds,type ReportKind} from './contracts';
import {reportMessages} from './messages';

async function openWeb(){const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site)throw Error('site');await Linking.openURL(new URL('/home/relatorios',site).href);}
const icons:Record<ReportKind,HomeIconName>={'low-stock':'box',expiry:'agenda',herd:'group'};
export function ReportsScreen(){
 const {state,language}=useAuth();const router=useRouter();const t=reportMessages[language],w=workspaceMessages[language];
 const user=state.status==='signedIn'?state.session.user:null;const [failed,setFailed]=useState(false);
 const titles:Record<ReportKind,[string,string]>={'low-stock':[t.lowStock,t.lowStockHint],expiry:[t.expiry,t.expiryHint],herd:[t.herd,t.herdHint]};
 return <WorkspaceShell active="reports" title={t.title}><ScrollView contentContainerStyle={ms.list}>
  {!user||!canUseReports(user)?<EmptyState title={w.noAccess}/>:<>
   <ScreenIntro title={t.title} subtitle={t.subtitle}/>
   <ActionGroup>{reportKinds.filter(kind=>canReadReport(user,kind)).map(kind=><ActionRow key={kind} label={titles[kind][0]} description={titles[kind][1]} icon={<HomeIcon name={icons[kind]} size={20} color={colors.primary}/>} onPress={()=>router.push({pathname:'/reports/[kind]',params:{kind}})}/>)}</ActionGroup>
   <SectionLabel title={t.more}/>
   <WebFallback hint={t.webHint} label={t.web} failed={failed?w.failedLink:undefined} onPress={()=>{setFailed(false);void openWeb().catch(()=>setFailed(true));}}/>
  </>}
 </ScrollView></WorkspaceShell>;
}
export function ReportScreen(){
 const params=useLocalSearchParams();const kind=reportKinds.find(k=>k===params.kind)??'low-stock';
 const {state,language}=useAuth();const router=useRouter();const t=reportMessages[language],w=workspaceMessages[language];
 const allowed=state.status==='signedIn'&&canReadReport(state.session.user,kind);
 const title=kind==='low-stock'?t.lowStock:kind==='expiry'?t.expiry:t.herd;
 return <WorkspaceShell active="reports" title={title} onBack={()=>router.canGoBack()?router.back():router.replace('/reports')}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:kind==='low-stock'?<LowStock/>:kind==='expiry'?<Expiry/>:<Herd/>}</WorkspaceShell>;
}
function useRefresh(refetch:()=>Promise<unknown>){const [refreshing,setRefreshing]=useState(false);return <RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await refetch();}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>;}
const n=(v:number|null|undefined,language:string,d=2)=>v==null?'—':new Intl.NumberFormat(language,{maximumFractionDigits:d}).format(v);
function LowStock(){
 const {controller,language}=useAuth();const router=useRouter();const t=reportMessages[language],w=workspaceMessages[language];
 const q=useQuery({queryKey:['report-low-stock'],queryFn:({signal})=>controller.lowStockReport(signal)});const {refetch}=q;useFocusEffect(useCallback(()=>{void refetch();},[refetch]));
 const [filter,setFilter]=useState<'all'|'critical'|'warning'>('all');const refresh=useRefresh(refetch);const d=q.data;
 return <ScrollView contentContainerStyle={ms.list} refreshControl={refresh}><ScreenIntro title={t.lowStock} subtitle={t.lowStockHint}/>
  {q.isPending?<SkeletonList/>:q.isError||!d?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<>
   <KpiStrip items={[{key:'t',label:t.total,value:String(d.total),selected:filter==='all',onPress:()=>setFilter('all')},{key:'c',label:t.critical,value:String(d.critical),tone:d.critical?'danger':undefined,selected:filter==='critical',onPress:()=>setFilter('critical')},{key:'w',label:t.warning,value:String(d.warning),tone:d.warning?'warning':undefined,selected:filter==='warning',onPress:()=>setFilter('warning')}]}/>
   {d.items.filter(i=>filter==='all'||i.urgency===filter).map(i=><ListRow key={i.id} meta={i.category} title={i.name} subtitle={`${t.current}: ${n(i.current_quantity,language)} · ${t.minimum}: ${n(i.min_stock,language)}`} value={`+${n(i.needed,language)}`} valueCaption={`${t.needed}${i.unit?` · ${i.unit}`:''}`} status={{label:i.urgency==='critical'?t.critical:t.warning,tone:i.urgency==='critical'?'danger':'warning'}} onPress={()=>router.push({pathname:'/inventory/[id]',params:{id:i.id,kind:'items'}})}/>)}
   {!d.items.length&&<EmptyState title={t.empty}/>}
  </>}
 </ScrollView>;
}
function Expiry(){
 const {state,controller,language}=useAuth();const t=reportMessages[language],w=workspaceMessages[language];
 const financial=state.status==='signedIn'&&state.session.user.access.can_view_financial;
 const [days,setDays]=useState<'15'|'30'|'60'|'90'>('30');const [tab,setTab]=useState<'expiring'|'expired'>('expiring');
 const q=useQuery({queryKey:['report-expiry',days],queryFn:({signal})=>controller.expiryReport(Number(days),signal)});const {refetch}=q;useFocusEffect(useCallback(()=>{void refetch();},[refetch]));
 const refresh=useRefresh(refetch);const d=q.data;const money=(v?:number)=>v==null?undefined:new Intl.NumberFormat(language,{style:'currency',currency:'BRL'}).format(v);
 const rows=d?(tab==='expiring'?d.expiring:d.expired):[];
 return <ScrollView contentContainerStyle={ms.list} refreshControl={refresh}><ScreenIntro title={t.expiry} subtitle={t.expiryHint}/>
  <FilterChips label={t.window} value={days} onChange={setDays} options={(['15','30','60','90'] as const).map(v=>({value:v,label:`${v} ${t.days}`}))}/>
  {q.isPending?<SkeletonList/>:q.isError||!d?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<>
   <KpiStrip items={[{key:'e',label:t.expiring,value:String(d.total_expiring),tone:d.total_expiring?'warning':undefined,hint:financial?money(d.total_expiring_value):undefined,selected:tab==='expiring',onPress:()=>setTab('expiring')},{key:'x',label:t.expired,value:String(d.total_expired),tone:d.total_expired?'danger':undefined,hint:financial?money(d.total_expired_value):undefined,selected:tab==='expired',onPress:()=>setTab('expired')}]}/>
   <Segmented value={tab} onChange={setTab} options={[{value:'expiring',label:t.expiring},{value:'expired',label:t.expired}]}/>
   {rows.map(r=><ListRow key={r.id} meta={`${t.lot} ${r.lote_code??'—'}`} title={r.item_name} subtitle={new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${r.expiry_date}T12:00:00Z`))+(r.days_until_expiry!=null&&tab==='expiring'?` · ${t.inDays.replace('{days}',String(r.days_until_expiry))}`:'')} value={n(r.quantity,language)} valueCaption={financial?money(r.total_value):undefined} status={{label:tab==='expired'?t.expired:t.expiring,tone:tab==='expired'||(r.days_until_expiry??99)<=7?'danger':'warning'}}/>)}
   {!rows.length&&<EmptyState title={t.empty}/>}
  </>}
 </ScrollView>;
}
function Herd(){
 const {controller,language}=useAuth();const t=reportMessages[language],w=workspaceMessages[language];
 const q=useQuery({queryKey:['report-herd'],queryFn:({signal})=>controller.herdInventoryReport(signal)});const {refetch}=q;useFocusEffect(useCallback(()=>{void refetch();},[refetch]));
 const refresh=useRefresh(refetch);const d=q.data;
 const total=d?d.by_species.reduce((s,r)=>s+(r.total??0),0):0,batches=d?d.by_species.reduce((s,r)=>s+(r.batches??0),0):0;
 return <ScrollView contentContainerStyle={ms.list} refreshControl={refresh}><ScreenIntro title={t.herd} subtitle={t.herdHint}/>
  {q.isPending?<SkeletonList/>:q.isError||!d?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<>
   <KpiStrip items={[{key:'h',label:t.heads,value:n(total,language,0)},{key:'b',label:t.batches,value:n(batches,language,0)}]}/>
   <SectionLabel title={t.bySpecies}/>
   <InfoList rows={d.by_species.map(r=>[r.species,`${n(r.total,language,0)} ${t.heads.toLowerCase()} · ${n(r.batches,language,0)} ${t.batches.toLowerCase()}`] as [string,string])}/>
   <SectionLabel title={t.byFarm}/>
   <InfoList rows={d.by_farm.map(r=>[r.farm,`${n(r.total,language,0)} ${t.heads.toLowerCase()} · ${n(r.batches,language,0)} ${t.batches.toLowerCase()}`] as [string,string])}/>
   <SectionLabel title={t.items}/>
   {d.items.slice(0,100).map(r=><ListRow key={r.id} meta={`${r.species} · ${r.farm}`} title={r.batch_code} subtitle={[r.name,r.category,r.avg_weight?`${n(r.avg_weight,language,1)} kg`:null].filter(Boolean).join(' · ')||undefined} value={n(r.quantity,language,0)} valueCaption={t.heads}/>)}
   {!d.items.length&&<EmptyState title={t.empty}/>}
  </>}
 </ScrollView>;
}
