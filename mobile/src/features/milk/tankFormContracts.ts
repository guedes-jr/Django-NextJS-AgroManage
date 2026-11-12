import {z} from 'zod';
import type {User} from '../auth/contracts';
import {canReadCattle} from '../cattle/contracts';
import {tankSchema} from './tankContracts';
export function canManageTank(user:User){return canReadCattle(user)&&!user.access.read_only&&['admin','manager'].includes(user.access.role);}
export const tankFormSchema=z.object({name:z.string().trim().min(1).max(100),capacity_liters:z.string().trim().regex(/^\d{1,9}(?:[.,]\d{1,2})?$/).refine(v=>Number(v.replace(',','.'))>0),is_active:z.boolean(),notes:z.string().max(1000)});
export type TankForm=z.infer<typeof tankFormSchema>;
export const tankFormRecordSchema=tankSchema.extend({version:z.iso.datetime({offset:true}),has_movements:z.boolean()});
export type TankFormRecord=z.infer<typeof tankFormRecordSchema>;
export const tankFormOptionsSchema=z.object({farm:z.object({id:z.uuid(),name:z.string()})});
export const tankCommandSchema=z.discriminatedUnion('mode',[z.object({mode:z.literal('create'),farm:z.uuid(),values:tankFormSchema}),z.object({mode:z.literal('edit'),id:z.uuid(),farm:z.uuid(),version:z.iso.datetime({offset:true}),values:tankFormSchema})]);
export type TankCommand=z.infer<typeof tankCommandSchema>;
export function tankFormPayload(c:TankCommand){const value=tankCommandSchema.parse(c);return {...value.values,farm:value.farm,capacity_liters:value.values.capacity_liters.replace(',','.'),...(value.mode==='edit'?{expected_version:value.version}:{})};}
