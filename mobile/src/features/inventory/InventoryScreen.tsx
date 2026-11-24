import {feedMessages} from '../feed/messages';
import {movementMessages} from './movementMessages';
import {inventoryFormMessages} from './formMessages';
import {useCallback,useState} from 'react';
import {FlatList,Linking,RefreshControl,Text,View} from 'react-native';
import {useFocusEffect,useRouter,useLocalSearchParams} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {isAxiosError} from 'axios';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {HomeIcon} from '../home/HomeIcon';
import {StatusPill,type StatusTone} from '../agenda/ui';
import {parseApiUrl} from '../../config/environment';
import {colors} from '../../theme/tokens';
import {BottomSheet,EmptyState,ErrorState,FilterChips,HeaderAction,IconTile,KpiStrip,ListFooter,ListRow,ScreenIntro,SearchBar,Segmented,SelectChip,SheetOption,Shortcut,SkeletonList,WebFallback,mobileStyles as ms} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {canReadInventory,canWriteInventory,inventoryKinds,type InventoryQuery,type InventoryItem,type InventoryAlert,type InventorySupplier} from './contracts';
import {inventoryMessages} from './messages';
export const denied=(error:unknown)=>isAxiosError(error)&&[401,403,404].includes(error.response?.status??0);
export async function openInventoryWeb(kind:'items'|'suppliers'|'alerts'){
 const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site)throw Error('site');await Linking.openURL(new URL(`/home/estoque/${kind==='items'?'produtos':kind==='suppliers'?'fornecedores':'alertas'}`,site).href);
}
type Row=InventoryItem|InventoryAlert|InventorySupplier;
const priorityTone=(value:string):StatusTone=>value==='critica'?'danger':value==='alta'?'warning':value==='media'?'info':'neutral';
export function InventoryScreen(){
 const {state,controller,language}=useAuth();const router=useRouter();const t=inventoryMessages[language],w=workspaceMessages[language];
 const allowed=state.status==='signedIn'&&canReadInventory(state.session.user);
 const writable=state.status==='signedIn'&&canWriteInventory(state.session.user);
 const readOnly=state.status==='signedIn'&&state.session.user.access.read_only;
 const params=useLocalSearchParams();
 const [kind,setKind]=useState<typeof inventoryKinds[number]>(inventoryKinds.find(value=>value===params.kind)??'items');
 const [search,setSearch]=useState(''),[status,setStatus]=useState<InventoryQuery['status']>('all'),[category,setCategory]=useState(''),[sheet,setSheet]=useState(false),[linkFailed,setLinkFailed]=useState(false);
 const summary=useQuery({queryKey:['inventory-summary'],enabled:allowed,queryFn:({signal})=>controller.inventorySummary(signal)});
 const choices=useQuery({queryKey:['inventory-choices'],enabled:allowed&&kind==='items',queryFn:({signal})=>controller.inventoryChoices(signal)});
 const list=useInfinitePages<Row>({queryKey:['inventory','infinite',kind,search,status,category],enabled:allowed,fetchPage:(page,signal)=>controller.inventoryPage({kind,search,status,category,page},signal) as Promise<{results:Row[];next:string|null;count:number}>});
 const {refetch:refreshSummary}=summary,{refetch:refreshList}=list;
 useFocusEffect(useCallback(()=>{if(allowed){void refreshSummary();void refreshList();}},[allowed,refreshSummary,refreshList]));
 const blocked=!allowed||denied(list.error)||denied(summary.error);
 const stats=summary.isError||blocked?undefined:summary.data;
 const num=(v:string|number)=>new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(v));
 const changeKind=(next:typeof kind)=>{setKind(next);setSearch('');setStatus('all');setCategory('');};
 const categoryLabel=category?t.categories[category]??choices.data?.categorias.find(c=>c.value===category)?.label??category:undefined;
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={t.scope} badge={readOnly?<View style={{marginTop:6}}><StatusPill label={t.readonly} tone="neutral"/></View>:undefined} action={writable&&kind!=='alerts'?<HeaderAction label={inventoryFormMessages[language][kind==='items'?'createProduct':'createSupplier']} onPress={()=>router.push({pathname:'/inventory/form',params:{kind}})}/>:undefined}/>
  {summary.isPending?<SkeletonList rows={1}/>:stats?<KpiStrip items={[
   {key:'total',label:t.total,value:num(stats.total_items),selected:kind==='items'&&status==='all',onPress:()=>{changeKind('items');}},
   {key:'low',label:t.low,value:num(stats.estoque_baixo),tone:stats.estoque_baixo>0?'warning':'neutral',selected:kind==='items'&&status==='baixo',hint:t.lowHint,onPress:()=>{setKind('items');setSearch('');setCategory('');setStatus(status==='baixo'?'all':'baixo');}},
  ]}/>:summary.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refreshSummary()}/>:null}
  <View style={ms.wrap}>
   <Shortcut label={movementMessages[language].title} icon={<HomeIcon name="trend" size={18} color={colors.primary}/>} onPress={()=>router.push('/inventory/movements')}/>
   <Shortcut label={feedMessages[language].title} icon={<HomeIcon name="leaf" size={18} color={colors.primary}/>} onPress={()=>router.push('/feed')}/>
  </View>
  <Segmented value={kind} onChange={changeKind} options={inventoryKinds.map(v=>({value:v,label:t[v]}))}/>
  {kind==='alerts'?<Text style={{fontSize:13,lineHeight:19,color:colors.muted}}>{t.registeredAlerts}</Text>:<SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>}
  {kind==='items'&&<FilterChips label={t.category} value={status} onChange={setStatus} options={[{value:'all',label:t.all},{value:'baixo',label:t.low},{value:'normal',label:t.normal}]} trailing={<SelectChip label={t.category} value={categoryLabel} active={!!category} onPress={()=>setSheet(true)}/>}/>}
  {list.isError&&!!list.rows.length&&<ErrorState message={t.stale} language={language} onRetry={()=>void refreshList()}/>}
  {list.count!==undefined&&<Text style={{fontSize:12,color:colors.muted}}>{`${num(list.count)} · ${t.updated} ${new Intl.DateTimeFormat(language,{hour:'2-digit',minute:'2-digit'}).format(list.dataUpdatedAt)}`}</Text>}
 </View>;
 const render=({item}:{item:Row})=>{
  if('titulo' in item)return <ListRow meta={new Intl.DateTimeFormat(language,{day:'2-digit',month:'short'}).format(new Date(item.created_at))} title={item.titulo} subtitle={item.descricao} status={{label:t.labels[item.prioridade]??item.prioridade,tone:priorityTone(item.prioridade)}} leading={<IconTile tone={priorityTone(item.prioridade)}><HomeIcon name="bell" size={20} color={colors.textSoft}/></IconTile>} onPress={item.item?()=>router.push({pathname:'/inventory/[id]',params:{id:item.item!,kind:'items'}}):undefined}/>;
  if('estoque_atual' in item)return <ListRow meta={(item.categorias.length?item.categorias:[item.categoria]).map(c=>t.categories[c]??c).join(' · ')} title={item.nome} subtitle={`${t.minimum}: ${num(item.estoque_minimo)} ${item.unidade_medida}`} value={num(item.estoque_atual)} valueCaption={item.unidade_medida} status={item.estoque_baixo?{label:t.low,tone:'warning'}:undefined} leading={<IconTile tone={item.estoque_baixo?'warning':'brand'}><HomeIcon name="box" size={20} color={item.estoque_baixo?colors.warning:colors.primary}/></IconTile>} onPress={()=>router.push({pathname:'/inventory/[id]',params:{id:item.id,kind:'items'}})}/>;
  return <ListRow meta={item.cnpj||t.unknown} title={item.nome} subtitle={t.labels[item.tipo_contrato]??undefined} status={{label:item.ativo?t.active:t.inactive,tone:item.ativo?'success':'neutral'}} leading={<IconTile tone="brand"><HomeIcon name="group" size={20} color={colors.primary}/></IconTile>} onPress={()=>router.push({pathname:'/inventory/[id]',params:{id:item.id,kind:'suppliers'}})}/>;
 };
 return <WorkspaceShell active="inventory" title={t.title}>{blocked?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<>
  <FlatList<Row> data={list.rows} keyExtractor={r=>r.id} renderItem={render} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
   refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>{void list.refresh();void refreshSummary();}} tintColor={colors.primary} colors={[colors.primary]}/>}
   onEndReached={list.loadMore} onEndReachedThreshold={0.4}
   ListHeaderComponent={header}
   ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refreshList()}/>:<EmptyState title={t.empty} description={search||category||status!=='all'?undefined:t.read}/>}
   ListFooterComponent={<>{!!list.rows.length&&<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>}<WebFallback hint={t.read} label={t.web} failed={linkFailed?w.failedLink:undefined} onPress={()=>{setLinkFailed(false);void openInventoryWeb(kind).catch(()=>setLinkFailed(true));}}/></>}/>
  <BottomSheet visible={sheet} title={t.category} onClose={()=>setSheet(false)} language={language}>
   {choices.isError?<ErrorState message={w.error} language={language} onRetry={()=>void choices.refetch()}/>:choices.isPending?<SkeletonList rows={3}/>:<>
    <SheetOption label={t.all} selected={!category} onPress={()=>{setCategory('');setSheet(false);}}/>
    {choices.data.categorias.map(c=><SheetOption key={c.value} label={t.categories[c.value]??c.label} selected={category===c.value} onPress={()=>{setCategory(c.value);setSheet(false);}}/>)}
   </>}
  </BottomSheet>
 </>}</WorkspaceShell>;
}
