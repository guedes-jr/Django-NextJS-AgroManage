import {useRef,useState} from 'react';
import {Pressable,Switch,Text,TextInput,View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {isAxiosError} from 'axios';
import {randomUUID} from 'expo-crypto';
import {AgendaButton,FormField,styles as ui} from '../agenda/ui';
import {EmptyState,ErrorState,FilterChips,InfoList,KpiStrip,ListRow,Notice,SearchBar,SectionLabel,SkeletonList} from '../../components/mobile';
import {colors,space,type as typo} from '../../theme/tokens';
import {actionLabel,canAnswerTickets,canReadAudit,canReadHealth,canRecordPayment,nextStatuses,paymentInputSchema,type PlatformInvoice,type TeamTicket} from './contracts';
import {Pager,PlatformShell,apiMessage,usePlatform} from './PlatformScreens';

const ticketTone=(status:TeamTicket['status'])=>status==='open'?'warning' as const:status==='in_progress'?'info' as const:status==='resolved'||status==='closed'?'success' as const:'neutral' as const;
const dateTime=(value:string,language:string)=>new Date(value).toLocaleString(language,{dateStyle:'short',timeStyle:'short'});

/** PL05 — team ticket queue. */
export function PlatformTicketsScreen(){
 const {session,controller,language,t}=usePlatform();const router=useRouter();
 const [search,setSearch]=useState('');const [status,setStatus]=useState('open');const [page,setPage]=useState(1);
 const allowed=!!session&&canAnswerTickets(session.staff);
 const q=useQuery({queryKey:['platform-tickets',status,search,page],enabled:allowed,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformTickets(tokens,lang,{page,status,search},signal))});
 return <PlatformShell title={t.tickets} onBack={()=>router.canGoBack()?router.back():router.replace('/platform')} refresh={()=>q.refetch()}>
  {!allowed?<EmptyState title={t.noTicketAccess}/>:<>
   <SearchBar value={search} onChange={value=>{setSearch(value);setPage(1);}} placeholder={t.searchTickets} language={language}/>
   <FilterChips value={status} onChange={value=>{setStatus(value);setPage(1);}} options={[{value:'open',label:t.ticketStatus.open??'open'},{value:'in_progress',label:t.ticketStatus.in_progress??''},{value:'waiting_customer',label:t.ticketStatus.waiting_customer??''},{value:'',label:t.all}]}/>
   {q.isPending?<SkeletonList/>:q.isError?<ErrorState message={t.error} language={language} onRetry={()=>void q.refetch()}/>:!q.data.results.length?<EmptyState title={t.empty}/>:<>
    {q.data.results.map(row=><ListRow key={row.id} meta={[row.organization_name,row.requester_name].filter(Boolean).join(' · ')} title={row.subject} subtitle={`${row.assignee_name||t.unassigned} · ${dateTime(row.updated_at,language)}`} status={{label:t.ticketStatus[row.status]??row.status,tone:ticketTone(row.status)}} onPress={()=>router.push(`/platform/tickets/${row.id}`)}/>)}
    <Pager page={page} hasPrevious={!!q.data.previous} hasNext={!!q.data.next} onChange={setPage} t={t}/>
   </>}
  </>}
 </PlatformShell>;
}

