import {useState} from 'react';
import {ScrollView,Text,TextInput,View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {isAxiosError} from 'axios';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,FormField,styles as ui} from '../agenda/ui';
import {HomeIcon} from '../home/HomeIcon';
import {colors} from '../../theme/tokens';
import {BottomSheet,DateStepper,EmptyState,ErrorState,FilterChips,IconTile,ListRow,Notice,PickerModal,ScreenIntro,SelectChip,SheetOption,SkeletonList,localToday,mobileStyles as ms} from '../../components/mobile';
import {applicationMethods,canManagePlantations,canWriteCrops,cropOperationKinds,cropStatuses,cropTypes,executionTypes,harvestDestinations,harvestTypes,harvestUnits,irrigationSystems,landOperations,operationItemCategories,pesticideTypes,type CropItem,type CropOperationKind} from './contracts';
import {cropMessages} from './messages';
import {cropFormMessages} from './formMessages';

type Errors=Record<string,string|undefined>;
const decimalOk=(v:string)=>/^\d+([.,]\d{1,2})?$/.test(v.trim())&&Number(v.replace(',','.'))>0;
function serverErrors(error:unknown):{fields:Errors;message?:string}{
 if(isAxiosError(error)&&error.response?.data&&typeof error.response.data==='object'){const data=error.response.data as Record<string,unknown>;const fields:Errors={};for(const [k,v] of Object.entries(data))fields[k]=Array.isArray(v)?v.filter(x=>typeof x==='string').join(' '):typeof v==='string'?v:undefined;return {fields,message:typeof data.detail==='string'?data.detail:undefined};}
 return {fields:{}};
}
function Field({label,value,onChange,error,unit,numeric,multiline,hint}:{label:string;value:string;onChange:(v:string)=>void;error?:string;unit?:string;numeric?:boolean;multiline?:boolean;hint?:string}){
 return <FormField label={label} unit={unit} error={error} hint={hint}><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType={numeric?'decimal-pad':'default'} selectTextOnFocus={numeric} multiline={multiline} maxLength={multiline?2000:255} style={[ui.fieldControl,numeric&&{fontVariant:['tabular-nums']},multiline&&{minHeight:80,textAlignVertical:'top',paddingTop:12}]}/></FormField>;
}
function Chips<T extends string>({label,value,onChange,options,labels}:{label:string;value:T;onChange:(v:T)=>void;options:readonly T[];labels:Record<string,string>}){
 return <View style={{gap:6}}><Text style={ui.label}>{label}</Text><FilterChips value={value} onChange={onChange} options={options.map(o=>({value:o,label:labels[o]??o}))}/></View>;
}

