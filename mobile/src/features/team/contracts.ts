import {z} from 'zod';
import type {User} from '../auth/contracts';

/** Team directory follows the web users area: only profiles that manage users. */
export function canReadTeam(user:User){return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only&&user.access.can_manage_users;}
export const memberRoles=['admin','manager','operator','veterinarian'] as const;
export const memberSchema=z.object({id:z.uuid(),email:z.string(),full_name:z.string(),role:z.enum(memberRoles),role_display:z.string().optional(),segments:z.array(z.string()).optional(),can_operate_crops:z.boolean().optional(),operator_read_only:z.boolean().optional(),organization_responsible:z.boolean().optional(),phone:z.string().nullable().optional(),is_active:z.boolean(),created_at:z.string().optional()});
export type Member=z.infer<typeof memberSchema>;
export const memberListSchema=z.array(memberSchema);
/** Client-side filter over the full organization list returned by the API. */
export function filterMembers(rows:Member[],{search,role,active}:{search:string;role:''|Member['role'];active:boolean}){
 const q=search.trim().toLocaleLowerCase();
 return rows.filter(row=>row.is_active===active&&(!role||row.role===role)&&(!q||row.full_name.toLocaleLowerCase().includes(q)||row.email.toLocaleLowerCase().includes(q)));
}