/** PL05 — ticket conversation: take/release, status and reply (public or internal). */
export function PlatformTicketScreen(){
 const {session,controller,language,t}=usePlatform();const router=useRouter();const client=useQueryClient();
 const {id}=useLocalSearchParams<{id:string}>();
 const allowed=!!session&&canAnswerTickets(session.staff);
 const ticket=useQuery({queryKey:['platform-ticket',id],enabled:allowed,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformTicket(tokens,lang,id,signal))});
 const messages=useQuery({queryKey:['platform-ticket-messages',id],enabled:allowed,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformTicketMessages(tokens,lang,id,1,signal))});
 const [reply,setReply]=useState('');const [internal,setInternal]=useState(false);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState<{text:string;ok:boolean}|null>(null);
 // Same key for the same reply intention (safe retry after an uncertain result).
 const key=useRef(randomUUID());
 const run=async(action:()=>Promise<unknown>,ok:string,after?:()=>void)=>{if(busy)return;setBusy(true);setNotice(null);
  try{await action();after?.();setNotice({text:ok,ok:true});}
  catch(error){setNotice({text:isAxiosError(error)&&error.response?.status===409?t.conflict:apiMessage(error)||t.failed,ok:false});}
  finally{setBusy(false);await Promise.all([ticket.refetch(),messages.refetch()]);void client.invalidateQueries({queryKey:['platform-tickets']});}};
 const row=ticket.data;const me=session?.user.id;
 return <PlatformShell title={row?.subject||t.tickets} onBack={()=>router.canGoBack()?router.back():router.replace('/platform/tickets')} refresh={()=>Promise.all([ticket.refetch(),messages.refetch()])}>
  {!allowed?<EmptyState title={t.noTicketAccess}/>:ticket.isPending?<SkeletonList rows={3}/>:ticket.isError||!row?<ErrorState message={t.error} language={language} onRetry={()=>void ticket.refetch()}/>:<>
   <InfoList rows={[[t.organization,row.organization_name||'—'],[t.status,t.ticketStatus[row.status]??row.status],[t.responsible,row.assignee_name||t.unassigned]]}/>
   {notice&&<Notice tone={notice.ok?'success':'danger'} text={notice.text}/>}
   <AgendaButton label={row.assignee_id===me?t.release:t.assignMe} disabled={busy} onPress={()=>void run(()=>controller.platform((api,tokens,lang)=>api.platformAssignTicket(tokens,lang,id,row.assignee_id===me?null:me??null,row.version)),t.assigned)}/>
   <SectionLabel title={t.moveTo}/>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:space.sm}}>{nextStatuses(row.status).map(status=><AgendaButton key={status} label={t.ticketStatus[status]??status} disabled={busy} onPress={()=>void run(()=>controller.platform((api,tokens,lang)=>api.platformTicketStatus(tokens,lang,id,status,row.version)),t.statusUpdated)}/>)}</View>
   <SectionLabel title={t.reply}/>
   <FormField label={t.replyPlaceholder}><TextInput accessibilityLabel={t.replyPlaceholder} value={reply} onChangeText={setReply} multiline maxLength={10000} style={[ui.fieldControl,{minHeight:96,textAlignVertical:'top'}]} editable={!busy}/></FormField>
   <Pressable accessibilityRole="switch" accessibilityState={{checked:internal}} accessibilityLabel={t.internal} onPress={()=>setInternal(value=>!value)} style={{flexDirection:'row',alignItems:'center',gap:space.md,minHeight:44}}>
    <Text style={{...typo.body,flex:1,color:colors.text}}>{t.internal}</Text><Switch accessible={false} value={internal} onValueChange={setInternal} trackColor={{true:colors.primary,false:colors.muted}}/>
   </Pressable>
   <AgendaButton variant="primary" label={t.send} busy={busy} disabled={busy||!reply.trim()} onPress={()=>void run(()=>controller.platform((api,tokens,lang)=>api.platformReplyTicket(tokens,lang,id,{body:reply.trim(),request_key:key.current,expected_version:row.version,is_internal:internal})),t.sent,()=>{setReply('');setInternal(false);key.current=randomUUID();})}/>
   <SectionLabel title={t.tickets}/>
   {messages.isPending?<SkeletonList rows={2}/>:messages.isError||!messages.data?<ErrorState message={t.error} language={language} onRetry={()=>void messages.refetch()}/>:!messages.data.results.length?<EmptyState title={t.empty}/>:
    messages.data.results.map(message=><ListRow key={message.id} meta={`${message.author_name} · ${dateTime(message.created_at,language)}${message.is_internal?` · ${t.internalTag}`:''}`} title={message.body} status={message.from_team?{label:message.is_internal?t.internalTag:t.title,tone:message.is_internal?'warning':'info'}:undefined}/>)}
  </>}
 </PlatformShell>;
}

