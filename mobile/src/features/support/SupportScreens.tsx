import {useCallback,useRef,useState} from 'react';
import {FlatList,KeyboardAvoidingView,Platform,RefreshControl,ScrollView,Text,TextInput,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {randomUUID} from 'expo-crypto';
import {isAxiosError} from 'axios';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,FormField,styles as ui,type StatusTone} from '../agenda/ui';
import {HomeIcon} from '../home/HomeIcon';
import {colors,radius,space} from '../../theme/tokens';
import {DetailHeader,EmptyState,ErrorState,FilterChips,HeaderAction,IconTile,ListFooter,ListRow,Notice,ScreenIntro,SearchBar,SectionLabel,Segmented,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {canUseSupport,customerTransitions,ticketCategories,ticketPriorities,ticketStatuses,type SupportTicket,type TicketMessage,type TicketStatus} from './contracts';
import {supportMessages} from './messages';
import {AttachmentBlock} from './AttachmentBlock';
import type {PickedFile} from './attachments';

const statusTone=(s:TicketStatus):StatusTone=>s==='waiting_customer'?'warning':s==='resolved'?'success':s==='closed'?'neutral':s==='in_progress'?'info':'warning';
const when=(v:string,language:string)=>new Intl.DateTimeFormat(language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
const failure=(error:unknown,t:typeof supportMessages['pt-BR'])=>isAxiosError(error)&&error.response?.status===409?t.changed:isAxiosError(error)&&error.response?.data&&typeof error.response.data==='object'?Object.values(error.response.data as Record<string,unknown>).flat().filter(v=>typeof v==='string').join(' ')||t.failed:t.failed;

export function SupportScreen(){
 const {state,controller,language}=useAuth();const router=useRouter();const t=supportMessages[language],w=workspaceMessages[language];
 const allowed=state.status==='signedIn'&&canUseSupport(state.session.user);
 const [status,setStatus]=useState<''|TicketStatus>('');const [search,setSearch]=useState('');
 const list=useInfinitePages<SupportTicket>({queryKey:['support-tickets','infinite',status,search],enabled:allowed,fetchPage:(page,signal)=>controller.supportTickets({status,search,page},signal)});
 const {refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={t.subtitle} action={<HeaderAction label={t.newTicket} onPress={()=>router.push('/support/new')}/>}/>
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
  <FilterChips value={status} onChange={setStatus} options={[{value:'' as const,label:t.all},...ticketStatuses.map(value=>({value,label:t.statuses[value]??value}))]}/>
 </View>;
 return <WorkspaceShell active="support" title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<FlatList<SupportTicket> data={list.rows} keyExtractor={row=>row.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
  refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
  renderItem={({item})=><ListRow meta={`${t.categories[item.category]??item.category} · ${t.updated} ${when(item.updated_at,language)}`} title={item.subject} subtitle={item.assignee_name||undefined} status={{label:t.statuses[item.status]??item.status,tone:statusTone(item.status)}} leading={<IconTile tone={statusTone(item.status)}><HomeIcon name="bell" size={20} color={colors.textSoft}/></IconTile>} onPress={()=>router.push({pathname:'/support/[id]',params:{id:item.id}})}/>}
  ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
  ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>}</WorkspaceShell>;
}

export function SupportNewScreen(){
 const {state,controller,language}=useAuth();const router=useRouter();const client=useQueryClient();const t=supportMessages[language],w=workspaceMessages[language];
 const allowed=state.status==='signedIn'&&canUseSupport(state.session.user);
 const [subject,setSubject]=useState('');const [body,setBody]=useState('');const [category,setCategory]=useState<typeof ticketCategories[number]>('question');const [priority,setPriority]=useState<typeof ticketPriorities[number]>('normal');
 const [errors,setErrors]=useState<{subject?:string;body?:string}>({});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const key=useRef(randomUUID());
 const submit=async()=>{if(busy)return;const next={subject:subject.trim().length<3?t.errSubject:undefined,body:body.trim().length<3?t.errBody:undefined};setErrors(next);if(next.subject||next.body)return;setBusy(true);setMessage('');
  try{const ticket=await controller.openSupportTicket({subject:subject.trim(),body:body.trim(),category,priority,creation_key:key.current});void client.invalidateQueries({queryKey:['support-tickets']});router.replace({pathname:'/support/[id]',params:{id:ticket.id}});}
  catch(e){setMessage(failure(e,t));}finally{setBusy(false);}};
 return <WorkspaceShell active="support" title={t.newTicket} layout="form" onBack={()=>{if(!busy){if(router.canGoBack())router.back();else router.replace('/support');}}}><ScrollView contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled">
  {!allowed?<EmptyState title={w.noAccess}/>:<>
   <ScreenIntro title={t.newTicket} subtitle={t.openHint}/>
   <Text style={ui.label}>{t.category}</Text>
   <FilterChips value={category} onChange={setCategory} options={ticketCategories.map(value=>({value,label:t.categories[value]??value}))}/>
   <FormField label={t.subject} error={errors.subject}><TextInput accessibilityLabel={t.subject} value={subject} onChangeText={setSubject} maxLength={200} style={ui.fieldControl}/></FormField>
   <FormField label={t.body} error={errors.body}><TextInput accessibilityLabel={t.body} value={body} onChangeText={setBody} maxLength={10000} multiline style={[ui.fieldControl,{minHeight:140,textAlignVertical:'top',paddingTop:12}]}/></FormField>
   <Text style={ui.label}>{t.priority}</Text>
   <Segmented value={priority} onChange={setPriority} options={ticketPriorities.map(value=>({value,label:t.priorities[value]??value}))}/>
   {!!message&&<Notice tone="danger" text={message}/>}
   <AgendaButton variant="primary" busy={busy} disabled={busy} label={t.send} onPress={()=>void submit()}/>
  </>}
 </ScrollView></WorkspaceShell>;
}

export function SupportDetailScreen(){
 const params=useLocalSearchParams();const id=z.uuid().safeParse(params.id);
 const {state,controller,language}=useAuth();const router=useRouter();const client=useQueryClient();const t=supportMessages[language],w=workspaceMessages[language];
 const allowed=id.success&&state.status==='signedIn'&&canUseSupport(state.session.user);
 const ticket=useQuery({queryKey:['support-ticket',params.id],enabled:allowed,queryFn:({signal})=>{if(!id.success)throw Error('id');return controller.supportTicket(id.data,signal);}});
 const messages=useInfinitePages<TicketMessage>({queryKey:['support-messages','infinite',params.id],enabled:allowed,fetchPage:(page,signal)=>{if(!id.success)throw Error('id');return controller.supportMessages(id.data,page,signal);}});
 const {refetch:refetchTicket}=ticket,{refetch:refetchMessages}=messages;
 useFocusEffect(useCallback(()=>{if(allowed){void refetchTicket();void refetchMessages();}},[allowed,refetchTicket,refetchMessages]));
 const [reply,setReply]=useState('');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const key=useRef(randomUUID());
 const row=ticket.data;
 const reload=()=>{void refetchTicket();void refetchMessages();void client.invalidateQueries({queryKey:['support-tickets']});};
 const send=async()=>{if(busy||!row||!reply.trim())return;setBusy(true);setNotice('');try{await controller.replySupportTicket(row.id,{body:reply.trim(),request_key:key.current,expected_version:row.version});setReply('');key.current=randomUUID();reload();}catch(e){setNotice(failure(e,t));reload();}finally{setBusy(false);}};
 const uploadTo=async(messageId:string,file:PickedFile,requestKey:string)=>{if(!row)throw Error('ticket');try{return await controller.uploadSupportAttachment(row.id,messageId,file,row.version,requestKey);}finally{reload();}};
 const move=async(status:'resolved'|'closed'|'open')=>{if(busy||!row)return;setBusy(true);setNotice('');try{await controller.transitionSupportTicket(row.id,status,row.version);reload();}catch(e){setNotice(failure(e,t));reload();}finally{setBusy(false);}};
 const header=row?<View style={ms.header}>
  <DetailHeader meta={`${t.categories[row.category]??row.category} · ${t.priorities[row.priority]??row.priority}`} title={row.subject} leading={<IconTile tone={statusTone(row.status)}><HomeIcon name="bell" size={22} color={colors.textSoft}/></IconTile>} status={[{label:t.statuses[row.status]??row.status,tone:statusTone(row.status)}]}>
   <Text style={{fontSize:12,color:colors.muted}}>{`${t.updated} ${when(row.updated_at,language)}${row.assignee_name?` · ${row.assignee_name}`:''}`}</Text>
  </DetailHeader>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{customerTransitions(row.status).map(target=><AgendaButton key={target} style={{flexGrow:1}} disabled={busy} label={t[target]} onPress={()=>void move(target)}/>)}</View>
  {!!notice&&<Notice tone="danger" text={notice}/>}
  <SectionLabel title={t.conversation}/>
 </View>:undefined;
 return <WorkspaceShell active="support" title={t.detail} onBack={()=>router.canGoBack()?router.back():router.replace('/support')}>
  {!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:ticket.isPending?<View style={ms.list}><SkeletonList rows={3}/></View>:ticket.isError||!row?<View style={ms.list}><ErrorState message={w.error} language={language} onRetry={()=>void refetchTicket()}/></View>:
  <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
   <FlatList<TicketMessage> style={{flex:1}} data={messages.rows} keyExtractor={m=>m.id} contentContainerStyle={ms.list} ListHeaderComponent={header} keyboardShouldPersistTaps="handled"
    refreshControl={<RefreshControl refreshing={messages.refreshing} onRefresh={()=>{void messages.refresh();void refetchTicket();}} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={messages.loadMore} onEndReachedThreshold={0.4}
    renderItem={({item})=><View accessible accessibilityLabel={`${item.from_team?t.team:item.author_name}. ${item.body}`} style={{alignSelf:item.from_team?'flex-start':'flex-end',maxWidth:'88%',gap:4,padding:space.md,borderRadius:radius.lg,borderBottomLeftRadius:item.from_team?4:radius.lg,borderBottomRightRadius:item.from_team?radius.lg:4,backgroundColor:item.from_team?colors.surface:colors.primarySoft,borderWidth:1,borderColor:item.from_team?colors.borderSoft:colors.primarySoft}}>
     <Text style={{fontSize:12,fontWeight:'700',color:item.from_team?colors.info:colors.primary}}>{item.from_team?`${t.team} · ${item.author_name}`:item.author_name}</Text>
     <Text selectable style={{fontSize:15,lineHeight:22,color:colors.text}}>{item.body}</Text>
     <AttachmentBlock attachments={item.attachments} canAttach={item.can_attach&&row.status!=='resolved'&&row.status!=='closed'} language={language} upload={(file,key)=>uploadTo(item.id,file,key)} request={attachmentId=>controller.supportAttachmentRequest(row.id,attachmentId)}/>
     <Text style={{fontSize:11,color:colors.muted,alignSelf:'flex-end'}}>{when(item.created_at,language)}</Text>
    </View>}
    ListEmptyComponent={messages.isPending?<SkeletonList rows={2}/>:messages.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetchMessages()}/>:<Notice tone="neutral" text={t.noMessages}/>}
    ListFooterComponent={messages.rows.length?<ListFooter loading={messages.isFetchingNextPage} end={!messages.hasNextPage} language={language}/>:undefined}/>
   {row.status!=='closed'&&<View style={{flexDirection:'row',alignItems:'flex-end',gap:8,paddingHorizontal:space.lg,paddingVertical:space.sm,borderTopWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface}}>
    <TextInput accessibilityLabel={t.reply} placeholder={t.reply} placeholderTextColor={colors.muted} value={reply} onChangeText={setReply} multiline maxLength={10000} style={{flex:1,minHeight:44,maxHeight:120,fontSize:16,paddingHorizontal:12,paddingVertical:10,borderRadius:radius.md,borderWidth:1,borderColor:colors.inputBorder,color:colors.text}}/>
    <AgendaButton variant="secondary" busy={busy} disabled={busy||!reply.trim()} label={t.sendReply} onPress={()=>void send()}/>
   </View>}
  </KeyboardAvoidingView>}
 </WorkspaceShell>;
}
