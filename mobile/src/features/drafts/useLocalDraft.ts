import {useCallback,useEffect,useRef,useState} from 'react';
import type {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {selectApiUrl,sessionStorageKey} from '../../config/environment';
import {createDraftStore} from '../../services/local/draftStore';
import {draftFeatures,draftId,draftScope,draftsToPurge,isDraftExpired,readDraft,serializeDraft,type DraftFeature,type DraftRoute,type DraftState} from './contracts';
import {notifyDrafts} from './store';

export const draftStore=createDraftStore();
const namespace=sessionStorageKey(selectApiUrl({api:process.env.EXPO_PUBLIC_API_URL,devApi:process.env.EXPO_PUBLIC_DEV_API_URL},__DEV__));
const SAVE_DELAY_MS=800;

/** Drafts belong to one API environment, user and organization; null without an organization session. */
export function useDraftScope(){
 const {state}=useAuth();
 return state.status==='signedIn'?draftScope(namespace,state.session.user.id,state.session.organization.id):null;
}

/** Removes expired drafts and the oldest ones beyond the limit (retention is shown in the drafts center). */
export async function purgeDrafts(scope:string){
 const ids=draftsToPurge(await draftStore.list(scope),Date.now());
 for(const id of ids)await draftStore.remove(id);
 if(ids.length)notifyDrafts();
}

export type DraftStatus={state:'idle'|'saving'|'saved'|'error'|'tooLarge';at:number|null};
type Loaded<T>={id:string;value:T|null;savedAt:number|null;state:DraftState;problem:'version'|'invalid'|null};

/**
 * Saves form input on this device a moment after each change and restores it when the same form opens
 * again. It never sends anything: the user still reviews and submits online.
 */
export function useLocalDraft<T>({feature,context,schema,enabled,onRestore}:{feature:DraftFeature;context:string;schema:z.ZodType<T>;enabled:boolean;onRestore?:(value:T)=>void}){
 const restore=useRef(onRestore);
 useEffect(()=>{restore.current=onRestore;});
 const scope=useDraftScope();const id=enabled&&scope?draftId(scope,feature,context):null;
 const [loaded,setLoaded]=useState<Loaded<T>|null>(null);
 const [status,setStatus]=useState<DraftStatus>({state:'idle',at:null});
 const pending=useRef<{value:T;title:string;route:DraftRoute}|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const draftState=useRef<DraftState>('draft');
 const target=useRef<{id:string|null;scope:string|null}>({id,scope});
 useEffect(()=>{target.current={id,scope};},[id,scope]);

 useEffect(()=>{
  if(!id)return;
  let live=true;
  void draftStore.get(id).then(record=>{
   if(!live)return;
   if(!record||isDraftExpired(record,Date.now())){if(record)void draftStore.remove(record.id).then(notifyDrafts);setLoaded({id,value:null,savedAt:null,state:'draft',problem:null});return;}
   const read=readDraft(record,schema);draftState.current=record.state;
   setLoaded({id,value:read.ok?read.value:null,savedAt:record.updatedAt,state:record.state,problem:read.ok?null:read.reason});
   if(read.ok){setStatus({state:'saved',at:record.updatedAt});restore.current?.(read.value);}
  }).catch(()=>{if(live){setLoaded({id,value:null,savedAt:null,state:'draft',problem:null});setStatus({state:'error',at:null});}});
  return ()=>{live=false;};
 },[id,schema]);

 const write=useCallback(async()=>{
  const next=pending.current;const where=target.current;pending.current=null;
  if(!next||!where.id||!where.scope)return;
  const payload=serializeDraft(next.value);
  if(payload===null){setStatus({state:'tooLarge',at:null});return;}
  const now=Date.now();setStatus(current=>({state:'saving',at:current.at}));
  try{
   await draftStore.save({id:where.id,scope:where.scope,feature,context,formVersion:draftFeatures[feature].version,state:draftState.current,title:next.title.trim().slice(0,120),route:next.route,payload,createdAt:now,updatedAt:now});
   notifyDrafts();setStatus({state:'saved',at:now});
  }catch{setStatus({state:'error',at:null});}
 },[feature,context]);

 /** Call on every change; writes are coalesced so typing does not hit the disk on each key. */
 const schedule=useCallback((value:T,title:string,route:DraftRoute)=>{
  if(!target.current.id)return;
  pending.current={value,title,route};
  if(timer.current)clearTimeout(timer.current);
  timer.current=setTimeout(()=>{timer.current=null;void write();},SAVE_DELAY_MS);
 },[write]);

 /** Keeps the content but warns on return that the last send got no answer. */
 const markUnconfirmed=useCallback((value:T,title:string,route:DraftRoute)=>{
  draftState.current='unconfirmed';pending.current={value,title,route};
  if(timer.current){clearTimeout(timer.current);timer.current=null;}
  void write();
 },[write]);

 /** After a confirmed send or an explicit discard. */
 const discard=useCallback(async()=>{
  if(timer.current){clearTimeout(timer.current);timer.current=null;}
  pending.current=null;draftState.current='draft';
  const current=target.current.id;setStatus({state:'idle',at:null});
  setLoaded(previous=>previous&&{...previous,value:null,savedAt:null,state:'draft',problem:null});
  if(current){try{await draftStore.remove(current);}finally{notifyDrafts();}}
 },[]);

 // Leaving the screen saves what was typed in the last moment.
 useEffect(()=>()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;void write();}},[write]);

 const ready=!id||loaded?.id===id;
 const mine=loaded?.id===id?loaded:null;
 return {enabled:!!id,ready,restored:mine?.value??null,restoredAt:mine?.savedAt??null,unconfirmed:mine?.state==='unconfirmed',problem:mine?.problem??null,status,schedule,markUnconfirmed,discard};
}
