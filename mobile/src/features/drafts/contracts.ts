import {z} from 'zod';

/**
 * Local drafts (P08.03–P08.10). A draft is user input that was never sent: it lives only on this device,
 * per API environment, user and organization, and is never queued for automatic sending.
 */
export const DRAFT_RETENTION_MS=30*24*60*60*1000;
export const DRAFT_WARN_MS=5*24*60*60*1000;
export const MAX_DRAFT_BYTES=64*1024;
export const MAX_DRAFTS_PER_SCOPE=50;

/** Each feature owns a payload version; a draft saved by an older form version is not reapplied blindly. */
export const draftFeatures={'cattle-animal':{version:1},'support-ticket':{version:1},'milk-record':{version:1},'daily-feeding':{version:1},'cattle-weighing':{version:1}} as const;
export type DraftFeature=keyof typeof draftFeatures;

export const draftRouteSchema=z.object({
 pathname:z.string().startsWith('/').max(200),
 params:z.record(z.string(),z.string().max(200)).default({}),
 farm:z.object({id:z.uuid(),name:z.string().max(200)}).nullable().default(null),
});
export type DraftRoute=z.infer<typeof draftRouteSchema>;

/** `unconfirmed`: the last send of this content got no answer; it must be checked before sending again. */
export type DraftState='draft'|'unconfirmed';
export type DraftRecord={id:string;scope:string;feature:DraftFeature;context:string;formVersion:number;state:DraftState;title:string;route:DraftRoute;payload:string;createdAt:number;updatedAt:number};

const safe=(value:string)=>value.replace(/[^A-Za-z0-9._:-]/g,'').slice(0,160);
export function draftScope(namespace:string,userId:string,organizationId:string){return `${safe(namespace)}|${safe(userId)}|${safe(organizationId)}`;}
/** One draft per scope, feature and context, so returning to the same form never duplicates it. */
export function draftId(scope:string,feature:DraftFeature,context:string){return `${scope}|${feature}|${safe(context)}`;}

export const draftExpiresAt=(record:Pick<DraftRecord,'updatedAt'>)=>record.updatedAt+DRAFT_RETENTION_MS;
export const isDraftExpired=(record:Pick<DraftRecord,'updatedAt'>,now:number)=>now>=draftExpiresAt(record);
export const draftDaysLeft=(record:Pick<DraftRecord,'updatedAt'>,now:number)=>Math.max(0,Math.ceil((draftExpiresAt(record)-now)/(24*60*60*1000)));
export const draftExpiringSoon=(record:Pick<DraftRecord,'updatedAt'>,now:number)=>draftExpiresAt(record)-now<=DRAFT_WARN_MS;

/** Serialized payload or null when it is too large to keep (the form still works online). */
export function serializeDraft(value:unknown){
 const text=JSON.stringify(value);
 return new TextEncoder().encode(text).length>MAX_DRAFT_BYTES?null:text;
}

export type DraftRead<T>={ok:true;value:T}|{ok:false;reason:'version'|'invalid'};
export function readDraft<T>(record:Pick<DraftRecord,'feature'|'formVersion'|'payload'>,schema:z.ZodType<T>):DraftRead<T>{
 if(record.formVersion!==draftFeatures[record.feature].version)return {ok:false,reason:'version'};
 try{const parsed=schema.safeParse(JSON.parse(record.payload));return parsed.success?{ok:true,value:parsed.data}:{ok:false,reason:'invalid'};}
 catch{return {ok:false,reason:'invalid'};}
}

/** Rows to drop: expired ones and, beyond the per-scope limit, the oldest ones. */
export function draftsToPurge(records:Pick<DraftRecord,'id'|'updatedAt'>[],now:number){
 const live=records.filter(record=>!isDraftExpired(record,now)).sort((a,b)=>b.updatedAt-a.updatedAt);
 const keep=new Set(live.slice(0,MAX_DRAFTS_PER_SCOPE).map(record=>record.id));
 return records.filter(record=>!keep.has(record.id)).map(record=>record.id);
}

/** Drafts only hold plain form text; anything else is a programming error. */
export const textDraft=<T extends z.ZodRawShape>(shape:T)=>z.object(shape).strict();
