import type {DraftRecord} from './contracts';

export interface DraftStore{
 save(record:DraftRecord):Promise<void>;
 get(id:string):Promise<DraftRecord|null>;
 list(scope:string):Promise<DraftRecord[]>;
 remove(id:string):Promise<void>;
 removeScope(scope:string):Promise<number>;
}

/** Process memory only: used by the web preview and by tests. */
export function createMemoryDraftStore():DraftStore{
 const rows=new Map<string,DraftRecord>();
 return {
  async save(record){const previous=rows.get(record.id);rows.set(record.id,{...record,createdAt:previous?.createdAt??record.createdAt});},
  async get(id){return rows.get(id)??null;},
  async list(scope){return [...rows.values()].filter(row=>row.scope===scope).sort((a,b)=>b.updatedAt-a.updatedAt);},
  async remove(id){rows.delete(id);},
  async removeScope(scope){let count=0;for(const [id,row] of rows)if(row.scope===scope){rows.delete(id);count+=1;}return count;},
 };
}

type Listener=()=>void;
const listeners=new Set<Listener>();
/** Screens listing drafts refresh when any draft changes. */
export const subscribeDrafts=(listener:Listener)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};};
export const notifyDrafts=()=>{for(const listener of listeners)listener();};