export function PlantationFormScreen(){
 const params=useLocalSearchParams();const editId=z.uuid().safeParse(params.id);const id=editId.success?editId.data:undefined;
 const {state,controller,language}=useAuth();const router=useRouter();const client=useQueryClient();const f=cropFormMessages[language],t=cropMessages[language],w=workspaceMessages[language];
 const allowed=state.status==='signedIn'&&canManagePlantations(state.session.user);
 const fields=useQuery({queryKey:['crops-fields'],enabled:allowed,queryFn:({signal})=>controller.cropFields(signal)});
 const current=useQuery({queryKey:['crops-plantation',id],enabled:allowed&&!!id,queryFn:({signal})=>controller.plantation(id!,signal)});
 const [v,setV]=useState<{name:string;field:string;crop_type:typeof cropTypes[number];crop_name:string;variety:string;planted_area_ha:string;planting_date:string;expected_harvest_date:string;status:typeof cropStatuses[number];estimated_production_kg:string;notes:string}|null>(id?null:{name:'',field:'',crop_type:'grain',crop_name:'',variety:'',planted_area_ha:'',planting_date:localToday(),expected_harvest_date:'',status:'planned',estimated_production_kg:'',notes:''});
 if(id&&!v&&current.data){const r=current.data;setV({name:r.name,field:r.field??'',crop_type:(cropTypes as readonly string[]).includes(r.crop_type??'')?r.crop_type as typeof cropTypes[number]:'grain',crop_name:r.crop_name??'',variety:r.variety??'',planted_area_ha:r.planted_area_ha??'',planting_date:r.planting_date??localToday(),expected_harvest_date:r.expected_harvest_date??'',status:r.status,estimated_production_kg:r.estimated_production_kg??'',notes:r.notes??''});}
 const [sheet,setSheet]=useState(false);const [errors,setErrors]=useState<Errors>({});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const set=(patch:Partial<NonNullable<typeof v>>)=>setV(prev=>prev?{...prev,...patch}:prev);
 const fieldRow=(fields.data??[]).find(row=>row.id===v?.field);
 const submit=async()=>{
  if(!v||busy)return;const next:Errors={};
  if(!v.field)next.field=f.errRequired;if(!v.crop_name.trim())next.crop_name=f.errRequired;
  for(const k of ['planted_area_ha','estimated_production_kg'] as const)if(v[k].trim()&&!decimalOk(v[k]))next[k]=f.errNumber;
  setErrors(next);if(Object.values(next).some(Boolean))return;
  setBusy(true);setMessage('');
  try{const saved=await controller.savePlantation(v,id);
   for(const key of ['crops-plantations','crops-dashboard','crops-plantation-dashboard','crops-plantation','home'])void client.invalidateQueries({queryKey:[key]});
   router.replace({pathname:'/crops/[id]',params:{id:saved.id}});}
  catch(e){const s=serverErrors(e);setErrors(s.fields);setMessage(s.message??(isAxiosError(e)&&!e.response?f.uncertain:f.failed));}
  finally{setBusy(false);}
 };
 return <WorkspaceShell active="crops" title={id?f.editPlantation:f.newPlantation} layout="form" onBack={()=>{if(!busy){if(router.canGoBack())router.back();else router.replace('/crops');}}}><ScrollView contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled">
  {!allowed?<EmptyState title={w.noAccess}/>:!v?<SkeletonList rows={4}/>:<>
   <ScreenIntro title={id?f.editPlantation:f.newPlantation}/>
   {!id&&<View style={{gap:6}}><Text style={ui.label}>{f.field}</Text><SelectChip label={f.chooseField} value={fieldRow?`${fieldRow.name}${fieldRow.farm_name?` · ${fieldRow.farm_name}`:''}`:undefined} active={!!v.field} onPress={()=>setSheet(true)}/>{!!errors.field&&<Text accessibilityRole="alert" style={{fontSize:13,fontWeight:'600',color:colors.danger}}>{errors.field}</Text>}</View>}
   <Chips label={f.cropType} value={v.crop_type} onChange={crop_type=>set({crop_type})} options={cropTypes} labels={f.cropTypes}/>
   <Field label={f.crop} value={v.crop_name} onChange={crop_name=>set({crop_name})} error={errors.crop_name}/>
   <Field label={`${f.variety} · ${f.optional}`} value={v.variety} onChange={variety=>set({variety})} error={errors.variety}/>
   <Field label={`${f.name} · ${f.optional}`} hint={f.nameHint} value={v.name} onChange={name=>set({name})} error={errors.name}/>
   <Field label={`${f.plantedArea} · ${f.optional}`} unit="ha" numeric value={v.planted_area_ha} onChange={planted_area_ha=>set({planted_area_ha})} error={errors.planted_area_ha}/>
   <View style={{gap:6}}><Text style={ui.label}>{f.plantingDate}</Text><DateStepper value={v.planting_date} onChange={planting_date=>set({planting_date})} language={language}/></View>
   <View style={{gap:6}}><Text style={ui.label}>{`${f.expectedHarvest} · ${f.optional}`}</Text>{v.expected_harvest_date?<DateStepper value={v.expected_harvest_date} onChange={expected_harvest_date=>set({expected_harvest_date})} language={language}/>:null}<FilterChips value={v.expected_harvest_date?'set':'none'} onChange={x=>set({expected_harvest_date:x==='none'?'':v.expected_harvest_date||v.planting_date})} options={[{value:'none',label:f.noDate},{value:'set',label:f.setDate}]}/></View>
   <Chips label={f.status} value={v.status} onChange={status=>set({status})} options={cropStatuses} labels={t.statuses}/>
   <Field label={`${f.estimated} · ${f.optional}`} unit="kg" numeric value={v.estimated_production_kg} onChange={estimated_production_kg=>set({estimated_production_kg})} error={errors.estimated_production_kg}/>
   <Field label={`${f.notes} · ${f.optional}`} multiline value={v.notes} onChange={notes=>set({notes})}/>
   {!!message&&<Notice tone="danger" text={message}/>}
   <AgendaButton variant="primary" busy={busy} disabled={busy} label={f.save} onPress={()=>void submit()}/>
   <BottomSheet visible={sheet} title={f.chooseField} onClose={()=>setSheet(false)} language={language}>
    {fields.isPending?<SkeletonList rows={3}/>:fields.isError?<ErrorState message={w.error} language={language} onRetry={()=>void fields.refetch()}/>:(fields.data??[]).filter(r=>r.is_active!==false).length?(fields.data??[]).filter(r=>r.is_active!==false).map(r=><SheetOption key={r.id} label={`${r.name}${r.farm_name?` · ${r.farm_name}`:''}${r.area_ha?` · ${r.area_ha} ha`:''}`} selected={v.field===r.id} onPress={()=>{set({field:r.id});setErrors(e=>({...e,field:undefined}));setSheet(false);}}/>):<Notice tone="neutral" text={f.noFields}/>}
   </BottomSheet>
  </>}
 </ScrollView></WorkspaceShell>;
}

