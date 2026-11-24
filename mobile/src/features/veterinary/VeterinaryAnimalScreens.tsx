import {useCallback, useMemo, useState} from 'react';
import {FlatList, RefreshControl, Text, View} from 'react-native';
import {colors} from '../../theme/tokens';
import {HomeIcon} from '../home/HomeIcon';
import {BottomSheet, DetailHeader, EmptyState, ErrorState, FilterChips, IconTile, ListRow, Notice, ScreenIntro, SearchBar, SectionLabel, SelectChip, SheetOption, SkeletonList, mobileStyles as ms} from '../../components/mobile';
import {useFocusEffect, useLocalSearchParams, useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import { AgendaButton } from '../agenda/ui';
import { AgendaShell } from '../workspace/AppShell';
import {animalRows, canUseVeterinary, vetCategories, vetStatuses, type AnimalFilter, type VetAnimal, type VetHistory} from './contracts';
import {fill, historyLines, veterinaryMessages} from './messages';

const STATUS_TONE={pregnant:'success',inseminated:'info',protocol:'warning',open:'danger',attended:'neutral',none:'neutral'} as const;

/** VT01 · Animais: every animal of the area with filters; each opens its history. */
export function VeterinaryAnimalsScreen(){
  const {state,controller,language}=useAuth();
  const router=useRouter();
  const t=veterinaryMessages[language],a=t.animals;
  const allowed=state.status==='signedIn'&&canUseVeterinary(state.session.user);
  const [filter,setFilter]=useState<AnimalFilter>({client:'',status:'',category:'',search:''});
  const animals=useQuery({queryKey:['vet-animals'],enabled:allowed,queryFn:({signal})=>controller.vetAnimals(signal)});
  const clients=useQuery({queryKey:['vet-clients'],enabled:allowed,queryFn:({signal})=>controller.vetClients(signal)});
  const {refetch}=animals;
  useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
  const all=useMemo(()=>animals.data??[],[animals.data]);
  const rows=useMemo(()=>animalRows(all,filter),[all,filter]);
  const back=()=>router.canGoBack()?router.back():router.replace('/veterinary');
  const set=(patch:Partial<AnimalFilter>)=>setFilter(f=>({...f,...patch}));
  const [sheet,setSheet]=useState<'client'|'category'|null>(null);
  if(!allowed)return <AgendaShell title={a.title} backLabel={t.back} onBack={back}><View style={ms.list}><EmptyState title={t.noAccess}/></View></AgendaShell>;
  const clientRow=clients.data?.find(c=>c.id===filter.client);
  return <AgendaShell title={a.title} backLabel={t.back} onBack={back}>
    <FlatList<VetAnimal> contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" data={rows} keyExtractor={row=>row.id}
      refreshControl={<RefreshControl refreshing={false} onRefresh={()=>void refetch()} tintColor={colors.primary} colors={[colors.primary]}/>}
      ListHeaderComponent={<View style={ms.header}>
        <ScreenIntro title={a.title} subtitle={a.subtitle}/>
        <SearchBar value={filter.search} onChange={v=>set({search:v})} placeholder={t.search} language={language} debounce={150}/>
        <FilterChips value={filter.status} onChange={v=>set({status:v})} options={[{value:'' as const,label:a.allStatuses},...vetStatuses.map(v=>({value:v,label:t.status[v]}))]} trailing={<>
          <SelectChip label={a.allCategories} value={filter.category?t.category[filter.category]??filter.category:undefined} active={!!filter.category} onPress={()=>setSheet('category')}/>
          {(clients.data?.length??0)>1&&<SelectChip label={t.allClients} value={clientRow?.name} active={!!filter.client} onPress={()=>setSheet('client')}/>}
        </>}/>
        {animals.isError&&!!all.length&&<ErrorState message={t.error} language={language} onRetry={()=>void refetch()}/>}
        {animals.data&&<Text style={{fontSize:12,color:colors.muted}}>{fill(t.count,{count:rows.length})}</Text>}
      </View>}
      renderItem={({item})=><ListRow meta={`${item.client_name}${item.farm_name?` · ${item.farm_name}`:''}`} title={`${item.identifier}${item.name?` · ${item.name}`:''}`} subtitle={`${t.next}: ${fill(t.nextCode[item.next.code]??item.next.code,{day:item.next.day??''})} · ${t.category[item.category]??item.category} · ${fill(a.procedures,{count:item.procedures_count})}`} status={{label:t.status[item.status],tone:STATUS_TONE[item.status]}} leading={<IconTile tone={STATUS_TONE[item.status]}><HomeIcon name="heart" size={20} color={colors.textSoft}/></IconTile>} accessibilityLabel={`${item.identifier}. ${a.history}`} onPress={()=>router.push({pathname:'/veterinary/animal',params:{id:item.id}})}
        extra={<View style={{flexDirection:'row',marginTop:8}}><AgendaButton label={t.launch.start} onPress={()=>router.push({pathname:'/veterinary/launch',params:{client:item.client,animal:item.identifier}})}/></View>}/>}
      ListEmptyComponent={animals.isPending?<SkeletonList/>:animals.isError?<ErrorState message={t.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={all.length?t.none:t.empty}/>}/>
    <BottomSheet visible={sheet==='category'} title={a.allCategories} onClose={()=>setSheet(null)} language={language}>
      <SheetOption label={a.allCategories} selected={!filter.category} onPress={()=>{set({category:''});setSheet(null);}}/>
      {vetCategories.map(v=><SheetOption key={v} label={t.category[v]??v} selected={filter.category===v} onPress={()=>{set({category:v});setSheet(null);}}/>)}
    </BottomSheet>
    <BottomSheet visible={sheet==='client'} title={t.allClients} onClose={()=>setSheet(null)} language={language}>
      <SheetOption label={t.allClients} selected={!filter.client} onPress={()=>{set({client:''});setSheet(null);}}/>
      {clients.data?.map(c=><SheetOption key={c.id} label={c.farm_name?`${c.name} · ${c.farm_name}`:c.name} selected={filter.client===c.id} onPress={()=>{set({client:c.id});setSheet(null);}}/>)}
    </BottomSheet>
  </AgendaShell>;
}

/** VT01 · Histórico do animal: every procedure, newest first, without values. */
export function VeterinaryAnimalScreen(){
  const params=useLocalSearchParams();
  const route=z.object({id:z.uuid()}).safeParse(params);
  const {state,controller,language}=useAuth();
  const router=useRouter();
  const t=veterinaryMessages[language],a=t.animals;
  const allowed=route.success&&state.status==='signedIn'&&canUseVeterinary(state.session.user);
  const animals=useQuery({queryKey:['vet-animals'],enabled:allowed,queryFn:({signal})=>controller.vetAnimals(signal)});
  const history=useQuery({queryKey:['vet-history',route.success?route.data.id:''],enabled:allowed,queryFn:({signal})=>controller.vetHistory(route.success?route.data.id:'',signal)});
  const animal=animals.data?.find(row=>route.success&&row.id===route.data.id);
  const date=(day:string)=>new Intl.DateTimeFormat(language,{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`));
  const back=()=>router.canGoBack()?router.back():router.replace('/veterinary/animals');
  const title=animal?fill(a.historyTitle,{animal:animal.identifier}):a.history;
  if(!allowed)return <AgendaShell title={a.history} backLabel={t.back} onBack={back}><View style={ms.list}><EmptyState title={t.noAccess}/></View></AgendaShell>;
  return <AgendaShell title={title} backLabel={t.back} onBack={back}>
    <FlatList<VetHistory> contentContainerStyle={ms.list} data={history.data??[]} keyExtractor={row=>row.id}
      refreshControl={<RefreshControl refreshing={false} onRefresh={()=>{void history.refetch();void animals.refetch();}} tintColor={colors.primary} colors={[colors.primary]}/>}
      ListHeaderComponent={<View style={ms.header}>
        {animal&&<DetailHeader meta={`${animal.client_name}${animal.farm_name?` · ${animal.farm_name}`:''}`} title={`${animal.identifier}${animal.name?` · ${animal.name}`:''}`} leading={<IconTile tone={STATUS_TONE[animal.status]}><HomeIcon name="heart" size={22} color={colors.textSoft}/></IconTile>} status={[{label:t.status[animal.status],tone:STATUS_TONE[animal.status]},{label:t.category[animal.category]??animal.category,tone:'neutral'}]}>
          <Notice tone="info" text={`${t.next}: ${fill(t.nextCode[animal.next.code]??animal.next.code,{day:animal.next.day??''})}${animal.next.date?` · ${date(animal.next.date)}`:''}`}/>
        </DetailHeader>}
        {animal&&<AgendaButton variant="primary" label={t.launch.start} onPress={()=>router.push({pathname:'/veterinary/launch',params:{client:animal.client,animal:animal.identifier}})}/>}
        <SectionLabel title={a.history}/>
        {history.isError&&<ErrorState message={t.error} language={language} onRetry={()=>void history.refetch()}/>}
      </View>}
      renderItem={({item})=>{
        const view=historyLines(t,item,date);
        return <ListRow meta={date(item.date)} title={view.title} subtitle={view.lines.join('\n')||undefined} status={view.result?{label:view.result,tone:item.result==='pregnant'?'success':'danger'}:item.herd_synced?{label:a.inHerd,tone:'info'}:undefined}/>;
      }}
      ListEmptyComponent={history.isPending?<SkeletonList rows={3}/>:history.data?<EmptyState title={a.empty}/>:undefined}/>
  </AgendaShell>;
}
