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
type RecordId = z.infer<typeof recordId>;
const nullableText = z.string().nullable();

export const swineMarrasRowSchema = z.object({
  id: recordId,
  identifier: z.string().nullable(),
  idade: z.number().nullable(),
  peso: z.number().nullable(),
  entrada: nullableText,
  status: z.string(),
  previsao_cobertura: nullableText.optional(),
  previsao_estimada: z.boolean().optional(),
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
  previsao_estimada: z.boolean().optional(),
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
  previsao_estimada: z.boolean().optional(),
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
  previsao_estimada: z.boolean().optional(),
}).passthrough();

const swineWeightValue = z.string().trim().regex(/^\d{1,7}(?:[.,]\d{1,3})?$/)
  .transform(value => Number(value.replace(',', '.')).toFixed(3))
  .refine(value => Number(value) > 0 && Number(value) <= 9999999.999);
export const swineBatchWeightCommandSchema = z.object({
  request_key: z.uuid(),
  phase: z.enum(['creche', 'crescimento', 'engorda']),
  weight_kg: swineWeightValue,
  weighing_date: z.iso.date(),
  notes: z.string().trim().max(1000),
}).strict();
export const swineBatchWeightReceiptSchema = z.object({
  id: z.uuid(),
  batch_id: z.uuid(),
  phase: z.enum(['creche', 'crescimento', 'engorda']),
  request_key: z.uuid(),
  weight_kg: z.string().regex(/^\d+(?:\.\d{1,3})?$/),
  weighing_date: z.iso.date(),
}).strict();
export type SwineBatchWeightCommand = z.infer<typeof swineBatchWeightCommandSchema>;
export type SwineBatchWeightReceipt = z.infer<typeof swineBatchWeightReceiptSchema>;

export const swineMatingCommandSchema = z.object({
  request_key: z.uuid(),
  expected_status: z.enum(['vazia', 'pronta', 'aguardando_cobertura']),
  mating_date: z.iso.date(),
  mating_type: z.enum(['natural', 'ai', 'iatf']),
  sire_info: z.string().trim().max(100),
  notes: z.string().trim().max(1000),
}).strict();
export const swineMatingReceiptSchema = z.object({
  id: z.uuid(),
  female_id: z.uuid(),
  request_key: z.uuid(),
  mating_date: z.iso.date(),
  mating_type: z.enum(['natural', 'ai', 'iatf']),
  sire_info: z.string(),
  expected_birth_date: z.iso.date().nullable(),
  status: z.enum(['pending_dg', 'confirmed', 'failed']),
}).strict();
export type SwineMatingCommand = z.infer<typeof swineMatingCommandSchema>;
export type SwineMatingReceipt = z.infer<typeof swineMatingReceiptSchema>;

export const swineDiagnosisOptionsSchema = z.object({
  today: z.iso.date(),
  timezone: z.string().min(1),
  animal: z.object({
    id: z.uuid(),
    identifier: z.string(),
    farm: z.uuid(),
    farm_name: z.string(),
    version: z.iso.datetime({ offset: true }),
  }).strict(),
  mating: z.object({
    id: z.uuid(),
    date: z.iso.date(),
    version: z.iso.datetime({ offset: true }),
    expected_birth_date: z.iso.date().nullable(),
  }).strict(),
  allowed_results: z.array(z.enum(['positive', 'negative'])).min(1),
}).strict();
export type SwineDiagnosisOptions = z.infer<typeof swineDiagnosisOptionsSchema>;

export const swineDiagnosisInputSchema = z.object({
  expected_farm: z.uuid(),
  expected_mating: z.uuid(),
  animal_version: z.iso.datetime({ offset: true }),
  mating_version: z.iso.datetime({ offset: true }),
  diagnosis_date: z.iso.date(),
  result: z.enum(['positive', 'negative']),
}).strict();
export type SwineDiagnosisInput = z.infer<typeof swineDiagnosisInputSchema>;

