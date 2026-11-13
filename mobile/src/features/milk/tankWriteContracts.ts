import {z} from 'zod';
import {canCreateCattle} from '../cattle/contracts';
import {canManageTank} from './tankFormContracts';
import {ensureTankMovementScope,tankMovementSchema} from './tankMovementContracts';
import {ensureTankQualityScope,tankQualitySchema} from './tankQualityContracts';
import type {User} from '../auth/contracts';
const scope={tank:z.uuid(),farm:z.uuid()};
const volume=z.string().regex(/^\d{1,9}(?:\.\d{1,2})?$/).refine(v=>/[1-9]/.test(v));
const decimal=(min:number,max:number)=>z.string().regex(/^-?\d{1,3}(?:\.\d{1,2})?$/).refine(v=>Number(v)>=min&&Number(v)<=max).nullable();
const count=z.number().int().min(0).max(2147483647).nullable();
export const tankWriteCommandSchema=z.discriminatedUnion('mode',[
 z.object({...scope,mode:z.literal('movement'),request_key:z.uuid(),kind:z.enum(['production','collection','discard']),date:z.iso.date(),liters:volume,buyer:z.string().trim().max(200),driver:z.string().trim().max(200),vehicle:z.string().trim().max(30),document:z.string().trim().max(100),reason:z.string().trim().max(500),notes:z.string().trim().max(1000)}).refine(v=>v.kind!=='collection'||!!v.buyer,{path:['buyer']}).refine(v=>v.kind!=='discard'||!!v.reason,{path:['reason']}),
 z.object({...scope,mode:z.literal('quality'),request_key:z.uuid(),date:z.iso.date(),sample:z.string().trim().max(100),temperature_c:decimal(-273.15,999.99),fat_percent:decimal(0,100),protein_percent:decimal(0,100),scc:count,tbc:count,antibiotics:z.enum(['not_tested','negative','positive']),notes:z.string().trim().max(1000)}).refine(v=>v.antibiotics!=='not_tested'||[v.temperature_c,v.fat_percent,v.protein_percent,v.scc,v.tbc].some(value=>value!==null)),
 z.object({...scope,mode:z.literal('cancel'),id:z.uuid(),reason:z.string().trim().min(1).max(500)}),
]);
export type TankWriteCommand=z.infer<typeof tankWriteCommandSchema>;
export type TankWriteMode=TankWriteCommand['mode'];
export type TankDraft={date:string;kind:string;liters:string;buyer:string;driver:string;vehicle:string;document:string;reason:string;notes:string;sample:string;temperature_c:string;fat_percent:string;protein_percent:string;scc:string;tbc:string;antibiotics:string};
export function tankCommand(mode:TankWriteMode,tank:string,farm:string,draft:TankDraft,key:string,id?:string):TankWriteCommand{
 const decimal=(v:string)=>v.trim()?v.trim().replace(',','.'):null;
 const integer=(v:string)=>!v.trim()?null:/^\d{1,10}$/.test(v.trim())?Number(v):NaN;
 if(mode==='cancel')return tankWriteCommandSchema.parse({mode,tank,farm,id,reason:draft.reason});
 if(mode==='movement')return tankWriteCommandSchema.parse({mode,tank,farm,request_key:key,kind:draft.kind,date:draft.date,liters:decimal(draft.liters),buyer:draft.kind==='collection'?draft.buyer:'',driver:draft.kind==='collection'?draft.driver:'',vehicle:draft.kind==='collection'?draft.vehicle:'',document:draft.kind==='collection'?draft.document:'',reason:draft.kind==='discard'?draft.reason:'',notes:draft.notes});
 return tankWriteCommandSchema.parse({mode,tank,farm,request_key:key,date:draft.date,sample:draft.sample,temperature_c:decimal(draft.temperature_c),fat_percent:decimal(draft.fat_percent),protein_percent:decimal(draft.protein_percent),scc:integer(draft.scc),tbc:integer(draft.tbc),antibiotics:draft.antibiotics,notes:draft.notes});
}
export function canWriteTankRecord(user:User,mode:TankWriteMode){return mode==='cancel'?canManageTank(user):canCreateCattle(user);}
const cents=(v:string)=>BigInt(v.split('.')[0]??'0')*100n+BigInt((v.split('.')[1]??'').padEnd(2,'0'));
export function validateTankReceipt(command:TankWriteCommand,data:unknown){
 const c=tankWriteCommandSchema.parse(command);
 if(c.mode==='quality'){
  const row=ensureTankQualityScope(tankQualitySchema.parse(data),c);
  if(row.date!==c.date||row.sample!==c.sample||row.notes!==c.notes||row.antibiotics!==c.antibiotics||(['temperature_c','fat_percent','protein_percent'] as const).some(k=>row[k]===null?c[k]!==null:c[k]===null||Number(row[k])!==Number(c[k]))||row.scc!==c.scc||row.tbc!==c.tbc)throw Error('invalid quality receipt');
  return row;
 }
 const row=ensureTankMovementScope(tankMovementSchema.parse(data),c,c.mode==='cancel'?c.id:undefined);
 if(c.mode==='cancel'){if(!row.cancelled_at||row.cancellation_reason!==c.reason)throw Error('unconfirmed cancellation');}
 else if(row.cancelled_at||row.kind!==c.kind||row.date!==c.date||cents(row.liters)!==cents(c.liters)||(['buyer','driver','vehicle','document','reason','notes'] as const).some(k=>row[k]!==c[k]))throw Error('invalid movement receipt');
 return row;
}
