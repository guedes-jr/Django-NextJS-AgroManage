import type {AxiosInstance} from 'axios';
import type {Language} from '../i18n/messages';
import {askResultSchema,askSchema,conversationDetailSchema,conversationPageSchema,conversationSchema,quotaSchema} from '../features/assistant/contracts';

type Tokens={access:string};
type Options=(language:Language,access?:string)=>{headers:Record<string,string>};

/** AI assistant endpoints (`/ai/…`) shared with the web; quota and safety stay on the server. */
export function createAssistantEndpoints(http:AxiosInstance,options:Options){
 return {
  async aiUsage(tokens:Tokens,language:Language,signal?:AbortSignal){return quotaSchema.parse((await http.get('ai/usage/',{...options(language,tokens.access),signal})).data);},
  async aiConversations(tokens:Tokens,language:Language,page:number,signal?:AbortSignal){return conversationPageSchema.parse((await http.get('ai/conversations/',{...options(language,tokens.access),params:{page},signal})).data);},
  async aiConversation(tokens:Tokens,language:Language,id:string,signal?:AbortSignal){const row=conversationDetailSchema.parse((await http.get(`ai/conversations/${id}/`,{...options(language,tokens.access),signal})).data);if(row.id!==id)throw Error('assistant scope');return row;},
  async createAiConversation(tokens:Tokens,language:Language,title:string){return conversationSchema.parse((await http.post('ai/conversations/',{title,subject:'general'},options(language,tokens.access))).data);},
  async askAi(tokens:Tokens,language:Language,id:string,question:string){return askResultSchema.parse((await http.post(`ai/conversations/${id}/ask/`,askSchema.parse({question}),{...options(language,tokens.access),timeout:90000})).data);},
 };
}
