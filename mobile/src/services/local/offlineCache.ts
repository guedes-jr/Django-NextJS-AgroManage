import Constants from 'expo-constants';
import {localDatabase} from './database';
import {MAX_SNAPSHOT_BYTES,SNAPSHOT_MAX_AGE_MS,offlineSessionSchema,snapshotFormat,type LocalCache} from '../../features/offline/contracts';

const format=snapshotFormat(Constants.expoConfig?.version??'0');
const MAX_SNAPSHOTS=300;

/** SQLite-backed offline cache. Tokens are never stored here; they stay in the secure store. */
export function createOfflineCache(namespace:string):LocalCache{
 return {
  namespace,
  async readSession(){
   const row=await (await localDatabase()).getFirstAsync<{payload:string;confirmed_at:number}>('SELECT payload, confirmed_at FROM offline_session WHERE namespace = ?',namespace);
   if(!row)return null;
   try{return offlineSessionSchema.parse({session:JSON.parse(row.payload),confirmedAt:row.confirmed_at});}catch{return null;}
  },
  async saveSession(session,confirmedAt){
   await (await localDatabase()).runAsync('INSERT INTO offline_session(namespace,payload,confirmed_at) VALUES(?,?,?) ON CONFLICT(namespace) DO UPDATE SET payload=excluded.payload,confirmed_at=excluded.confirmed_at',namespace,JSON.stringify(session),confirmedAt);
  },
  async clearSession(){await (await localDatabase()).runAsync('DELETE FROM offline_session WHERE namespace = ?',namespace);},
  async readSnapshot(scope,key){
   const row=await (await localDatabase()).getFirstAsync<{format:string;payload:string;updated_at:number}>('SELECT format, payload, updated_at FROM snapshots WHERE scope = ? AND key = ?',scope,key);
   if(!row||row.format!==format||Date.now()-row.updated_at>SNAPSHOT_MAX_AGE_MS)return null;
   try{return {data:JSON.parse(row.payload),updatedAt:row.updated_at};}catch{return null;}
  },
  async saveSnapshot(scope,key,data){
   const payload=JSON.stringify(data);if(payload.length>MAX_SNAPSHOT_BYTES)return;
   const db=await localDatabase();const now=Date.now();
   await db.runAsync('INSERT INTO snapshots(scope,key,format,payload,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(scope,key) DO UPDATE SET format=excluded.format,payload=excluded.payload,updated_at=excluded.updated_at',scope,key,format,payload,now);
   // Retention: drop old results and keep the most recent ones per account.
   await db.runAsync('DELETE FROM snapshots WHERE updated_at < ?',now-SNAPSHOT_MAX_AGE_MS);
   await db.runAsync('DELETE FROM snapshots WHERE scope = ? AND key NOT IN (SELECT key FROM snapshots WHERE scope = ? ORDER BY updated_at DESC LIMIT ?)',scope,scope,MAX_SNAPSHOTS);
  },
  async clearScope(scope){await (await localDatabase()).runAsync('DELETE FROM snapshots WHERE scope = ?',scope);},
 };
}
