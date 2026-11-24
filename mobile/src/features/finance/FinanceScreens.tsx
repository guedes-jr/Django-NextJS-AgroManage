import {useCallback,useRef,useState} from 'react';
import {FlatList,Linking,RefreshControl,ScrollView,Text,TextInput,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {randomUUID} from 'expo-crypto';
import {isAxiosError} from 'axios';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,FormField,StatusPill,styles as ui,type StatusTone} from '../agenda/ui';
import {HomeIcon} from '../home/HomeIcon';
import {parseApiUrl} from '../../config/environment';
import {colors} from '../../theme/tokens';
import {ActionGroup,ActionRow,BottomSheet,DateStepper,DetailHeader,EmptyState,ErrorState,FilterChips,HeaderAction,IconTile,InfoList,KpiStrip,ListFooter,ListRow,MetricGrid,Notice,ScreenIntro,SearchBar,SectionLabel,Segmented,SelectChip,SheetOption,SkeletonList,WebFallback,localToday,mobileStyles as ms,mobileUiMessages} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {activePayment,canReadFinance,canReverse,canSettle,canWriteFinance,FinanceChanged,paymentMethods,type FinanceKind,type FinanceStatus,type FinanceTransaction,type PaymentMethod} from './contracts';
import {financeMessages} from './messages';

