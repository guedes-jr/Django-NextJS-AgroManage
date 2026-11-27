import {useCallback,useEffect,useState} from 'react';
import {Alert,Platform} from 'react-native';
import {useAuth} from '../auth/AuthProvider';
import {subscribeDrafts} from './store';
import {draftStore,purgeDrafts,useDraftScope} from './useLocalDraft';
import {draftMessages} from './messages';

/** Native confirm on device; window.confirm only in the web preview. */
export function confirmAction(title:string,body:string,actions:{text:string;style?:'cancel'|'destructive'|'default';onPress?:()=>void}[]){
 if(Platform.OS==='web'){const primary=actions.find(action=>action.style!=='cancel');if(window.confirm(`${title}\n${body}`))primary?.onPress?.();return;}
 Alert.alert(title,body,actions);
}

export function useDraftCount(){
 const scope=useDraftScope();const [count,setCount]=useState(0);
 useEffect(()=>{
  if(!scope)return;let live=true;
  const load=()=>{void draftStore.list(scope).then(rows=>{if(live)setCount(rows.length);}).catch(()=>{});};
  void purgeDrafts(scope).catch(()=>{}).finally(load);const unsubscribe=subscribeDrafts(load);
  return ()=>{live=false;unsubscribe();};
 },[scope]);
 return scope?count:0;
}

/** Voluntary sign-out: drafts are scoped to this account and deleted with it, after an explicit warning. */
export function useSignOutWithDrafts(){
 const {controller,language}=useAuth();const scope=useDraftScope();const count=useDraftCount();const t=draftMessages[language];
 return useCallback(()=>{
  const leave=async()=>{if(scope){try{await draftStore.removeScope(scope);}catch{/* drafts are also unreadable by any other account */}}await controller.signOut();};
  if(!count){void controller.signOut();return;}
  confirmAction(t.logoutTitle,t.logoutBody.replace('{count}',String(count)),[{text:t.cancel,style:'cancel'},{text:t.logoutConfirm,style:'destructive',onPress:()=>void leave()}]);
 },[controller,count,scope,t]);
}