/** PL06 — SaaS finance: KPIs, invoices and manual payment. */
export function PlatformFinanceScreen(){
 const {session,controller,language,t}=usePlatform();const router=useRouter();const client=useQueryClient();
 const [status,setStatus]=useState('overdue');const [search,setSearch]=useState('');const [page,setPage]=useState(1);
 const [selected,setSelected]=useState<PlatformInvoice|null>(null);const [form,setForm]=useState({amount:'',payment_method:'manual',notes:''});
 const [busy,setBusy]=useState(false);const [notice,setNotice]=useState<{text:string;ok:boolean}|null>(null);
 const summary=useQuery({queryKey:['platform-finance'],enabled:!!session,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformFinance(tokens,lang,signal))});
 const invoices=useQuery({queryKey:['platform-invoices',status,search,page],enabled:!!session,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformInvoices(tokens,lang,{page,status,search},signal))});
 const money=(value:string)=>new Intl.NumberFormat(language,{style:'currency',currency:'BRL'}).format(Number(value));
 const canPay=!!session&&canRecordPayment(session.staff);
 const record=async()=>{if(!selected||busy)return;if(!paymentInputSchema.safeParse(form).success){setNotice({text:t.paymentInvalid,ok:false});return;}
  setBusy(true);setNotice(null);
  try{await controller.platform((api,tokens,lang)=>api.platformRecordPayment(tokens,lang,selected.id,form));setSelected(null);setNotice({text:t.paymentRecorded,ok:true});await Promise.all([invoices.refetch(),summary.refetch()]);void client.invalidateQueries({queryKey:['platform-dashboard']});}
  catch(error){setNotice({text:apiMessage(error)||t.failed,ok:false});}finally{setBusy(false);}};
 const s=summary.data;
 return <PlatformShell title={t.finance} onBack={()=>router.canGoBack()?router.back():router.replace('/platform')} refresh={()=>Promise.all([summary.refetch(),invoices.refetch()])}>
  {summary.isPending?<SkeletonList rows={2}/>:summary.isError||!s?<ErrorState message={t.error} language={language} onRetry={()=>void summary.refetch()}/>:<>
   <KpiStrip items={[{key:'mrr',label:t.mrr,value:money(s.mrr)},{key:'received',label:t.received,value:money(s.received_month)},{key:'due',label:t.outstanding,value:money(s.outstanding)}]}/>
   <InfoList rows={[[t.overdueAmount,`${money(s.overdue_amount)} · ${s.overdue_invoices} ${t.overdueInvoices.toLowerCase()}`],[t.openInvoices,String(s.open_invoices)]]}/>
  </>}
  {notice&&<Notice tone={notice.ok?'success':'danger'} text={notice.text}/>}
  <SearchBar value={search} onChange={value=>{setSearch(value);setPage(1);}} placeholder={t.searchInvoices} language={language}/>
  <FilterChips value={status} onChange={value=>{setStatus(value);setPage(1);setSelected(null);}} options={[{value:'overdue',label:t.overdueInvoices},{value:'open',label:t.openInvoices},{value:'',label:t.allInvoices}]}/>
  {invoices.isPending?<SkeletonList/>:invoices.isError?<ErrorState message={t.error} language={language} onRetry={()=>void invoices.refetch()}/>:!invoices.data.results.length?<EmptyState title={t.empty}/>:<>
   {invoices.data.results.map(row=>{const open=Number(row.amount_due)>0;const isSelected=selected?.id===row.id;
    return <ListRow key={row.id} meta={`${row.number} · ${t.due} ${new Date(`${row.due_date}T12:00:00`).toLocaleDateString(language)}`} title={row.organization_name||'—'} subtitle={`${money(row.total)} · ${t.amountDue} ${money(row.amount_due)}`} status={{label:row.status_display||row.status,tone:row.effective_status==='overdue'?'danger':open?'warning':'success'}} selected={isSelected}
     onPress={canPay&&open?()=>{setSelected(isSelected?null:row);setForm({amount:String(row.amount_due),payment_method:'manual',notes:''});setNotice(null);}:undefined}
     extra={isSelected?<View style={{marginTop:space.sm,gap:space.sm}}>
      <FormField label={t.amount}><TextInput accessibilityLabel={t.amount} value={form.amount} onChangeText={amount=>setForm(f=>({...f,amount}))} keyboardType="decimal-pad" style={ui.fieldControl} editable={!busy}/></FormField>
      <FormField label={t.method}><TextInput accessibilityLabel={t.method} value={form.payment_method} onChangeText={payment_method=>setForm(f=>({...f,payment_method}))} maxLength={40} style={ui.fieldControl} editable={!busy}/></FormField>
      <FormField label={t.notes}><TextInput accessibilityLabel={t.notes} value={form.notes} onChangeText={notes=>setForm(f=>({...f,notes}))} maxLength={2000} multiline style={[ui.fieldControl,{minHeight:64,textAlignVertical:'top'}]} editable={!busy}/></FormField>
      <AgendaButton variant="primary" label={t.recordPayment} busy={busy} disabled={busy} onPress={()=>void record()}/>
     </View>:undefined}/>;})}
   <Pager page={page} hasPrevious={!!invoices.data.previous} hasNext={!!invoices.data.next} onChange={setPage} t={t}/>
  </>}
  {!canPay&&<Notice tone="neutral" text={t.noPaymentAccess}/>}
 </PlatformShell>;
}

