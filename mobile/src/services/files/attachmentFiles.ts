import {withSystemUi} from '../../features/security/systemUi';
import {attachmentMime,attachmentName,type PickSource,type PickedFile} from '../../features/support/attachments';

export class AttachmentFileError extends Error{constructor(public reason:'permission'|'read'|'share'|'unsupported'){super(reason);}}

/** Native camera/gallery/file selection; web resolves attachmentFiles.web.ts. Returns null when the user cancels. */
export function pickAttachment(source:PickSource){return withSystemUi(()=>pick(source));}
async function pick(source:PickSource):Promise<PickedFile|null>{
 try{
  if(source==='document'){
   const {getDocumentAsync}=await import('expo-document-picker');
   const picked=await getDocumentAsync({multiple:false,copyToCacheDirectory:true});
   if(picked.canceled)return null;const asset=picked.assets[0];if(!asset)throw new AttachmentFileError('read');
   const name=attachmentName(asset.name,asset.uri,'arquivo');
   return {uri:asset.uri,name,size:asset.size??null,mimeType:attachmentMime(name,asset.mimeType)};
  }
  const picker=await import('expo-image-picker');
  if(source==='camera'){
   const permission=await picker.requestCameraPermissionsAsync();
   if(!permission.granted)throw new AttachmentFileError('permission');
  }
  // The system photo picker needs no library permission; quality < 1 makes iOS export JPEG instead of HEIC.
  const options={mediaTypes:['images'] as ('images')[],quality:0.7,allowsEditing:false,exif:false};
  const result=source==='camera'?await picker.launchCameraAsync(options):await picker.launchImageLibraryAsync(options);
  if(result.canceled)return null;const asset=result.assets[0];if(!asset)throw new AttachmentFileError('read');
  const name=attachmentName(asset.fileName,asset.uri,`foto-${Date.now()}`);
  return {uri:asset.uri,name,size:asset.fileSize??null,mimeType:attachmentMime(name,asset.mimeType)};
 }catch(error){throw error instanceof AttachmentFileError?error:new AttachmentFileError('read');}
}

/** Downloads an authorized attachment into the cache and opens the system share/preview sheet. */
export function openAttachment(request:{url:string;headers:Record<string,string>},attachment:{id:string;filename:string}){return withSystemUi(()=>download(request,attachment));}
async function download(request:{url:string;headers:Record<string,string>},attachment:{id:string;filename:string}){
 const [{Directory,File,Paths},Sharing]=await Promise.all([import('expo-file-system'),import('expo-sharing')]);
 if(!(await Sharing.isAvailableAsync()))throw new AttachmentFileError('share');
 let file:InstanceType<typeof File>;
 try{
  const folder=new Directory(Paths.cache,'support-attachments',attachment.id);
  if(!folder.exists)folder.create({intermediates:true});
  const target=new File(folder,attachment.filename.replace(/[\\/]/g,'_')||'anexo');
  if(target.exists)target.delete();
  file=await File.downloadFileAsync(request.url,target,{headers:request.headers});
 }catch{throw new AttachmentFileError('read');}
 try{await Sharing.shareAsync(file.uri,{dialogTitle:attachment.filename,mimeType:attachmentMime(attachment.filename)});}
 catch{throw new AttachmentFileError('share');}
}
