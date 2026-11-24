import {useCallback,useRef,useState} from 'react';
import {FlatList,Linking,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,type StatusTone} from '../agenda/ui';
import {HomeIcon} from '../home/HomeIcon';
import {colors} from '../../theme/tokens';
import {ActionGroup,ActionRow,BottomSheet,DetailHeader,EmptyState,ErrorState,FilterChips,IconTile,ListFooter,ListRow,Notice,ScreenIntro,SearchBar,SectionLabel,Segmented,SelectChip,SheetOption,Shortcut,SkeletonList,mobileStyles as ms,mobileUiMessages} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {canReadInventory} from '../inventory/contracts';
import {parseApiUrl} from '../../config/environment';
import {categories,canReadNotifications,notificationOrigin,type NotificationQuery,type Notification} from './contracts';
import {notificationMessages} from './messages';
const priorityTone=(value:string):StatusTone=>value==='urgent'?'danger':value==='high'?'warning':value==='medium'?'info':'neutral';
export function NotificationScreen(){
 const {state,controller,language}=useAuth();const t=notificationMessages[language],w=workspaceMessages[language],router=useRouter();const allowed=state.status==='signedIn'&&canReadNotifications(state.session.user);
 const [status,setStatus]=useState<NotificationQuery['status']>('all'),[archived,setArchived]=useState(false),[category,setCategory]=useState<NotificationQuery['category']>(''),[search,setSearch]=useState(''),[sheet,setSheet]=useState(false);
 const list=useInfinitePages<Notification>({queryKey:['notifications','infinite',status,archived,category,search],enabled:allowed,fetchPage:(page,signal)=>controller.notifications({page,status,archived,category,search},signal)});
 const count=useQuery({queryKey:['notifications-count'],enabled:allowed,queryFn:({signal})=>controller.notificationCount(signal),staleTime:30000});const {refetch}=list;useFocusEffect(useCallback(()=>{if(allowed)void refetch();},[allowed,refetch]));
 const unread=count.data&&!count.isError?count.data.unread_count:undefined;
 const relative=(value:string)=>{const diff=((list.dataUpdatedAt||new Date(value).getTime())-new Date(value).getTime())/60000;const rtf=new Intl.RelativeTimeFormat(language,{numeric:'auto'});if(diff<60)return rtf.format(-Math.max(0,Math.round(diff)),'minute');if(diff<1440)return rtf.format(-Math.round(diff/60),'hour');if(diff<10080)return rtf.format(-Math.round(diff/1440),'day');return new Intl.DateTimeFormat(language,{dateStyle:'medium'}).format(new Date(value));};
 const header=<View style={ms.header}>
  <ScreenIntro title={t.title} subtitle={unread!==undefined?`${t.unread}: ${unread}`:undefined}/>
  <View style={ms.wrap}><Shortcut label={t.preferences} onPress={()=>router.push('/notifications/preferences')}/>{state.status==='signedIn'&&canReadInventory(state.session.user)&&<Shortcut label={t.stock} icon={<HomeIcon name="box" size={18} color={colors.primary}/>} onPress={()=>router.push({pathname:'/inventory',params:{kind:'alerts'}})}/>}</View>
  <Segmented value={archived?'archived':'inbox'} onChange={value=>setArchived(value==='archived')} options={[{value:'inbox',label:t.inbox},{value:'archived',label:t.archived}]}/>
  <SearchBar value={search} onChange={setSearch} placeholder={t.search} language={language}/>
  <FilterChips label={t.read} value={status} onChange={setStatus} options={(['all','unread','read'] as const).map(value=>({value,label:t[value],...(value==='unread'&&unread!==undefined&&!archived?{count:unread}:{})}))} trailing={<SelectChip label={t.category} value={category?t.categories[category]??category:undefined} active={!!category} onPress={()=>setSheet(true)}/>}/>
  {list.isError&&!!list.rows.length&&<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>}
 </View>;
 return <WorkspaceShell active="notifications" title={t.title}>{!allowed?<View style={ms.list}><EmptyState title={w.noAccess}/></View>:<>
  <FlatList<Notification> data={list.rows} keyExtractor={row=>row.id} contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={header}
   refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={()=>{void list.refresh();void count.refetch();}} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
   renderItem={({item})=><ListRow style={!item.is_read&&{borderColor:colors.primary,backgroundColor:colors.primarySoft}} meta={`${t.categories[item.category]??item.category} · ${relative(item.created_at)}${item.occurrence_count>1?` · ×${item.occurrence_count}`:''}`} title={item.title} subtitle={item.message} status={['high','urgent'].includes(item.priority)?{label:t.priorities[item.priority]??item.priority,tone:priorityTone(item.priority)}:undefined} leading={<View><IconTile tone={priorityTone(item.priority)}><HomeIcon name="bell" size={20} color={colors.textSoft}/></IconTile>{!item.is_read&&<View aria-hidden style={{position:'absolute',top:-2,right:-2,width:12,height:12,borderRadius:6,backgroundColor:colors.primary,borderWidth:2,borderColor:colors.surface}}/>}</View>} accessibilityLabel={`${item.is_read?t.read:t.unread}. ${item.title}. ${item.message}`} onPress={()=>router.push({pathname:'/notifications/detail',params:{id:item.id,archived:String(archived)}})}/>}
   ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={w.error} language={language} onRetry={()=>void refetch()}/>:<EmptyState title={t.empty}/>}
   ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>
  <BottomSheet visible={sheet} title={t.category} onClose={()=>setSheet(false)} language={language}>
   <SheetOption label={t.all} selected={!category} onPress={()=>{setCategory('');setSheet(false);}}/>
   {categories.map(value=><SheetOption key={value} label={t.categories[value]??value} selected={category===value} onPress={()=>{setCategory(value);setSheet(false);}}/>)}
  </BottomSheet>
 </>}</WorkspaceShell>;
}
export function NotificationDetailScreen(){
 const params=useLocalSearchParams();const route=z.object({id:z.uuid(),archived:z.enum(['true','false']).default('false')}).safeParse(params);const {state,controller,language}=useAuth();const t=notificationMessages[language],w=workspaceMessages[language],router=useRouter(),client=useQueryClient();const allowed=route.success&&state.status==='signedIn'&&canReadNotifications(state.session.user);const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const lock=useRef(false);
 const q=useQuery({queryKey:['notification-detail',params.id,params.archived??'false'],enabled:allowed,queryFn:({signal})=>{if(!route.success)throw Error('route');return controller.notification(route.data.id,route.data.archived==='true',signal);}});
 const run=async(action:'read'|'archive'|'restore')=>{if(lock.current||!q.data)return;lock.current=true;setBusy(true);setMessage('');try{const result=await controller.changeNotification(q.data.id,q.data.is_archived,action);client.setQueryData(['notification-detail',result.id,String(result.is_archived)],result);for(const key of ['notifications','notifications-count'])void client.invalidateQueries({queryKey:[key]});if(action==='read')void q.refetch();else router.setParams({archived:String(result.is_archived)});}catch{setMessage(t.failed);}finally{lock.current=false;setBusy(false);}};
 const origin=state.status==='signedIn'&&q.data?notificationOrigin(q.data.link,state.session.user):null;
 const open=async()=>{if(!origin)return;const path=origin.path;setMessage('');if(path==='/home'){router.push('/');return;}if(path==='/home/clinico'){router.push('/clinic');return;}if(path==='/home/agenda'){router.push('/agenda');return;}if(path==='/home/notifications'){router.push('/notifications');return;}if(path.startsWith('/home/estoque/')){if(path.endsWith('movimentacoes'))router.push('/inventory/movements');else if(path.endsWith('producao-racao'))router.push('/feed');else router.push({pathname:'/inventory',params:{kind:path.endsWith('alertas')?'alerts':'items'}});return;}if(origin.production){const production=origin.production as 'beef'|'dairy';if(path.endsWith('racao/tratos'))router.push({pathname:'/feeding',params:{production}});else if(path.endsWith('leite'))router.push('/milk');else router.push({pathname:'/cattle/[production]',params:{production}});return;}const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site){setMessage(t.failed);return;}try{await Linking.openURL(new URL(path,site).href);}catch{setMessage(t.failed);}};
 return <WorkspaceShell active="notifications" title={t.detail} onBack={()=>{if(!lock.current){if(router.canGoBack())router.back();else router.replace('/notifications');}}}><ScrollView contentContainerStyle={ms.list}>{!allowed?<EmptyState title={w.noAccess}/>:q.isPending?<SkeletonList rows={3}/>:q.isError?<ErrorState message={w.error} language={language} onRetry={()=>void q.refetch()}/>:<>
  <DetailHeader meta={`${t.categories[q.data.category]??q.data.category} · ${new Intl.DateTimeFormat(language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(q.data.created_at))}`} title={q.data.title} leading={<IconTile tone={priorityTone(q.data.priority)}><HomeIcon name="bell" size={22} color={colors.textSoft}/></IconTile>} status={[{label:q.data.is_read?t.read:t.unread,tone:q.data.is_read?'neutral':'success'},{label:t.priorities[q.data.priority]??q.data.priority,tone:priorityTone(q.data.priority)},...(q.data.occurrence_count>1?[{label:`${t.occurrences}: ${q.data.occurrence_count}`,tone:'neutral' as const}]:[])]}>
   <Text style={{fontSize:15,lineHeight:22,color:colors.textSoft}} selectable>{q.data.message}</Text>
  </DetailHeader>
  {origin&&<AgendaButton variant="primary" label={t.open} disabled={busy} onPress={()=>void open()}/>}
  {!origin&&!!q.data.link&&<Notice tone="neutral" text={t.blocked}/>}
  {!!q.data.group_items.length&&<View style={{gap:8}}>{q.data.group_items.map((row,index)=><ListRow key={index} title={row.message}/>)}</View>}
  {q.data.promotion&&<><SectionLabel title={t.promotion}/><Notice tone="info" text={q.data.promotion.body}/></>}
  <SectionLabel title={mobileUiMessages[language].actions}/>
  <ActionGroup>
   {!q.data.is_read&&<ActionRow label={busy?w.loading:t.markRead} disabled={busy} icon={<HomeIcon name="bell" size={20} color={colors.primary}/>} onPress={()=>void run('read')}/>}
   <ActionRow label={q.data.is_archived?t.restore:t.archive} disabled={busy} icon={<HomeIcon name="box" size={20} color={colors.primary}/>} onPress={()=>void run(q.data.is_archived?'restore':'archive')}/>
  </ActionGroup>
 </>}{!!message&&<ErrorState message={message} language={language} onRetry={()=>void q.refetch()}/>}</ScrollView></WorkspaceShell>;
}
