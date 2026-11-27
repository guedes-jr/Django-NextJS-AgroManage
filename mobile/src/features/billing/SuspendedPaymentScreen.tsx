import {useState} from 'react';
import {Image,Linking,ScrollView,Share,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {AgendaButton} from '../agenda/ui';
import {ErrorState,Notice,SectionLabel,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {colors,radius,space,type} from '../../theme/tokens';
import {canReadOrganization,invoiceState,paymentMethods,safePaymentUrl,type InvoicePayment,type PaymentMethod} from '../organization/contracts';
import {billingMessages} from './messages';

/** Only screen while the subscription is suspended for non-payment (no navigation, no other module). */
export function SuspendedPaymentScreen(){
 const {state,controller,language}=useAuth();const t=billingMessages[language];
 const user=state.status==='signedIn'?state.session.user:null;const canPay=!!user&&canReadOrganization(user);
 const inv=useQuery({queryKey:['plan-invoices','suspended'],enabled:canPay,queryFn:({signal})=>controller.planInvoices(signal)});
 const [selected,setSelected]=useState<{invoice:string;method:PaymentMethod}|null>(null);
 const [option,setOption]=useState<InvoicePayment|null>(null);const [optionState,setOptionState]=useState<'idle'|'loading'|'error'>('idle');
 const [notice,setNotice]=useState('');const [checking,setChecking]=useState(false);
 const money=(v:string)=>new Intl.NumberFormat(language,{style:'currency',currency:'BRL'}).format(Number(v));
 const date=(v:string)=>v?new Date(v.length===10?`${v}T12:00:00`:v).toLocaleDateString(language):'';
 const open=async(url:string)=>{const safe=safePaymentUrl(url);try{if(!safe)throw Error('url');await Linking.openURL(safe);}catch{setNotice(t.openFailed);}};
 const choose=async(invoice:string,method:PaymentMethod)=>{setSelected({invoice,method});setOption(null);setOptionState('loading');setNotice('');
  try{setOption(await controller.invoicePayment(invoice,method));setOptionState('idle');}catch{setOptionState('error');}};
 const check=async()=>{setChecking(true);setNotice('');try{await controller.refreshAccess();}finally{setChecking(false);}setNotice(t.stillSuspended);};
 const label:Record<PaymentMethod,string>={pix:t.pix,boleto:t.boleto,credit_card:t.card};
 const openInvoices=inv.data?.results.filter(row=>{const st=invoiceState(row);return (st==='open'||st==='overdue')&&Number(row.balance)>0;})??[];
 return <SafeAreaView style={{flex:1,backgroundColor:colors.background}} edges={['top','bottom','left','right']}>
  <ScrollView contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled">
   <Text accessibilityRole="header" style={type.screenTitle}>{t.heading}</Text>
   <Text style={type.body}>{canPay?t.lead:t.memberLead}</Text>
   {canPay&&<>
    {inv.isPending?<SkeletonList rows={2}/>:inv.isError?<ErrorState message={t.error} language={language} onRetry={()=>void inv.refetch()}/>:!openInvoices.length?<Notice tone="info" text={t.noInvoices}/>:openInvoices.map(row=><View key={row.id} style={{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:space.lg,gap:space.sm,backgroundColor:colors.surface}}>
     <Text style={type.meta}>{t.due} {date(row.due_date)} · {t.invoice} {row.number}</Text>
     <Text style={[type.sectionTitle,type.numeric]}>{money(row.balance)}</Text>
     <SectionLabel title={t.choose}/>
     {paymentMethods.map(method=><AgendaButton key={method} label={label[method]} selected={selected?.invoice===row.id&&selected.method===method} disabled={optionState==='loading'} variant={selected?.invoice===row.id&&selected.method===method?'primary':'secondary'} onPress={()=>void choose(row.id,method)}/>)}
     {selected?.invoice===row.id&&<View style={{gap:space.sm}} accessibilityLiveRegion="polite">
      {optionState==='loading'&&<Text style={type.meta}>{t.loading}</Text>}
      {optionState==='error'&&<Notice tone="danger" text={t.optionError}/>}
      {option?.method==='boleto'&&<>
       {!!option.due_date&&<Text style={type.meta}>{t.newDue}: {date(option.due_date)}</Text>}
       {!!option.digitable_line&&<><Text style={type.meta}>{t.line}</Text><Text selectable style={[type.body,type.numeric]}>{option.digitable_line}</Text><AgendaButton label={t.share} onPress={()=>void Share.share({message:option.digitable_line})}/></>}
       {!!safePaymentUrl(option.bank_slip_url)&&<AgendaButton variant="primary" label={t.openBoleto} onPress={()=>void open(option.bank_slip_url)}/>}
      </>}
      {option?.method==='pix'&&<>
       {!!option.pix_qr_image&&<Image accessibilityLabel={t.pix} source={{uri:`data:image/png;base64,${option.pix_qr_image}`}} style={{width:220,height:220,alignSelf:'center',borderRadius:radius.sm}}/>}
       <Text style={type.meta}>{t.pixHelp}</Text>
       {!!option.pix_copy_paste&&<><Text style={type.meta}>{t.pixCode}</Text><Text selectable style={type.caption}>{option.pix_copy_paste}</Text><AgendaButton variant="primary" label={t.share} onPress={()=>void Share.share({message:option.pix_copy_paste})}/></>}
       {!!option.expires_at&&<Text style={type.caption}>{t.expires} {date(option.expires_at)}</Text>}
      </>}
      {option?.method==='credit_card'&&<>
       <Text style={type.meta}>{t.cardHelp}</Text>
       {!!safePaymentUrl(option.payment_url)&&<AgendaButton variant="primary" label={t.payCard} onPress={()=>void open(option.payment_url)}/>}
      </>}
     </View>}
    </View>)}
    {!!notice&&<Notice tone="info" text={notice}/>}
    <AgendaButton label={t.check} busy={checking} disabled={checking} onPress={()=>void check()}/>
   </>}
   <AgendaButton label={t.logout} onPress={()=>void controller.signOut()}/>
   <Text style={type.caption}>{t.support}</Text>
  </ScrollView>
 </SafeAreaView>;
}
