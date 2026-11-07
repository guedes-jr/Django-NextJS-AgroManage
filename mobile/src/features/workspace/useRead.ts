import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
export function useRead<T>(key:string,load:(signal:AbortSignal)=>Promise<T>,enabled=true){
  const [result,setResult]=useState<{key:string;data:T|null;failed:boolean}>({key:'',data:null,failed:false});
  useFocusEffect(useCallback(()=>{
    if(!enabled)return;
    let active=true;const abort=new AbortController();
    void load(abort.signal).then(data=>{if(active)setResult({key,data,failed:false});}).catch(()=>{if(active)setResult({key,data:null,failed:true});});
    return ()=>{active=false;abort.abort();};
  },[enabled,key,load]));
  return {loading:enabled&&result.key!==key,data:enabled&&result.key===key?result.data:null,failed:enabled&&result.key===key&&result.failed};
}
