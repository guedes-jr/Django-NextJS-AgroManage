import {useState,type PropsWithChildren,type ReactNode} from 'react';
import {Alert,Linking,Pressable,RefreshControl,ScrollView,Switch,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {isAxiosError} from 'axios';
import {useAuth} from '../auth/AuthProvider';
import {AgendaButton,FormField,styles as ui} from '../agenda/ui';
import {ActionGroup,ActionRow,DetailHeader,EmptyState,ErrorState,FilterChips,InfoList,KpiStrip,ListRow,Notice,ScreenIntro,SearchBar,SectionLabel,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {parseApiUrl} from '../../config/environment';
import {colors,space,type as typo} from '../../theme/tokens';
import {canAnswerTickets,canManagePlatform,platformRoles,platformUserDraft,platformUserPayload,type PlatformOrganization,type PlatformSession,type PlatformUser,type PlatformUserDraft} from './contracts';
import {platformMessages} from './messages';
import {BiometricSetting} from '../security/BiometricLock';
import {securityMessages} from '../security/messages';

/** Readable 4xx message from the API envelope; never raw 5xx bodies. */
export function apiMessage(error:unknown){
 if(!isAxiosError(error)||!error.response||error.response.status>=500)return '';
 const data=error.response.data as {error?:{detail?:unknown};detail?:unknown}|undefined;
 const detail=data?.error?.detail??data?.detail;
 if(typeof detail==='string')return detail;
 if(detail&&typeof detail==='object')return Object.values(detail as Record<string,unknown>).flat().filter(x=>typeof x==='string').join(' ').slice(0,400);
 return '';
}
export function usePlatform(){
 const auth=useAuth();const session:PlatformSession|null=auth.state.status==='platform'?auth.state.session:null;
 return {...auth,session,t:platformMessages[auth.language],manage:!!session&&canManagePlatform(session.staff)};
}
export async function openWeb(path:string){const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site)throw Error('site');await Linking.openURL(new URL(path,site).href);}

/** Backoffice shell: brand header with back and sign-out; no farm navigation. */
export function PlatformShell({title,onBack,children,scroll=true,refresh}:PropsWithChildren<{title:string;onBack?:()=>void;scroll?:boolean;refresh?:()=>Promise<unknown>}>){
 const {controller,t}=usePlatform();const [refreshing,setRefreshing]=useState(false);
 const header=<View style={{flexDirection:'row',alignItems:'center',gap:space.sm,paddingHorizontal:space.lg,paddingVertical:space.md,backgroundColor:colors.forest}}>
  {onBack&&<Pressable accessibilityRole="button" accessibilityLabel={t.back} onPress={onBack} hitSlop={12} style={{minHeight:44,minWidth:44,justifyContent:'center'}}><Text style={{color:'#FFFFFF',fontSize:16,fontWeight:'700'}}>‹ {t.back}</Text></Pressable>}
  <Text accessibilityRole="header" style={{flex:1,color:'#FFFFFF',fontSize:18,fontWeight:'800'}} numberOfLines={1}>{title}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={t.logout} onPress={()=>void controller.signOut()} hitSlop={8} style={{minHeight:44,justifyContent:'center',paddingHorizontal:space.sm}}><Text style={{color:'#FFFFFF',fontSize:15,fontWeight:'600'}}>{t.logout}</Text></Pressable>
 </View>;
 return <SafeAreaView edges={['top','bottom']} style={{flex:1,backgroundColor:colors.forest}}>{header}
  <View style={{flex:1,backgroundColor:colors.background}}>{scroll?<ScrollView contentContainerStyle={[ms.list,{maxWidth:720,width:'100%',alignSelf:'center'}]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
   refreshControl={refresh?<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await refresh();}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>:undefined}>{children}</ScrollView>:children}</View>
 </SafeAreaView>;
}

/** PL01 — overview with KPIs and shortcuts. */
export function PlatformHomeScreen(){
 const {session,controller,language,t}=usePlatform();const router=useRouter();const [linkFailed,setLinkFailed]=useState(false);
 const q=useQuery({queryKey:['platform-dashboard'],enabled:!!session,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformDashboard(tokens,lang,signal))});
 const money=(value:string)=>new Intl.NumberFormat(language,{style:'currency',currency:'BRL'}).format(Number(value));
 const d=q.data;
 type Pending={label:string;count:number;open:()=>void};
 const pending:Pending[]=d?([
  {label:t.overdue,count:d.finance.overdue_invoices,open:()=>router.push('/platform/finance')},
  {label:t.suspended,count:d.organizations.suspended,open:()=>router.push('/platform/organizations?status=suspended')},
  ...(d.support?[{label:`${t.openTickets} · ${t.awaitingTeam}`,count:d.support.awaiting_team,open:()=>router.push('/platform/tickets')}]:[]),
  {label:`${t.members} · ${t.withoutOrg}`,count:d.users.without_organization,open:()=>router.push('/platform/users')},
 ] as Pending[]).filter(row=>row.count>0):[];
 return <PlatformShell title={t.title} refresh={()=>q.refetch()}>
  <ScreenIntro title={session?.staff.full_name||t.title} subtitle={[session?.staff.role_display,t.subtitle].filter(Boolean).join(' · ')}/>
  {q.isPending?<SkeletonList rows={3}/>:q.isError||!d?<ErrorState message={t.error} language={language} onRetry={()=>void q.refetch()}/>:<>
   <KpiStrip items={[
    {key:'org',label:t.organizations,value:String(d.organizations.active),onPress:()=>router.push('/platform/organizations')},
    {key:'users',label:t.activeUsers,value:String(d.users.active),onPress:()=>router.push('/platform/users')},
    {key:'mrr',label:t.mrr,value:money(d.finance.mrr)},
   ]}/>
   <Text style={{...typo.meta,marginTop:space.xs}}>+{d.organizations.created_last_30_days} {t.newLast30}</Text>
   <SectionLabel title={t.pending}/>
   {pending.length?<ActionGroup>{pending.map(row=><ActionRow key={row.label} label={`${row.label}: ${row.count}`} tone="warning" onPress={row.open}/>)}</ActionGroup>:<Notice tone="success" text={t.noPending}/>}
   <SectionLabel title={t.overview}/>
   <ActionGroup>
    <ActionRow label={t.organizations} description={`${d.organizations.total} · ${d.organizations.suspended} ${t.suspended.toLowerCase()}`} onPress={()=>router.push('/platform/organizations')}/>
    <ActionRow label={t.users} description={`${d.users.total} · ${d.users.active} ${t.userActive.toLowerCase()}`} onPress={()=>router.push('/platform/users')}/>
    {session&&canAnswerTickets(session.staff)&&<ActionRow label={t.tickets} description={d.support?`${d.support.active} · ${d.support.awaiting_team} ${t.awaitingTeam}`:undefined} onPress={()=>router.push('/platform/tickets')}/>}
    <ActionRow label={t.finance} description={`${t.mrr}: ${money(d.finance.mrr)}`} onPress={()=>router.push('/platform/finance')}/>
    <ActionRow label={t.catalog} onPress={()=>router.push('/platform/catalog')}/>
    <ActionRow label={t.audit} onPress={()=>router.push('/platform/audit')}/>
   </ActionGroup>
  </>}
  {linkFailed&&<Notice tone="danger" text={t.error}/>}
  <Notice tone="neutral" text={t.webHint}/>
  <AgendaButton label={t.web} onPress={()=>{setLinkFailed(false);void openWeb('/platform').catch(()=>setLinkFailed(true));}}/>
  <SectionLabel title={securityMessages[language].security}/>
  <BiometricSetting language={language}/>
  <AgendaButton label={securityMessages[language].about} onPress={()=>router.push('/about')}/>
 </PlatformShell>;
}

