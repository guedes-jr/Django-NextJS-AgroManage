import {useCallback,useState} from 'react';
import {FlatList,RefreshControl,ScrollView,Text,TextInput,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {isAxiosError} from 'axios';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,FormField,styles as ui} from '../agenda/ui';
import {colors} from '../../theme/tokens';
import {DateStepper,EmptyState,ErrorState,HeaderAction,IconTile,KpiStrip,ListRow,MetricGrid,Notice,PickerModal,ScreenIntro,Segmented,SkeletonList,localToday,mobileStyles as ms} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {DairyIcon} from './DairyIcon';
import {productionSchema,type CattleBatch,type Production} from './contracts';
import {canReadCattleSales,canSellCattle,saleEstimate,type CattleSaleRow} from './saleContracts';
import {saleMessages} from './saleMessages';
import {cattleMessages} from './messages';

const money=(v:number|string|null|undefined,language:string)=>v==null?'—':new Intl.NumberFormat(language,{style:'currency',currency:'BRL'}).format(Number(v));
const day=(v:string,language:string)=>new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${v}T12:00:00Z`));

export function CattleSalesScreen(){
 const params=useLocalSearchParams();const route=productionSchema.safeParse(params.production);const production:Production=route.success?route.data:'beef';
 const {state,controller,language}=useAuth();const {farm}=useWorkspace();const router=useRouter();const t=saleMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canReadCattleSales(state.session.user);
 const writable=state.status==='signedIn'&&canSellCattle(state.session.user);
 const q=useQuery({queryKey:['cattle-sales',production,farm?.id],enabled:allowed,queryFn:({signal})=>controller.cattleSales(production,farm?.id,signal)});
 const {refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const [picker,setPicker]=useState(false);const [refreshing,setRefreshing]=useState(false);
 const rows=q.data??[];
 const total=rows.reduce((sum,r)=>sum+Number(r.net_amount??r.amount??0),0),heads=rows.reduce((sum,r)=>sum+Number(r.quantity??0),0);
 return <WorkspaceShell active={production} title={t.title} onBack={()=>router.canGoBack()?router.back():router.replace({pathname:'/cattle/[production]',params:{production}})}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<>
  <FlatList<CattleSaleRow> data={rows} keyExtractor={r=>r.id} contentContainerStyle={ms.list}
   refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await refetch();}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>}
   ListHeaderComponent={<View style={ms.header}><ScreenIntro title={t.title} subtitle={farm?.name??t.subtitle} action={writable?<HeaderAction label={t.newSale} onPress={()=>setPicker(true)}/>:undefined}/>{!!rows.length&&<KpiStrip items={[{key:'s',label:t.sales,value:String(rows.length)},{key:'h',label:t.heads,value:String(heads)},{key:'r',label:t.revenue,value:money(total,language),tone:'success'}]}/>}</View>}
   renderItem={({item})=><ListRow meta={`${day(item.date,language)}${item.buyer?` · ${item.buyer}`:''}`} title={item.batch_code??'—'} subtitle={[item.quantity!=null?`${item.quantity} ${cattleMessages[language].quantity.toLowerCase()}`:null,item.weight_kg?`${item.weight_kg} kg`:null].filter(Boolean).join(' · ')||undefined} value={money(item.net_amount??item.amount,language)} leading={<IconTile tone="success"><DairyIcon name="wallet" size={20} color={colors.success}/></IconTile>}/>}
   ListEmptyComponent={q.isPending?<SkeletonList/>:q.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}/>
  {picker&&<BatchPicker production={production} onClose={()=>setPicker(false)} onSelect={batch=>{setPicker(false);router.push({pathname:'/cattle/[production]/sale',params:{production,batch:batch.id,farm:batch.farm_id}});}}/>}
 </>}</WorkspaceShell>;
}
function BatchPicker({production,onSelect,onClose}:{production:Production;onSelect:(b:CattleBatch)=>void;onClose:()=>void}){
 const {controller,language}=useAuth();const {farm}=useWorkspace();const t=saleMessages[language],c=cattleMessages[language],w=workspaceMessages[language];
 const [search,setSearch]=useState('');
 const list=useInfinitePages<CattleBatch>({queryKey:['cattle-sale-batches','infinite',production,farm?.id,search],enabled:true,fetchPage:(page,signal)=>controller.cattleList({production,kind:'batches',farm:farm?.id,search,status:'active',page},signal) as Promise<{results:CattleBatch[];next:string|null;count:number}>});
 return <PickerModal<CattleBatch> title={t.chooseBatch} language={language} onClose={onClose} search={search} onSearch={setSearch} searchPlaceholder={c.search} list={list} keyExtractor={b=>b.id} emptyLabel={t.noBatches} errorLabel={w.error}
  renderItem={b=><ListRow meta={b.farm_name} title={b.batch_code} subtitle={b.name||undefined} value={`${b.quantity}`} valueCaption={c.quantity} disabled={b.quantity<=0} leading={<IconTile tone="brand"><DairyIcon name="herd" size={20}/></IconTile>} onPress={()=>onSelect(b)}/>}/>;
}

export function CattleSaleScreen(){
 const params=useLocalSearchParams();const route=z.object({production:productionSchema,batch:z.uuid(),farm:z.uuid().optional()}).safeParse(params);
 const {state,controller,language}=useAuth();const router=useRouter();const client=useQueryClient();const t=saleMessages[language],w=workspaceMessages[language];
 const allowed=route.success&&state.status==='signedIn'&&canSellCattle(state.session.user);
 const production:Production=route.success?route.data.production:'beef';
 const batch=useQuery({queryKey:['cattle-detail',production,'batches',params.batch,params.farm],enabled:allowed,queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.cattleDetail('batches',route.data.batch,production,route.data.farm,signal);}});
 const today=localToday();
 const [v,setV]=useState({mode:'whole' as 'whole'|'partial',quantity:'',date:today,due_date:today,buyer:'',responsible:'',notes:'',weight_kg:'',pricing_basis:'live_kg' as 'live_kg'|'carcass_arroba',price_per_kg:'',price_per_arroba:'',carcass_weight_kg:'',yield_percent:'',deductions:'',deduction_description:'',slaughter_reference:''});
 const set=(patch:Partial<typeof v>)=>setV(prev=>({...prev,...patch}));
 const [errors,setErrors]=useState<Record<string,string|undefined>>({});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [done,setDone]=useState(false);
 const b=batch.data&&!('identifier' in batch.data)?batch.data:undefined;
 const est=saleEstimate(v);
 const ok=(x:string)=>/^\d+([.,]\d+)?$/.test(x.trim())&&Number(x.replace(',','.'))>0;
 const submit=async()=>{
  if(busy||done||!b||!route.success)return;const e:Record<string,string|undefined>={};
  if(v.mode==='partial'&&(!/^\d+$/.test(v.quantity)||Number(v.quantity)<1||Number(v.quantity)>b.quantity))e.quantity=t.errQuantity;
  if(!ok(v.weight_kg))e.weight_kg=t.errNumber;
  if(v.pricing_basis==='live_kg'&&!ok(v.price_per_kg))e.price_per_kg=t.errNumber;
  if(v.pricing_basis==='carcass_arroba'&&(!ok(v.price_per_arroba)||!(ok(v.carcass_weight_kg)||ok(v.yield_percent))))e.price_per_arroba=t.errCarcass;
  if(Number(v.deductions.replace(',','.'))>0&&!v.deduction_description.trim())e.deduction_description=t.errDescription;
  if(!v.buyer.trim())e.buyer=t.errRequired;if(v.due_date<v.date)e.due_date=t.errDue;
  setErrors(e);if(Object.values(e).some(Boolean))return;
  setBusy(true);setMessage('');
  try{await controller.registerCattleSale(production,b.id,v);setDone(true);
   for(const key of ['cattle','cattle-detail','cattle-overview','cattle-sales','cattle-history','finance-transactions','finance-stats','finance-projection','home'])void client.invalidateQueries({queryKey:[key]});
   router.replace({pathname:'/cattle/[production]/sales',params:{production}});}
  catch(err){if(isAxiosError(err)&&err.response?.data&&typeof err.response.data==='object'){const data=err.response.data as Record<string,unknown>;const fields:Record<string,string>={};for(const [k,val] of Object.entries(data))fields[k]=Array.isArray(val)?val.filter(x=>typeof x==='string').join(' '):String(val);setErrors(fields);setMessage(fields.non_field_errors??fields.detail??t.failed);}else setMessage(isAxiosError(err)&&!err.response?t.uncertain:t.failed);}
  finally{setBusy(false);}
 };
 const field=(key:keyof typeof v,label:string,unit?:string,numeric=true)=><FormField key={key} label={label} unit={unit} error={errors[key]}><TextInput accessibilityLabel={label} value={v[key]} onChangeText={text=>set({[key]:text} as Partial<typeof v>)} keyboardType={numeric?'decimal-pad':'default'} selectTextOnFocus={numeric} maxLength={numeric?16:500} style={[ui.fieldControl,numeric&&{fontVariant:['tabular-nums']}]}/></FormField>;
 return <WorkspaceShell active={production} title={t.saleOf} layout="form" onBack={()=>{if(!busy){if(router.canGoBack())router.back();else router.replace({pathname:'/cattle/[production]/sales',params:{production}});}}}><ScrollView contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled">
  {!allowed?<EmptyState title={w.noAccess}/>:batch.isPending?<SkeletonList rows={3}/>:batch.isError||!b?<ErrorState message={w.error} language={language} onRetry={()=>void batch.refetch()}/>:<>
   <ScreenIntro title={`${t.saleOf} ${b.batch_code}`} subtitle={`${b.farm_name} · ${t.available}: ${b.quantity}`}/>
   <Segmented value={v.mode} onChange={mode=>set({mode})} options={[{value:'whole',label:t.whole},{value:'partial',label:t.partial}]}/>
   {v.mode==='partial'&&field('quantity',t.quantity)}
   <Segmented value={v.pricing_basis} onChange={pricing_basis=>set({pricing_basis})} options={[{value:'live_kg',label:t.live},{value:'carcass_arroba',label:t.carcass}]}/>
   {field('weight_kg',t.weight,'kg')}
   {v.pricing_basis==='live_kg'?field('price_per_kg',t.pricePerKg,'R$/kg'):<>{field('price_per_arroba',t.pricePerArroba,'R$/@')}{field('carcass_weight_kg',`${t.carcassWeight} · ${t.optional}`,'kg')}{field('yield_percent',`${t.yieldPercent} · ${t.optional}`,'%')}</>}
   {field('deductions',`${t.deductions} · ${t.optional}`,'R$')}
   {Number(v.deductions.replace(',','.'))>0&&field('deduction_description',t.deductionDescription,undefined,false)}
   <MetricGrid columns={2} items={[{label:`${t.gross} (${t.estimate})`,value:money(est.gross,language)},{label:`${t.net} (${t.estimate})`,value:money(est.net,language),tone:est.net>0?'success':'danger'}]}/>
   <Notice tone="info" text={t.estimateHint}/>
   <View style={{gap:6}}><Text style={ui.label}>{t.date}</Text><DateStepper value={v.date} max={today} min={b.entry_date??undefined} onChange={date=>set({date,due_date:v.due_date<date?date:v.due_date})} language={language}/>{!!errors.date&&<Text style={{color:colors.danger,fontWeight:'600'}}>{errors.date}</Text>}</View>
   {field('buyer',t.buyer,undefined,false)}
   <View style={{gap:6}}><Text style={ui.label}>{t.dueDate}</Text><DateStepper value={v.due_date} min={v.date} onChange={due_date=>set({due_date})} language={language}/>{!!errors.due_date&&<Text style={{color:colors.danger,fontWeight:'600'}}>{errors.due_date}</Text>}</View>
   {field('slaughter_reference',`${t.reference} · ${t.optional}`,undefined,false)}
   {field('responsible',`${t.responsible} · ${t.optional}`,undefined,false)}
   {field('notes',`${t.notes} · ${t.optional}`,undefined,false)}
   {!!message&&<Notice tone="danger" text={message}/>}
   <AgendaButton variant="primary" busy={busy} disabled={busy||done} label={t.save} onPress={()=>void submit()}/>
  </>}
 </ScrollView></WorkspaceShell>;
}
