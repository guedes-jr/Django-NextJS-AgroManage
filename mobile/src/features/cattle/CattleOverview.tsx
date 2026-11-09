import {operationMessages} from './operationMessages';
import {canReadManagements} from './managementContracts';
import {managementMessages} from './managementMessages';
import {pastureMessages} from './pastureMessages';
import {reproductionMessages} from './reproductionMessages';
import {feedingMessages} from '../feeding/messages';
import {useCallback} from 'react';
import {Text,View} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,Busy,styles as s} from '../agenda/ui';
import {batchMessages} from './batchMessages';
import {cattleMessages,cattleLabel} from './messages';
import type {Production} from './contracts';
export function CattleOverview({production,farm}:{production:Production;farm?:string}){
 const {state,controller,language}=useAuth();const router=useRouter();const b=batchMessages[language];const w=workspaceMessages[language];const t=cattleMessages[language];
 const q=useQuery({queryKey:['cattle-overview',production,farm],queryFn:({signal})=>controller.cattleOverview(production,farm,signal)});
 const {refetch}=q;useFocusEffect(useCallback(()=>{void refetch();},[refetch]));
 const data=q.isError?undefined:q.data;
 return <View style={s.card}><AgendaButton label={operationMessages[language].title} onPress={()=>router.push({pathname:'/cattle/[production]/operations',params:{production,...(farm?{farm}:{})}})}/>{state.status==='signedIn'&&canReadManagements(state.session.user)&&<AgendaButton label={managementMessages[language].title} onPress={()=>router.push({pathname:'/cattle/[production]/managements',params:{production,...(farm?{farm}:{})}})}/>}<AgendaButton label={pastureMessages[language].title} onPress={()=>router.push({pathname:'/cattle/[production]/pastures',params:{production,...(farm?{farm}:{})}})}/><AgendaButton label={feedingMessages[language].title} onPress={()=>router.push({pathname:'/feeding',params:{production}})}/><AgendaButton label={reproductionMessages[language].title} onPress={()=>router.push({pathname:'/cattle/[production]/reproduction',params:{production,...(farm?{farm}:{})}})}/><Text style={s.title}>{b.overview}</Text>{q.isPending&&<Busy label={w.loading}/ >}{q.isError&&<><Text style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refetch()}/></>}{data&&<><View style={s.row}>{([[b.heads,data.total_head],[b.identified,data.identified_animals],[b.batches,data.active_batches],[b.pregnant,data.pregnant_females],[b.lactating,data.lactating_females],[b.average,data.average_identified_weight===null?'—':new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(data.average_identified_weight))]] as const).map(([label,value])=><View key={label} style={{flexGrow:1,flexBasis:140,gap:4,paddingVertical:6}}><Text style={s.muted}>{label}</Text><Text style={s.title}>{value}</Text></View>)}</View>{data.categories.map(c=><Text key={c.category} style={s.body}>{cattleLabel(t,c.category)}: {c.quantity}</Text>)}</>}</View>;
}