export function Pager({page,hasPrevious,hasNext,onChange,t}:{page:number;hasPrevious:boolean;hasNext:boolean;onChange:(page:number)=>void;t:typeof platformMessages['pt-BR']}){
 if(!hasPrevious&&!hasNext)return null;
 return <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:space.sm,marginTop:space.md}}>
  <AgendaButton label={t.previous} disabled={!hasPrevious} onPress={()=>onChange(page-1)}/>
  <Text style={typo.meta}>{t.page.replace('{page}',String(page))}</Text>
  <AgendaButton label={t.next} disabled={!hasNext} onPress={()=>onChange(page+1)}/>
 </View>;
}

const statusTone=(status:PlatformOrganization['status'])=>status==='active'?'success' as const:status==='suspended'?'danger' as const:'neutral' as const;

/** PL02 — organizations with search and status chips. */
export function PlatformOrganizationsScreen(){
 const {session,controller,language,t}=usePlatform();const router=useRouter();
 const params=useLocalSearchParams<{status?:string}>();
 const [search,setSearch]=useState('');const [status,setStatus]=useState<string>(params.status&&['active','suspended','archived'].includes(params.status)?params.status:'');const [page,setPage]=useState(1);
 const q=useQuery({queryKey:['platform-organizations',search,status,page],enabled:!!session,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformOrganizations(tokens,lang,{page,search,status},signal))});
 return <PlatformShell title={t.organizations} onBack={()=>router.canGoBack()?router.back():router.replace('/platform')} refresh={()=>q.refetch()}>
  <SearchBar value={search} onChange={value=>{setSearch(value);setPage(1);}} placeholder={t.search} language={language}/>
  <FilterChips value={status} onChange={value=>{setStatus(value);setPage(1);}} options={[{value:'',label:t.all},{value:'active',label:t.active},{value:'suspended',label:t.suspended},{value:'archived',label:t.archived}]}/>
  {q.isPending?<SkeletonList/>:q.isError?<ErrorState message={t.error} language={language} onRetry={()=>void q.refetch()}/>:!q.data.results.length?<EmptyState title={t.empty}/>:<>
   {q.data.results.map(org=><ListRow key={org.id} meta={org.document||org.email||org.slug} title={org.name} subtitle={`${org.users_count} ${t.members.toLowerCase()} · ${org.farms_count} ${t.farms.toLowerCase()}`} status={{label:org.status_display||org.status,tone:statusTone(org.status)}} onPress={()=>router.push(`/platform/organizations/${org.id}`)}/>)}
   <Pager page={page} hasPrevious={!!q.data.previous} hasNext={!!q.data.next} onChange={setPage} t={t}/>
  </>}
 </PlatformShell>;
}

