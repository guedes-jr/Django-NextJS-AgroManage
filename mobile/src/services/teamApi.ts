import type {AxiosInstance} from 'axios';
import {z} from 'zod';
import type {Language} from '../i18n/messages';
import {memberListSchema,memberOptionsSchema,memberSchema} from '../features/team/contracts';

type Tokens={access:string};
type Options=(language:Language,access?:string)=>{headers:Record<string,string>};
export function createTeamEndpoints(http:AxiosInstance,options:Options){
 return {
  async teamMembers(tokens:Tokens,language:Language,signal?:AbortSignal){return memberListSchema.parse((await http.get('auth/members/',{...options(language,tokens.access),signal})).data);},
  async memberOptions(tokens:Tokens,language:Language,signal?:AbortSignal){return memberOptionsSchema.parse((await http.get('auth/operator-options/',{...options(language,tokens.access),signal})).data);},
  async createMember(tokens:Tokens,language:Language,body:Record<string,unknown>){return memberSchema.parse((await http.post('auth/members/create/',body,options(language,tokens.access))).data);},
  async updateMember(tokens:Tokens,language:Language,id:string,body:Record<string,unknown>){z.uuid().parse(id);return memberSchema.parse((await http.patch(`auth/members/${id}/`,body,options(language,tokens.access))).data);},
 };
}
