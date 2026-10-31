import apiClient from "./api";

export type DailyFeedRow = {
  id: string; farm: string; farm_name: string; batch_code: string; pasture: string | null;
  head_count: number; supplied_kg: string;
  deliveries: { id: string; quantity_kg: string; item_name: string; recorded_by: string; created_at: string; notes: string }[];
};
export type DailyFeeding = { date: string; results: DailyFeedRow[]; formulas: { id: string; nome: string; item_final_id: string | null }[]; products: { id: string; nome: string }[] };
export const cattleDailyFeedingService = {
  get: async (signal?: AbortSignal) => (await apiClient.get<DailyFeeding>("/livestock/cattle/daily-feeding/", { signal })).data,
  supply: async (values: { batch: string; formula?: string | null; item?: string | null; date: string; quantity_kg: string; request_key: string; notes: string }) =>
    (await apiClient.post("/livestock/cattle/daily-feeding/", values)).data,
};
