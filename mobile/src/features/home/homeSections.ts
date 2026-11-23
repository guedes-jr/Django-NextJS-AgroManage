import type { User } from '../auth/contracts';
import { canReadAgenda } from '../agenda/contracts';
import { canReadCattle } from '../cattle/contracts';
import { quickActions } from '../workspace/quickActions';
import { canLoadFinancialHome, canOpenModule } from './contracts';

export type HomeSection = 'actions' | 'veterinary' | 'finance' | 'dairy' | 'agenda' | 'financeDetail' | 'admin' | 'modules';

// The Home grows with the role: each section appears only when the profile can load its data,
// using the same gates as the screens and endpoints behind it.
//  feeder   → own routine
//  operator → routines, dairy herd panel (when allowed), upcoming activities, modules
//  manager  → financial KPIs, dairy herd panel, upcoming activities, financial detail
//  admin    → everything a manager sees, plus administration shortcuts
export function homeSections(user: User): HomeSection[] {
  const { access } = user;
  const financial = canLoadFinancialHome(access);
  const sections: HomeSection[] = [];
  if (!financial && quickActions(user).some(action => action.destination)) sections.push('actions');
  // Área do veterinário (contracted segment): web bridge until the native area (VT01) ships.
  if (access.veterinary) sections.push('veterinary');
  if (financial) sections.push('finance');
  if (canOpenModule(access, 'dairy') && canReadCattle(user)) sections.push('dairy');
  if (canReadAgenda(user)) sections.push('agenda');
  if (financial) sections.push('financeDetail');
  if (access.role === 'admin' && access.can_manage_users) sections.push('admin');
  if (!financial) sections.push('modules');
  return sections;
}
