import {z} from 'zod';
import {vetAlertKinds, vetCategories, vetNextSchema, vetStatuses} from './contracts';

/**
 * Lançar atendimento (VT01, part 2). The server decides and validates every rule; the app
 * mirrors the web form: a pending protocol step (D8/D9 removal) is answered first, an animal
 * in protocol answers whether the IATF insemination was done, otherwise a diagnosis is saved.
 */
export const vetConducts=['iatf_protocol','observe_heat','induction','discard'] as const;
export const vetDiscardReasons=['repeat_open','age','low_production','health','other'] as const;
export const vetMethods=['artificial','natural'] as const;
export const GESTATION_DAYS=283;

export const vetSourceSchema=z.object({kind:z.enum(['protocol','insemination']),insemination_date:z.iso.date(),bull:z.string(),cycling:z.string(),management_days:z.number().int().nullable(),protocol_start:z.iso.date().nullable()});
export const vetLookupSchema=z.union([
  z.object({found:z.literal(false)}),
  z.object({
    found:z.literal(true),id:z.uuid(),identifier:z.string(),name:z.string(),category:z.enum(vetCategories),status:z.enum(vetStatuses),
    next:vetNextSchema,procedures_count:z.number().int().nonnegative(),source:vetSourceSchema.nullable(),
    pending_step:z.object({kind:z.enum(vetAlertKinds),day:z.number().int().nullable(),date:z.iso.date()}).nullable(),
    not_inseminated_date:z.iso.date().nullable(),default_coverage_method:z.union([z.literal(''),z.enum(vetMethods)]),
  }),
]);
export type VetLookup=z.infer<typeof vetLookupSchema>;
export type FoundLookup=Extract<VetLookup,{found:true}>;

export const vetRegisterResultSchema=z.object({
  branch:z.enum(['protocol_step','iatf_insemination','diagnosis','insemination']),animal_created:z.boolean(),
  animal:z.object({id:z.uuid(),identifier:z.string()}),client:z.object({id:z.uuid(),name:z.string()}),
  procedure:z.object({id:z.uuid(),kind:z.string(),date:z.iso.date(),result:z.string(),not_done:z.boolean()}),
  alerts:z.array(z.object({kind:z.enum(vetAlertKinds),day:z.number().int().nullable(),date:z.iso.date()})),
});
export type VetRegisterResult=z.infer<typeof vetRegisterResultSchema>;

export type LaunchBranch='step'|'iatf'|'diagnosis';
export function launchBranch(lookup:VetLookup|null):LaunchBranch{
  if(lookup?.found&&lookup.pending_step)return 'step';
  if(lookup?.found&&lookup.status==='protocol')return 'iatf';
  return 'diagnosis';
}

export interface LaunchForm {
  client:string; newClient:string; date:string; responsible:string; responsibleUser:string; animal:string; notes:string;
  category:''|typeof vetCategories[number]; diagnosis:''|'pregnant'|'open'; conduct:''|typeof vetConducts[number];
  cycling:'cycling'|'not_cycling'; management:10|11; protocolStart:string; returnDays:string; discard:''|typeof vetDiscardReasons[number];
  method:''|typeof vetMethods[number]; gestation:string; edit:boolean; stepDone:''|'yes'|'no'; stepDate:string; stepBull:string;
}
export const blankLaunch=(client:string,date:string,responsible='',responsibleUser=''):LaunchForm=>({
  client,newClient:'',date,responsible,responsibleUser,animal:'',notes:'',category:'',diagnosis:'',conduct:'',cycling:'cycling',management:10,
  protocolStart:'',returnDays:'',discard:'',method:'',gestation:'',edit:false,stepDone:'',stepDate:'',stepBull:'',
});

