import {useEffect,useId,useRef,useState} from 'react';
import {Alert,KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import {useLocalSearchParams,usePreventRemove,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Controller,useFieldArray,useForm,useWatch,type Control,type FieldValues,type Path} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {isAxiosError} from 'axios';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {AgendaShell,AgendaButton,Busy,styles as s} from '../agenda/ui';
import {InventorySaveUnconfirmed} from '../../services/authApi';
import {canWriteInventory,type InventoryItem,type InventorySupplier,inventoryFormChoicesSchema} from './contracts';
import {productInputSchema,supplierInputSchema,productDefaults,supplierDefaults,priorities,type ProductInput,type SupplierInput,type InventoryCommand} from './formContracts';
import {inventoryMessages} from './messages';
import {inventoryFormMessages} from './formMessages';
const routeSchema=z.object({kind:z.enum(['items','suppliers']),id:z.uuid().optional()});
type Choices=z.infer<typeof inventoryFormChoicesSchema>;
export function InventoryFormScreen(){
 const params=useLocalSearchParams();const route=routeSchema.safeParse(params);const instance=useId();const {state,controller,language}=useAuth();const router=useRouter();const f=inventoryFormMessages[language],w=workspaceMessages[language];
 const title=route.success?f[route.data.kind==='items'?route.data.id?'editProduct':'createProduct':route.data.id?'editSupplier':'createSupplier']:f.createProduct;
 const allowed=route.success&&state.status==='signedIn'&&canWriteInventory(state.session.user);
 const query=useQuery({queryKey:['inventory-form',instance,params.kind,params.id],enabled:allowed,staleTime:0,gcTime:0,refetchOnMount:'always',refetchOnReconnect:false,networkMode:'always',queryFn:async({signal})=>{
  if(!route.success)throw Error('route');const [choices,record]=await Promise.all([controller.inventoryFormChoices(signal),route.data.id?controller.inventoryDetail(route.data.kind,route.data.id,signal):undefined]);return {choices,record};
 }});
 const back=()=>router.canGoBack()?router.back():router.replace('/inventory');
 if(!allowed||query.isError)return <AgendaShell title={title} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{allowed?w.error:w.noAccess}</Text>{allowed&&<AgendaButton label={w.retry} onPress={()=>void query.refetch()}/>}</View></AgendaShell>;
 if(query.isPending||query.isFetching)return <AgendaShell title={title} backLabel={w.back} onBack={back}><Busy label={w.loading}/></AgendaShell>;
 const {choices,record}=query.data;
 if(record&&(!record.ativo||!record.updated_at))return <AgendaShell title={title} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{f.version}</Text></View></AgendaShell>;
 return route.data.kind==='items'?<ProductEditor choices={choices} record={record&&'estoque_atual' in record?record:undefined}/>:<SupplierEditor choices={choices} record={record&&'contatos' in record?record:undefined}/>;
}
function Field<T extends FieldValues>({control,name,label,disabled,multiline=false,decimal=false,accessibilityLabel}:{control:Control<T>;name:Path<T>;label:string;disabled:boolean;multiline?:boolean;decimal?:boolean;accessibilityLabel?:string}){
 return <View style={{gap:6}}><Text style={s.label}>{label}</Text><Controller control={control} name={name} render={({field,fieldState})=><TextInput accessibilityLabel={accessibilityLabel??label} value={typeof field.value==='string'?field.value:''} onChangeText={field.onChange} onBlur={field.onBlur} ref={field.ref} editable={!disabled} multiline={multiline} keyboardType={name.endsWith('latitude')||name.endsWith('longitude')?(Platform.OS==='ios'?'numbers-and-punctuation':'default'):decimal?'decimal-pad':'default'} autoCapitalize={name.includes('valor')||name.includes('cnpj')?'none':'sentences'} style={[s.input,multiline&&{minHeight:90,textAlignVertical:'top',paddingVertical:12},fieldState.invalid&&{borderColor:'#9A3028'}]}/>}/></View>;
}
function useInventorySave(dirty:boolean,submitting:boolean){
 const {controller,language}=useAuth();const router=useRouter();const client=useQueryClient();const f=inventoryFormMessages[language];const lock=useRef(false);const mounted=useRef(true);
 const [message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false),[saved,setSaved]=useState<{id:string;kind:'items'|'suppliers';edit:boolean}|null>(null),[discarding,setDiscarding]=useState(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 usePreventRemove(!saved&&!discarding&&(dirty||submitting||uncertain),({repeat})=>{if(lock.current)return;const discard=()=>{setDiscarding(true);repeat();};const body=uncertain?f.leaveUnknown:f.discardBody;if(Platform.OS==='web'){if(window.confirm(`${f.discardTitle}\n${body}`))discard();}else Alert.alert(f.discardTitle,body,[{text:f.stay,style:'cancel'},{text:f.discard,style:'destructive',onPress:discard}]);});
 useEffect(()=>{if(saved){if(saved.edit&&router.canGoBack())router.back();else router.replace({pathname:'/inventory/[id]',params:{kind:saved.kind,id:saved.id}});}},[saved,router]);
 const save=async(command:InventoryCommand)=>{
  if(lock.current||uncertain||saved)return;lock.current=true;setMessage('');
  try{const result=await controller.saveInventory(command);if(mounted.current){setSaved({id:result.id,kind:command.kind,edit:!!command.record});for(const key of ['inventory','inventory-summary','inventory-detail','inventory-lots'])void client.invalidateQueries({queryKey:[key]});}}
  catch(error){if(mounted.current){if(error instanceof InventorySaveUnconfirmed){setUncertain(true);setMessage(f.uncertain);}else if(isAxiosError(error)&&[400,422].includes(error.response?.status??0)){
    const body=error.response?.data?.error?.detail??error.response?.data;
    const flatten=(v:unknown):string[]=>typeof v==='string'?[v]:Array.isArray(v)?v.flatMap(flatten):v&&typeof v==='object'?Object.values(v).flatMap(flatten):[];
    const known=['nome','cnpj','categorias','categoria','unidade_medida','estoque_minimo','prioridade','especie_animal','tipo_contrato','contatos','enderecos','expected_updated_at','non_field_errors','detail'];
    const details=body&&typeof body==='object'?known.flatMap(k=>flatten(body[k])):[];setMessage(details.length?details.join(' ').slice(0,1000):f.failed);
   }else setMessage(f.failed);}}
  finally{lock.current=false;}
 };
 return {save,message,uncertain,disabled:submitting||uncertain||!!saved,invalid:()=>setMessage(f.invalid),back:()=>{if(!lock.current){if(router.canGoBack())router.back();else router.replace('/inventory');}},review:()=>router.push('/inventory')};
}
function ProductEditor({choices,record}:{choices:Choices;record?:InventoryItem}){
 const {language}=useAuth();const f=inventoryFormMessages[language],t=inventoryMessages[language],w=workspaceMessages[language];
 const {control,handleSubmit,formState:{isDirty,isSubmitting}}=useForm<ProductInput>({resolver:zodResolver(productInputSchema),defaultValues:productDefaults(record)});const mutation=useInventorySave(isDirty,isSubmitting);const selected=useWatch({control,name:'categorias'});
 return <AgendaShell title={record?f.editProduct:f.createProduct} backLabel={w.back} onBack={mutation.back}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
 <Text style={s.muted}>{record?f.editHint:f.productHint}</Text><Field control={control} name="nome" label={f.name} disabled={mutation.disabled}/>
 {record?<View style={s.card}><Text style={s.body}>{t.category}: {selected.map(v=>t.categories[v]??v).join(' · ')}</Text><Text style={s.body}>{t.unit}: {record.unidade_medida}</Text><Text style={s.body}>{t.balance}: {new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(record.estoque_atual))} {record.unidade_medida}</Text></View>:<><Text style={s.label}>{t.category}</Text><Controller control={control} name="categorias" render={({field})=><View style={s.row}>{choices.categorias.map(c=><AgendaButton key={c.value} label={t.categories[c.value]??c.label} disabled={mutation.disabled} selected={field.value.includes(c.value)} onPress={()=>field.onChange(field.value.includes(c.value)?field.value.filter(v=>v!==c.value):[...field.value,c.value])}/>)}</View>}/><Text style={s.label}>{t.unit}</Text><Controller control={control} name="unidade_medida" render={({field})=><View style={s.row}>{choices.unidades.map(c=><AgendaButton key={c.value} label={c.value} selected={field.value===c.value} disabled={mutation.disabled} onPress={()=>field.onChange(c.value)}/>)}</View>}/></>}
 <Field control={control} name="estoque_minimo" label={t.minimum} decimal disabled={mutation.disabled}/><Text style={s.label}>{f.priority}</Text><Controller control={control} name="prioridade" render={({field})=><View style={s.row}>{priorities.map(v=><AgendaButton key={v} label={t.labels[v]??v} selected={field.value===v} disabled={mutation.disabled} onPress={()=>field.onChange(v)}/>)}</View>}/>
 <Field control={control} name="fabricante" label={t.manufacturer} disabled={mutation.disabled}/><Field control={control} name="descricao" label={t.description} multiline disabled={mutation.disabled}/><Text style={s.label}>{f.species}</Text><Controller control={control} name="especie_animal" render={({field})=><View style={s.row}>{[{value:'',label:f.none},...choices.especies].map(c=><AgendaButton key={c.value} label={c.value?t.labels[c.value]??c.label:c.label} selected={field.value===c.value} disabled={mutation.disabled} onPress={()=>field.onChange(c.value)}/>)}</View>}/>
 {selected.some(c=>['medicamento','vacina','medicamento_vacina','semen'].includes(c))&&<Text style={s.muted}>{f.technicalHint}</Text>}{!!mutation.message&&<Text accessibilityRole="alert" style={s.error}>{mutation.message}</Text>}<AgendaButton label={isSubmitting?f.saving:f.save} disabled={mutation.disabled} onPress={()=>void handleSubmit(v=>mutation.save({kind:'items',values:v,record}),mutation.invalid)()}/>{mutation.uncertain&&<AgendaButton label={f.review} onPress={mutation.review}/>}</ScrollView></KeyboardAvoidingView></AgendaShell>;
}
function SupplierEditor({choices,record}:{choices:Choices;record?:InventorySupplier}){
 const {language}=useAuth();const f=inventoryFormMessages[language],t=inventoryMessages[language],w=workspaceMessages[language];
 const {control,handleSubmit,formState:{isDirty,isSubmitting}}=useForm<SupplierInput>({resolver:zodResolver(supplierInputSchema),defaultValues:supplierDefaults(record)});const contacts=useFieldArray({control,name:'contatos'}),addresses=useFieldArray({control,name:'enderecos'});const mutation=useInventorySave(isDirty,isSubmitting);
 return <AgendaShell title={record?f.editSupplier:f.createSupplier} backLabel={w.back} onBack={mutation.back}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
 <Text style={s.muted}>{f.nestedHint}</Text><Field control={control} name="nome" label={f.name} disabled={mutation.disabled}/><Field control={control} name="cnpj" label={t.document} disabled={mutation.disabled}/><Text style={s.label}>{t.contract}</Text><Controller control={control} name="tipo_contrato" render={({field})=><View style={s.row}>{choices.tipos_contrato.map(c=><AgendaButton key={c.value} label={t.labels[c.value]??c.label} selected={field.value===c.value} disabled={mutation.disabled} onPress={()=>field.onChange(c.value)}/>)}</View>}/>
 <Text style={s.title}>{t.contacts}</Text>{contacts.fields.map((row,i)=><View key={row.id} style={s.card}><Text style={s.title}>{t.contacts} {i+1}</Text><Text style={s.label}>{f.type}</Text><Controller control={control} name={`contatos.${i}.tipo`} render={({field})=><View style={s.row}>{(['telefone','email'] as const).map(v=><AgendaButton key={v} label={v==='telefone'?f.phone:f.email} selected={field.value===v} disabled={mutation.disabled} onPress={()=>field.onChange(v)}/>)}</View>}/><Field control={control} name={`contatos.${i}.label`} label={`${f.label} ${i+1}`} accessibilityLabel={`${t.contacts} ${i+1}: ${f.label}`} disabled={mutation.disabled}/><Field control={control} name={`contatos.${i}.valor`} label={`${f.value} ${i+1}`} accessibilityLabel={`${t.contacts} ${i+1}: ${f.value}`} disabled={mutation.disabled}/><AgendaButton label={`${f.remove} ${t.contacts} ${i+1}`} disabled={mutation.disabled} onPress={()=>contacts.remove(i)}/></View>)}<AgendaButton label={f.addContact} disabled={mutation.disabled} onPress={()=>contacts.append({tipo:'telefone',label:'',valor:''})}/>
 <Text style={s.title}>{t.addresses}</Text>{addresses.fields.map((row,i)=><View key={row.id} style={s.card}><Text style={s.title}>{t.addresses} {i+1}</Text>{([['label',f.label],['cep',f.postal],['logradouro',f.street],['numero',f.number],['bairro',f.district],['complemento',f.extra],['cidade',f.city],['estado',f.state],['latitude',f.latitude],['longitude',f.longitude]] as const).map(([name,label])=><Field key={name} control={control} name={`enderecos.${i}.${name}`} label={`${label} ${i+1}`} accessibilityLabel={`${t.addresses} ${i+1}: ${label}`} disabled={mutation.disabled} decimal={name==='latitude'||name==='longitude'}/>)}<AgendaButton label={`${f.remove} ${t.addresses} ${i+1}`} disabled={mutation.disabled} onPress={()=>addresses.remove(i)}/></View>)}<AgendaButton label={f.addAddress} disabled={mutation.disabled} onPress={()=>addresses.append({label:'',cep:'',logradouro:'',numero:'',bairro:'',complemento:'',cidade:'',estado:'',latitude:'',longitude:''})}/>
 {!!mutation.message&&<Text accessibilityRole="alert" style={s.error}>{mutation.message}</Text>}<AgendaButton label={isSubmitting?f.saving:f.save} disabled={mutation.disabled} onPress={()=>void handleSubmit(v=>mutation.save({kind:'suppliers',values:v,record}),mutation.invalid)()}/>{mutation.uncertain&&<AgendaButton label={f.review} onPress={mutation.review}/>}</ScrollView></KeyboardAvoidingView></AgendaShell>;
}
