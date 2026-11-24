import type {AxiosInstance} from 'axios';
import type {Language} from '../i18n/messages';
import {structurePageSchema,structureQuerySchema,structureSchema,type StructureQuery} from '../features/structures/contracts';

type Tokens={access:string};
type Options=(language:Language,access?:string)=>{headers:Record<string,string>};

/** Read-only farm structure endpoints shared with the web registry. */
export function createStructureEndpoints(http:AxiosInstance,options:Options){
 return {
  async farmStructures(tokens:Tokens,language:Language,query:StructureQuery,signal?:AbortSignal){
   const q=structureQuerySchema.parse(query);
   const data=structurePageSchema.parse((await http.get('farms/structures/',{...options(language,tokens.access),params:{page:q.page,page_size:20,category:q.category||undefined,search:q.search||undefined,farm:q.farm,is_active:true},signal})).data);
   if(data.results.some(row=>q.category&&row.category!==q.category||q.farm&&row.farm!==q.farm))throw Error('structure scope');
   return data;
  },
  async farmStructure(tokens:Tokens,language:Language,id:string,signal?:AbortSignal){const row=structureSchema.parse((await http.get(`farms/structures/${id}/`,{...options(language,tokens.access),signal})).data);if(row.id!==id)throw Error('structure scope');return row;},
 };
}
