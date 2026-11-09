import {classificationInputSchema,classificationReviewSchema,classificationKey,validateClassificationReview,type ClassificationInput,type ClassificationReview} from '../cattle/classificationContracts';
import {canWriteOccurrence,occurrenceInputSchema,occurrenceResolutionInputSchema,type OccurrenceInput,type OccurrenceResolutionInput} from '../cattle/occurrenceContracts';
import type {CattleOperationQuery} from '../cattle/operationContracts';
import {transferInputSchema,transferReviewSchema,transferKey,validateTransferReview,type TransferInput as GrazingTransferInput,type TransferReview as GrazingTransferReview} from '../cattle/grazingTransferContracts';
import {collectiveMedicationReviewSchema,type CollectiveMedicationReview} from '../cattle/collectiveMedicationConfirmationContracts';
import {collectiveMedicationEditInputSchema,collectiveMedicationCancelInputSchema,type CollectiveMedicationEditInput,type CollectiveMedicationCancelInput,collectiveMedicationInputSchema,type CollectiveMedicationInput} from '../cattle/collectiveMedicationContracts';
import {sanitaryReviewSchema,type SanitaryReview} from '../cattle/sanitaryConfirmationContracts';
import {sanitaryEditInputSchema,sanitaryCancelInputSchema,type SanitaryEditInput,type SanitaryCancelInput,sanitaryInputSchema,type SanitaryInput} from '../cattle/sanitaryContracts';
import {followUpInputSchema,type FollowUpInput} from '../cattle/followUpContracts';
import {castrationReviewSchema,type CastrationReview} from '../cattle/castrationConfirmationContracts';
import {castrationInputSchema,castrationEditInputSchema,castrationCancelInputSchema,type CastrationInput,type CastrationEditInput,type CastrationCancelInput} from '../cattle/castrationContracts';
import {weighingReviewSchema,type WeighingReview} from '../cattle/weighingConfirmationContracts';
import {weighingInputSchema,weighingEditInputSchema,weighingCancelInputSchema,type WeighingInput,type WeighingEditInput,type WeighingCancelInput} from '../cattle/weighingContracts';
import {canReadManagements,type ManagementQuery} from '../cattle/managementContracts';
import {pastureCommandSchema,type PastureCommand} from '../cattle/pastureFormContracts';
import {exitInputSchema,exitReviewSchema,exitKey,validateExitReview,type ExitInput,type ExitReview} from '../cattle/grazingExitContracts';
import {canEnterPasture,entryInputSchema,entryReviewSchema,entryKey,validateEntryReview,type EntryScope,type EntryInput,type EntryReview} from '../cattle/grazingEntryContracts';
import {ClassificationChanged,CattleOccurrenceChanged,GrazingTransferChanged,CollectiveMedicationReviewChanged,SanitaryReviewChanged,GrazingEntryChanged,GrazingExitChanged,PastureContextChanged,WeighingContextChanged,WeighingReviewChanged,CastrationReviewChanged} from '../../services/authApi';
import type {GrazingQuery} from '../cattle/grazingContracts';
import type {PastureQuery} from '../cattle/pastureContracts';
import {birthInputSchema,birthKey,birthReviewSchema,validateBirthReview,type BirthInput,type BirthReview} from '../cattle/birthContracts';
import {matingInputSchema,matingKey,matingReviewSchema,validateMatingReview,type MatingInput,type MatingReview} from '../cattle/matingContracts';
import {diagnosisInputSchema,matchesDiagnosis,type DiagnosisInput} from '../cattle/diagnosisContracts';
import type {ReproductionQuery} from '../cattle/reproductionContracts';
import {canApplyMedication,medicationInputSchema,medicationKey,medicationReviewSchema,validateMedicationReview,type MedicationInput,type MedicationReview} from '../clinic/medicationContracts';
import {healthInputSchema,type HealthInput} from '../clinic/healthContracts';
import {vaccinationInputSchema,vaccinationKey,vaccinationReviewSchema,validateVaccinationReview,type VaccinationQuery,type VaccinationInput,type VaccinationReview} from '../clinic/vaccinationContracts';
import {canReadClinic,canWriteClinic,clinicInputSchema,type ClinicQuery,type ClinicInput} from '../clinic/contracts';
import {canReadNotifications,preferenceFields,preferencesPatch,type NotificationQuery,type PreferenceValues,type Preferences} from '../notifications/contracts';
import {canReadDailyFeeding,canWriteDailyFeeding,feedingCommandSchema,feedingBatchPage,type FeedingQuery,type FeedingCommand} from '../feeding/contracts';
import {formulaInputSchema,productionInputSchema,sameProduction,type FormulaInput,type Formula,type ProductionInput,type FeedPreview} from '../feed/contracts';
import {launchInputSchema,sameLaunch,type LaunchInput,type LaunchPreview} from '../inventory/launchContracts';
import {stockCountSchema,type MovementQuery,type StockCountInput} from '../inventory/movementContracts';
import {inventoryCommandSchema,type InventoryCommand} from '../inventory/formContracts';
import {canReadInventory,canWriteInventory,type InventoryQuery} from '../inventory/contracts';
import {batchInputSchema,canEditBatch,canTransfer,transferInput,matchesPreview,type BatchInput,type TransferInput,type TransferPreview} from '../cattle/batchContracts';
import { milkCommandSchema,milkValuesSchema,type MilkCommand,type MilkValues,type MilkQuery } from '../milk/contracts';
import { organizationDay } from '../workspace/contracts';
import { canReadCattle, canCreateCattle, canEditCattle, canWeighCattle, animalInputSchema, weightInputSchema, type AnimalInput, type WeightInput, type CattleQuery, type CattleKind, type Production } from '../cattle/contracts';
import { canSearch, type SearchQuery } from '../workspace/contracts';
import { canReadAgenda, agendaQuerySchema, taskWriteAccess, taskInputSchema, type TaskInput, type AgendaQuery } from '../agenda/contracts';
import type { Language } from '../../i18n/messages';
import { AuthFailure, authError, MatingContextChanged, DiagnosisContextChanged, BirthContextChanged, type AuthApi } from '../../services/authApi';
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
  private inventoryRead<T>(read:(tokens:Tokens)=>Promise<T>){
    if(this.state.status!=='signedIn'||!canReadInventory(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));
    return this.workspaceRead(read);
  }
  inventorySummary(signal?:AbortSignal){return this.inventoryRead(tokens=>this.api.inventorySummary(tokens,this.language,signal));}
  inventoryChoices(signal?:AbortSignal){return this.inventoryRead(tokens=>this.api.inventoryChoices(tokens,this.language,signal));}
  inventoryPage(query:InventoryQuery,signal?:AbortSignal){return this.inventoryRead(tokens=>this.api.inventoryPage(tokens,this.language,query,signal));}
  inventoryDetail(kind:'items'|'suppliers',id:string,signal?:AbortSignal){return this.inventoryRead(tokens=>this.api.inventoryDetail(tokens,this.language,kind,id,signal));}
  inventoryFormChoices(signal?:AbortSignal){return this.inventoryRead(tokens=>this.api.inventoryFormChoices(tokens,this.language,signal));}
  inventoryMovements(query:MovementQuery,signal?:AbortSignal){return this.inventoryRead(tokens=>this.api.inventoryMovements(tokens,this.language,query,signal));}
  inventoryMovement(id:string,signal?:AbortSignal){return this.inventoryRead(tokens=>this.api.inventoryMovement(tokens,this.language,id,signal));}
  inventoryLot(id:string,signal?:AbortSignal){return this.inventoryRead(tokens=>this.api.inventoryLot(tokens,this.language,id,signal));}
  private inventorySaving=false;
  private async inventoryMutation<T>(operation:(tokens:Tokens,current:()=>void,user:Session['user'])=>Promise<T>){
    if(this.inventorySaving)throw new AuthFailure('unsupported');this.inventorySaving=true;
    try{return await this.inventoryRead(async tokens=>{
      const epoch=this.epoch;const current=()=>{if(this.state.status!=='signedIn'||epoch!==this.epoch)throw new AuthFailure('expired');};
      const user=await this.api.user(tokens,this.language);current();if(!canWriteInventory(user))throw new AuthFailure('unsupported');
      const organization=await this.api.organization(tokens,this.language);current();
      if(this.state.status!=='signedIn'||user.id!==this.state.session.user.id||organization.id!==this.state.session.organization.id){await this.signOut();throw new AuthFailure('expired');}
      return operation(tokens,current,user);
    });}finally{this.inventorySaving=false;}
  }
  saveInventory(command:InventoryCommand){return this.inventoryMutation(async(tokens,current)=>{
      const value=inventoryCommandSchema.parse(command);
      const choices=await this.api.inventoryFormChoices(tokens,this.language);current();
      if(value.record&&!value.record.ativo)throw new AuthFailure('unsupported');
      if(value.kind==='items'){
        if(!value.record&&(!choices.unidades.some(c=>c.value===value.values.unidade_medida)||value.values.categorias.some(c=>!choices.categorias.some(o=>o.value===c))))throw new AuthFailure('unsupported');
        if(value.values.especie_animal&&!choices.especies.some(c=>c.value===value.values.especie_animal))throw new AuthFailure('unsupported');
      }else if(!choices.tipos_contrato.some(c=>c.value===value.values.tipo_contrato))throw new AuthFailure('unsupported');
      current();return this.api.saveInventory(tokens,this.language,value);
    });}
  countInventory(lotId:string,itemId:string,unit:string,input:StockCountInput){return this.inventoryMutation(async(tokens,current)=>{
    const values=stockCountSchema.parse(input);
    const [lot,item]=await Promise.all([this.api.inventoryLot(tokens,this.language,lotId),this.api.inventoryDetail(tokens,this.language,'items',itemId)]);current();
    if(lot.item!==itemId||!lot.ativo||!item.ativo||!('unidade_medida' in item)||item.unidade_medida!==unit)throw new AuthFailure('unsupported');
    return this.api.countInventory(tokens,this.language,lotId,values,unit);
  });}
  private clinicRead<T>(read:(tokens:Tokens)=>Promise<T>){if(this.state.status!=='signedIn'||!canReadClinic(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.workspaceRead(read);}
  clinicOptions(signal?:AbortSignal){return this.clinicRead(tokens=>this.api.clinicOptions(tokens,this.language,signal));}
  clinicPage(query:ClinicQuery,signal?:AbortSignal){return this.clinicRead(tokens=>this.api.clinicPage(tokens,this.language,query,signal));}
  clinicDetail(id:string,query:ClinicQuery,signal?:AbortSignal){return this.clinicRead(tokens=>this.api.clinicDetail(tokens,this.language,id,query,signal));}
  clinicAnimals(query:ClinicQuery,signal?:AbortSignal){return this.clinicRead(tokens=>this.api.clinicAnimals(tokens,this.language,query,signal));}
  vaccinationOptions(signal?:AbortSignal){return this.clinicRead(tokens=>this.api.vaccinationOptions(tokens,this.language,signal));}
  vaccinationTargets(query:VaccinationQuery,signal?:AbortSignal){return this.clinicRead(tokens=>this.api.vaccinationTargets(tokens,this.language,query,signal));}
  vaccinationVaccines(query:VaccinationQuery,signal?:AbortSignal){return this.clinicRead(tokens=>this.api.vaccinationVaccines(tokens,this.language,query,signal));}
  private vaccinationBusy=false;
  private vaccinationReview?:{token:string;key:string;epoch:number};
  private async vaccinationMutation<T>(operation:(tokens:Tokens,current:()=>void,user:Session['user'])=>Promise<T>){
    if(this.vaccinationBusy||this.state.status!=='signedIn'||!canWriteClinic(this.state.session.user))throw new AuthFailure('unsupported');this.vaccinationBusy=true;
    try{return await this.clinicRead(async tokens=>{const epoch=this.epoch;const current=()=>{if(this.state.status!=='signedIn'||this.epoch!==epoch)throw new AuthFailure('expired');};
      const user=await this.api.user(tokens,this.language);current();if(!canWriteClinic(user))throw new AuthFailure('unsupported');
      const org=await this.api.organization(tokens,this.language);current();if(this.state.status!=='signedIn'||user.id!==this.state.session.user.id||org.id!==this.state.session.organization.id){await this.signOut();throw new AuthFailure('expired');}
      return operation(tokens,current,user);
    });}finally{this.vaccinationBusy=false;}
  }
  async previewVaccination(input:VaccinationInput){return this.vaccinationMutation(async(tokens,current,user)=>{
    this.vaccinationReview=undefined;const command=vaccinationInputSchema.parse(input);
    const targets=await this.api.vaccinationTargets(tokens,this.language,{kind:command.target_kind,target:command.target,farm:command.expected_farm,page:1,search:''});current();
    const target=targets.results.find(r=>r.id===command.target&&r.farm===command.expected_farm);if(!target||user.access.role==='operator'&&!user.access.livestock_species?.includes(target.species))throw new AuthFailure('unsupported');
    const review=await this.api.previewVaccination(tokens,this.language,command);current();validateVaccinationReview(review,command);
    this.vaccinationReview={token:review.preview_token,key:vaccinationKey(command),epoch:this.epoch};return review;
  });}
  async confirmVaccination(input:VaccinationInput,review:VaccinationReview){return this.vaccinationMutation(async(tokens,current,user)=>{
    const value=vaccinationReviewSchema.parse(review);validateVaccinationReview(value,input);const held=this.vaccinationReview;
    if(!held||held.epoch!==this.epoch||held.token!==value.preview_token||held.key!==vaccinationKey(input)||user.access.role==='operator'&&!user.access.livestock_species?.includes(value.target.species))throw new AuthFailure('unsupported');
    current();this.vaccinationReview=undefined;return this.api.confirmVaccination(tokens,this.language,value);
  });}
  healthOptions(signal?:AbortSignal){return this.clinicRead(tokens=>this.api.healthOptions(tokens,this.language,signal));}
  private healthSaving=false;
  async createHealthRecord(input:HealthInput){
    if(this.healthSaving||this.state.status!=='signedIn'||!canWriteClinic(this.state.session.user))throw new AuthFailure('unsupported');this.healthSaving=true;
    try{return await this.clinicRead(async tokens=>{const epoch=this.epoch;const current=()=>{if(this.state.status!=='signedIn'||this.epoch!==epoch)throw new AuthFailure('expired');};
      const value=healthInputSchema.parse(input);const user=await this.api.user(tokens,this.language);current();if(!canWriteClinic(user))throw new AuthFailure('unsupported');
      const org=await this.api.organization(tokens,this.language);current();if(this.state.status!=='signedIn'||user.id!==this.state.session.user.id||org.id!==this.state.session.organization.id){await this.signOut();throw new AuthFailure('expired');}
      const choices=await this.api.healthOptions(tokens,this.language);current();if(value.application_date>choices.today||!choices.treatment_types.some(row=>row.value===value.treatment_type))throw new AuthFailure('unsupported');
      const animals=await this.api.clinicAnimals(tokens,this.language,{kind:'health',page:1,search:'',species:'',start:'',end:'',animal:value.animal,farm:value.expected_farm});current();const animal=animals.results.find(row=>row.id===value.animal&&row.farm===value.expected_farm);if(!animal||user.access.role==='operator'&&!user.access.livestock_species?.includes(animal.species))throw new AuthFailure('unsupported');
      current();return this.api.createHealthRecord(tokens,this.language,value);
    });}finally{this.healthSaving=false;}
  }
  private medicationRead<T>(read:(tokens:Tokens)=>Promise<T>){if(this.state.status!=='signedIn'||!canApplyMedication(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.clinicRead(read);}
  medicationOptions(signal?:AbortSignal){return this.medicationRead(tokens=>this.api.medicationOptions(tokens,this.language,signal));}
  medicationLots(page:number,search:string,signal?:AbortSignal){return this.medicationRead(tokens=>this.api.medicationLots(tokens,this.language,page,search,signal));}
  private medicationReview?:{token:string;key:string;epoch:number};
  async previewMedication(input:MedicationInput){if(this.state.status!=='signedIn'||!canApplyMedication(this.state.session.user))throw new AuthFailure('unsupported');return this.vaccinationMutation(async(tokens,current,user)=>{
    this.medicationReview=undefined;if(!canApplyMedication(user))throw new AuthFailure('unsupported');const command=medicationInputSchema.parse(input);
    const animals=await this.api.clinicAnimals(tokens,this.language,{kind:'health',page:1,search:'',species:'bovinos',start:'',end:'',animal:command.animal,farm:command.expected_farm});current();if(!animals.results.some(row=>row.id===command.animal&&row.farm===command.expected_farm&&row.species==='bovinos'))throw new AuthFailure('unsupported');
    const review=await this.api.previewMedication(tokens,this.language,command);current();validateMedicationReview(review,command);this.medicationReview={token:review.preview_token,key:medicationKey(command),epoch:this.epoch};return review;
  });}
  async confirmMedication(input:MedicationInput,review:MedicationReview){if(this.state.status!=='signedIn'||!canApplyMedication(this.state.session.user))throw new AuthFailure('unsupported');return this.vaccinationMutation(async(tokens,current,user)=>{
    if(!canApplyMedication(user))throw new AuthFailure('unsupported');const value=medicationReviewSchema.parse(review);validateMedicationReview(value,input);const held=this.medicationReview;
    if(!held||held.epoch!==this.epoch||held.token!==value.preview_token||held.key!==medicationKey(input))throw new AuthFailure('unsupported');current();this.medicationReview=undefined;return this.api.confirmMedication(tokens,this.language,value);
  });}
  private clinicSaving=false;
  async createClinicRecord(input:ClinicInput){if(this.clinicSaving||this.state.status!=='signedIn'||!canWriteClinic(this.state.session.user))throw new AuthFailure('unsupported');this.clinicSaving=true;
    try{return await this.clinicRead(async tokens=>{const epoch=this.epoch;const current=()=>{if(this.state.status!=='signedIn'||this.epoch!==epoch)throw new AuthFailure('expired');};
      const value=clinicInputSchema.parse(input);const user=await this.api.user(tokens,this.language);current();if(!canWriteClinic(user))throw new AuthFailure('unsupported');
      const org=await this.api.organization(tokens,this.language);current();if(this.state.status!=='signedIn'||user.id!==this.state.session.user.id||org.id!==this.state.session.organization.id){await this.signOut();throw new AuthFailure('expired');}
      const choices=await this.api.clinicOptions(tokens,this.language);current();if(value.record_date>choices.today||!choices.record_types.some(r=>r.value===value.record_type)||!choices.severities.some(r=>r.value===value.severity)||!choices.outcomes.some(r=>r.value===value.outcome))throw new AuthFailure('unsupported');
      const animals=await this.api.clinicAnimals(tokens,this.language,{kind:'clinical',page:1,search:'',species:'',start:'',end:'',animal:value.animal,farm:value.expected_farm});current();const animal=animals.results.find(r=>r.id===value.animal&&r.farm===value.expected_farm);if(!animal||user.access.role==='operator'&&!user.access.livestock_species?.includes(animal.species))throw new AuthFailure('unsupported');
      current();return this.api.createClinicRecord(tokens,this.language,value);
    });}finally{this.clinicSaving=false;}
  }
  private notificationRead<T>(read:(tokens:Tokens)=>Promise<T>){
    if(this.state.status!=='signedIn'||!canReadNotifications(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.workspaceRead(read);
  }
  notifications(query:NotificationQuery,signal?:AbortSignal){return this.notificationRead(tokens=>this.api.notifications(tokens,this.language,query,signal));}
  notification(id:string,archived:boolean,signal?:AbortSignal){return this.notificationRead(tokens=>this.api.notification(tokens,this.language,id,archived,signal));}
  notificationCount(signal?:AbortSignal){return this.notificationRead(tokens=>this.api.notificationCount(tokens,this.language,signal));}
  notificationPreferences(signal?:AbortSignal){return this.notificationRead(tokens=>this.api.notificationPreferences(tokens,this.language,signal));}
  private notificationSaving=false;
  private async notificationMutation<T>(write:(tokens:Tokens,current:()=>void,user:Session['user'])=>Promise<T>){
    if(this.notificationSaving)throw new AuthFailure('unsupported');this.notificationSaving=true;
    try{return await this.notificationRead(async tokens=>{const epoch=this.epoch;const current=()=>{if(this.epoch!==epoch||this.state.status!=='signedIn')throw new AuthFailure('expired');};
      const user=await this.api.user(tokens,this.language);current();if(!canReadNotifications(user))throw new AuthFailure('unsupported');
      const org=await this.api.organization(tokens,this.language);current();if(this.state.status!=='signedIn'||user.id!==this.state.session.user.id||org.id!==this.state.session.organization.id){await this.signOut();throw new AuthFailure('expired');}
      return write(tokens,current,user);
    });}finally{this.notificationSaving=false;}
  }
  changeNotification(id:string,archived:boolean,action:'read'|'archive'|'restore'){return this.notificationMutation(async(tokens,current)=>{await this.api.notification(tokens,this.language,id,archived);current();return this.api.changeNotification(tokens,this.language,id,archived,action);});}
  saveNotificationPreferences(input:PreferenceValues,record:Preferences){return this.notificationMutation(async(tokens,current,user)=>{const patch=preferencesPatch(input,record);const allowed=preferenceFields(user);if(Object.keys(patch).some(key=>key!=='expected_updated_at'&&key!=='frequency'&&!allowed.includes(key as typeof allowed[number])))throw new AuthFailure('unsupported');current();return this.api.saveNotificationPreferences(tokens,this.language,input,record);});}
  dailyFeeding(query:FeedingQuery,signal?:AbortSignal){
    if(this.state.status!=='signedIn'||!canReadDailyFeeding(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));
    return this.workspaceRead(tokens=>this.api.dailyFeeding(tokens,this.language,query,signal));
  }
  private feedingSaving=false;
  async saveDailyFeeding(command:FeedingCommand,reconcile=false){
    if(this.feedingSaving||this.state.status!=='signedIn'||!canWriteDailyFeeding(this.state.session.user))throw new AuthFailure('unsupported');this.feedingSaving=true;
    try{return await this.workspaceRead(async tokens=>{
      const epoch=this.epoch;const current=()=>{if(this.state.status!=='signedIn'||this.epoch!==epoch)throw new AuthFailure('expired');};
      const input=feedingCommandSchema.parse(command);const user=await this.api.user(tokens,this.language);current();
      if(!canWriteDailyFeeding(user))throw new AuthFailure('unsupported');const org=await this.api.organization(tokens,this.language);current();
      if(this.state.status!=='signedIn'||user.id!==this.state.session.user.id||org.id!==this.state.session.organization.id){await this.signOut();throw new AuthFailure('expired');}
      if(!reconcile){const page=feedingBatchPage.parse(await this.api.dailyFeeding(tokens,this.language,{production:input.production,resource:'batches',batch:input.batch,farm:input.farm,page:1,search:''}));current();if(page.date!==input.date||!page.results.some(row=>row.id===input.batch&&row.farm===input.farm))throw new AuthFailure('unsupported');}
      current();return this.api.saveDailyFeeding(tokens,this.language,input);
    });}finally{this.feedingSaving=false;}
  }
  feedPage(kind:'formulas'|'producoes',page:number,search='',signal?:AbortSignal){return this.inventoryRead(tokens=>this.api.feedPage(tokens,this.language,kind,page,search,signal));}
  feedDetail(kind:'formulas'|'producoes',id:string,signal?:AbortSignal){return this.inventoryRead(tokens=>this.api.feedDetail(tokens,this.language,kind,id,signal));}
  saveFeedFormula(input:FormulaInput,record?:Formula){return this.inventoryMutation(async(tokens,current)=>{
    const values=formulaInputSchema.parse(input);const choices=await this.api.inventoryFormChoices(tokens,this.language);current();
    if(values.especie_animal&&!choices.especies.some(row=>row.value===values.especie_animal)||record&&!record.ativa)throw new AuthFailure('unsupported');
    return this.api.saveFeedFormula(tokens,this.language,values,record);
  });}
  previewFeed(input:ProductionInput){return this.inventoryMutation(async(tokens,current)=>{
    const values=productionInputSchema.parse(input);const result=await this.api.previewFeed(tokens,this.language,values);current();
    if(!sameProduction(values,result))throw new AuthFailure('unsupported');return result;
  });}
  confirmFeed(input:ProductionInput,review:FeedPreview){return this.inventoryMutation(async(tokens,current)=>{
    const values=productionInputSchema.parse(input);if(!sameProduction(values,review))throw new AuthFailure('unsupported');current();return this.api.confirmFeed(tokens,this.language,review.preview_token);
  });}
  stockLaunchOptions(signal?:AbortSignal){return this.inventoryRead(tokens=>this.api.stockLaunchOptions(tokens,this.language,signal));}
  previewStockLaunch(input:LaunchInput){return this.inventoryMutation(async(tokens,current,user)=>{
    const value=launchInputSchema.parse(input);if(value.tipo==='compra'&&!user.access.can_view_financial)throw new AuthFailure('unsupported');
    const result=await this.api.previewStockLaunch(tokens,this.language,value);current();if(!sameLaunch(value,result))throw new AuthFailure('unsupported');return result;
  });}
  confirmStockLaunch(input:LaunchInput,preview:LaunchPreview){return this.inventoryMutation(async(tokens,current,user)=>{
    const value=launchInputSchema.parse(input);if(!sameLaunch(value,preview)||(value.tipo==='compra'&&!user.access.can_view_financial))throw new AuthFailure('unsupported');
    current();return this.api.confirmStockLaunch(tokens,this.language,preview.preview_token);
  });}
  private cattleRead<T>(read:(tokens:Tokens)=>Promise<T>){
    if(this.state.status!=='signedIn'||!canReadCattle(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));
    return this.workspaceRead(read);
  }
  birthOptions(id:string,production:Production,farm:string,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canCreateCattle(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.birthOptions(tokens,this.language,id,production,farm,signal));}
  private birthReview?:{token:string;key:string;epoch:number;id:string;production:Production};
  async previewBirth(id:string,production:Production,input:BirthInput){return this.matingMutation(async(tokens,current)=>{this.birthReview=undefined;const value=birthInputSchema.parse(input);const options=await this.api.birthOptions(tokens,this.language,id,production,value.expected_farm);current();if(options.animal.version!==value.animal_version||options.pregnancy.id!==value.expected_pregnancy||options.pregnancy.version!==value.pregnancy_version||value.date<options.earliest_date||value.date>options.today)throw new BirthContextChanged();const review=await this.api.previewBirth(tokens,this.language,id,production,value);current();this.birthReview={token:review.preview_token,key:birthKey(value),epoch:this.epoch,id,production};return review;});}
  async confirmBirth(id:string,production:Production,input:BirthInput,review:BirthReview){return this.matingMutation(async(tokens,current)=>{const value=birthReviewSchema.parse(review);try{validateBirthReview(value,input);}catch{throw new BirthContextChanged();}const held=this.birthReview;if(!held||held.epoch!==this.epoch||held.id!==id||held.production!==production||held.token!==value.preview_token||held.key!==birthKey(input))throw new BirthContextChanged();current();this.birthReview=undefined;return this.api.confirmBirth(tokens,this.language,id,production,value);});}
  matingOptions(id:string,production:Production,farm:string,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canCreateCattle(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.matingOptions(tokens,this.language,id,production,farm,signal));}
  matingSires(page:number,search:string,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canCreateCattle(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.matingSires(tokens,this.language,page,search,signal));}
  private matingBusy=false;
  private matingReview?:{token:string;key:string;epoch:number;id:string;production:Production};
  private async matingMutation<T>(operation:(tokens:Tokens,current:()=>void)=>Promise<T>){if(this.matingBusy||this.state.status!=='signedIn'||!canCreateCattle(this.state.session.user))throw new AuthFailure('unsupported');this.matingBusy=true;
    try{return await this.cattleRead(async tokens=>{const epoch=this.epoch;const current=()=>{if(this.state.status!=='signedIn'||epoch!==this.epoch)throw new AuthFailure('expired');};const user=await this.api.user(tokens,this.language);current();if(!canCreateCattle(user))throw new AuthFailure('unsupported');const org=await this.api.organization(tokens,this.language);current();if(this.state.status!=='signedIn'||user.id!==this.state.session.user.id||org.id!==this.state.session.organization.id){await this.signOut();throw new AuthFailure('expired');}return operation(tokens,current);});}finally{this.matingBusy=false;}
  }
  async previewMating(id:string,production:Production,input:MatingInput){return this.matingMutation(async(tokens,current)=>{this.matingReview=undefined;const value=matingInputSchema.parse(input);const options=await this.api.matingOptions(tokens,this.language,id,production,value.expected_farm);current();if(options.animal.version!==value.animal_version||!options.types.includes(value.mating_type)||value.mating_date>options.today||options.earliest_date&&value.mating_date<options.earliest_date)throw new MatingContextChanged();const review=await this.api.previewMating(tokens,this.language,id,production,value);current();this.matingReview={token:review.preview_token,key:matingKey(value),epoch:this.epoch,id,production};return review;});}
  async confirmMating(id:string,production:Production,input:MatingInput,review:MatingReview){return this.matingMutation(async(tokens,current)=>{const value=matingReviewSchema.parse(review);try{validateMatingReview(value,input);}catch{throw new MatingContextChanged();}const held=this.matingReview;if(!held||held.epoch!==this.epoch||held.id!==id||held.production!==production||held.token!==value.preview_token||held.key!==matingKey(input))throw new MatingContextChanged();current();this.matingReview=undefined;return this.api.confirmMating(tokens,this.language,id,production,value);});}
  diagnosisOptions(id:string,production:Production,farm?:string,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.diagnosisOptions(tokens,this.language,id,production,farm,signal));}
  private diagnosisSaving=false;
  async saveDiagnosis(id:string,production:Production,input:DiagnosisInput){if(this.diagnosisSaving||this.state.status!=='signedIn'||!canCreateCattle(this.state.session.user))throw new AuthFailure('unsupported');this.diagnosisSaving=true;
    try{return await this.cattleRead(async tokens=>{const epoch=this.epoch;const current=()=>{if(this.state.status!=='signedIn'||this.epoch!==epoch)throw new AuthFailure('expired');};const value=diagnosisInputSchema.parse(input);
      const user=await this.api.user(tokens,this.language);current();if(!canCreateCattle(user))throw new AuthFailure('unsupported');const org=await this.api.organization(tokens,this.language);current();if(this.state.status!=='signedIn'||user.id!==this.state.session.user.id||org.id!==this.state.session.organization.id){await this.signOut();throw new AuthFailure('expired');}
      const options=await this.api.diagnosisOptions(tokens,this.language,id,production,value.expected_farm);current();if(!matchesDiagnosis(options,value))throw new DiagnosisContextChanged();current();return this.api.saveDiagnosis(tokens,this.language,id,production,value);
    });}finally{this.diagnosisSaving=false;}
  }
  grazingTransferOptions(id:string,scope:EntryScope,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.grazingTransferOptions(tokens,this.language,id,scope,signal));}
  grazingTransferDestinations(id:string,scope:EntryScope,page:number,search:string,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.grazingTransferDestinations(tokens,this.language,id,scope,page,search,signal));}
  private grazingTransferReview?:{epoch:number;id:string;key:string};
  previewGrazingTransfer(id:string,input:GrazingTransferInput){return this.grazingEntryMutation(async(tokens,current)=>{this.grazingTransferReview=undefined;const value=transferInputSchema.parse(input),options=await this.api.grazingTransferOptions(tokens,this.language,id,value);current();if(options.occupation.version!==value.grazing_version||options.batch_version!==value.batch_version||value.date>options.today||value.date<options.occupation.entry_date)throw new GrazingTransferChanged();const review=await this.api.previewGrazingTransfer(tokens,this.language,id,value);current();this.grazingTransferReview={epoch:this.epoch,id,key:JSON.stringify(review)};return review;});}
  confirmGrazingTransfer(id:string,input:GrazingTransferInput,review:GrazingTransferReview){return this.grazingEntryMutation(async(tokens,current)=>{const value=transferReviewSchema.parse(review);try{validateTransferReview(value,transferInputSchema.parse(input),id);}catch{throw new GrazingTransferChanged();}const held=this.grazingTransferReview;if(!held||held.epoch!==this.epoch||held.id!==id||held.key!==JSON.stringify(value)||transferKey(value.command)!==transferKey(input))throw new GrazingTransferChanged();current();this.grazingTransferReview=undefined;return this.api.confirmGrazingTransfer(tokens,this.language,id,value);});}
  grazingExitOptions(id:string,scope:EntryScope,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.grazingExitOptions(tokens,this.language,id,scope,signal));}
  private grazingExitReview?:{id:string;epoch:number;token:string;key:string};
  previewGrazingExit(id:string,input:ExitInput){return this.grazingEntryMutation(async(tokens,current)=>{this.grazingExitReview=undefined;const value=exitInputSchema.parse(input);const options=await this.api.grazingExitOptions(tokens,this.language,id,value);current();if(options.occupation.version!==value.grazing_version||value.exit_date>options.today||value.exit_date<options.occupation.entry_date)throw new GrazingExitChanged();const review=await this.api.previewGrazingExit(tokens,this.language,id,value);current();this.grazingExitReview={id,epoch:this.epoch,token:review.preview_token,key:exitKey(value)};return review;});}
  confirmGrazingExit(id:string,input:ExitInput,review:ExitReview){return this.grazingEntryMutation(async(tokens,current)=>{const value=exitReviewSchema.parse(review);try{validateExitReview(value,input,id);}catch{throw new GrazingExitChanged();}const held=this.grazingExitReview;if(!held||held.id!==id||held.epoch!==this.epoch||held.token!==value.preview_token||held.key!==exitKey(input))throw new GrazingExitChanged();current();this.grazingExitReview=undefined;return this.api.confirmGrazingExit(tokens,this.language,id,value);});}
  grazingEntryOptions(scope:EntryScope,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.grazingEntryOptions(tokens,this.language,scope,signal));}
  grazingEntryBatches(scope:EntryScope,page:number,search:string,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.grazingEntryBatches(tokens,this.language,scope,page,search,signal));}
  private grazingEntryBusy=false;
  private grazingEntryReview?:{epoch:number;token:string;key:string};
  private async grazingEntryMutation<T>(operation:(tokens:Tokens,current:()=>void)=>Promise<T>){if(this.grazingEntryBusy||this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))throw new AuthFailure('unsupported');this.grazingEntryBusy=true;try{return await this.cattleRead(async tokens=>{const epoch=this.epoch;const current=()=>{if(this.state.status!=='signedIn'||this.epoch!==epoch)throw new AuthFailure('expired');};const user=await this.api.user(tokens,this.language);current();if(!canEnterPasture(user))throw new AuthFailure('unsupported');const org=await this.api.organization(tokens,this.language);current();if(this.state.status!=='signedIn'||user.id!==this.state.session.user.id||org.id!==this.state.session.organization.id){await this.signOut();throw new AuthFailure('expired');}return operation(tokens,current);});}finally{this.grazingEntryBusy=false;}}
  previewGrazingEntry(input:EntryInput){return this.grazingEntryMutation(async(tokens,current)=>{this.grazingEntryReview=undefined;const value=entryInputSchema.parse(input);const options=await this.api.grazingEntryOptions(tokens,this.language,value);current();if(options.pasture.version!==value.pasture_version||value.entry_date>options.today)throw new GrazingEntryChanged();const review=await this.api.previewGrazingEntry(tokens,this.language,value);current();this.grazingEntryReview={epoch:this.epoch,token:review.preview_token,key:entryKey(value)};return review;});}
  confirmGrazingEntry(input:EntryInput,review:EntryReview){return this.grazingEntryMutation(async(tokens,current)=>{const value=entryReviewSchema.parse(review);try{validateEntryReview(value,input);}catch{throw new GrazingEntryChanged();}const held=this.grazingEntryReview;if(!held||held.epoch!==this.epoch||held.token!==value.preview_token||held.key!==entryKey(input))throw new GrazingEntryChanged();current();this.grazingEntryReview=undefined;return this.api.confirmGrazingEntry(tokens,this.language,value);});}
  grazings(query:GrazingQuery,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.grazings(tokens,this.language,query,signal));}
  grazing(id:string,query:GrazingQuery,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.grazing(tokens,this.language,id,query,signal));}
  pastureFormOptions(farm:string,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.pastureFormOptions(tokens,this.language,farm,signal));}
  pastureFormRecord(id:string,farm:string,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.pastureFormRecord(tokens,this.language,id,farm,signal));}
  savePasture(command:PastureCommand){return this.grazingEntryMutation(async(tokens,current)=>{const c=pastureCommandSchema.parse(command);if(c.mode==='edit'){const record=await this.api.pastureFormRecord(tokens,this.language,c.id,c.farm);current();if(record.version!==c.version)throw new PastureContextChanged();}else{await this.api.pastureFormOptions(tokens,this.language,c.farm);current();}return this.api.savePasture(tokens,this.language,c);});}
  private weighingReview?:{epoch:number;key:string};
  reviewWeighing(id:string,farm:string,production:Production,signal?:AbortSignal){return this.grazingEntryMutation(async(tokens,current)=>{this.weighingReview=undefined;const review=await this.api.reviewWeighing(tokens,this.language,id,farm,production,signal);current();this.weighingReview={epoch:this.epoch,key:JSON.stringify(review)};return review;});}
  confirmWeighing(review:WeighingReview){return this.grazingEntryMutation(async(tokens,current)=>{const value=weighingReviewSchema.parse(review),held=this.weighingReview;if(!held||held.epoch!==this.epoch||held.key!==JSON.stringify(value))throw new WeighingReviewChanged();current();this.weighingReview=undefined;return this.api.confirmWeighing(tokens,this.language,value);});}
  weighingEdit(id:string,farm:string,production:Production,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.weighingEdit(tokens,this.language,id,farm,production,signal));}
  updateWeighing(id:string,input:WeighingEditInput){return this.grazingEntryMutation(async(tokens,current)=>{const value=weighingEditInputSchema.parse(input);const options=await this.api.weighingOptions(tokens,this.language,value.farm,value.production);current();if(value.date>options.today)throw new WeighingContextChanged();return this.api.updateWeighing(tokens,this.language,id,value);});}
  cancelWeighing(id:string,input:WeighingCancelInput){return this.grazingEntryMutation(async(tokens,current)=>{const value=weighingCancelInputSchema.parse(input);await this.api.weighingOptions(tokens,this.language,value.farm,value.production);current();return this.api.cancelWeighing(tokens,this.language,id,value);});}
  private collectiveMedicationReview?:{epoch:number;key:string};
  reviewCollectiveMedication(id:string,farm:string,production:Production,signal?:AbortSignal){return this.grazingEntryMutation(async(tokens,current)=>{this.collectiveMedicationReview=undefined;const review=await this.api.reviewCollectiveMedication(tokens,this.language,id,farm,production,signal);current();this.collectiveMedicationReview={epoch:this.epoch,key:JSON.stringify(review)};return review;});}
  confirmCollectiveMedication(review:CollectiveMedicationReview){return this.grazingEntryMutation(async(tokens,current)=>{const value=collectiveMedicationReviewSchema.parse(review),held=this.collectiveMedicationReview;if(!held||held.epoch!==this.epoch||held.key!==JSON.stringify(value))throw new CollectiveMedicationReviewChanged();current();this.collectiveMedicationReview=undefined;return this.api.confirmCollectiveMedication(tokens,this.language,value);});}
  private sanitaryReview?:{epoch:number;key:string};
  reviewSanitary(id:string,farm:string,production:Production,signal?:AbortSignal){return this.grazingEntryMutation(async(tokens,current)=>{this.sanitaryReview=undefined;const review=await this.api.reviewSanitary(tokens,this.language,id,farm,production,signal);current();this.sanitaryReview={epoch:this.epoch,key:JSON.stringify(review)};return review;});}
  confirmSanitary(review:SanitaryReview){return this.grazingEntryMutation(async(tokens,current)=>{const value=sanitaryReviewSchema.parse(review),held=this.sanitaryReview;if(!held||held.epoch!==this.epoch||held.key!==JSON.stringify(value))throw new SanitaryReviewChanged();current();this.sanitaryReview=undefined;return this.api.confirmSanitary(tokens,this.language,value);});}
  private castrationReview?:{epoch:number;key:string};
  reviewCastration(id:string,farm:string,production:Production,signal?:AbortSignal){return this.grazingEntryMutation(async(tokens,current)=>{this.castrationReview=undefined;const review=await this.api.reviewCastration(tokens,this.language,id,farm,production,signal);current();this.castrationReview={epoch:this.epoch,key:JSON.stringify(review)};return review;});}
  confirmCastration(review:CastrationReview){return this.grazingEntryMutation(async(tokens,current)=>{const value=castrationReviewSchema.parse(review),held=this.castrationReview;if(!held||held.epoch!==this.epoch||held.key!==JSON.stringify(value))throw new CastrationReviewChanged();current();this.castrationReview=undefined;return this.api.confirmCastration(tokens,this.language,value);});}
  followUpOptions(id:string,farm:string,production:Production,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.followUpOptions(tokens,this.language,id,farm,production,signal));}
  followUpExecutions(id:string,farm:string,production:Production,search:string,page:number,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.followUpExecutions(tokens,this.language,id,farm,production,search,page,signal));}
  resolveFollowUp(id:string,input:FollowUpInput){return this.grazingEntryMutation(async(tokens,current)=>{const value=followUpInputSchema.parse(input);current();return this.api.resolveFollowUp(tokens,this.language,id,value);});}
  sanitaryOptions(farm:string,production:Production,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.sanitaryOptions(tokens,this.language,farm,production,signal));}
  sanitaryAnimals(farm:string,production:Production,page:number,search:string,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.sanitaryAnimals(tokens,this.language,farm,production,page,search,signal));}
  createCollectiveMedication(input:CollectiveMedicationInput){return this.grazingEntryMutation(async(tokens,current)=>{const value=collectiveMedicationInputSchema.parse(input);const options=await this.api.sanitaryOptions(tokens,this.language,value.farm,value.production);current();if(value.date>options.today||value.entries.length>options.max_participants)throw new WeighingContextChanged();return this.api.createCollectiveMedication(tokens,this.language,value);});}
  createSanitary(input:SanitaryInput){return this.grazingEntryMutation(async(tokens,current)=>{const value=sanitaryInputSchema.parse(input);const options=await this.api.sanitaryOptions(tokens,this.language,value.farm,value.production);current();if(value.date>options.today||value.entries.length>options.max_participants)throw new WeighingContextChanged();return this.api.createSanitary(tokens,this.language,value);});}
  collectiveMedicationEdit(id:string,farm:string,production:Production,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.collectiveMedicationEdit(tokens,this.language,id,farm,production,signal));}
  updateCollectiveMedication(id:string,input:CollectiveMedicationEditInput){return this.grazingEntryMutation(async(tokens,current)=>{const value=collectiveMedicationEditInputSchema.parse(input);const options=await this.api.sanitaryOptions(tokens,this.language,value.farm,value.production);current();if(value.date>options.today)throw new WeighingContextChanged();return this.api.updateCollectiveMedication(tokens,this.language,id,value);});}
  cancelCollectiveMedication(id:string,input:CollectiveMedicationCancelInput){return this.grazingEntryMutation(async(tokens,current)=>{const value=collectiveMedicationCancelInputSchema.parse(input);await this.api.sanitaryOptions(tokens,this.language,value.farm,value.production);current();return this.api.cancelCollectiveMedication(tokens,this.language,id,value);});}
  sanitaryEdit(id:string,farm:string,production:Production,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.sanitaryEdit(tokens,this.language,id,farm,production,signal));}
  updateSanitary(id:string,input:SanitaryEditInput){return this.grazingEntryMutation(async(tokens,current)=>{const value=sanitaryEditInputSchema.parse(input);const options=await this.api.sanitaryOptions(tokens,this.language,value.farm,value.production);current();if(value.date>options.today)throw new WeighingContextChanged();return this.api.updateSanitary(tokens,this.language,id,value);});}
  cancelSanitary(id:string,input:SanitaryCancelInput){return this.grazingEntryMutation(async(tokens,current)=>{const value=sanitaryCancelInputSchema.parse(input);await this.api.sanitaryOptions(tokens,this.language,value.farm,value.production);current();return this.api.cancelSanitary(tokens,this.language,id,value);});}
  castrationEdit(id:string,farm:string,production:Production,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.castrationEdit(tokens,this.language,id,farm,production,signal));}
  updateCastration(id:string,input:CastrationEditInput){return this.grazingEntryMutation(async(tokens,current)=>{const value=castrationEditInputSchema.parse(input);const options=await this.api.castrationOptions(tokens,this.language,value.farm,value.production);current();if(value.date>options.today)throw new WeighingContextChanged();return this.api.updateCastration(tokens,this.language,id,value);});}
  cancelCastration(id:string,input:CastrationCancelInput){return this.grazingEntryMutation(async(tokens,current)=>{const value=castrationCancelInputSchema.parse(input);await this.api.castrationOptions(tokens,this.language,value.farm,value.production);current();return this.api.cancelCastration(tokens,this.language,id,value);});}
  castrationOptions(farm:string,production:Production,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.castrationOptions(tokens,this.language,farm,production,signal));}
  castrationAnimals(farm:string,production:Production,page:number,search:string,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.castrationAnimals(tokens,this.language,farm,production,page,search,signal));}
  createCastration(input:CastrationInput){return this.grazingEntryMutation(async(tokens,current)=>{const value=castrationInputSchema.parse(input);const options=await this.api.castrationOptions(tokens,this.language,value.farm,value.production);current();if(value.date>options.today||value.entries.length>options.max_participants)throw new WeighingContextChanged();return this.api.createCastration(tokens,this.language,value);});}
  weighingOptions(farm:string,production:Production,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.weighingOptions(tokens,this.language,farm,production,signal));}
  weighingAnimals(farm:string,production:Production,page:number,search:string,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.weighingAnimals(tokens,this.language,farm,production,page,search,signal));}
  createWeighing(input:WeighingInput){return this.grazingEntryMutation(async(tokens,current)=>{const value=weighingInputSchema.parse(input);const options=await this.api.weighingOptions(tokens,this.language,value.farm,value.production);current();if(value.date>options.today||value.entries.length>options.max_participants)throw new WeighingContextChanged();return this.api.createWeighing(tokens,this.language,value);});}
  private managementRead<T>(read:(tokens:Tokens)=>Promise<T>){if(this.state.status!=='signedIn'||!canReadManagements(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(read);}
  classificationOptions(farm:string,production:Production,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.classificationOptions(tokens,this.language,farm,production,signal));}
  classificationTargets(farm:string,production:Production,kind:'animals'|'batches',page:number,search:string,signal?:AbortSignal){if(this.state.status!=='signedIn'||!canEnterPasture(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.classificationTargets(tokens,this.language,farm,production,kind,page,search,signal));}
  private classificationReview?:{epoch:number;key:string};
  previewClassification(input:ClassificationInput){return this.grazingEntryMutation(async(tokens,current)=>{this.classificationReview=undefined;const value=classificationInputSchema.parse(input),review=await this.api.previewClassification(tokens,this.language,value);current();this.classificationReview={epoch:this.epoch,key:JSON.stringify(review)};return review;});}
  confirmClassification(input:ClassificationInput,review:ClassificationReview){return this.grazingEntryMutation(async(tokens,current)=>{const value=classificationReviewSchema.parse(review);try{validateClassificationReview(value,classificationInputSchema.parse(input));}catch{throw new ClassificationChanged();}const held=this.classificationReview;if(!held||held.epoch!==this.epoch||held.key!==JSON.stringify(value)||classificationKey(value.command)!==classificationKey(input))throw new ClassificationChanged();current();this.classificationReview=undefined;return this.api.confirmClassification(tokens,this.language,value);});}
  private occurrenceBusy=false;
  private occurrenceResolutionContext?:{epoch:number;id:string;farm:string;production:Production;token:string;task:string};
  private occurrenceRead<T>(read:(tokens:Tokens)=>Promise<T>){if(this.state.status!=='signedIn'||!canWriteOccurrence(this.state.session.user))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(read);}
  private async occurrenceMutation<T>(write:(tokens:Tokens,current:()=>void,user:Session['user'])=>Promise<T>){if(this.occurrenceBusy||this.state.status!=='signedIn'||!canWriteOccurrence(this.state.session.user))throw new AuthFailure('unsupported');this.occurrenceBusy=true;try{return await this.cattleRead(async tokens=>{const epoch=this.epoch,current=()=>{if(this.state.status!=='signedIn'||this.epoch!==epoch)throw new AuthFailure('expired');};const user=await this.api.user(tokens,this.language);current();if(!canWriteOccurrence(user))throw new AuthFailure('unsupported');const org=await this.api.organization(tokens,this.language);current();if(this.state.status!=='signedIn'||user.id!==this.state.session.user.id||org.id!==this.state.session.organization.id){await this.signOut();throw new AuthFailure('expired');}return write(tokens,current,user);});}finally{this.occurrenceBusy=false;}}
  cattleOccurrenceOptions(farm:string,production:Production,signal?:AbortSignal){return this.occurrenceRead(tokens=>this.api.cattleOccurrenceOptions(tokens,this.language,farm,production,signal));}
  cattleOccurrenceMembers(farm:string,production:Production,page:number,search:string,signal?:AbortSignal){return this.occurrenceRead(tokens=>this.api.cattleOccurrenceMembers(tokens,this.language,farm,production,page,search,signal));}
  cattleOccurrenceTargets(farm:string,production:Production,kind:'animals'|'batches',page:number,search:string,signal?:AbortSignal){return this.occurrenceRead(tokens=>this.api.cattleOccurrenceTargets(tokens,this.language,farm,production,kind,page,search,signal));}
  createCattleOccurrence(input:OccurrenceInput){return this.occurrenceMutation(async(tokens,current,user)=>{const value=occurrenceInputSchema.parse(input),options=await this.api.cattleOccurrenceOptions(tokens,this.language,value.farm,value.production);current();if(value.date>options.today)throw new CattleOccurrenceChanged();if(user.access.role==='operator'&&value.assigned_to!==user.id)throw new AuthFailure('unsupported');return this.api.createCattleOccurrence(tokens,this.language,value);});}
  async cattleOccurrenceResolutionOptions(id:string,farm:string,production:Production,signal?:AbortSignal){const epoch=this.epoch,value=await this.occurrenceRead(tokens=>this.api.cattleOccurrenceResolutionOptions(tokens,this.language,id,farm,production,signal));if(this.epoch!==epoch)throw new AuthFailure('expired');this.occurrenceResolutionContext={epoch,id,farm,production,token:value.context_token,task:value.task};return value;}
  resolveCattleOccurrence(id:string,input:OccurrenceResolutionInput){return this.occurrenceMutation(async(tokens,current)=>{const value=occurrenceResolutionInputSchema.parse(input),held=this.occurrenceResolutionContext;if(!held||held.epoch!==this.epoch||held.id!==id||held.farm!==value.farm||held.production!==value.production||held.token!==value.context_token)throw new CattleOccurrenceChanged();current();this.occurrenceResolutionContext=undefined;return this.api.resolveCattleOccurrence(tokens,this.language,id,value,held.task);});}
  cattleOperations(query:CattleOperationQuery,signal?:AbortSignal){if(query.tab==='transfers'&&(this.state.status!=='signedIn'||!canReadManagements(this.state.session.user)))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.cattleOperations(tokens,this.language,query,signal));}
  cattleOperation(id:string,query:CattleOperationQuery,signal?:AbortSignal){if(query.tab==='transfers'&&(this.state.status!=='signedIn'||!canReadManagements(this.state.session.user)))return Promise.reject(new AuthFailure('unsupported'));return this.cattleRead(tokens=>this.api.cattleOperation(tokens,this.language,id,query,signal));}
  managements(query:ManagementQuery,signal?:AbortSignal){return this.managementRead(tokens=>this.api.managements(tokens,this.language,query,signal));}
  management(id:string,query:ManagementQuery,signal?:AbortSignal){return this.managementRead(tokens=>this.api.management(tokens,this.language,id,query,signal));}
  managementParticipants(id:string,query:ManagementQuery,farm:string,page:number,search:string,signal?:AbortSignal){return this.managementRead(tokens=>this.api.managementParticipants(tokens,this.language,id,query,farm,page,search,signal));}
  pastures(query:PastureQuery,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.pastures(tokens,this.language,query,signal));}
  pasture(id:string,farm?:string,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.pasture(tokens,this.language,id,farm,signal));}
  reproductionPage(query:ReproductionQuery,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.reproductionPage(tokens,this.language,query,signal));}
  reproductionAnimal(id:string,query:ReproductionQuery,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.reproductionAnimal(tokens,this.language,id,query,signal));}
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
  cattleOverview(production:Production,farm?:string,signal?:AbortSignal){return this.cattleRead(tokens=>this.api.cattleOverview(tokens,this.language,production,farm,signal));}
  saveCattleBatch(values:BatchInput,production:Production,farm:string,id?:string){return this.cattleWrite(async(tokens,user,today,assertCurrent)=>{
    const payload=batchInputSchema(today).parse(values);
    if(id){const record=await this.api.cattleDetail(tokens,this.language,'batches',id,production,farm);assertCurrent();if(!('quantity' in record)||!canEditBatch(user,record)||(payload.birth_date&&record.entry_date&&payload.birth_date>record.entry_date))throw new AuthFailure('unsupported');}
    return this.api.saveCattleBatch(tokens,this.language,payload,production,farm,id);
  });}
  cattleTransfer(input:TransferInput,production:Production,farm:string,preview?:TransferPreview){return this.cattleWrite(async(tokens,user,today,assertCurrent)=>{
    if(!canTransfer(user))throw new AuthFailure('unsupported');
    const data=transferInput.parse(input);
    if(preview){if(!matchesPreview(data,preview,farm))throw new AuthFailure('unsupported');}
    else{
      if(data.date!==today)throw new AuthFailure('unsupported');
      await this.api.cattleDetail(tokens,this.language,'batches',data.source,production,farm);assertCurrent();
      await this.api.cattleDetail(tokens,this.language,'batches',data.destination,production,farm);assertCurrent();
    }
    return this.api.cattleTransfer(tokens,this.language,data,preview);
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