export const denied=(error:unknown)=>isAxiosError(error)&&[401,403,404].includes(error.response?.status??0);
const money=(value:number|string,language:string)=>new Intl.NumberFormat(language,{style:'currency',currency:'BRL'}).format(Number(value));
const day=(value:string|null|undefined,language:string)=>value?new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`)):'—';
export const statusTone=(status:FinanceStatus):StatusTone=>status==='paid'?'success':status==='overdue'?'danger':status==='cancelled'?'neutral':'warning';
async function openFinanceWeb(){const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site)throw Error('site');await Linking.openURL(new URL('/home/financeiro',site).href);}

type Tab='overview'|FinanceKind;
export function FinanceScreen(){
 const params=useLocalSearchParams();
 const {state,language}=useAuth();const router=useRouter();const t=financeMessages[language],w=workspaceMessages[language];
 const allowed=state.status==='signedIn'&&canReadFinance(state.session.user);
 const writable=state.status==='signedIn'&&canWriteFinance(state.session.user);
 const [tab,setTab]=useState<Tab>(params.tab==='revenue'||params.tab==='expense'?params.tab:'overview');
 const [linkFailed,setLinkFailed]=useState(false);
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={t.subtitle} badge={!writable&&allowed?<View style={{marginTop:6}}><StatusPill label={t.readonly} tone="neutral"/></View>:undefined} action={writable?<HeaderAction label={t.newTitle} onPress={()=>router.push({pathname:'/finance/form',params:{type:tab==='revenue'?'revenue':'expense'}})}/>:undefined}/>
  <Segmented value={tab} onChange={setTab} options={[{value:'overview',label:t.overview},{value:'revenue',label:t.receivable},{value:'expense',label:t.payable}]}/>
 </View>;
 return <WorkspaceShell active="finance" title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:tab==='overview'?<Overview header={header} onTab={setTab} linkFailed={linkFailed} onWeb={()=>{setLinkFailed(false);void openFinanceWeb().catch(()=>setLinkFailed(true));}}/>:<Titles key={tab} kind={tab} header={header}/>}</WorkspaceShell>;
}

function Overview({header,onTab,onWeb,linkFailed}:{header:React.ReactElement;onTab:(tab:Tab)=>void;onWeb:()=>void;linkFailed:boolean}){
 const {controller,language}=useAuth();const t=financeMessages[language],w=workspaceMessages[language];
 const [days,setDays]=useState<'7'|'30'|'90'>('30');const [refreshing,setRefreshing]=useState(false);
 const stats=useQuery({queryKey:['finance-stats'],queryFn:({signal})=>controller.financeStats(signal)});
 const projection=useQuery({queryKey:['finance-projection',days],queryFn:({signal})=>controller.financeProjection(Number(days),signal)});
 const {refetch:refetchStats}=stats,{refetch:refetchProjection}=projection;
 useFocusEffect(useCallback(()=>{void refetchStats();void refetchProjection();},[refetchStats,refetchProjection]));
 const s=stats.data?.summary;
 const flow=stats.data?.cash_flow.reduce((acc,row)=>({in:acc.in+row.revenue,out:acc.out+row.expense}),{in:0,out:0});
 const top=stats.data?.expenses_by_category.slice(0,5)??[];
 const topMax=Math.max(1,...top.map(r=>r.value));
 const p=projection.data;
 return <ScrollView contentContainerStyle={ms.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await Promise.all([refetchStats(),refetchProjection()]);}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>}>
  {header}
  {stats.isPending?<SkeletonList rows={2}/>:stats.isError?<ErrorState message={denied(stats.error)?w.noAccess:w.error} language={language} onRetry={()=>void refetchStats()}/>:s&&<>
   <KpiStrip items={[{key:'b',label:t.balance,value:money(s.balance,language),tone:s.balance<0?'danger':undefined},{key:'r',label:t.receivable,value:money(s.receivable,language),tone:'success',onPress:()=>onTab('revenue')},{key:'p',label:t.payable,value:money(s.payable,language),tone:'warning',onPress:()=>onTab('expense')}]}/>
   <MetricGrid items={[{label:t.revenue,value:money(s.total_revenue,language),tone:'success'},{label:t.expense,value:money(s.total_expense,language),tone:'danger'},{label:t.result,value:money(s.total_revenue-s.total_expense,language),tone:s.total_revenue-s.total_expense<0?'danger':'success'}]}/>
   {flow&&<><SectionLabel title={t.cashFlow}/><MetricGrid columns={2} items={[{label:t.inflow,value:money(flow.in,language),tone:'success'},{label:t.outflow,value:money(flow.out,language),tone:'danger'}]}/></>}
   <SectionLabel title={t.topExpenses}/>
   {top.length?<View style={{gap:8}}>{top.map(row=><View key={row.name} accessible accessibilityLabel={`${row.name}: ${money(row.value,language)}`} style={{gap:6,padding:12,borderRadius:12,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface}}><View style={{flexDirection:'row',justifyContent:'space-between',gap:8}}><Text style={{flex:1,fontSize:14,fontWeight:'600',color:colors.text}} numberOfLines={2}>{row.name}</Text><Text style={{fontSize:14,fontWeight:'800',color:colors.forest,fontVariant:['tabular-nums']}}>{money(row.value,language)}</Text></View><View aria-hidden style={{height:6,borderRadius:3,backgroundColor:colors.track}}><View style={{height:6,borderRadius:3,width:`${Math.round(row.value/topMax*100)}%`,backgroundColor:colors.primary}}/></View></View>)}</View>:<Notice tone="neutral" text={t.noExpenses}/>}
  </>}
  <SectionLabel title={t.projection}/>
  <FilterChips value={days} onChange={setDays} options={(['7','30','90'] as const).map(value=>({value,label:`${value} ${t.days}`}))}/>
  {projection.isPending?<SkeletonList rows={1}/>:projection.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetchProjection()}/>:p&&<>
   <MetricGrid columns={2} items={[{label:t.opening,value:money(p.opening_balance,language)},{label:t.closing,value:money(p.closing_balance,language),tone:p.closing_balance<0?'danger':'success'}]}/>
   <Notice tone={p.first_negative_date?'danger':'success'} text={p.first_negative_date?`${t.negativeOn} ${day(p.first_negative_date,language)}`:t.noNegative}/>
   {p.unassigned_titles>0&&<Notice tone="warning" text={`${t.unassigned}: ${p.unassigned_titles}`}/>}
   <Text style={{fontSize:12,lineHeight:17,color:colors.muted}}>{t.projectionHint}</Text>
  </>}
  <WebFallback hint={t.webHint} label={t.web} failed={linkFailed?w.failedLink:undefined} onPress={onWeb}/>
 </ScrollView>;
}

function Titles({kind,header}:{kind:FinanceKind;header:React.ReactElement}){
 const {controller,language}=useAuth();const router=useRouter();const t=financeMessages[language],w=workspaceMessages[language];
 const [status,setStatus]=useState<''|FinanceStatus>('');const [search,setSearch]=useState('');
 const list=useInfinitePages<FinanceTransaction>({queryKey:['finance-transactions','infinite',kind,status,search],enabled:true,fetchPage:(page,signal)=>controller.financeTransactions({type:kind,status,search,page},signal)});
 const {refetch}=list;useFocusEffect(useCallback(()=>{void refetch();},[refetch]));
 const head=<View style={ms.header}>{header}
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
  <FilterChips value={status} onChange={setStatus} options={[{value:'' as const,label:t.all},{value:'pending' as const,label:t.pending},{value:'overdue' as const,label:t.overdue},{value:'paid' as const,label:t.paid},{value:'cancelled' as const,label:t.cancelled}]}/>
  {list.count!==undefined&&<Text style={{fontSize:12,color:colors.muted}}>{`${list.count} ${t.titles.toLowerCase()}`}</Text>}
  {list.isError&&!!list.rows.length&&<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>}
 </View>;
 return <FlatList<FinanceTransaction> data={list.rows} keyExtractor={row=>row.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={head}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><TransactionRow row={item} onPress={()=>router.push({pathname:'/finance/[id]',params:{id:item.id}})}/>}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={denied(list.error)?w.noAccess:w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>;
}
export function TransactionRow({row,onPress}:{row:FinanceTransaction;onPress:()=>void}){
 const {language}=useAuth();const t=financeMessages[language];
 const revenue=row.category_type==='revenue';
 return <ListRow meta={`${t.due} ${day(row.due_date,language)} · ${row.category_name}`} title={row.description} subtitle={[row.farm_name,row.series_number&&row.series_count?`${t.series} ${row.series_number}/${row.series_count}`:null].filter(Boolean).join(' · ')||undefined} value={`${revenue?'+':'−'} ${money(row.amount,language)}`} status={{label:t.statuses[row.status]??row.status,tone:statusTone(row.status)}} leading={<IconTile tone={revenue?'success':'warning'}><HomeIcon name={revenue?'trend':'wallet'} size={20} color={revenue?colors.success:colors.warning}/></IconTile>} onPress={onPress}/>;
}

export function TransactionDetailScreen(){
 const params=useLocalSearchParams();const id=z.uuid().safeParse(params.id);
 const {state,controller,language}=useAuth();const router=useRouter();const client=useQueryClient();const t=financeMessages[language],w=workspaceMessages[language];
 const allowed=id.success&&state.status==='signedIn'&&canReadFinance(state.session.user);
 const writable=state.status==='signedIn'&&canWriteFinance(state.session.user);
 const q=useQuery({queryKey:['finance-transaction',params.id],enabled:allowed,staleTime:0,queryFn:({signal})=>{if(!id.success)throw Error('id');return controller.financeTransaction(id.data,signal);}});
 const {refetch}=q;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const [sheet,setSheet]=useState<'settle'|'reverse'|null>(null);const [message,setMessage]=useState<{text:string;tone:StatusTone}|null>(null);const [refreshing,setRefreshing]=useState(false);
 const done=(text:string)=>{setSheet(null);setMessage({text,tone:'success'});for(const key of ['finance-transactions','finance-transaction','finance-stats','finance-projection','home'])void client.invalidateQueries({queryKey:[key]});void refetch();};
 const row=q.data;
 return <WorkspaceShell active="finance" title={t.detail} onBack={()=>router.canGoBack()?router.back():router.replace('/finance')}><ScrollView contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);try{await refetch();}finally{setRefreshing(false);}}} tintColor={colors.primary} colors={[colors.primary]}/>}>
  {!allowed?<EmptyState title={w.noAccess}/>:q.isPending?<SkeletonList rows={3}/>:q.isError||!row?<ErrorState message={denied(q.error)?w.noAccess:w.error} language={language} onRetry={()=>void refetch()}/>:<>
   <DetailHeader meta={`${row.category_name} · ${row.category_type==='revenue'?t.receivable:t.payable}`} title={row.description} leading={<IconTile tone={row.category_type==='revenue'?'success':'warning'}><HomeIcon name={row.category_type==='revenue'?'trend':'wallet'} size={22} color={row.category_type==='revenue'?colors.success:colors.warning}/></IconTile>} status={[{label:t.statuses[row.status]??row.status,tone:statusTone(row.status)}]}>
    <MetricGrid columns={2} items={[{label:t.amount,value:money(row.amount,language),tone:row.category_type==='revenue'?'success':'danger'},{label:row.payment_date?t.paidOn:t.due,value:day(row.payment_date??row.due_date,language)}]}/>
   </DetailHeader>
   {message&&<Notice tone={message.tone} text={message.text}/>}
   {writable&&canSettle(row)&&<AgendaButton variant="primary" label={row.category_type==='revenue'?t.settleRevenue:t.settleExpense} onPress={()=>{setMessage(null);setSheet('settle');}}/>}
   <InfoList rows={[[t.due,day(row.due_date,language)],[t.account,row.bank_account_name||null],[t.farm,row.farm_name||null],[t.origin,row.animal_batch_name||row.planting_cycle_name||row.species_name||null],[t.series,row.series_number&&row.series_count?`${row.series_number}/${row.series_count}`:null],[t.reference,row.reference||null],[t.method,row.payment_method?t.methods[row.payment_method]??row.payment_method:null],[t.notes,row.notes||null]]}/>
   <SectionLabel title={t.history}/>
   {row.payment_events.length?<View style={{gap:8}}>{row.payment_events.map(event=><ListRow key={event.id} meta={`${day(event.payment_date,language)}${event.created_by_name?` · ${t.by} ${event.created_by_name}`:''}`} title={event.kind==='payment'?t.payment:t.reversal} subtitle={[event.bank_account_name,event.payment_method?t.methods[event.payment_method]??event.payment_method:null,event.reason||null].filter(Boolean).join(' · ')||undefined} value={`${event.kind==='reversal'?'−':''}${money(event.amount,language)}`} leading={<IconTile tone={event.kind==='payment'?'success':'danger'}><HomeIcon name="wallet" size={18} color={colors.textSoft}/></IconTile>}/>)}</View>:<Notice tone="neutral" text={t.noHistory}/>}
   {writable&&canReverse(row)&&<><SectionLabel title={mobileUiMessages[language].actions}/><ActionGroup><ActionRow tone="danger" label={t.reverse} description={t.reverseHint} icon={<HomeIcon name="back" size={20} color={colors.error}/>} onPress={()=>{setMessage(null);setSheet('reverse');}}/></ActionGroup></>}
   <Notice tone="neutral" text={t.webHint}/>
   <SettleSheet visible={sheet==='settle'} row={row} onClose={()=>setSheet(null)} onDone={()=>done(t.settled)} onError={text=>{setSheet(null);setMessage({text,tone:'danger'});void refetch();}}/>
   <ReverseSheet visible={sheet==='reverse'} row={row} onClose={()=>setSheet(null)} onDone={()=>done(t.reversed)} onError={text=>{setSheet(null);setMessage({text,tone:'danger'});void refetch();}}/>
  </>}
 </ScrollView></WorkspaceShell>;
}

function failure(error:unknown,t:typeof financeMessages['pt-BR']){
 if(error instanceof FinanceChanged)return t.changed;
 if(isAxiosError(error)){if(!error.response)return t.uncertain;const data=error.response.data as {detail?:unknown}|Record<string,unknown>|undefined;const detail=data&&typeof data==='object'?Object.values(data).flat().filter(v=>typeof v==='string').join(' '):'';return detail||t.failed;}
 return t.failed;
}
function SettleSheet({visible,row,onClose,onDone,onError}:{visible:boolean;row:FinanceTransaction;onClose:()=>void;onDone:()=>void;onError:(text:string)=>void}){
 const {controller,language}=useAuth();const t=financeMessages[language],w=workspaceMessages[language];
 const accounts=useQuery({queryKey:['finance-accounts'],enabled:visible,queryFn:({signal})=>controller.financeAccounts(signal)});
 const [account,setAccount]=useState(row.bank_account??'');const [date,setDate]=useState(localToday());const [method,setMethod]=useState<PaymentMethod>('pix');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const key=useRef(randomUUID());
 const active=(accounts.data??[]).filter(a=>a.is_active);
 const submit=async()=>{if(busy)return;if(!account){setError(t.errAccount);return;}setBusy(true);setError('');try{await controller.settleFinanceTransaction(row.id,{bank_account:account,payment_date:date,payment_method:method,idempotency_key:key.current});onDone();}catch(e){onError(failure(e,t));}finally{setBusy(false);}};
 return <BottomSheet visible={visible} title={row.category_type==='revenue'?t.settleRevenue:t.settleExpense} onClose={busy?()=>undefined:onClose} language={language}><View style={{gap:12}}>
  <MetricGrid columns={2} items={[{label:t.amount,value:money(row.amount,language)},{label:t.due,value:day(row.due_date,language)}]}/>
  <Text style={ui.label}>{t.account}</Text>
  {accounts.isPending?<SkeletonList rows={2}/>:accounts.isError?<ErrorState message={w.error} language={language} onRetry={()=>void accounts.refetch()}/>:<View>{active.map(a=><SheetOption key={a.id} label={`${a.name} · ${money(a.current_balance,language)}`} selected={account===a.id} onPress={()=>{setAccount(a.id);setError('');}}/>)}</View>}
  <Text style={ui.label}>{t.paymentDate}</Text>
  <DateStepper value={date} max={localToday()} onChange={setDate} language={language}/>
  <Text style={ui.label}>{t.method}</Text>
  <FilterChips value={method} onChange={setMethod} options={paymentMethods.map(value=>({value,label:t.methods[value]??value}))}/>
  <Notice tone="info" text={t.settleHint}/>
  {!!error&&<Notice tone="danger" text={error}/>}
  <AgendaButton variant="primary" busy={busy} disabled={busy||accounts.isPending} label={t.confirmSettle} onPress={()=>void submit()}/>
 </View></BottomSheet>;
}
function ReverseSheet({visible,row,onClose,onDone,onError}:{visible:boolean;row:FinanceTransaction;onClose:()=>void;onDone:()=>void;onError:(text:string)=>void}){
 const {controller,language}=useAuth();const t=financeMessages[language];
 const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const key=useRef(randomUUID());
 const payment=activePayment(row);
 const submit=async()=>{if(busy)return;if(reason.trim().length<3){setError(t.errReason);return;}setBusy(true);setError('');try{await controller.reverseFinanceTransaction(row.id,{reason:reason.trim(),idempotency_key:key.current,...(payment?{payment:payment.id}:{})});onDone();}catch(e){onError(failure(e,t));}finally{setBusy(false);}};
 return <BottomSheet visible={visible} title={t.reverse} onClose={busy?()=>undefined:onClose} language={language}><View style={{gap:12}}>
  <MetricGrid columns={2} items={[{label:t.amount,value:money(payment?.amount??row.amount,language),tone:'danger'},{label:t.paidOn,value:day(payment?.payment_date??row.payment_date,language)}]}/>
  <Notice tone="warning" text={t.reverseHint}/>
  <FormField label={t.reason} error={error||undefined}><TextInput accessibilityLabel={t.reason} value={reason} onChangeText={setReason} maxLength={1000} multiline style={[ui.fieldControl,{minHeight:88,textAlignVertical:'top',paddingTop:12}]}/></FormField>
  <AgendaButton variant="primary" busy={busy} disabled={busy} label={t.confirmReverse} onPress={()=>void submit()}/>
 </View></BottomSheet>;
}

export function TransactionFormScreen(){
 const params=useLocalSearchParams();
 const {state,controller,language}=useAuth();const router=useRouter();const client=useQueryClient();const t=financeMessages[language],w=workspaceMessages[language];
 const allowed=state.status==='signedIn'&&canWriteFinance(state.session.user);
 const [kind,setKind]=useState<FinanceKind>(params.type==='revenue'?'revenue':'expense');
 const [description,setDescription]=useState('');const [amount,setAmount]=useState('');const [category,setCategory]=useState('');const [due,setDue]=useState(localToday());const [account,setAccount]=useState('');const [notes,setNotes]=useState('');
 const [sheet,setSheet]=useState<'category'|'account'|null>(null);const [errors,setErrors]=useState<Record<string,string>>({});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const categories=useQuery({queryKey:['finance-categories'],enabled:allowed,queryFn:({signal})=>controller.financeCategories(signal)});
 const accounts=useQuery({queryKey:['finance-accounts'],enabled:allowed,queryFn:({signal})=>controller.financeAccounts(signal)});
 const options=(categories.data??[]).filter(c=>c.is_active&&c.category_type===kind);
 const categoryName=options.find(c=>c.id===category)?.name;const accountRow=(accounts.data??[]).find(a=>a.id===account);
 const submit=async()=>{
  if(busy)return;const next:Record<string,string>={};
  if(!description.trim())next.description=t.errDescription;
  const normalized=amount.trim().replace(/\./g,'').replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(normalized)||Number(normalized)<=0)next.amount=t.errAmount;
  if(!category)next.category=t.errCategory;
  setErrors(next);if(Object.keys(next).length)return;
  setBusy(true);setMessage('');
  try{const saved=await controller.createFinanceTransaction({description,amount,category,due_date:due,bank_account:account||null,farm:null,notes});for(const key of ['finance-transactions','finance-stats','finance-projection','home'])void client.invalidateQueries({queryKey:[key]});router.replace({pathname:'/finance/[id]',params:{id:saved.id}});}
  catch(e){setMessage(failure(e,t));}finally{setBusy(false);}
 };
 return <WorkspaceShell active="finance" title={t.newTitle} layout="form" onBack={()=>{if(!busy){if(router.canGoBack())router.back();else router.replace('/finance');}}}><ScrollView contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled">
  {!allowed?<EmptyState title={w.noAccess}/>:<>
   <ScreenIntro title={kind==='revenue'?t.newRevenue:t.newExpense} subtitle={t.createHint}/>
   <Segmented value={kind} onChange={value=>{setKind(value);setCategory('');}} options={[{value:'expense',label:t.payable},{value:'revenue',label:t.receivable}]}/>
   <FormField label={t.description} error={errors.description}><TextInput accessibilityLabel={t.description} value={description} onChangeText={setDescription} maxLength={255} style={ui.fieldControl} returnKeyType="next"/></FormField>
   <FormField label={t.amount} unit="R$" error={errors.amount}><TextInput accessibilityLabel={t.amount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" selectTextOnFocus style={[ui.fieldControl,{fontVariant:['tabular-nums']}]} placeholder="0,00" placeholderTextColor={colors.muted}/></FormField>
   <View style={{gap:6}}><Text style={ui.label}>{t.category}</Text><SelectChip label={t.chooseCategory} value={categoryName} active={!!category} onPress={()=>setSheet('category')}/>{!!errors.category&&<Text accessibilityRole="alert" style={{fontSize:13,fontWeight:'600',color:colors.danger}}>{errors.category}</Text>}</View>
   <View style={{gap:6}}><Text style={ui.label}>{t.due}</Text><DateStepper value={due} onChange={setDue} language={language}/></View>
   <View style={{gap:6}}><Text style={ui.label}>{`${t.account} · ${t.optional}`}</Text><SelectChip label={t.noAccount} value={accountRow?.name} active={!!account} onPress={()=>setSheet('account')}/></View>
   <FormField label={`${t.notes} · ${t.optional}`}><TextInput accessibilityLabel={t.notes} value={notes} onChangeText={setNotes} maxLength={2000} multiline style={[ui.fieldControl,{minHeight:80,textAlignVertical:'top',paddingTop:12}]}/></FormField>
   {!!message&&<Notice tone="danger" text={message}/>}
   <AgendaButton variant="primary" busy={busy} disabled={busy} label={t.save} onPress={()=>void submit()}/>
   <BottomSheet visible={sheet==='category'} title={t.chooseCategory} onClose={()=>setSheet(null)} language={language}>
    {categories.isPending?<SkeletonList rows={3}/>:categories.isError?<ErrorState message={w.error} language={language} onRetry={()=>void categories.refetch()}/>:options.length?options.map(c=><SheetOption key={c.id} label={c.name} selected={category===c.id} onPress={()=>{setCategory(c.id);setErrors(e=>({...e,category:''}));setSheet(null);}}/>):<EmptyState title={t.empty} description={t.webHint}/>}
   </BottomSheet>
   <BottomSheet visible={sheet==='account'} title={t.account} onClose={()=>setSheet(null)} language={language}>
    <SheetOption label={t.noAccount} selected={!account} onPress={()=>{setAccount('');setSheet(null);}}/>
    {(accounts.data??[]).filter(a=>a.is_active).map(a=><SheetOption key={a.id} label={a.name} selected={account===a.id} onPress={()=>{setAccount(a.id);setSheet(null);}}/>)}
   </BottomSheet>
  </>}
 </ScrollView></WorkspaceShell>;
}