/** PL03 — organization: summary, segments and monthly value, discounts, status. */
export function PlatformOrganizationScreen(){
 const {session,controller,language,t,manage}=usePlatform();const router=useRouter();const client=useQueryClient();
 const {id}=useLocalSearchParams<{id:string}>();
 const org=useQuery({queryKey:['platform-organization',id],enabled:!!session,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformOrganization(tokens,lang,id,signal))});
 const segs=useQuery({queryKey:['platform-organization-segments',id],enabled:!!session,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformOrganizationSegments(tokens,lang,id,signal))});
 const disc=useQuery({queryKey:['platform-organization-discounts',id],enabled:!!session,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformOrganizationDiscounts(tokens,lang,id,signal))});
 const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState<{text:string;ok:boolean}|null>(null);
 const money=(value:string)=>new Intl.NumberFormat(language,{style:'currency',currency:'BRL'}).format(Number(value));
 const date=(value:string|null)=>value?new Date(value).toLocaleDateString(language):t.noEnd;
 const run=async(action:()=>Promise<unknown>,ok:string)=>{if(busy)return;setBusy(true);setNotice(null);
  try{await action();setNotice({text:ok,ok:true});await client.invalidateQueries({queryKey:['platform-organization',id]});await client.invalidateQueries({queryKey:['platform-organization-discounts',id]});void client.invalidateQueries({queryKey:['platform-organizations']});}
  catch(error){setNotice({text:apiMessage(error)||t.failed,ok:false});}finally{setBusy(false);}};
 const changeStatus=(status:'suspended'|'archived'|'active',label:string)=>{
  const o=org.data;if(!o)return;
  Alert.alert(label,`${t.confirmStatus.replace('{action}',label).replace('{name}',o.name)}${status!=='active'?`\n\n${t.suspendHint}`:''}`,[{text:t.cancel,style:'cancel'},{text:t.confirm,style:status==='active'?'default':'destructive',onPress:()=>void run(()=>controller.platform((api,tokens,lang)=>api.platformOrganizationStatus(tokens,lang,id,status,reason)),t.statusChanged).then(()=>setReason(''))}]);
 };
 const o=org.data;
 return <PlatformShell title={o?.name||t.organizations} onBack={()=>router.canGoBack()?router.back():router.replace('/platform/organizations')} refresh={()=>Promise.all([org.refetch(),segs.refetch(),disc.refetch()])}>
  {org.isPending?<SkeletonList rows={3}/>:org.isError||!o?<ErrorState message={t.error} language={language} onRetry={()=>void org.refetch()}/>:<>
   <DetailHeader meta={o.document||o.slug} title={o.name} status={[{label:o.status_display||o.status,tone:statusTone(o.status)}]}>
    <InfoList rows={[[t.responsible,o.responsible?`${o.responsible.full_name||o.responsible.email}`:t.noResponsible],[t.members,String(o.users_count)],[t.farms,String(o.farms_count)],...(o.status_reason?[[t.reason,o.status_reason] as [string,string]]:[])]}/>
   </DetailHeader>
   {notice&&<Notice tone={notice.ok?'success':'danger'} text={notice.text}/>}
   {!manage&&<Notice tone="neutral" text={t.readOnly}/>}

   <SectionLabel title={t.segments}/>
   {segs.isPending?<SkeletonList rows={2}/>:segs.isError||!segs.data?<ErrorState message={t.error} language={language} onRetry={()=>void segs.refetch()}/>:<>
    <InfoList rows={segs.data.segments.map(segment=>{const line=segs.data!.price?.lines.find(row=>row.segment_code===segment.code);return [t.segmentNames[segment.code]??segment.name,!segment.contracted?t.notContracted:!segment.active?t.inactive:line?(line.on_request?t.quote:money(line.total)):'—'] as [string,string];})}/>
    {segs.data.price&&<InfoList rows={[...(Number(segs.data.price.discount_total)>0?[[t.gross,money(segs.data.price.gross)],[t.discounts,`− ${money(segs.data.price.discount_total)}`]] as [string,string][]:[]),[t.total,money(segs.data.price.total)]]}/>}
   </>}

   <SectionLabel title={t.discounts}/>
   {disc.isPending?<SkeletonList rows={1}/>:disc.isError||!disc.data?<ErrorState message={t.error} language={language} onRetry={()=>void disc.refetch()}/>:!disc.data.discounts.filter(row=>row.is_active).length?<Notice tone="neutral" text={t.noDiscounts}/>:
    disc.data.discounts.filter(row=>row.is_active).map(row=><ListRow key={row.id} title={row.description} meta={`${row.source_display} · ${row.kind_display}`} subtitle={`${row.segment_code?t.segmentNames[row.segment_code]??row.segment_code:''}${row.segment_code?' · ':''}${t.until} ${date(row.ends_at)}`}
     extra={manage?<View style={{marginTop:space.sm}}><AgendaButton label={t.revoke} disabled={busy} onPress={()=>Alert.alert(t.revoke,t.confirmRevoke.replace('{name}',row.description),[{text:t.cancel,style:'cancel'},{text:t.confirm,style:'destructive',onPress:()=>void run(()=>controller.platform((api,tokens,lang)=>api.platformRevokeDiscount(tokens,lang,id,row.id)),t.revoked)}])}/></View>:undefined}/>)}

   <SectionLabel title={t.users}/>
   <ActionGroup><ActionRow label={t.users} description={`${o.users_count}`} onPress={()=>router.push(`/platform/users?organization=${o.id}`)}/></ActionGroup>

   {manage&&o.can_manage&&<>
    <SectionLabel title={t.status}/>
    <FormField label={t.reason}><TextInput accessibilityLabel={t.reason} value={reason} onChangeText={setReason} maxLength={1000} multiline style={[ui.fieldControl,{minHeight:64,textAlignVertical:'top'}]} editable={!busy}/></FormField>
    {o.status==='active'&&<AgendaButton label={t.suspend} disabled={busy} onPress={()=>changeStatus('suspended',t.suspend)}/>}
    {o.status!=='archived'&&<AgendaButton label={t.archive} disabled={busy} onPress={()=>changeStatus('archived',t.archive)}/>}
    {o.status!=='active'&&<AgendaButton variant="primary" label={t.reactivate} disabled={busy} onPress={()=>changeStatus('active',t.reactivate)}/>}
   </>}
  </>}
 </PlatformShell>;
}

