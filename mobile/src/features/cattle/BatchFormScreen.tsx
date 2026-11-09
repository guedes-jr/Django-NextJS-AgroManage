import {useEffect,useId,useState} from 'react';
import {KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Controller,useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {organizationDay} from '../workspace/contracts';
import {workspaceMessages} from '../workspace/messages';
import {AgendaShell,AgendaButton,Busy,styles as s} from '../agenda/ui';
import {cattleFormMessages} from './formMessages';
import {cattleMessages,cattleLabel} from './messages';
import {canCreateCattle,productionSchema,cattleCategories,type CattleBatch} from './contracts';
import {batchInputSchema,batchPhases,batchOrigins,batchGenders,canEditBatch,type BatchInput} from './batchContracts';
import {batchMessages} from './batchMessages';
import {useMutationState} from './CattleFormScreen';
const schema=z.object({production:productionSchema,id:z.uuid().optional(),farm:z.uuid().optional()});
type Route=z.infer<typeof schema>;
export function BatchFormScreen(){
 const params=useLocalSearchParams();const route=schema.safeParse(params);const instance=useId();const {state,controller,language}=useAuth();const router=useRouter();const w=workspaceMessages[language];const b=batchMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canCreateCattle(state.session.user);
 const query=useQuery({queryKey:['batch-form',instance,params.production,params.id,params.farm],enabled:allowed,staleTime:0,gcTime:0,refetchOnMount:'always',refetchOnReconnect:false,networkMode:'always',queryFn:async({signal})=>{
  if(!route.success)throw Error('route');const {production,id,farm}=route.data;
  const [options,record]=await Promise.all([controller.agendaOptions(signal),id?controller.cattleDetail('batches',id,production,farm,signal):undefined]);
  if(record&&'identifier' in record)throw Error('batch');return {options,record};
 }});
 const back=()=>router.canGoBack()?router.back():router.replace('/');const title=route.success&&route.data.id?b.edit:b.create;
 if(!allowed||query.isError)return <AgendaShell title={title} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{allowed?w.error:w.noAccess}</Text>{allowed&&<AgendaButton label={w.retry} onPress={()=>void query.refetch()}/>}</View></AgendaShell>;
 if(query.isPending||query.isFetching)return <AgendaShell title={title} backLabel={w.back} onBack={back}><Busy label={w.loading}/></AgendaShell>;
 const {options,record}=query.data;
 if(state.status!=='signedIn'||options.read_only||options.user_id!==state.session.user.id||(record&&!canEditBatch(state.session.user,record)))return <AgendaShell title={title} backLabel={w.back} onBack={back}><Text style={s.error}>{w.noAccess}</Text></AgendaShell>;
 return <BatchEditor route={route.data} record={record} today={organizationDay(options.timezone)}/>;
}
function BatchEditor({route,record,today}:{route:Route;record?:CattleBatch;today:string}){
 const {controller,language}=useAuth();const {farm}=useWorkspace();const router=useRouter();const client=useQueryClient();const b=batchMessages[language];const f=cattleFormMessages[language];const t=cattleMessages[language];const w=workspaceMessages[language];
 // Hidden creation defaults never enter PATCH; persisted immutable values are shown separately.
 const {control,handleSubmit,formState:{isDirty,isSubmitting,errors}}=useForm<BatchInput>({resolver:zodResolver(batchInputSchema(today)),defaultValues:{batch_code:record?.batch_code??'',name:record?.name??'',birth_date:record?.birth_date??'',notes:record?.notes??'',entry_date:today,quantity:record?'1':'',category:'Bezerro',gender:'Misto',phase:'creche',origin:'purchased',avg_weight_kg:''}});
 const mutation=useMutationState(isDirty,isSubmitting,route.production,b.invalid);const [created,setCreated]=useState<CattleBatch|null>(null);
 useEffect(()=>{if(mutation.saved){if(created)router.replace({pathname:'/cattle/[production]/[id]',params:{production:route.production,id:created.id,kind:'batches'}});else if(router.canGoBack())router.back();else router.replace({pathname:'/cattle/[production]',params:{production:route.production}});}},[mutation.saved,created,router,route.production]);
 const disabled=isSubmitting||mutation.uncertain||mutation.saved;
 const input=(name:'batch_code'|'name'|'birth_date'|'entry_date'|'quantity'|'avg_weight_kg'|'notes',label:string)=><View style={{gap:6}} key={name}><Text style={s.label}>{label}</Text><Controller control={control} name={name} render={({field})=><TextInput accessibilityLabel={label} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} ref={field.ref} editable={!disabled} multiline={name==='notes'} keyboardType={name==='quantity'?'number-pad':name==='avg_weight_kg'?'decimal-pad':'default'} autoCapitalize={name.includes('date')?'none':'sentences'} style={[s.input,name==='notes'&&{minHeight:90,textAlignVertical:'top'},errors[name]&&{borderColor:'#9A3028'}]}/>}/></View>;
 const choices=(name:'category'|'gender'|'phase'|'origin',label:string,values:readonly string[])=><View style={{gap:6}}><Text style={s.label}>{label}</Text><Controller control={control} name={name} render={({field})=><View style={s.row}>{values.map(v=><AgendaButton key={v} label={v in b?b[v as keyof typeof b]:cattleLabel(t,v)} disabled={disabled} selected={v===field.value} onPress={()=>field.onChange(v)}/>)}</View>}/></View>;
 const save=async(values:BatchInput)=>{const farmId=record?.farm_id??farm?.id;if(!farmId){mutation.invalid();return;}const result=await mutation.execute(()=>controller.saveCattleBatch(values,route.production,farmId,record?.id));if(result){if(!record)setCreated(result);mutation.finish();for(const key of ['cattle','cattle-detail','cattle-overview'])void client.invalidateQueries({queryKey:[key]});}};
 return <AgendaShell title={record?b.edit:b.create} backLabel={w.back} onBack={mutation.back}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Text style={s.badge}>{t[route.production]}</Text><Text style={s.body}>{record?.farm_name??farm?.name??f.chooseFarm}</Text>{!record&&<AgendaButton label={f.farm} disabled={disabled} onPress={()=>router.push('/farms')}/>}<Text style={s.muted}>{record?b.editHint:b.hint}</Text>{record&&<Text style={s.body}>{`${t.quantity}: ${record.quantity} · ${cattleLabel(t,record.category)} · ${cattleLabel(t,record.phase)}`}</Text>}{input('batch_code',b.code)}{input('name',t.name)}{!record&&<>{choices('category',t.category,cattleCategories)}{choices('gender',t.gender,batchGenders)}{choices('phase',t.phase,batchPhases)}{choices('origin',b.origin,batchOrigins)}{input('quantity',b.quantity)}{input('entry_date',f.entry)}{input('avg_weight_kg',b.weight)}</>}{input('birth_date',f.birth)}{input('notes',t.notes)}{!!mutation.message&&<Text accessibilityRole="alert" style={s.error}>{mutation.message}</Text>}<AgendaButton label={isSubmitting?f.saving:f.save} disabled={disabled||(!record&&!farm)} onPress={()=>void handleSubmit(save,mutation.invalid)()}/>{mutation.uncertain&&<AgendaButton label={f.reconcile} onPress={mutation.review}/>}</ScrollView></KeyboardAvoidingView></AgendaShell>;
}
