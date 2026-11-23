import { z } from 'zod';

export const swineTransitions = {
  loss: { resource: 'pregnancies', options: 'mobile-loss', action: 'registrar-perda' },
  weaning: { resource: 'births', options: 'mobile-weaning', action: 'desmamar' },
  close: { resource: 'batches', options: 'mobile-close', action: 'close-balance' },
  mortality: { resource: 'batches', options: 'mobile-mortality', action: 'registrar-mortalidade' },
  sale: { resource: 'batches', options: 'mobile-sale', action: 'register-sale' },
  transfer: { resource: 'batches', options: 'mobile-transfer', action: 'change-phase' },
} as const;

export type SwineTransitionKind = keyof typeof swineTransitions;
const kind = z.enum(['loss', 'weaning', 'transfer', 'mortality', 'sale', 'close']);
const destination = z.enum(['crescimento', 'engorda']);
export const lossReasons = z.enum(['ABORTO', 'RETORNO_CIO', 'REABSORCAO']);
const quantity = z.number().int().positive();

export const swineTransitionOptions = z.object({
  id: z.uuid(),
  kind,
  animal: z.string(),
  farm: z.uuid(),
  farm_name: z.string(),
  version: z.string().min(1).max(250),
  since: z.iso.date(),
  today: z.iso.date(),
  quantity: quantity.nullable(),
  source: z.enum(['creche', 'crescimento']).optional(),
  destination: destination.optional(),
}).refine(data => {
  if (data.kind === 'loss') return data.quantity === null;
  if (data.kind === 'weaning' || data.kind === 'mortality' || data.kind === 'sale' || data.kind === 'close') return data.quantity !== null;
  return data.quantity !== null && (
    (data.source === 'creche' && data.destination === 'crescimento') ||
    (data.source === 'crescimento' && data.destination === 'engorda')
  );
});

const input = z.object({
  request_key: z.uuid(),
  expected_farm: z.uuid(),
  version: z.string().min(1).max(250),
  date: z.iso.date(),
});

const batchInput = input.extend({
  quantity,
  weight: z.string().trim().regex(/^\d{1,6}(?:[.,]\d{1,2})?$/)
    .transform(value => value.replace(',', '.')).refine(value => Number(value) > 0).nullable(),
});

const saleWeight = z.string().trim().regex(/^\d{1,9}(?:[.,]\d{1,3})?$/)
  .transform(value => value.replace(',', '.')).refine(value => Number(value) > 0);
const salePrice = z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,2})?$/)
  .transform(value => value.replace(',', '.')).refine(value => Number(value) > 0);

export function swineSaleAmount(weight: string, price: string) {
  const scaled = (value: string, places: number) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole + fraction.padEnd(places, '0'));
  };
  const product = scaled(weight, 3) * scaled(price, 2);
  let cents = product / 1000n;
  const remainder = product % 1000n;
  if (remainder > 500n || (remainder === 500n && cents % 2n === 1n)) cents++;
  if (cents < 1n || cents > 999999999999n) return null;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

export const swineTransitionInput = z.discriminatedUnion('kind', [
  input.extend({ kind: z.literal('loss'), reason: lossReasons, notes: z.string().trim().max(1000) }),
  batchInput.extend({ kind: z.literal('weaning'), weaning_type: z.enum(['total', 'parcial']).default('total'), batch_code: z.string().trim().max(50).default('') }),
  batchInput.extend({ kind: z.literal('transfer'), destination }),
  input.extend({
    kind: z.literal('sale'), quantity, weight_kg: saleWeight, price_per_kg: salePrice,
    buyer: z.string().trim().min(1).max(200), due_date: z.iso.date(), notes: z.string().trim().max(1000),
  }),
  input.extend({ kind: z.literal('close'), quantity, reason: z.string().trim().max(300) }),
  input.extend({ kind: z.literal('mortality'), quantity, cause: z.string().trim().min(1).max(150), notes: z.string().trim().max(1000) }),
]);
export type SwineTransitionInput = z.infer<typeof swineTransitionInput>;

export const swineTransitionReceipt = z.object({
  id: z.uuid(),
  kind,
  request_key: z.uuid(),
  date: z.iso.date(),
  batch: z.uuid().nullable(),
  quantity: quantity.nullable(),
  reason: lossReasons.nullable(),
  status: z.enum(['sold', 'finished']).optional(),
  remaining: z.number().int().nonnegative().optional(),
  destination: destination.optional(),
  amount: z.string().regex(/^\d+\.\d{2}$/).optional(),
  reference: z.string().min(1).optional(),
  due_date: z.iso.date().optional(),
});
