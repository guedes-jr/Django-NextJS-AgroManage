import {localDatabase as database} from './database';
import {draftFeatures,draftRouteSchema,type DraftFeature,type DraftRecord} from '../../features/drafts/contracts';
import type {DraftStore} from '../../features/drafts/store';

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
