import {useCallback, useMemo, useState} from 'react';
import {FlatList, Linking, RefreshControl, Text, View} from 'react-native';
import {useFocusEffect, useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import { AgendaButton, StatusPill, type StatusTone } from '../agenda/ui';
import { HomeIcon } from '../home/HomeIcon';
import { colors } from '../../theme/tokens';
import { BottomSheet, EmptyState, ErrorState, FilterChips, HeaderAction, IconTile, KpiStrip, ListRow, ScreenIntro, SearchBar, SelectChip, SheetOption, Shortcut, SkeletonList, WebFallback, mobileStyles as ms } from '../../components/mobile';
import { AgendaShell } from '../workspace/AppShell';
import {parseApiUrl} from '../../config/environment';
import {canUseVeterinary, curralPresets, curralRows, curralSummary, daysBetween, type CurralPreset, type VetAnimal, type VetDeadline} from './contracts';
import {fill, veterinaryMessages, type VeterinaryCopy} from './messages';

import { vetConsultationCopy } from './VeterinaryConsultationScreens';
import { accountsCopy } from './VeterinaryAccountsScreens';

const TONE:Record<VetDeadline,StatusTone>={late:'danger',today:'warning',week:'info',later:'neutral',nodate:'neutral'};

async function openWeb(path:string){
  const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);
  if(!site)throw new Error('site');
  await Linking.openURL(new URL(path,site).href);
}

function nextText(t:VeterinaryCopy,animal:VetAnimal){return fill(t.nextCode[animal.next.code]??animal.next.code,{day:animal.next.day??''});}

