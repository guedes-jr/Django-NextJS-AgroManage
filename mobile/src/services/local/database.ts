import * as SQLite from 'expo-sqlite';

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
 // Disposable cache: last confirmed session and allowlisted read results for offline consultation.
 `CREATE TABLE IF NOT EXISTS offline_session(namespace TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, confirmed_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS snapshots(scope TEXT NOT NULL, key TEXT NOT NULL, format TEXT NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(scope, key));
  CREATE INDEX IF NOT EXISTS snapshots_age ON snapshots(updated_at);`,
];

let opening:Promise<SQLite.SQLiteDatabase>|null=null;
export function localDatabase(){
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
