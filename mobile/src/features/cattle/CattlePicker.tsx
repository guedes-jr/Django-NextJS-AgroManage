import {useState} from 'react';
import {Modal,FlatList,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,Busy,styles as s} from '../agenda/ui';
import {batchMessages} from './batchMessages';
import {cattleMessages} from './messages';
import type {CattleAnimal,CattleBatch,Production} from './contracts';
export function CattlePicker({source,production,animals,selected,onAnimal,onDestination,onClose}:{source:CattleBatch;production:Production;animals:boolean;selected:string[];onAnimal:(record:CattleAnimal)=>void;onDestination:(record:CattleBatch)=>void;onClose:()=>void}){
 const {controller,language}=useAuth();const w=workspaceMessages[language];const b=batchMessages[language];const t=cattleMessages[language];const [page,setPage]=useState(1);const [draft,setDraft]=useState('');const [search,setSearch]=useState('');
 const q=useQuery({queryKey:['cattle-picker',production,source.id,animals,page,search],staleTime:0,queryFn:({signal})=>controller.cattleList({production,farm:source.farm_id,kind:animals?'animals':'batches',batch:animals?source.id:undefined,status:'active',page,search},signal)});
 const rows=q.isError?[]:q.data?.results??[];
 return <Modal animationType="slide" onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:'#F5F7F0'}}><FlatList<CattleAnimal|CattleBatch> contentContainerStyle={s.content} data={rows} keyExtractor={r=>r.id} keyboardShouldPersistTaps="handled" ListHeaderComponent={<View style={{gap:12}}><Text style={s.heading}>{animals?b.participants:b.destination}</Text><AgendaButton label={w.back} onPress={onClose}/>{animals&&<Text style={s.body}>{b.selected}: {selected.length}</Text>}<TextInput style={s.input} accessibilityLabel={t.search} value={draft} onChangeText={setDraft} onSubmitEditing={()=>{setPage(1);setSearch(draft.trim());}}/><AgendaButton label={t.find} onPress={()=>{setPage(1);setSearch(draft.trim());}}/>{q.isPending&&<Busy label={w.loading}/ >}{q.isError&&<><Text style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void q.refetch()}/></>}</View>} renderItem={({item})=>{
 const compatible='identifier' in item?item.batch===source.id&&item.farm===source.farm_id:item.id!==source.id&&item.farm_id===source.farm_id&&item.category===source.category&&item.gender===source.gender&&item.cattle_purpose===source.cattle_purpose;
 return <View style={s.card}><Text style={s.title}>{'identifier' in item?item.identifier:item.batch_code}</Text><Text style={s.body}>{item.name}</Text><Text style={s.muted}>{item.category} · {item.gender}{'quantity' in item?` · ${item.quantity}`:''}</Text><AgendaButton label={compatible?b.choose:b.incompatible} selected={selected.includes(item.id)} disabled={!compatible||(!selected.includes(item.id)&&animals&&selected.length>=1000)} onPress={()=>'identifier' in item?onAnimal(item):onDestination(item)}/></View>;
 }} ListEmptyComponent={!q.isPending&&!q.isError?<Text>{t.empty}</Text>:undefined} ListFooterComponent={<View style={s.row}><AgendaButton label={w.previous} disabled={!q.data?.previous||q.isFetching} onPress={()=>setPage(p=>p-1)}/><Text>{`${w.page} ${page}`}</Text><AgendaButton label={w.next} disabled={!q.data?.next||q.isFetching} onPress={()=>setPage(p=>p+1)}/></View>}/></SafeAreaView></Modal>;
}
