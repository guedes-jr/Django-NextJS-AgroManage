import type {AxiosInstance} from 'axios';
import type {Language} from '../i18n/messages';
import {memberListSchema} from '../features/team/contracts';

type Tokens={access:string};
type Options=(language:Language,access?:string)=>{headers:Record<string,string>};
export function createTeamEndpoints(http:AxiosInstance,options:Options){
 return {async teamMembers(tokens:Tokens,language:Language,signal?:AbortSignal){return memberListSchema.parse((await http.get('auth/members/',{...options(language,tokens.access),signal})).data);}};
}