const routeSchema=z.object({kind:z.enum(cropOperationKinds),plantation:z.uuid()});
export function CropOperationScreen(){
 const params=useLocalSearchParams();const route=routeSchema.safeParse(params);
 const {state,controller,language}=useAuth();const router=useRouter();const client=useQueryClient();const f=cropFormMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canWriteCrops(state.session.user);
 const financial=state.status==='signedIn'&&state.session.user.access.can_view_financial;
 const kind:CropOperationKind=route.success?route.data.kind:'plantings';const plantationId=route.success?route.data.plantation:'';
 const plantation=useQuery({queryKey:['crops-plantation',plantationId],enabled:allowed,queryFn:({signal})=>controller.plantation(plantationId,signal)});
 const categories=operationItemCategories[kind];
 const items=useQuery({queryKey:['crops-items',kind],enabled:allowed&&!!categories,queryFn:({signal})=>controller.cropItems(categories!,signal)});
 const [item,setItem]=useState<CropItem|null>(null);const [picker,setPicker]=useState(false);
 const [v,setV]=useState({quantity:'',unit:'',date:localToday(),operator:'',notes:'',spacing:'',application_method:'broadcast' as typeof applicationMethods[number],area_applied_ha:'',pesticide_type:'herbicide' as typeof pesticideTypes[number],active_ingredient:'',irrigation_system:'center_pivot' as typeof irrigationSystems[number],hours:'',flow_rate_l_per_h:'',operation_type:'gradagem' as typeof landOperations[number],execution_type:'own' as typeof executionTypes[number],hours_worked:'',fuel_liters:'',harvest_type:'partial' as typeof harvestTypes[number],quantity_unit:'kg' as typeof harvestUnits[number],unit_weight_kg:'',destination:'stock' as typeof harvestDestinations[number],buyer_name:'',unit_price:'',quality_grade:''});
 const set=(patch:Partial<typeof v>)=>setV(prev=>({...prev,...patch}));
 const [errors,setErrors]=useState<Errors>({});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [done,setDone]=useState(false);
 const build=()=>{const common={plantation:plantationId,operator:v.operator,notes:v.notes};
  switch(kind){
   case 'plantings':return {kind,...common,item:item?.id??'',quantity:v.quantity,unit:v.unit||item?.unidade_medida||'',planting_date:v.date,spacing:v.spacing};
   case 'fertilizations':return {kind,...common,item:item?.id??'',quantity:v.quantity,unit:v.unit||item?.unidade_medida||'',application_date:v.date,application_method:v.application_method,area_applied_ha:v.area_applied_ha};
   case 'pesticides':return {kind,...common,item:item?.id??'',quantity:v.quantity,unit:v.unit||item?.unidade_medida||'',application_date:v.date,pesticide_type:v.pesticide_type,active_ingredient:v.active_ingredient,area_applied_ha:v.area_applied_ha};
   case 'irrigations':return {kind,...common,date:v.date,irrigation_system:v.irrigation_system,hours:v.hours,flow_rate_l_per_h:v.flow_rate_l_per_h};
   case 'land-preparations':return {kind,...common,date:v.date,operation_type:v.operation_type,execution_type:v.execution_type,hours_worked:v.hours_worked,fuel_liters:v.fuel_liters};
   case 'harvests':return {kind,plantation:plantationId,notes:v.notes.slice(0,200),harvest_type:v.harvest_type,harvest_date:v.date,quantity:v.quantity,quantity_unit:v.quantity_unit,unit_weight_kg:v.unit_weight_kg,destination:v.destination,buyer_name:v.buyer_name,unit_price:v.unit_price,quality_grade:v.quality_grade};
  }
 };
 const submit=async()=>{
  if(busy||done)return;const next:Errors={};
  if(categories&&!item)next.item=f.errRequired;
  if((categories||kind==='harvests')&&!decimalOk(v.quantity))next.quantity=f.errNumber;
  for(const k of ['area_applied_ha','hours','flow_rate_l_per_h','hours_worked','fuel_liters','unit_weight_kg'] as const)if(v[k].trim()&&!decimalOk(v[k]))next[k]=f.errNumber;
  if(kind==='harvests'&&v.destination==='sale'){if(!v.buyer_name.trim())next.buyer_name=f.errSale;if(!decimalOk(v.unit_price))next.unit_price=f.errSale;}
  setErrors(next);if(Object.values(next).some(Boolean))return;
  setBusy(true);setMessage('');
  try{await controller.createCropOperation(build());setDone(true);
   for(const key of ['crops-activities','crops-plantation-dashboard','crops-plantations','crops-dashboard','crops-plantation','inventory','inventory-summary','inventory-movements','finance-transactions','finance-stats','home'])void client.invalidateQueries({queryKey:[key]});
   router.replace({pathname:'/crops/[id]',params:{id:plantationId}});}
  catch(e){const s=serverErrors(e);setErrors(s.fields);setMessage(s.message??(isAxiosError(e)&&!e.response?f.uncertain:f.failed));}
  finally{setBusy(false);}
 };
 const stockText=(row:CropItem)=>row.estoque_atual!=null?`${f.stock}: ${row.estoque_atual} ${row.unidade_medida}`:row.unidade_medida;
 const p=plantation.data;
 return <WorkspaceShell active="crops" title={f.ops[kind]??kind} layout="form" onBack={()=>{if(!busy){if(router.canGoBack())router.back();else router.replace('/crops');}}}><ScrollView contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled">
  {!allowed?<EmptyState title={w.noAccess}/>:plantation.isPending?<SkeletonList rows={3}/>:plantation.isError||!p?<ErrorState message={w.error} language={language} onRetry={()=>void plantation.refetch()}/>:<>
   <ScreenIntro title={f.ops[kind]??kind} subtitle={[p.name,p.field_name,p.farm_name].filter(Boolean).join(' · ')}/>
   {categories&&<View style={{gap:6}}><Text style={ui.label}>{f.item}</Text>{item?<ListRow title={item.nome} subtitle={stockText(item)} leading={<IconTile tone="brand"><HomeIcon name="box" size={20} color={colors.primary}/></IconTile>} onPress={()=>setPicker(true)}/>:<SelectChip label={f.chooseItem} active={false} onPress={()=>setPicker(true)}/>}{!!errors.item&&<Text accessibilityRole="alert" style={{fontSize:13,fontWeight:'600',color:colors.danger}}>{errors.item}</Text>}</View>}
   {kind==='harvests'&&<><Chips label={f.harvestType} value={v.harvest_type} onChange={harvest_type=>set({harvest_type})} options={harvestTypes} labels={f.harvestTypes}/><Chips label={f.unit} value={v.quantity_unit} onChange={quantity_unit=>set({quantity_unit})} options={harvestUnits} labels={f.units}/></>}
   {(categories||kind==='harvests')&&<Field label={f.quantity} unit={kind==='harvests'?f.units[v.quantity_unit]:v.unit||item?.unidade_medida} numeric value={v.quantity} onChange={quantity=>set({quantity})} error={errors.quantity}/>}
   {kind==='harvests'&&v.quantity_unit!=='kg'&&<Field label={`${f.unitWeight} · ${f.optional}`} unit="kg" numeric value={v.unit_weight_kg} onChange={unit_weight_kg=>set({unit_weight_kg})} error={errors.unit_weight_kg}/>}
   <View style={{gap:6}}><Text style={ui.label}>{f.date}</Text><DateStepper value={v.date} max={localToday()} onChange={date=>set({date})} language={language}/></View>
   {kind==='plantings'&&<Field label={`${f.spacing} · ${f.optional}`} value={v.spacing} onChange={spacing=>set({spacing})}/>}
   {kind==='fertilizations'&&<Chips label={f.method} value={v.application_method} onChange={application_method=>set({application_method})} options={applicationMethods} labels={f.methods}/>}
   {kind==='pesticides'&&<><Chips label={f.pesticideType} value={v.pesticide_type} onChange={pesticide_type=>set({pesticide_type})} options={pesticideTypes} labels={f.pesticides}/><Field label={`${f.activeIngredient} · ${f.optional}`} value={v.active_ingredient} onChange={active_ingredient=>set({active_ingredient})}/></>}
   {(kind==='fertilizations'||kind==='pesticides')&&<Field label={`${f.appliedArea} · ${f.optional}`} unit="ha" numeric value={v.area_applied_ha} onChange={area_applied_ha=>set({area_applied_ha})} error={errors.area_applied_ha}/>}
   {kind==='irrigations'&&<><Chips label={f.system} value={v.irrigation_system} onChange={irrigation_system=>set({irrigation_system})} options={irrigationSystems} labels={f.systems}/><Field label={`${f.hours} · ${f.optional}`} unit="h" numeric value={v.hours} onChange={hours=>set({hours})} error={errors.hours}/><Field label={`${f.flow} · ${f.optional}`} unit="L/h" numeric value={v.flow_rate_l_per_h} onChange={flow_rate_l_per_h=>set({flow_rate_l_per_h})} error={errors.flow_rate_l_per_h}/></>}
   {kind==='land-preparations'&&<><Chips label={f.operation} value={v.operation_type} onChange={operation_type=>set({operation_type})} options={landOperations} labels={f.lands}/><Chips label={f.execution} value={v.execution_type} onChange={execution_type=>set({execution_type})} options={executionTypes} labels={f.executions}/><Field label={`${f.hoursWorked} · ${f.optional}`} unit="h" numeric value={v.hours_worked} onChange={hours_worked=>set({hours_worked})} error={errors.hours_worked}/><Field label={`${f.fuel} · ${f.optional}`} unit="L" numeric value={v.fuel_liters} onChange={fuel_liters=>set({fuel_liters})} error={errors.fuel_liters}/></>}
   {kind==='harvests'&&<><Chips label={f.destination} value={v.destination} onChange={destination=>set({destination})} options={financial?harvestDestinations:harvestDestinations.filter(d=>d!=='sale')} labels={f.destinations}/>{!financial&&<Notice tone="neutral" text={f.noFinance}/>}
    {v.destination==='sale'&&<><Field label={f.buyer} value={v.buyer_name} onChange={buyer_name=>set({buyer_name})} error={errors.buyer_name}/><Field label={f.unitPrice} unit="R$" numeric value={v.unit_price} onChange={unit_price=>set({unit_price})} error={errors.unit_price}/></>}
    <Field label={`${f.quality} · ${f.optional}`} value={v.quality_grade} onChange={quality_grade=>set({quality_grade})}/></>}
   {kind!=='harvests'&&<Field label={`${f.operator} · ${f.optional}`} value={v.operator} onChange={operator=>set({operator})}/>}
   <Field label={`${f.notes} · ${f.optional}`} multiline value={v.notes} onChange={notes=>set({notes})}/>
   <Notice tone="info" text={kind==='harvests'?f.effectsHarvest:categories?f.effects:f.effectsNoStock}/>
   {!!message&&<Notice tone="danger" text={message}/>}
   {Object.entries(errors).filter(([k,val])=>val&&!['item','quantity','area_applied_ha','hours','flow_rate_l_per_h','hours_worked','fuel_liters','unit_weight_kg','buyer_name','unit_price'].includes(k)).map(([k,val])=><Notice key={k} tone="danger" text={val!}/>)}
   <AgendaButton variant="primary" busy={busy} disabled={busy||done} label={f.save} onPress={()=>void submit()}/>
   {picker&&<PickerModal<CropItem> title={f.chooseItem} language={language} onClose={()=>setPicker(false)} list={{rows:items.data??[],isPending:items.isPending,isError:items.isError,refetch:()=>items.refetch(),loadMore:()=>undefined,isFetchingNextPage:false,hasNextPage:false}} keyExtractor={r=>r.id} emptyLabel={f.noItems} errorLabel={w.error}
    renderItem={row=><ListRow title={row.nome} subtitle={stockText(row)} disabled={row.estoque_atual!=null&&Number(row.estoque_atual)<=0} leading={<IconTile tone="brand"><HomeIcon name="box" size={20} color={colors.primary}/></IconTile>} onPress={()=>{setItem(row);set({unit:row.unidade_medida});setErrors(e=>({...e,item:undefined}));setPicker(false);}}/>}/>}
  </>}
 </ScrollView></WorkspaceShell>;
}
