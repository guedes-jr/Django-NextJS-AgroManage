import {useCallback,useState} from 'react';
import {colors} from '../../theme/tokens';
import {FlatList,RefreshControl,Text,View} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {useAuth} from '../auth/AuthProvider';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {workspaceMessages} from '../workspace/messages';
import {canCreateCattle,type CattleAnimal,type CattleBatch,type CattleKind,type CattleQuery} from './contracts';
import {cattleMessages} from './messages';
import {dairyMessages} from './dairyMessages';
import {CattleRow} from './CattleScreens';
import {EmptyState,ErrorState,FilterChips,HeaderAction,ListFooter,SearchBar,Segmented,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
type Row=CattleAnimal|CattleBatch;
export function DairyHerd(){
 const {state,controller,language}=useAuth(),{farm}=useWorkspace(),router=useRouter(),t=dairyMessages[language],c=cattleMessages[language],w=workspaceMessages[language];
 const [kind,setKind]=useState<CattleKind>('animals'),[search,setSearch]=useState(''),[status,setStatus]=useState<CattleQuery['status']>('active');
 const list=useInfinitePages<Row>({queryKey:['cattle','dairy','infinite',kind,farm?.id??null,search,status],enabled:true,fetchPage:(page,signal)=>controller.cattleList({production:'dairy',kind,farm:farm?.id,search,status,page},signal)}),{refetch}=list;
 useFocusEffect(useCallback(()=>{void refetch();},[refetch]));
 const writable=state.status==='signedIn'&&canCreateCattle(state.session.user);
 const number=(value:number)=>new Intl.NumberFormat(language).format(value);
 const header=<View style={ms.header}>
  <View style={{flexDirection:'row',alignItems:'center',gap:12}}><View style={{flex:1,minWidth:0}}><Text accessibilityRole="header" style={{fontSize:19,fontWeight:'800',color:colors.forest}}>{t.herd}</Text><Text style={{fontSize:13,color:colors.muted}}>{list.count!==undefined?`${number(list.count)} ${c[kind].toLowerCase()} · ${c[status]}`:c[status]}</Text></View>
   {writable&&<HeaderAction label={kind==='animals'?t.newAnimal:t.newBatch} onPress={()=>router.push(kind==='animals'?{pathname:'/cattle/[production]/form',params:{production:'dairy',mode:'create'}}:{pathname:'/cattle/[production]/batch-form',params:{production:'dairy'}})}/>}</View>
  <Segmented value={kind} onChange={value=>{setKind(value);setStatus('active');}} options={(['animals','batches'] as const).map(value=>({value,label:c[value]}))}/>
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
  <FilterChips label={c.status} value={status} onChange={setStatus} options={(['active','all','sold',kind==='animals'?'dead':'finished'] as CattleQuery['status'][]).map(value=>({value,label:c[value]}))}/>
  {list.isError&&!!list.rows.length&&<ErrorState message={c.cachedError} language={language} onRetry={()=>void refetch()}/>}
 </View>;
 return <FlatList<Row> data={list.rows} keyExtractor={row=>row.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><CattleRow item={item} onPress={()=>router.push({pathname:'/cattle/[production]/[id]',params:{production:'dairy',id:item.id,kind,...(farm?{farm:farm.id}:{})}})}/>}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={c.empty}/>}
  ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>;
}
