import {useCallback,useState} from 'react';
import {Linking,RefreshControl,ScrollView,TextInput} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {isAxiosError} from 'axios';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,FormField,styles as ui} from '../agenda/ui';
import {HomeIcon} from '../home/HomeIcon';
import {parseApiUrl} from '../../config/environment';
import {colors} from '../../theme/tokens';
import {ActionGroup,ActionRow,DetailHeader,EmptyState,ErrorState,IconTile,InfoList,MetricGrid,Notice,SectionLabel,SkeletonList,WebFallback,mobileStyles as ms} from '../../components/mobile';
import {canReadTeam} from '../team/contracts';
import {addressLine,canEditOrganization,canReadOrganization,invoiceState,safePaymentUrl,type InvoiceState} from './contracts';
import {organizationMessages} from './messages';

async function openWeb(){const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site)throw Error('site');await Linking.openURL(new URL('/home/settings',site).href);}
export function OrganizationScreen(){
 const {state,controller,language}=useAuth();const router=useRouter();const client=useQueryClient();const t=organizationMessages[language],w=workspaceMessages[language];
 const user=state.status==='signedIn'?state.session.user:null;
 const allowed=!!user&&canReadOrganization(user),editable=!!user&&canEditOrganization(user);
 const q=useQuery({queryKey:['organization-settings'],enabled:allowed,queryFn:({signal})=>controller.myOrganization(signal)});
 const inv=useQuery({queryKey:['plan-invoices'],enabled:allowed,queryFn:({signal})=>controller.planInvoices(signal)});
 const {refetch}=q;const refetchInvoices=inv.refetch;useFocusEffect(useCallback(()=>{if(allowed){void refetch();void refetchInvoices();}},[allowed,refetch,refetchInvoices]));
 const [payFailed,setPayFailed]=useState(false);
 const stateLabel:Record<InvoiceState,string>={open:t.openLabel,overdue:t.overdueLabel,paid:t.paidLabel,void:t.voidLabel};
 const dateLabel=(v:string)=>new Date(`${v}T12:00:00`).toLocaleDateString(language);
 const pay=async(url:string)=>{const safe=safePaymentUrl(url);setPayFailed(false);try{if(!safe)throw Error('url');await Linking.openURL(safe);}catch{setPayFailed(true);}};
 const [editing,setEditing]=useState(false);const [form,setForm]=useState({name:'',email:'',phone:''});const [errors,setErrors]=useState<{name?:string;email?:string}>({});const [busy,setBusy]=useState(false);const [notice,setNotice]=useState<{text:string;ok:boolean}|null>(null);const [refreshing,setRefreshing]=useState(false);const [linkFailed,setLinkFailed]=useState(false);
 const o=q.data;
 const money=(v:string|number|null|undefined)=>v==null?'—':new Intl.NumberFormat(language,{style:'currency',currency:'BRL'}).format(Number(v));
 const save=async()=>{if(busy)return;const e={name:form.name.trim().length<2?t.errName:undefined,email:form.email.trim()&&!/^\S+@\S+\.\S+$/.test(form.email.trim())?t.errEmail:undefined};setErrors(e);if(e.name||e.email)return;setBusy(true);setNotice(null);
  try{await controller.updateOrganization({name:form.name.trim(),email:form.email.trim(),phone:form.phone.trim()});setEditing(false);setNotice({text:t.saved,ok:true});void client.invalidateQueries({queryKey:['organization-settings']});void refetch();}
  catch(err){const data=isAxiosError(err)&&err.response?.data&&typeof err.response.data==='object'?Object.values(err.response.data as Record<string,unknown>).flat().filter(x=>typeof x==='string').join(' '):'';setNotice({text:data||t.failed,ok:false});}
  finally{setBusy(false);}};
 return <WorkspaceShell active="settings" title={t.title}><ScrollView contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await Promise.all([refetch(),inv.refetch()]);}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>}>
  {!allowed?<EmptyState title={w.noAccess}/>:q.isPending?<SkeletonList rows={3}/>:q.isError||!o?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<>
   <DetailHeader meta={o.document||t.subtitle} title={o.name} leading={<IconTile tone="brand"><HomeIcon name="home" size={22} color={colors.primary}/></IconTile>} status={[...(o.plan_display?[{label:`${t.plan}: ${o.plan_display}`,tone:'info' as const}]:[]),...(o.status_display?[{label:o.status_display,tone:'success' as const}]:[])]}>
    <MetricGrid columns={2} items={[{label:t.farms,value:String(o.farms_count??'—')},{label:t.storage,value:o.storage_used!=null?new Intl.NumberFormat(language,{maximumFractionDigits:1}).format(o.storage_used):'—',unit:'MB'}]}/>
   </DetailHeader>
   {notice&&<Notice tone={notice.ok?'success':'danger'} text={notice.text}/>}
   {editing?<>
    <FormField label={t.name} error={errors.name}><TextInput accessibilityLabel={t.name} value={form.name} onChangeText={name=>setForm(f=>({...f,name}))} maxLength={255} style={ui.fieldControl}/></FormField>
    <FormField label={t.email} error={errors.email}><TextInput accessibilityLabel={t.email} value={form.email} onChangeText={email=>setForm(f=>({...f,email}))} keyboardType="email-address" autoCapitalize="none" maxLength={254} style={ui.fieldControl}/></FormField>
    <FormField label={t.phone}><TextInput accessibilityLabel={t.phone} value={form.phone} onChangeText={phone=>setForm(f=>({...f,phone}))} keyboardType="phone-pad" maxLength={30} style={ui.fieldControl}/></FormField>
    <AgendaButton variant="primary" busy={busy} disabled={busy} label={t.save} onPress={()=>void save()}/>
    <AgendaButton label={t.cancel} disabled={busy} onPress={()=>{setEditing(false);setErrors({});}}/>
   </>:<InfoList rows={[[t.email,o.email||t.none],[t.phone,o.phone||t.none],[t.language,o.language]]}/>}
   <SectionLabel title={t.segments}/>
   {o.subscription?.items.length?<InfoList rows={o.subscription.items.map(i=>[[i.segment_name,i.tier_label].filter(Boolean).join(' · ')||'—',`${money(i.final_monthly_price)}${t.perMonth}`] as [string,string])}/>:<Notice tone="neutral" text={t.noSegments}/>}
   <SectionLabel title={t.invoices}/>
   {inv.data?.subscription_status==='suspended'?<Notice tone="danger" text={t.suspended}/>:inv.data?.subscription_status==='past_due'?<Notice tone="warning" text={t.pastDue}/>:null}
   {inv.isPending?<SkeletonList rows={2}/>:inv.isError?<ErrorState message={t.invoicesError} language={language} onRetry={()=>void inv.refetch()}/>:!inv.data?.results.length?<Notice tone="neutral" text={t.noInvoices}/>:<>
    <InfoList rows={inv.data.results.slice(0,6).map(row=>{const st=invoiceState(row);return [`${t.due} ${dateLabel(row.due_date)} · ${row.number}`,`${money(st==='open'||st==='overdue'?row.balance:row.total)} · ${stateLabel[st]}`] as [string,string];})}/>
    {inv.data.results.filter(row=>{const st=invoiceState(row);return (st==='open'||st==='overdue')&&!!safePaymentUrl(row.payment_url);}).slice(0,1).map(row=><AgendaButton key={row.id} variant="primary" label={`${t.pay} ${row.number}`} onPress={()=>void pay(row.payment_url)}/>)}
    {payFailed?<Notice tone="danger" text={t.payFailed}/>:inv.data.results.some(row=>!!row.payment_url&&invoiceState(row)!=='paid')?<Notice tone="neutral" text={t.payHint}/>:null}
   </>}
   {!!o.contacts.length&&<><SectionLabel title={t.contacts}/><InfoList rows={o.contacts.map(c=>[String(c.label??c.tipo??c.kind??'—'),String(c.value??c.valor??'—')] as [string,string])}/></>}
   {!!o.addresses.length&&<><SectionLabel title={t.addresses}/><InfoList rows={o.addresses.map((a,i)=>[String((a as Record<string,unknown>).label??i+1),addressLine(a as Record<string,unknown>)||t.none] as [string,string])}/></>}
   {(editable&&!editing||(user&&canReadTeam(user)))&&<><SectionLabel title={t.edit}/><ActionGroup>
    {editable&&!editing&&<ActionRow label={t.edit} icon={<HomeIcon name="home" size={20} color={colors.primary}/>} onPress={()=>{setForm({name:o.name,email:o.email??'',phone:o.phone??''});setNotice(null);setEditing(true);}}/>}
    {user&&canReadTeam(user)&&<ActionRow label={t.team} icon={<HomeIcon name="group" size={20} color={colors.primary}/>} onPress={()=>router.push('/team')}/>}
   </ActionGroup></>}
   <WebFallback hint={t.webHint} label={t.web} failed={linkFailed?w.failedLink:undefined} onPress={()=>{setLinkFailed(false);void openWeb().catch(()=>setLinkFailed(true));}}/>
  </>}
 </ScrollView></WorkspaceShell>;
}
