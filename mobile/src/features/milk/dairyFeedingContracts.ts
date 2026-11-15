import { z } from 'zod';
import type { User } from '../auth/contracts';
import { canReadCattle } from '../cattle/contracts';

const uuid = z.uuid();
const decimal = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
const animalSchema = z.object({ id: uuid, identifier: z.string(), name: z.string(), category: z.string().nullable(), batch_code: z.string() });
const receiptAnimalSchema = z.object({ id: uuid, identifier: z.string() });
const feedSchema = z.object({
  item: uuid,
  name: z.string(),
  mode: z.enum(['total', 'per_head_day']),
  quantity_kg: decimal,
  total_kg: decimal,
});
const receiptGroupSchema = z.object({
  name: z.string(),
  animals: z.array(receiptAnimalSchema),
  head_count: z.number().int().positive(),
  feeds: z.array(feedSchema).min(1),
  cancelled: z.boolean().optional(),
}).superRefine((group, context) => {
  if (group.head_count !== group.animals.length) {
    context.addIssue({ code: 'custom', path: ['head_count'], message: 'head count' });
  }
  if (new Set(group.animals.map(animal => animal.id)).size !== group.animals.length) {
    context.addIssue({ code: 'custom', path: ['animals'], message: 'duplicate animal' });
  }
  if (new Set(group.feeds.map(feed => feed.item)).size !== group.feeds.length) {
    context.addIssue({ code: 'custom', path: ['feeds'], message: 'duplicate feed' });
  }
});
const historyGroupSchema = receiptGroupSchema.safeExtend({ cancelled: z.boolean() });
const periodSchema = {
  date: z.iso.date(),
  period_start: z.iso.date(),
  days: z.number().int().positive(),
};

const historyRowSchema = z.object({
  saved: z.literal(true),
  mode: z.literal('feeding'),
  request_key: uuid,
  farm: uuid,
  ...periodSchema,
  groups: z.array(historyGroupSchema).min(1).max(10),
  notes: z.string(),
}).superRefine((row, context) => {
  if (dairyFeedingDays(row.period_start, row.date) !== row.days) {
    context.addIssue({ code: 'custom', path: ['days'], message: 'period length' });
  }
  const animalIds = row.groups.flatMap(group => group.animals.map(animal => animal.id));
  if (new Set(animalIds).size !== animalIds.length) {
    context.addIssue({ code: 'custom', path: ['groups'], message: 'duplicate animal across groups' });
  }
});

const historyPageSchema = z.object({
  count: z.number().int().nonnegative(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(historyRowSchema),
});

const catalogPageSchema = z.object({
  count: z.number().int().nonnegative(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(animalSchema),
  products: z.array(z.object({ id: uuid, name: z.string() })),
});
export const dairyFeedingCatalogQuerySchema = z.object({
  farm: uuid,
  page: z.number().int().min(1).max(100_000),
  search: z.string().trim().max(100),
});
export const dairyFeedingHistoryQuerySchema = z.object({
  farm: uuid,
  page: z.number().int().min(1).max(100_000),
});

const groupFeedInputSchema = z.object({
  item: uuid,
  quantity_kg: decimal.refine(value => /^\d+(?:\.\d{1,2})?$/.test(value)
    && decimalCents(value) > 0n && decimalCents(value) <= 9_999_999_999n),
  mode: z.enum(['total', 'per_head_day']),
});
export const dairyFeedingGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  animals: z.array(uuid).min(1).max(1000),
  feeds: z.array(groupFeedInputSchema).min(1).max(10),
}).superRefine((group, context) => {
  if (new Set(group.animals).size !== group.animals.length) {
    context.addIssue({ code: 'custom', path: ['animals'], message: 'duplicate animal' });
  }
  if (new Set(group.feeds.map(feed => feed.item)).size !== group.feeds.length) {
    context.addIssue({ code: 'custom', path: ['feeds'], message: 'duplicate feed' });
  }
});

export const dairyFeedingCommandSchema = z.object({
  farm: uuid,
  date: z.iso.date(),
  period_start: z.iso.date(),
  request_key: uuid,
  groups: z.array(dairyFeedingGroupSchema).min(1).max(10),
  notes: z.string().trim().max(1000),
}).superRefine((command, context) => {
  if (command.period_start > command.date) {
    context.addIssue({ code: 'custom', path: ['period_start'], message: 'period order' });
  }
  const days = dairyFeedingDays(command.period_start, command.date);
  command.groups.forEach((group, groupIndex) => group.feeds.forEach((feed, feedIndex) => {
    if (dairyFeedEstimate(feed.quantity_kg, feed.mode, group.animals.length, days) === null) {
      context.addIssue({ code: 'custom', path: ['groups', groupIndex, 'feeds', feedIndex, 'quantity_kg'], message: 'total quantity limit' });
    }
  }));
  const animals = command.groups.flatMap(group => group.animals);
  if (new Set(animals).size !== animals.length) {
    context.addIssue({ code: 'custom', path: ['groups'], message: 'duplicate animal across groups' });
  }
});

export const dairyFeedingCancellationSchema = z.object({
  farm: uuid,
  request_key: uuid,
  source_key: uuid,
  group_index: z.number().int().min(0).max(9),
  reason: z.string().trim().min(1).max(500),
});

const supplyReceiptSchema = z.object({
  saved: z.literal(true),
  mode: z.literal('feeding'),
  request_key: uuid,
  farm: uuid,
  ...periodSchema,
  groups: z.array(receiptGroupSchema).min(1).max(10),
  notes: z.string(),
}).superRefine((row, context) => {
  if (dairyFeedingDays(row.period_start, row.date) !== row.days) {
    context.addIssue({ code: 'custom', path: ['days'], message: 'period length' });
  }
  const animalIds = row.groups.flatMap(group => group.animals.map(animal => animal.id));
  if (new Set(animalIds).size !== animalIds.length) {
    context.addIssue({ code: 'custom', path: ['groups'], message: 'duplicate animal across groups' });
  }
});

