export type DatedAlert = { created_at?: string; due_date?: string; date?: string };

// Generated alerts have a scheduled date rather than a persisted creation date.
// Keep undated items stable after dated records; never infer dates from translated text.
export function newestAlerts<T extends DatedAlert>(alerts: T[]): T[] {
  const timestamp = (item: T) => {
    const value = Date.parse(item.created_at || item.due_date || item.date || "");
    return Number.isNaN(value) ? -Infinity : value;
  };
  return [...alerts].sort((a, b) => {
    const left = timestamp(a), right = timestamp(b);
    return left === right ? 0 : right > left ? 1 : -1;
  });
}

export const ALERTS_PAGE = "/home/notifications/alertas";
export const ALERT_PREVIEW_LIMIT = 10;

export function filterAlerts<T extends DatedAlert & { text: string; species: string; type: string }>(
  alerts: T[], filters: { search: string; segment: string; level: string; start: string; end: string },
): T[] {
  const { search, segment, level, start, end } = filters;
  if (start && end && start > end) return [];
  return alerts.filter(alert => (segment === "all" || alert.species === segment)
    && (level === "all" || alert.type === level)
    && alert.text.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))
    && (!start || !!alert.due_date && alert.due_date.slice(0, 10) >= start)
    && (!end || !!alert.due_date && alert.due_date.slice(0, 10) <= end));
}