export const swineDiagnosisReceiptSchema = z.object({
  animal: z.uuid(),
  mating: z.uuid(),
  result: z.enum(['positive', 'negative']),
  status: z.string().min(1),
}).strict();
export type SwineDiagnosisReceipt = z.infer<typeof swineDiagnosisReceiptSchema>;

export function matchesSwineDiagnosis(options: SwineDiagnosisOptions, input: SwineDiagnosisInput) {
  return options.animal.farm === input.expected_farm
    && options.mating.id === input.expected_mating
    && options.animal.version === input.animal_version
    && options.mating.version === input.mating_version
    && options.allowed_results.includes(input.result)
    && options.mating.date <= input.diagnosis_date
    && input.diagnosis_date <= options.today;
}

const pigletCount = z.number().int().min(0).max(40);
export const swineBirthOptionsSchema = z.object({
  today: z.iso.date(),
  timezone: z.string().min(1),
  animal: z.object({
    id: z.uuid(),
    identifier: z.string(),
    category: z.string().nullable(),
    farm: z.uuid(),
    farm_name: z.string(),
    version: z.iso.datetime({ offset: true }),
  }).strict(),
  pregnancy: z.object({
    id: z.uuid(),
    start_date: z.iso.date(),
    expected_birth_date: z.iso.date().nullable(),
    version: z.iso.datetime({ offset: true }),
  }).strict(),
  birth_order: z.number().int().positive(),
  default_weaning_days: z.number().int().min(1).max(90),
  max_piglets: z.number().int().positive(),
}).strict();
export type SwineBirthOptions = z.infer<typeof swineBirthOptionsSchema>;

const swineBirthWeight = z.string().trim().regex(/^\d{1,2}(?:[.,]\d{1,2})?$/)
  .transform(value => Number(value.replace(',', '.')).toFixed(2))
  .refine(value => Number(value) > 0 && Number(value) <= 10);
export const swineBirthInputSchema = z.object({
  request_key: z.uuid(),
  expected_farm: z.uuid(),
  expected_pregnancy: z.uuid(),
  animal_version: z.iso.datetime({ offset: true }),
  pregnancy_version: z.iso.datetime({ offset: true }),
  birth_date: z.iso.date(),
  live_born: pigletCount,
  stillborn: pigletCount,
  mummified: pigletCount,
  avg_weight_kg: swineBirthWeight.nullable(),
  expected_weaning_days: z.number().int().min(1).max(90),
  notes: z.string().trim().max(1000),
}).strict().refine(value => {
  const total = value.live_born + value.stillborn + value.mummified;
  return total >= 1 && total <= 40;
}, { path: ['live_born'] });
export type SwineBirthInput = z.infer<typeof swineBirthInputSchema>;

export const swineBirthReceiptSchema = z.object({
  id: z.uuid(),
  pregnancy: z.uuid(),
  animal: z.uuid(),
  request_key: z.uuid(),
  birth_date: z.iso.date(),
  birth_order: z.number().int().positive(),
  live_born: pigletCount,
  stillborn: pigletCount,
  mummified: pigletCount,
  batch: z.uuid().nullable(),
  expected_weaning_date: z.iso.date(),
  status: z.string().min(1),
}).strict();
export type SwineBirthReceipt = z.infer<typeof swineBirthReceiptSchema>;

export function matchesSwineBirth(options: SwineBirthOptions, input: SwineBirthInput) {
  return options.animal.farm === input.expected_farm
    && options.pregnancy.id === input.expected_pregnancy
    && options.animal.version === input.animal_version
    && options.pregnancy.version === input.pregnancy_version
    && options.pregnancy.start_date <= input.birth_date
    && input.birth_date <= options.today
    && input.live_born + input.stillborn + input.mummified <= options.max_piglets;
}

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

const nullableWeight = z.union([z.number(), z.string()]).nullable().optional();

