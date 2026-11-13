import {useCallback,useState} from 'react';
import {FlatList,Pressable,Text,TextInput,View} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,Busy,styles as s} from '../agenda/ui';
import {canCreateCattle,type CattleAnimal,type CattleBatch,type CattleKind,type CattleQuery} from './contracts';
import {cattleMessages,cattleLabel} from './messages';
import {dairyMessages} from './dairyMessages';
export function DairyHerd(){
 const {state,controller,language}=useAuth(),{farm}=useWorkspace(),router=useRouter(),t=dairyMessages[language],c=cattleMessages[language],w=workspaceMessages[language];
 const [kind,setKind]=useState<CattleKind>('animals'),[filters,setFilters]=useState(false),[draft,setDraft]=useState(''),[search,setSearch]=useState(''),[status,setStatus]=useState<CattleQuery['status']>('active'),[paging,setPaging]=useState({scope:'',page:1});
 const scope=JSON.stringify([farm?.id,kind,search,status]),page=paging.scope===scope?paging.page:1;
 const q=useQuery({queryKey:['cattle','dairy',kind,farm?.id??null,search,status,page],staleTime:0,queryFn:({signal})=>controller.cattleList({production:'dairy',kind,farm:farm?.id,search,status,page},signal)}),{refetch}=q;
 useFocusEffect(useCallback(()=>{void refetch();},[refetch]));
 const data=q.isError?undefined:q.data,writable=state.status==='signedIn'&&canCreateCattle(state.session.user);
 const find=()=>{setSearch(draft.trim());setPaging({scope:'',page:1});setFilters(false);if(draft.trim()===search&&page===1)void refetch();};
 return <FlatList<CattleAnimal|CattleBatch> data={data?.results??[]} keyExtractor={row=>row.id} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
  ListHeaderComponent={<View style={{gap:12}}><View style={s.row}>{(['animals','batches'] as const).map(value=><AgendaButton key={value} label={c[value]} selected={kind===value} onPress={()=>{setKind(value);setStatus('active');setPaging({scope:'',page:1});}}/>)}</View>
   <View style={s.row}><Text style={[s.title,{flex:1}]}>{t.records}{data?` (${data.count})`:''}</Text><AgendaButton label={filters?t.closeFilters:t.filters} selected={filters||!!search||status!=='active'} onPress={()=>setFilters(value=>!value)}/></View>
   {filters&&<View style={s.card}><TextInput accessibilityLabel={c.search} placeholder={t.search} style={s.input} value={draft} maxLength={100} onChangeText={setDraft} returnKeyType="search" onSubmitEditing={find}/><View style={s.row}>{(['active','all','sold',kind==='animals'?'dead':'finished'] as CattleQuery['status'][]).map(value=><AgendaButton key={value} label={c[value]} selected={status===value} onPress={()=>{setStatus(value);setPaging({scope:'',page:1});}}/>)}</View><View style={s.row}><AgendaButton label={c.find} onPress={find}/><AgendaButton label={t.clear} onPress={()=>{setDraft('');setSearch('');setStatus('active');setPaging({scope:'',page:1});setFilters(false);}}/></View></View>}
   {!!search&&<Text style={s.muted}>{c.search}: {search}</Text>}{status!=='active'&&<Text style={s.badge}>{c[status]}</Text>}
   {writable&&<AgendaButton label={kind==='animals'?t.newAnimal:t.newBatch} disabled={q.isFetching||q.isError} onPress={()=>router.push(kind==='animals'?{pathname:'/cattle/[production]/form',params:{production:'dairy',mode:'create'}}:{pathname:'/cattle/[production]/batch-form',params:{production:'dairy'}})}/>}
   {q.isPending&&<Busy label={w.loading}/ >}{q.isError&&<><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refetch()}/>{page>1&&<AgendaButton label={`${w.page} 1`} onPress={()=>setPaging({scope,page:1})}/>}</>}
  </View>}
  renderItem={({item})=>{const animal='identifier' in item,identity=animal?item.identifier:item.batch_code;return <Pressable accessibilityRole="button" accessibilityLabel={`${c.detail}: ${identity}${item.name?` · ${item.name}`:''}`} onPress={()=>router.push({pathname:'/cattle/[production]/[id]',params:{production:'dairy',id:item.id,kind,...(farm?{farm:farm.id}:{})}})} style={({pressed})=>[s.card,{opacity:pressed?0.7:1}]}><View style={s.row}><View style={{flex:1,gap:5}}><Text style={s.title}>{identity}{item.name?` · ${item.name}`:''}</Text><Text style={s.muted}>{item.farm_name} · {cattleLabel(c,item.category)}</Text></View><Text style={s.title} aria-hidden>›</Text></View><View style={s.row}><Text style={s.badge}>{cattleLabel(c,item.status)}</Text><Text style={s.body}>{animal?cattleLabel(c,item.reproductive_status):`${item.quantity} ${c.quantity}`}</Text>{animal&&item.is_lactating&&item.reproductive_status!=='lactante'&&<Text style={s.badge}>{c.lactating}</Text>}</View></Pressable>;}}
  ListEmptyComponent={data&&!data.count?<Text style={s.body}>{c.empty}</Text>:undefined}
  ListFooterComponent={data?<View style={s.row}><AgendaButton label={w.previous} disabled={!data.previous||q.isFetching} onPress={()=>setPaging({scope,page:Math.max(1,page-1)})}/><Text style={s.body}>{w.page} {page}</Text><AgendaButton label={w.next} disabled={!data.next||q.isFetching} onPress={()=>setPaging({scope,page:page+1})}/></View>:undefined}/ >;
}
