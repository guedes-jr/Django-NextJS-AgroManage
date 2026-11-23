import {z} from 'zod';
import type {User} from '../auth/contracts';

/** Área do veterinário (VT01): contracted segment, for admin, manager and veterinarian. */
export function canUseVeterinary(user:User){
  return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only&&!!user.access.veterinary&&['admin','manager','veterinarian'].includes(user.access.role);
}

export const vetStatuses=['protocol','inseminated','pregnant','open','attended','none'] as const;
export const vetDeadlines=['late','today','week','later','nodate'] as const;
export const vetCategories=['vaca_solteira','vaca_parida','novilha'] as const;
export const vetAlertKinds=['calving','removal','inseminate','observe_heat','induction_review','ultrasound'] as const;
export const vetNextCodes=[...vetAlertKinds.map(kind=>`alert_${kind}` as const),'first','inseminate_iatf','ultrasound','calving','discard','observe_heat','induction_review','define_conduct','new'] as const;

export const vetNextSchema=z.object({code:z.enum(vetNextCodes),day:z.number().int().nullable(),date:z.iso.date().nullable()});
/** Only the fields the corral list needs: values and payment of the procedures are left out. */
export const vetLastSchema=z.object({kind:z.string(),date:z.iso.date(),result:z.string()}).nullable();
export const vetAnimalSchema=z.object({
  id:z.uuid(),client:z.uuid(),client_name:z.string(),farm_name:z.string(),identifier:z.string(),name:z.string(),
  category:z.enum(vetCategories),status:z.enum(vetStatuses),next:vetNextSchema,deadline:z.enum(vetDeadlines),
  procedures_count:z.number().int().nonnegative(),last:vetLastSchema,
});
export const vetAnimalListSchema=z.array(vetAnimalSchema);
export const vetHerdPurposes = z.enum(['unknown', 'beef', 'dairy', 'dual']);
export const vetFarms = z.array(z.object({ id: z.uuid(), name: z.string() }));
export const vetClientSchema=z.object({id:z.uuid(),name:z.string(),farm_name:z.string(),phone:z.string().optional(),farm:z.uuid().nullable().optional(),herd_purpose:vetHerdPurposes.optional(),updated_at:z.iso.datetime({offset:true}).optional()});
export const vetClientListSchema=z.array(vetClientSchema);
export const vetWorkspaceSchema=z.object({today:z.iso.date(),open_alerts:z.number().int().nonnegative(),role:z.string(),features:z.record(z.string(),z.boolean()).default({}),
  team:z.array(z.object({id:z.uuid(),name:z.string(),role:z.string()})).default([]),settings:z.object({last_responsible:z.string().default('')}).optional()});
export type VetAnimal=z.infer<typeof vetAnimalSchema>;
export type VetClient=z.infer<typeof vetClientSchema>;
export type VetWorkspace=z.infer<typeof vetWorkspaceSchema>;
export type VetDeadline=typeof vetDeadlines[number];
export type VetStatus=typeof vetStatuses[number];

/** Quick filters of the corral list (prototype vAlPre): deadline presets and situations. */
export const curralPresets=['all','late','today','week','protocol','inseminated','pregnant','open'] as const;
export type CurralPreset=typeof curralPresets[number];
export interface CurralFilter {preset:CurralPreset;client:string;search:string}

function normalize(text:string){return text.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();}
const deadlineOrder:Record<VetDeadline,number>={late:0,today:1,week:2,later:3,nodate:4};

/** Animals for the corral, filtered and ordered by the date of the next procedure (no date last). */
export function curralRows(animals:VetAnimal[],filter:CurralFilter){
  const query=normalize(filter.search);
  return animals.filter(animal=>{
    if(filter.client&&animal.client!==filter.client)return false;
    if(query&&![animal.identifier,animal.name,animal.client_name,animal.farm_name].some(value=>normalize(value).includes(query)))return false;
    switch(filter.preset){
      case 'all':return true;
      case 'late':return animal.deadline==='late';
      case 'today':return animal.deadline==='today';
      case 'week':return animal.deadline==='late'||animal.deadline==='today'||animal.deadline==='week';
      default:return animal.status===filter.preset;
    }
  }).sort((a,b)=>deadlineOrder[a.deadline]-deadlineOrder[b.deadline]||(a.next.date??'9999').localeCompare(b.next.date??'9999')||a.identifier.localeCompare(b.identifier,undefined,{numeric:true}));
}