export const swineReproductiveCycleSchema = z.object({
  cycle_number: z.number().int(),
  mating_date: nullableText,
  mating_type_display: nullableText,
  sire_name: nullableText,
  sire_identifier: nullableText,
  status_display: nullableText,
  pregnancy_status: nullableText,
  expected_birth_date: nullableText,
  birth_date: nullableText,
  total_born: z.number().int().nullable(),
  live_born: z.number().int().nullable(),
  stillborn: z.number().int().nullable(),
  mummified: z.number().int().nullable(),
  weaning_date: nullableText,
  weaned_quantity: z.number().int().nullable(),
  notes: nullableText,
}).passthrough();

export const swineAnimalDetailSchema = z.object({
  id: recordId,
  identifier: nullableText,
  species_code: z.literal('suinos'),
  farm_name: nullableText.optional(),
  birth_date: nullableText,
  entry_date: nullableText,
  status: z.string().nullable().optional(),
  reproductive_status: z.string().nullable().optional(),
  current_weight_kg: nullableWeight,
  batch_code: nullableText.optional(),
  notes: nullableText.optional(),
  reproductive_cycles: z.array(swineReproductiveCycleSchema).optional(),
}).passthrough();

export const swinePregnancyDetailSchema = z.object({
  id: recordId,
  mating: recordId.nullable(),
  female: recordId,
  female_identifier: nullableText,
  start_date: nullableText,
  expected_birth_date: nullableText,
  status: z.string(),
  notes: nullableText.optional(),
}).passthrough();

export const swineBirthDetailSchema = z.object({
  id: recordId,
  female: recordId,
  female_identifier: nullableText,
  birth_date: nullableText,
  birth_time_start: nullableText.optional(),
  birth_time_end: nullableText.optional(),
  birth_order: z.number().int().nullable().optional(),
  live_born: z.number().int(),
  stillborn: z.number().int(),
  mummified: z.number().int(),
  total_born: z.number().int(),
  avg_weight_kg: nullableWeight,
  expected_weaning_days: z.number().int().nullable().optional(),
  notes: nullableText.optional(),
}).passthrough();

export const swineBatchDetailSchema = z.object({
  id: recordId,
  batch_code: z.string(),
  species_code: z.literal('suinos'),
  name: nullableText.optional(),
  category: nullableText.optional(),
  phase: z.string(),
  farm_name: nullableText.optional(),
  origin: nullableText.optional(),
  entry_date: nullableText,
  exit_date: nullableText,
  status: z.string(),
  quantity: z.number().int(),
  avg_weight_kg: nullableWeight,
  notes: nullableText.optional(),
}).passthrough();

const historyValue = z.union([z.number(), z.string()]).nullable().optional();

export const swineBatchHistoryEventSchema = z.object({
  type: z.string().min(1),
  batch_id: z.string().optional(),
  batch_code: z.string().optional(),
  phase: nullableText.optional(),
  date: nullableText.optional(),
  entry_date: nullableText.optional(),
  exit_date: nullableText.optional(),
  end_date: nullableText.optional(),
  title: nullableText.optional(),
  name: nullableText.optional(),
  quantity: historyValue,
  entry_quantity: historyValue,
  avg_weight_kg: historyValue,
  entry_weight_kg: historyValue,
  total_weight_kg: historyValue,
  total_kg: historyValue,
  weight_kg: historyValue,
  avg_per_animal: historyValue,
  cost: historyValue,
  amount: historyValue,
  price_per_kg: historyValue,
  buyer: nullableText.optional(),
  cause: nullableText.optional(),
  is_current: z.boolean().optional(),
  notes: nullableText.optional(),
  subtitle: nullableText.optional(),
  dosage: nullableText.optional(),
  animal_count: historyValue,
  inventory_quantity: historyValue,
  inventory_unit: nullableText.optional(),
  reason: nullableText.optional(),
  responsible: nullableText.optional(),
}).passthrough();

