import api from './api';
import type { Page } from './cattleService';

export const dairyFeedSlots = ['concentrate', 'silage', 'mineral'] as const;
export const dairySessions = ['morning', 'afternoon', 'evening'] as const;
export type DairyFeedSlot = typeof dairyFeedSlots[number];
export type DairyFeed = { slot: DairyFeedSlot; item: string; name?: string; quantity_kg: string };
export type DairyWorksheetValues = {
  morning: string; afternoon: string; evening: string; discarded_liters: string;
  discard_reason: string; oxytocin_ml: string; notes: string; feeds: DairyFeed[];
};
export type DairyWorksheetRow = DairyWorksheetValues & {
  id: string; identifier: string; name: string; farm: string; farm_name: string;
  batch: string | null; batch_code: string; recorded: boolean; expected_version: string;
};
export type DairyWorksheetTotal = {
  id?: string | null; expected_version: string; period_start: string; liters: string;
  discarded_liters: string; discard_reason: string; notes: string; oxytocin_ml: string;
  feeds: DairyFeed[]; batch?: string | null; remove?: boolean;
};
export type DairyWorksheet = Page<DairyWorksheetRow> & {
  farm: string; date: string; aggregate_mode: boolean;
  products: { id: string; name: string; stock_kg: string }[];
  batches: { id: string; name: string; batch_code: string }[];
  tanks: { id: string; name: string }[];
  total: DairyWorksheetTotal | null;
};
export type DairyWorksheetCommandRow = DairyWorksheetValues & { animal: string; expected_version: string; remove: boolean };
export type DairyWorksheetCommand = {
  mode?: 'individual' | 'total';
  farm: string; date: string; tank: string | null; request_key: string;
  rows?: DairyWorksheetCommandRow[];
  total?: DairyWorksheetTotal;
};
export type DairyWorksheetReceipt = {
  farm: string; date: string; request_key: string; animals: number; received_liters: string; saved: true;
};
const path = '/livestock/cattle/dairy-worksheet/';
export const dairyWorksheetService = {
  get: async (params: {farm: string; date: string; batch?: string; search?: string; page: number; page_size: number}, signal?: AbortSignal) =>
    (await api.get<DairyWorksheet>(path, {params, signal})).data,
  save: async (command: DairyWorksheetCommand) => (await api.post<DairyWorksheetReceipt>(path, command)).data,
  receipt: async (farm: string, key: string) => (await api.get<DairyWorksheetReceipt>(`${path}${farm}/${key}/`)).data,
};
export function emptyDairyValues(): DairyWorksheetValues {
  return {morning: '0', afternoon: '0', evening: '0', discarded_liters: '0', discard_reason: '', notes: '', oxytocin_ml: '0', feeds: []};
}
export function dairyLiters(value: DairyWorksheetValues): number {
  return dairySessions.reduce((sum, session) => sum + Number(value[session] || 0), 0);
}
export function dairyCommandRow(row: DairyWorksheetRow, remove = false): DairyWorksheetCommandRow {
  const {morning, afternoon, evening, discarded_liters, discard_reason, notes, oxytocin_ml, feeds} = row;
  return {animal: row.id, expected_version: row.expected_version, remove, morning, afternoon, evening,
    discarded_liters, discard_reason, notes, oxytocin_ml, feeds: feeds.map(({slot, item, quantity_kg}) => ({slot, item, quantity_kg}))};
}
export function isDairyReceipt(value: DairyWorksheetReceipt, command: DairyWorksheetCommand): boolean {
  return value?.saved === true && value.farm === command.farm && value.date === command.date && value.request_key === command.request_key
    && value.animals === (command.mode === 'total' ? 0 : command.rows?.length)
    && typeof value.received_liters === 'string' && /^\d+(\.\d{1,2})?$/.test(value.received_liters);
}
