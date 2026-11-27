import {z} from 'zod';
import type {User} from '../auth/contracts';
import {attachmentSchema} from './attachments';

/** Organization members open and follow their own tickets; platform/affiliate profiles use other channels. */
export function canUseSupport(user:User){return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only;}
export const ticketStatuses=['open','in_progress','waiting_customer','resolved','closed'] as const;
export const ticketCategories=['access','billing','technical','question','other'] as const;
export const ticketPriorities=['low','normal','high','urgent'] as const;
export type TicketStatus=typeof ticketStatuses[number];
export const ticketSchema=z.object({id:z.uuid(),subject:z.string(),category:z.enum(ticketCategories),priority:z.enum(ticketPriorities),status:z.enum(ticketStatuses),version:z.number().int().min(1),requester_name:z.string().nullable().optional(),assignee_name:z.string().nullable().optional(),created_at:z.string(),updated_at:z.string()});
export type SupportTicket=z.infer<typeof ticketSchema>;
export const ticketPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),results:z.array(ticketSchema)});
export const messageSchema=z.object({id:z.uuid(),author_name:z.string(),body:z.string(),from_team:z.boolean(),attachments:z.array(attachmentSchema),can_attach:z.boolean().optional().default(false),created_at:z.string()});
export type TicketMessage=z.infer<typeof messageSchema>;
export const messagePageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),results:z.array(messageSchema)});
export const ticketQuerySchema=z.object({status:z.enum(['',...ticketStatuses]).default(''),search:z.string().trim().max(200).default(''),page:z.number().int().min(1).max(100000).default(1)});
export type TicketQuery=z.input<typeof ticketQuerySchema>;
export const openTicketSchema=z.object({subject:z.string().trim().min(3).max(200),body:z.string().trim().min(3).max(10000),category:z.enum(ticketCategories),priority:z.enum(ticketPriorities),creation_key:z.uuid()});
export type OpenTicketInput=z.infer<typeof openTicketSchema>;
export const replySchema=z.object({body:z.string().trim().min(1).max(10000),request_key:z.uuid(),expected_version:z.number().int().min(1)});
export type ReplyInput=z.infer<typeof replySchema>;
/** Customer transitions accepted by the server: resolve while open, close or reopen after resolution, reopen when closed. */
export function customerTransitions(status:TicketStatus):('resolved'|'closed'|'open')[]{
 if(status==='resolved')return ['closed','open'];
 if(status==='closed')return ['open'];
 return ['resolved'];
}
