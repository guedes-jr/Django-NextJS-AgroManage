import { z } from 'zod';
import type { User } from '../auth/contracts';
import { hasSegment, isScoped, isVeterinaryOnly } from '../auth/contracts';
const amount = z.number().finite();
const segment = z.object({ cost: amount, revenue: amount, profit: amount });
export const dashboardSchema = z.object({
  kpis: z.object({ month_revenue: amount, month_expense: amount, dashboard_expense: amount.optional(), total_inventory_value: amount, inventory_items: amount, low_stock_items: amount, farms_count: amount }),
  segments: z.object({ crops: segment, livestock: segment, livestock_by_species: z.array(segment.extend({ code: z.string(), name: z.string() })).optional() }),
  tasks: z.array(z.object({ title: z.string(), due_date: z.string().nullable(), priority: z.string() })),
  recent_activities: z.array(z.object({ title: z.string(), date: z.string(), type: z.enum(['revenue', 'expense']), amount, category: z.string() })),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
export function dashboardExpenses(data: Dashboard) {
  return data.kpis.dashboard_expense ?? (data.kpis.total_inventory_value + data.segments.crops.cost +
    (data.segments.livestock_by_species?.find(segment => segment.code === 'suinos')?.cost ?? 0));
}
export type ModuleKey = 'agenda' | 'crops' | 'swine' | 'beef' | 'dairy' | 'feeding' | 'clinic' | 'inventory' | 'finance' | 'structure' | 'profile' | 'notifications' | 'support' | 'assistant' | 'settings' | 'reports';
export const modulePaths: Record<ModuleKey, string> = {
  reports: '/home/relatorios', assistant: '/home/assistente-ia', settings: '/home/settings', agenda: '/home/agenda', crops: '/home/plantacoes', swine: '/home/seguimento/suinos', beef: '/home/seguimento/gado-de-corte', dairy: '/home/seguimento/pecuaria-leiteira', feeding: '/home/seguimento/gado-de-corte/racao/tratos', clinic: '/home/seguimento/gado-de-corte/sanidade', inventory: '/home/estoque/resumo', finance: '/home/financeiro', structure: '/home/estrutura', profile: '/home/profile', notifications: '/home/notifications', support: '/home/suporte',
};
export function canOpenModule(access: User['access'], key: ModuleKey): boolean {
  if (['profile', 'notifications', 'support'].includes(key)) return true;
  if (isVeterinaryOnly(access)) return false;
  // Modules follow the contracted segments for every role.
  if (key === 'crops' && !hasSegment(access, 'plantacoes')) return false;
  if (['beef', 'dairy', 'feeding'].includes(key) && !hasSegment(access, 'bovinos')) return false;
  if (key === 'swine' && !hasSegment(access, 'suinos')) return false;
  const bovine = access.livestock_species?.includes('bovinos') ?? false;
  if (key === 'finance') return access.can_view_financial && ['admin', 'manager'].includes(access.role);
  if (key === 'reports') return ['admin', 'manager'].includes(access.role);
  if (!isScoped(access)) return true;
  if (key === 'agenda') return true;
  if (key === 'crops') return access.can_operate_crops;
  if (['beef', 'dairy', 'feeding'].includes(key)) return bovine;
  if (key === 'swine') return access.livestock_species?.includes('suinos') ?? false;
  return key === 'clinic' && !!access.livestock_species?.length;
}
export function canLoadFinancialHome(access: User['access']) {
  return canOpenModule(access, 'finance');
}
