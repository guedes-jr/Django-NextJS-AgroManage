import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isAxiosError } from 'axios';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { organizationDay } from '../workspace/contracts';
import { workspaceMessages } from '../workspace/messages';
import { AgendaShell, AgendaButton, Busy, styles as s } from '../agenda/ui';
import { AuthFailure } from '../../services/authApi';
import { cattleFormMessages } from './formMessages';
import { cattleMessages, cattleLabel } from './messages';
import { animalInputSchema, weightInputSchema, canCreateCattle, canEditCattle, canWeighCattle, cattleCategories, productionSchema, cattleKinds, type AnimalInput, type WeightInput, type CattleAnimal, type CattleBatch, type Production } from './contracts';
const routeSchema=z.object({production:productionSchema,mode:z.enum(['create','edit','weight']).default('create'),id:z.uuid().optional(),kind:z.enum(cattleKinds).default('animals'),farm:z.uuid().optional()}).refine(v=>v.mode==='create'?v.kind==='animals'&&!v.id:!!v.id&&(v.mode==='weight'||v.kind==='animals'));
type Route=z.infer<typeof routeSchema>;
export function CattleFormScreen(){
  const params=useLocalSearchParams();const route=routeSchema.safeParse(params);
  const {state,controller,language}=useAuth();const router=useRouter();const w=workspaceMessages[language];const f=cattleFormMessages[language];
  const allowed=route.success&&state.status==='signedIn'&&canCreateCattle(state.session.user);
  const query=useQuery({queryKey:['cattle-form',params.production,params.mode,params.id,params.kind,params.farm],enabled:allowed,retry:false,queryFn:async({signal})=>{
    if(!route.success)throw new Error('invalid route');const value=route.data;
    const [options,record]=await Promise.all([controller.agendaOptions(signal),value.id?controller.cattleDetail(value.kind,value.id,value.production,value.farm,signal):Promise.resolve(undefined)]);
    return {options,record,today:organizationDay(options.timezone)};
  }});
  const back=()=>router.canGoBack()?router.back():router.replace('/');
  const title=route.success?f[route.data.mode==='weight'?'weigh':route.data.mode]:f.create;
  if(!allowed)return <AgendaShell title={title} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{f.blocked}</Text></View></AgendaShell>;
  if(query.isPending)return <AgendaShell title={title} backLabel={w.back} onBack={back}><Busy label={w.loading}/></AgendaShell>;
  if(query.isError||!query.data)return <AgendaShell title={title} backLabel={w.back} onBack={back}><View style={s.content}><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void query.refetch()}/></View></AgendaShell>;
  const {options,record,today}=query.data;
  const permitted=state.status==='signedIn'&&options.user_id===state.session.user.id&&!options.read_only&&(route.data.mode==='create'||(record&&(route.data.mode==='weight'?canWeighCattle(state.session.user,record)&&!!record.entry_date:'identifier' in record&&canEditCattle(state.session.user,record))));
  if(!permitted)return <AgendaShell title={title} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.body}>{f.blocked}</Text>{record&&!record.entry_date&&<Text style={s.muted}>{f.dateUnknown}</Text>}</View></AgendaShell>;
  return route.data.mode==='weight'&&record?<WeightEditor route={route.data} record={record} today={today} timezone={options.timezone}/>:<AnimalEditor route={route.data} record={record&&'identifier' in record?record:undefined} today={today} timezone={options.timezone}/>;
}
function serverMessage(error:unknown,fallback:string){
  if(!isAxiosError(error)||![400,403,409,422].includes(error.response?.status??0))return fallback;
  const body=error.response?.data?.error?.detail??error.response?.data;
  if(typeof body?.detail==='string')return body.detail.slice(0,600);
  if(!body||typeof body!=='object')return fallback;
  const known=['identifier','name','gender','category','birth_date','entry_date','farm_id','initial_weight_kg','weight_kg','weighing_date','non_field_errors'];
  const messages=known.flatMap(key=>{const value=body[key];return typeof value==='string'?[value]:Array.isArray(value)?value.filter(x=>typeof x==='string'):[];});
  return messages.length?messages.join(' ').slice(0,800):fallback;
}
function useMutationState(isDirty:boolean,isSubmitting:boolean,production:Production){
  const {language}=useAuth();const f=cattleFormMessages[language];const router=useRouter();
  const [message,setMessage]=useState('');const [uncertain,setUncertain]=useState(false);const [saved,setSaved]=useState(false);const [discarding,setDiscarding]=useState(false);
  const saving=useRef(false);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  usePreventRemove(!saved&&!discarding&&(isDirty||isSubmitting||uncertain),({repeat})=>{
    if(saving.current)return;const discard=()=>{setDiscarding(true);repeat();};
    if(Platform.OS==='web'){if(window.confirm(`${f.discardTitle}\n${f.discardBody}`))discard();}
    else Alert.alert(f.discardTitle,f.discardBody,[{text:f.stay,style:'cancel'},{text:f.discard,style:'destructive',onPress:discard}]);
  });
  const execute=async<T,>(action:()=>Promise<T>):Promise<T|undefined>=>{
    if(saving.current||uncertain||saved)return;saving.current=true;setMessage('');
    try{const result=await action();return mounted.current?result:undefined;}
    catch(error){if(mounted.current){const unknown=!(error instanceof AuthFailure)&&(!isAxiosError(error)||!error.response||error.response.status>=500);setUncertain(unknown);setMessage(unknown?f.uncertain:serverMessage(error,f.failed));}}
    finally{saving.current=false;}
  };
  return {message,uncertain,saved,execute,finish:()=>setSaved(true),invalid:()=>setMessage(f.invalid),back:()=>{if(!saving.current){if(router.canGoBack())router.back();else router.replace({pathname:'/cattle/[production]',params:{production}});}},review:()=>router.push({pathname:'/cattle/[production]',params:{production}})};
}
function AnimalEditor({route,record,today,timezone}:{route:Route;record?:CattleAnimal;today:string;timezone:string}){
  const {controller,language}=useAuth();const {farm}=useWorkspace();const router=useRouter();const client=useQueryClient();const f=cattleFormMessages[language];const t=cattleMessages[language];const w=workspaceMessages[language];
  const {control,setValue,handleSubmit,formState:{isDirty,isSubmitting,errors}}=useForm<AnimalInput>({resolver:zodResolver(animalInputSchema(today)),defaultValues:{identifier:record?.identifier??'',name:record?.name??'',gender:record?.gender==='M'?'M':'F',category:(record?.category as AnimalInput['category'])??'Bezerro',birth_date:record?.birth_date??'',entry_date:record?record.entry_date??'':today,notes:record?.notes??'',breed_name_input:'',initial_weight_kg:''}});
  const mutation=useMutationState(isDirty,isSubmitting,route.production);
  const [created,setCreated]=useState<CattleAnimal|null>(null);
  useEffect(()=>{if(mutation.saved){if(created)router.replace({pathname:'/cattle/[production]/[id]',params:{production:route.production,id:created.id,kind:'animals'}});else if(router.canGoBack())router.back();else router.replace({pathname:'/cattle/[production]',params:{production:route.production}});}},[mutation.saved,created,router,route.production]);
  const persist=async(values:AnimalInput)=>{
    if(!record&&!farm){mutation.invalid();return;}
    const result=await mutation.execute(()=>controller.saveCattleAnimal(values,route.production,record?.farm??farm?.id,record?.id));
    if(result){if(!record)setCreated(result);mutation.finish();void client.invalidateQueries({queryKey:['cattle']});void client.invalidateQueries({queryKey:['cattle-detail']});void client.invalidateQueries({queryKey:['cattle-history']});}
  };
  const disabled=isSubmitting||mutation.uncertain||mutation.saved;
  const input=(name:'identifier'|'name'|'birth_date'|'entry_date'|'notes'|'breed_name_input'|'initial_weight_kg',label:string,multiline=false)=> <View key={name} style={{gap:6}}><Text style={s.label}>{label}</Text><Controller control={control} name={name} render={({field})=><TextInput accessibilityLabel={label} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} ref={field.ref} editable={!disabled} multiline={multiline} autoCapitalize={name.includes('date')||name==='initial_weight_kg'?'none':'sentences'} keyboardType={name==='initial_weight_kg'?'decimal-pad':'default'} style={[s.input,multiline&&{minHeight:90,textAlignVertical:'top',paddingVertical:12},errors[name]&&{borderColor:'#9A3028'}]}/>} /></View>;
  return <AgendaShell title={record?f.edit:f.create} backLabel={w.back} onBack={mutation.back}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Text style={s.muted}>{f.timezone} {timezone}</Text><Text style={s.badge}>{f.purpose}: {t[route.production]}</Text>
    {record?<Text style={s.body}>{record.farm_name}</Text>:<><Text style={s.body}>{farm?.name??f.chooseFarm}</Text><AgendaButton label={f.farm} disabled={disabled} onPress={()=>router.push('/farms')}/></>}
    <Text style={s.muted}>{record?f.editHint:f.birthHint}</Text>{input('identifier',t.identifier)}{input('name',t.name)}
    <Text style={s.label}>{t.gender}</Text><Controller control={control} name="gender" render={({field})=><View style={s.row}>{(['F','M'] as const).map(value=><AgendaButton key={value} label={t[value]} selected={field.value===value} disabled={disabled} onPress={()=>{field.onChange(value);setValue('category',value==='F'?'Novilha':'Garrote',{shouldDirty:true});}}/>)}</View>}/>
    <Text style={s.label}>{t.category}</Text><Controller control={control} name="category" render={({field})=><View style={s.row}>{cattleCategories.map(value=><AgendaButton key={value} label={cattleLabel(t,value)} selected={field.value===value} disabled={disabled} onPress={()=>field.onChange(value)}/>)}</View>}/>
    {input('birth_date',f.birth)}{input('entry_date',f.entry)}{!record&&<>{input('breed_name_input',f.breed)}{input('initial_weight_kg',f.initialWeight)}</>}{input('notes',t.notes,true)}
    {!!mutation.message&&<Text accessibilityRole="alert" style={s.error}>{mutation.message}</Text>}
    <AgendaButton label={isSubmitting?f.saving:f.save} disabled={disabled||(!record&&!farm)} onPress={()=>{void handleSubmit(persist,mutation.invalid)();}}/>
    {mutation.uncertain&&<AgendaButton label={f.reconcile} onPress={mutation.review}/>}
  </ScrollView></KeyboardAvoidingView></AgendaShell>;
}
function WeightEditor({route,record,today,timezone}:{route:Route;record:CattleAnimal|CattleBatch;today:string;timezone:string}){
  const {controller,language}=useAuth();const router=useRouter();const client=useQueryClient();const f=cattleFormMessages[language];const t=cattleMessages[language];const w=workspaceMessages[language];
  const {control,handleSubmit,formState:{isDirty,isSubmitting,errors}}=useForm<WeightInput>({resolver:zodResolver(weightInputSchema(today,record.entry_date)),defaultValues:{weight_kg:'',weighing_date:today,notes:''}});
  const mutation=useMutationState(isDirty,isSubmitting,route.production);
  useEffect(()=>{if(mutation.saved){if(router.canGoBack())router.back();else router.replace({pathname:'/cattle/[production]/[id]',params:{production:route.production,id:record.id,kind:route.kind}});}},[mutation.saved,router,route.production,route.kind,record.id]);
  const persist=async(values:WeightInput)=>{
    const result=await mutation.execute(()=>controller.recordCattleWeight(route.kind,record.id,route.production,'farm' in record?record.farm:record.farm_id,values));
    if(result){mutation.finish();void client.invalidateQueries({queryKey:['cattle']});void client.invalidateQueries({queryKey:['cattle-detail']});void client.invalidateQueries({queryKey:['cattle-history']});}
  };
  const disabled=isSubmitting||mutation.uncertain||mutation.saved;
  const input=(name:keyof WeightInput,label:string,multiline=false)=><View key={name} style={{gap:6}}><Text style={s.label}>{label}</Text><Controller control={control} name={name} render={({field})=><TextInput accessibilityLabel={label} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} ref={field.ref} editable={!disabled} multiline={multiline} keyboardType={name==='weight_kg'?'decimal-pad':'default'} autoCapitalize={name==='notes'?'sentences':'none'} style={[s.input,multiline&&{minHeight:90,textAlignVertical:'top',paddingVertical:12},errors[name]&&{borderColor:'#9A3028'}]}/>} /></View>;
  return <AgendaShell title={f.weigh} backLabel={w.back} onBack={mutation.back}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <View style={s.card}><Text style={s.title}>{'identifier' in record?record.identifier:record.batch_code}</Text><Text style={s.body}>{record.farm_name}</Text></View><Text style={s.muted}>{f.timezone} {timezone}</Text><Text style={s.muted}>{f.weightHint}</Text>
    {input('weight_kg',f.weight)}{input('weighing_date',f.weightDate)}{input('notes',t.notes,true)}{!!mutation.message&&<Text accessibilityRole="alert" style={s.error}>{mutation.message}</Text>}
    <AgendaButton label={isSubmitting?f.saving:f.save} disabled={disabled} onPress={()=>{void handleSubmit(persist,mutation.invalid)();}}/>{mutation.uncertain&&<AgendaButton label={f.reconcile} onPress={mutation.review}/>}
  </ScrollView></KeyboardAvoidingView></AgendaShell>;
}
