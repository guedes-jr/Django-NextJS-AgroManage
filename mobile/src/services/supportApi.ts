import type {AxiosInstance} from 'axios';
import type {Language} from '../i18n/messages';
import {messagePageSchema,messageSchema,openTicketSchema,replySchema,ticketPageSchema,ticketQuerySchema,ticketSchema,type OpenTicketInput,type ReplyInput,type TicketQuery} from '../features/support/contracts';
import {z} from 'zod';
import {attachmentSchema,type PickedFile} from '../features/support/attachments';

type Tokens={access:string};
type Options=(language:Language,access?:string)=>{headers:Record<string,string>};

/** Customer ticket endpoints (`/support/tickets/`), the same ones used by the web help center. */
export function createSupportEndpoints(http:AxiosInstance,options:Options){
 return {
  async supportTickets(tokens:Tokens,language:Language,query:TicketQuery,signal?:AbortSignal){
   const q=ticketQuerySchema.parse(query);
   const data=ticketPageSchema.parse((await http.get('support/tickets/',{...options(language,tokens.access),params:{page:q.page,status:q.status||undefined,search:q.search||undefined},signal})).data);
   if(q.status&&data.results.some(row=>row.status!==q.status))throw Error('support scope');
   return data;
  },
  async supportTicket(tokens:Tokens,language:Language,id:string,signal?:AbortSignal){const row=ticketSchema.parse((await http.get(`support/tickets/${id}/`,{...options(language,tokens.access),signal})).data);if(row.id!==id)throw Error('support scope');return row;},
  async supportMessages(tokens:Tokens,language:Language,id:string,page:number,signal?:AbortSignal){return messagePageSchema.parse((await http.get(`support/tickets/${id}/messages/`,{...options(language,tokens.access),params:{page},signal})).data);},
  async openSupportTicket(tokens:Tokens,language:Language,input:OpenTicketInput){return ticketSchema.parse((await http.post('support/tickets/',openTicketSchema.parse(input),options(language,tokens.access))).data);},
  async replySupportTicket(tokens:Tokens,language:Language,id:string,input:ReplyInput){return z.object({ticket:ticketSchema,message:messageSchema}).parse((await http.post(`support/tickets/${id}/messages/`,replySchema.parse(input),options(language,tokens.access))).data);},
  async uploadSupportAttachment(tokens:Tokens,language:Language,id:string,messageId:string,file:PickedFile,expected_version:number,request_key:string){return uploadAttachment(http,`support/tickets/${z.uuid().parse(id)}/messages/${z.uuid().parse(messageId)}/attachments/`,options(language,tokens.access),file,expected_version,request_key,ticketSchema);},
  supportAttachmentRequest(tokens:Tokens,language:Language,id:string,attachmentId:string){return {url:http.getUri({url:`support/tickets/${z.uuid().parse(id)}/attachments/${z.uuid().parse(attachmentId)}/download/`}),headers:options(language,tokens.access).headers};},
  async transitionSupportTicket(tokens:Tokens,language:Language,id:string,status:'resolved'|'closed'|'open',expected_version:number){return ticketSchema.parse((await http.post(`support/tickets/${id}/transition/`,{status,expected_version},options(language,tokens.access))).data);},
 };
}

/**
 * Multipart upload shared by the customer and team ticket endpoints. React Native builds the body from
 * `{uri,name,type}`; the same request key lets the server recognise a retry of the same file.
 */
export async function uploadAttachment<T extends z.ZodTypeAny>(http:AxiosInstance,path:string,base:{headers:Record<string,string>},file:PickedFile,expected_version:number,request_key:string,ticket:T){
 const form=new FormData();
 form.append('file',{uri:file.uri,name:file.name,type:file.mimeType} as unknown as Blob);
 form.append('expected_version',String(z.number().int().min(1).parse(expected_version)));
 form.append('request_key',z.uuid().parse(request_key));
 const response=await http.post(path,form,{headers:{...base.headers,'Content-Type':'multipart/form-data'},timeout:120000,transformRequest:data=>data});
 return z.object({ticket,attachment:attachmentSchema}).parse(response.data) as {ticket:z.infer<T>;attachment:z.infer<typeof attachmentSchema>};
}
