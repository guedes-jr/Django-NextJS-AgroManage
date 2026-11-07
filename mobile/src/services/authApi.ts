import { milkSummarySchema,milkQuerySchema,milkCowPageSchema,milkRecordPageSchema,milkTotalPageSchema,milkRecordSchema,milkTotalSchema,milkCommandSchema,milkPayload,type MilkQuery,type MilkCommand,type MilkValues } from '../features/milk/contracts';
import { cattleQuerySchema, productionSchema, ensureCattleScope, animalPageSchema, batchPageSchema, animalSchema, batchSchema, historyPageSchema, animalPayload, type AnimalInput, type WeightInput, type CattleQuery, type CattleKind, type Production } from '../features/cattle/contracts';
import { farmsSchema, profileSchema, parseSearch, searchQuerySchema, type SearchQuery } from '../features/workspace/contracts';
import { agendaQuerySchema, agendaPageSchema, taskSchema, taskOptionsSchema, taskInputSchema, type TaskInput, type AgendaQuery } from '../features/agenda/contracts';
import { create, isAxiosError, type AxiosInstance } from 'axios';
import { z, ZodError } from 'zod';
import { dashboardSchema } from '../features/home/contracts';
import type { Language, MessageKey } from '../i18n/messages';
import { tokensSchema, userSchema, organizationSchema, registrationSchema, type Credentials, type Tokens, type Registration, type RegistrationField } from '../features/auth/contracts';

