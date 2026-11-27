import {useEffect,useState} from 'react';
import {FlatList,Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {useAuth} from '../auth/AuthProvider';
import {useWorkspace} from '../workspace/WorkspaceProvider';
import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,StatusPill} from '../agenda/ui';
import {EmptyState,ErrorState,Notice,ScreenIntro,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {colors,radius,space,type as typo} from '../../theme/tokens';
import type {Language} from '../../i18n/messages';
import {draftDaysLeft,draftExpiringSoon,type DraftRecord} from './contracts';
import {subscribeDrafts} from './store';
import {draftStore,purgeDrafts,useDraftScope,type DraftStatus} from './useLocalDraft';
import {confirmAction} from './hooks';
import {draftMessages} from './messages';

const at=(value:number,language:string,style:'time'|'date')=>new Intl.DateTimeFormat(language,style==='time'?{timeStyle:'short'}:{dateStyle:'short',timeStyle:'short'}).format(new Date(value));

/** Draft state inside a form: restored, incompatible, unconfirmed send and the save indicator. */
export function DraftNotice({draft,language,onDiscard}:{draft:{restoredAt:number|null;restored:unknown;unconfirmed:boolean;problem:'version'|'invalid'|null;status:DraftStatus};language:Language;onDiscard:()=>void}){
 const t=draftMessages[language];
 return <View style={{gap:space.xs}}>
  {draft.problem&&<><Notice tone="warning" text={t.incompatible}/><AgendaButton label={t.discardOld} onPress={onDiscard}/></>}
  {draft.unconfirmed&&<Notice tone="warning" text={t.unconfirmed}/>}
  {!!draft.restored&&draft.restoredAt!==null&&<View style={{gap:space.xs}}>
   <Notice tone="info" text={t.restored.replace('{date}',at(draft.restoredAt,language,'date'))}/>
   <AgendaButton label={t.discard} onPress={()=>confirmAction(t.discardTitle,t.discardBody,[{text:t.cancel,style:'cancel'},{text:t.discard,style:'destructive',onPress:onDiscard}])}/>
  </View>}
  {draft.status.state==='saving'&&<Text accessibilityLiveRegion="polite" style={{...typo.meta,color:colors.muted}}>{t.saving}</Text>}
  {draft.status.state==='saved'&&draft.status.at!==null&&<Text accessibilityLiveRegion="polite" style={{...typo.meta,color:colors.muted}}>{t.savedAt.replace('{time}',at(draft.status.at,language,'time'))}</Text>}
  {draft.status.state==='error'&&<Notice tone="warning" text={t.saveError}/>}
  {draft.status.state==='tooLarge'&&<Notice tone="warning" text={t.tooLarge}/>}
 </View>;
}

/** P08.06 — drafts center: identification, date, state and resume/discard. */
export function DraftsScreen(){
 const {language}=useAuth();const t=draftMessages[language],w=workspaceMessages[language];const router=useRouter();const {farm,selectFarm}=useWorkspace();
 const scope=useDraftScope();const [rows,setRows]=useState<DraftRecord[]|null>(null);const [now,setNow]=useState(0);const [failed,setFailed]=useState(false);
 useEffect(()=>{
  if(!scope)return;let live=true;
  const load=()=>{void draftStore.list(scope).then(next=>{if(live){setRows(next);setNow(Date.now());setFailed(false);}}).catch(()=>{if(live)setFailed(true);});};
  void purgeDrafts(scope).catch(()=>{}).finally(load);const unsubscribe=subscribeDrafts(load);
  return ()=>{live=false;unsubscribe();};
 },[scope]);
 const resume=(row:DraftRecord)=>{
  if(row.route.farm&&row.route.farm.id!==farm?.id)selectFarm(row.route.farm);
  router.push({pathname:row.route.pathname as never,params:row.route.params});
 };
 const discard=(row:DraftRecord)=>confirmAction(t.discardTitle,t.discardBody,[{text:t.cancel,style:'cancel'},{text:t.discard,style:'destructive',onPress:()=>void draftStore.remove(row.id).then(()=>{setRows(current=>current?.filter(item=>item.id!==row.id)??null);})}]);
 return <WorkspaceShell active="profile" title={t.title} onBack={()=>router.canGoBack()?router.back():router.replace('/profile')}>
  <FlatList<DraftRecord> data={rows??[]} keyExtractor={row=>row.id} contentContainerStyle={ms.list}
   ListHeaderComponent={<View style={ms.header}><ScreenIntro title={t.title} subtitle={t.subtitle}/></View>}
   ListEmptyComponent={!scope?<EmptyState title={w.noAccess}/>:failed?<ErrorState message={w.error} language={language} onRetry={()=>void draftStore.list(scope).then(setRows)}/>:rows===null?<SkeletonList rows={2}/>:<EmptyState title={t.empty}/>}
   renderItem={({item})=><View style={{gap:space.sm,padding:space.md,marginBottom:space.sm,borderRadius:radius.lg,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface}}>
    <Text style={{...typo.meta,color:colors.muted}}>{`${t.features[item.feature]}${item.route.farm?` · ${item.route.farm.name}`:''}`}</Text>
    <Text style={{...typo.recordTitle,color:colors.text}}>{item.title||t.features[item.feature]}</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:space.sm,alignItems:'center'}}>
     <Text style={{...typo.meta,color:colors.muted,fontVariant:['tabular-nums']}}>{t.updated.replace('{date}',at(item.updatedAt,language,'date'))}</Text>
     {item.state==='unconfirmed'&&<StatusPill label={t.unconfirmedTag} tone="warning"/>}
     <StatusPill label={t.expires.replace('{days}',String(draftDaysLeft(item,now)))} tone={draftExpiringSoon(item,now)?'warning':'neutral'}/>
    </View>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:space.sm}}>
     <AgendaButton variant="secondary" style={{flexGrow:1}} label={t.resume} onPress={()=>resume(item)}/>
     <AgendaButton style={{flexGrow:1}} label={t.discard} onPress={()=>discard(item)}/>
    </View>
   </View>}/>
 </WorkspaceShell>;
}
