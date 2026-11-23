import { z } from 'zod';

const date = z.iso.date();
const amount = z.string().regex(/^\d+\.\d{2}$/);
const quantity = z.number().int().positive().max(99999999);
export const semenSaleCommand = z.object({
  request_key: z.uuid(), collection: z.uuid(), expected_balance: quantity, quantity,
  price: z.string().regex(/^\d{1,8}(?:[.,]\d{1,2})?$/).transform(value => value.replace(',', '.')).refine(value => Number(value) > 0),
  buyer: z.string().trim().min(1).max(100), date, due_date: date,
}).refine(value => value.quantity <= value.expected_balance && value.due_date >= value.date);
export type SemenSaleCommand = z.infer<typeof semenSaleCommand>;

export const semenSaleReceipt = z.object({
  reference: z.string().startsWith('SALE-SEMEN-'), collection: z.uuid(), lot: z.string(),
  breeder: z.string(), buyer: z.string(), date, due_date: date,
  quantity, amount, remaining: z.number().int().nonnegative(),
});

export const semenSaleBook = z.object({
  today: date,
  lots: z.array(z.object({ collection: z.uuid(), lot: z.string(), breeder: z.string(), farm: z.string(), balance: quantity, date })),
  sales: z.array(semenSaleReceipt.extend({ status: z.string() })),
});

export function semenSaleAmount(count: number, price: string) {
  const [integer, decimal = ''] = price.split('.');
  const cents = BigInt(integer + decimal.padEnd(2, '0')) * BigInt(count);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
