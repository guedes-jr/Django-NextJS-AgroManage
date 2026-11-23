import { z } from 'zod';
import type { User } from '../auth/contracts';
import { canReadSwine } from './contracts';

export function canReadSwineSales(user: User) {
  return canReadSwine(user) && user.access.can_view_financial
    && (user.access.role === 'admin' || user.access.role === 'manager');
}

const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);
export const swineSales = z.array(z.object({
  id: z.uuid(),
  date: z.iso.date(),
  batch_code: z.string(),
  quantity: z.number().int().nonnegative(),
  amount: decimal,
  buyer: z.string(),
  weight_kg: decimal.nullish(),
  price_per_kg: decimal.nullish(),
})).max(100);
