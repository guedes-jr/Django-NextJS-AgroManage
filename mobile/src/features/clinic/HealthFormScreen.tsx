import {useId,useRef,useState} from 'react';
import {Alert,Keyboard,KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import {useLocalSearchParams,usePreventRemove,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Controller,useForm,useWatch} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {isAxiosError} from 'axios';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {AgendaShell,AgendaButton,Busy,styles as s} from '../agenda/ui';
import {HealthSaveUnconfirmed} from '../../services/authApi';
import {canWriteClinic,type ClinicAnimal} from './contracts';
import {AnimalPicker} from './ClinicFormScreen';
import {clinicMessages} from './messages';
import {healthMessages} from './healthMessages';
import {healthInputSchema,type HealthInput,type HealthOptions} from './healthContracts';

export function HealthFormScreen(){
 const params=useLocalSearchParams();const route=z.object({animal:z.uuid().optional(),farm:z.uuid().optional(),batch:z.never().optional()}).safeParse(params);const instance=useId();
 const {state,controller,language}=useAuth(),router=useRouter(),t=healthMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canWriteClinic(state.session.user);
 const q=useQuery({queryKey:['health-form',instance,params.animal,params.farm],enabled:allowed&&!!route.data.animal,staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false,networkMode:'always',queryFn:async({signal})=>{if(!route.success||!route.data.animal)throw Error('route');const [options,animals]=await Promise.all([controller.healthOptions(signal),controller.clinicAnimals({kind:'health',page:1,search:'',species:'',start:'',end:'',animal:route.data.animal,...(route.data.farm?{farm:route.data.farm}:{})},signal)]);if(!animals.results[0])throw Error('patient');return {options,animal:animals.results[0]};}});
 const back=()=>router.canGoBack()?router.back():router.replace('/clinic');
 if(!allowed||q.isError)return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{allowed?t.unavailable:t.readonly}</Text>{allowed&&<AgendaButton label={w.retry} onPress={()=>void q.refetch()}/>}</View></AgendaShell>;
 if(!route.data.animal)return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><AnimalPicker farm={route.data.farm} onClose={back} onSelect={animal=>router.replace({pathname:'/clinic/health-form',params:{animal:animal.id,farm:animal.farm}})}/></AgendaShell>;
 if(q.isPending||q.isFetching)return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><Busy label={w.loading}/></AgendaShell>;
 return <HealthEditor animal={q.data.animal} options={q.data.options}/>;
}

function HealthEditor({animal,options}:{animal:ClinicAnimal;options:HealthOptions}){
 const {controller,language}=useAuth(),t=healthMessages[language],c=clinicMessages[language],w=workspaceMessages[language],router=useRouter(),client=useQueryClient();
 const {control,handleSubmit,formState:{isDirty}}=useForm<HealthInput>({resolver:zodResolver(healthInputSchema.refine(v=>v.application_date<=options.today,{path:['application_date'],message:'future'})),defaultValues:{animal:animal.id,expected_farm:animal.farm,treatment_type:'exam',application_date:options.today,description:'',veterinary:'',notes:''}});
 const type=useWatch({control,name:'treatment_type'});const [busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[saved,setSaved]=useState<string|null>(null),[message,setMessage]=useState(''),[leaving,setLeaving]=useState(false);const lock=useRef(false);
 usePreventRemove(!saved&&!leaving&&(isDirty||busy||unknown),({repeat})=>{if(lock.current)return;const leave=()=>{setLeaving(true);repeat();};const body=unknown?t.unknownLeave:t.discardBody;if(Platform.OS==='web'){if(window.confirm(`${t.discard}\n${body}`))leave();}else Alert.alert(t.discard,body,[{text:t.keep,style:'cancel'},{text:t.leave,style:'destructive',onPress:leave}]);});
 const save=async(values:HealthInput)=>{if(lock.current||unknown||saved)return;lock.current=true;setBusy(true);setMessage('');Keyboard.dismiss();try{const result=await controller.createHealthRecord(values);setSaved(result.id);for(const key of ['clinic','clinic-detail','clinic-reconciliation','cattle-history'])void client.invalidateQueries({queryKey:[key]});}catch(error){if(error instanceof HealthSaveUnconfirmed){setUnknown(true);setMessage(t.unknown);}else if(isAxiosError(error)&&[400,403,404].includes(error.response?.status??0)){const flat=(v:unknown):string[]=>typeof v==='string'?[v]:Array.isArray(v)?v.flatMap(flat):v&&typeof v==='object'?Object.values(v).flatMap(flat):[];setMessage(flat(error.response?.data?.error?.detail??error.response?.data).join(' ').slice(0,1000)||t.failed);}else setMessage(t.unavailable);}finally{lock.current=false;setBusy(false);}};
 const disabled=busy||unknown||!!saved;const back=()=>{if(!lock.current){if(router.canGoBack())router.back();else router.replace('/clinic');}};
 return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><View style={s.card}><Text style={s.heading}>{animal.identifier}</Text><Text style={s.body}>{animal.farm_name} · {c.labels[animal.species]??animal.species}</Text></View>{saved?<><Text accessibilityRole="alert" style={s.title}>{t.saved}</Text><AgendaButton label={t.detail} onPress={()=>router.replace({pathname:'/clinic/detail',params:{id:saved,kind:'health',farm:animal.farm}})}/></>:<><Text style={s.muted}>{t.scope}</Text><Text style={s.label}>{t.type}</Text><Controller control={control} name="treatment_type" render={({field})=><View style={s.row}>{options.treatment_types.map(row=><AgendaButton key={row.value} label={t.types[row.value]??row.label} selected={field.value===row.value} disabled={disabled} onPress={()=>field.onChange(row.value)}/>)}</View>}/>{type==='medication'&&<Text accessibilityRole="alert" style={s.badge}>{t.medication}</Text>}{(['application_date','description','veterinary','notes'] as const).map(name=>{const label=name==='application_date'?t.date:name==='description'?t.description:name==='veterinary'?t.professional:t.notes;return <View key={name} style={{gap:6}}><Text style={s.label}>{label}</Text><Controller control={control} name={name} render={({field,fieldState})=><><TextInput ref={field.ref} accessibilityLabel={label} style={[s.input,(name==='description'||name==='notes')&&{minHeight:90,textAlignVertical:'top'},fieldState.invalid&&{borderColor:'#9A3028'}]} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} editable={!disabled} multiline={name==='description'||name==='notes'} autoCapitalize={name==='application_date'?'none':'sentences'} maxLength={name==='application_date'?10:name==='veterinary'?100:8000}/>{fieldState.invalid&&<Text style={s.error}>{t.invalid}</Text>}</>}/></View>;})}<AgendaButton label={busy?w.loading:t.save} disabled={disabled} onPress={()=>void handleSubmit(save,()=>setMessage(t.invalid))()}/></>}{!!message&&<Text accessibilityRole="alert" style={s.error}>{message}</Text>}{unknown&&<AgendaButton label={t.check} onPress={()=>router.push({pathname:'/clinic/history',params:{kind:'health',animal:animal.id,farm:animal.farm}})}/>}</ScrollView></KeyboardAvoidingView></AgendaShell>;
}
