import { useCallback, useState } from 'react';
import { FlatList, Linking, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { parseApiUrl } from '../../config/environment';
import { AgendaButton, AgendaShell, Busy, styles as s } from '../agenda/ui';
import { workspaceMessages } from './messages';
import { useRead } from './useRead';
import { canSearch, searchKinds, type SearchKind } from './contracts';
import { useWorkspace } from './WorkspaceProvider';
function useBack(){const router=useRouter();return ()=>router.canGoBack()?router.back():router.replace('/');}
async function openWeb(path:string){const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site||!path.startsWith('/')||path.startsWith('//'))throw new Error('invalid website');await Linking.openURL(new URL(path,site).href);}
export function ProfileScreen(){
  const {state,controller,language}=useAuth();const t=workspaceMessages[language];const back=useBack();const [retry,setRetry]=useState(0);const [linkFailed,setLinkFailed]=useState(false);
  const load=useCallback((signal:AbortSignal)=>controller.profile(signal),[controller]);const result=useRead(String(retry),load);
  const field=(label:string,value:string)=><View key={label} style={{gap:3}}><Text style={s.label}>{label}</Text><Text selectable style={s.body}>{value}</Text></View>;
  return <AgendaShell title={t.profile} backLabel={t.back} onBack={back}><ScrollView contentContainerStyle={s.content}>
    {result.loading?<Busy label={t.loading}/>:result.failed?<><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={()=>setRetry(v=>v+1)}/></>:result.data&&<View style={s.card}>{field(t.name,result.data.full_name)}{field(t.email,result.data.email)}{field(t.phone,result.data.phone||'—')}</View>}
    {state.status==='signedIn'&&<View style={s.card}>{field(t.organization,state.session.organization.name)}{field(t.role,t[state.session.user.access.role])}{field(t.language,language)}{state.session.user.access.read_only&&<Text style={s.badge}>{t.readOnly}</Text>}</View>}
    <Text style={s.muted}>{t.profileHint}</Text><AgendaButton label={t.webProfile} onPress={()=>{setLinkFailed(false);void openWeb('/home/profile').catch(()=>setLinkFailed(true));}}/>
    <View style={s.row}><AgendaButton label={t.terms} onPress={()=>void openWeb('/termos').catch(()=>setLinkFailed(true))}/><AgendaButton label={t.privacy} onPress={()=>void openWeb('/privacidade').catch(()=>setLinkFailed(true))}/></View>
    {linkFailed&&<Text accessibilityRole="alert" style={s.error}>{t.failedLink}</Text>}<AgendaButton label={t.logout} onPress={()=>void controller.signOut()}/>
  </ScrollView></AgendaShell>;
}
export function FarmsScreen(){
  const {controller,language}=useAuth();const t=workspaceMessages[language];const back=useBack();const {farm,selectFarm}=useWorkspace();const [page,setPage]=useState(1);const [retry,setRetry]=useState(0);
  const load=useCallback((signal:AbortSignal)=>controller.farms(page,signal),[controller,page]);const result=useRead(`${page}:${retry}`,load);
  return <AgendaShell title={t.farms} backLabel={t.back} onBack={back}><FlatList contentContainerStyle={s.content} data={result.data?.results??[]} keyExtractor={item=>item.id}
    ListHeaderComponent={<View style={{gap:12}}><Text style={s.muted}>{t.farmHint}</Text><AgendaButton label={t.allFarms} selected={!farm} onPress={()=>{selectFarm(null);back();}}/>{result.loading&&<Busy label={t.loading}/>}{result.failed&&<><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={()=>setRetry(v=>v+1)}/></>}</View>}
    renderItem={({item})=><AgendaButton label={item.name} selected={farm?.id===item.id} onPress={()=>{selectFarm(item);back();}}/>}
    ListEmptyComponent={!result.loading&&!result.failed?<Text style={s.body}>{t.empty}</Text>:undefined}
    ListFooterComponent={<View style={s.row}><AgendaButton label={t.previous} disabled={page===1||result.loading} onPress={()=>setPage(v=>v-1)}/><Text>{`${t.page} ${page}`}</Text><AgendaButton label={t.next} disabled={!result.data?.next||result.loading} onPress={()=>setPage(v=>v+1)}/></View>}/></AgendaShell>;
}
export function SearchScreen(){
  const router=useRouter();
  const {state,controller,language}=useAuth();const t=workspaceMessages[language];const back=useBack();
  const kinds=state.status==='signedIn'?searchKinds.filter(kind=>canSearch(state.session.user,kind)):[];
  const [kind,setKind]=useState<SearchKind>(kinds[0]??'animal');const [draft,setDraft]=useState('');const [query,setQuery]=useState('');const [page,setPage]=useState(1);const [retry,setRetry]=useState(0);const [linkFailed,setLinkFailed]=useState(false);
  const allowed=kinds.includes(kind);const valid=query.length>=2&&query.length<=100;
  const load=useCallback((signal:AbortSignal)=>controller.searchEntities({kind,search:query,page},signal),[controller,kind,query,page]);
  const result=useRead(`${kind}:${query}:${page}:${retry}`,load,allowed&&valid);
  return <AgendaShell title={t.search} backLabel={t.back} onBack={back}><FlatList data={result.data?.results??[]} key={`${kind}:${query}:${page}`} keyExtractor={item=>item.id} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<View style={{gap:12}}>{!kinds.length?<Text>{t.noAccess}</Text>:<><Text style={s.muted}>{t.webHint}</Text><TextInput accessibilityLabel={t.query} value={draft} onChangeText={setDraft} maxLength={100} returnKeyType="search" onSubmitEditing={()=>{setPage(1);setQuery(draft.trim());}} style={s.input}/><AgendaButton label={t.find} onPress={()=>{setPage(1);setQuery(draft.trim());setRetry(v=>v+1);}}/><View style={s.row}>{kinds.map(value=><AgendaButton key={value} label={t[value]} selected={kind===value} onPress={()=>{setKind(value);setPage(1);}}/>)}</View>{!valid&&<Text style={s.muted}>{t.minimum}</Text>}{result.loading&&<Busy label={t.loading}/>}{result.failed&&<><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={()=>setRetry(v=>v+1)}/></>}{linkFailed&&<Text accessibilityRole="alert" style={s.error}>{t.failedLink}</Text>}</>}</View>}
    ListEmptyComponent={valid&&allowed&&!result.loading&&!result.failed?<Text style={s.body}>{t.empty}</Text>:undefined}
    renderItem={({item})=><View style={s.card}><Text style={s.title}>{item.label}</Text><Text style={s.muted}>{item.subtitle}</Text>{item.native&&<AgendaButton label={t.nativeDetail} onPress={()=>router.push({pathname:'/cattle/[production]/[id]',params:item.native})}/>}
      {item.path&&!item.native&&<AgendaButton label={t.webModule} onPress={()=>{setLinkFailed(false);void openWeb(item.path!).catch(()=>setLinkFailed(true));}}/>}</View>}
    ListFooterComponent={result.data?<View style={s.row}><AgendaButton label={t.previous} disabled={!result.data.previous} onPress={()=>setPage(v=>v-1)}/><Text>{`${t.page} ${page}`}</Text><AgendaButton label={t.next} disabled={!result.data.next} onPress={()=>setPage(v=>v+1)}/></View>:undefined}/></AgendaShell>;
}
