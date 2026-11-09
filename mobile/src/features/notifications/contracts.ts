import {z} from 'zod';
import type {User} from '../auth/contracts';
import {safeAgendaSource} from '../agenda/contracts';
import {canOpenModule} from '../home/contracts';
export const categories=['agenda','system','animal_cycle','overdue_payment','marketing','stock','animal','finance','report'] as const;
export const notificationSchema=z.object({id:z.uuid(),type:z.string(),category:z.string(),priority:z.string(),title:z.string(),message:z.string(),link:z.string().nullable(),is_read:z.boolean(),read_at:z.iso.datetime({offset:true}).nullable(),occurrence_count:z.number().int().positive(),last_occurred_at:z.iso.datetime({offset:true}).nullable(),is_archived:z.boolean(),created_at:z.iso.datetime({offset:true}),group_items:z.array(z.object({message:z.string(),at:z.string()})).default([]),promotion:z.object({body:z.string(),link_url:z.string(),link_label:z.string(),images:z.array(z.object({id:z.string(),image:z.string()}))}).nullable().optional()});
export const notificationPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(notificationSchema)});
export const notificationQuerySchema=z.object({page:z.number().int().min(1).max(100000).default(1),status:z.enum(['all','read','unread']).default('all'),archived:z.boolean().default(false),category:z.union([z.literal(''),z.enum(categories)]).default(''),search:z.string().trim().max(100).default('')});
export type NotificationQuery=z.infer<typeof notificationQuerySchema>;
export type Notification=z.infer<typeof notificationSchema>;
export function canReadNotifications(user:User){return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only;}
export const preferenceKeys=['marketing_alerts','stock_alerts','animal_alerts','financial_alerts','report_alerts','email_notifications','push_notifications','whatsapp_reproductive_alerts'] as const;
export const preferenceValuesSchema=z.object({marketing_alerts:z.boolean(),stock_alerts:z.boolean(),animal_alerts:z.boolean(),financial_alerts:z.boolean(),report_alerts:z.boolean(),email_notifications:z.boolean(),push_notifications:z.boolean(),whatsapp_reproductive_alerts:z.boolean(),frequency:z.enum(['instant','daily','weekly'])});
export const preferencesSchema=preferenceValuesSchema.extend({id:z.uuid(),updated_at:z.iso.datetime({offset:true})});
export type Preferences=z.infer<typeof preferencesSchema>;
export type PreferenceValues=z.infer<typeof preferenceValuesSchema>;
export function preferencesPatch(values:PreferenceValues,record:Preferences){const v=preferenceValuesSchema.parse(values),base=preferencesSchema.parse(record);return {...Object.fromEntries(Object.entries(v).filter(([key,value])=>base[key as keyof PreferenceValues]!==value)),expected_updated_at:base.updated_at};}
export function preferenceFields(user:User){return preferenceKeys.filter(key=>key==='stock_alerts'?canOpenModule(user.access,'inventory'):key==='financial_alerts'?canOpenModule(user.access,'finance'):key==='report_alerts'?['admin','manager'].includes(user.access.role):key==='animal_alerts'||key==='whatsapp_reproductive_alerts'?['admin','manager'].includes(user.access.role)||!!user.access.livestock_species?.length:true);}
// Resolve only recognized tenant paths. External/campaign URLs and unknown parameters never flow into a router.
export function notificationOrigin(link:string|null,user:User){
 if(!link||!canReadNotifications(user)||/[\\\s%#]/.test(link)||!link.startsWith('/home')||link.startsWith('//'))return null;
 if(link==='/home')return {path:link};
 const web=[['/home/settings','settings'],['/home/financeiro','finance']] as const;const webMatch=web.find(([path])=>path===link);if(webMatch&&canOpenModule(user.access,webMatch[1]))return {path:link};
 const fixed=[['/home/agenda','agenda'],['/home/clinico','clinic'],['/home/estoque/resumo','inventory'],['/home/estoque/produtos','inventory'],['/home/estoque/alertas','inventory'],['/home/estoque/movimentacoes','inventory'],['/home/estoque/producao-racao','inventory'],['/home/notifications','notifications']] as const;
 const match=fixed.find(([path])=>path===link);if(match&&canOpenModule(user.access,match[1]))return {path:link};
 const cattle=link.match(/^\/home\/seguimento\/(gado-de-corte|pecuaria-leiteira)(?:\/(racao\/tratos|leite))?$/);
 if(cattle){const production=cattle[1]==='pecuaria-leiteira'?'dairy':'beef';if(cattle[2]==='leite'&&production!=='dairy')return null;if(canOpenModule(user.access,cattle[2]==='racao/tratos'?'feeding':production))return {path:link,production};}
 const swine=link.match(/^\/home\/seguimento\/suinos\/reproducao\?tab=(maternidade|gestacao|matrizes|marras|creche|crescimento|engorda)$/);if(swine&&canOpenModule(user.access,'swine'))return {path:link};
 if(safeAgendaSource(link,user))return {path:link};
 return null;
}