/** VT01 · Alertas e lista de curral: read-only list of what must be done, ordered by date. */
export function VeterinaryCurralScreen(){
  const {state,controller,language}=useAuth();
  const router=useRouter();
  const t=veterinaryMessages[language];
  const allowed=state.status==='signedIn'&&canUseVeterinary(state.session.user);
  const [preset,setPreset]=useState<CurralPreset>('week');
  const [client,setClient]=useState('');
  const [draft,setDraft]=useState('');
  const [failedLink,setFailedLink]=useState(false);
  const workspace=useQuery({queryKey:['vet-workspace'],enabled:allowed,queryFn:({signal})=>controller.vetWorkspace(signal)});
  const animals=useQuery({queryKey:['vet-animals'],enabled:allowed,queryFn:({signal})=>controller.vetAnimals(signal)});
  const clients=useQuery({queryKey:['vet-clients'],enabled:allowed,queryFn:({signal})=>controller.vetClients(signal)});
  const {refetch:refetchAnimals}=animals,{refetch:refetchWorkspace}=workspace;
  useFocusEffect(useCallback(()=>{if(allowed){void refetchAnimals();void refetchWorkspace();}},[allowed,refetchAnimals,refetchWorkspace]));

  const all=useMemo(()=>animals.data??[],[animals.data]);
  const rows=useMemo(()=>curralRows(all,{preset,client,search:draft}),[all,preset,client,draft]);
  const summary=curralSummary(all);
  const today=workspace.data?.today??'';
  const date=(day:string)=>new Intl.DateTimeFormat(language,{day:'2-digit',month:'2-digit',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`));
  const time=animals.dataUpdatedAt?new Intl.DateTimeFormat(language,{hour:'2-digit',minute:'2-digit'}).format(new Date(animals.dataUpdatedAt)):'';
  const refresh=()=>{void animals.refetch();void workspace.refetch();void clients.refetch();};
  const back=()=>router.canGoBack()?router.back():router.replace('/');
  const [sheet,setSheet]=useState(false);
  const [refreshing,setRefreshing]=useState(false);

  if(!allowed)return <AgendaShell title={t.title} backLabel={t.back} onBack={back}><View style={ms.list}><EmptyState title={t.noAccess}/></View></AgendaShell>;
  const clientRow=clients.data?.find(row=>row.id===client);

  const header=<View style={ms.header}>
    <ScreenIntro title={t.curral} subtitle={t.subtitle} action={<HeaderAction label={t.launch.start} onPress={()=>router.push({pathname:'/veterinary/launch',params:client?{client}:{}})}/>}/>
    <KpiStrip items={[
      {key:'late',label:t.late,value:String(summary.late),tone:summary.late?'danger':undefined,selected:preset==='late',onPress:()=>setPreset(preset==='late'?'all':'late')},
      {key:'today',label:t.today,value:String(summary.today),tone:summary.today?'warning':undefined,selected:preset==='today',onPress:()=>setPreset(preset==='today'?'all':'today')},
      {key:'week',label:t.week,value:String(summary.week),tone:'info',selected:preset==='week',onPress:()=>setPreset(preset==='week'?'all':'week')},
    ]}/>
    <View style={ms.wrap}>
      <Shortcut label={t.animals.start} icon={<HomeIcon name="leaf" size={18} color={colors.primary}/>} onPress={()=>router.push('/veterinary/animals')}/>
      <Shortcut label={accountsCopy[language].clients} icon={<HomeIcon name="group" size={18} color={colors.primary}/>} onPress={()=>router.push('/veterinary/clients')}/>
      <Shortcut label={accountsCopy[language].billing} icon={<HomeIcon name="wallet" size={18} color={colors.primary}/>} onPress={()=>router.push('/veterinary/billing')}/>
      <Shortcut label={vetConsultationCopy[language].herd} icon={<HomeIcon name="group" size={18} color={colors.primary}/>} onPress={()=>router.push('/veterinary/herd')}/>
      <Shortcut label={vetConsultationCopy[language].report} icon={<HomeIcon name="chart" size={18} color={colors.primary}/>} onPress={()=>router.push('/veterinary/report')}/>
    </View>
    <SearchBar value={draft} onChange={setDraft} placeholder={t.search} language={language} debounce={150}/>
    <FilterChips value={preset} onChange={setPreset} options={curralPresets.map(value=>({value,label:t.presets[value]}))} trailing={(clients.data?.length??0)>1?<SelectChip label={t.allClients} value={clientRow?clientRow.name:undefined} active={!!client} onPress={()=>setSheet(true)}/>:undefined}/>
    {animals.isError&&!!all.length&&<ErrorState message={t.error} language={language} onRetry={refresh}/>}
    {animals.data&&<Text style={{fontSize:12,color:colors.muted}}>{fill(t.count,{count:rows.length})}{time?` · ${fill(t.updated,{time})}`:''}</Text>}
  </View>;

  return <AgendaShell title={t.title} backLabel={t.back} onBack={back}>
    <FlatList<VetAnimal>
      contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" data={rows} keyExtractor={row=>row.id}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await Promise.all([animals.refetch(),workspace.refetch(),clients.refetch()]);}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>}
      renderItem={({item})=>{
        const late=item.deadline==='late'&&item.next.date&&today?daysBetween(item.next.date,today):0;
        return <ListRow meta={`${item.client_name}${item.farm_name?` · ${item.farm_name}`:''}`} title={`${item.identifier}${item.name?` · ${item.name}`:''}`} subtitle={`${t.next}: ${nextText(t,item)}${item.next.date?` · ${date(item.next.date)}`:''}${item.last?`\n${t.last}: ${t.kind[item.last.kind]??item.last.kind} · ${date(item.last.date)}`:''}`} status={{label:late>0?fill(t.lateDays,{days:late}):t.deadline[item.deadline],tone:TONE[item.deadline]}} leading={<IconTile tone={TONE[item.deadline]}><HomeIcon name="heart" size={20} color={colors.textSoft}/></IconTile>} accessibilityLabel={`${item.identifier}. ${nextText(t,item)}. ${t.deadline[item.deadline]}. ${t.animals.history}`} onPress={()=>router.push({pathname:'/veterinary/animal',params:{id:item.id}})}
          extra={<View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:8}}><StatusPill label={t.status[item.status]}/><Text style={{fontSize:12,color:colors.muted,alignSelf:'center'}}>{t.category[item.category]??item.category}</Text><View style={{flexGrow:1}}/><AgendaButton label={t.launch.start} onPress={()=>router.push({pathname:'/veterinary/launch',params:{client:item.client,animal:item.identifier}})}/></View>}/>;
      }}
      ListEmptyComponent={animals.isPending?<SkeletonList/>:animals.isError?<ErrorState message={t.error} language={language} onRetry={refresh}/>:<EmptyState title={all.length?t.none:t.empty}/>}
      ListFooterComponent={<WebFallback hint={t.subtitle} label={t.web} failed={failedLink?t.failedLink:undefined} onPress={()=>void openWeb('/home/veterinario?aba=al').then(()=>setFailedLink(false)).catch(()=>setFailedLink(true))}/>}
    />
    <BottomSheet visible={sheet} title={t.allClients} onClose={()=>setSheet(false)} language={language}>
      <SheetOption label={t.allClients} selected={!client} onPress={()=>{setClient('');setSheet(false);}}/>
      {clients.data?.map(row=><SheetOption key={row.id} label={row.farm_name?`${row.name} · ${row.farm_name}`:row.name} selected={client===row.id} onPress={()=>{setClient(row.id);setSheet(false);}}/>)}
    </BottomSheet>
  </AgendaShell>;
}
