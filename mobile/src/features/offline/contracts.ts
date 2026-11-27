import {z} from 'zod';
import {organizationSchema,userSchema,type Session} from '../auth/contracts';

/**
 * Offline consultation policy (P08.01/P08.02), approved on 27/11/2026: without a connection the app may
 * open the last session confirmed by the server within 24 hours, read-only, showing saved results of the
 * allowlisted reads (herd, agenda, stock balances, batches and today's feeding). A revocation made in that
 * window is only known when the connection is back.
 */
export const OFFLINE_WINDOW_MS=24*60*60*1000;
export const SNAPSHOT_MAX_AGE_MS=72*60*60*1000;
export const MAX_SNAPSHOT_BYTES=1024*1024;
export const MAX_SNAPSHOT_KEY=600;

export const offlineAllowed=(confirmedAt:number,now:number)=>now>=confirmedAt&&now-confirmedAt<=OFFLINE_WINDOW_MS;

export const offlineSessionSchema=z.object({session:z.object({user:userSchema,organization:organizationSchema}),confirmedAt:z.number().int().positive()});
export type OfflineSession={session:Session;confirmedAt:number};

/** Stable key per read and arguments (the abort signal is never part of it); null when too long to keep. */
export function snapshotKey(name:string,args:unknown[]){
 const key=`${name}:${JSON.stringify(args)}`;
 return key.length>MAX_SNAPSHOT_KEY?null:key;
}

/** Format tag: snapshots written by another app version or format are ignored instead of trusted. */
export const snapshotFormat=(appVersion:string)=>`1:${appVersion}`;

export interface LocalCache{
 readonly namespace:string;
 readSession():Promise<OfflineSession|null>;
 saveSession(session:Session,confirmedAt:number):Promise<void>;
 clearSession():Promise<void>;
 readSnapshot(scope:string,key:string):Promise<{data:unknown;updatedAt:number}|null>;
 saveSnapshot(scope:string,key:string,data:unknown):Promise<void>;
 clearScope(scope:string):Promise<void>;
}

/** Process memory: tests and the web preview (nothing is kept on disk there). */
export function createMemoryLocalCache(namespace:string,now:()=>number=Date.now):LocalCache{
 let session:OfflineSession|null=null;const rows=new Map<string,{data:string;updatedAt:number}>();
 return {
  namespace,
  async readSession(){return session;},
  async saveSession(value,confirmedAt){session={session:value,confirmedAt};},
  async clearSession(){session=null;},
  async readSnapshot(scope,key){const row=rows.get(`${scope}\n${key}`);if(!row||now()-row.updatedAt>SNAPSHOT_MAX_AGE_MS)return null;return {data:JSON.parse(row.data),updatedAt:row.updatedAt};},
  async saveSnapshot(scope,key,data){const text=JSON.stringify(data);if(text.length>MAX_SNAPSHOT_BYTES)return;rows.set(`${scope}\n${key}`,{data:text,updatedAt:now()});},
  async clearScope(scope){for(const key of [...rows.keys()])if(key.startsWith(`${scope}\n`))rows.delete(key);},
 };
}
