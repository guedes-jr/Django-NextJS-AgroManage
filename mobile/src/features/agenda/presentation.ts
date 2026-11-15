import type { Language } from '../../i18n/messages';
import { agendaMessages } from './messages';

// Calendar dates are business dates, independent of the device's time zone.
const calendarDate = (day: string) => new Date(`${day}T12:00:00Z`);

export function agendaDayLabel(language: Language, day: string, today?: string): string {
  const date = new Intl.DateTimeFormat(language, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(calendarDate(day));
  return day === today ? `${date}. ${agendaMessages[language].today}` : date;
}

export function agendaActivityCount(language: Language, count: number): string {
  const t = agendaMessages[language];
  return `${new Intl.NumberFormat(language).format(count)} ${count === 1 ? t.activity : t.activities}`;
}

export function agendaWeekLabel(language: Language, start: string, end: string): string {
  const acrossYears = start.slice(0, 4) !== end.slice(0, 4);
  const format = new Intl.DateTimeFormat(language, {
    day: 'numeric', month: 'short', ...(acrossYears ? { year: 'numeric' as const } : {}), timeZone: 'UTC',
  });
  return `${format.format(calendarDate(start))} – ${format.format(calendarDate(end))}`;
}
