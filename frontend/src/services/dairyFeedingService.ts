import api from './api';
import type { Page } from './cattleService';
export type DairyFeedAnimal = {id: string; identifier: string; name: string; category: string; batch_code: string};
export type DairyGroupFeed = {item: string; quantity_kg: string; mode: 'total' | 'per_head_day'};
export type DairyFeedGroup = {name: string; animals: string[]; feeds: DairyGroupFeed[]};
export type DairyFeedingCommand = {farm: string; date: string; period_start: string; request_key: string; groups: DairyFeedGroup[]; notes: string};
export type DairyFeedCancellation = {farm: string; request_key: string; source_key: string; group_index: number; reason: string};
export type DairyFeedReceipt = {saved: true; mode: 'feeding'; request_key: string; farm: string; date: string; period_start: string; days: number; notes: string;
  groups: {name: string; head_count: number; animals: {id: string; identifier: string}[]; cancelled?: boolean; feeds: (DairyGroupFeed & {name: string; total_kg: string})[]}[]};
export type DairyCancelReceipt = {saved: true; mode: 'feeding_cancel'; request_key: string; farm: string; cancelled_source: string; reason: string};
export type DairyFeedCatalog = Page<DairyFeedAnimal> & {products: {id: string; name: string}[]};
const path = '/livestock/cattle/dairy-feeding/';
export const dairyFeedingService = {
  animals: async (params: {farm: string; category: string; search: string; page: number; page_size: number}, signal?: AbortSignal) => (await api.get<DairyFeedCatalog>(path, {params, signal})).data,
  history: async (farm: string, page: number, signal?: AbortSignal) => (await api.get<Page<DairyFeedReceipt>>(path, {params: {farm, page, resource: 'history'}, signal})).data,
  supply: async (values: DairyFeedingCommand) => (await api.post<DairyFeedReceipt>(path, values)).data,
  cancel: async (values: DairyFeedCancellation) => (await api.post<DairyCancelReceipt>(`${path}cancel/`, values)).data,
  receipt: async (farm: string, key: string) => (await api.get<DairyFeedReceipt | DairyCancelReceipt>(`/livestock/cattle/dairy-worksheet/${farm}/${key}/`)).data,
};
export function dairyFeedQuantity(feed: DairyGroupFeed, heads: number, start: string, end: string) {
  const days = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) + 1;
  const value = Number(feed.quantity_kg);
  return !Number.isFinite(value) || !Number.isFinite(days) || days < 1 || value < 0 || heads < 0 ? 0 : Math.round(value * (feed.mode === 'per_head_day' ? heads * days : 1) * 100) / 100;
}