export function addDays(day:string,days:number){const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
const isoDay=z.iso.date();

/** Errors the form shows before sending (codes, translated by the screen). */
export type LaunchProblem='client'|'date'|'animal'|'stepDone'|'stepDate'|'stepBull'|'category'|'diagnosis'|'conduct'|'method'|'gestation'|'future';

/** Pregnancy values proposed from a previous protocol/insemination, until the user corrects them. */
export function proposedPregnancy(form:LaunchForm,lookup:VetLookup|null){
  if(!lookup?.found||!lookup.source||form.edit||form.diagnosis!=='pregnant')return null;
  const coverage=lookup.source.insemination_date;
  return {coverage,calving:addDays(coverage,GESTATION_DAYS),bull:lookup.source.bull};
}

/** Body of POST veterinary/procedures/, or the first problem found. */
export function launchPayload(form:LaunchForm,lookup:VetLookup|null,today:string):{payload:Record<string,unknown>}|{problem:LaunchProblem}{
  const isNew=!form.client;
  if(isNew&&!form.newClient.trim())return {problem:'client'};
  if(!isoDay.safeParse(form.date).success)return {problem:'date'};
  if(form.date>today)return {problem:'future'};
  if(!form.animal.trim())return {problem:'animal'};
  const base:Record<string,unknown>={
    client:isNew?null:form.client,new_client_name:isNew?form.newClient.trim():'',date:form.date,animal:form.animal.trim(),
    responsible:form.responsible.trim(),responsible_user:form.responsibleUser||null,notes:form.notes.trim(),
  };
  const branch=launchBranch(isNew?null:lookup);
  if(branch!=='diagnosis'){
    if(!form.stepDone)return {problem:'stepDone'};
    if(form.stepDone==='yes'){
      if(!isoDay.safeParse(form.stepDate).success)return {problem:'stepDate'};
      if(form.stepDate>today)return {problem:'future'};
      if(branch==='iatf'&&!form.stepBull.trim())return {problem:'stepBull'};
    }
    return {payload:{...base,step_done:form.stepDone,step_date:form.stepDone==='yes'?form.stepDate:null,step_bull:form.stepBull.trim()}};
  }
  if(!form.category)return {problem:'category'};
  if(!form.diagnosis)return {problem:'diagnosis'};
  const payload:Record<string,unknown>={...base,category:form.category,diagnosis:form.diagnosis};
  if(form.diagnosis==='open'){
    if(!form.conduct)return {problem:'conduct'};
    payload.conduct=form.conduct;
    if(form.conduct==='iatf_protocol'){
      const start=form.protocolStart||form.date;
      if(!isoDay.safeParse(start).success)return {problem:'date'};
      if(start>today)return {problem:'future'};
      Object.assign(payload,{cycling:form.cycling,management_days:form.management,protocol_start:start});
    }
    if(form.conduct==='observe_heat'||form.conduct==='induction'){const days=parseInt(form.returnDays,10);payload.return_days=Number.isNaN(days)?null:Math.max(0,Math.min(365,days));}
    if(form.conduct==='discard')payload.discard_reason=form.discard;
    return {payload};
  }
  if(!form.method)return {problem:'method'};
  payload.coverage_method=form.method;
  const proposal=proposedPregnancy(form,isNew?null:lookup);
  if(proposal){
    // Same as "Confirmar prenhez" on the web: the server takes coverage and bull from the source.
    Object.assign(payload,{confirm_pregnancy:true,coverage_date:proposal.coverage,calving_date:proposal.calving,bull:proposal.bull});
    return {payload};
  }
  const days=parseInt(form.gestation,10);
  if(Number.isNaN(days)||days<0||days>320)return {problem:'gestation'};
  const coverage=addDays(form.date,-days);
  Object.assign(payload,{gestation_days:days,coverage_date:coverage,calving_date:addDays(coverage,GESTATION_DAYS),edit:form.edit,confirm_pregnancy:!!lookup?.found&&!!lookup.source});
  return {payload};
}

/** Alert dates of a new IATF protocol (removal D8/D9 and insemination D10/D11). */
export function protocolSteps(management:10|11,start:string){
  return [{kind:'alert_removal' as const,day:management-2,date:addDays(start,management-2)},{kind:'alert_inseminate' as const,day:management,date:addDays(start,management)}];
}
