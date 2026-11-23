import {useCallback, useMemo, useState} from 'react';
import {FlatList, Linking, ScrollView, Text, TextInput, View} from 'react-native';
import {useFocusEffect, useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {AgendaButton, AgendaShell, Busy, StatusPill, styles as s, type StatusTone} from '../agenda/ui';
import {parseApiUrl} from '../../config/environment';
import {canUseVeterinary, curralPresets, curralRows, curralSummary, daysBetween, type CurralPreset, type VetAnimal, type VetDeadline} from './contracts';
import {fill, veterinaryMessages, type VeterinaryCopy} from './messages';

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

  if(!allowed)return <AgendaShell title={t.title} backLabel={t.back} onBack={back}><View style={s.content}><Text style={s.error}>{t.noAccess}</Text></View></AgendaShell>;

  const header=<View style={{gap:12}}>
    <Text accessibilityRole="header" style={s.title}>{t.curral}</Text>
    <Text style={s.muted}>{t.subtitle}</Text>
    <View style={s.row}>
      <StatusPill label={`${t.late}: ${summary.late}`} tone={summary.late?'danger':'neutral'}/>
      <StatusPill label={`${t.today}: ${summary.today}`} tone={summary.today?'warning':'neutral'}/>
      <StatusPill label={`${t.week}: ${summary.week}`} tone="info"/>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={{gap:8}}>
      {curralPresets.map(value=><AgendaButton key={value} label={t.presets[value]} selected={preset===value} onPress={()=>setPreset(value)}/>)}
    </ScrollView>
    {(clients.data?.length??0)>1&&<ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={{gap:8}}>
      <AgendaButton label={t.allClients} selected={!client} onPress={()=>setClient('')}/>
      {clients.data!.map(row=><AgendaButton key={row.id} label={row.farm_name?`${row.name} · ${row.farm_name}`:row.name} selected={client===row.id} onPress={()=>setClient(row.id)}/>)}
    </ScrollView>}
    <TextInput accessibilityLabel={t.search} placeholder={t.search} style={s.input} value={draft} onChangeText={setDraft} maxLength={100} autoCorrect={false} returnKeyType="search"/>
    <View style={s.row}>
      <AgendaButton label={t.refresh} disabled={animals.isFetching} onPress={refresh}/>
      {!!time&&<Text style={s.muted}>{fill(t.updated,{time})}</Text>}
    </View>
    <AgendaButton variant="primary" label={t.launch.start} onPress={()=>router.push({pathname:'/veterinary/launch',params:client?{client}:{}})}/>
    <AgendaButton label={t.animals.start} onPress={()=>router.push('/veterinary/animals')}/>
    <Text style={s.muted}>{t.readOnlyHint}</Text>
    <AgendaButton label={t.web} onPress={()=>void openWeb('/home/veterinario?aba=al').then(()=>setFailedLink(false)).catch(()=>setFailedLink(true))}/>
    {failedLink&&<Text style={s.error}>{t.failedLink}</Text>}
    {animals.isPending&&<Busy label={t.loading}/>}
    {animals.isError&&<><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={refresh}/></>}
    {animals.data&&<Text style={s.muted}>{fill(t.count,{count:rows.length})}</Text>}
  </View>;

  return <AgendaShell title={t.title} backLabel={t.back} onBack={back}>
    <FlatList<VetAnimal>
      contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" data={rows} keyExtractor={row=>row.id}
      ListHeaderComponent={header}
      renderItem={({item})=>{
        const late=item.deadline==='late'&&item.next.date&&today?daysBetween(item.next.date,today):0;
        return <View style={s.card} accessible accessibilityLabel={`${item.identifier}. ${nextText(t,item)}. ${t.deadline[item.deadline]}`}>
          <Text style={s.muted}>{item.client_name}{item.farm_name?` · ${item.farm_name}`:''}</Text>
          <Text style={s.title}>{item.identifier}{item.name?` · ${item.name}`:''}</Text>
          <Text style={s.body}>{t.next}: {nextText(t,item)}{item.next.date?` · ${date(item.next.date)}`:''}</Text>
          <View style={s.row}>
            <StatusPill label={late>0?fill(t.lateDays,{days:late}):t.deadline[item.deadline]} tone={TONE[item.deadline]}/>
            <StatusPill label={t.status[item.status]}/>
            <Text style={s.muted}>{t.category[item.category]??item.category}</Text>
          </View>
          {item.last&&<Text style={s.muted}>{t.last}: {t.kind[item.last.kind]??item.last.kind} · {date(item.last.date)}</Text>}
          <View style={s.row}>
            <AgendaButton label={t.launch.start} onPress={()=>router.push({pathname:'/veterinary/launch',params:{client:item.client,animal:item.identifier}})}/>
            <AgendaButton label={t.animals.history} onPress={()=>router.push({pathname:'/veterinary/animal',params:{id:item.id}})}/>
          </View>
        </View>;
      }}
      ListEmptyComponent={animals.data?<Text style={s.body}>{all.length?t.none:t.empty}</Text>:undefined}
    />
  </AgendaShell>;
}
