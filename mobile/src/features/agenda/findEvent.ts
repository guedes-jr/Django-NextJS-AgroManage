import { isAxiosError } from 'axios';
import type { z } from 'zod';
import { agendaQuerySchema, type AgendaEvent, type AgendaQuery, type agendaPageSchema } from './contracts';

type Load = (query: AgendaQuery, signal?: AbortSignal) => Promise<z.infer<typeof agendaPageSchema>>;

// A former page is a hint: refreshed events may have moved to another page.
export async function findAgendaEvent(query: AgendaQuery, id: string, load: Load, signal?: AbortSignal): Promise<AgendaEvent | null> {
  const scope = agendaQuerySchema.parse(query);
  const read = async (page: number) => {
    signal?.throwIfAborted();
    const result = await load({ ...scope, page }, signal);
    signal?.throwIfAborted();
    return result;
  };
  if (scope.page !== 1) {
    try {
      const previous = await read(scope.page);
      const found = previous.results.find(event => event.id === id);
      if (found) return found;
    } catch (error) {
      if (!isAxiosError(error) || error.response?.status !== 404) throw error;
    }
  }
  for (let page = 1; page <= 100; page++) {
    const result = await read(page);
    const found = result.results.find(event => event.id === id);
    if (found) return found;
    if (!result.next) return null;
  }
  // An incomplete lookup must never be presented as a removed event.
  throw new Error('agenda lookup limit');
}
