import * as SQLite from 'expo-sqlite';
import {draftFeatures,draftRouteSchema,type DraftFeature,type DraftRecord} from '../../features/drafts/contracts';
import type {DraftStore} from '../../features/drafts/store';

/**
 * Versioned local database (P08.03). Migrations only add structure; a failed migration leaves the
 * previous version (and the user's drafts) in place instead of recreating the database.
 */
const migrations:string[]=[
 `CREATE TABLE IF NOT EXISTS drafts(
   id TEXT PRIMARY KEY NOT NULL, scope TEXT NOT NULL, feature TEXT NOT NULL, context TEXT NOT NULL,
   form_version INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'draft', title TEXT NOT NULL, route TEXT NOT NULL, payload TEXT NOT NULL,
   created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS drafts_scope ON drafts(scope, updated_at DESC);`,
];

let opening:Promise<SQLite.SQLiteDatabase>|null=null;
function database(){
 opening??=(async()=>{
  const db=await SQLite.openDatabaseAsync('fazendamais-local.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row=await db.getFirstAsync<{user_version:number}>('PRAGMA user_version');
  for(let version=row?.user_version??0;version<migrations.length;version+=1){
   const sql=migrations[version]!;
   await db.withExclusiveTransactionAsync(async txn=>{await txn.execAsync(sql);await txn.execAsync(`PRAGMA user_version = ${version+1}`);});
  }
  return db;
 })().catch(error=>{opening=null;throw error;});
 return opening;
}

type Row={id:string;scope:string;feature:string;context:string;form_version:number;state:string;title:string;route:string;payload:string;created_at:number;updated_at:number};
function toRecord(row:Row):DraftRecord|null{
 if(!(row.feature in draftFeatures))return null;
 let route;try{route=draftRouteSchema.parse(JSON.parse(row.route));}catch{return null;}
 return {id:row.id,scope:row.scope,feature:row.feature as DraftFeature,context:row.context,formVersion:row.form_version,state:row.state==='unconfirmed'?'unconfirmed':'draft',title:row.title,route,payload:row.payload,createdAt:row.created_at,updatedAt:row.updated_at};
}

export function createDraftStore():DraftStore{
 return {
  async save(record){
   const db=await database();
   await db.runAsync(`INSERT INTO drafts(id,scope,feature,context,form_version,state,title,route,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET form_version=excluded.form_version,state=excluded.state,title=excluded.title,route=excluded.route,payload=excluded.payload,updated_at=excluded.updated_at`,
    record.id,record.scope,record.feature,record.context,record.formVersion,record.state,record.title,JSON.stringify(record.route),record.payload,record.createdAt,record.updatedAt);
  },
  async get(id){const row=await (await database()).getFirstAsync<Row>('SELECT * FROM drafts WHERE id = ?',id);return row?toRecord(row):null;},
  async list(scope){return (await (await database()).getAllAsync<Row>('SELECT * FROM drafts WHERE scope = ? ORDER BY updated_at DESC',scope)).map(toRecord).filter((row):row is DraftRecord=>!!row);},
  async remove(id){await (await database()).runAsync('DELETE FROM drafts WHERE id = ?',id);},
  async removeScope(scope){return (await (await database()).runAsync('DELETE FROM drafts WHERE scope = ?',scope)).changes;},
 };
}