export const swineBatchHistoryPageSchema = z.object({
  count: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive().max(100),
  next: z.boolean(),
  previous: z.boolean(),
  results: z.array(swineBatchHistoryEventSchema).max(100),
}).passthrough();

export type SwineReproductiveCycle = z.infer<typeof swineReproductiveCycleSchema>;
export type SwineAnimalDetail = z.infer<typeof swineAnimalDetailSchema>;
export type SwinePregnancyDetail = z.infer<typeof swinePregnancyDetailSchema>;
export type SwineBirthDetail = z.infer<typeof swineBirthDetailSchema>;
export type SwineBatchDetail = z.infer<typeof swineBatchDetailSchema>;
export type SwineBatchHistoryEvent = z.infer<typeof swineBatchHistoryEventSchema>;
export type SwineBatchHistoryPage = z.infer<typeof swineBatchHistoryPageSchema>;
export type SwineRecordDetail =
  | { phase: 'marras' | 'matrizes'; kind: 'animal'; data: SwineAnimalDetail }
  | { phase: 'gestacao'; kind: 'animal'; data: SwineAnimalDetail }
  | { phase: 'gestacao'; kind: 'pregnancy'; data: SwinePregnancyDetail; animal: SwineAnimalDetail }
  | { phase: 'maternidade'; kind: 'birth'; data: SwineBirthDetail; animal: SwineAnimalDetail }
  | { phase: 'creche' | 'crescimento' | 'engorda'; kind: 'batch'; data: SwineBatchDetail };

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

function assertSwineRecordId(expected: RecordId, actual: RecordId) {
  if (String(expected) !== String(actual)) throw new Error('swine detail identity');
}

export function parseSwineRecordDetail(phase: SwinePhase, id: string, data: unknown, animalData?: unknown): SwineRecordDetail {
  switch (phase) {
    case 'marras':
    case 'matrizes': {
      const animal = swineAnimalDetailSchema.parse(data);
      assertSwineRecordId(id, animal.id);
      return { phase, kind: 'animal', data: animal };
    }
    case 'gestacao': {
      if (id.startsWith('cob_')) {
        const animal = swineAnimalDetailSchema.parse(data);
        assertSwineRecordId(id.slice(4), animal.id);
        return { phase, kind: 'animal', data: animal };
      }
      const pregnancy = swinePregnancyDetailSchema.parse(data);
      assertSwineRecordId(id, pregnancy.id);
      const animal = swineAnimalDetailSchema.parse(animalData);
      assertSwineRecordId(pregnancy.female, animal.id);
      return { phase, kind: 'pregnancy', data: pregnancy, animal };
    }
    case 'maternidade': {
      const birth = swineBirthDetailSchema.parse(data);
      assertSwineRecordId(id, birth.id);
      const animal = swineAnimalDetailSchema.parse(animalData);
      assertSwineRecordId(birth.female, animal.id);
      return { phase, kind: 'birth', data: birth, animal };
    }
    case 'creche':
    case 'crescimento':
    case 'engorda': {
      const batch = swineBatchDetailSchema.parse(data);
      assertSwineRecordId(id, batch.id);
      if (batch.phase !== phase) throw new Error('swine detail phase');
      return { phase, kind: 'batch', data: batch };
    }
  }
}

export function parseSwineBatchHistoryPage(data: unknown, page: number, pageSize: number): SwineBatchHistoryPage {
  const result = swineBatchHistoryPageSchema.parse(data);
  if (
    result.page !== page ||
    result.page_size !== pageSize ||
    result.next !== (page * pageSize < result.count) ||
    result.previous !== (page > 1)
  ) throw new Error('invalid swine batch history pagination');
  return result;
}

export function canReadSwine(user: User) {
  return canOpenModule(user.access, 'swine');
}

export function canWriteSwine(user: User) {
  return canReadSwine(user) && !user.access.read_only;
}
