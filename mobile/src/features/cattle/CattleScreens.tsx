import {clinicMessages} from '../clinic/messages';
import {canReadClinic,canWriteClinic} from '../clinic/contracts';
import {vaccinationMessages} from '../clinic/vaccinationMessages';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {CattleOverview} from './CattleOverview';
import {canEditBatch,canTransfer} from './batchContracts';
import {batchMessages} from './batchMessages';
import { organizationDay } from '../workspace/contracts';
import { milkMessages } from '../milk/messages';
import { cattleFormMessages } from './formMessages';
import { useCallback, useState } from 'react';
import { FlatList, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { workspaceMessages } from '../workspace/messages';
import { parseApiUrl } from '../../config/environment';
import { AgendaButton, StatusPill, type StatusTone } from '../agenda/ui';
import { colors } from '../../theme/tokens';
import { ActionGroup, ActionRow, DetailHeader, EmptyState, ErrorState, FilterChips, HeaderAction, IconTile, InfoList, ListFooter, ListRow, MetricGrid, Notice, ScreenIntro, SearchBar, SectionLabel, Segmented, SkeletonList, WebFallback, mobileStyles as ms, mobileUiMessages } from '../../components/mobile';
import { useInfinitePages } from '../../components/mobile/useInfinitePages';
import { DairyIcon, type DairyIconName } from './DairyIcon';
import { canSellCattle } from './saleContracts';
import { saleMessages } from './saleMessages';
import { canReadCattle, canCreateCattle, canEditCattle, canWeighCattle, productionSchema, cattleKinds, type CattleAnimal, type CattleBatch, type CattleKind, type CattleQuery, type Production } from './contracts';
import { cattleMessages, cattleLabel } from './messages';
type Record=CattleAnimal|CattleBatch;
const denied=(error:unknown)=>isAxiosError(error)&&[401,403,404].includes(error.response?.status??0);
const identity=(record:Record)=>'identifier' in record?record.identifier:record.batch_code;
const statusTone=(status:string):StatusTone=>status==='active'?'success':status==='dead'?'danger':status==='sold'?'info':'neutral';
const recordIcon=(item:Record):DairyIconName=>!('identifier' in item)?'herd':item.gender==='M'?'bull':['Bezerro','Novilha'].includes(item.category)?'calf':'cow';
function useBack(){const router=useRouter();return ()=>router.canGoBack()?router.back():router.replace('/');}
/** Herd row shared by beef and dairy lists. */
export function CattleRow({item,onPress}:{item:Record;onPress:()=>void}){
  const {language}=useAuth();const t=cattleMessages[language];
  const animal='identifier' in item,weight=animal?item.current_weight_kg:item.avg_weight_kg;
  const number=(v:string|number)=>new Intl.NumberFormat(language,{maximumFractionDigits:1}).format(Number(v));
  const facts=[cattleLabel(t,item.category),animal?cattleLabel(t,item.gender):`${number(item.quantity)} ${t.quantity.toLowerCase()}`,animal&&item.reproductive_status&&!(item.is_lactating&&item.reproductive_status==='lactante')?cattleLabel(t,item.reproductive_status):null].filter(Boolean).join(' · ');
  const lactating=animal&&item.is_lactating;
  return <ListRow meta={item.farm_name} title={`${identity(item)}${item.name?` · ${item.name}`:''}`} subtitle={facts} value={weight!==null?`${number(weight)} kg`:undefined} status={item.status==='active'?lactating?{label:t.lactating,tone:'info'}:undefined:{label:cattleLabel(t,item.status),tone:statusTone(item.status)}} leading={<IconTile tone={lactating?'info':'brand'}><DairyIcon name={recordIcon(item)} size={22} color={lactating?colors.info:colors.primary}/></IconTile>} onPress={onPress}/>;
}
export function CattleListScreen(){
  const params=useLocalSearchParams<{production:string}>();const parsed=productionSchema.safeParse(params.production);
  const {state,controller,language}=useAuth();const t=cattleMessages[language];const w=workspaceMessages[language];const {farm}=useWorkspace();const router=useRouter();
  const production=parsed.success?parsed.data:'beef';const allowed=parsed.success&&state.status==='signedIn'&&canReadCattle(state.session.user);
  const [kind,setKind]=useState<CattleKind>('animals');const [search,setSearch]=useState('');const [status,setStatus]=useState<CattleQuery['status']>('active');
  const farmKey=farm?.id??null;
  const list=useInfinitePages<Record>({queryKey:['cattle',production,'infinite',kind,farmKey,search,status],enabled:allowed,fetchPage:(page,signal)=>controller.cattleList({production,kind,farm:farm?.id,search,status,page},signal)});
  const {refetch}=list;
  useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
  const writable=state.status==='signedIn'&&canCreateCattle(state.session.user);
  const readOnly=state.status==='signedIn'&&state.session.user.access.read_only;
  const header=<View style={ms.header}>
    <ScreenIntro title={t[production]} subtitle={farm?.name??t.readOnly} badge={readOnly?<View style={{marginTop:6}}><StatusPill label={workspaceMessages[language].readOnly} tone="neutral"/></View>:undefined} action={writable?<HeaderAction label={kind==='animals'?cattleFormMessages[language].create:batchMessages[language].create} onPress={()=>router.push(kind==='animals'?{pathname:'/cattle/[production]/form',params:{production,mode:'create'}}:{pathname:'/cattle/[production]/batch-form',params:{production}})}/>:undefined}/>
    <CattleOverview production={production} farm={farm?.id}/>
    <SectionLabel title={t.animals+' / '+t.batches}/>
    <Segmented value={kind} onChange={value=>{setKind(value);setStatus('active');}} options={cattleKinds.map(value=>({value,label:t[value]}))}/>
    <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
    <FilterChips label={t.status} value={status} onChange={setStatus} options={(['active','all','sold',kind==='animals'?'dead':'finished'] as CattleQuery['status'][]).map(value=>({value,label:t[value]}))}/>
    {list.count!==undefined&&<Text style={{fontSize:12,color:colors.muted}}>{`${list.count} · ${t.lastUpdate} ${new Intl.DateTimeFormat(language,{hour:'2-digit',minute:'2-digit'}).format(list.dataUpdatedAt)}`}</Text>}
    {list.isError&&!!list.rows.length&&<ErrorState message={t.cachedError} language={language} onRetry={()=>void refetch()}/>}
  </View>;
  return <WorkspaceShell active={production} title={parsed.success?t[production]:t.detail}>{!allowed||denied(list.error)?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<Record>
    contentContainerStyle={ms.list} data={list.rows} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
    refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
    renderItem={({item})=><CattleRow item={item} onPress={()=>router.push({pathname:'/cattle/[production]/[id]',params:{production,id:item.id,kind,...(farm?{farm:farm.id}:{})}})}/>}
    ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
    ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}
export function CattleDetailScreen(){
  const params=useLocalSearchParams<{production:string;id:string;kind:string;farm?:string}>();
  const valid=z.object({production:productionSchema,id:z.uuid(),kind:z.enum(cattleKinds),farm:z.uuid().optional()}).safeParse(params);
  const {state,controller,language}=useAuth();const t=cattleMessages[language];const w=workspaceMessages[language];const back=useBack();const [refreshing,setRefreshing]=useState(false);
  const allowed=valid.success&&state.status==='signedIn'&&canReadCattle(state.session.user);
  const query=useQuery({queryKey:['cattle-detail',params.production,params.kind,params.id,params.farm],enabled:allowed,queryFn:({signal})=>{if(!valid.success)throw new Error('invalid route');const {kind,id,production,farm}=valid.data;return controller.cattleDetail(kind,id,production,farm,signal);}});
  const {refetch}=query;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
  const unavailable=denied(query.error);const item=unavailable?undefined:query.data;
  return <WorkspaceShell active={valid.success?valid.data.production:'beef'} title={t.detail} onBack={back}><ScrollView contentContainerStyle={ms.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await refetch();}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>}>
    {!allowed?<EmptyState title={w.noAccess}/>:query.isPending?<SkeletonList rows={4}/>:<>{query.isError&&<ErrorState message={unavailable?t.unavailable:item?t.cachedError:w.error} language={language} onRetry={unavailable?undefined:()=>void refetch()}/>}{item&&valid.success&&<CattleDetailBody item={item} production={valid.data.production} kind={valid.data.kind} farm={valid.data.farm}/>}</>}
  </ScrollView></WorkspaceShell>;
}
function CattleDetailBody({item,production,kind,farm}:{item:Record;production:Production;kind:CattleKind;farm?:string}){
    const {state,controller,language}=useAuth();const t=cattleMessages[language];const w=workspaceMessages[language];const router=useRouter();
    const [linkFailed,setLinkFailed]=useState(false);const [openingMilk,setOpeningMilk]=useState(false);const [milkFailed,setMilkFailed]=useState(false);
    const date=(value:string|null|undefined)=>value?new Intl.DateTimeFormat(language,{dateStyle:'medium'}).format(new Date(`${value}T12:00:00`)):null;
    const number=(value:string|null)=>value===null?'—':new Intl.NumberFormat(language,{maximumFractionDigits:3}).format(Number(value));
  const web=async()=>{const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site){setLinkFailed(true);return;}try{setLinkFailed(false);await Linking.openURL(new URL(`/home/seguimento/${production==='dairy'?'pecuaria-leiteira':'gado-de-corte'}/${kind==='animals'?'cadastro':'lotes'}`,site).href);}catch{setLinkFailed(true);}};
  const openMilk=async(animal:CattleAnimal)=>{if(openingMilk)return;setOpeningMilk(true);setMilkFailed(false);try{const options=await controller.agendaOptions();router.push({pathname:'/milk/form',params:{mode:'individual',animal:animal.id,farm:animal.farm,date:organizationDay(options.timezone)}});}catch{setMilkFailed(true);}finally{setOpeningMilk(false);}};
    if(state.status!=='signedIn')return null;const user=state.session.user;
    const animal='identifier' in item,farmId=animal?item.farm:item.farm_id;
    const target=animal?{animal:item.id,farm:item.farm}:{batch:item.id,farm:item.farm_id};
    const canMilk=production==='dairy'&&animal&&canCreateCattle(user)&&item.status==='active'&&item.gender==='F'&&['Vaca','Matriz'].includes(item.category);
    const canWeigh=canWeighCattle(user,item)&&!!item.entry_date;
    const actions:{key:string;label:string;icon:DairyIconName;onPress:()=>void;disabled?:boolean}[]=[
      ...(canMilk?[{key:'milk',label:milkMessages[language].newIndividual,icon:'milk' as const,disabled:openingMilk,onPress:()=>void openMilk(item as CattleAnimal)}]:[]),
      ...(canWeigh?[{key:'weigh',label:cattleFormMessages[language].weigh,icon:'trend' as const,onPress:()=>router.push({pathname:'/cattle/[production]/form',params:{production,mode:'weight',id:item.id,kind:kind}})}]:[]),
      ...(canWriteClinic(user)&&item.status==='active'&&(animal||item.quantity>0)?[{key:'vac',label:vaccinationMessages[language].title,icon:'heart' as const,onPress:()=>router.push({pathname:'/clinic/vaccination',params:target})}]:[]),
      ...(!animal&&item.status==='active'&&item.quantity>0&&canSellCattle(user)?[{key:'sell',label:saleMessages[language].newSale,icon:'wallet' as const,onPress:()=>router.push({pathname:'/cattle/[production]/sale',params:{production,batch:item.id,farm:item.farm_id}})}]:[]),
      ...(!animal&&item.status==='active'&&item.quantity>0&&canTransfer(user)?[{key:'transfer',label:batchMessages[language].transfer,icon:'herd' as const,onPress:()=>router.push({pathname:'/cattle/[production]/transfer',params:{production,source:item.id,farm:item.farm_id}})}]:[]),
      ...(canReadClinic(user)?[{key:'clinic',label:clinicMessages[language].title,icon:'clipboard' as const,onPress:()=>router.push({pathname:'/clinic',params:target})}]:[]),
      ...(!animal&&canEditBatch(user,item)?[{key:'editBatch',label:batchMessages[language].edit,icon:'clipboard' as const,onPress:()=>router.push({pathname:'/cattle/[production]/batch-form',params:{production,id:item.id,farm:item.farm_id}})}]:[]),
      ...(animal&&canEditCattle(user,item)?[{key:'edit',label:cattleFormMessages[language].edit,icon:'clipboard' as const,onPress:()=>router.push({pathname:'/cattle/[production]/form',params:{production,mode:'edit',id:item.id,kind:'animals'}})}]:[]),
    ];
    const metrics=animal?[{label:t.weight.replace(/\s*\(kg\)$/,''),value:number(item.current_weight_kg),unit:item.current_weight_kg===null?undefined:'kg'},{label:t.category,value:cattleLabel(t,item.category)},{label:t.gender,value:cattleLabel(t,item.gender)}]:[{label:t.quantity,value:String(item.quantity)},{label:t.weight.replace(/\s*\(kg\)$/,''),value:number(item.avg_weight_kg),unit:item.avg_weight_kg===null?undefined:'kg'},{label:t.phase,value:cattleLabel(t,item.phase)}];
    const today=new Date().toISOString().slice(0,10);
    const withdrawal=animal&&((item.milk_withdrawal_until&&item.milk_withdrawal_until>=today)||(item.meat_withdrawal_until&&item.meat_withdrawal_until>=today));
    return <>
      <DetailHeader meta={`${item.farm_name} · ${cattleLabel(t,item.cattle_purpose)}`} title={`${identity(item)}${item.name?` · ${item.name}`:''}`} leading={<IconTile tone="brand"><DairyIcon name={recordIcon(item)} size={24}/></IconTile>} status={[{label:cattleLabel(t,item.status),tone:statusTone(item.status)},...(animal&&item.is_lactating?[{label:t.lactating,tone:'info' as const}]:[]),...(animal&&item.reproductive_status&&item.reproductive_status!=='lactante'?[{label:cattleLabel(t,item.reproductive_status),tone:'neutral' as const}]:[])]}>
        <MetricGrid items={metrics}/>
        {withdrawal&&<Notice tone="warning" text={[item.milk_withdrawal_until&&item.milk_withdrawal_until>=today?`${t.milkWithdrawal} ${date(item.milk_withdrawal_until)}`:null,item.meat_withdrawal_until&&item.meat_withdrawal_until>=today?`${t.meatWithdrawal} ${date(item.meat_withdrawal_until)}`:null].filter(Boolean).join(' · ')}/>}
        {item.status!=='active'&&<Notice tone="neutral" text={t.inactive}/>}
      </DetailHeader>
      {!!actions.length&&<><SectionLabel title={mobileUiMessages[language].actions}/><ActionGroup>{actions.map(a=><ActionRow key={a.key} label={a.label} disabled={a.disabled} icon={<DairyIcon name={a.icon} size={20}/>} onPress={a.onPress}/>)}</ActionGroup></>}
      {milkFailed&&<ErrorState message={w.error} language={language}/>}
      <SectionLabel title={t.detail}/>
      <InfoList rows={[[t.breed,animal?item.breed_name:null],[t.batch,animal?item.batch_code:null],[t.birth,date(item.birth_date)],[t.entry,date(item.entry_date)],[t.milkWithdrawal,animal?date(item.milk_withdrawal_until):null],[t.meatWithdrawal,animal?date(item.meat_withdrawal_until):null],[t.notes,item.notes]]}/>
      {animal&&<AnimalHistory id={item.id} production={production} farm={farm??farmId}/>}
      <WebFallback hint={t.fallback} label={t.web} failed={linkFailed?w.failedLink:undefined} onPress={()=>void web()}/>
    </>;
  }
