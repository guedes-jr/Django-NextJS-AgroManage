import {useId,useRef,useState} from 'react';
import {Alert,KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import {useLocalSearchParams,usePreventRemove,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Controller,useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {isAxiosError} from 'axios';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {AgendaShell,AgendaButton,Busy,styles as s} from '../agenda/ui';
import {InventorySaveUnconfirmed} from '../../services/authApi';
import {canWriteInventory,type InventoryItem,type InventoryLot} from './contracts';
import {stockCountSchema,hundredths,type StockCountInput} from './movementContracts';
import {movementMessages} from './movementMessages';
import {inventoryMessages} from './messages';
import {inventoryFormMessages} from './formMessages';
export function StockCountScreen(){
 const params=useLocalSearchParams();const id=z.uuid().safeParse(params.id);const instance=useId();const {state,controller,language}=useAuth();const router=useRouter();const t=movementMessages[language],w=workspaceMessages[language];const allowed=id.success&&state.status==='signedIn'&&canWriteInventory(state.session.user);
 const q=useQuery({queryKey:['inventory-count-form',instance,params.id],enabled:allowed,staleTime:0,gcTime:0,refetchOnMount:'always',refetchOnReconnect:false,networkMode:'always',queryFn:async({signal})=>{if(!id.success)throw Error('id');const lot=await controller.inventoryLot(id.data,signal);const item=await controller.inventoryDetail('items',lot.item,signal);if(!('estoque_atual' in item))throw Error('item');return {lot,item};}});
 const back=()=>router.canGoBack()?router.back():router.replace('/inventory');
 if(!allowed||q.isError)return <AgendaShell title={t.count} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{allowed?w.error:w.noAccess}</Text>{allowed&&<AgendaButton label={w.retry} onPress={()=>void q.refetch()}/>}</View></AgendaShell>;
 if(q.isPending||q.isFetching)return <AgendaShell title={t.count} backLabel={w.back} onBack={back}><Busy label={w.loading}/></AgendaShell>;
 if(!q.data.item.ativo||!q.data.lot.ativo)return <AgendaShell title={t.count} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{t.blocked}</Text></View></AgendaShell>;
 return <CountEditor lot={q.data.lot} item={q.data.item}/>;
}
function CountEditor({lot,item}:{lot:InventoryLot;item:InventoryItem}){
 const {controller,language}=useAuth();const router=useRouter();const client=useQueryClient();const t=movementMessages[language],i=inventoryMessages[language],f=inventoryFormMessages[language],w=workspaceMessages[language];
 const {control,handleSubmit,formState:{isDirty,isSubmitting}}=useForm<StockCountInput>({resolver:zodResolver(stockCountSchema),defaultValues:{quantidade_contada:'',saldo_esperado:lot.quantidade_atual,motivo:''}});
 const [review,setReview]=useState<StockCountInput|null>(null),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState(''),[discarding,setDiscarding]=useState(false);const lock=useRef(false);
 usePreventRemove(!saved&&!discarding&&(isDirty||isSubmitting||busy||uncertain),({repeat})=>{if(lock.current)return;const discard=()=>{setDiscarding(true);repeat();};const body=uncertain?t.leaveUnknown:f.discardBody;if(Platform.OS==='web'){if(window.confirm(`${f.discardTitle}\n${body}`))discard();}else Alert.alert(f.discardTitle,body,[{text:f.stay,style:'cancel'},{text:f.discard,style:'destructive',onPress:discard}]);});
 const back=()=>{if(!lock.current){if(router.canGoBack())router.back();else router.replace({pathname:'/inventory/lots/[id]',params:{id:lot.id}});}};
 const confirm=async()=>{if(lock.current||!review||saved||uncertain||conflict)return;lock.current=true;setBusy(true);setMessage('');
 try{const result=await controller.countInventory(lot.id,item.id,item.unidade_medida,review);setSaved(result.id);for(const key of ['inventory','inventory-summary','inventory-detail','inventory-lots','inventory-lot-detail','inventory-movements','inventory-movement-detail'])void client.invalidateQueries({queryKey:[key]});}
 catch(error){if(error instanceof InventorySaveUnconfirmed){setUncertain(true);setMessage(t.uncertain);}else if(isAxiosError(error)&&error.response?.status===409){setConflict(true);setMessage(t.conflict);}else setMessage(f.failed);}
 finally{lock.current=false;setBusy(false);}};
 const number=(value:string)=>new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(value.replace(',','.')));
 return <AgendaShell title={t.count} backLabel={w.back} onBack={back}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><View style={s.card}><Text style={s.title}>{item.nome}</Text><Text style={s.body}>{lot.numero_lote||i.unknown}</Text><Text style={s.body}>{t.expected}: {number(lot.quantidade_atual)} {item.unidade_medida}</Text></View><Text style={s.muted}>{t.countHint}</Text>
 {saved?<><Text accessibilityRole="alert" style={s.title}>{t.saved}</Text><Text selectable style={s.body}>{t.transaction}: {saved}</Text><AgendaButton label={t.detail} onPress={()=>router.replace({pathname:'/inventory/movements/[id]',params:{id:saved}})}/><AgendaButton label={w.back} onPress={back}/></>:review?<><View style={s.card}><Text style={s.body}>{t.counted}: {number(review.quantidade_contada)} {item.unidade_medida}</Text><Text style={s.title}>{t.difference}: {new Intl.NumberFormat(language,{signDisplay:'exceptZero',maximumFractionDigits:2}).format((hundredths(review.quantidade_contada)-hundredths(review.saldo_esperado))/100)} {item.unidade_medida}</Text><Text style={s.body}>{t.reason}: {review.motivo}</Text></View><AgendaButton label={busy?w.loading:t.confirm} disabled={busy||uncertain||conflict} onPress={()=>void confirm()}/>{!uncertain&&!conflict&&<AgendaButton label={t.change} disabled={busy} onPress={()=>setReview(null)}/>}</>:<><Text style={s.label}>{t.counted} ({item.unidade_medida})</Text><Controller control={control} name="quantidade_contada" render={({field,fieldState})=><TextInput accessibilityLabel={t.counted} style={[s.input,fieldState.invalid&&{borderColor:'#9A3028'}]} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} ref={field.ref} keyboardType="decimal-pad"/>}/><Text style={s.label}>{t.reason}</Text><Controller control={control} name="motivo" render={({field,fieldState})=><TextInput accessibilityLabel={t.reason} style={[s.input,{minHeight:90,textAlignVertical:'top'},fieldState.invalid&&{borderColor:'#9A3028'}]} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} ref={field.ref} multiline maxLength={1000}/>}/><AgendaButton label={t.review} onPress={()=>void handleSubmit(value=>{setReview(value);setMessage('');},()=>setMessage(t.countInvalid))()}/></>}
 {!!message&&<Text accessibilityRole="alert" style={s.error}>{message}</Text>}{(uncertain||conflict)&&<AgendaButton label={t.reviewStock} onPress={()=>router.push({pathname:'/inventory/lots/[id]',params:{id:lot.id}})}/>}</ScrollView></KeyboardAvoidingView></AgendaShell>;
}
