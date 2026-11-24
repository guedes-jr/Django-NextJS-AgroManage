import {z} from 'zod';
import type {User} from '../auth/contracts';
import {canOpenModule} from '../home/contracts';

export function canUseAssistant(user:User){return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only&&canOpenModule(user.access,'assistant');}
export const quotaSchema=z.object({enabled:z.boolean(),used:z.number().int(),limit:z.number().int().nullable(),remaining:z.number().int().nullable(),period_start:z.string(),renews_at:z.string()});
export type AIQuota=z.infer<typeof quotaSchema>;
export const aiMessageSchema=z.object({id:z.uuid(),role:z.enum(['user','assistant','system']),content:z.string(),status:z.string(),created_at:z.string()});
export type AIMessage=z.infer<typeof aiMessageSchema>;
export const conversationSchema=z.object({id:z.uuid(),title:z.string(),subject:z.string(),is_active:z.boolean(),messages_count:z.number().int().optional(),created_at:z.string(),updated_at:z.string()});
export type AIConversation=z.infer<typeof conversationSchema>;
export const conversationDetailSchema=conversationSchema.extend({messages:z.array(aiMessageSchema)});
export const conversationPageSchema=z.union([z.array(conversationSchema).transform(results=>({count:results.length,next:null as string|null,results})),z.object({count:z.number().int(),next:z.string().nullable(),results:z.array(conversationSchema)})]);
export const askSchema=z.object({question:z.string().trim().min(3).max(4000)});
export const askResultSchema=z.object({message:aiMessageSchema,quota:quotaSchema});
