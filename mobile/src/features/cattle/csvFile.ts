/** Bounded local CSV loading. CSV structure/domain validation stays on the API. */
export const CSV_MAX_BYTES=800000,CSV_MAX_CHARACTERS=200000;
export type CsvFileErrorCode='type'|'size'|'encoding'|'empty'|'read';
export class CsvFileError extends Error {constructor(readonly code:CsvFileErrorCode){super(code);}}
export type LoadedCsv={name:string;text:string};
export type CsvSelection={name:string;size?:number;read:(limit:number)=>Promise<Uint8Array>;dispose?:()=>Promise<void>};
export function decodeCsvBytes(bytes:Uint8Array):string{
 if(bytes.length>CSV_MAX_BYTES)throw new CsvFileError('size');
 const output:string[]=[];let characters=0;
 for(let i=0;i<bytes.length;){const first=bytes[i++]!;let value=first,length=0,min=0;
  if(first<=0x7f){if(first<32&&![9,10,13].includes(first))throw new CsvFileError('encoding');}
  else if(first>=0xc2&&first<=0xdf){value=first&31;length=1;min=0x80;}
  else if(first>=0xe0&&first<=0xef){value=first&15;length=2;min=0x800;}
  else if(first>=0xf0&&first<=0xf4){value=first&7;length=3;min=0x10000;}
  else throw new CsvFileError('encoding');
  for(let n=0;n<length;n++){const next=bytes[i++];if(next===undefined||(next&0xc0)!==0x80)throw new CsvFileError('encoding');value=(value<<6)|(next&63);}
  if(value<min||value>0x10ffff||value>=0xd800&&value<=0xdfff)throw new CsvFileError('encoding');
  characters+=value>0xffff?2:1;if(characters>CSV_MAX_CHARACTERS)throw new CsvFileError('size');output.push(String.fromCodePoint(value));
 }
 const text=output.join('');if(!text.trim())throw new CsvFileError('empty');return text;
}
export async function loadCsvSelection(selection:CsvSelection):Promise<LoadedCsv>{
 try{
  if(!selection.name.toLowerCase().endsWith('.csv'))throw new CsvFileError('type');
  if(selection.size!==undefined&&(!Number.isFinite(selection.size)||selection.size<0||selection.size>CSV_MAX_BYTES))throw new CsvFileError('size');
  const bytes=await selection.read(CSV_MAX_BYTES+1);return {name:selection.name,text:decodeCsvBytes(bytes)};
 }catch(error){throw error instanceof CsvFileError?error:new CsvFileError('read');}
 finally{try{await selection.dispose?.();}catch{/* OS-managed cache cleanup is best effort. */}}
}
export function isPickerCacheCopy(uri:string,cache:string){
 const prefix=`${cache.replace(/\/?$/,'/')}DocumentPicker/`;if(!uri.startsWith(prefix))return false;
 try{const name=decodeURIComponent(uri.slice(prefix.length));return !!name&&name!=='.'&&name!=='..'&&!/[\\/#?]/.test(name);}catch{return false;}
}
