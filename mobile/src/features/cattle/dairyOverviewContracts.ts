import { z } from 'zod';
const volume = z.union([z.string().regex(/^\d+(\.\d+)?$/), z.number().finite().nonnegative()]).transform(String);
const count = z.number().int().nonnegative();
export const dairyOverviewSchema = z.object({
  date: z.iso.date(), herd_as_of: z.iso.date(), lactating_cows: count, total_cows: count,
  non_lactating_cows: count, young_females: count, bulls: count,
  monthly_produced_liters: volume, monthly_discarded_liters: volume,
  monthly_average_per_lactating_cow: volume.nullable(), milked_cows: count.nullable(),
});
export function dairyReferenceDate(value: string, today: string) {
  const result = z.iso.date().safeParse(value);
  return result.success && result.data <= today ? result.data : null;
}
