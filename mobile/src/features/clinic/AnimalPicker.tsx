import {useState} from 'react';
import {FlatList,Keyboard,Modal,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,Busy,styles as s} from '../agenda/ui';
import type {ClinicAnimal} from './contracts';
import {clinicMessages} from './messages';
/** Paginated search of the active animals the user may record health events for. */
export function AnimalPicker({farm,species,onSelect,onClose}:{farm?:string;species?:string;onSelect:(animal:ClinicAnimal)=>void;onClose:()=>void}){
 const {controller,language}=useAuth();const t=clinicMessages[language],w=workspaceMessages[language];const [page,setPage]=useState(1),[search,setSearch]=useState(''),[draft,setDraft]=useState('');
 const q=useQuery({queryKey:['clinic-picker',farm,species,page,search],queryFn:({signal})=>controller.clinicAnimals({kind:'health',page,search,species:species??'',start:'',end:'',...(farm?{farm}:{})},signal)});
 return <Modal animationType="slide" onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:'#F6F8F1'}}><FlatList<ClinicAnimal> contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" data={q.isError?[]:q.data?.results??[]} keyExtractor={row=>row.id} ListHeaderComponent={<View style={{gap:12}}><Text accessibilityRole="header" style={s.heading}>{t.choose}</Text><AgendaButton label={w.back} onPress={onClose}/><TextInput accessibilityLabel={t.animal} placeholder={t.animal} style={s.input} value={draft} onChangeText={setDraft} maxLength={100} onSubmitEditing={()=>{setSearch(draft.trim());setPage(1);}}/><AgendaButton label={t.find} onPress={()=>{setSearch(draft.trim());setPage(1);}}/>{q.isPending&&<Busy label={w.loading}/ >}{q.isError&&<><Text style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void q.refetch()}/></>}</View>} renderItem={({item})=><View style={s.card}><Text style={s.title}>{item.identifier}</Text><Text style={s.body}>{item.farm_name} · {t.labels[item.species]??item.species}</Text><AgendaButton label={`${t.pick}: ${item.identifier} · ${item.farm_name}`} onPress={()=>{Keyboard.dismiss();onSelect(item);}}/></View>} ListEmptyComponent={!q.isPending&&!q.isError?<Text style={s.body}>{t.empty}</Text>:undefined} ListFooterComponent={<View style={s.row}><AgendaButton label={w.previous} disabled={page===1||q.isFetching} onPress={()=>setPage(p=>p-1)}/><Text>{w.page} {page}</Text><AgendaButton label={w.next} disabled={!q.data?.next||q.isFetching} onPress={()=>setPage(p=>p+1)}/></View>}/></SafeAreaView></Modal>;
}
