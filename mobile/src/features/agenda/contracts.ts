import { z } from 'zod';
import type { User } from '../auth/contracts';
export const daySchema = z.iso.date();
export const agendaQuerySchema = z.object({
  start: daySchema, end: daySchema, farm:z.uuid().optional(),
  domain: z.enum(['all', 'tasks', 'livestock', 'crops', 'holidays']).default('all'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  include_recorded: z.boolean().default(false),
}).refine(v => v.end >= v.start && (Date.parse(v.end) - Date.parse(v.start)) / 86400000 <= 41);
export type AgendaQuery = z.infer<typeof agendaQuerySchema>;
export function agendaListingQuery(query: AgendaQuery, mode: 'month' | 'week' | 'list', selectedDay: string): AgendaQuery {
  const selected = daySchema.parse(selectedDay);
  return agendaQuerySchema.parse(mode === 'list' ? query : { ...query, start: selected, end: selected });
}
export const eventSchema = z.object({
  id: z.string().min(1), source_id: z.uuid(), date: daySchema, title: z.string(),
  domain: z.string(), species: z.string(), farm: z.uuid().nullish(), farm_name: z.string(), kind: z.string(), status: z.string(),
  source_url: z.string().nullable(), estimated: z.boolean(),
});
export type AgendaEvent = z.infer<typeof eventSchema>;
export const agendaPageSchema = z.object({count:z.number().int().nonnegative(), next:z.string().nullable(), previous:z.string().nullable(), results:z.array(eventSchema)});
export const taskSchema = z.object({
  id:z.uuid(), farm:z.uuid().nullable().default(null), title:z.string(), description:z.string(), due_date:daySchema.nullable(),
  event_kind:z.string(), start_time:z.string().nullable(), end_time:z.string().nullable(),
  location:z.string(), status:z.string(), priority:z.string(), operational_link:z.string().nullable(),
  assigned_to:z.uuid().nullable(),created_by:z.uuid().nullable(),
  assigned_to_name:z.string().nullish(), created_by_name:z.string().nullish(),
});
export function canReadAgenda(user: User) { return !user.force_password_change && !user.is_platform_staff && !user.affiliate_portal_only && user.access.role !== 'feeder'; }
export function calendarDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function shiftDay(day:string, offset:number) {
  const date = new Date(`${daySchema.parse(day)}T12:00:00`);
  date.setDate(date.getDate()+offset);
  return calendarDay(date);
}
// Only known tenant destinations may be opened. Never forward arbitrary URLs or credentials.
export function safeAgendaSource(path:string|null, user:User):string|null {
  if (!path || !canReadAgenda(user) || /[\\\s]/.test(path)) return null;
  if (/^\/home\/plantacoes\/[0-9a-f-]{36}$/.test(path)) return user.access.role !== 'operator' || user.access.can_operate_crops ? path : null;
  const match = path.match(/^\/home\/seguimento\/(gado-de-corte|pecuaria-leiteira|suinos)(?:\/(reproducao|sanidade|manejos|racao|operacoes)(\?tab=(protocols|occurrences))?)?$/);
  if (!match) return null;
  const species = match[1] === 'suinos' ? 'suinos' : 'bovinos';
  return user.access.role !== 'operator' || user.access.livestock_species?.includes(species) ? path : null;
}

export const taskOptionsSchema=z.object({user_id:z.uuid(),role:z.enum(['admin','manager','operator','feeder']),read_only:z.boolean(),timezone:z.string().min(1)});
export type AgendaTask=z.infer<typeof taskSchema>;
export const taskStatuses=['open','in_progress','done','cancelled'] as const;
export const taskPriorities=['low','medium','high','critical'] as const;
const clock=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const taskInputSchema=z.object({
  farm:z.uuid().nullable().optional(),title:z.string().trim().min(1).max(255),description:z.string(),due_date:daySchema,
  event_kind:z.enum(['task','event','appointment']),start_time:clock.nullable(),end_time:clock.nullable(),
  location:z.string().max(255),priority:z.enum(taskPriorities),status:z.enum(taskStatuses),
}).refine(v=>!v.end_time||(!!v.start_time&&v.end_time>v.start_time),{path:['end_time'],message:'timeOrder'});
export type TaskInput=z.infer<typeof taskInputSchema>;
export function taskWriteAccess(user:User,task?:AgendaTask) {
  if(!canReadAgenda(user)||user.access.read_only||task?.operational_link) return 'none';
  if(!task||user.access.role!=='operator')return 'full';
  if(['done','cancelled'].includes(task.status))return 'none';
  return task.created_by===user.id?'full':task.assigned_to===user.id?'status':'none';
}
