import {useCallback,useState} from 'react';
import {FlatList,Linking,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {workspaceMessages} from '../workspace/messages';
import {StatusPill,type StatusTone} from '../agenda/ui';
import {HomeIcon} from '../home/HomeIcon';
import {colors} from '../../theme/tokens';
import {ActionGroup,ActionRow,BottomSheet,DetailHeader,EmptyState,ErrorState,FilterChips,HeaderAction,IconTile,InfoList,ListFooter,ListRow,Notice,ScreenIntro,SearchBar,SectionLabel,Segmented,SelectChip,SheetOption,Shortcut,SkeletonList,WebFallback,mobileStyles as ms,mobileUiMessages,presetOptions,presetRange,type PeriodPreset} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {parseApiUrl} from '../../config/environment';
import {canReadClinic,canWriteClinic,clinicKinds,clinicQuerySchema,clinicWebPath,type ClinicQuery,type ClinicRecord} from './contracts';
import {clinicMessages} from './messages';
import {vaccinationMessages} from './vaccinationMessages';
import {healthMessages} from './healthMessages';
import {canApplyMedication} from './medicationContracts';
import {medicationMessages} from './medicationMessages';
/** Health and vaccinations live in the species segment on the web (the web clinic was removed). */
export async function openClinicWeb(species=''){const base=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!base)throw Error('site');await Linking.openURL(new URL(clinicWebPath(species),base).href);}
const severityTone=(value:string):StatusTone=>['critical','severe','high'].includes(value)?'danger':['moderate','medium'].includes(value)?'warning':'neutral';
const kindIcon=(kind:ClinicRecord['kind'])=>kind==='vaccinations'?'heart' as const:'leaf' as const;
export function ClinicScreen(){
 const params=useLocalSearchParams();const route=z.object({animal:z.uuid().optional(),batch:z.uuid().optional(),farm:z.uuid().optional(),kind:z.enum(clinicKinds).default('health')}).safeParse(params);const {state,controller,language}=useAuth();const {farm}=useWorkspace();const router=useRouter(),t=clinicMessages[language],w=workspaceMessages[language],u=mobileUiMessages[language];const allowed=route.success&&state.status==='signedIn'&&canReadClinic(state.session.user);
 const [kind,setKind]=useState<ClinicQuery['kind']>(route.success?route.data.kind:'health'),[search,setSearch]=useState(''),[species,setSpecies]=useState(''),[preset,setPreset]=useState<PeriodPreset>('any'),[sheet,setSheet]=useState(false);const farmId=route.success?route.data.farm??farm?.id:undefined;
 const period=presetRange(preset);
 const base:Omit<ClinicQuery,'page'>={kind,search,species,start:period.start,end:period.end,...(farmId?{farm:farmId}:{}),...(route.success&&route.data.animal?{animal:route.data.animal}:{}),...(route.success&&route.data.batch?{batch:route.data.batch}:{})};
 const valid=clinicQuerySchema.safeParse({...base,page:1}).success;
 const options=useQuery({queryKey:['clinic-options'],enabled:allowed,queryFn:({signal})=>controller.clinicOptions(signal)});
 const list=useInfinitePages<ClinicRecord>({queryKey:['clinic','infinite',base],enabled:allowed&&valid,fetchPage:(page,signal)=>controller.clinicPage({...base,page},signal)});const {refetch}=list;useFocusEffect(useCallback(()=>{if(allowed&&valid)void refetch();},[allowed,valid,refetch]));
 const day=(value:string)=>new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
 const label=(row:ClinicRecord)=>row.kind==='health'?t.labels[row.subtype]??row.title:row.title;
 const user=state.status==='signedIn'?state.session.user:null,batchOnly=route.success&&!!route.data.batch;
 const target={...(route.success&&route.data.animal?{animal:route.data.animal}:{}),...(route.success&&route.data.batch?{batch:route.data.batch}:{}),...(farmId?{farm:farmId}:{})};
 const primary=!user?null:kind==='vaccinations'&&canWriteClinic(user)?{label:vaccinationMessages[language].title,path:'/clinic/vaccination' as const}:kind==='health'&&!batchOnly&&canWriteClinic(user)?{label:healthMessages[language].title,path:'/clinic/health-form' as const}:null;
 const filtersActive=(species?1:0)+(preset!=='any'?1:0);
 const speciesLabel=species?t.labels[species]??options.data?.species.find(r=>r.value===species)?.label??species:undefined;
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={farm?.name} badge={user&&!canWriteClinic(user)?<View style={{marginTop:6}}><StatusPill label={t.readonly} tone="neutral"/></View>:undefined} action={primary?<HeaderAction label={primary.label} onPress={()=>router.push({pathname:primary.path,params:target})}/>:undefined}/>
  <Segmented value={kind} onChange={setKind} options={clinicKinds.filter(value=>!batchOnly||value!=='health').map(value=>({value,label:t[value]}))}/>
  {kind==='health'&&user&&canApplyMedication(user)&&!batchOnly&&<View style={ms.wrap}><Shortcut label={medicationMessages[language].title} icon={<HomeIcon name="heart" size={18} color={colors.primary}/>} onPress={()=>router.push({pathname:'/clinic/medication',params:{...(route.success&&route.data.animal?{animal:route.data.animal}:{}),...(farmId?{farm:farmId}:{})}})}/></View>}
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
  <FilterChips label={t.period} value={preset} onChange={setPreset} options={presetOptions(language)} trailing={<SelectChip label={t.species} value={speciesLabel} active={!!species} onPress={()=>setSheet(true)}/>}/>
  {list.count!==undefined&&<Text style={{fontSize:12,color:colors.muted}}>{`${list.count}${filtersActive?` · ${u.filters}: ${filtersActive}`:''}`}</Text>}
  {list.isError&&!!list.rows.length&&<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>}
 </View>;
 return <WorkspaceShell active="clinic" title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<>
  <FlatList<ClinicRecord> data={valid?list.rows:[]} keyExtractor={row=>row.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
   refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
   renderItem={({item})=><ListRow meta={`${day(item.date)} · ${item.farm_name}`} title={label(item)} subtitle={[item.animal_identifier||item.batch_code,item.preview].filter(Boolean).join(' — ')} status={item.severity?{label:t.labels[item.severity]??item.severity,tone:severityTone(item.severity)}:item.status?{label:t.labels[item.status]??item.status,tone:'neutral'}:undefined} leading={<IconTile tone={item.kind==='vaccinations'?'info':'brand'}><HomeIcon name={kindIcon(item.kind)} size={20} color={item.kind==='vaccinations'?colors.info:colors.primary}/></IconTile>} onPress={()=>router.push({pathname:'/clinic/detail',params:{id:item.id,kind:item.kind,...(farmId?{farm:farmId}:{})}})}/>}
   ListEmptyComponent={!valid?<ErrorState message={t.invalidPeriod} language={language}/>:list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty} description={t.scope}/>}
   ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>
  <BottomSheet visible={sheet} title={t.species} onClose={()=>setSheet(false)} language={language}>
   {options.isError?<ErrorState message={w.error} language={language} onRetry={()=>void options.refetch()}/>:options.isPending?<SkeletonList rows={3}/>:<>
    <SheetOption label={t.all} selected={!species} onPress={()=>{setSpecies('');setSheet(false);}}/>
    {options.data.species.map(row=><SheetOption key={row.value} label={t.labels[row.value]??row.label} selected={species===row.value} onPress={()=>{setSpecies(row.value);setSheet(false);}}/>)}
   </>}
  </BottomSheet>
 </>}</WorkspaceShell>;
}
type ClinicDetail=Awaited<ReturnType<ReturnType<typeof useAuth>['controller']['clinicDetail']>>;
function ClinicRecordBody({record}:{record:ClinicDetail}){
 const {language}=useAuth();const t=clinicMessages[language];
 const day=(v:string|null)=>v?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${v}T12:00:00Z`)):null;
 return <>
  <DetailHeader meta={`${day(record.date)}${record.record_time?` · ${record.record_time.slice(0,5)}`:''}`} title={record.kind==='health'?t.labels[record.subtype]??record.title:record.title} leading={<IconTile tone={record.kind==='vaccinations'?'info':'brand'}><HomeIcon name={kindIcon(record.kind)} size={22} color={record.kind==='vaccinations'?colors.info:colors.primary}/></IconTile>} status={[...(record.severity?[{label:t.labels[record.severity]??record.severity,tone:severityTone(record.severity)}]:[]),...(record.status?[{label:t.labels[record.status]??record.status,tone:'neutral' as const}]:[])]}>
   {!!record.notes&&<Text style={{fontSize:15,lineHeight:22,color:colors.textSoft}} selectable>{record.notes}</Text>}
  </DetailHeader>
  <InfoList rows={[[t.farm,record.farm_name],[t.animal,record.animal_identifier],[t.batch,record.batch_code],[t.disease,record.disease],[t.professional,record.professional],...(record.kind==='vaccinations'?[[t.dose,record.dosage_ml!==null?new Intl.NumberFormat(language,{maximumFractionDigits:3}).format(Number(record.dosage_ml)):null],[t.nextDose,day(record.next_dose_date)],[t.vaccineBatch,record.vaccine_batch]] as [string,string|null][]:[]),[t.extra,record.extra_notes]]}/>
  <ApplicationInfo application={record.application}/>
  <Text selectable style={{fontSize:11,color:colors.muted,textAlign:'center'}}>{record.id}</Text>
 </>;
}
export function ClinicDetailScreen(){
 const params=useLocalSearchParams();const route=z.object({id:z.uuid(),kind:z.enum(clinicKinds),farm:z.uuid().optional()}).safeParse(params);const {state,controller,language}=useAuth();const t=clinicMessages[language],w=workspaceMessages[language],router=useRouter();const [failed,setFailed]=useState(false);const allowed=route.success&&state.status==='signedIn'&&canReadClinic(state.session.user);
 const q=useQuery({queryKey:['clinic-detail',params.id,params.kind,params.farm],enabled:allowed,queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.clinicDetail(route.data.id,{kind:route.data.kind,farm:route.data.farm,page:1,search:'',species:'',start:'',end:''},signal);}});
 return <WorkspaceShell active="clinic" title={t.detail} onBack={()=>router.canGoBack()?router.back():router.replace('/clinic')}><ScrollView contentContainerStyle={ms.list}>{!allowed?<EmptyState title={w.noAccess}/>:q.isPending?<SkeletonList rows={4}/>:q.isError?<ErrorState message={t.noAccess} language={language} onRetry={()=>void q.refetch()}/>:<>
  <ClinicRecordBody record={q.data}/>
  {q.data.kind==='health'&&q.data.animal&&state.status==='signedIn'&&canWriteClinic(state.session.user)&&<><SectionLabel title={mobileUiMessages[language].actions}/><ActionGroup><ActionRow label={healthMessages[language].title} icon={<HomeIcon name="leaf" size={20} color={colors.primary}/>} onPress={()=>router.push({pathname:'/clinic/health-form',params:{animal:q.data.animal!,farm:q.data.farm}})}/></ActionGroup></>}
  <WebFallback hint={t.scope} label={t.web} failed={failed?w.failedLink:undefined} onPress={()=>void openClinicWeb(q.data.species).catch(()=>setFailed(true))}/>
 </>}</ScrollView></WorkspaceShell>;
}

export function ClinicHistoryScreen(){
 const params=useLocalSearchParams();const route=z.object({animal:z.uuid().optional(),batch:z.uuid().optional(),farm:z.uuid(),kind:z.enum(clinicKinds).default('health')}).refine(v=>!!v.animal!==!!v.batch).refine(v=>v.kind==='vaccinations'||!!v.animal).safeParse(params);const {state,controller,language}=useAuth();const t=clinicMessages[language],w=workspaceMessages[language],router=useRouter();const [selected,setSelected]=useState<string|null>(null);const allowed=route.success&&state.status==='signedIn'&&canReadClinic(state.session.user);
 const base:Omit<ClinicQuery,'page'>={kind:'health',search:'',species:'',start:'',end:'',...(route.success?route.data:{})};
 const records=useInfinitePages<ClinicRecord>({queryKey:['clinic-reconciliation','infinite',params.kind,params.animal,params.batch,params.farm],enabled:allowed,fetchPage:(page,signal)=>controller.clinicPage({...base,page},signal)});
 const detail=useQuery({queryKey:['clinic-reconciliation-detail',selected,params.kind,params.animal,params.batch,params.farm],enabled:allowed&&!!selected,queryFn:({signal})=>{if(!selected)throw Error('selection');return controller.clinicDetail(selected,{...base,page:1},signal);}});
 return <WorkspaceShell active="clinic" title={t.check} onBack={()=>router.canGoBack()?router.back():router.replace('/clinic')}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<ClinicRecord> contentContainerStyle={ms.list} data={records.isError?[]:records.rows} keyExtractor={row=>row.id}
  refreshControl={<RefreshControl refreshing={records.refreshing} onRefresh={()=>void records.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={records.loadMore} onEndReachedThreshold={0.4}
  ListHeaderComponent={<View style={ms.header}><ScreenIntro title={t.check} subtitle={t.scope}/><Notice tone="neutral" text={t.readonly}/></View>}
  renderItem={({item})=><ListRow meta={`${new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${item.date}T12:00:00Z`))} · ${item.farm_name}`} title={`${item.animal_identifier||item.batch_code} · ${t.labels[item.subtype]??item.title}`} subtitle={item.preview} onPress={()=>setSelected(item.id)}/>}
  ListEmptyComponent={records.isPending?<SkeletonList/>:records.isError?<ErrorState message={w.error} language={language} onRetry={()=>void records.refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={records.rows.length?<ListFooter loading={records.isFetchingNextPage} end={!records.hasNextPage} language={language}/>:undefined}/>}
  <BottomSheet visible={!!selected} title={t.detail} onClose={()=>setSelected(null)} language={language}><View style={{gap:12}}>{detail.isPending?<SkeletonList rows={3}/>:detail.isError?<ErrorState message={w.error} language={language} onRetry={()=>void detail.refetch()}/>:detail.data?<ClinicRecordBody record={detail.data}/>:null}</View></BottomSheet>
 </WorkspaceShell>;
}

function ApplicationInfo({application}:{application:{management:string;status:string;product:string;lot:string;unit:string;quantity:string;milk_until:string|null;meat_until:string|null}|null|undefined}){const {language}=useAuth(),t=medicationMessages[language];if(!application)return null;const date=(value:string|null)=>value?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`)):t.noDate;return <><SectionLabel title={t.application}/><InfoList rows={[[t.product,application.product],[t.lot,application.lot],[t.quantity,`${new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(application.quantity))} ${application.unit}`],[t.milkUntil,date(application.milk_until)],[t.meatUntil,date(application.meat_until)],[t.management,application.management]]}/></>;}