/** PL07 — coupons and segment price tiers (read-only). */
export function PlatformCatalogScreen(){
 const {session,controller,language,t}=usePlatform();const router=useRouter();
 const coupons=useQuery({queryKey:['platform-coupons'],enabled:!!session,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformCoupons(tokens,lang,signal))});
 const catalog=useQuery({queryKey:['platform-catalog'],enabled:!!session,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformCatalog(tokens,lang,signal))});
 const money=(value:string|null)=>value===null?t.quote:new Intl.NumberFormat(language,{style:'currency',currency:'BRL'}).format(Number(value));
 const range=(min:number|null,max:number|null)=>`${min??0}–${max??t.noLimit}`;
 return <PlatformShell title={t.catalog} onBack={()=>router.canGoBack()?router.back():router.replace('/platform')} refresh={()=>Promise.all([coupons.refetch(),catalog.refetch()])}>
  <Notice tone="neutral" text={t.catalogHint}/>
  <SectionLabel title={t.segments}/>
  {catalog.isPending?<SkeletonList rows={2}/>:catalog.isError||!catalog.data?<ErrorState message={t.error} language={language} onRetry={()=>void catalog.refetch()}/>:catalog.data.map(segment=><View key={segment.id} style={{marginBottom:space.md}}>
   <ListRow title={t.segmentNames[segment.code]??segment.name} subtitle={t.contracts.replace('{count}',String(segment.contracted_count))} status={segment.is_active?undefined:{label:t.inactive,tone:'neutral'}}/>
   <InfoList rows={segment.tiers.filter(tier=>tier.is_active).map(tier=>[`${tier.label} (${range(tier.minimum_quantity,tier.maximum_quantity)} ${segment.metric_label})`,tier.requires_quote?t.quote:money(tier.monthly_price)] as [string,string])}/>
  </View>)}
  <SectionLabel title={t.coupons}/>
  {coupons.isPending?<SkeletonList rows={2}/>:coupons.isError||!coupons.data?<ErrorState message={t.error} language={language} onRetry={()=>void coupons.refetch()}/>:!coupons.data.results.length?<EmptyState title={t.empty}/>:
   coupons.data.results.map(row=><ListRow key={row.id} meta={row.kind_display} title={row.code} subtitle={[row.description,t.couponUses.replace('{count}',`${row.redemptions}${row.max_redemptions?`/${row.max_redemptions}`:''}`),row.segment_code?t.segmentNames[row.segment_code]??row.segment_code:'',row.valid_until?`${t.until} ${new Date(row.valid_until).toLocaleDateString(language)}`:''].filter(Boolean).join(' · ')} status={row.is_active?undefined:{label:t.couponInactive,tone:'neutral'}}/>)}
 </PlatformShell>;
}

/** PL08 — service health and recent audit trail (each block follows its own permission). */
export function PlatformAuditScreen(){
 const {session,controller,language,t}=usePlatform();const router=useRouter();
 const [page,setPage]=useState(1);
 const auditAllowed=!!session&&canReadAudit(session.staff);const healthAllowed=!!session&&canReadHealth(session.staff);
 const health=useQuery({queryKey:['platform-health'],enabled:healthAllowed,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformHealth(tokens,lang,signal))});
 const audit=useQuery({queryKey:['platform-audit',page],enabled:auditAllowed,queryFn:({signal})=>controller.platform((api,tokens,lang)=>api.platformAudit(tokens,lang,page,signal))});
 const label=(status:string)=>status==='healthy'?t.healthy:status==='attention'?t.attention:t.unavailable;
 const tone=(status:string)=>status==='healthy'?'success' as const:status==='attention'?'warning' as const:'danger' as const;
 return <PlatformShell title={t.audit} onBack={()=>router.canGoBack()?router.back():router.replace('/platform')} refresh={()=>Promise.all([healthAllowed?health.refetch():null,auditAllowed?audit.refetch():null])}>
  <SectionLabel title={t.health}/>
  {!healthAllowed?<Notice tone="neutral" text={t.noHealthAccess}/>:health.isPending?<SkeletonList rows={1}/>:health.isError||!health.data?<ErrorState message={t.error} language={language} onRetry={()=>void health.refetch()}/>:<>
   <ListRow title={label(health.data.status)} meta={`${t.checkedAt} ${dateTime(health.data.checked_at,language)}`} status={{label:label(health.data.status),tone:tone(health.data.status)}}/>
   <InfoList rows={Object.entries(health.data.checks).map(([name,check])=>[name,label(check.status)] as [string,string])}/>
  </>}
  <SectionLabel title={t.recent}/>
  {!auditAllowed?<Notice tone="neutral" text={t.noAuditAccess}/>:audit.isPending?<SkeletonList/>:audit.isError||!audit.data?<ErrorState message={t.error} language={language} onRetry={()=>void audit.refetch()}/>:!audit.data.results.length?<EmptyState title={t.empty}/>:<>
   {audit.data.results.map(row=><ListRow key={row.id} meta={`${dateTime(row.created_at,language)} · ${row.actor_name||t.system}`} title={actionLabel(row.action)} subtitle={[row.organization_name,row.description].filter(Boolean).join(' · ')}/>)}
   <Pager page={page} hasPrevious={!!audit.data.previous} hasNext={!!audit.data.next} onChange={setPage} t={t}/>
  </>}
 </PlatformShell>;
}
