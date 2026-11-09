import {useState} from 'react';
import {FlatList,Keyboard,Modal,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,Busy,styles as s} from '../agenda/ui';
import type {Production} from '../cattle/contracts';
import {feedingProductPage,feedingFormulaPage,type FeedingProduct,type FeedingFormula} from './contracts';
import {feedingMessages} from './messages';
export function FeedingPicker({production,kind,onSelect,onClose}:{production:Production;kind:'products'|'formulas';onSelect:(value:FeedingProduct|FeedingFormula)=>void;onClose:()=>void}){
 const {controller,language}=useAuth();const t=feedingMessages[language],w=workspaceMessages[language];const [search,setSearch]=useState(''),[draft,setDraft]=useState(''),[page,setPage]=useState(1);
 const q=useQuery({queryKey:['feeding-picker',kind,production,search,page],queryFn:async({signal})=>{const data=await controller.dailyFeeding({production,resource:kind,search,page},signal);return kind==='products'?feedingProductPage.parse(data):feedingFormulaPage.parse(data);}});
 return <Modal animationType="slide" onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:'#F6F8F1'}}><FlatList<FeedingProduct|FeedingFormula> contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" data={q.isError?[]:q.data?.results??[]} keyExtractor={row=>row.id} ListHeaderComponent={<View style={{gap:12}}><Text accessibilityRole="header" style={s.heading}>{kind==='products'?t.chooseProduct:t.chooseFormula}</Text><AgendaButton label={w.back} onPress={onClose}/><TextInput style={s.input} accessibilityLabel={t.searchChoice} value={draft} onChangeText={setDraft} maxLength={100} onSubmitEditing={()=>{setPage(1);setSearch(draft.trim());}}/><AgendaButton label={t.find} onPress={()=>{setPage(1);setSearch(draft.trim());}}/>{q.isPending&&<Busy label={w.loading}/ >}{q.isError&&<><Text style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void q.refetch()}/></>}</View>} renderItem={({item})=><View style={s.card}><Text style={s.title}>{item.name}</Text>{'item_name' in item&&<Text style={s.body}>{t.product}: {item.item_name}</Text>}<AgendaButton label={`${t.select}: ${item.name}`} onPress={()=>{Keyboard.dismiss();onSelect(item);}}/></View>} ListEmptyComponent={!q.isPending&&!q.isError?<Text style={s.body}>{t.empty}</Text>:undefined} ListFooterComponent={<View style={s.row}><AgendaButton label={w.previous} disabled={page===1||q.isFetching} onPress={()=>setPage(p=>p-1)}/><Text>{w.page} {page}</Text><AgendaButton label={w.next} disabled={!q.data?.next||q.isFetching} onPress={()=>setPage(p=>p+1)}/></View>}/></SafeAreaView></Modal>;
}
