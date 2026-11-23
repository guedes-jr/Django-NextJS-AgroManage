import { z } from 'zod';

const label = z.string().nullish();
const day = z.iso.date();
export const herdQuery = z.object({
  q: z.string().trim().max(100), status: z.enum(['active', 'all']),
  species: z.string().max(40), page: z.number().int().positive(),
});
export type HerdQuery = z.infer<typeof herdQuery>;
const identity = z.object({
  id: z.uuid(), identifier: z.string(), farm_name: z.string(), species_name: z.string(),
  reproductive_status: label,
});
export const herdPage = z.object({
  species: z.array(z.object({ code: z.string(), name: z.string() })),
  count: z.number().int().nonnegative(), page: z.number().int().positive(), page_size: z.number().int().positive(),
  results: z.array(identity.extend({
    category: label, status: z.string(), expected_birth: day.nullish(),
    last_vaccine: z.object({ name: label, date: day }).nullish(),
  })),
});
export const herdHistory = identity.extend({
  events: z.array(z.object({
    kind: z.enum(['mating', 'pregnancy', 'birth', 'heat', 'vaccination', 'health']),
    date: day, title: label, detail: label, status: label,
  })),
});

export const reportQuery = z.object({
  mode: z.enum(['event', 'animal']), client: z.union([z.literal(''), z.uuid()]),
  date: z.union([z.literal(''), day]), q: z.string().trim().max(100),
  procedure: z.string().max(40), result: z.string().max(40), bull: z.string().trim().max(150),
  category: z.string().max(40), responsible: z.string().trim().max(150),
});
export type ReportQuery = z.infer<typeof reportQuery>;
export const initialReport: ReportQuery = {
  mode: 'event', client: '', date: '', q: '', procedure: '', result: '', bull: '', category: '', responsible: '',
};
const reportIdentity = z.object({ animal: z.uuid(), identifier: z.string(), client_name: z.string() });
export const reportResponse = z.object({
  rows: z.array(reportIdentity.extend({
    id: z.uuid(), date: day, report_kind: z.string(), report_result: label, report_bull: label,
  })),
  animals: z.array(reportIdentity.extend({
    count: z.number().int().nonnegative(), result: label,
    last: z.object({ date: day, report_kind: z.string() }).nullable(),
  })),
  stats: z.object({ procedures: z.number().int(), animals: z.number().int(), rate: z.number().nullable() }),
  bulls: z.array(z.object({ name: z.string() })),
  responsibles: z.array(z.string()),
});
