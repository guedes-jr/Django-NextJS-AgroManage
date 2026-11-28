import {userContactsSchema, type UserContact} from '../auth/contactContracts';
import {z} from 'zod';
import type {User} from '../auth/contracts';

/** Team directory follows the web users area: only profiles that manage users. */
export function canReadTeam(user:User){return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only&&user.access.can_manage_users;}
export const memberRoles=['admin','manager','operator','veterinarian'] as const;
export const memberSchema=z.object({id:z.uuid(),email:z.string(),full_name:z.string(),role:z.enum(memberRoles),role_display:z.string().optional(),segments:z.array(z.string()).optional(),phone_is_whatsapp:z.boolean().optional(),phone_is_telegram:z.boolean().optional(),contacts:userContactsSchema.nullable().optional(),receive_system_alerts:z.boolean().optional(),can_operate_crops:z.boolean().optional(),operator_read_only:z.boolean().optional(),organization_responsible:z.boolean().optional(),phone:z.string().nullable().optional(),is_active:z.boolean(),created_at:z.string().optional()});
export type Member=z.infer<typeof memberSchema>;
export const memberListSchema=z.array(memberSchema);
/** Client-side filter over the full organization list returned by the API. */
export function filterMembers(rows:Member[],{search,role,active}:{search:string;role:''|Member['role'];active:boolean}){
 const q=search.trim().toLocaleLowerCase();
 return rows.filter(row=>row.is_active===active&&(!role||row.role===role)&&(!q||row.full_name.toLocaleLowerCase().includes(q)||row.email.toLocaleLowerCase().includes(q)));
}

/** Only the organization admin manages members (same rule as the web and the API). */
export function canManageMembers(user:User){return canReadTeam(user)&&user.access.role==='admin';}
/** Roles that receive segments individually; admin and manager open every contracted segment. */
export const scopedRoles:readonly Member['role'][]=['operator','veterinarian'];
export const VETERINARY_SEGMENT='area-veterinario';
export const memberOptionsSchema=z.object({
 roles:z.array(z.object({value:z.string(),label:z.string()})),
 segments:z.array(z.object({code:z.string(),name:z.string(),contracted:z.boolean()})),
});
export type MemberOptions=z.infer<typeof memberOptionsSchema>;
export type MemberDraft={full_name:string;email:string;phone:string;phone_is_whatsapp:boolean;phone_is_telegram?:boolean;contacts?:UserContact[]|null;receive_system_alerts:boolean;role:Member['role'];segments:string[];operator_read_only:boolean;password:string;password_confirm:string};
export const emptyMemberDraft:MemberDraft={full_name:'',email:'',phone:'',phone_is_whatsapp:false,receive_system_alerts:false,role:'operator',segments:[],operator_read_only:false,password:'',password_confirm:''};
export function draftFromMember(member:Member):MemberDraft{
 return {...emptyMemberDraft,full_name:member.full_name,email:member.email,phone:member.phone??'',phone_is_whatsapp:member.phone_is_whatsapp??false,phone_is_telegram:member.phone_is_telegram,contacts:member.contacts,receive_system_alerts:member.receive_system_alerts??true,role:member.role,segments:(member.segments??[]).filter(code=>code!==VETERINARY_SEGMENT||member.role!=='veterinarian'),operator_read_only:member.operator_read_only??false};
}
/** Role change keeps the scope only between scoped roles; admin/manager have none. */
export function withRole(draft:MemberDraft,role:Member['role']):MemberDraft{
 return scopedRoles.includes(role)?{...draft,role,segments:role==='veterinarian'?draft.segments.filter(code=>code!==VETERINARY_SEGMENT):draft.segments}:{...draft,role,segments:[],operator_read_only:false};
}
export type MemberErrorKey='name'|'email'|'phone'|'password'|'passwordMismatch'|'contacts';
export function validateMemberDraft(draft:MemberDraft,creating:boolean):Partial<Record<keyof MemberDraft,MemberErrorKey>>{
 const errors:Partial<Record<keyof MemberDraft,MemberErrorKey>>={};
 if(draft.full_name.trim().length<2)errors.full_name='name';
 if(creating&&!/^\S+@\S+\.\S+$/.test(draft.email.trim()))errors.email='email';
 if(draft.contacts==null&&(draft.phone_is_whatsapp||draft.phone_is_telegram)&&!draft.phone.trim())errors.phone='phone';
 if(draft.contacts!=null&&!userContactsSchema.safeParse(draft.contacts).success)errors.contacts='contacts';
 if(creating&&draft.password.length<8)errors.password='password';
 else if(creating&&draft.password!==draft.password_confirm)errors.password_confirm='passwordMismatch';
 return errors;
}
/** Body sent to /auth/members/: segments only for scoped roles; role omitted when locked. */
export function memberPayload(draft:MemberDraft,{creating,roleLocked}:{creating:boolean;roleLocked:boolean}){
 const scope=scopedRoles.includes(draft.role)?{segments:draft.segments,operator_read_only:draft.operator_read_only}:{};
 const common={full_name:draft.full_name.trim(),phone:draft.phone.trim(),phone_is_whatsapp:draft.phone_is_whatsapp,...(draft.phone_is_telegram!==undefined?{phone_is_telegram: draft.contacts==null&&draft.phone_is_telegram}:{}),...(draft.contacts==null?{}:{contacts:draft.contacts}),receive_system_alerts:draft.receive_system_alerts,...scope};
 if(creating)return {...common,role:draft.role,email:draft.email.trim(),password:draft.password,password_confirm:draft.password_confirm};
 return roleLocked?common:{...common,role:draft.role};
}
