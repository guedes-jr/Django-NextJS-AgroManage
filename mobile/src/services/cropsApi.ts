import type {AxiosInstance} from 'axios';
import type {Language} from '../i18n/messages';
import {activitySchema,cropFieldListSchema,cropItemListSchema,cropsDashboardSchema,plantationInputSchema,type PlantationInput,activityFilter,activityPageSchema,plantationDashboardSchema,plantationPageSchema,plantationQuerySchema,plantationSchema,type CropActivityKind,type PlantationQuery} from '../features/crops/contracts';

type Tokens={access:string};
type Options=(language:Language,access?:string)=>{headers:Record<string,string>};

/** Read-only crop endpoints shared with the web; cost-bearing writes stay on the web (single finance sync path). */
export function createCropsEndpoints(http:AxiosInstance,options:Options){
 return {
  async plantations(tokens:Tokens,language:Language,query:PlantationQuery,signal?:AbortSignal){
   const q=plantationQuerySchema.parse(query);
   const data=plantationPageSchema.parse((await http.get('crops/plantations/',{...options(language,tokens.access),params:{page:q.page,page_size:20,status:q.status||undefined,search:q.search||undefined,farm:q.farm},signal})).data);
   if(data.results.some(row=>q.status&&row.status!==q.status||q.farm&&row.farm&&row.farm!==q.farm))throw Error('crops scope');
   return data;
  },
  async plantation(tokens:Tokens,language:Language,id:string,signal?:AbortSignal){const row=plantationSchema.parse((await http.get(`crops/plantations/${id}/`,{...options(language,tokens.access),signal})).data);if(row.id!==id)throw Error('crops scope');return row;},
  async plantationDashboard(tokens:Tokens,language:Language,id:string,signal?:AbortSignal){const row=plantationDashboardSchema.parse((await http.get(`crops/plantations/${id}/dashboard/`,{...options(language,tokens.access),signal})).data);if(row.id!==id)throw Error('crops scope');return row;},
  async cropsDashboard(tokens:Tokens,language:Language,signal?:AbortSignal){return cropsDashboardSchema.parse((await http.get('crops/dashboard/',{...options(language,tokens.access),signal})).data);},
  async cropFields(tokens:Tokens,language:Language,signal?:AbortSignal){return cropFieldListSchema.parse((await http.get('crops/fields/',{...options(language,tokens.access),params:{page_size:200},signal})).data);},
  async cropItems(tokens:Tokens,language:Language,categories:string[],signal?:AbortSignal){
   const lists=await Promise.all(categories.map(async categoria=>cropItemListSchema.parse((await http.get('inventory/items/all_items/',{...options(language,tokens.access),params:{categoria},signal})).data)));
   const seen=new Set<string>();return lists.flat().filter(row=>row.ativo!==false&&!seen.has(row.id)&&seen.add(row.id));
  },
  async savePlantation(tokens:Tokens,language:Language,input:PlantationInput,id?:string){
   const v=plantationInputSchema.parse(input);const payload={...v,name:v.name||`${v.crop_name} ${v.planting_date.slice(0,4)}`};
   const response=id?await http.patch(`crops/plantations/${id}/`,payload,options(language,tokens.access)):await http.post('crops/plantations/',payload,options(language,tokens.access));
   return plantationSchema.parse(response.data);
  },
  async createCropOperation(tokens:Tokens,language:Language,kind:string,payload:Record<string,unknown>){
   return activitySchema.parse((await http.post(`crops/${kind}/`,payload,options(language,tokens.access))).data);
  },
  async cropActivities(tokens:Tokens,language:Language,kind:CropActivityKind,plantation:string,page:number,signal?:AbortSignal){
   return activityPageSchema.parse((await http.get(`crops/${kind}/`,{...options(language,tokens.access),params:{[activityFilter[kind]]:plantation,page,page_size:20},signal})).data);
  },
 };
}
