import type {AxiosInstance} from 'axios';
import type {Language} from '../i18n/messages';
import {accountSchema,categorySchema,listOrPage,projectionSchema,reversalSchema,settlementSchema,statsSchema,transactionInputSchema,transactionPageSchema,transactionQuerySchema,transactionSchema,type ReversalInput,type SettlementInput,type TransactionInput,type TransactionQuery} from '../features/finance/contracts';

type Tokens={access:string};
type Options=(language:Language,access?:string)=>{headers:Record<string,string>};

/** Finance endpoints shared with the web (`/finance/transactions/…`). Every response is validated before use. */
export function createFinanceEndpoints(http:AxiosInstance,options:Options){
 async function all<T>(url:string,row:Parameters<typeof listOrPage>[0],tokens:Tokens,language:Language,signal?:AbortSignal):Promise<T[]>{
  const result:T[]=[];
  for(let page=1;page<=50;page++){
   const data=listOrPage(row).parse((await http.get(url,{...options(language,tokens.access),params:{page,page_size:100},signal})).data) as T[]|{results:T[];next:string|null};
   if(Array.isArray(data))return data;
   result.push(...data.results);if(!data.next)return result;
  }
  return result;
 }
 return {
  async financeStats(tokens:Tokens,language:Language,signal?:AbortSignal){return statsSchema.parse((await http.get('finance/transactions/stats/',{...options(language,tokens.access),signal})).data);},
  async financeProjection(tokens:Tokens,language:Language,days:number,signal?:AbortSignal){return projectionSchema.parse((await http.get('finance/transactions/projection/',{...options(language,tokens.access),params:{days,include_overdue:true},signal})).data);},
  async financeTransactions(tokens:Tokens,language:Language,query:TransactionQuery,signal?:AbortSignal){
   const q=transactionQuerySchema.parse(query);
   const data=transactionPageSchema.parse((await http.get('finance/transactions/',{...options(language,tokens.access),params:{...q,status:q.status||undefined,search:q.search||undefined,page_size:20},signal})).data);
   if(data.results.some(row=>row.category_type!==q.type||q.status&&row.status!==q.status))throw Error('finance scope');
   return data;
  },
  async financeTransaction(tokens:Tokens,language:Language,id:string,signal?:AbortSignal){const row=transactionSchema.parse((await http.get(`finance/transactions/${id}/`,{...options(language,tokens.access),signal})).data);if(row.id!==id)throw Error('finance scope');return row;},
  financeCategories(tokens:Tokens,language:Language,signal?:AbortSignal){return all<import('../features/finance/contracts').FinanceCategory>('finance/categories/',categorySchema,tokens,language,signal);},
  financeAccounts(tokens:Tokens,language:Language,signal?:AbortSignal){return all<import('../features/finance/contracts').FinanceAccount>('finance/accounts/',accountSchema,tokens,language,signal);},
  async createFinanceTransaction(tokens:Tokens,language:Language,input:TransactionInput){
   const v=transactionInputSchema.parse(input);
   return transactionSchema.parse((await http.post('finance/transactions/',{description:v.description,amount:v.amount,category:v.category,due_date:v.due_date,bank_account:v.bank_account,farm:v.farm,notes:v.notes,status:'pending'},options(language,tokens.access))).data);
  },
  async settleFinanceTransaction(tokens:Tokens,language:Language,id:string,input:SettlementInput){await http.post(`finance/transactions/${id}/settle/`,settlementSchema.parse(input),options(language,tokens.access));},
  async reverseFinanceTransaction(tokens:Tokens,language:Language,id:string,input:ReversalInput){await http.post(`finance/transactions/${id}/reverse/`,reversalSchema.parse(input),options(language,tokens.access));},
 };
}
