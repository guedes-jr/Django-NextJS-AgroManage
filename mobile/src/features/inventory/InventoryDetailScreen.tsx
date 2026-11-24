import {launchMessages} from './launchMessages';
import {movementMessages} from './movementMessages';
import {inventoryFormMessages} from './formMessages';
import {useCallback,useState} from 'react';
import {RefreshControl,ScrollView,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {AgendaButton} from '../agenda/ui';
import {HomeIcon} from '../home/HomeIcon';
import {colors} from '../../theme/tokens';
import {ActionGroup,ActionRow,DetailHeader,EmptyState,ErrorState,IconTile,InfoList,ListRow,MetricGrid,Notice,SectionLabel,SkeletonList,WebFallback,mobileStyles as ms,mobileUiMessages} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {canReadInventory,canWriteInventory,type InventoryItem,type InventoryLot,type InventorySupplier} from './contracts';
import {inventoryMessages} from './messages';
import {denied,openInventoryWeb} from './InventoryScreen';
const routeSchema=z.object({id:z.uuid(),kind:z.enum(['items','suppliers'])});
export function InventoryDetailScreen(){
 const params=useLocalSearchParams();const route=routeSchema.safeParse(params);const {state,controller,language}=useAuth();const router=useRouter();const t=inventoryMessages[language],w=workspaceMessages[language];const [linkFailed,setLinkFailed]=useState(false);const [refreshing,setRefreshing]=useState(false);
 const allowed=route.success&&state.status==='signedIn'&&canReadInventory(state.session.user);
 const query=useQuery({queryKey:['inventory-detail',params.kind,params.id],enabled:allowed,queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.inventoryDetail(route.data.kind,route.data.id,signal);}});
 const {refetch}=query;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const item=denied(query.error)?undefined:query.data;
 const back=()=>router.canGoBack()?router.back():router.replace('/inventory');
 const writable=state.status==='signedIn'&&canWriteInventory(state.session.user);
 return <WorkspaceShell active="inventory" title={t.detail} onBack={back}><ScrollView contentContainerStyle={ms.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await refetch();}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>}>
 {!allowed?<EmptyState title={w.noAccess}/>:<>{query.isPending&&<SkeletonList rows={3}/>}{query.isError&&<ErrorState message={item?t.stale:w.error} language={language} onRetry={()=>void refetch()}/>}{item&&route.success&&<>
  {'estoque_atual' in item?<ProductDetails item={item}/>:<SupplierDetails item={item}/>}
  {'estoque_atual' in item&&writable&&item.ativo&&<View style={{flexDirection:'row',gap:8}}><AgendaButton style={{flex:1}} variant="primary" label={launchMessages[language].entrada} onPress={()=>router.push({pathname:'/inventory/launch',params:{item:item.id,tipo:'entrada'}})}/>{state.status==='signedIn'&&state.session.user.access.can_view_financial&&<AgendaButton style={{flex:1,marginTop:8}} label={launchMessages[language].compra} onPress={()=>router.push({pathname:'/inventory/launch',params:{item:item.id,tipo:'compra'}})}/>}</View>}
  <SectionLabel title={mobileUiMessages[language].actions}/>
  <ActionGroup>
   {'estoque_atual' in item&&<ActionRow label={movementMessages[language].history} icon={<HomeIcon name="trend" size={20} color={colors.primary}/>} onPress={()=>router.push({pathname:'/inventory/movements',params:{item:item.id}})}/>}
   {item.ativo&&writable&&<ActionRow label={inventoryFormMessages[language][route.data.kind==='items'?'editProduct':'editSupplier']} icon={<HomeIcon name="box" size={20} color={colors.primary}/>} onPress={()=>router.push({pathname:'/inventory/form',params:{kind:route.data.kind,id:item.id}})}/>}
  </ActionGroup>
  {'estoque_atual' in item&&<ProductLots item={item}/>}
  <WebFallback hint={t.read} label={t.web} failed={linkFailed?w.failedLink:undefined} onPress={()=>{setLinkFailed(false);void openInventoryWeb(route.data.kind).catch(()=>setLinkFailed(true));}}/>
 </>}</>}
 </ScrollView></WorkspaceShell>;
}
function ProductDetails({item}:{item:InventoryItem}){
 const {language}=useAuth();const t=inventoryMessages[language];const num=(v:string)=>new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(v));
 return <><DetailHeader meta={(item.categorias.length?item.categorias:[item.categoria]).map(c=>t.categories[c]??c).join(' · ')} title={item.nome} leading={<IconTile tone={item.estoque_baixo?'warning':'brand'}><HomeIcon name="box" size={22} color={item.estoque_baixo?colors.warning:colors.primary}/></IconTile>} status={[{label:item.ativo?t.active:t.inactive,tone:item.ativo?'success':'neutral'},...(item.estoque_baixo?[{label:t.low,tone:'warning' as const}]:[])]}>
  <MetricGrid columns={2} items={[{label:t.balance,value:num(item.estoque_atual),unit:item.unidade_medida,tone:item.estoque_baixo?'warning':undefined},{label:t.minimum,value:num(item.estoque_minimo),unit:item.unidade_medida}]}/>
 </DetailHeader>
 <InfoList rows={[[t.manufacturer,item.fabricante||null],[t.unit,item.unidade_medida],[t.description,item.descricao||null]]}/></>;
}
function ProductLots({item}:{item:InventoryItem}){
 const {controller,language}=useAuth();const router=useRouter();const t=inventoryMessages[language],w=workspaceMessages[language];const [opened,setOpened]=useState(false);
 const list=useInfinitePages<InventoryLot>({queryKey:['inventory-lots',item.id,'infinite'],enabled:opened,fetchPage:(page,signal)=>controller.inventoryPage({kind:'lots',item:item.id,page,search:'',category:'',status:'all'},signal) as Promise<{results:InventoryLot[];next:string|null;count:number}>});
 const num=(v:string)=>new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(v));
 const day=(v:string|null)=>v?new Intl.DateTimeFormat(language,{dateStyle:'medium'}).format(new Date(`${v}T12:00:00`)):t.unknown;
 const rows=list.rows.filter(lot=>'numero_lote' in lot);
 return <View style={{gap:8}}><SectionLabel title={t.lots}/><Notice tone="neutral" text={t.lotHint}/>{!opened?<ActionGroup><ActionRow label={t.lots} icon={<HomeIcon name="box" size={20} color={colors.primary}/>} onPress={()=>setOpened(true)}/></ActionGroup>:<>{list.isPending&&<SkeletonList rows={2}/>}{list.isError&&<ErrorState message={rows.length?t.stale:w.error} language={language} onRetry={()=>void list.refetch()}/>}
  {rows.map(lot=><ListRow key={lot.id} meta={`${t.expiry}: ${day(lot.data_validade)}`} title={lot.numero_lote||t.unknown} subtitle={[lot.local_display,lot.fornecedor_nome].filter(Boolean).join(' · ')||undefined} value={num(lot.quantidade_atual)} valueCaption={`${t.initial}: ${num(lot.quantidade_inicial)} ${item.unidade_medida}`} status={{label:lot.ativo?t.active:t.inactive,tone:lot.ativo?'success':'neutral'}} onPress={()=>router.push({pathname:'/inventory/lots/[id]',params:{id:lot.id}})}/>)}
  {!list.isPending&&!list.isError&&!rows.length&&<EmptyState title={t.empty}/>}
  {list.hasNextPage&&<AgendaButton label={mobileUiMessages[language].more} busy={list.isFetchingNextPage} disabled={list.isFetchingNextPage} onPress={list.loadMore}/>}
 </>}</View>;
}
function SupplierDetails({item}:{item:InventorySupplier}){
 const {language}=useAuth();const t=inventoryMessages[language];
 return <><DetailHeader meta={item.cnpj||t.unknown} title={item.nome} leading={<IconTile tone="brand"><HomeIcon name="group" size={22} color={colors.primary}/></IconTile>} status={[{label:item.ativo?t.active:t.inactive,tone:item.ativo?'success':'neutral'},{label:t.labels[item.tipo_contrato]??item.tipo_contrato,tone:'neutral'}]}/>
  <SectionLabel title={t.contacts}/>{item.contatos.length?<InfoList rows={item.contatos.map(c=>[c.label||c.tipo,c.valor] as [string,string])}/>:<Notice tone="neutral" text={t.unknown}/>}
  <SectionLabel title={t.addresses}/>{item.enderecos.length?<InfoList rows={item.enderecos.map((a,idx)=>[a.label||`${idx+1}`,[a.logradouro,a.numero,a.complemento,a.bairro,a.cidade,a.estado,a.cep].filter(Boolean).join(' · ')||t.unknown] as [string,string])}/>:<Notice tone="neutral" text={t.unknown}/>}
 </>;
}
