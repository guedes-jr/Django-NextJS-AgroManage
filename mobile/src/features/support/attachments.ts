import {z} from 'zod';

/** Same limits enforced by `ticket_services.upload_attachment`; the server stays the authority. */
export const attachmentLimits={maxBytes:10*1024*1024,perMessage:5,extensions:['pdf','txt','csv','png','jpg','jpeg','webp','xlsx','docx','zip']} as const;
export const attachmentSchema=z.object({id:z.string(),filename:z.string(),size:z.number().nonnegative()});
export type TicketAttachment=z.infer<typeof attachmentSchema>;

/** A local file chosen from the camera, gallery or file picker, ready for multipart upload. */
export type PickedFile={uri:string;name:string;size:number|null;mimeType:string};
export type PickSource='camera'|'library'|'document';
export type AttachmentProblem='format'|'size'|'limit';

const extension=(value:string)=>{const match=/\.([a-z0-9]+)$/i.exec(value.split(/[?#]/)[0]??'');return match?.[1]?.toLowerCase()??'';};
const allowed=(ext:string)=>(attachmentLimits.extensions as readonly string[]).includes(ext);

/** Pre-checks a file before upload so the user is not asked to wait for a predictable rejection. */
export function attachmentProblem(file:{name:string;size:number|null},existing:number):AttachmentProblem|null{
 if(existing>=attachmentLimits.perMessage)return 'limit';
 if(!allowed(extension(file.name)))return 'format';
 if(file.size!==null&&(file.size<=0||file.size>attachmentLimits.maxBytes))return 'size';
 return null;
}

/**
 * Upload name for a picked file. Camera and gallery assets may arrive without a name or with the
 * original HEIC name while the exported file is JPEG, so the real file extension wins.
 */
export function attachmentName(original:string|null|undefined,uri:string,fallback:string){
 const real=extension(uri);const given=(original??'').trim().split(/[\\/]/).pop()??'';
 const stem=(given.replace(/\.[^.]*$/,'')||fallback).replace(/[^\p{L}\p{N}._ -]+/gu,'_').slice(0,120);
 const ext=allowed(extension(given))?extension(given):allowed(real)?real:extension(given)||real;
 return ext?`${stem}.${ext}`:stem;
}

const mimeTypes:Record<string,string>={pdf:'application/pdf',txt:'text/plain',csv:'text/csv',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',zip:'application/zip',
 xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
export const attachmentMime=(name:string,given?:string|null)=>given||mimeTypes[extension(name)]||'application/octet-stream';

export function formatBytes(size:number,language:string){
 const kb=size/1024;const format=(value:number)=>new Intl.NumberFormat(language,{maximumFractionDigits:1}).format(value);
 return kb>=1024?`${format(kb/1024)} MB`:`${format(Math.max(kb,0.1))} KB`;
}
