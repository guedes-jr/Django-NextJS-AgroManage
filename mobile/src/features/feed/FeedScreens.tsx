import { FeedProductionActions } from './FeedProductionActions';
import {useCallback,useState} from 'react';
import {FlatList,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import { AgendaButton, StatusPill } from '../agenda/ui';
import {HomeIcon} from '../home/HomeIcon';
import {colors} from '../../theme/tokens';
import {ActionGroup,ActionRow,DetailHeader,EmptyState,ErrorState,HeaderAction,IconTile,InfoList,ListFooter,ListRow,MetricGrid,Notice,ScreenIntro,SearchBar,SectionLabel,Segmented,SkeletonList,mobileStyles as ms,mobileUiMessages} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import { AgendaShell } from '../workspace/AppShell';
import {canReadInventory,canWriteInventory} from '../inventory/contracts';
import {denied} from '../inventory/InventoryScreen';
import {formulaSchema,productionSchema,type Formula,type Production} from './contracts';
import {feedMessages} from './messages';
export function FeedScreen(){
 const {state,controller,language}=useAuth();const t=feedMessages[language],w=workspaceMessages[language],router=useRouter();const allowed=state.status==='signedIn'&&canReadInventory(state.session.user);const writable=state.status==='signedIn'&&canWriteInventory(state.session.user);
 const params=useLocalSearchParams();const [kind,setKind]=useState<'formulas'|'producoes'>(params.kind==='producoes'?'producoes':'formulas'),[search,setSearch]=useState('');
 const list=useInfinitePages<Formula|Production>({queryKey:['feed','infinite',kind,search],enabled:allowed,fetchPage:(page,signal)=>controller.feedPage(kind,page,kind==='formulas'?search:'',signal) as Promise<{results:(Formula|Production)[];next:string|null;count:number}>});
 const {refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const blocked=!allowed||denied(list.error);
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={t.scope} badge={!writable?<View style={{marginTop:6}}><StatusPill label={t.readonly} tone="neutral"/></View>:undefined} action={writable&&kind==='formulas'?<HeaderAction label={t.newFormula} onPress={()=>router.push('/feed/form')}/>:undefined}/>
  <Segmented value={kind} onChange={setKind} options={[{value:'formulas',label:t.formulas},{value:'producoes',label:t.productions}]}/>
  {kind==='formulas'&&<SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>}
 </View>;
 return <WorkspaceShell title={t.title} active="inventory">{blocked?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<Formula|Production> data={list.rows} keyExtractor={row=>row.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=>'ativa' in item?<ListRow meta={`${t.ingredients}: ${item.ingredientes.length}`} title={item.nome} subtitle={`${t.final}: ${item.item_final_nome||'—'}`} status={{label:item.ativa?t.active:t.inactive,tone:item.ativa?'success':'neutral'}} leading={<IconTile tone="warning"><HomeIcon name="leaf" size={20} color={colors.warning}/></IconTile>} onPress={()=>router.push({pathname:'/feed/detail',params:{id:item.id,kind}})}/>
   :<ListRow meta={new Intl.DateTimeFormat(language,{dateStyle:'medium',timeStyle:'short',timeZone:item.timezone}).format(new Date(item.data_producao))} title={item.formula_nome} value={String(item.quantidade_real)} valueCaption={t.actual} leading={<IconTile tone="brand"><HomeIcon name="box" size={20} color={colors.primary}/></IconTile>} onPress={()=>router.push({pathname:'/feed/detail',params:{id:item.id,kind}})}/>}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}
export function FeedDetailScreen(){
 const params=useLocalSearchParams();const route=z.object({id:z.uuid(),kind:z.enum(['formulas','producoes'])}).safeParse(params);const {state,controller,language}=useAuth();const t=feedMessages[language],w=workspaceMessages[language],router=useRouter();const allowed=route.success&&state.status==='signedIn'&&canReadInventory(state.session.user);const writable=state.status==='signedIn'&&canWriteInventory(state.session.user);
 const q=useQuery({queryKey:['feed-detail',params.kind,params.id],enabled:allowed,queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.feedDetail(route.data.kind,route.data.id,signal);}});
 const {refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const blocked=!allowed||denied(q.error);const formula=route.success&&route.data.kind==='formulas'?formulaSchema.safeParse(q.data):null;const production=route.success&&route.data.kind==='producoes'?productionSchema.safeParse(q.data):null;
 return <AgendaShell title={t.title} backLabel={w.back} onBack={()=>router.canGoBack()?router.back():router.replace('/feed')}><ScrollView contentContainerStyle={ms.list}>{blocked?<EmptyState title={w.noAccess}/>:q.isPending?<SkeletonList rows={3}/>:q.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:formula?.success?<>
  <DetailHeader meta={`${t.species}: ${formula.data.especie_animal||t.all}`} title={formula.data.nome} leading={<IconTile tone="warning"><HomeIcon name="leaf" size={22} color={colors.warning}/></IconTile>} status={[{label:formula.data.ativa?t.active:t.inactive,tone:formula.data.ativa?'success':'neutral'}]}>
   {!!formula.data.descricao&&<Text style={{fontSize:15,lineHeight:22,color:colors.textSoft}}>{formula.data.descricao}</Text>}
   <InfoList rows={[[t.final,formula.data.item_final_nome||'—']]}/>
  </DetailHeader>
  {writable&&formula.data.ativa&&<AgendaButton variant="primary" label={t.produce} disabled={!formula.data.item_final||!formula.data.ingredientes.length} onPress={()=>router.push({pathname:'/feed/produce',params:{formula:formula.data.id}})}/>}
  <SectionLabel title={t.ingredients}/>
  {formula.data.ingredientes.map(row=><ListRow key={row.item} title={row.item_nome} subtitle={row.unidade} value={`${row.percentual}%`} status={{label:row.ativo?t.active:t.inactive,tone:row.ativo?'success':'neutral'}} onPress={()=>router.push({pathname:'/inventory/[id]',params:{id:row.item,kind:'items'}})}/>)}
  {writable&&formula.data.ativa&&<><SectionLabel title={mobileUiMessages[language].actions}/><ActionGroup><ActionRow label={t.edit} icon={<HomeIcon name="leaf" size={20} color={colors.primary}/>} onPress={()=>router.push({pathname:'/feed/form',params:{id:formula.data.id}})}/></ActionGroup></>}
 </>:production?.success?<>
  <DetailHeader meta={new Intl.DateTimeFormat(language,{dateStyle:'medium',timeStyle:'short',timeZone:production.data.timezone}).format(new Date(production.data.data_producao))} title={production.data.formula_nome} leading={<IconTile tone="brand"><HomeIcon name="box" size={22} color={colors.primary}/></IconTile>}>
   <MetricGrid columns={2} items={[{label:t.planned,value:String(production.data.quantidade_teorica)},{label:t.actual,value:String(production.data.quantidade_real)}]}/>
  </DetailHeader>
  <InfoList rows={[[t.author,production.data.responsavel_nome||'—'],['ID',production.data.id]]}/>
  <Notice tone="neutral" text={t.legacy}/>
  {writable&&<FeedProductionActions key={production.data.id} production={production.data}/>}
  <ActionGroup><ActionRow label={t.formulas} icon={<HomeIcon name="leaf" size={20} color={colors.primary}/>} onPress={()=>router.push({pathname:'/feed/detail',params:{id:production.data.formula,kind:'formulas'}})}/></ActionGroup>
 </>:<ErrorState message={w.error} language={language}/>}</ScrollView></AgendaShell>;
}
