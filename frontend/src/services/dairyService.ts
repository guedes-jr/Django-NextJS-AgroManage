import apiClient from "./api";

export type DairyOverview = {
  date: string; herd_as_of: string; lactating_cows: number; total_cows: number;
  non_lactating_cows: number; young_females: number; bulls: number;
  produced_liters: string; discarded_liters: string; usable_liters: string;
  milked_cows: number; average_per_milked_cow: string | null;
};
export const dairyService = {
  overview: async (date: string, farm: string, signal?: AbortSignal) =>
    (await apiClient.get<DairyOverview>("/livestock/cattle/dairy-overview/", { params: { date, ...(farm ? { farm } : {}) }, signal })).data,
};
