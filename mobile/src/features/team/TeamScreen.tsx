import {useCallback,useState} from 'react';
import {FlatList,Linking,RefreshControl,View} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {AgendaShell} from '../workspace/AppShell';
import {workspaceMessages} from '../workspace/messages';
import {parseApiUrl} from '../../config/environment';
import {colors} from '../../theme/tokens';
import {EmptyState,ErrorState,FilterChips,IconTile,KpiStrip,ListRow,ScreenIntro,SearchBar,SelectChip,BottomSheet,SheetOption,SkeletonList,WebFallback,mobileStyles as ms} from '../../components/mobile';
import {HomeIcon} from '../home/HomeIcon';
import {canReadTeam,filterMembers,memberRoles,type Member} from './contracts';
import {teamMessages} from './messages';

async function openWeb(){const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site)throw Error('site');await Linking.openURL(new URL('/home/usuarios',site).href);}
export function TeamScreen(){
 const {state,controller,language}=useAuth();const router=useRouter();const t=teamMessages[language],w=workspaceMessages[language];
 // Admin and manager open every contracted segment; operator and veterinarian only those enabled in Membros.
 const segmentSummary=(item:Member)=>item.role==='admin'||item.role==='manager'?t.allSegments:(item.segments?.length?item.segments.map(code=>t.segmentNames[code]??code).join(', '):t.noSegments);
 const allowed=state.status==='signedIn'&&canReadTeam(state.session.user);
 const q=useQuery({queryKey:['team-members'],enabled:allowed,queryFn:({signal})=>controller.teamMembers(signal)});
 const {refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const [search,setSearch]=useState('');const [role,setRole]=useState<''|Member['role']>('');const [active,setActive]=useState<'active'|'inactive'>('active');const [sheet,setSheet]=useState(false);const [refreshing,setRefreshing]=useState(false);const [linkFailed,setLinkFailed]=useState(false);
 const all=q.data??[];const rows=filterMembers(all,{search,role,active:active==='active'});
 const count=(r:Member['role'])=>all.filter(m=>m.is_active&&m.role===r).length;
 const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?';
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={t.subtitle}/>
  {!!all.length&&<KpiStrip items={[{key:'t',label:t.total,value:String(all.filter(m=>m.is_active).length),selected:!role,onPress:()=>setRole('')},{key:'m',label:t.roles.manager??'',value:String(count('manager')+count('admin')),selected:role==='manager',onPress:()=>setRole(role==='manager'?'':'manager')},{key:'o',label:t.roles.operator??'',value:String(count('operator')),selected:role==='operator',onPress:()=>setRole(role==='operator'?'':'operator')}]}/>}
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language} debounce={150}/>
  <FilterChips value={active} onChange={setActive} options={[{value:'active',label:t.active},{value:'inactive',label:t.inactive}]} trailing={<SelectChip label={t.all} value={role?t.roles[role]:undefined} active={!!role} onPress={()=>setSheet(true)}/>}/>
 </View>;
 return <AgendaShell title={t.title} onBack={()=>router.canGoBack()?router.back():router.replace('/profile')}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<>
  <FlatList<Member> data={rows} keyExtractor={m=>m.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
   refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await refetch();}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>}
   renderItem={({item})=><ListRow meta={item.email} title={item.full_name||item.email} subtitle={[item.organization_responsible?t.responsible:null,segmentSummary(item),item.operator_read_only?t.readOnly:null,item.phone||null].filter(Boolean).join(' · ')||undefined} status={{label:t.roles[item.role]??item.role,tone:item.role==='admin'?'info':item.role==='manager'?'success':'neutral'}} leading={<IconTile tone="brand"><HomeIcon name="group" size={20} color={colors.primary}/></IconTile>} accessibilityLabel={`${initials(item.full_name)} ${item.full_name}. ${t.roles[item.role]}`}/>}
   ListEmptyComponent={q.isPending?<SkeletonList/>:q.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
   ListFooterComponent={<WebFallback hint={t.webHint} label={t.web} failed={linkFailed?w.failedLink:undefined} onPress={()=>{setLinkFailed(false);void openWeb().catch(()=>setLinkFailed(true));}}/>}/>
  <BottomSheet visible={sheet} title={t.all} onClose={()=>setSheet(false)} language={language}>
   <SheetOption label={t.all} selected={!role} onPress={()=>{setRole('');setSheet(false);}}/>
   {memberRoles.map(r=><SheetOption key={r} label={t.roles[r]??r} selected={role===r} onPress={()=>{setRole(r);setSheet(false);}}/>)}
  </BottomSheet>
 </>}</AgendaShell>;
}
