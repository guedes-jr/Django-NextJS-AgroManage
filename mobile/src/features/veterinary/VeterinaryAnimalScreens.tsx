import {useCallback, useMemo, useState, type ReactNode} from 'react';
import {FlatList, ScrollView, Text, TextInput, View} from 'react-native';
import {useFocusEffect, useLocalSearchParams, useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {AgendaButton, AgendaShell, Busy, StatusPill, styles as s} from '../agenda/ui';
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
  if(!allowed)return <AgendaShell title={a.title} backLabel={t.back} onBack={back}><View style={s.content}><Text style={s.error}>{t.noAccess}</Text></View></AgendaShell>;
  const chipRow=(children:ReactNode)=><ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={{gap:8}}>{children}</ScrollView>;
  return <AgendaShell title={a.title} backLabel={t.back} onBack={back}>
    <FlatList<VetAnimal> contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" data={rows} keyExtractor={row=>row.id}
      ListHeaderComponent={<View style={{gap:12}}>
        <Text style={s.muted}>{a.subtitle}</Text>
        {(clients.data?.length??0)>1&&chipRow(<>
          <AgendaButton label={t.allClients} selected={!filter.client} onPress={()=>set({client:''})}/>
          {clients.data!.map(c=><AgendaButton key={c.id} label={c.farm_name?`${c.name} · ${c.farm_name}`:c.name} selected={filter.client===c.id} onPress={()=>set({client:c.id})}/>)}
        </>)}
        {chipRow(<>
          <AgendaButton label={a.allStatuses} selected={!filter.status} onPress={()=>set({status:''})}/>
          {vetStatuses.map(v=><AgendaButton key={v} label={t.status[v]} selected={filter.status===v} onPress={()=>set({status:v})}/>)}
        </>)}
        {chipRow(<>
          <AgendaButton label={a.allCategories} selected={!filter.category} onPress={()=>set({category:''})}/>
          {vetCategories.map(v=><AgendaButton key={v} label={t.category[v]??v} selected={filter.category===v} onPress={()=>set({category:v})}/>)}
        </>)}
        <TextInput accessibilityLabel={t.search} placeholder={t.search} style={s.input} value={filter.search} onChangeText={v=>set({search:v})} maxLength={100} autoCorrect={false}/>
        <AgendaButton label={t.refresh} disabled={animals.isFetching} onPress={()=>void refetch()}/>
        {animals.isPending&&<Busy label={t.loading}/>}
        {animals.isError&&<><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={()=>void refetch()}/></>}
        {animals.data&&<Text style={s.muted}>{fill(t.count,{count:rows.length})}</Text>}
      </View>}
      renderItem={({item})=><View style={s.card}>
        <Text style={s.muted}>{item.client_name}{item.farm_name?` · ${item.farm_name}`:''}</Text>
        <Text style={s.title}>{item.identifier}{item.name?` · ${item.name}`:''}</Text>
        <View style={s.row}><StatusPill label={t.status[item.status]} tone={STATUS_TONE[item.status]}/><Text style={s.muted}>{t.category[item.category]??item.category} · {fill(a.procedures,{count:item.procedures_count})}</Text></View>
        <Text style={s.body}>{t.next}: {fill(t.nextCode[item.next.code]??item.next.code,{day:item.next.day??''})}</Text>
        <View style={s.row}>
          <AgendaButton label={a.history} onPress={()=>router.push({pathname:'/veterinary/animal',params:{id:item.id}})}/>
          <AgendaButton label={t.launch.start} onPress={()=>router.push({pathname:'/veterinary/launch',params:{client:item.client,animal:item.identifier}})}/>
        </View>
      </View>}
      ListEmptyComponent={animals.data?<Text style={s.body}>{all.length?t.none:t.empty}</Text>:undefined}/>
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
  if(!allowed)return <AgendaShell title={a.history} backLabel={t.back} onBack={back}><View style={s.content}><Text style={s.error}>{t.noAccess}</Text></View></AgendaShell>;
  return <AgendaShell title={title} backLabel={t.back} onBack={back}>
    <FlatList<VetHistory> contentContainerStyle={s.content} data={history.data??[]} keyExtractor={row=>row.id}
      ListHeaderComponent={<View style={{gap:12}}>
        {animal&&<View style={s.card}>
          <Text style={s.muted}>{animal.client_name}{animal.farm_name?` · ${animal.farm_name}`:''}</Text>
          <Text style={s.title}>{animal.identifier}{animal.name?` · ${animal.name}`:''}</Text>
          <View style={s.row}><StatusPill label={t.status[animal.status]} tone={STATUS_TONE[animal.status]}/><Text style={s.muted}>{t.category[animal.category]??animal.category}</Text></View>
          <Text style={s.body}>{t.next}: {fill(t.nextCode[animal.next.code]??animal.next.code,{day:animal.next.day??''})}{animal.next.date?` · ${date(animal.next.date)}`:''}</Text>
          <AgendaButton variant="primary" label={t.launch.start} onPress={()=>router.push({pathname:'/veterinary/launch',params:{client:animal.client,animal:animal.identifier}})}/>
        </View>}
        {history.isPending&&<Busy label={t.loading}/>}
        {history.isError&&<><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={()=>void history.refetch()}/></>}
      </View>}
      renderItem={({item})=>{
        const view=historyLines(t,item,date);
        return <View style={s.card}>
          <Text style={s.muted}>{date(item.date)}</Text>
          <Text style={s.title}>{view.title}</Text>
          {(!!view.result||item.herd_synced)&&<View style={s.row}>
            {!!view.result&&<StatusPill label={view.result} tone={item.result==='pregnant'?'success':'danger'}/>}
            {item.herd_synced&&<StatusPill label={a.inHerd} tone="info"/>}
          </View>}
          {view.lines.map((line,index)=><Text key={index} style={s.body}>{line}</Text>)}
        </View>;
      }}
      ListEmptyComponent={history.data?<Text style={s.body}>{a.empty}</Text>:undefined}/>
  </AgendaShell>;
}