export class AuthFailure extends Error {
  constructor(public readonly key: MessageKey, public readonly detail?: string) { super(key); }
}
export class RegistrationFailure extends AuthFailure {
  constructor(public readonly fields: Partial<Record<RegistrationField, string>>, detail?: string) { super('registrationFailed', detail); }
}
export function registrationError(error: unknown): AuthFailure {
  if (error instanceof RegistrationFailure) return error;
  if (isAxiosError(error) && error.response && [400, 409, 422].includes(error.response.status)) {
    const data = error.response.data;
    const detail = data?.error?.detail ?? data;
    const fields: Partial<Record<RegistrationField, string>> = {};
    for (const field of ['full_name', 'email', 'phone', 'phone_is_whatsapp', 'receive_system_alerts', 'password', 'password_confirm'] as const) {
      const value = detail?.[field];
      const message = typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;
      if (message) fields[field] = message.slice(0, 400);
    }
    const message = typeof detail?.detail === 'string' ? detail.detail
      : Array.isArray(detail?.non_field_errors) && typeof detail.non_field_errors[0] === 'string' ? detail.non_field_errors[0] : undefined;
    return new RegistrationFailure(fields, message?.slice(0, 400));
  }
  const failure = authError(error);
  if (failure.key === 'network') return new AuthFailure('registrationUnconfirmed');
  if (failure.key === 'invalidCredentials') return new AuthFailure('registrationFailed', failure.detail);
  return failure;
}
export function authError(error: unknown): AuthFailure {
  if (error instanceof AuthFailure) return error;
  if (error instanceof ZodError) return new AuthFailure('invalidResponse');
  if (isAxiosError(error)) {
    if (!error.response) return new AuthFailure('network');
    const { status, data } = error.response;
    if (status === 401) return new AuthFailure('expired');
    // Only expected client-facing validation messages, never raw 5xx bodies.
    const message = typeof data?.detail === 'string' ? data.detail
      : Array.isArray(data?.non_field_errors) && typeof data.non_field_errors[0] === 'string' ? data.non_field_errors[0] : undefined;
    if (status >= 400 && status < 500) return new AuthFailure('invalidCredentials', message?.slice(0, 400));
    if (status === 503 && data?.code === 'maintenance_mode') return new AuthFailure('server', message?.slice(0, 400));
    return new AuthFailure('server');
  }
  return new AuthFailure('server');
}
export function createAuthApi(baseURL: string | null, client?: AxiosInstance) {
  const http = client ?? create({ baseURL: baseURL ?? undefined, timeout: 15000, headers: { Accept: 'application/json' } });
  const options = (language: Language, access?: string) => {
    if (!baseURL) throw new AuthFailure('configuration');
    return { headers: { 'Accept-Language': language, ...(access ? { Authorization: `Bearer ${access}` } : {}) } };
  };
  return {
    async milkSummary(tokens:Tokens,language:Language,date:string,farm?:string,signal?:AbortSignal){return milkSummarySchema.parse((await http.get('livestock/cattle/milk/day-summary/',{...options(language,tokens.access),params:{date:z.iso.date().parse(date),...(farm?{farm:z.uuid().parse(farm)}:{})},signal})).data);},
    async milkPage(tokens:Tokens,language:Language,query:MilkQuery,signal?:AbortSignal){
      const {kind,...params}=milkQuerySchema.parse(query);const path={cows:'milk/cows/',records:'milk/',totals:'milk-totals/'}[kind];
      const data=(await http.get(`livestock/cattle/${path}`,{...options(language,tokens.access),params:{...params,page_size:20},signal})).data;
      return kind==='cows'?milkCowPageSchema.parse(data):kind==='records'?milkRecordPageSchema.parse(data):milkTotalPageSchema.parse(data);
    },
    async milkDetail(tokens:Tokens,language:Language,mode:MilkCommand['mode'],id:string,signal?:AbortSignal){const path=z.enum(['individual','total']).parse(mode)==='individual'?'milk':'milk-totals';const data=(await http.get(`livestock/cattle/${path}/${z.uuid().parse(id)}/`,{...options(language,tokens.access),signal})).data;return mode==='individual'?milkRecordSchema.parse(data):milkTotalSchema.parse(data);},
    async saveMilk(tokens:Tokens,language:Language,command:MilkCommand,values:MilkValues){
      const value=milkCommandSchema.parse(command),path=value.mode==='individual'?'milk':'milk-totals';
      const body=milkPayload(values);const response=value.id?await http.patch(`livestock/cattle/${path}/${value.id}/`,body,options(language,tokens.access)):await http.post(`livestock/cattle/${path}/`,{...body,date:value.date,...(value.mode==='individual'?{animal:value.animal,session:value.session}:{farm:value.farm})},options(language,tokens.access));
      const record=value.mode==='individual'?milkRecordSchema.parse(response.data):milkTotalSchema.parse(response.data);
      if(record.date!==value.date||('animal' in record?(value.mode!=='individual'||record.animal!==value.animal||record.session!==value.session):(record.farm!==value.farm)))throw new Error('invalid milk confirmation');
      return record;
    },
    async saveCattleAnimal(tokens:Tokens,language:Language,values:AnimalInput,production:Production,farm?:string,id?:string){
      const params={production:productionSchema.parse(production),...(id&&farm?{farm:z.uuid().parse(farm)}:{})};
      const response=id?await http.patch(`livestock/cattle/animals/${z.uuid().parse(id)}/`,animalPayload(values),{...options(language,tokens.access),params})
        :await http.post('livestock/cattle/animals/',animalPayload(values,{farm:z.uuid().parse(farm),production}),{...options(language,tokens.access),params});
      return ensureCattleScope(animalSchema.parse(response.data),production,farm);
    },
    async recordCattleWeight(tokens:Tokens,language:Language,kind:CattleKind,id:string,production:Production,farm:string,values:WeightInput){
      return z.object({id:z.uuid()}).parse((await http.post(`livestock/cattle/${z.enum(['animals','batches']).parse(kind)}/${z.uuid().parse(id)}/register-weight/`,{weight_kg:values.weight_kg.replace(',','.'),weighing_date:values.weighing_date,notes:values.notes},{...options(language,tokens.access),params:{production:productionSchema.parse(production),farm:z.uuid().parse(farm)}})).data);
    },
    async cattleList(tokens:Tokens,language:Language,query:CattleQuery,signal?:AbortSignal){
      const value=cattleQuerySchema.parse(query);const {kind,status,...params}=value;
      const data=(await http.get(`livestock/cattle/${kind}/`,{...options(language,tokens.access),params:{...params,...(status==='all'?{}:{status}),view:'operational',page_size:20},signal})).data;
      const page=kind==='animals'?animalPageSchema.parse(data):batchPageSchema.parse(data);
      page.results.forEach(record=>ensureCattleScope(record,value.production,value.farm));return page;
    },
    async cattleDetail(tokens:Tokens,language:Language,kind:CattleKind,id:string,production:Production,farm?:string,signal?:AbortSignal){
      const resource=z.enum(['animals','batches']).parse(kind);
      const data=(await http.get(`livestock/cattle/${resource}/${z.uuid().parse(id)}/`,{...options(language,tokens.access),params:{production:productionSchema.parse(production),...(farm?{farm:z.uuid().parse(farm)}:{}),view:'operational'},signal})).data;
      return ensureCattleScope(kind==='animals'?animalSchema.parse(data):batchSchema.parse(data),production,farm);
    },
    async cattleHistory(tokens:Tokens,language:Language,id:string,production:Production,page:number,farm?:string,signal?:AbortSignal){
      return historyPageSchema.parse((await http.get(`livestock/cattle/animals/${z.uuid().parse(id)}/full-history/`,{...options(language,tokens.access),params:{production:productionSchema.parse(production),page:z.number().int().min(1).parse(page),page_size:20,view:'operational',...(farm?{farm:z.uuid().parse(farm)}:{})},signal})).data);
    },
    async profile(tokens:Tokens,language:Language,signal?:AbortSignal){return profileSchema.parse((await http.get('auth/me/',{...options(language,tokens.access),signal})).data);},
    async farms(tokens:Tokens,language:Language,page:number,signal?:AbortSignal){return farmsSchema.parse((await http.get('farms/',{...options(language,tokens.access),params:{page:z.number().int().min(1).parse(page),page_size:25},signal})).data);},
    async searchEntities(tokens:Tokens,language:Language,query:SearchQuery,signal?:AbortSignal){
      const parsed=searchQuerySchema.parse(query);
      const paths={animal:'livestock/animals/',batch:'livestock/batches/',crop:'crops/plantations/',inventory:'inventory/items/',structure:'farms/structures/'};
      return parseSearch(parsed.kind,(await http.get(paths[parsed.kind],{...options(language,tokens.access),params:{search:parsed.search,page:parsed.page,page_size:20},signal})).data);
    },
    async agenda(tokens: Tokens, language: Language, query: AgendaQuery, signal?: AbortSignal) {
      return agendaPageSchema.parse((await http.get('tasks/agenda/', { ...options(language,tokens.access), params:{...agendaQuerySchema.parse(query),page_size:25}, signal })).data);
    },
    async agendaOptions(tokens: Tokens, language: Language, signal?: AbortSignal) {
      return taskOptionsSchema.parse((await http.get('tasks/agenda-options/',{...options(language,tokens.access),signal})).data);
    },
    async saveAgendaTask(tokens: Tokens, language: Language, payload: TaskInput | {status:string}, id?:string, assignedTo?:string) {
      const body='title' in payload ? taskInputSchema.parse(payload) : z.object({status:z.enum(['open','in_progress','done','cancelled'])}).parse(payload);
      const response=id ? await http.patch(`tasks/${z.uuid().parse(id)}/`,body,options(language,tokens.access))
        : await http.post('tasks/',{...body,assigned_to:z.uuid().parse(assignedTo)},options(language,tokens.access));
      return taskSchema.parse(response.data);
    },
    async agendaTask(tokens: Tokens, language: Language, id: string, signal?: AbortSignal) {
      return taskSchema.parse((await http.get(`tasks/${z.uuid().parse(id)}/`, { ...options(language,tokens.access), signal })).data);
    },
    async google(credential: string, language: Language) {
      if (!credential.trim()) throw new AuthFailure('googleFailed');
      return tokensSchema.parse((await http.post('auth/google/', { credential }, options(language))).data);
    },
    async dashboard(tokens: Tokens, language: Language, period: string, signal?: AbortSignal) {
      return dashboardSchema.parse((await http.get('reports/dashboard/', { ...options(language, tokens.access), params: { period: 'month', period_value: period }, signal })).data);
    },
    async register(values: Registration, language: Language) {
      // Match web: account creation returns to login, without persisting the returned tokens.
      // Parsing strips arbitrary role/tenant fields. The server owns organization creation.
      await http.post('auth/register/', registrationSchema.parse(values), options(language));
    },
    async login(credentials: Credentials, language: Language) {
      return tokensSchema.parse((await http.post('auth/login/', credentials, options(language))).data);
    },
    async user(tokens: Tokens, language: Language) {
      return userSchema.parse((await http.get('auth/me/', options(language, tokens.access))).data);
    },
    async organization(tokens: Tokens, language: Language) {
      // Schema strips subscription and other unrelated fields before storage/state.
      return organizationSchema.parse((await http.get('organizations/me/', options(language, tokens.access))).data);
    },
    async logout(tokens: Tokens, language: Language) {
      await http.post('auth/logout/', { refresh: tokens.refresh }, options(language));
    },
    async recover(email: string, language: Language) {
      await http.post('auth/password-recovery/', { email }, options(language));
    },
    async changePassword(tokens: Tokens, password: string, confirmation: string, language: Language) {
      await http.post('auth/force-change-password/', { new_password: password, new_password_confirm: confirmation }, options(language, tokens.access));
    },
  };
}
export type AuthApi = ReturnType<typeof createAuthApi>;
