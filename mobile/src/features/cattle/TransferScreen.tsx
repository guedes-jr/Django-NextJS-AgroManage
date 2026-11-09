import {useId,useRef,useState} from 'react';
import {Alert,KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import {useLocalSearchParams,usePreventRemove,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {randomUUID} from 'expo-crypto';
import {isAxiosError} from 'axios';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {organizationDay} from '../workspace/contracts';
import {workspaceMessages} from '../workspace/messages';
import {AgendaShell,AgendaButton,Busy,styles as s} from '../agenda/ui';
import {AuthFailure} from '../../services/authApi';
import {productionSchema,type CattleBatch,type Production} from './contracts';
import {canTransfer,transferInput,transferPreviewSchema,matchesPreview,type TransferInput,type TransferPreview} from './batchContracts';
import {batchMessages} from './batchMessages';
import {cattleFormMessages} from './formMessages';
import {CattlePicker} from './CattlePicker';
const routeSchema=z.object({production:productionSchema,source:z.uuid(),farm:z.uuid()});
export function TransferScreen(){
 const params=useLocalSearchParams();const route=routeSchema.safeParse(params);const instance=useId();const {controller,state,language}=useAuth();const router=useRouter();const w=workspaceMessages[language];const b=batchMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canTransfer(state.session.user);
 const q=useQuery({queryKey:['transfer-form',instance,params.production,params.source,params.farm],enabled:allowed,staleTime:0,gcTime:0,refetchOnMount:'always',refetchOnReconnect:false,networkMode:'always',queryFn:async({signal})=>{
 if(!route.success)throw Error('route');const {source,production,farm}=route.data;
 const [options,record,participants]=await Promise.all([controller.agendaOptions(signal),controller.cattleDetail('batches',source,production,farm,signal),controller.cattleList({kind:'animals',batch:source,farm,production,status:'active',page:1,search:''},signal)]);
 if('identifier' in record||record.status!=='active'||!record.quantity)throw Error('source');return {options,record,count:participants.count};
 }});
 const back=()=>router.canGoBack()?router.back():router.replace('/');
 return !allowed||q.isError?<AgendaShell title={b.transfer} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{allowed?w.error:b.noWrite}</Text>{allowed&&<AgendaButton label={w.retry} onPress={()=>void q.refetch()}/>}</View></AgendaShell>:q.isPending||q.isFetching?<AgendaShell title={b.transfer} backLabel={w.back} onBack={back}><Busy label={w.loading}/></AgendaShell>:q.data.options.read_only||q.data.options.user_id!==(state.status==='signedIn'?state.session.user.id:null)?<AgendaShell title={b.transfer} backLabel={w.back} onBack={back}><Text style={s.error}>{b.noWrite}</Text></AgendaShell>:<TransferEditor production={route.data.production} source={q.data.record} identifiedCount={q.data.count} today={organizationDay(q.data.options.timezone)}/>;
}
function TransferEditor({production,source,identifiedCount,today}:{production:Production;source:CattleBatch;identifiedCount:number;today:string}){
 const {controller,language}=useAuth();const client=useQueryClient();const router=useRouter();const b=batchMessages[language];const w=workspaceMessages[language];const f=cattleFormMessages[language];
 const [destination,setDestination]=useState<CattleBatch|null>(null);const [animals,setAnimals]=useState<string[]>([]);const [animalLabels,setAnimalLabels]=useState<Record<string,string>>({});const [quantity,setQuantity]=useState('');const [reason,setReason]=useState('');const [picker,setPicker]=useState<'destination'|'animals'|null>(null);
 const [review,setReview]=useState<{input:TransferInput;snapshot:TransferPreview}|null>(null);const [busy,setBusy]=useState(false);const lock=useRef(false);const [uncertain,setUncertain]=useState(false);const [message,setMessage]=useState('');const [confirmed,setConfirmed]=useState('');const [discarding,setDiscarding]=useState(false);
 usePreventRemove(!confirmed&&!discarding&&(!!destination||!!quantity||!!reason||animals.length>0||busy),({repeat})=>{if(lock.current)return;const discard=()=>{setDiscarding(true);repeat();};const body=uncertain?b.leaveUncertain:f.discardBody;if(Platform.OS==='web'){if(window.confirm(`${f.discardTitle}\n${body}`))discard();}else Alert.alert(f.discardTitle,body,[{text:f.stay,style:'cancel'},{text:f.discard,style:'destructive',onPress:discard}]);});
 const invalidate=()=>{for(const key of ['cattle','cattle-detail','cattle-overview','cattle-history','cattle-picker'])void client.invalidateQueries({queryKey:[key]});};
 const run=async(commit:boolean)=>{
 if(lock.current||confirmed)return;lock.current=true;setBusy(true);setMessage('');
 try{
 if(commit){if(!review)throw Error('review');const result=await controller.cattleTransfer(review.input,production,source.farm_id,review.snapshot);if(!('id' in result))throw Error('confirmation');setConfirmed(result.id);setUncertain(false);invalidate();}
 else{const input=transferInput.parse({source:source.id,destination:destination?.id,quantity:identifiedCount?animals.length:Number(quantity),animals:identifiedCount?animals:[],date:today,reason,request_key:randomUUID()});if(input.quantity>source.quantity)throw new z.ZodError([]);
 const snapshot=transferPreviewSchema.parse(await controller.cattleTransfer(input,production,source.farm_id));if(!matchesPreview(input,snapshot,source.farm_id))throw Error('preview');setReview({input,snapshot});}
 }catch(error){const unknown=commit&&(uncertain||(!(error instanceof AuthFailure)&&(!isAxiosError(error)||!error.response||error.response.status>=500)));if(unknown){setUncertain(true);setMessage(b.uncertain);}else{setUncertain(false);setReview(null);setMessage(error instanceof z.ZodError?b.required:b.failed);}}
 finally{lock.current=false;setBusy(false);}
 };
 const back=()=>{if(!lock.current){if(router.canGoBack())router.back();else router.replace({pathname:'/cattle/[production]/[id]',params:{production,id:source.id,kind:'batches',farm:source.farm_id}});}};
 return <AgendaShell title={b.transfer} backLabel={w.back} onBack={back}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Text style={s.muted}>{b.sourceHint}</Text><View style={s.card}><Text style={s.title}>{b.source}: {source.batch_code}</Text><Text>{source.farm_name} · {source.quantity}</Text><Text>{today}</Text></View>{confirmed?<><Text accessibilityRole="alert" style={s.title}>{b.confirmed}</Text><Text selectable>{b.transaction}: {confirmed}</Text><AgendaButton label={b.back} onPress={back}/></>:review?<><Text style={s.body}>{b.review}</Text>{([[b.source,review.snapshot.source_code,review.snapshot.source_before,review.snapshot.source_after],[b.destination,review.snapshot.destination_code,review.snapshot.destination_before,review.snapshot.destination_after]] as const).map(([label,code,before,after])=><View key={label} style={s.card}><Text style={s.title}>{label}: {code}</Text><Text>{b.before}: {before} → {b.after}: {after}</Text></View>)}<Text>{b.selected}: {review.input.quantity}</Text>{review.input.animals.map(id=><Text key={id} style={s.body}>{animalLabels[id]??id}</Text>)}<Text>{b.reason}: {review.input.reason}</Text><Text selectable style={s.muted}>{b.transaction}: {review.input.request_key}</Text><AgendaButton label={busy?w.loading:uncertain?b.verify:b.confirm} disabled={busy} onPress={()=>void run(true)}/>{!uncertain&&<AgendaButton label={b.change} disabled={busy} onPress={()=>setReview(null)}/>}</>:<><AgendaButton label={destination?`${b.destination}: ${destination.batch_code}`:b.destination} disabled={busy} onPress={()=>setPicker('destination')}/>{identifiedCount>0?<><Text>{b.selected}: {animals.length} / {identifiedCount}</Text><AgendaButton label={b.participants} disabled={busy} onPress={()=>setPicker('animals')}/></>:<><Text style={s.label}>{b.collective}</Text><TextInput style={s.input} accessibilityLabel={b.collective} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" editable={!busy}/></>}<Text style={s.label}>{b.reason}</Text><TextInput style={[s.input,{minHeight:80}]} accessibilityLabel={b.reason} value={reason} onChangeText={setReason} maxLength={300} multiline editable={!busy}/><AgendaButton label={busy?w.loading:b.preview} disabled={busy} onPress={()=>void run(false)}/></>}{!!message&&<Text accessibilityRole="alert" style={s.error}>{message}</Text>}{picker&&<CattlePicker source={source} production={production} animals={picker==='animals'} selected={picker==='animals'?animals:destination?[destination.id]:[]} onClose={()=>setPicker(null)} onAnimal={r=>{setAnimalLabels(labels=>({...labels,[r.id]:`${r.identifier}${r.name?` · ${r.name}`:''}`}));setAnimals(ids=>ids.includes(r.id)?ids.filter(v=>v!==r.id):[...ids,r.id]);}} onDestination={r=>{setDestination(r);setPicker(null);}}/>}</ScrollView></KeyboardAvoidingView></AgendaShell>;
}
