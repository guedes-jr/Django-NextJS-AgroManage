import type {AxiosInstance} from 'axios';
import {z} from 'zod';
import type {Language} from '../i18n/messages';
import {discountOverviewSchema,passwordResetSchema,platformDashboardSchema,platformOrganizationPageSchema,platformOrganizationSchema,platformStaffSchema,platformUserPageSchema,platformUserSchema,segmentOverviewSchema,statusActions,type PasswordReset} from '../features/platform/contracts';

type Tokens={access:string};
type Options=(language:Language,access?:string)=>{headers:Record<string,string>};
const uuid=(value:string)=>z.uuid().parse(value);

/** Backoffice endpoints (platform/*): the API checks the platform role on every call. */
export function createPlatformEndpoints(http:AxiosInstance,options:Options){
 const get=async<T extends z.ZodTypeAny>(schema:T,path:string,tokens:Tokens,language:Language,params?:Record<string,unknown>,signal?:AbortSignal):Promise<z.infer<T>>=>schema.parse((await http.get(path,{...options(language,tokens.access),params,signal})).data);
 return {
  async platformMe(tokens:Tokens,language:Language){return get(platformStaffSchema,'platform/me/',tokens,language);},
  async platformDashboard(tokens:Tokens,language:Language,signal?:AbortSignal){return get(platformDashboardSchema,'platform/dashboard/',tokens,language,undefined,signal);},
  async platformOrganizations(tokens:Tokens,language:Language,query:{page:number;search:string;status:string},signal?:AbortSignal){
   return get(platformOrganizationPageSchema,'platform/organizations/',tokens,language,{page:query.page,...(query.search?{search:query.search.slice(0,120)}:{}),...(query.status?{status:query.status}:{})},signal);
  },
  async platformOrganization(tokens:Tokens,language:Language,id:string,signal?:AbortSignal){return get(platformOrganizationSchema,`platform/organizations/${uuid(id)}/`,tokens,language,undefined,signal);},
  async platformOrganizationSegments(tokens:Tokens,language:Language,id:string,signal?:AbortSignal){return get(segmentOverviewSchema,`platform/organizations/${uuid(id)}/segments/`,tokens,language,undefined,signal);},
  async platformOrganizationDiscounts(tokens:Tokens,language:Language,id:string,signal?:AbortSignal){return get(discountOverviewSchema,`platform/organizations/${uuid(id)}/discounts/`,tokens,language,undefined,signal);},
  async platformRevokeDiscount(tokens:Tokens,language:Language,id:string,discount:string){return discountOverviewSchema.parse((await http.post(`platform/organizations/${uuid(id)}/discounts/${uuid(discount)}/revoke/`,{},options(language,tokens.access))).data);},
  async platformOrganizationStatus(tokens:Tokens,language:Language,id:string,status:keyof typeof statusActions,reason:string){
   await http.post(`platform/organizations/${uuid(id)}/${statusActions[status]}/`,{reason:reason.trim().slice(0,1000)},options(language,tokens.access));
  },
  async platformUsers(tokens:Tokens,language:Language,query:{page:number;search:string;organization?:string},signal?:AbortSignal){
   return get(platformUserPageSchema,'platform/users/',tokens,language,{page:query.page,...(query.search?{search:query.search.slice(0,120)}:{}),...(query.organization?{organization:uuid(query.organization)}:{})},signal);
  },
  async platformUser(tokens:Tokens,language:Language,id:string,signal?:AbortSignal){return get(platformUserSchema,`platform/users/${uuid(id)}/`,tokens,language,undefined,signal);},
  async platformUpdateUser(tokens:Tokens,language:Language,id:string,body:Record<string,unknown>){return platformUserSchema.parse((await http.patch(`platform/users/${uuid(id)}/`,body,options(language,tokens.access))).data);},
  async platformSetPassword(tokens:Tokens,language:Language,id:string,input:PasswordReset){return platformUserSchema.parse((await http.post(`platform/users/${uuid(id)}/set-password/`,passwordResetSchema.parse(input),options(language,tokens.access))).data);},
  async platformUserAction(tokens:Tokens,language:Language,id:string,action:'block'|'activate'|'revoke-sessions'){await http.post(`platform/users/${uuid(id)}/${action}/`,{},options(language,tokens.access));},
 };
}
