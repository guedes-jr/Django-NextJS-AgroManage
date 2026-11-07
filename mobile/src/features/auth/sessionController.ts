import { milkCommandSchema,milkValuesSchema,type MilkCommand,type MilkValues,type MilkQuery } from '../milk/contracts';
import { organizationDay } from '../workspace/contracts';
import { canReadCattle, canCreateCattle, canEditCattle, canWeighCattle, animalInputSchema, weightInputSchema, type AnimalInput, type WeightInput, type CattleQuery, type CattleKind, type Production } from '../cattle/contracts';
import { canSearch, type SearchQuery } from '../workspace/contracts';
import { canReadAgenda, agendaQuerySchema, taskWriteAccess, taskInputSchema, type TaskInput, type AgendaQuery } from '../agenda/contracts';
import type { Language } from '../../i18n/messages';
import { AuthFailure, authError, type AuthApi } from '../../services/authApi';
import { credentialsSchema, type Tokens, type Session } from './contracts';
import { canLoadFinancialHome } from '../home/contracts';

export interface TokenVault {
  read(): Promise<Tokens | null>;
  save(tokens: Tokens): Promise<void>;
  clear(): Promise<void>;
}
export type SessionState =
  | { status: 'restoring' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; session: Session }
  | { status: 'unavailable'; error: AuthFailure };

