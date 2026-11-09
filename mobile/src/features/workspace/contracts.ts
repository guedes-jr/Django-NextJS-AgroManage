import { z } from 'zod';
import type { User } from '../auth/contracts';
export const searchKinds=['animal','batch','crop','inventory','structure'] as const;
export type SearchKind=typeof searchKinds[number];
export function canSearch(user:User,kind:SearchKind) {
  if(user.force_password_change||user.is_platform_staff||user.affiliate_portal_only||user.access.role==='feeder')return false;
  if(user.access.role!=='operator')return true;
  if(kind==='crop')return user.access.can_operate_crops;
  if(kind==='animal'||kind==='batch')return !!user.access.livestock_species?.length;
  return false;
}
export const farmSchema=z.object({id:z.uuid(),name:z.string(),is_active:z.boolean().optional()});
export type Farm=z.infer<typeof farmSchema>;
export const farmsSchema=z.object({results:z.array(farmSchema),next:z.string().nullable()});
export const profileSchema=z.object({full_name:z.string(),email:z.string(),phone:z.string().nullable().optional()});
export const searchQuerySchema=z.object({kind:z.enum(searchKinds),search:z.string().trim().min(2).max(100),page:z.number().int().min(1).max(100000)});
export type SearchQuery=z.infer<typeof searchQuerySchema>;
const animal=z.object({id:z.uuid(),identifier:z.string(),species_code:z.string(),farm_name:z.string(),cattle_purpose:z.string().optional()});
const batch=z.object({id:z.uuid(),batch_code:z.string(),name:z.string().nullish(),species_code:z.string(),farm_name:z.string()});
const crop=z.object({id:z.uuid(),name:z.string(),farm_name:z.string().nullish()});
const inventory=z.object({id:z.uuid(),nome:z.string(),categoria_display:z.string(),unidade_medida_display:z.string().optional(),unidade_display:z.string().optional()}).refine(v=>v.unidade_display!==undefined||v.unidade_medida_display!==undefined);
const structure=z.object({id:z.uuid(),name:z.string(),category_label:z.string(),farm_name:z.string(),farm:z.uuid()});
export type SearchHit={id:string;label:string;subtitle:string;path:string|null;nativeInventory?:string;native?:{id:string;production:'beef'|'dairy';kind:'animals'}};
export function parseSearch(kind:SearchKind,data:unknown):{results:SearchHit[];next:string|null;previous:string|null} {
  const envelope=z.object({results:z.array(z.unknown()),next:z.string().nullable(),previous:z.string().nullable()}).parse(data);
  const results=envelope.results.map(raw=>{
    if(kind==='animal'){const x=animal.parse(raw);const root=x.species_code==='bovinos'?`/home/seguimento/${x.cattle_purpose==='dairy'?'pecuaria-leiteira':'gado-de-corte'}/cadastro`:x.species_code==='suinos'?`/home/seguimento/suinos/animal/${x.id}`:null;return{id:x.id,label:x.identifier,subtitle:x.farm_name,path:root,...(x.species_code==='bovinos'&&['beef','dairy','dual'].includes(x.cattle_purpose??'')?{native:{id:x.id,production:(x.cattle_purpose==='dairy'?'dairy':'beef') as 'beef'|'dairy',kind:'animals' as const}}:{})};}
    if(kind==='batch'){const x=batch.parse(raw);return{id:x.id,label:[x.batch_code,x.name].filter(Boolean).join(' · '),subtitle:x.farm_name,path:x.species_code==='suinos'?'/home/seguimento/suinos/cadastro':null};}
    if(kind==='crop'){const x=crop.parse(raw);return{id:x.id,label:x.name,subtitle:x.farm_name??'',path:`/home/plantacoes/${x.id}`};}
    if(kind==='inventory'){const x=inventory.parse(raw);return{id:x.id,label:x.nome,subtitle:`${x.categoria_display} · ${x.unidade_display??x.unidade_medida_display??''}`,path:`/home/estoque/produtos?${new URLSearchParams({search:x.nome})}`,nativeInventory:x.id};}
    const x=structure.parse(raw);return{id:x.id,label:x.name,subtitle:`${x.category_label} · ${x.farm_name}`,path:`/home/estrutura?${new URLSearchParams({search:x.name,farm:x.farm})}`};
  });
  return {...envelope,results};
}
export function organizationDay(timezone:string,now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
