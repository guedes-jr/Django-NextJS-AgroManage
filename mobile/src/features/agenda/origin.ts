import { z } from 'zod';
import type { User } from '../auth/contracts';
import { canReadClinic } from '../clinic/contracts';
import { canReadManagements } from '../cattle/managementContracts';
import { safeAgendaSource, type AgendaEvent } from './contracts';

export function nativeAgendaOrigin(event: AgendaEvent, user: User, selectedFarm: string | null) {
  if (event.domain !== 'livestock' || !z.uuid().safeParse(event.farm).success ||
      !z.uuid().safeParse(event.source_id).success || event.id !== `${event.kind}:${event.source_id}` ||
      (selectedFarm && event.farm !== selectedFarm)) return null;
  const source = safeAgendaSource(event.source_url, user);
  if (!source) return null;
  const species = ({ bovino: 'bovinos', suino: 'suinos' } as Record<string, string>)[event.species] ?? event.species;
  const cattle = /^\/home\/seguimento\/(gado-de-corte|pecuaria-leiteira)\/(sanidade|manejos)$/.exec(source);
  const swine = source === '/home/seguimento/suinos';
  if ((cattle && species !== 'bovinos') || (swine && species !== 'suinos') || (!cattle && !swine)) return null;
  if (user.access.role === 'operator' && !user.access.livestock_species?.includes(species)) return null;
  const farm = event.farm!;
  if (['vaccination', 'vaccine_record'].includes(event.kind) && canReadClinic(user) && (!cattle || cattle[2] === 'sanidade')) {
    return { pathname: '/clinic/detail' as const, params: { id: event.source_id, kind: 'vaccinations' as const, farm } };
  }
  if (event.kind === 'sanitary' && cattle?.[2] === 'manejos' && canReadManagements(user)) {
    return { pathname: '/cattle/[production]/management-detail' as const, params: { id: event.source_id, farm, production: cattle[1] === 'pecuaria-leiteira' ? 'dairy' as const : 'beef' as const } };
  }
  return null;
}
