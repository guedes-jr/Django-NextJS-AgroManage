import { z } from 'zod';
import type { User } from '../auth/contracts';
import { canOpenModule } from '../home/contracts';

export const swinePhases = [
  'marras',
  'matrizes',
  'gestacao',
  'maternidade',
  'creche',
  'crescimento',
  'engorda',
] as const;

export const swinePhaseSchema = z.enum(swinePhases);
export type SwinePhase = z.infer<typeof swinePhaseSchema>;

export const swinePhaseQuerySchema = z.object({
  phase: swinePhaseSchema,
  page: z.number().int().min(1).max(100000),
  page_size: z.number().int().min(1).max(100),
});
export type SwinePhaseQuery = z.infer<typeof swinePhaseQuerySchema>;

const recordId = z.union([z.string().min(1), z.number().int()]);
const nullableText = z.string().nullable();

export const swineMarrasRowSchema = z.object({
  id: recordId,
  identifier: z.string().nullable(),
  idade: z.number().nullable(),
  peso: z.number().nullable(),
  entrada: nullableText,
  status: z.string(),
}).passthrough();

export const swineMatrizesRowSchema = z.object({
  id: recordId,
  identifier: z.string().nullable(),
  op: z.number().int(),
  dias_abertos: z.number().nullable(),
  ultima_cobertura: z.string(),
  status: z.string(),
}).passthrough();

export const swineGestacaoRowSchema = z.object({
  id: recordId,
  animal_id: recordId,
  identifier: z.string().nullable(),
  cobertura: nullableText,
  dias: z.number().int(),
  previsao: nullableText,
  dias_faltantes: z.string(),
  status: z.string(),
}).passthrough();

export const swineMaternidadeRowSchema = z.object({
  id: recordId,
  animal_id: recordId,
  identifier: z.string().nullable(),
  data_parto: nullableText,
  vivos: z.number().int(),
  obitos: z.number().int(),
  mortalidade_pos: z.number().int(),
  mumificados: z.number().int(),
  idade: z.number().nullable(),
  status: z.string(),
  previsao_desmame: nullableText,
  dias_para_desmame: z.number().int(),
  vivos_atual: z.number().int(),
}).passthrough();

export const swineBatchRowSchema = z.object({
  id: recordId,
  lote: z.string(),
  entrada: nullableText.optional(),
  qtd: z.number().int(),
  peso: z.union([z.number(), z.string()]).nullable(),
  idade: z.number().nullable().optional(),
  status: z.string(),
  prev_crescimento: nullableText.optional(),
  dias: z.number().nullable().optional(),
  gpd: z.number().nullable().optional(),
  previsao: nullableText.optional(),
}).passthrough();

const pageFields = z.object({
  count: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive().max(100),
  next: z.boolean(),
  previous: z.boolean(),
}).passthrough();

export type SwineMarrasRow = z.infer<typeof swineMarrasRowSchema>;
export type SwineMatrizesRow = z.infer<typeof swineMatrizesRowSchema>;
export type SwineGestacaoRow = z.infer<typeof swineGestacaoRowSchema>;
export type SwineMaternidadeRow = z.infer<typeof swineMaternidadeRowSchema>;
export type SwineBatchRow = z.infer<typeof swineBatchRowSchema>;
export type SwinePhaseRow =
  | { phase: 'marras'; data: SwineMarrasRow }
  | { phase: 'matrizes'; data: SwineMatrizesRow }
  | { phase: 'gestacao'; data: SwineGestacaoRow }
  | { phase: 'maternidade'; data: SwineMaternidadeRow }
  | { phase: 'creche' | 'crescimento' | 'engorda'; data: SwineBatchRow };

type PageMetadata = z.infer<typeof pageFields>;
export type SwinePhasePage =
  | (PageMetadata & { phase: 'marras'; rows: Extract<SwinePhaseRow, { phase: 'marras' }>[] })
  | (PageMetadata & { phase: 'matrizes'; rows: Extract<SwinePhaseRow, { phase: 'matrizes' }>[] })
  | (PageMetadata & { phase: 'gestacao'; rows: Extract<SwinePhaseRow, { phase: 'gestacao' }>[] })
  | (PageMetadata & { phase: 'maternidade'; rows: Extract<SwinePhaseRow, { phase: 'maternidade' }>[] })
  | (PageMetadata & { phase: 'creche' | 'crescimento' | 'engorda'; rows: Extract<SwinePhaseRow, { phase: 'creche' | 'crescimento' | 'engorda' }>[] });

export function parseSwinePhasePage(phase: SwinePhase, data: unknown): SwinePhasePage {
  switch (phase) {
    case 'marras': {
      const result = pageFields.extend({ rows: z.array(swineMarrasRowSchema).max(100) }).parse(data);
      return { ...result, phase, rows: result.rows.map(data => ({ phase, data })) };
    }
    case 'matrizes': {
      const result = pageFields.extend({ rows: z.array(swineMatrizesRowSchema).max(100) }).parse(data);
      return { ...result, phase, rows: result.rows.map(data => ({ phase, data })) };
    }
    case 'gestacao': {
      const result = pageFields.extend({ rows: z.array(swineGestacaoRowSchema).max(100) }).parse(data);
      return { ...result, phase, rows: result.rows.map(data => ({ phase, data })) };
    }
    case 'maternidade': {
      const result = pageFields.extend({ rows: z.array(swineMaternidadeRowSchema).max(100) }).parse(data);
      return { ...result, phase, rows: result.rows.map(data => ({ phase, data })) };
    }
    case 'creche':
    case 'crescimento':
    case 'engorda': {
      const result = pageFields.extend({ rows: z.array(swineBatchRowSchema).max(100) }).parse(data);
      return { ...result, phase, rows: result.rows.map(data => ({ phase, data })) };
    }
  }
}

export function canReadSwine(user: User) {
  return canOpenModule(user.access, 'swine');
}
