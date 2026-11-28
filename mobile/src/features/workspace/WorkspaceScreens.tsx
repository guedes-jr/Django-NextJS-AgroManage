import {OrganizationContacts, PersonalContacts} from './ProfileContacts';
import { WorkspaceShell } from './WorkspaceShell';
import { useCallback, useState } from 'react';
import { FlatList, Linking, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { parseApiUrl } from '../../config/environment';
import { StatusPill } from '../agenda/ui';
import { HomeIcon } from '../home/HomeIcon';
import { colors } from '../../theme/tokens';
import { canReadNotifications } from '../notifications/contracts';
import { notificationMessages } from '../notifications/messages';
import { canReadTeam } from '../team/contracts';
import { teamMessages } from '../team/messages';
import { ActionGroup, ActionRow, EmptyState, ErrorState, FilterChips, IconTile, InfoList, ListFooter, ListRow, Notice, ScreenIntro, SearchBar, SectionLabel, SkeletonList, mobileStyles as ms, mobileUiMessages } from '../../components/mobile';
import { useInfinitePages } from '../../components/mobile/useInfinitePages';
import { AgendaShell } from './AppShell';
import { workspaceMessages } from './messages';
import { BiometricSetting } from '../security/BiometricLock';
import { securityMessages } from '../security/messages';
import { useDraftCount, useSignOutWithDrafts } from '../drafts/hooks';
import { draftMessages } from '../drafts/messages';
import { useRead } from './useRead';
import { canSearch, searchKinds, type SearchKind } from './contracts';
import { useWorkspace } from './WorkspaceProvider';
function useBack(){const router=useRouter();return ()=>router.canGoBack()?router.back():router.replace('/');}
async function openWeb(path:string){const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site||!path.startsWith('/')||path.startsWith('//'))throw new Error('invalid website');await Linking.openURL(new URL(path,site).href);}
export function ProfileScreen(){
  const {state,controller,language}=useAuth();const t=workspaceMessages[language];const router=useRouter();const [retry,setRetry]=useState(0);const [linkFailed,setLinkFailed]=useState(false);
  const load=useCallback((signal:AbortSignal)=>controller.profile(signal),[controller]);const result=useRead(String(retry),load);
  const name=result.data?.full_name||(state.status==='signedIn'?state.session.user.full_name||state.session.user.email:'');
  const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?';
  const web=(path:string)=>{setLinkFailed(false);void openWeb(path).catch(()=>setLinkFailed(true));};
  const draftCount=useDraftCount();const signOut=useSignOutWithDrafts();
  return <WorkspaceShell active="profile" title={t.profile}><ScrollView contentContainerStyle={ms.list}>
    <View style={{alignItems:'center',gap:6,paddingVertical:8}}><View style={{width:72,height:72,borderRadius:36,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary}}><Text style={{fontSize:26,fontWeight:'800',color:colors.surface}}>{initials}</Text></View><Text accessibilityRole="header" style={{fontSize:20,fontWeight:'800',color:colors.forest,textAlign:'center'}}>{name}</Text>{state.status==='signedIn'&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:6,justifyContent:'center'}}><StatusPill label={t[state.session.user.access.role]} tone="info"/>{state.session.user.access.read_only&&<StatusPill label={t.readOnly} tone="neutral"/>}</View>}</View>
    {result.loading?<SkeletonList rows={2}/>:result.failed?<ErrorState message={t.error} language={language} onRetry={()=>setRetry(v=>v+1)}/>:result.data&&<InfoList rows={[[t.email,result.data.email],[t.phone,result.data.phone||'—']]}/>}
    {state.status==='signedIn'&&<InfoList rows={[[t.organization,state.session.organization.name],[t.language,language]]}/>}
    {state.status==='signedIn' && result.data && <PersonalContacts profile={result.data} onSaved={()=>setRetry(v=>v+1)} />}
    {state.status==='signedIn' && ['admin','manager'].includes(state.session.user.access.role) && <OrganizationContacts canEdit={state.session.user.access.role==='admin'} />}
    <SectionLabel title={mobileUiMessages[language].actions}/>
    <ActionGroup>
      {state.status==='signedIn'&&canReadNotifications(state.session.user)&&<ActionRow label={notificationMessages[language].preferences} icon={<HomeIcon name="bell" size={20} color={colors.primary}/>} onPress={()=>router.push('/notifications/preferences')}/>}
      <ActionRow label={t.farms} icon={<HomeIcon name="home" size={20} color={colors.primary}/>} onPress={()=>router.push('/farms')}/>
      {state.status==='signedIn'&&canReadTeam(state.session.user)&&<ActionRow label={teamMessages[language].title} icon={<HomeIcon name="group" size={20} color={colors.primary}/>} onPress={()=>router.push('/team')}/>}
      <ActionRow label={`${t.webProfile} ↗`} icon={<HomeIcon name="arrow" size={20} color={colors.primary}/>} onPress={()=>web('/home/profile')}/>
      <ActionRow label={`${t.terms} ↗`} icon={<HomeIcon name="arrow" size={20} color={colors.primary}/>} onPress={()=>web('/termos')}/>
      <ActionRow label={`${t.privacy} ↗`} icon={<HomeIcon name="arrow" size={20} color={colors.primary}/>} onPress={()=>web('/privacidade')}/>
    </ActionGroup>
    {linkFailed&&<ErrorState message={t.failedLink} language={language}/>}
    <SectionLabel title={securityMessages[language].security}/>
    <BiometricSetting language={language}/>
    <ActionGroup><ActionRow label={draftCount?`${draftMessages[language].open} (${draftCount})`:draftMessages[language].open} icon={<HomeIcon name="box" size={20} color={colors.primary}/>} onPress={()=>router.push('/drafts')}/></ActionGroup>
    <ActionGroup><ActionRow label={securityMessages[language].about} icon={<HomeIcon name="arrow" size={20} color={colors.primary}/>} onPress={()=>router.push('/about')}/></ActionGroup>
    <Notice tone="neutral" text={t.profileHint}/>
    <ActionGroup><ActionRow tone="danger" label={t.logout} icon={<HomeIcon name="back" size={20} color={colors.error}/>} onPress={signOut}/></ActionGroup>
  </ScrollView></WorkspaceShell>;
}
export function FarmsScreen(){
  const {controller,language}=useAuth();const t=workspaceMessages[language];const back=useBack();const {farm,selectFarm}=useWorkspace();
  const list=useInfinitePages<{id:string;name:string;is_active?:boolean}>({queryKey:['workspace-farms','infinite'],enabled:true,fetchPage:(page,signal)=>controller.farms(page,signal)});
  return <AgendaShell title={t.farms} backLabel={t.back} onBack={back}><FlatList contentContainerStyle={ms.list} data={list.rows} keyExtractor={item=>item.id} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
    ListHeaderComponent={<View style={ms.header}><ScreenIntro title={t.farms} subtitle={t.farmHint}/><ListRow title={t.allFarms} selected={!farm} leading={<IconTile tone="brand"><HomeIcon name="modules" size={20} color={colors.primary}/></IconTile>} onPress={()=>{selectFarm(null);back();}}/></View>}
    renderItem={({item})=><ListRow title={item.name} selected={farm?.id===item.id} status={farm?.id===item.id?{label:t.selected,tone:'success'}:undefined} leading={<IconTile tone="brand"><HomeIcon name="home" size={20} color={colors.primary}/></IconTile>} onPress={()=>{selectFarm(item);back();}}/>}
    ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={t.error} language={language} onRetry={()=>void list.refetch()}/>:<EmptyState title={t.empty}/>}
    ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/></AgendaShell>;
}
type SearchResult=Awaited<ReturnType<ReturnType<typeof useAuth>['controller']['searchEntities']>>['results'][number];
const searchIcon:Record<SearchKind,'leaf'|'box'|'group'|'home'>={animal:'leaf',batch:'group',crop:'leaf',inventory:'box',structure:'home'};
export function SearchScreen(){
  const router=useRouter();
  const {state,controller,language}=useAuth();const t=workspaceMessages[language];
  const kinds=state.status==='signedIn'?searchKinds.filter(kind=>canSearch(state.session.user,kind)):[];
  const [kind,setKind]=useState<SearchKind>(kinds[0]??'animal');const [query,setQuery]=useState('');const [linkFailed,setLinkFailed]=useState(false);
  const allowed=kinds.includes(kind);const valid=query.length>=2&&query.length<=100;
  const list=useInfinitePages<SearchResult>({queryKey:['workspace-search','infinite',kind,query],enabled:allowed&&valid,fetchPage:(page,signal)=>controller.searchEntities({kind,search:query,page},signal)});
  const open=(item:SearchResult)=>{if(item.native){router.push({pathname:'/cattle/[production]/[id]',params:item.native});return;}if(item.nativeInventory){router.push({pathname:'/inventory/[id]',params:{id:item.nativeInventory,kind:'items'}});return;}if(item.path){setLinkFailed(false);void openWeb(item.path).catch(()=>setLinkFailed(true));}};
  const header=<View style={ms.header}>
    <ScreenIntro title={t.search}/>
    {!kinds.length?<EmptyState title={t.noAccess}/>:<>
      <SearchBar value={query} onChange={setQuery} placeholder={t.query} language={language}/>
      <FilterChips value={kind} onChange={setKind} options={kinds.map(value=>({value,label:t[value]}))}/>
      {!valid&&<Notice tone="neutral" text={t.minimum}/>}
      {linkFailed&&<ErrorState message={t.failedLink} language={language}/>}
    </>}
  </View>;
  return <WorkspaceShell active="search" title={t.search}><FlatList data={valid&&allowed?list.rows:[]} keyExtractor={item=>item.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
    ListEmptyComponent={!valid||!allowed?<Notice tone="neutral" text={t.webHint}/>:list.isPending?<SkeletonList/>:list.isError?<ErrorState message={t.error} language={language} onRetry={()=>void list.refetch()}/>:<EmptyState title={t.empty}/>}
    renderItem={({item})=><ListRow title={item.label} subtitle={item.subtitle} status={!item.native&&!item.nativeInventory&&item.path?{label:`${t.webModule} ↗`,tone:'neutral'}:undefined} leading={<IconTile tone="brand"><HomeIcon name={searchIcon[kind]} size={20} color={colors.primary}/></IconTile>} accessibilityLabel={`${item.label}. ${item.native||item.nativeInventory?t.nativeDetail:t.webModule}`} onPress={item.native||item.nativeInventory||item.path?()=>open(item):undefined}/>}
    ListFooterComponent={list.rows.length&&valid?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/></WorkspaceShell>;
}
