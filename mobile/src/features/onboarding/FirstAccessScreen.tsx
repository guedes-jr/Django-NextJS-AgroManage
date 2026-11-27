import {useEffect,useMemo,useState} from 'react';
import {KeyboardAvoidingView,Linking,Platform,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {AgendaButton,styles as ui} from '../agenda/ui';
import {ErrorState,Notice,Segmented,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {legalUrls} from '../../config/environment';
import {firstApiMessage} from '../../services/authApi';
import {colors,radius,space,type} from '../../theme/tokens';
import {buildSelection,isSized,tierFor,type BillingCycle,type OnboardingSummary} from './contracts';
import {fill,onboardingMessages} from './messages';

/** Only screen while a self-service signup has not chosen its segments and accepted the terms. */
export function FirstAccessScreen(){
 const {controller,language}=useAuth();const t=onboardingMessages[language];
 const data=useQuery({queryKey:['onboarding'],queryFn:async({signal})=>{const [state,catalog]=await Promise.all([controller.onboardingState(signal),controller.planCatalog(signal)]);return {state,catalog:catalog.filter(s=>s.tiers.length>0)};}});
 const [step,setStep]=useState<1|2|3>(1);
 const [chosen,setChosen]=useState<Record<string,string>>({});
 const [cycle,setCycle]=useState<BillingCycle>('monthly');
 const [couponInput,setCouponInput]=useState('');const [coupon,setCoupon]=useState('');
 const [result,setResult]=useState<{key:string;summary?:OnboardingSummary;error?:string}|null>(null);
 const [stepError,setStepError]=useState('');const [accepted,setAccepted]=useState(false);
 const [submitting,setSubmitting]=useState(false);const [submitError,setSubmitError]=useState('');
 const money=(v:string|number)=>new Intl.NumberFormat(language,{style:'currency',currency:'BRL'}).format(Number(v));
 const catalog=data.data?.catalog;const state=data.data?.state;
 const selection=useMemo(()=>catalog?buildSelection(catalog,chosen):null,[catalog,chosen]);
 const requestKey=selection&&state?.can_complete?JSON.stringify({selection,cycle,coupon}):'';
 // Server price (single price path), keyed by request so an older answer never replaces a newer selection.
 useEffect(()=>{
  if(!requestKey||!selection)return;const abort=new AbortController();
  const timer=setTimeout(()=>{controller.onboardingPreview(selection,cycle,coupon,abort.signal).then(summary=>setResult({key:requestKey,summary})).catch(error=>{if(!abort.signal.aborted)setResult({key:requestKey,error:firstApiMessage((error as {response?:{data?:unknown}})?.response?.data)??t.previewError});});},350);
  return()=>{abort.abort();clearTimeout(timer);};
 },[controller,requestKey,selection,cycle,coupon,t.previewError]);
 const current=result&&result.key===requestKey?result:null;
 const summary=requestKey?(current?.summary??result?.summary??null):null;
 const loading=!!requestKey&&!current;
 const go=(next:1|2|3)=>{setStepError('');
  if(next>1&&!Object.keys(chosen).length){setStepError(t.noSegment);return;}
  if(next>1&&!selection){setStepError(t.missingQuantity);return;}
  setStep(next);};
 const toggle=(code:string)=>setChosen(value=>{const next={...value};if(code in next)delete next[code];else next[code]='';return next;});
 const open=(url?:string)=>{if(url)void Linking.openURL(url).catch(()=>{});};
 const confirm=async()=>{
  if(!accepted){setSubmitError(t.mustAccept);return;}
  if(!selection||!state||submitting)return;setSubmitting(true);setSubmitError('');
  try{await controller.onboardingComplete(selection,cycle,coupon,state.terms_version);}
  catch(error){setSubmitError(firstApiMessage((error as {response?:{data?:unknown}})?.response?.data)??t.completeError);setSubmitting(false);}
 };

 const frame=(children:React.ReactNode)=><SafeAreaView style={{flex:1,backgroundColor:colors.background}} edges={['top','bottom','left','right']}>
  <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
   <ScrollView key={step} contentContainerStyle={[ms.list,{width:'100%',maxWidth:720,alignSelf:'center'}]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
  </KeyboardAvoidingView>
 </SafeAreaView>;

 if(data.isPending)return frame(<SkeletonList rows={4}/>);
 if(data.isError||!state||!catalog)return frame(<><ErrorState message={t.loadError} language={language} onRetry={()=>void data.refetch()}/><AgendaButton label={t.logout} onPress={()=>void controller.signOut()}/></>);
 if(!state.can_complete)return frame(<>
  <Text accessibilityRole="header" style={type.screenTitle}>{t.memberTitle}</Text><Text style={type.body}>{t.memberLead}</Text>
  <AgendaButton label={t.check} onPress={()=>void controller.refreshAccess()}/><AgendaButton label={t.logout} onPress={()=>void controller.signOut()}/>
 </>);

 const price=summary?.price;const urls=legalUrls(process.env.EXPO_PUBLIC_SITE_URL,__DEV__);
 const cycleLabel=cycle==='yearly'?t.yearly:t.monthly;
 const totals=<View style={ui.card} accessibilityLiveRegion="polite">
  <Text accessibilityRole="header" style={type.sectionTitle}>{t.summaryTitle}</Text>
  {!selection?<Text style={type.meta}>{Object.keys(chosen).length?t.missingQuantity:t.noSegment}</Text>:!price?(current?.error?null:<Text style={type.meta}>{t.calculating}</Text>):<>
   {price.lines.map(line=><View key={line.segment_code} style={st.line}>
    <View style={{flex:1}}><Text style={type.recordTitle}>{line.name}</Text><Text style={type.meta}>{line.tier_label}{line.quantity?` · ${line.quantity}`:''}</Text></View>
    <Text style={[type.body,type.numeric,{fontWeight:'700'}]}>{line.on_request?t.onRequest:`${money(line.total)}${t.perMonth}`}</Text>
   </View>)}
   {Number(price.discount_total)>0&&<View style={st.line}><Text style={[type.meta,{flex:1}]}>{t.discounts}</Text><Text style={[type.meta,type.numeric]}>− {money(price.discount_total)}</Text></View>}
   <View style={st.total}><Text style={[type.body,{flex:1,fontWeight:'700'}]}>{t.monthlyTotal}</Text><Text style={[type.sectionTitle,type.numeric]}>{money(price.total)}</Text></View>
   {summary.months===12&&<View style={st.line}><Text style={[type.meta,{flex:1}]}>{t.cycleTotal}</Text><Text style={[type.body,type.numeric,{fontWeight:'700'}]}>{money(summary.cycle_total)}</Text></View>}
   {summary.unpriced.length>0&&<Text style={type.meta}>{fill(t.unpriced,{names:summary.unpriced.join(', ')})}</Text>}
   <Text style={[type.meta,{color:colors.success,fontWeight:'600'}]}>{fill(t.trialNote,{date:new Date(summary.trial_ends_at).toLocaleDateString(language)})}</Text>
  </>}
  {loading&&!!price&&<Text style={type.caption}>{t.calculating}</Text>}
  {!!current?.error&&<Notice tone="danger" text={current.error}/>}
 </View>;

 return frame(<>
  <Text style={[type.meta,{color:colors.primary,fontWeight:'800'}]}>{t.eyebrow} · {fill(t.stepOf,{current:step})}</Text>
  <Text accessibilityRole="header" style={type.screenTitle}>{step===1?t.title:step===2?t.summaryTitle:t.termsTitle}</Text>
  {step===1&&<>
   <Text style={type.body}>{fill(t.lead,{days:state.trial_days})}</Text>
   <Text accessibilityRole="header" style={type.sectionTitle}>{t.segmentsTitle}</Text>
   <Text style={type.meta}>{t.segmentsHint}</Text>
   {catalog.map(segment=>{const selected=segment.code in chosen;const sized=isSized(segment);const quantity=Number.parseInt(chosen[segment.code]??'',10);const tier=selected?tierFor(segment,sized?quantity:null):null;
    return <View key={segment.code} style={[ui.card,selected&&{borderColor:colors.primary}]}>
     <Pressable accessibilityRole="checkbox" accessibilityState={{checked:selected}} onPress={()=>toggle(segment.code)} style={st.check}>
      <View style={[st.box,selected&&st.boxOn]}>{selected&&<Text style={st.tick}>✓</Text>}</View>
      <View style={{flex:1}}><Text style={type.recordTitle}>{segment.name}</Text>{!!segment.subtitle&&<Text style={type.meta}>{segment.subtitle}</Text>}</View>
     </Pressable>
     {selected&&sized&&<View style={{gap:space.xs}}><Text style={ui.label}>{fill(t.quantity,{metric:segment.metric_label||t.units})}</Text>
      <TextInput style={ui.input} keyboardType="number-pad" inputMode="numeric" value={chosen[segment.code]} accessibilityLabel={fill(t.quantity,{metric:segment.metric_label||t.units})}
       onChangeText={value=>setChosen(c=>({...c,[segment.code]:value.replace(/\D/g,'')}))}/></View>}
     {tier&&<View style={st.line}><Text style={[type.meta,{flex:1}]}>{fill(t.tier,{tier:tier.label})}</Text><Text style={[type.body,type.numeric,{fontWeight:'700'}]}>{tier.requires_quote||tier.monthly_price===null?t.onRequest:`${money(tier.monthly_price)}${t.perMonth}`}</Text></View>}
     {tier&&(tier.requires_quote||tier.monthly_price===null)&&<Text style={type.caption}>{t.onRequestHint}</Text>}
    </View>;})}
   {totals}
  </>}
  {step===2&&<>
   <Text style={ui.label}>{t.cycle}</Text>
   <Segmented value={cycle} onChange={setCycle} options={[{value:'monthly',label:t.monthly},{value:'yearly',label:t.yearly}]}/>
   {cycle==='yearly'&&<Text style={type.meta}>{t.yearlyHint}</Text>}
   <Text style={ui.label}>{t.coupon}</Text>
   <TextInput style={ui.input} value={couponInput} onChangeText={setCouponInput} placeholder={t.couponPlaceholder} placeholderTextColor={colors.muted} autoCapitalize="characters" autoCorrect={false} accessibilityLabel={t.coupon}/>
   {coupon&&coupon===couponInput.trim()
    ?<AgendaButton label={t.removeCoupon} onPress={()=>{setCoupon('');setCouponInput('');}}/>
    :<AgendaButton label={t.applyCoupon} disabled={!couponInput.trim()} onPress={()=>setCoupon(couponInput.trim())}/>}
   {!!coupon&&current?.summary?.coupon_applied&&<Notice tone="success" text={t.couponApplied}/>}
   {!!coupon&&!!current?.summary?.coupon_error&&<Notice tone="danger" text={current.summary.coupon_error}/>}
   {totals}
  </>}
  {step===3&&<>
   {[fill(t.termTrial,{days:state.trial_days}),t.termEnd,fill(t.termPrice,{cycle:cycleLabel}),t.termTier,t.termChange,t.termPolicies].map((text,index)=><View key={index} style={{flexDirection:'row',gap:space.sm}}>
    <Text style={[type.body,type.numeric,{fontWeight:'700'}]}>{index+1}.</Text><Text style={[type.body,{flex:1}]}>{text}</Text></View>)}
   {urls&&<><AgendaButton label={`${t.termsLink} ↗`} onPress={()=>open(urls.terms)}/><AgendaButton label={`${t.privacyLink} ↗`} onPress={()=>open(urls.privacy)}/></>}
   <Pressable accessibilityRole="checkbox" accessibilityState={{checked:accepted}} onPress={()=>{setAccepted(v=>!v);setSubmitError('');}} style={[st.check,st.accept]}>
    <View style={[st.box,accepted&&st.boxOn]}>{accepted&&<Text style={st.tick}>✓</Text>}</View><Text style={[type.body,{flex:1,fontWeight:'600'}]}>{t.accept}</Text>
   </Pressable>
   {!!submitError&&<Notice tone="danger" text={submitError}/>}
  </>}
  {!!stepError&&<Notice tone="warning" text={stepError}/>}
  {step<3&&<AgendaButton variant="primary" label={t.next} onPress={()=>go((step+1) as 2|3)}/>}
  {step===3&&<AgendaButton variant="primary" label={t.confirm} busy={submitting} disabled={submitting||loading||!summary} onPress={()=>void confirm()}/>}
  {step>1&&<AgendaButton label={t.back} disabled={submitting} onPress={()=>go((step-1) as 1|2)}/>}
  <AgendaButton label={t.logout} disabled={submitting} onPress={()=>void controller.signOut()}/>
 </>);
}

const st={
 line:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:space.sm,paddingVertical:space.xs} as const,
 total:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:space.sm,padding:space.md,borderRadius:radius.md,backgroundColor:colors.soft} as const,
 check:{minHeight:44,flexDirection:'row',alignItems:'center',gap:space.md} as const,
 accept:{padding:space.md,borderRadius:radius.md,backgroundColor:colors.soft} as const,
 box:{width:24,height:24,borderRadius:6,borderWidth:2,borderColor:colors.primary,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface} as const,
 boxOn:{backgroundColor:colors.primary} as const,
 tick:{color:colors.surface,fontSize:15,fontWeight:'800'} as const,
};
