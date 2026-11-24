import {launchMessages} from './launchMessages';
import {useCallback,useState} from 'react';
import {FlatList,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,StatusPill,type StatusTone} from '../agenda/ui';
import {HomeIcon} from '../home/HomeIcon';
import {colors} from '../../theme/tokens';
import {ActionGroup,ActionRow,BottomSheet,DetailHeader,EmptyState,ErrorState,FilterChips,HeaderAction,IconTile,InfoList,ListFooter,ListRow,MetricGrid,Notice,ScreenIntro,SearchBar,SectionLabel,SelectChip,SheetOption,SkeletonList,mobileStyles as ms,mobileUiMessages,presetOptions,presetRange,type PeriodPreset} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {canReadInventory,canWriteInventory} from './contracts';
import {movementTypes,type InventoryMovement,type MovementQuery} from './movementContracts';
import {movementMessages} from './movementMessages';
import {inventoryMessages} from './messages';
import {denied} from './InventoryScreen';
const contextSchema=z.object({item:z.uuid().optional(),lote:z.uuid().optional()});
const quantity=(row:InventoryMovement,language:string)=>new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(row.quantidade));
const registered=(row:InventoryMovement,language:string,style:'short'|'medium'='medium')=>new Intl.DateTimeFormat(language,{dateStyle:style,timeStyle:'short',timeZone:row.timezone}).format(new Date(row.data_movimentacao));
const inbound=new Set(['compra','entrada']),outbound=new Set(['venda','consumo','perda','saida','vencimento']);
export const movementTone=(tipo:string):StatusTone=>inbound.has(tipo)?'success':outbound.has(tipo)?tipo==='perda'||tipo==='vencimento'?'danger':'warning':'info';
const sign=(tipo:string)=>inbound.has(tipo)?'+':outbound.has(tipo)?'−':'±';
export function MovementScreen(){const params=useLocalSearchParams();const parsed=contextSchema.safeParse(params);return <MovementList key={`${params.item??''}:${params.lote??''}`} scope={parsed.success?parsed.data:undefined}/>;}
function MovementList({scope}:{scope?:z.infer<typeof contextSchema>}){
 const {state,controller,language}=useAuth();const t=movementMessages[language],i=inventoryMessages[language],w=workspaceMessages[language];const router=useRouter();const allowed=!!scope&&state.status==='signedIn'&&canReadInventory(state.session.user);
 const [search,setSearch]=useState(''),[tipo,setTipo]=useState<MovementQuery['tipo']>(''),[preset,setPreset]=useState<PeriodPreset>('any'),[sheet,setSheet]=useState(false);
 const period=presetRange(preset);
 const filters={search,tipo,...(period.start?{start:period.start,end:period.end}:{})};
 const list=useInfinitePages<InventoryMovement>({queryKey:['inventory-movements','infinite',scope,filters],enabled:allowed,fetchPage:(page,signal)=>controller.inventoryMovements({...scope,...filters,page},signal)});
 const {refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));const blocked=!allowed||denied(list.error);
 const writable=state.status==='signedIn'&&canWriteInventory(state.session.user);
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={t.scope} badge={scope&&(scope.item||scope.lote)?<View style={{marginTop:6}}><StatusPill label={t.context} tone="info"/></View>:undefined} action={writable?<HeaderAction label={launchMessages[language].title} onPress={()=>router.push({pathname:'/inventory/launch',params:scope?.item?{item:scope.item}:{}})}/>:undefined}/>
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
  <FilterChips label={t.period} value={preset} onChange={setPreset} options={presetOptions(language)} trailing={<SelectChip label={t.type} value={tipo?t.types[tipo]??tipo:undefined} active={!!tipo} onPress={()=>setSheet(true)}/>}/>
  {list.count!==undefined&&<Text style={{fontSize:12,color:colors.muted}}>{`${t.records}: ${list.count}`}</Text>}
  {list.isError&&!!list.rows.length&&<ErrorState message={i.stale} language={language} onRetry={()=>void refetch()}/>}
 </View>;
 return <WorkspaceShell active="inventory" title={t.title}>{blocked?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<>
  <FlatList<InventoryMovement> data={list.rows} keyExtractor={r=>r.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
   refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
   renderItem={({item:row})=>{const tone=movementTone(row.tipo);return <ListRow meta={`${registered(row,language,'short')}${row.lote?` · ${row.lote_numero||i.unknown}`:''}`} title={row.item_nome} subtitle={row.cattle_delivery?t.feeding:row.destino||undefined} value={`${sign(row.tipo)} ${quantity(row,language)}`} valueCaption={row.item_unidade} status={{label:t.types[row.tipo]??row.tipo,tone}} leading={<IconTile tone={tone}><HomeIcon name={inbound.has(row.tipo)?'trend':'box'} size={20} color={colors.textSoft}/></IconTile>} onPress={()=>router.push({pathname:'/inventory/movements/[id]',params:{id:row.id}})}/>;}}
   ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={i.empty} description={t.readonly}/>}
   ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>
  <BottomSheet visible={sheet} title={t.type} onClose={()=>setSheet(false)} language={language}>
   {(['',...movementTypes] as const).map(v=><SheetOption key={v||'all'} label={v?t.types[v]??v:t.all} selected={tipo===v} onPress={()=>{setTipo(v);setSheet(false);}}/>)}
  </BottomSheet>
 </>}</WorkspaceShell>;
}
export function MovementDetailScreen(){
 const params=useLocalSearchParams();const id=z.uuid().safeParse(params.id);const {state,controller,language}=useAuth();const t=movementMessages[language],i=inventoryMessages[language],w=workspaceMessages[language];const router=useRouter();const allowed=id.success&&state.status==='signedIn'&&canReadInventory(state.session.user);
 const q=useQuery({queryKey:['inventory-movement-detail',params.id],enabled:allowed,queryFn:({signal})=>{if(!id.success)throw Error('id');return controller.inventoryMovement(id.data,signal);}});const {refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));const row=denied(q.error)?undefined:q.data;const back=()=>router.canGoBack()?router.back():router.replace('/inventory/movements');
 return <WorkspaceShell active="inventory" title={t.detail} onBack={back}><ScrollView contentContainerStyle={ms.list}>{!allowed?<EmptyState title={w.noAccess}/>:<>{q.isPending&&<SkeletonList rows={3}/>}{q.isError&&<ErrorState message={row?i.stale:w.error} language={language} onRetry={()=>void refetch()}/>}{row&&<>
  <DetailHeader meta={registered(row,language)} title={row.item_nome} leading={<IconTile tone={movementTone(row.tipo)}><HomeIcon name="box" size={22} color={colors.textSoft}/></IconTile>} status={[{label:t.types[row.tipo]??row.tipo,tone:movementTone(row.tipo)},{label:row.cattle_delivery?t.feeding:t.generic,tone:'neutral'}]}>
   <MetricGrid columns={2} items={[{label:row.tipo==='ajuste'?t.difference:t.quantity,value:`${sign(row.tipo)} ${quantity(row,language)}`,unit:row.item_unidade,tone:movementTone(row.tipo)}]}/>
  </DetailHeader>
  <InfoList rows={[[t.author,row.responsavel_nome||i.unknown],[t.destination,row.destino||i.unknown],[t.lotDetail,row.lote?row.lote_numero||i.unknown:null],[i.notes,row.observacao||null],[t.timezone,row.timezone],[t.transaction,row.id]]}/>
  {!!row.farm_nome&&<Notice tone="neutral" text={row.farm_nome}/>}
  <SectionLabel title={mobileUiMessages[language].actions}/>
  <ActionGroup>
   <ActionRow label={t.item} icon={<HomeIcon name="box" size={20} color={colors.primary}/>} onPress={()=>router.push({pathname:'/inventory/[id]',params:{id:row.item,kind:'items'}})}/>
   {row.lote&&<ActionRow label={t.lot} icon={<HomeIcon name="box" size={20} color={colors.primary}/>} onPress={()=>router.push({pathname:'/inventory/lots/[id]',params:{id:row.lote!}})}/>}
  </ActionGroup>
  <Notice tone="neutral" text={t.readonly}/>
 </>}</>}</ScrollView></WorkspaceShell>;
}
export function StockLotScreen(){
 const params=useLocalSearchParams();const id=z.uuid().safeParse(params.id);const {state,controller,language}=useAuth();const t=movementMessages[language],i=inventoryMessages[language],w=workspaceMessages[language];const router=useRouter();const allowed=id.success&&state.status==='signedIn'&&canReadInventory(state.session.user);
 const q=useQuery({queryKey:['inventory-lot-detail',params.id],enabled:allowed,queryFn:async({signal})=>{if(!id.success)throw Error('id');const lot=await controller.inventoryLot(id.data,signal);const item=await controller.inventoryDetail('items',lot.item,signal);if(!('estoque_atual' in item))throw Error('item');return {lot,item};}});const {refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));const data=denied(q.error)?undefined:q.data;const back=()=>router.canGoBack()?router.back():router.replace('/inventory');
 const day=(v:string|null)=>v?new Intl.DateTimeFormat(language,{dateStyle:'medium'}).format(new Date(`${v}T12:00:00`)):null;
 const writable=state.status==='signedIn'&&canWriteInventory(state.session.user)&&!!data?.item.ativo&&!!data?.lot.ativo;
 return <WorkspaceShell active="inventory" title={t.lotDetail} onBack={back}><ScrollView contentContainerStyle={ms.list}>{!allowed?<EmptyState title={w.noAccess}/>:<>{q.isPending&&<SkeletonList rows={3}/>}{q.isError&&<ErrorState message={data?i.stale:w.error} language={language} onRetry={()=>void refetch()}/>}{data&&<>
  <DetailHeader meta={data.item.nome} title={data.lot.numero_lote||i.unknown} leading={<IconTile tone="brand"><HomeIcon name="box" size={22} color={colors.primary}/></IconTile>} status={[{label:data.lot.ativo?i.active:i.inactive,tone:data.lot.ativo?'success':'neutral'}]}>
   <MetricGrid columns={2} items={[{label:i.balance,value:new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(data.lot.quantidade_atual)),unit:data.item.unidade_medida},{label:i.expiry,value:day(data.lot.data_validade)??'—'}]}/>
  </DetailHeader>
  {writable&&<View style={{flexDirection:'row',gap:8}}><AgendaButton style={{flex:1}} label={launchMessages[language].entrada} onPress={()=>router.push({pathname:'/inventory/launch',params:{item:data.item.id,lote:data.lot.id,tipo:'entrada'}})}/><AgendaButton style={{flex:1}} label={launchMessages[language].saida} onPress={()=>router.push({pathname:'/inventory/launch',params:{item:data.item.id,lote:data.lot.id,tipo:'saida'}})}/></View>}
  <InfoList rows={[[i.received,day(data.lot.data_entrada)],[i.place,data.lot.local_display||null],[i.supplier,data.lot.fornecedor_nome||null],[i.notes,data.lot.observacao||null]]}/>
  <SectionLabel title={mobileUiMessages[language].actions}/>
  <ActionGroup>
   {writable&&<ActionRow label={t.count} icon={<HomeIcon name="chart" size={20} color={colors.primary}/>} onPress={()=>router.push({pathname:'/inventory/count',params:{id:data.lot.id}})}/>}
   <ActionRow label={t.history} icon={<HomeIcon name="trend" size={20} color={colors.primary}/>} onPress={()=>router.push({pathname:'/inventory/movements',params:{item:data.item.id,lote:data.lot.id}})}/>
   <ActionRow label={t.item} icon={<HomeIcon name="box" size={20} color={colors.primary}/>} onPress={()=>router.push({pathname:'/inventory/[id]',params:{id:data.item.id,kind:'items'}})}/>
  </ActionGroup>
 </>}</>}</ScrollView></WorkspaceShell>;
}
