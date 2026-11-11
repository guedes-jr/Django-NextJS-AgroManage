import {loadCsvSelection,type LoadedCsv} from '../../features/cattle/csvFile';
/** User-activated File input: native picker cancellation differs on web. */
export function pickCattleCsv():Promise<LoadedCsv|null>{
 return new Promise((resolve,reject)=>{
  const input=document.createElement('input');input.type='file';input.accept='.csv,text/csv,application/csv,text/plain,application/vnd.ms-excel';input.multiple=false;input.hidden=true;
  let handling=false,settled=false,timer:ReturnType<typeof setTimeout>|undefined;
  const cleanup=()=>{if(timer)clearTimeout(timer);window.removeEventListener('focus',focus);window.removeEventListener('pagehide',cancel);input.removeEventListener('change',change);input.removeEventListener('cancel',cancel);input.remove();};
  const finish=(result:LoadedCsv|null,error?:unknown)=>{if(settled)return;settled=true;cleanup();if(error)reject(error);else resolve(result);};
  const cancel=()=>{if(!handling)finish(null);};
  const change=()=>{if(handling||settled)return;const file=input.files?.[0];if(!file){finish(null);return;}handling=true;void loadCsvSelection({name:file.name,size:file.size,read:async limit=>new Uint8Array(await file.slice(0,limit).arrayBuffer())}).then(result=>finish(result),error=>finish(null,error));};
  const focus=()=>{timer=setTimeout(()=>{if(!handling&&!settled){if(input.files?.length)change();else cancel();}},500);};
  input.addEventListener('change',change);input.addEventListener('cancel',cancel);window.addEventListener('focus',focus);window.addEventListener('pagehide',cancel);document.body.appendChild(input);
  try{input.click();}catch(error){finish(null,error);}
 });
}
