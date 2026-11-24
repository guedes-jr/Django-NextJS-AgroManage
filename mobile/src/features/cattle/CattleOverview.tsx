import {operationMessages} from './operationMessages';
import {canReadManagements} from './managementContracts';
import {managementMessages} from './managementMessages';
import {pastureMessages} from './pastureMessages';
import {reproductionMessages} from './reproductionMessages';
import {feedingMessages} from '../feeding/messages';
import {useCallback} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {colors} from '../../theme/tokens';
import {ActionGroup,ActionRow,ErrorState,KpiStrip,MetricGrid,SectionLabel,SkeletonList,mobileUiMessages} from '../../components/mobile';
import {DairyIcon,type DairyIconName} from './DairyIcon';
import {canReadCattleSales} from './saleContracts';
import {saleMessages} from './saleMessages';
import {batchMessages} from './batchMessages';
import {cattleMessages,cattleLabel} from './messages';
import type {Production} from './contracts';
export function CattleOverview({production,farm}:{production:Production;farm?:string}){
 const {state,controller,language}=useAuth();const router=useRouter();const b=batchMessages[language];const w=workspaceMessages[language];const t=cattleMessages[language];
 const q=useQuery({queryKey:['cattle-overview',production,farm],queryFn:({signal})=>controller.cattleOverview(production,farm,signal)});
 const {refetch}=q;useFocusEffect(useCallback(()=>{void refetch();},[refetch]));
 const data=q.isError?undefined:q.data;
 const routes:{key:string;label:string;icon:DairyIconName;onPress:()=>void}[]=[
  {key:'ops',label:operationMessages[language].title,icon:'clipboard',onPress:()=>router.push({pathname:'/cattle/[production]/operations',params:{production,...(farm?{farm}:{})}})},
  ...(state.status==='signedIn'&&canReadManagements(state.session.user)?[{key:'man',label:managementMessages[language].title,icon:'clipboard' as const,onPress:()=>router.push({pathname:'/cattle/[production]/managements',params:{production,...(farm?{farm}:{})}})}]:[]),
  {key:'pas',label:pastureMessages[language].title,icon:'pasture',onPress:()=>router.push({pathname:'/cattle/[production]/pastures',params:{production,...(farm?{farm}:{})}})},
  {key:'feed',label:feedingMessages[language].title,icon:'wheat',onPress:()=>router.push({pathname:'/feeding',params:{production}})},
  {key:'rep',label:reproductionMessages[language].title,icon:'reproduction',onPress:()=>router.push({pathname:'/cattle/[production]/reproduction',params:{production,...(farm?{farm}:{})}})},
  ...(state.status==='signedIn'&&canReadCattleSales(state.session.user)?[{key:'sales',label:saleMessages[language].title,icon:'wallet' as const,onPress:()=>router.push({pathname:'/cattle/[production]/sales',params:{production}})}]:[]),
 ];
 const number=(v:number|string|null)=>v===null?'—':new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(v));
 return <View style={{gap:12}}>
  {q.isPending?<SkeletonList rows={1}/>:q.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:data&&<>
   <KpiStrip items={[{key:'h',label:b.heads,value:number(data.total_head)},{key:'b',label:b.batches,value:number(data.active_batches)},{key:'w',label:b.average,value:data.average_identified_weight===null?'—':`${number(data.average_identified_weight)} kg`}]}/>
   <MetricGrid columns={3} items={[{label:b.identified,value:number(data.identified_animals)},{label:b.pregnant,value:number(data.pregnant_females)},{label:b.lactating,value:number(data.lactating_females)}]}/>
   {!!data.categories.length&&<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{data.categories.map(c=><View key={c.category} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:999,backgroundColor:colors.primarySoft}}><Text style={{fontSize:13,fontWeight:'600',color:colors.textSoft}}>{cattleLabel(t,c.category)} · <Text style={{fontWeight:'800',color:colors.forest}}>{number(c.quantity)}</Text></Text></View>)}</ScrollView>}
  </>}
  <SectionLabel title={mobileUiMessages[language].actions}/>
  <ActionGroup>{routes.map(r=><ActionRow key={r.key} label={r.label} icon={<DairyIcon name={r.icon} size={20}/>} onPress={r.onPress}/>)}</ActionGroup>
 </View>;
}