/** PL04 — users list (optionally of one organization). */
export function PlatformUsersScreen(){
 const {session,controller,language,t}=usePlatform();const router=useRouter();
 const params=useLocalSearchParams<{organization?:string}>();
 const [search,setSearch]=useState('');const [page,setPage]=useState(1);
 const organization=params.organization&&/^[0-9a-f-]{36}$/i.test(params.organization)?params.organization:undefined;
 const q=useQuery({queryKey:['platform-users',search,organization,page],enabled:!!session,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformUsers(tokens,lang,{page,search,organization},signal))});
 return <PlatformShell title={t.users} onBack={()=>router.canGoBack()?router.back():router.replace('/platform')} refresh={()=>q.refetch()}>
  <SearchBar value={search} onChange={value=>{setSearch(value);setPage(1);}} placeholder={t.searchUsers} language={language}/>
  {q.isPending?<SkeletonList/>:q.isError?<ErrorState message={t.error} language={language} onRetry={()=>void q.refetch()}/>:!q.data.results.length?<EmptyState title={t.empty}/>:<>
   {q.data.results.map(user=><ListRow key={user.id} meta={user.email} title={user.full_name||user.email} subtitle={[user.organization_name,t.roles[user.role]??user.role].filter(Boolean).join(' · ')} status={{label:user.is_active?t.userActive:t.userBlocked,tone:user.is_active?'success':'danger'}} onPress={()=>router.push(`/platform/users/${user.id}`)}/>)}
   <Pager page={page} hasPrevious={!!q.data.previous} hasNext={!!q.data.next} onChange={setPage} t={t}/>
  </>}
 </PlatformShell>;
}

