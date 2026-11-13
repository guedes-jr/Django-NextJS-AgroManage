import { z } from 'zod';
import { agendaQuerySchema, daySchema } from './contracts';

export const agendaSelectionSchema = z.object({
  date: daySchema,
  mode: z.enum(['month', 'week', 'list']),
  domain: agendaQuerySchema.shape.domain,
  recorded: z.boolean(),
  farm: z.uuid().nullable(),
  page: z.number().int().min(1).max(100000),
  offset: z.number().finite().min(0),
});
export type AgendaSelection = z.infer<typeof agendaSelectionSchema>;

// A saved selection is UI state, never authority to select a farm or open a record.
export function restoreAgendaSelection(value: unknown, farm: string | null, today: string): AgendaSelection {
  const saved = agendaSelectionSchema.safeParse(value);
  if (saved.success && saved.data.farm === farm) return saved.data;
  return agendaSelectionSchema.parse({ date: today, mode: 'month', domain: 'all', recorded: false, farm, page: 1, offset: 0 });
}
