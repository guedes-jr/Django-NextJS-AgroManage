import {useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {useRouter} from 'expo-router';
import {useAuth} from '../auth/AuthProvider';
import {isTrialExpired} from '../auth/contracts';
import {AgendaButton,styles as ui} from '../agenda/ui';
import {AgendaShell} from '../workspace/AppShell';
import {ErrorState,Notice,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {firstApiMessage} from '../../services/authApi';
import {colors,radius,space,type} from '../../theme/tokens';
import {paymentMethods,type PaymentMethod} from '../organization/contracts';
import {fill,onboardingMessages} from './messages';

/** Free trial over (only screen of the app) or, from Início during the trial, payment method and early subscription. */
export function SubscribeScreen(){
 const {state,controller,language}=useAuth();const t=onboardingMessages[language];const router=useRouter();
 const user=state.status==='signedIn'?state.session.user:null;
 const expired=!!user&&isTrialExpired(user);const isAdmin=user?.access.role==='admin';
 const org=useQuery({queryKey:['organization','subscribe'],enabled:isAdmin,queryFn:({signal})=>controller.myOrganization(signal)});
 const subscription=org.data?.subscription as (NonNullable<NonNullable<typeof org.data>['subscription']>&{preferred_payment_method?:string;trial_ends_at?:string|null})|null|undefined;
 const saved=paymentMethods.find(m=>m===subscription?.preferred_payment_method);
 const [picked,setPicked]=useState<PaymentMethod|null>(null);const method=picked??saved??null;
 const [busy,setBusy]=useState<''|'save'|'subscribe'>('');
 const [message,setMessage]=useState<{tone:'success'|'danger'|'info';text:string}|null>(null);
 const money=(v:string|number)=>new Intl.NumberFormat(language,{style:'currency',currency:'BRL'}).format(Number(v));
 const label:Record<PaymentMethod,string>={pix:t.pix,boleto:t.boleto,credit_card:t.card};
 const failure=(error:unknown)=>firstApiMessage((error as {response?:{data?:unknown}})?.response?.data)??t.subscribeError;
 const save=async()=>{if(!method){setMessage({tone:'danger',text:t.chooseMethod});return;}setBusy('save');setMessage(null);
  try{await controller.savePaymentMethod(method);setMessage({tone:'success',text:t.methodSaved});}catch(error){setMessage({tone:'danger',text:failure(error)});}finally{setBusy('');}};
 const confirm=async()=>{if(!method){setMessage({tone:'danger',text:t.chooseMethod});return;}setBusy('subscribe');setMessage(null);
  try{const {invoice}=await controller.confirmSubscription(method);setMessage({tone:'success',text:invoice?fill(t.invoiceReady,{number:invoice.number,amount:money(invoice.total)}):t.noInvoice});
   // Blocking stage: the refreshed access already opens the app. From the route, go back to Início.
   if(!expired)router.replace('/');}
  catch(error){setMessage({tone:'danger',text:failure(error)});}finally{setBusy('');}};
 const trialEnd=subscription?.trial_ends_at??user?.access.trial_ends_at;
 const price=subscription?.price;
 const body=<>
  <Text accessibilityRole="header" style={type.screenTitle}>{expired?t.subscribeTitle:t.subscribeTrialTitle}</Text>
  <Text style={type.body}>{!isAdmin?t.subscribeMember:expired?t.subscribeLead:fill(t.subscribeTrialLead,{date:trialEnd?new Date(trialEnd).toLocaleDateString(language):''})}</Text>
  {isAdmin&&(org.isPending?<SkeletonList rows={3}/>:org.isError?<ErrorState message={t.subscribeError} language={language} onRetry={()=>void org.refetch()}/>:<>
   {price&&<View style={ui.card}>
    <Text accessibilityRole="header" style={type.sectionTitle}>{t.yourSubscription}</Text>
    {price.lines.map(line=><View key={line.segment_code||line.name} style={st.line}><View style={{flex:1}}><Text style={type.recordTitle}>{line.name}</Text><Text style={type.meta}>{line.tier_label}</Text></View>
     <Text style={[type.body,type.numeric,{fontWeight:'700'}]}>{line.on_request?t.onRequest:`${money(line.total)}${t.perMonth}`}</Text></View>)}
    {Number(price.discount_total)>0&&<View style={st.line}><Text style={[type.meta,{flex:1}]}>{t.discounts}</Text><Text style={[type.meta,type.numeric]}>− {money(price.discount_total)}</Text></View>}
    <View style={st.total}><Text style={[type.body,{flex:1,fontWeight:'700'}]}>{t.monthlyTotal}</Text><Text style={[type.sectionTitle,type.numeric]}>{money(price.total)}</Text></View>
    {subscription?.billing_cycle==='yearly'&&<View style={st.line}><Text style={[type.meta,{flex:1}]}>{t.cycleTotal}</Text><Text style={[type.body,type.numeric,{fontWeight:'700'}]}>{money(Number(price.total)*12)}</Text></View>}
    <Text style={type.caption}>{t.changeSegments}</Text>
   </View>}
   <Text style={ui.label}>{t.method}</Text>
   {paymentMethods.map(code=><AgendaButton key={code} label={label[code]} selected={method===code} variant={method===code?'primary':'secondary'} onPress={()=>{setPicked(code);setMessage(null);}}/>)}
   <Text style={type.meta}>{t.methodHint}</Text>
   {message&&<Notice tone={message.tone} text={message.text}/>}
   <AgendaButton variant="primary" label={expired?t.subscribe:t.subscribeNow} busy={busy==='subscribe'} disabled={!!busy} onPress={()=>void confirm()}/>
   {!expired&&<AgendaButton label={t.saveMethod} busy={busy==='save'} disabled={!!busy} onPress={()=>void save()}/>}
  </>)}
  {(expired||!isAdmin)&&<AgendaButton label={isAdmin?t.decline:t.logout} disabled={!!busy} onPress={()=>void controller.signOut()}/>}
 </>;
 if(!expired)return <AgendaShell title={t.subscribeTrialTitle} backLabel={t.close} onBack={()=>{if(router.canGoBack())router.back();else router.replace('/');}}><ScrollView contentContainerStyle={[ms.list,{width:'100%',maxWidth:720,alignSelf:'center'}]}>{body}</ScrollView></AgendaShell>;
 return <SafeAreaView style={{flex:1,backgroundColor:colors.background}} edges={['top','bottom','left','right']}>
  <ScrollView contentContainerStyle={[ms.list,{width:'100%',maxWidth:720,alignSelf:'center'}]}>{body}</ScrollView>
 </SafeAreaView>;
}

const st={
 line:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:space.sm,paddingVertical:space.xs} as const,
 total:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:space.sm,padding:space.md,borderRadius:radius.md,backgroundColor:colors.soft} as const,
};
