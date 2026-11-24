import type {AxiosInstance} from 'axios';
import type {Language} from '../i18n/messages';
import {messagePageSchema,messageSchema,openTicketSchema,replySchema,ticketPageSchema,ticketQuerySchema,ticketSchema,type OpenTicketInput,type ReplyInput,type TicketQuery} from '../features/support/contracts';
import {z} from 'zod';

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
  async transitionSupportTicket(tokens:Tokens,language:Language,id:string,status:'resolved'|'closed'|'open',expected_version:number){return ticketSchema.parse((await http.post(`support/tickets/${id}/transition/`,{status,expected_version},options(language,tokens.access))).data);},
 };
}
