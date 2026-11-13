import {tankMessages} from './tankMessages';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import { useCallback, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useAuth } from '../auth/AuthProvider';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { workspaceMessages } from '../workspace/messages';
import { organizationDay } from '../workspace/contracts';
import { FarmContextButton } from '../workspace/FarmContextButton';
import { AgendaButton, Busy, styles as s } from '../agenda/ui';
import { canReadCattle,canCreateCattle } from '../cattle/contracts';
import { milkCalendarDate,isPeriodMilkTotal,milkKinds,type MilkQuery,type MilkCow,type MilkRecord,type MilkTotal } from './contracts';
import { milkMessages } from './messages';
import { MilkPeriodDetails } from './MilkPeriodDetails';
const denied=(error:unknown)=>isAxiosError(error)&&[401,403,404].includes(error.response?.status??0);
export function MilkScreen(){
 const {state,controller,language}=useAuth();const w=workspaceMessages[language];const t=milkMessages[language];
 const allowed=state.status==='signedIn'&&canReadCattle(state.session.user);
 const options=useQuery({queryKey:['milk-options'],enabled:allowed,queryFn:async({signal})=>{const value=await controller.agendaOptions(signal);return {...value,today:organizationDay(value.timezone)};}});
 const {refetch:refreshOptions}=options;
 useFocusEffect(useCallback(()=>{if(allowed)void refreshOptions();},[allowed,refreshOptions]));
 if(!allowed)return <WorkspaceShell active="milk" title={t.title}><Text style={s.error}>{w.noAccess}</Text></WorkspaceShell>;
 if(options.isPending)return <WorkspaceShell active="milk" title={t.title}><Busy label={w.loading}/></WorkspaceShell>;
 if(!options.data||options.isError)return <WorkspaceShell active="milk" title={t.title}><View style={s.content}><Text style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={()=>void options.refetch()}/></View></WorkspaceShell>;
 return <MilkContents today={options.data.today} readOnly={options.data.read_only||state.status!=='signedIn'||options.data.user_id!==state.session.user.id}/>;
}
function MilkContents({today,readOnly}:{today:string;readOnly:boolean}){
 const {state,controller,language}=useAuth();const {farm}=useWorkspace();const router=useRouter();const t=milkMessages[language],w=workspaceMessages[language];
 const [adjustingDate,setAdjustingDate]=useState(false),[details,setDetails]=useState(false),[searching,setSearching]=useState(false);
 const [date,setDate]=useState(today),[draftDate,setDraftDate]=useState(today),[invalid,setInvalid]=useState(false),[kind,setKind]=useState<MilkQuery['kind']>('cows'),[search,setSearch]=useState(''),[draft,setDraft]=useState('');
 const [pagination,setPagination]=useState({farm:farm?.id??'',page:1});const page=pagination.farm===(farm?.id??'')?pagination.page:1;const setPage=(value:number)=>setPagination({farm:farm?.id??'',page:value});
 const summary=useQuery({queryKey:['milk-summary',date,farm?.id],queryFn:({signal})=>controller.milkSummary(date,farm?.id,signal)});
 const list=useQuery({queryKey:['milk-list',date,farm?.id,kind,search,page],queryFn:({signal})=>controller.milkPage({date,farm:farm?.id,kind,search,page},signal)});
 const {refetch:refreshSummary}=summary,{refetch:refreshList}=list;useFocusEffect(useCallback(()=>{void refreshSummary();void refreshList();},[refreshSummary,refreshList]));
 const total=denied(summary.error)?undefined:summary.data,data=denied(list.error)?undefined:list.data;
 const writable=!readOnly&&state.status==='signedIn'&&canCreateCattle(state.session.user),editable=writable&&state.status==='signedIn'&&['admin','manager'].includes(state.session.user.access.role);
 const number=(value:string|number|null)=>value==null?'—':new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(Number(value));
 const metric=(label:string,value:string|number|null)=><View key={label} style={{flexGrow:1,flexBasis:64,minWidth:0}}><Text style={s.label}>{label}</Text><Text style={s.body}>{number(value)}</Text></View>;
 return <WorkspaceShell active="milk" title={t.title}><FlatList<MilkCow|MilkRecord|MilkTotal> key={`${date}:${farm?.id}:${kind}:${search}:${page}`} data={data?.results??[]} keyExtractor={item=>item.id} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
  ListHeaderComponent={<View style={{gap:12}}>
   <View style={s.card}><Text style={s.title}>{t.context}</Text><FarmContextButton/><View style={s.row}><Text style={[s.body,{flex:1,minWidth:120}]}>{milkCalendarDate(date,language)}</Text>
    <AgendaButton label={adjustingDate?t.closeFilters:t.changeDate} selected={adjustingDate} onPress={()=>setAdjustingDate(value=>!value)}/></View>
    {adjustingDate&&<><Text style={s.label}>{t.date}</Text><TextInput accessibilityLabel={t.date} value={draftDate} onChangeText={setDraftDate} autoCapitalize="none" maxLength={10} style={s.input}/><AgendaButton label={t.apply} onPress={()=>{const valid=/^\d{4}-\d{2}-\d{2}$/.test(draftDate)&&!Number.isNaN(Date.parse(draftDate))&&new Date(`${draftDate}T12:00:00Z`).toISOString().slice(0,10)===draftDate&&draftDate<=today;if(valid){setDate(draftDate);setPage(1);setInvalid(false);setAdjustingDate(false);}else setInvalid(true);}}/>{invalid&&<Text accessibilityRole="alert" style={s.error}>{t.dateError}</Text>}</>}
    {!writable&&<Text style={s.badge}>{t.readonly}</Text>}
   </View>
   {summary.isPending?<Busy label={w.loading}/>:summary.isError?<View style={s.card}><Text style={s.error}>{total?t.stale:w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refreshSummary()}/></View>:null}
   {total&&<View style={s.card}><Text style={s.title}>{t.summary}</Text><View style={s.row}>{metric(t.produced,total.produced_liters)}{metric(t.discarded,total.discarded_liters)}{metric(t.usable,total.usable_liters)}</View><AgendaButton label={details?t.hideDetails:t.cowDetails} selected={details} onPress={()=>setDetails(value=>!value)}/>{details&&<View style={s.row}>{metric(t.expected,total.expected_cows)}{metric(t.milked,total.milked_cows)}{metric(t.pending,total.pending_cows)}{metric(t.average,total.average_per_milked_cow)}</View>}{total.aggregate_mode&&<Text style={s.muted}>{t.aggregate}</Text>}</View>}
   <View style={s.row}><AgendaButton label={t.refresh} disabled={summary.isFetching||list.isFetching} onPress={()=>{void refreshSummary();void refreshList();}}/><AgendaButton label={tankMessages[language].open} onPress={()=>router.push('/milk/tanks')}/></View>
   <Text style={s.title}>{t.entries}</Text><View style={s.row}>{milkKinds.map(value=><AgendaButton key={value} label={t[value]} selected={kind===value} onPress={()=>{setKind(value);setSearch('');setDraft('');setSearching(false);setPage(1);}}/>)}</View>
   {kind!=='totals'&&<><AgendaButton label={searching?t.closeSearch:t.search} selected={searching||!!search} onPress={()=>setSearching(value=>!value)}/>{!!search&&<Text style={s.muted}>{t.search}: {search}</Text>}{searching&&<><TextInput placeholder={t.search} value={draft} accessibilityLabel={t.search} onChangeText={setDraft} maxLength={100} style={s.input}/><AgendaButton label={t.find} onPress={()=>{setSearch(draft.trim());setPage(1);setSearching(false);}}/></>}</>}
   {writable&&kind==='totals'&&<Text style={s.muted}>{t.modeHint}</Text>}

   {writable&&kind==='totals'&&(!farm?<Text style={s.muted}>{t.selectFarm}</Text>:data?.count===0&&<AgendaButton label={t.newTotal} disabled={list.isFetching||list.isError||summary.isPending||summary.isFetching||summary.isError||!!total?.aggregate_mode||!!(total?.milked_cows&&total.milked_cows>0)} onPress={()=>router.push({pathname:'/milk/form',params:{mode:'total',farm:farm.id,date}})}/>)}
   {list.isPending&&<Busy label={w.loading}/>}{list.isError&&<><Text accessibilityRole="alert" style={s.error}>{data?t.stale:w.error}</Text><AgendaButton label={w.retry} onPress={()=>void refreshList()}/></>}
  </View>}
  ListEmptyComponent={!list.isPending&&!list.isError?<Text style={s.body}>{t.empty}</Text>:undefined}
  renderItem={({item})=><View style={s.card}>
   {'entry_status' in item?<><Text style={s.title}>{item.identifier}{item.name?` · ${item.name}`:''}</Text><Text style={s.body}>{item.farm_name}</Text><Text style={s.badge}>{item.entry_status==='pending'?t.pendingEntry:t[item.entry_status]}</Text><Text>{number(item.liters)} L</Text>{writable&&item.entry_status!=='total'&&<AgendaButton label={t.newIndividual} disabled={list.isFetching||list.isError} onPress={()=>router.push({pathname:'/milk/form',params:{mode:'individual',animal:item.id,farm:item.farm,date}})}/>}</>:
    <><Text style={s.title}>{'animal' in item?`${item.identifier} · ${t[item.session]}`:item.farm_name}</Text>{'animal' in item&&<Text style={s.muted}>{item.farm_name}</Text>}<Text style={s.body}>{number(item.liters)} L · {t.discarded}: {number(item.discarded_liters)} L</Text>{'farm' in item?(isPeriodMilkTotal(item)?<MilkPeriodDetails record={item}/>:<Text style={s.muted}>{milkCalendarDate(item.date,language)}</Text>):null}{editable&&('animal' in item||!isPeriodMilkTotal(item))&&<AgendaButton label={t.edit} disabled={list.isFetching||list.isError} onPress={()=>router.push({pathname:'/milk/form',params:{mode:'animal' in item?'individual':'total',id:item.id,date:item.date,...('animal' in item?{animal:item.animal,session:item.session,...(farm?{farm:farm.id}:{})}:{farm:item.farm})}})}/>}</>}
  </View>}
  ListFooterComponent={data?<View style={s.row}><AgendaButton label={w.previous} disabled={!data.previous||list.isFetching} onPress={()=>setPage(Math.max(1,page-1))}/><Text>{`${w.page} ${page}`}</Text><AgendaButton label={w.next} disabled={!data.next||list.isFetching} onPress={()=>setPage(page+1)}/></View>:undefined}/></WorkspaceShell>;
}
