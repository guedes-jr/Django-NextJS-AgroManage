import {CsvFileError,isPickerCacheCopy,loadCsvSelection,type LoadedCsv} from '../../features/cattle/csvFile';
/** Native implementation; web resolves cattleCsvPicker.web.ts. */
export async function pickCattleCsv():Promise<LoadedCsv|null>{
 try{
  const [{getDocumentAsync},{File,Paths,FileMode}]=await Promise.all([import('expo-document-picker'),import('expo-file-system')]);
  const picked=await getDocumentAsync({type:['text/csv','text/comma-separated-values','application/csv','text/plain','application/vnd.ms-excel'],multiple:false,copyToCacheDirectory:true});
  if(picked.canceled)return null;
  const asset=picked.assets[0];if(!asset)throw new CsvFileError('read');
  const file=new File(asset.uri);
  return await loadCsvSelection({name:asset.name,size:asset.size,read:async limit=>{
   if(file.size>limit-1)throw new CsvFileError('size');
   const handle=file.open(FileMode.ReadOnly);
   try{return await handle.readBytes(limit);}finally{handle.close();}
  },dispose:async()=>{if(isPickerCacheCopy(file.uri,Paths.cache.uri))await file.delete();}});
 }catch(error){throw error instanceof CsvFileError?error:new CsvFileError('read');}
}
