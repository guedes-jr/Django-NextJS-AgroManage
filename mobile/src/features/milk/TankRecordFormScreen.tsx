import {useId,useLayoutEffect,useRef,useState,type ComponentRef} from 'react';
import {Alert,Keyboard,KeyboardAvoidingView,Linking,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import {useLocalSearchParams,usePreventRemove,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Controller,useForm,useWatch} from 'react-hook-form';
import {randomUUID} from 'expo-crypto';
import {isAxiosError} from 'axios';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {organizationDay} from '../workspace/contracts';
import {workspaceMessages} from '../workspace/messages';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {AgendaButton,Busy,styles as s} from '../agenda/ui';
import {TankRecordUnconfirmed} from '../../services/authApi';
import {tankCommand,canWriteTankRecord,type TankDraft,type TankWriteCommand} from './tankWriteContracts';
import {tankWriteMessages} from './tankWriteMessages';
import {tankMovementMessages} from './tankMovementMessages';
import {tankQualityMessages} from './tankQualityMessages';
import {tankMessages} from './tankMessages';
import {parseApiUrl} from '../../config/environment';
import {milkMessages} from './messages';
import {milkCalendarDate} from './contracts';
import type {MilkTank} from './tankContracts';
const routeSchema=z.object({mode:z.enum(['movement','quality','cancel']),tank:z.uuid(),farm:z.uuid(),id:z.uuid().optional(),date:z.iso.date().optional()}).refine(v=>v.mode==='cancel'?!!v.id:!v.id);
export function TankRecordFormScreen(){
 const params=useLocalSearchParams(),route=routeSchema.safeParse(params),instance=useId(),{state,controller,language}=useAuth(),router=useRouter(),t=tankWriteMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canWriteTankRecord(state.session.user,route.data.mode);
 const q=useQuery({queryKey:['tank-record-form',instance,params.mode,params.id,params.tank,params.farm,params.date],enabled:allowed,staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false,queryFn:async({signal})=>{
  if(!route.success)throw Error('route');const [tank,options]=await Promise.all([controller.milkTank(route.data.tank,route.data.farm,signal),controller.agendaOptions(signal)]);
  if(state.status!=='signedIn'||options.user_id!==state.session.user.id||options.read_only||(route.data.mode!=='cancel'&&!tank.is_active))throw Error('unavailable');
  const movement=route.data.mode==='cancel'?await controller.milkTankMovement(route.data.id!,route.data.tank,route.data.farm,signal):undefined;
  if(movement?.cancelled_at)throw Error('cancelled');return {tank,today:organizationDay(options.timezone),movement};
 }});
 const back=()=>router.canGoBack()?router.back():router.replace('/milk/tanks');
 if(!allowed||q.isPending||q.isError)return <WorkspaceShell active="milk" title={route.success?t[route.data.mode]:t.movement} onBack={back}><View style={s.content}>{!allowed?<Text style={s.error}>{w.noAccess}</Text>:q.isError?<><Text style={s.error}>{t.unavailable}</Text><AgendaButton label={w.retry} onPress={()=>void q.refetch()}/></>:<Busy label={w.loading}/>}</View></WorkspaceShell>;
 return <Editor key={`${instance}:${route.data.mode}:${route.data.tank}:${route.data.farm}:${route.data.id}:${route.data.date}`} route={route.data} tank={q.data.tank} today={q.data.today}/>;
}
type Route=z.infer<typeof routeSchema>;
function Editor({route,tank,today}:{route:Route;tank:MilkTank;today:string}){
 const {controller,language}=useAuth(),router=useRouter(),client=useQueryClient(),t=tankWriteMessages[language],m=tankMovementMessages[language],q=tankQualityMessages[language],storage=tankMessages[language],w=workspaceMessages[language];
 const [key]=useState(randomUUID),[review,setReview]=useState<TankWriteCommand|null>(null),[context,setContext]=useState<Awaited<ReturnType<typeof controller.tankRecordContext>>|null>(null),[saved,setSaved]=useState<string|null>(null),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[blocked,setBlocked]=useState(false),[message,setMessage]=useState(''),[leaving,setLeaving]=useState(false),lock=useRef(false);
 const {control,handleSubmit,formState:{isDirty}}=useForm<TankDraft>({defaultValues:{date:route.date??today,kind:'production',liters:'',buyer:'',driver:'',vehicle:'',document:'',reason:'',notes:'',sample:'',temperature_c:'',fat_percent:'',protein_percent:'',scc:'',tbc:'',antibiotics:'not_tested'}});
 const kind=useWatch({control,name:'kind'}),disabled=busy||unknown||blocked||!!saved;
 const scroll=useRef<ComponentRef<typeof ScrollView>>(null);
 useLayoutEffect(()=>{Keyboard.dismiss();scroll.current?.scrollTo({x:0,y:0,animated:false});},[review,saved]);
 usePreventRemove(!leaving&&!saved&&(isDirty||!!review||unknown),({repeat})=>{if(lock.current)return;const leave=()=>{setLeaving(true);repeat();};if(Platform.OS==='web'){if(window.confirm(`${t.discard}\n${t.discardBody}`))leave();}else Alert.alert(t.discard,t.discardBody,[{text:t.stay,style:'cancel'},{text:t.leave,style:'destructive',onPress:leave}]);});
 const back=()=>{if(!lock.current){if(router.canGoBack())router.back();else router.replace('/milk/tanks');}};
 const refresh=()=>{for(const key of ['milk-tanks','milk-tank','milk-tank-movements','milk-tank-movement','milk-tank-quality-list','milk-tank-quality','milk-summary'])void client.invalidateQueries({queryKey:[key]});};
 const error=(e:unknown)=>{if(e instanceof TankRecordUnconfirmed){setUnknown(true);setMessage(t.unknown);}else{const conflict=isAxiosError(e)&&[403,404,409].includes(e.response?.status??0);if(conflict)setBlocked(true);const detail=isAxiosError(e)?e.response?.data?.error?.detail??e.response?.data:null;const flat=(v:unknown):string[]=>typeof v==='string'?[v]:Array.isArray(v)?v.flatMap(flat):v&&typeof v==='object'?Object.values(v).flatMap(flat):[];setMessage(flat(detail).join(' ').slice(0,800)||(conflict?t.changed:t.error));}};
 const preview=async(draft:TankDraft)=>{if(lock.current||disabled)return;let c:TankWriteCommand;try{c=tankCommand(route.mode,tank.id,tank.farm,draft,key,route.id);}catch{setMessage(t.invalid);return;}lock.current=true;setBusy(true);setMessage('');Keyboard.dismiss();try{const ctx=await controller.tankRecordContext(c);setContext(ctx);setReview(c);}catch(e){error(e);}finally{lock.current=false;setBusy(false);}};
 const confirm=async()=>{if(!review||lock.current||disabled)return;lock.current=true;setBusy(true);setMessage('');try{const result=await controller.saveTankRecord(review);setSaved(result.id);refresh();}catch(e){error(e);}finally{lock.current=false;setBusy(false);}};
 const reconcile=async()=>{if(!review||lock.current||!unknown)return;lock.current=true;setBusy(true);setMessage('');try{const result=await controller.reconcileTankRecord(review);setSaved(result.id);refresh();}catch{setMessage(t.notConfirmed);}finally{lock.current=false;setBusy(false);}};
 const fields:([keyof TankDraft,string,number,boolean?])[]=route.mode==='cancel'?[['reason',m.cancelReason,500,true]]:route.mode==='quality'?[['date',q.date,10],['sample',q.sample,100],['temperature_c',`${q.temperature} (°C)`,8],['fat_percent',`${q.fat} (%)`,6],['protein_percent',`${q.protein} (%)`,6],['scc',`${q.scc} (${q.cells})`,10],['tbc',`${q.tbc} (${q.cfu})`,10],['notes',q.notes,1000,true]]:[['date',m.date,10],['liters',`${m.volume} (L)`,12],...(kind==='collection'?[['buyer',m.buyer,200],['driver',m.driver,200],['vehicle',m.vehicle,30],['document',m.document,100]] as [keyof TankDraft,string,number][]:[]),...(kind==='discard'?[['reason',m.reason,500,true]] as [keyof TankDraft,string,number,boolean][]:[]),['notes',m.notes,1000,true]];
 const input=([name,label,maxLength,multiline]:typeof fields[number])=><View key={name} style={{gap:6}}><Text style={s.label}>{label}</Text><Controller control={control} name={name} render={({field})=><TextInput ref={field.ref} accessibilityLabel={label} style={[s.input,multiline&&{minHeight:88,textAlignVertical:'top'}]} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} maxLength={maxLength} multiline={multiline} autoCapitalize={name==='date'?'none':'sentences'} keyboardType={name==='temperature_c'?(Platform.OS==='ios'?'numbers-and-punctuation':'numeric'):['liters','fat_percent','protein_percent','scc','tbc'].includes(name)?'decimal-pad':'default'} editable={!disabled}/>}/></View>;
 const openWeb=async()=>{const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);try{if(!site)throw Error('site');await Linking.openURL(new URL('home/seguimento/pecuaria-leiteira/leite',site).href);}catch{setMessage(milkMessages[language].webFailed);}};
 const number=(v:string)=>new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(v));
 return <WorkspaceShell active="milk" title={t[route.mode]} onBack={back}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
  <View style={s.card}><Text style={s.title}>{context?.tank.name??tank.name}</Text><Text style={s.body}>{context?.tank.farm_name??tank.farm_name}</Text><Text style={s.muted}>{!saved?`${storage.balance}: ${number(context?.tank.balance_liters??tank.balance_liters)} L · `:''}{storage.capacity}: {number(context?.tank.capacity_liters??tank.capacity_liters)} L</Text></View>
  <Text style={s.muted}>{route.mode==='quality'?t.qualityHint:t.rule}</Text>
  {saved?<><Text accessibilityRole="alert" style={s.title}>{t.saved}</Text><Text style={s.label}>{t.id}</Text><Text selectable style={s.body}>{saved}</Text><AgendaButton label={t.view} onPress={()=>router.replace({pathname:route.mode==='quality'?'/milk/tank-quality':'/milk/tank-movement',params:{id:saved,tank:tank.id,farm:tank.farm}})}/></>:review?<>
   <View style={s.card}><Text style={s.title}>{t.review}</Text>{review.mode==='movement'&&<Text style={s.body}>{m[review.kind]}</Text>}{'date' in review&&<Text style={s.body}>{milkCalendarDate(review.date,language)}</Text>}
    {context?.movement&&<><Text style={s.body}>{m[context.movement.kind]} · {milkCalendarDate(context.movement.date,language)}</Text><Text style={s.body}>{m.volume}: {number(context.movement.liters)} L</Text></>}
    {fields.filter(([name])=>name!=='date').map(([name,label])=>{const value=(review as unknown as Record<string,unknown>)[name];return <View key={name} style={{gap:3}}><Text style={s.label}>{label}</Text><Text style={s.body}>{value===null?q.missing:value===''?'—':['liters','temperature_c','fat_percent','protein_percent','scc','tbc'].includes(name)?number(String(value)):String(value)}</Text></View>;})}
    {review.mode==='quality'&&<Text style={s.body}>{q.antibiotics}: {q[review.antibiotics]}</Text>}
    {context?.available&&<Text style={s.body}>{t.available}: {number(context.available.available)}</Text>}
   </View>
   {review.mode==='movement'&&review.kind==='collection'&&<Text style={s.muted}>{t.finance}</Text>}
   <AgendaButton label={busy?w.loading:t.confirm} disabled={disabled} onPress={()=>void confirm()}/><AgendaButton label={t.edit} disabled={disabled} onPress={()=>{setReview(null);setContext(null);setMessage('');}}/>
  </>:<>
   {route.mode==='movement'&&<Controller control={control} name="kind" render={({field})=><View style={s.row}>{(['production','collection','discard'] as const).map(value=><AgendaButton key={value} label={m[value]} selected={field.value===value} disabled={disabled} onPress={()=>field.onChange(value)}/>)}</View>}/>} 
   {fields.map(input)}
   {route.mode==='quality'&&<><Text style={s.label}>{q.antibiotics}</Text><Controller control={control} name="antibiotics" render={({field})=><View style={s.row}>{(['not_tested','negative','positive'] as const).map(value=><AgendaButton key={value} label={q[value]} selected={field.value===value} disabled={disabled} onPress={()=>field.onChange(value)}/>)}</View>}/></>}
   <AgendaButton label={busy?w.loading:t.review} disabled={disabled} onPress={()=>void handleSubmit(preview)()}/>
  </>}
  {!saved&&(route.mode==='cancel'||kind==='collection')&&<AgendaButton label={milkMessages[language].openWeb} disabled={busy} onPress={()=>void openWeb()}/>}
  {!!message&&<Text accessibilityRole="alert" style={s.error}>{message}</Text>}{unknown&&!saved&&<AgendaButton label={busy?w.loading:t.check} disabled={busy} onPress={()=>void reconcile()}/>}{(unknown||blocked)&&!saved&&<AgendaButton label={route.mode==='quality'?q.title:m.title} disabled={busy} onPress={()=>router.push({pathname:route.mode==='quality'?'/milk/tank-qualities':'/milk/tank-movements',params:{tank:tank.id,farm:tank.farm,reconcile:'1'}})}/>} 
 </ScrollView></KeyboardAvoidingView></WorkspaceShell>;
}
