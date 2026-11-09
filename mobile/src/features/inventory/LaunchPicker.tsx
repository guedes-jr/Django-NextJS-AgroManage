import {useState} from 'react';
import {FlatList,Keyboard,Modal,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,Busy,styles as s} from '../agenda/ui';
import {inventoryMessages} from './messages';
import {launchMessages} from './launchMessages';
type Kind='items'|'lots'|'farms'|'suppliers';
export function LaunchPicker({kind,item,today,unit,withdrawal=false,feedProduct,onSelect,onClose}:{kind:Kind;item?:string;today:string;unit?:string;withdrawal?:boolean;feedProduct?:'ingredient'|'final';onSelect:(id:string,label:string)=>void;onClose:()=>void}){
 const {controller,language}=useAuth();const t=launchMessages[language],i=inventoryMessages[language],w=workspaceMessages[language];const [page,setPage]=useState(1),[draft,setDraft]=useState(''),[search,setSearch]=useState('');
 const q=useQuery({queryKey:['inventory-launch-picker',kind,item,page,search,feedProduct],staleTime:0,queryFn:async({signal})=>{
  if(kind==='farms'){const result=await controller.farms(page,signal);return {rows:result.results.map(r=>({id:r.id,label:r.name,disabled:r.is_active===false})),next:!!result.next};}
  const result=await controller.inventoryPage({kind:kind==='lots'?'lots':kind, ...(kind==='lots'?{item}:{}),page,search,status:'all',category:''},signal);
  return {rows:result.results.map(r=>({id:r.id,label:'numero_lote' in r?`${r.numero_lote||r.id.slice(0,8)} · ${r.quantidade_atual} ${unit??''}`:'nome' in r?r.nome:r.id,disabled:!!feedProduct&&('unidade_medida' in r&&(r.unidade_medida!=='kg'||feedProduct==='final'&&r.categoria!=='racao'&&!r.categorias.includes('racao')))||!('ativo' in r)||!r.ativo||('numero_lote' in r&&(r.data_entrada>today||!!r.data_validade&&r.data_validade<today||withdrawal&&Number(r.quantidade_atual)<=0))})),next:!!result.next};
 }});
 const title=kind==='items'?t.chooseProduct:kind==='lots'?t.chooseLot:kind==='farms'?t.chooseFarm:t.chooseSupplier;
 return <Modal animationType="slide" onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:'#F6F8F1'}}><FlatList contentContainerStyle={s.content} data={q.isError?[]:q.data?.rows??[]} keyExtractor={r=>r.id} keyboardShouldPersistTaps="handled" ListHeaderComponent={<View style={{gap:12}}><Text accessibilityRole="header" style={s.heading}>{title}</Text><AgendaButton label={w.back} onPress={onClose}/>{(kind==='items'||kind==='suppliers')&&<><TextInput accessibilityLabel={title} placeholder={title} value={draft} onChangeText={setDraft} style={s.input} maxLength={100} onSubmitEditing={()=>{setSearch(draft.trim());setPage(1);}}/><AgendaButton label={i.find} onPress={()=>{setSearch(draft.trim());setPage(1);}}/></>}{q.isPending&&<Busy label={w.loading}/ >}{q.isError&&<><Text style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void q.refetch()}/></>}</View>} renderItem={({item:r})=><View style={s.card}><Text style={s.title}>{r.label}</Text><AgendaButton label={r.disabled?t.unavailable:`${t.pick}: ${r.label}`} disabled={r.disabled} onPress={()=>{Keyboard.dismiss();onSelect(r.id,r.label);}}/></View>} ListEmptyComponent={!q.isPending&&!q.isError?<Text>{i.empty}</Text>:undefined} ListFooterComponent={<View style={s.row}><AgendaButton label={w.previous} disabled={page===1||q.isFetching} onPress={()=>setPage(p=>p-1)}/><Text>{`${w.page} ${page}`}</Text><AgendaButton label={w.next} disabled={!q.data?.next||q.isFetching} onPress={()=>setPage(p=>p+1)}/></View>}/></SafeAreaView></Modal>;
}
