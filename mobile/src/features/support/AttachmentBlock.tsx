import {useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {randomUUID} from 'expo-crypto';
import {isAxiosError} from 'axios';
import type {Language} from '../../i18n/messages';
import {AgendaButton} from '../agenda/ui';
import {Notice} from '../../components/mobile';
import {colors,radius,space} from '../../theme/tokens';
import {AttachmentFileError,openAttachment,pickAttachment} from '../../services/files/attachmentFiles';
import {attachmentLimits,attachmentProblem,formatBytes,type PickSource,type PickedFile,type TicketAttachment} from './attachments';
import {supportMessages} from './messages';

type Pending={file:PickedFile;key:string;state:'uploading'|'retry'};
type Props={
 attachments:TicketAttachment[];canAttach:boolean;language:Language;
 /** Uploads to this message with the ticket's current version; the caller reloads the conversation afterwards. */
 upload:(file:PickedFile,requestKey:string)=>Promise<unknown>;
 /** Resolves the authorized download request right before opening. */
 request:(attachmentId:string)=>Promise<{url:string;headers:Record<string,string>}>;
};

const serverText=(error:unknown)=>{
 if(!isAxiosError(error)||!error.response?.data||typeof error.response.data!=='object')return '';
 const data=error.response.data as Record<string,unknown>;const detail=(data.error as {detail?:unknown}|undefined)?.detail??data.detail??data;
 if(typeof detail==='string')return detail;
 return Object.values(detail as Record<string,unknown>).flat().filter(value=>typeof value==='string').join(' ').slice(0,300);
};

/**
 * Attachments of one ticket message. Upload follows the web contract: the file goes to an existing
 * message the user wrote, one at a time, and a retry reuses the request key so the server returns
 * the same attachment instead of creating a duplicate.
 */
export function AttachmentBlock({attachments,canAttach,language,upload,request}:Props){
 const t=supportMessages[language];
 const [choosing,setChoosing]=useState(false);const [pending,setPending]=useState<Pending|null>(null);
 const [notice,setNotice]=useState<{text:string;tone:'danger'|'success'|'warning'}|null>(null);const [opening,setOpening]=useState<string|null>(null);
 const lock=useRef(false);
 const room=canAttach&&attachments.length<attachmentLimits.perMessage;

 const send=async(next:Pending)=>{
  if(lock.current)return;lock.current=true;setPending({...next,state:'uploading'});setNotice(null);
  try{await upload(next.file,next.key);setPending(null);setNotice({text:t.uploaded,tone:'success'});}
  catch(error){
   const status=isAxiosError(error)?error.response?.status:undefined;
   if(status===409){setPending({...next,state:'retry'});setNotice({text:t.changed,tone:'warning'});}
   else if(status&&status<500){setPending(null);setNotice({text:serverText(error)||t.failed,tone:'danger'});}
   else{setPending({...next,state:'retry'});setNotice({text:t.uploadUnknown,tone:'warning'});}
  }finally{lock.current=false;}
 };
 const choose=async(source:PickSource)=>{
  setChoosing(false);setNotice(null);
  try{
   const file=await pickAttachment(source);if(!file)return;
   const problem=attachmentProblem(file,attachments.length);
   if(problem){setNotice({text:problem==='format'?t.errFormat:problem==='size'?t.errSize:t.errLimit,tone:'danger'});return;}
   await send({file,key:randomUUID(),state:'uploading'});
  }catch(error){
   const reason=error instanceof AttachmentFileError?error.reason:'read';
   setNotice({text:reason==='permission'?t.errPermission:reason==='unsupported'?t.errUnsupported:t.errPick,tone:'danger'});
  }
 };
 const open=async(attachment:TicketAttachment)=>{
  if(opening)return;setOpening(attachment.id);setNotice(null);
  try{await openAttachment(await request(attachment.id),attachment);}
  catch(error){
   const reason=error instanceof AttachmentFileError?error.reason:'read';
   setNotice({text:reason==='share'?t.errShare:reason==='unsupported'?t.errUnsupported:t.errOpen,tone:'danger'});
  }finally{setOpening(null);}
 };

 if(!attachments.length&&!room&&!pending)return null;
 return <View style={{gap:space.xs}}>
  {attachments.map(attachment=><Pressable key={attachment.id} accessibilityRole="button" accessibilityLabel={`${t.openAttachment}: ${attachment.filename}`} accessibilityState={{busy:opening===attachment.id,disabled:!!opening}} disabled={!!opening} onPress={()=>void open(attachment)}
   style={({pressed})=>({minHeight:44,justifyContent:'center',paddingHorizontal:space.sm,paddingVertical:6,borderRadius:radius.md,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:pressed?colors.primarySoft:colors.surface,opacity:opening&&opening!==attachment.id?0.6:1})}>
   <Text style={{fontSize:14,fontWeight:'600',color:colors.primary}} numberOfLines={2}>{attachment.filename}</Text>
   <Text style={{fontSize:12,color:colors.muted,fontVariant:['tabular-nums']}}>{opening===attachment.id?`${formatBytes(attachment.size,language)} · …`:formatBytes(attachment.size,language)}</Text>
  </Pressable>)}
  {pending&&<View style={{gap:space.xs,padding:space.sm,borderRadius:radius.md,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface}}>
   <Text style={{fontSize:14,color:colors.text}} numberOfLines={2}>{pending.file.name}</Text>
   {pending.state==='uploading'?<Text style={{fontSize:12,color:colors.muted}}>{t.uploading}</Text>
    :<View style={{flexDirection:'row',flexWrap:'wrap',gap:space.sm}}>
     <AgendaButton variant="secondary" style={{flexGrow:1}} label={t.retryUpload} onPress={()=>void send(pending)}/>
     <AgendaButton style={{flexGrow:1}} label={t.discard} onPress={()=>{setPending(null);setNotice(null);}}/>
    </View>}
  </View>}
  {room&&!pending&&(choosing
   ?<View style={{flexDirection:'row',flexWrap:'wrap',gap:space.sm}}>
     {(['camera','library','document'] as const).map(source=><AgendaButton key={source} style={{flexGrow:1}} label={source==='camera'?t.camera:source==='library'?t.gallery:t.file} onPress={()=>void choose(source)}/>)}
    </View>
   :<Pressable accessibilityRole="button" accessibilityLabel={t.attach} accessibilityHint={t.attachHint} onPress={()=>{setChoosing(true);setNotice(null);}} hitSlop={8} style={{minHeight:44,justifyContent:'center',alignSelf:'flex-start'}}>
     <Text style={{fontSize:14,fontWeight:'700',color:colors.primary}}>{`+ ${t.attach}`}</Text>
    </Pressable>)}
  {choosing&&<Text style={{fontSize:12,color:colors.muted}}>{t.attachHint}</Text>}
  {notice&&<Notice tone={notice.tone} text={notice.text}/>}
 </View>;
}
