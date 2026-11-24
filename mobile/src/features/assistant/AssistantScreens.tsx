import {useCallback,useRef,useState} from 'react';
import {FlatList,KeyboardAvoidingView,Platform,RefreshControl,Text,TextInput,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {isAxiosError} from 'axios';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton} from '../agenda/ui';
import {HomeIcon} from '../home/HomeIcon';
import {colors,radius,space} from '../../theme/tokens';
import {EmptyState,ErrorState,HeaderAction,IconTile,KpiStrip,ListFooter,ListRow,Notice,ScreenIntro,SectionLabel,Shortcut,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {canUseAssistant,type AIConversation,type AIMessage,type AIQuota} from './contracts';
import {assistantMessages} from './messages';

const when=(v:string,language:string)=>new Intl.DateTimeFormat(language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
function QuotaStrip({quota}:{quota:AIQuota}){
 const {language}=useAuth();const t=assistantMessages[language];
 return <KpiStrip items={[{key:'u',label:t.quota,value:quota.limit==null?`${quota.used}`:`${quota.used}/${quota.limit}`,tone:quota.remaining!==null&&quota.remaining<=0?'danger':undefined,hint:quota.limit==null?t.unlimited:`${t.renews} ${new Intl.DateTimeFormat(language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${quota.renews_at.slice(0,10)}T12:00:00Z`))}`}]}/>;
}

export function AssistantScreen(){
 const {state,controller,language}=useAuth();const router=useRouter();const client=useQueryClient();const t=assistantMessages[language],w=workspaceMessages[language];
 const allowed=state.status==='signedIn'&&canUseAssistant(state.session.user);
 const usage=useQuery({queryKey:['ai-usage'],enabled:allowed,queryFn:({signal})=>controller.aiUsage(signal)});
 const list=useInfinitePages<AIConversation>({queryKey:['ai-conversations','infinite'],enabled:allowed,fetchPage:(page,signal)=>controller.aiConversations(page,signal)});
 const {refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const [creating,setCreating]=useState(false);const [error,setError]=useState('');
 const start=async(question?:string)=>{if(creating)return;setCreating(true);setError('');try{const row=await controller.createAiConversation(t.newTitle);void client.invalidateQueries({queryKey:['ai-conversations']});router.push({pathname:'/assistant/[id]',params:{id:row.id,...(question?{question}:{})}});}catch{setError(w.error);}finally{setCreating(false);}};
 const enabled=usage.data?.enabled!==false;
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={t.subtitle} action={enabled?<HeaderAction label={t.newChat} onPress={()=>void start()}/>:undefined}/>
  {usage.data&&<QuotaStrip quota={usage.data}/>}
  {!enabled&&<Notice tone="warning" text={t.disabled}/>}
  {!!error&&<Notice tone="danger" text={error}/>}
  {enabled&&<><SectionLabel title={t.suggestions}/><View style={ms.wrap}>{[t.s1,t.s2,t.s3].map(q=><Shortcut key={q} label={q} onPress={()=>void start(q)}/>)}</View></>}
  <Notice tone="neutral" text={t.disclaimer}/>
  {!!list.rows.length&&<SectionLabel title={t.conversation}/>}
 </View>;
 return <WorkspaceShell active="assistant" title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<AIConversation> data={list.rows} keyExtractor={row=>row.id} contentContainerStyle={ms.list} ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>{void list.refresh();void usage.refetch();}} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><ListRow meta={when(item.updated_at,language)} title={item.title} value={item.messages_count!=null?String(item.messages_count):undefined} status={!item.is_active?{label:t.closed,tone:'neutral'}:undefined} leading={<IconTile tone="info"><HomeIcon name="search" size={20} color={colors.info}/></IconTile>} onPress={()=>router.push({pathname:'/assistant/[id]',params:{id:item.id}})}/>}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}

export function AssistantChatScreen(){
 const params=useLocalSearchParams();const id=z.uuid().safeParse(params.id);
 const {state,controller,language}=useAuth();const router=useRouter();const client=useQueryClient();const t=assistantMessages[language],w=workspaceMessages[language];
 const allowed=id.success&&state.status==='signedIn'&&canUseAssistant(state.session.user);
 const q=useQuery({queryKey:['ai-conversation',params.id],enabled:allowed,queryFn:({signal})=>{if(!id.success)throw Error('id');return controller.aiConversation(id.data,signal);}});
 const [draft,setDraft]=useState(typeof params.question==='string'?params.question.slice(0,4000):'');const [pending,setPending]=useState<string|null>(null);const [error,setError]=useState('');const [quota,setQuota]=useState<AIQuota|null>(null);
 const listRef=useRef<FlatList<AIMessage>>(null);
 const send=async()=>{const question=draft.trim();if(pending||!q.data)return;if(question.length<3){setError(t.min);return;}setPending(question);setDraft('');setError('');
  try{const result=await controller.askAi(q.data.id,question);setQuota(result.quota);await q.refetch();void client.invalidateQueries({queryKey:['ai-conversations']});void client.invalidateQueries({queryKey:['ai-usage']});}
  catch(e){setDraft(question);const status=isAxiosError(e)?e.response?.status:undefined;setError(status===429?t.quotaExceeded:status===422?t.blocked:status===409?t.closed:status===403?t.disabled:t.failed);void q.refetch();}
  finally{setPending(null);}};
 const rows=(q.data?.messages??[]).filter(m=>m.role!=='system');
 const data:AIMessage[]=pending?[...rows,{id:'pending',role:'user',content:pending,status:'pending',created_at:new Date(0).toISOString()}]:rows;
 return <WorkspaceShell active="assistant" title={q.data?.title??t.title} onBack={()=>router.canGoBack()?router.back():router.replace('/assistant')}>
  {!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:q.isPending?<View style={ms.list}><SkeletonList rows={3}/></View>:q.isError||!q.data?<View style={ms.list}><ErrorState message={w.error} language={language} onRetry={()=>void q.refetch()}/></View>:
  <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
   <FlatList<AIMessage> ref={listRef} style={{flex:1}} data={data} keyExtractor={m=>m.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" onContentSizeChange={()=>listRef.current?.scrollToEnd({animated:false})}
    ListHeaderComponent={<View style={ms.header}>{quota&&<QuotaStrip quota={quota}/>}<Notice tone="neutral" text={t.disclaimer}/></View>}
    renderItem={({item})=>{const mine=item.role==='user';return <View accessible accessibilityLabel={`${mine?t.you:t.assistant}. ${item.content}`} style={{alignSelf:mine?'flex-end':'flex-start',maxWidth:'90%',gap:4,padding:space.md,borderRadius:radius.lg,borderBottomRightRadius:mine?4:radius.lg,borderBottomLeftRadius:mine?radius.lg:4,backgroundColor:mine?colors.primary:colors.surface,borderWidth:mine?0:1,borderColor:colors.borderSoft,opacity:item.id==='pending'?0.7:1}}>
     {!mine&&<Text style={{fontSize:12,fontWeight:'700',color:colors.info}}>{t.assistant}</Text>}
     <Text selectable style={{fontSize:15,lineHeight:22,color:mine?colors.surface:colors.text}}>{item.content}</Text>
    </View>;}}
    ListEmptyComponent={<EmptyState title={t.ask}/>}
    ListFooterComponent={pending?<View style={{alignSelf:'flex-start',padding:space.md,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderSoft}}><Text style={{fontSize:14,color:colors.muted}}>{t.thinking}</Text></View>:error?<Notice tone="danger" text={error}/>:undefined}/>
   {q.data.is_active?<View style={{flexDirection:'row',alignItems:'flex-end',gap:8,paddingHorizontal:space.lg,paddingVertical:space.sm,borderTopWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface}}>
    <TextInput accessibilityLabel={t.ask} placeholder={t.ask} placeholderTextColor={colors.muted} value={draft} onChangeText={v=>{setDraft(v);if(error)setError('');}} multiline maxLength={4000} editable={!pending} style={{flex:1,minHeight:44,maxHeight:140,fontSize:16,paddingHorizontal:12,paddingVertical:10,borderRadius:radius.md,borderWidth:1,borderColor:colors.inputBorder,color:colors.text}}/>
    <AgendaButton variant="secondary" busy={!!pending} disabled={!!pending||draft.trim().length<3} label={t.send} onPress={()=>void send()}/>
   </View>:<View style={{padding:space.lg}}><Notice tone="neutral" text={t.closed}/></View>}
  </KeyboardAvoidingView>}
 </WorkspaceShell>;
}