export function AnimalHistory({id,production,farm,reconcile=false}:{id:string;production:Production;farm?:string;reconcile?:boolean}){
  const {controller,language}=useAuth();const t=cattleMessages[language];const w=workspaceMessages[language];const [opened,setOpened]=useState(false);
  const list=useInfinitePages<{type:string;date:string|null;title:string;subtitle:string}>({queryKey:['cattle-history',production,id,farm,'infinite',...(reconcile?['reconciliation']:[])],enabled:opened,fetchPage:(page,signal)=>controller.cattleHistory(id,production,page,farm,signal)});
  const rows=denied(list.error)||reconcile&&(list.isFetching&&!list.isFetchingNextPage)?[]:list.rows;
  return <View style={{gap:8}}><SectionLabel title={t.history} trailing={opened&&reconcile?<AgendaButton label={t.refresh} disabled={list.isFetching} onPress={()=>void list.refetch()}/>:undefined}/>
    {!opened?<ActionGroup><ActionRow label={t.showHistory} description={t.historyHint} icon={<DairyIcon name="agenda" size={20}/>} onPress={()=>setOpened(true)}/></ActionGroup>:<>
      {(list.isPending||reconcile&&list.isFetching&&!list.isFetchingNextPage)&&<SkeletonList rows={3}/>}
      {list.isError&&<ErrorState message={rows.length?t.cachedError:w.error} language={language} onRetry={()=>void list.refetch()}/>}
      {!!rows.length&&<View style={hs.timeline}>{rows.map((event,index)=><View key={index} style={hs.event}><View style={hs.dot}/><View style={{flex:1,minWidth:0,gap:2}}><Text style={hs.date}>{event.date?new Intl.DateTimeFormat(language,{dateStyle:'medium'}).format(new Date(`${event.date}T12:00:00`)):'—'}</Text><Text style={hs.title}>{event.title}</Text>{!!event.subtitle&&<Text style={hs.subtitle}>{event.subtitle}</Text>}</View></View>)}</View>}
      {!list.isPending&&!list.isError&&!rows.length&&<EmptyState title={t.empty}/>}
      {list.hasNextPage&&<AgendaButton label={mobileUiMessages[language].more} busy={list.isFetchingNextPage} disabled={list.isFetchingNextPage} onPress={list.loadMore}/>}
    </>}
  </View>;
}
const hs=StyleSheet.create({
  timeline:{borderRadius:16,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface,paddingVertical:8,paddingHorizontal:16},
  event:{flexDirection:'row',gap:12,paddingVertical:10,borderLeftWidth:2,borderColor:colors.divider,marginLeft:4,paddingLeft:14},
  dot:{position:'absolute',left:-6,top:16,width:10,height:10,borderRadius:5,backgroundColor:colors.primary},
  date:{fontSize:12,fontWeight:'600',color:colors.muted},
  title:{fontSize:15,fontWeight:'700',color:colors.forest},
  subtitle:{fontSize:13,lineHeight:19,color:colors.textSoft},
});