const cancellationReceiptSchema = z.object({
  saved: z.literal(true),
  mode: z.literal('feeding_cancel'),
  request_key: uuid,
  farm: uuid,
  cancelled_source: z.string(),
  reason: z.string(),
});

export type DairyFeedingHistoryPage = z.infer<typeof historyPageSchema>;
export type DairyFeedingCatalogQuery = { farm: string; page: number; search: string };
export type DairyFeedingCatalog = z.infer<typeof catalogPageSchema>;
export type DairyFeedingCommand = z.infer<typeof dairyFeedingCommandSchema>;
export type DairyFeedingGroup = z.infer<typeof dairyFeedingGroupSchema>;
export type DairyFeedingCancellation = z.infer<typeof dairyFeedingCancellationSchema>;
export type DairyFeedingReceipt = z.infer<typeof supplyReceiptSchema>;
export type DairyFeedingCancellationReceipt = z.infer<typeof cancellationReceiptSchema>;
export type DairyFeedingWrite = { kind: 'supply'; command: DairyFeedingCommand } | { kind: 'cancel'; command: DairyFeedingCancellation };
export type DairyFeedingWriteReceipt = DairyFeedingReceipt | DairyFeedingCancellationReceipt;

export function canReadDairyFeeding(user: User) {
  return canReadCattle(user) && ['admin', 'manager'].includes(user.access.role);
}

export function canWriteDairyFeeding(user: User) {
  return canReadDairyFeeding(user) && !user.access.read_only;
}

export function dairyFeedingDays(start: string, end: string) {
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  return Math.floor((last - first) / 86_400_000) + 1;
}

function decimalCents(value: string) {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function decimalFromCents(value: bigint) {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}

export function dairyFeedEstimate(quantity: string, mode: 'total' | 'per_head_day', heads: number, days: number) {
  if (!decimal.safeParse(quantity).success || heads < 0 || !Number.isInteger(heads) || days < 1 || !Number.isInteger(days)) return null;
  const multiplier = mode === 'per_head_day' ? BigInt(heads) * BigInt(days) : 1n;
  const total = decimalCents(quantity) * multiplier;
  return total > 9_999_999_999n ? null : decimalFromCents(total);
}

export function dairyFeedingCatalog(value: unknown): DairyFeedingCatalog {
  const result = catalogPageSchema.parse(value);
  if (new Set(result.results.map(animal => animal.id)).size !== result.results.length
    || new Set(result.products.map(product => product.id)).size !== result.products.length) {
    throw new Error('dairy feeding catalog duplicates');
  }
  return result;
}

export function dairyFeedingHistoryPage(value: unknown, farm: string): DairyFeedingHistoryPage {
  const expectedFarm = uuid.parse(farm);
  const result = historyPageSchema.parse(value);
  if (result.results.some(row => row.farm !== expectedFarm)) {
    throw new Error('dairy feeding farm scope');
  }
  return result;
}

export function validateDairyFeedingReceipt(command: DairyFeedingCommand, value: unknown): DairyFeedingReceipt {
  const expected = dairyFeedingCommandSchema.parse(command);
  const receipt = supplyReceiptSchema.parse(value);
  const days = dairyFeedingDays(expected.period_start, expected.date);
  if (receipt.request_key !== expected.request_key || receipt.farm !== expected.farm
    || receipt.date !== expected.date || receipt.period_start !== expected.period_start
    || receipt.days !== days || receipt.notes !== expected.notes
    || receipt.groups.length !== expected.groups.length) {
    throw new Error('dairy feeding receipt scope');
  }
  for (const [index, group] of expected.groups.entries()) {
    const saved = receipt.groups[index];
    if (!saved || saved.cancelled === true || saved.name !== group.name || saved.head_count !== group.animals.length
      || saved.animals.length !== group.animals.length || saved.feeds.length !== group.feeds.length) {
      throw new Error('dairy feeding receipt group');
    }
    if (saved.animals.some((animal, animalIndex) => animal.id !== group.animals[animalIndex])) {
      throw new Error('dairy feeding receipt animals');
    }
    for (const [feedIndex, feed] of group.feeds.entries()) {
      const savedFeed = saved.feeds[feedIndex];
      if (!savedFeed || savedFeed.item !== feed.item || savedFeed.mode !== feed.mode
        || decimalCents(savedFeed.quantity_kg) !== decimalCents(feed.quantity_kg)
        || decimalCents(savedFeed.total_kg) !== decimalCents(dairyFeedEstimate(feed.quantity_kg, feed.mode, group.animals.length, days) ?? '0')) {
        throw new Error('dairy feeding receipt feed');
      }
    }
  }
  return receipt;
}

export function validateDairyFeedingCancellationReceipt(command: DairyFeedingCancellation, value: unknown): DairyFeedingCancellationReceipt {
  const expected = dairyFeedingCancellationSchema.parse(command);
  const receipt = cancellationReceiptSchema.parse(value);
  if (receipt.request_key !== expected.request_key || receipt.farm !== expected.farm
    || receipt.cancelled_source !== `${expected.source_key}:${expected.group_index}`
    || receipt.reason !== expected.reason) {
    throw new Error('dairy feeding cancellation receipt mismatch');
  }
  return receipt;
}

export function validateDairyFeedingWriteReceipt(write: DairyFeedingWrite, value: unknown): DairyFeedingWriteReceipt {
  return write.kind === 'supply'
    ? validateDairyFeedingReceipt(write.command, value)
    : validateDairyFeedingCancellationReceipt(write.command, value);
}