export function curralSummary(animals:VetAnimal[]){
  return {late:animals.filter(a=>a.deadline==='late').length,today:animals.filter(a=>a.deadline==='today').length,week:animals.filter(a=>a.deadline==='week').length};
}

/** Days between two ISO dates (b - a), for "atrasado há N dias". */
export function daysBetween(a:string,b:string){return Math.round((Date.parse(`${b}T12:00:00Z`)-Date.parse(`${a}T12:00:00Z`))/86400000);}

/** One procedure of an animal's history. Value, payment and pricing are left out on purpose. */
export const vetHistorySchema=z.object({
  id:z.uuid(),date:z.iso.date(),kind:z.string(),result:z.string(),semen:z.string(),notes:z.string(),responsible:z.string(),
  conduct:z.string(),cycling:z.string(),management_days:z.number().int().nullable(),protocol_start:z.iso.date().nullable(),
  return_days:z.number().int(),discard_reason:z.string(),coverage_date:z.iso.date().nullable(),gestation_days:z.number().int(),
  bull:z.string(),calving_date:z.iso.date().nullable(),coverage_method:z.string(),step:z.string(),step_day:z.number().int().nullable(),
  rescheduled_to:z.iso.date().nullable(),not_done:z.boolean(),gestation_now:z.number().int().nullable(),herd_synced:z.boolean().optional(),
});
export const vetHistoryListSchema=z.array(vetHistorySchema);
export type VetHistory=z.infer<typeof vetHistorySchema>;

export interface AnimalFilter {client:string;status:''|VetStatus;category:''|typeof vetCategories[number];search:string}

/** Animais tab: every animal of the area, filtered, in tag order (numbers in numeric order). */
export function animalRows(animals:VetAnimal[],filter:AnimalFilter){
  const query=normalize(filter.search);
  return animals.filter(animal=>(!filter.client||animal.client===filter.client)&&(!filter.status||animal.status===filter.status)
    &&(!filter.category||animal.category===filter.category)
    &&(!query||[animal.identifier,animal.name,animal.client_name,animal.farm_name].some(value=>normalize(value).includes(query))))
    .sort((a,b)=>a.client_name.localeCompare(b.client_name)||a.identifier.localeCompare(b.identifier,undefined,{numeric:true}));
}


export const veterinaryMonthSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);
const billingAmount = z.string().regex(/^-?\d+\.\d{2}$/);
export const vetBillingSchema = z.object({
  month: veterinaryMonthSchema,
  total: billingAmount,
  received: billingAmount,
  receivable: billingAmount,
  clients: z.array(vetClientSchema.extend({
    count: z.number().int().nonnegative(), total: billingAmount, receivable: billingAmount,
  })),
  detail: z.array(z.object({
    id: z.uuid(), date: z.iso.date(), identifier: z.string(), kind: z.string(),
    value: billingAmount, paid: z.boolean(), updated_at: z.iso.datetime({ offset: true }),
  })).nullable(),
});

export const vetClientCommand = z.object({
  id: z.uuid(),
  version: z.iso.datetime({ offset: true }).nullable(),
  name: z.string().trim().min(1).max(150),
  farm_name: z.string().trim().max(150),
  phone: z.string().trim().max(40),
  farm: z.uuid().nullable(),
  herd_purpose: vetHerdPurposes,
});
export type VetClientCommand = z.infer<typeof vetClientCommand>;

export const vetSettlementCommand = z.object({
  client: z.uuid(), month: veterinaryMonthSchema,
  charges: z.array(z.object({ id: z.uuid(), value: billingAmount, version: z.iso.datetime({ offset: true }) })).min(1),
});
export type VetSettlementCommand = z.infer<typeof vetSettlementCommand>;
export const vetSettlementReceipt = z.object({ count: z.number().int().positive(), total: billingAmount });


export function vetSettlementTotal(charges: VetSettlementCommand['charges']) {
  const cents = charges.reduce((total, row) => total + BigInt(row.value.replace('.', '')), 0n);
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
