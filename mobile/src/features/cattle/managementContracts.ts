import {z} from 'zod';
import type {User} from '../auth/contracts';
import {canReadCattle,productionSchema} from './contracts';
export function canReadManagements(user:User){return canReadCattle(user)&&['admin','manager'].includes(user.access.role);}
export const managementKinds=['weighing','sanitary','castration'] as const;
export const managementStatuses=['draft','confirmed','cancelled'] as const;
export const managementQuerySchema=z.object({production:productionSchema,farm:z.uuid().optional(),kind:z.enum(['all',...managementKinds]),status:z.enum(['all',...managementStatuses]),search:z.string().trim().max(100),page:z.number().int().min(1).max(100000)});
export type ManagementQuery=z.infer<typeof managementQuerySchema>;
export const managementSchema=z.object({id:z.uuid(),farm:z.uuid(),farm_name:z.string(),kind:z.enum(managementKinds),date:z.iso.date(),description:z.string(),responsible:z.string(),status:z.enum(managementStatuses),participant_count:z.number().int().positive(),segment_count:z.number().int().positive()}).refine(row=>row.segment_count<=row.participant_count);
export type Management=z.infer<typeof managementSchema>;
export const managementPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(managementSchema)});
export const managementDetailSchema=managementSchema.safeExtend({timezone:z.string().min(1),treatment_type:z.string(),notes:z.string(),next_procedure_date:z.iso.date().nullable(),milk_withdrawal_until:z.iso.date().nullable(),meat_withdrawal_until:z.iso.date().nullable(),confirmed_at:z.iso.datetime({offset:true}).nullable(),cancellation_reason:z.string(),follow_up_status:z.enum(['pending','done','cancelled']),follow_up_note:z.string(),follow_up_resolved_at:z.iso.datetime({offset:true}).nullable()});
export const managementParticipantSchema=z.object({id:z.uuid(),animal:z.uuid(),identifier:z.string(),farm:z.uuid(),cattle_purpose:z.enum(['unknown','beef','dairy','dual']),status:z.string(),weight_kg:z.string().regex(/^\d+(\.\d+)?$/).nullable()});
export type ManagementParticipant=z.infer<typeof managementParticipantSchema>;
export const managementParticipantPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(managementParticipantSchema)});
export function ensureManagementScope<T extends Management>(row:T,farm?:string,id?:string){if(farm&&row.farm!==farm||id&&row.id!==id)throw Error('management scope');return row;}