export class SessionController {
  private state: SessionState = { status: 'restoring' };
  private tokens: Tokens | null = null;
  private epoch = 0;
  private listeners = new Set<() => void>();
  private restoreTask: Promise<void> | null = null;
  private signingIn = false;
  private mustClear = false;
  private writes: Promise<void> = Promise.resolve();
  private readonly initialLanguage: Language;
  constructor(private api: AuthApi, private vault: TokenVault, private language: Language) { this.initialLanguage = language; }
  getSnapshot = () => this.state;
  async dashboard(period: string, signal?: AbortSignal) {
    if (!this.tokens || this.state.status !== 'signedIn') throw new AuthFailure('expired');
    if (!canLoadFinancialHome(this.state.session.user.access)) throw new AuthFailure('unsupported');
    const epoch = this.epoch;
    try {
      const result = await this.api.dashboard(this.tokens, this.language, period, signal);
      if (epoch !== this.epoch) throw new AuthFailure('expired');
      return result;
    } catch (error) {
      if (authError(error).key === 'expired' && epoch === this.epoch) await this.signOut();
      throw error;
    }
  }
  private async agendaRequest<T>(request: (tokens: Tokens) => Promise<T>) {
    if (!this.tokens || this.state.status !== 'signedIn') throw new AuthFailure('expired');
    if (!canReadAgenda(this.state.session.user)) throw new AuthFailure('unsupported');
    const epoch = this.epoch;
    try {
      const result = await request(this.tokens);
      if (epoch !== this.epoch) throw new AuthFailure('expired');
      return result;
    } catch (error) {
      if (authError(error).key === 'expired' && epoch === this.epoch) await this.signOut();
      throw error;
    }
  }
  agenda(query: AgendaQuery, signal?: AbortSignal) {
    return this.agendaRequest(tokens => this.api.agenda(tokens,this.language,agendaQuerySchema.parse(query),signal));
  }
  agendaTask(id:string, signal?:AbortSignal) {
    return this.agendaRequest(tokens => this.api.agendaTask(tokens,this.language,id,signal));
  }
  agendaOptions(signal?:AbortSignal) {
    return this.agendaRequest(tokens=>this.api.agendaOptions(tokens,this.language,signal));
  }
  private taskSaving=false;
  async saveAgendaTask(payload:TaskInput|{status:string},id?:string) {
    if(this.taskSaving) throw new AuthFailure('unsupported');
    this.taskSaving=true;
    try {
      return await this.agendaRequest(async tokens=>{
        const epoch=this.epoch;
        const options=await this.api.agendaOptions(tokens,this.language);
        if(epoch!==this.epoch)throw new AuthFailure('expired');
        if(this.state.status!=='signedIn'||options.read_only||options.user_id!==this.state.session.user.id) throw new AuthFailure('unsupported');
        const task=id?await this.api.agendaTask(tokens,this.language,id):undefined;
        if(epoch!==this.epoch||this.state.status!=='signedIn')throw new AuthFailure('expired');
        const access=taskWriteAccess(this.state.session.user,task);
        if(access==='none'||(access==='status'&&'title' in payload))throw new AuthFailure('unsupported');
        if(!id&&!('title' in payload))throw new AuthFailure('unsupported');
        if('title' in payload)taskInputSchema.parse(payload);
        return this.api.saveAgendaTask(tokens,this.language,payload,id,options.user_id);
      });
    } finally {this.taskSaving=false;}
  }
  private async workspaceRead<T>(request:(tokens:Tokens)=>Promise<T>) {
    if(!this.tokens||this.state.status!=='signedIn')throw new AuthFailure('expired');
    if(this.state.session.user.force_password_change)throw new AuthFailure('unsupported');
    const epoch=this.epoch;
    try{const result=await request(this.tokens);if(epoch!==this.epoch)throw new AuthFailure('expired');return result;}
    catch(error){if(authError(error).key==='expired'&&epoch===this.epoch)await this.signOut();throw error;}
  }
  profile(signal?:AbortSignal){return this.workspaceRead(tokens=>this.api.profile(tokens,this.language,signal));}
  farms(page:number,signal?:AbortSignal){
    if(this.state.status!=='signedIn'||!canReadAgenda(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));
    return this.workspaceRead(tokens=>this.api.farms(tokens,this.language,page,signal));
  }
  searchEntities(query:SearchQuery,signal?:AbortSignal){
    if(this.state.status!=='signedIn'||!canSearch(this.state.session.user,query.kind))return Promise.reject(new AuthFailure('unsupported'));
    return this.workspaceRead(tokens=>this.api.searchEntities(tokens,this.language,query,signal));
  }
  getSessionEpoch(){return this.epoch;}
  private cattleRead<T>(read:(tokens:Tokens)=>Promise<T>){
    if(this.state.status!=='signedIn'||!canReadCattle(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));
    return this.workspaceRead(read);
  }
  cattleList(query:CattleQuery,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.cattleList(tokens,this.language,query,signal));}
  cattleDetail(kind:CattleKind,id:string,production:Production,farm?:string,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.cattleDetail(tokens,this.language,kind,id,production,farm,signal));}
  cattleHistory(id:string,production:Production,page:number,farm?:string,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.cattleHistory(tokens,this.language,id,production,page,farm,signal));}
  private cattleSaving=false;
  private async cattleWrite<T>(operation:(tokens:Tokens,user:Session['user'],today:string,assertCurrent:()=>void)=>Promise<T>){
    if(this.cattleSaving)throw new AuthFailure('unsupported');
    this.cattleSaving=true;
    try{return await this.cattleRead(async tokens=>{
      const epoch=this.epoch;
      const assertCurrent=()=>{if(epoch!==this.epoch||this.state.status!=='signedIn')throw new AuthFailure('expired');};
      const user=await this.api.user(tokens,this.language);assertCurrent();
      if(!canCreateCattle(user))throw new AuthFailure('unsupported');
      const organization=await this.api.organization(tokens,this.language);assertCurrent();
      if(this.state.status!=='signedIn'||user.id!==this.state.session.user.id||organization.id!==this.state.session.organization.id){await this.signOut();throw new AuthFailure('expired');}
      const options=await this.api.agendaOptions(tokens,this.language);assertCurrent();
      if(options.user_id!==user.id||options.read_only)throw new AuthFailure('unsupported');
      return operation(tokens,user,organizationDay(options.timezone),assertCurrent);
    });}finally{this.cattleSaving=false;}
  }
  saveCattleAnimal(values:AnimalInput,production:Production,farm?:string,id?:string){
    return this.cattleWrite(async(tokens,user,today,assertCurrent)=>{
      const payload=animalInputSchema(today).parse(values);
      if(id){const record=await this.api.cattleDetail(tokens,this.language,'animals',id,production,farm);assertCurrent();if(!('identifier' in record)||!canEditCattle(user,record))throw new AuthFailure('unsupported');}
      assertCurrent();return this.api.saveCattleAnimal(tokens,this.language,payload,production,farm,id);
    });
  }
  recordCattleWeight(kind:CattleKind,id:string,production:Production,farm:string,values:WeightInput){
    return this.cattleWrite(async(tokens,user,today,assertCurrent)=>{
      const record=await this.api.cattleDetail(tokens,this.language,kind,id,production,farm);assertCurrent();
      if(!canWeighCattle(user,record)||!record.entry_date)throw new AuthFailure('unsupported');
      const payload=weightInputSchema(today,record.entry_date).parse(values);assertCurrent();
      return this.api.recordCattleWeight(tokens,this.language,kind,id,production,farm,payload);
    });
  }
  milkSummary(date:string,farm?:string,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.milkSummary(tokens,this.language,date,farm,signal));}
  milkPage(query:MilkQuery,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.milkPage(tokens,this.language,query,signal));}
  milkDetail(mode:MilkCommand['mode'],id:string,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.milkDetail(tokens,this.language,mode,id,signal));}
  saveMilk(command:MilkCommand,values:MilkValues){return this.cattleWrite(async(tokens,user,today,assertCurrent)=>{
    const value=milkCommandSchema.parse(command),payload=milkValuesSchema(value.mode).parse(values);
    if(value.date>today)throw new AuthFailure('unsupported');
    if(value.id){
      if(!['admin','manager'].includes(user.access.role))throw new AuthFailure('unsupported');
      const saved=await this.api.milkDetail(tokens,this.language,value.mode,value.id);assertCurrent();
      if(saved.date!==value.date||('animal' in saved?(value.mode!=='individual'||saved.animal!==value.animal||saved.session!==value.session):saved.farm!==value.farm))throw new AuthFailure('unsupported');
    }
    if(value.mode==='individual'){
      const animal=await this.api.cattleDetail(tokens,this.language,'animals',value.animal,'dairy',value.farm);assertCurrent();
      if(!('identifier' in animal)||animal.gender!=='F'||animal.status!=='active'||!['Vaca','Matriz'].includes(animal.category))throw new AuthFailure('unsupported');
    }
    assertCurrent();return this.api.saveMilk(tokens,this.language,value,payload);
  });}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(state: SessionState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private write(action: () => Promise<void>) {
    const task = this.writes.then(action);
    this.writes = task.catch(() => {});
    return task.catch(() => { throw new AuthFailure('storage'); });
  }
  private async validate(tokens: Tokens): Promise<Session> {
    const user = await this.api.user(tokens, this.language);
    if (user.is_platform_staff || user.affiliate_portal_only) throw new AuthFailure('unsupported');
    const organization = await this.api.organization(tokens, this.language);
    return { user, organization };
  }
  restore = (): Promise<void> => {
    if (this.restoreTask) return this.restoreTask;
    const epoch = ++this.epoch;
    this.set({ status: 'restoring' });
    this.restoreTask = (async () => {
      try {
        if (this.mustClear) {
          await this.write(() => this.vault.clear());
          if (epoch !== this.epoch) return;
          this.mustClear = false;
          this.set({ status: 'signedOut' });
          return;
        }
        let tokens: Tokens | null;
        try { tokens = this.tokens ?? await this.vault.read(); } catch { throw new AuthFailure('storage'); }
        if (epoch !== this.epoch) return;
        if (!tokens) { this.set({ status: 'signedOut' }); return; }
        const session = await this.validate(tokens);
        if (epoch !== this.epoch) return;
        this.tokens = tokens;
        this.language = session.organization.language;
        this.set({ status: 'signedIn', session });
      } catch (error) {
        if (epoch !== this.epoch) return;
        const failure = authError(error);
        if (failure.key === 'expired' || failure.key === 'unsupported' || failure.key === 'invalidResponse') {
          this.tokens = null;
          try { await this.write(() => this.vault.clear()); }
          catch { this.set({ status: 'unavailable', error: new AuthFailure('storage') }); return; }
          if (epoch === this.epoch) this.set({ status: 'signedOut' });
        } else this.set({ status: 'unavailable', error: failure });
      }
    })().finally(() => { this.restoreTask = null; });
    return this.restoreTask;
  };
  async signIn(email: string, password: string, remember = false) {
    return this.authenticate(async () => this.api.login(credentialsSchema.parse({ email: email.trim(), password }), this.language), remember);
  }
  async signInGoogle(credential: string, remember = false) {
    return this.authenticate(() => this.api.google(credential, this.language), remember);
  }
  private async authenticate(login: () => Promise<Tokens>, remember: boolean) {
    if (this.signingIn) return;
    this.signingIn = true;
    const epoch = ++this.epoch;
    let tokens: Tokens | null = null;
    try {
      tokens = await login();
      const session = await this.validate(tokens);
      if (epoch !== this.epoch) { void this.api.logout(tokens, this.language).catch(() => {}); return; }
      await this.write(() => remember ? this.vault.save(tokens!) : this.vault.clear());
      if (epoch !== this.epoch) { void this.api.logout(tokens, this.language).catch(() => {}); return; }
      this.tokens = tokens;
      this.language = session.organization.language;
      this.set({ status: 'signedIn', session });
    } catch (error) {
      if (tokens) void this.api.logout(tokens, this.language).catch(() => {});
      throw authError(error);
    } finally { this.signingIn = false; }
  }
  async signOut() {
    ++this.epoch;
    const tokens = this.tokens;
    const language = this.language;
    this.tokens = null;
    this.mustClear = true;
    this.language = this.initialLanguage;
    // Clear local access first; remote revocation is best effort when offline.
    this.set({ status: 'restoring' });
    try {
      await this.write(() => this.vault.clear());
      this.mustClear = false;
      this.set({ status: 'signedOut' });
    } catch { this.set({ status: 'unavailable', error: new AuthFailure('storage') }); }
    if (tokens) void this.api.logout(tokens, language).catch(() => {});
  }
  async changePassword(password: string, confirmation: string) {
    const tokens = this.tokens;
    if (!tokens) throw new AuthFailure('expired');
    const epoch = this.epoch;
    try {
      await this.api.changePassword(tokens, password, confirmation, this.language);
      const session = await this.validate(tokens);
      if (epoch === this.epoch) this.set({ status: 'signedIn', session });
    } catch (error) {
      const failure = authError(error);
      if (failure.key === 'expired') await this.signOut();
      throw failure;
    }
  }
}