function Toggle({label,value,onChange,disabled}:{label:string;value:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){
 return <Pressable accessibilityRole="switch" accessibilityState={{checked:value,disabled}} accessibilityLabel={label} disabled={disabled} onPress={()=>onChange(!value)} style={{flexDirection:'row',alignItems:'center',gap:space.md,minHeight:44}}>
  <Text style={{...typo.body,flex:1,color:colors.text}}>{label}</Text><Switch accessible={false} disabled={disabled} value={value} onValueChange={onChange} trackColor={{true:colors.primary,false:colors.muted}}/>
 </Pressable>;
}

/** PL04 — user: data, role/segments, password and access. */
export function PlatformUserScreen(){
 const {session,controller,language,t,manage}=usePlatform();const router=useRouter();const client=useQueryClient();
 const {id}=useLocalSearchParams<{id:string}>();
 const q=useQuery({queryKey:['platform-user',id],enabled:!!session,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformUser(tokens,lang,id,signal))});
 const [draft,setDraft]=useState<PlatformUserDraft|null>(null);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState<{text:string;ok:boolean}|null>(null);
 const [password,setPassword]=useState({new_password:'',new_password_confirm:'',force_password_change:true,revoke_sessions:true});
 const user=q.data;const current=draft??(user?platformUserDraft(user):null);
 const roleLocked=!!user?.organization_responsible;
 const set=(patch:Partial<PlatformUserDraft>)=>current&&setDraft({...current,...patch});
 const refreshAll=async(updated?:PlatformUser)=>{if(updated)client.setQueryData(['platform-user',id],updated);else await q.refetch();setDraft(null);void client.invalidateQueries({queryKey:['platform-users']});};
 const act=async(action:()=>Promise<PlatformUser|void>,ok:string)=>{if(busy)return;setBusy(true);setNotice(null);
  try{const result=await action();await refreshAll(result||undefined);setNotice({text:ok,ok:true});}catch(error){setNotice({text:apiMessage(error)||t.failed,ok:false});}finally{setBusy(false);}};
 const save=()=>{if(!current)return;
  if(current.full_name.trim().length<2){setNotice({text:t.errName,ok:false});return;}
  if(!/^\S+@\S+\.\S+$/.test(current.email.trim())){setNotice({text:t.errEmail,ok:false});return;}
  void act(()=>controller.platform((api,tokens,lang)=>api.platformUpdateUser(tokens,lang,id,platformUserPayload(current,{roleLocked}))),t.saved);};
 const resetPassword=()=>{if(password.new_password.length<8||password.new_password!==password.new_password_confirm){setNotice({text:t.passwordInvalid,ok:false});return;}
  void act(()=>controller.platform((api,tokens,lang)=>api.platformSetPassword(tokens,lang,id,password)),t.passwordReset).then(()=>setPassword(p=>({...p,new_password:'',new_password_confirm:''})));};
 const scoped=current?.role==='operator'||current?.role==='veterinarian';
 const section=(title:string,children:ReactNode)=><><SectionLabel title={title}/>{children}</>;
 return <PlatformShell title={user?.full_name||t.users} onBack={()=>router.canGoBack()?router.back():router.replace('/platform/users')} refresh={()=>q.refetch()}>
  {q.isPending?<SkeletonList rows={3}/>:q.isError||!user||!current?<ErrorState message={t.error} language={language} onRetry={()=>void q.refetch()}/>:<>
   <DetailHeader meta={user.email} title={user.full_name||user.email} status={[{label:user.is_active?t.userActive:t.userBlocked,tone:user.is_active?'success':'danger'},{label:t.roles[user.role]??user.role,tone:'info'}]}>
    <InfoList rows={[[t.organization,user.organization_name||'—'],[t.lastLogin,user.last_login?new Date(user.last_login).toLocaleString(language):t.never]]}/>
   </DetailHeader>
   {notice&&<Notice tone={notice.ok?'success':'danger'} text={notice.text}/>}
   {!manage&&<Notice tone="neutral" text={t.readOnly}/>}
   {section(t.data,<>
    <FormField label={t.name}><TextInput accessibilityLabel={t.name} value={current.full_name} onChangeText={full_name=>set({full_name})} maxLength={255} style={ui.fieldControl} editable={manage&&!busy}/></FormField>
    <FormField label={t.email}><TextInput accessibilityLabel={t.email} value={current.email} onChangeText={email=>set({email})} keyboardType="email-address" autoCapitalize="none" maxLength={254} style={ui.fieldControl} editable={manage&&!busy}/></FormField>
    <FormField label={t.phone}><TextInput accessibilityLabel={t.phone} value={current.phone} onChangeText={phone=>set({phone})} keyboardType="phone-pad" maxLength={30} style={ui.fieldControl} editable={manage&&!busy}/></FormField>
   </>)}
   {section(t.role,<>
    {roleLocked&&<Notice tone="info" text={t.lockedRole}/>}
    {platformRoles.map(role=><ListRow key={role} title={t.roles[role]??role} selected={current.role===role} disabled={!manage||roleLocked||busy} onPress={()=>set(role==='operator'||role==='veterinarian'?{role}:{role,segments:[],operator_read_only:false})}/>)}
    {scoped&&<>
     <Text style={{...typo.meta,marginTop:space.sm}}>{t.accessSegments}</Text>
     {user.contracted_segments.map(code=>{const fixed=code==='area-veterinario'&&current.role==='veterinarian';const checked=fixed||current.segments.includes(code);
      return <ListRow key={code} title={t.segmentNames[code]??code} subtitle={fixed?t.vetIncluded:undefined} selected={checked} disabled={!manage||fixed||busy} onPress={()=>set({segments:checked?current.segments.filter(value=>value!==code):[...current.segments,code]})}/>;})}
     <Toggle label={t.readOnlyLabel} value={current.operator_read_only} onChange={operator_read_only=>set({operator_read_only})} disabled={!manage||busy}/>
    </>}
   </>)}
   {manage&&<AgendaButton variant="primary" label={t.save} busy={busy} disabled={busy||!draft} onPress={save}/>}
   {manage&&section(t.security,<>
    <FormField label={t.newPassword}><TextInput accessibilityLabel={t.newPassword} value={password.new_password} onChangeText={new_password=>setPassword(p=>({...p,new_password}))} secureTextEntry autoComplete="new-password" style={ui.fieldControl} editable={!busy}/></FormField>
    <FormField label={t.confirmPassword}><TextInput accessibilityLabel={t.confirmPassword} value={password.new_password_confirm} onChangeText={new_password_confirm=>setPassword(p=>({...p,new_password_confirm}))} secureTextEntry autoComplete="new-password" style={ui.fieldControl} editable={!busy}/></FormField>
    <Toggle label={t.forceChange} value={password.force_password_change} onChange={force_password_change=>setPassword(p=>({...p,force_password_change}))} disabled={busy}/>
    <Toggle label={t.revokeSessions} value={password.revoke_sessions} onChange={revoke_sessions=>setPassword(p=>({...p,revoke_sessions}))} disabled={busy}/>
    <AgendaButton label={t.resetPassword} disabled={busy||!password.new_password} onPress={resetPassword}/>
    <AgendaButton label={t.endSessions} disabled={busy} onPress={()=>void act(()=>controller.platform((api,tokens,lang)=>api.platformUserAction(tokens,lang,id,'revoke-sessions')),t.sessionsEnded)}/>
    {user.is_active?<AgendaButton label={t.block} disabled={busy} onPress={()=>Alert.alert(t.block,t.confirmBlock.replace('{name}',user.full_name||user.email),[{text:t.cancel,style:'cancel'},{text:t.confirm,style:'destructive',onPress:()=>void act(()=>controller.platform((api,tokens,lang)=>api.platformUserAction(tokens,lang,id,'block')),t.blocked)}])}/>
     :<AgendaButton label={t.unblock} disabled={busy} onPress={()=>void act(()=>controller.platform((api,tokens,lang)=>api.platformUserAction(tokens,lang,id,'activate')),t.unblocked)}/>}
   </>)}
  </>}
 </PlatformShell>;
}
