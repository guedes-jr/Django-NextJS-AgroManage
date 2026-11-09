import {launchMessages} from './launchMessages';
import {movementMessages} from './movementMessages';
import {inventoryFormMessages} from './formMessages';
import {useCallback,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {AgendaShell,AgendaButton,Busy,styles as s} from '../agenda/ui';
import {canReadInventory,canWriteInventory,type InventoryItem,type InventorySupplier} from './contracts';
import {inventoryMessages} from './messages';
import {denied,openInventoryWeb} from './InventoryScreen';
const routeSchema=z.object({id:z.uuid(),kind:z.enum(['items','suppliers'])});
export function InventoryDetailScreen(){
 const params=useLocalSearchParams();const route=routeSchema.safeParse(params);const {state,controller,language}=useAuth();const router=useRouter();const t=inventoryMessages[language],w=workspaceMessages[language];const [linkFailed,setLinkFailed]=useState(false);
 const allowed=route.success&&state.status==='signedIn'&&canReadInventory(state.session.user);
 const query=useQuery({queryKey:['inventory-detail',params.kind,params.id],enabled:allowed,queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.inventoryDetail(route.data.kind,route.data.id,signal);}});
 const {refetch}=query;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const item=denied(query.error)?undefined:query.data;
 const back=()=>router.canGoBack()?router.back():router.replace('/inventory');
 return <AgendaShell title={t.detail} backLabel={w.back} onBack={back}><ScrollView contentContainerStyle={s.content}>
 {!allowed?<Text style={s.error}>{w.noAccess}</Text>:<>{query.isPending&&<Busy label={w.loading}/ >}{query.isError&&<><Text accessibilityRole="alert" style={s.error}>{item?t.stale:w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refetch()}/></>}{item&&<><Text accessibilityRole="header" style={s.heading}>{item.nome}</Text><Text style={s.badge}>{item.ativo?t.active:t.inactive}</Text>{item.ativo&&route.success&&state.status==='signedIn'&&canWriteInventory(state.session.user)&&<AgendaButton label={inventoryFormMessages[language][route.data.kind==='items'?'editProduct':'editSupplier']} onPress={()=>router.push({pathname:'/inventory/form',params:{kind:route.data.kind,id:item.id}})}/>}{'estoque_atual' in item?<><ProductDetails item={item}/>{state.status==='signedIn'&&canWriteInventory(state.session.user)&&item.ativo&&<View style={s.row}><AgendaButton label={launchMessages[language].entrada} onPress={()=>router.push({pathname:'/inventory/launch',params:{item:item.id,tipo:'entrada'}})}/>{state.session.user.access.can_view_financial&&<AgendaButton label={launchMessages[language].compra} onPress={()=>router.push({pathname:'/inventory/launch',params:{item:item.id,tipo:'compra'}})}/>}</View>}<AgendaButton label={movementMessages[language].history} onPress={()=>router.push({pathname:'/inventory/movements',params:{item:item.id}})}/></>:<SupplierDetails item={item}/>}<Text style={s.muted}>{t.read}</Text><AgendaButton label={t.web} onPress={()=>{if(route.success){setLinkFailed(false);void openInventoryWeb(route.data.kind).catch(()=>setLinkFailed(true));}}}/>{linkFailed&&<Text style={s.error}>{w.failedLink}</Text>}</>}</>}
 </ScrollView></AgendaShell>;
}
function ProductDetails({item}:{item:InventoryItem}){
 const {language}=useAuth();const t=inventoryMessages[language];const num=(v:string)=>new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(v));
 return <><View style={s.card}><Text style={s.title}>{t.balance}: {num(item.estoque_atual)} {item.unidade_medida}</Text><Text style={s.body}>{t.minimum}: {num(item.estoque_minimo)} {item.unidade_medida}</Text>{item.estoque_baixo&&<Text style={s.badge}>{t.low}</Text>}<Text style={s.body}>{t.unit}: {item.unidade_medida}</Text><Text style={s.body}>{t.category}: {(item.categorias.length?item.categorias:[item.categoria]).map(c=>t.categories[c]??c).join(' · ')}</Text><Text style={s.body}>{t.manufacturer}: {item.fabricante||t.unknown}</Text><Text style={s.label}>{t.description}</Text><Text style={s.body}>{item.descricao||t.unknown}</Text></View><ProductLots item={item}/></>;
}
function ProductLots({item}:{item:InventoryItem}){
 const {controller,language}=useAuth();const router=useRouter();const t=inventoryMessages[language],w=workspaceMessages[language];const [opened,setOpened]=useState(false),[page,setPage]=useState(1);
 const query=useQuery({queryKey:['inventory-lots',item.id,page],enabled:opened,queryFn:({signal})=>controller.inventoryPage({kind:'lots',item:item.id,page,search:'',category:'',status:'all'},signal)});
 const data=denied(query.error)?undefined:query.data;const num=(v:string)=>new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(v));
 const day=(v:string|null)=>v?new Intl.DateTimeFormat(language,{dateStyle:'medium'}).format(new Date(`${v}T12:00:00`)):t.unknown;
 return <View style={s.card}><Text style={s.muted}>{t.lotHint}</Text>{!opened?<AgendaButton label={t.lots} onPress={()=>setOpened(true)}/>:<>{query.isPending&&<Busy label={w.loading}/ >}{query.isError&&<><Text style={s.error}>{data?t.stale:w.error}</Text><AgendaButton label={w.retry} onPress={()=>void query.refetch()}/></>}{data?.results.map(lot=>'numero_lote' in lot&&<View key={lot.id} style={[s.card,{padding:12}]}><Text style={s.title}>{lot.numero_lote||t.unknown}</Text><Text style={s.badge}>{lot.ativo?t.active:t.inactive}</Text><Text style={s.body}>{t.balance}: {num(lot.quantidade_atual)} {item.unidade_medida}</Text><Text style={s.muted}>{t.initial}: {num(lot.quantidade_inicial)} {item.unidade_medida}</Text><Text style={s.body}>{t.received}: {day(lot.data_entrada)}</Text><Text style={s.body}>{t.expiry}: {day(lot.data_validade)}</Text><Text style={s.body}>{t.manufactured}: {day(lot.data_fabricacao)}</Text><Text style={s.body}>{t.place}: {lot.local_display||t.unknown}</Text><Text style={s.body}>{t.supplier}: {lot.fornecedor_nome||t.unknown}</Text>{!!lot.observacao&&<Text style={s.body}>{t.notes}: {lot.observacao}</Text>}<AgendaButton label={movementMessages[language].lot} onPress={()=>router.push({pathname:'/inventory/lots/[id]',params:{id:lot.id}})}/></View>)}{data&&!data.results.length&&<Text>{t.empty}</Text>}<View style={s.row}><AgendaButton label={w.previous} disabled={!data?.previous||query.isFetching} onPress={()=>setPage(p=>Math.max(1,p-1))}/><Text>{`${w.page} ${page}`}</Text><AgendaButton label={w.next} disabled={!data?.next||query.isFetching} onPress={()=>setPage(p=>p+1)}/></View></>}</View>;
}
function SupplierDetails({item}:{item:InventorySupplier}){
 const {language}=useAuth();const t=inventoryMessages[language];
 return <><View style={s.card}><Text selectable style={s.body}>{t.document}: {item.cnpj||t.unknown}</Text><Text style={s.body}>{t.contract}: {t.labels[item.tipo_contrato]??item.tipo_contrato}</Text></View><View style={s.card}><Text style={s.title}>{t.contacts}</Text>{item.contatos.map(c=><View key={c.id}><Text style={s.label}>{c.label||c.tipo}</Text><Text selectable style={s.body}>{c.valor}</Text></View>)}{!item.contatos.length&&<Text>{t.unknown}</Text>}</View><View style={s.card}><Text style={s.title}>{t.addresses}</Text>{item.enderecos.map(a=><Text key={a.id} selectable style={s.body}>{[a.logradouro,a.numero,a.complemento,a.bairro,a.cidade,a.estado,a.cep].filter(Boolean).join(' · ')||t.unknown}</Text>)}{!item.enderecos.length&&<Text>{t.unknown}</Text>}</View></>;
}
